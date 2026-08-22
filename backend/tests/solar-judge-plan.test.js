import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env } from '../src/config/env.js';
import { judgePlan, guardWbs, guardCriticalPath } from '../src/services/solarJudge.service.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const announcement = {
  schema_version: 'ANNOUNCEMENT_CORE_V1',
  ...fx('01_overview.rfp.json'),
  ...fx('02_scope_context.rfp.json'),
  ...fx('03_requirements.rfp.json'),
  ...fx('04_eligibility_submission.notice.json'),
};
const PRIMARY = announcement.requirements.filter((r) => r.scope_role === 'PRIMARY_CONTRACT').length;

// ── Solar mock — 호출 순서대로 답을 꺼낸다. Solar URL 이 아니면 진짜 fetch ───
const nativeFetch = globalThis.fetch;
let calls = [];
function mockSolarSequence(replies) {
  calls = [];
  const queue = [...replies];
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(env.solar.chatUrl)) return nativeFetch(url, init);
    const body = JSON.parse(init.body);
    calls.push(body);
    const reply = queue.shift();
    assert.ok(reply, 'mock 에 준비된 답보다 많이 불렀다');
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });
env.solar.apiKey = 'solar-test-key';

const wpsCpReply = () => ({
  agent: 'WPS_CP_V1',
  document_type: 'SYSTEM_BUILD',
  project_name: 'AX 진단-컨설팅 통합 서비스 개발',
  decompositions: [
    { source_type: 'REQUIREMENT', source_ref: 'SFR-001', service_component: 'BUILD', wps: ['도메인 모드 선택 화면 구현'], cp: ['범용AX·피지컬AX 2종'] },
    { source_type: 'REQUIREMENT', source_ref: 'SFR-002', service_component: 'BUILD', wps: ['진단그룹 자동 분류 로직 구현'], cp: ['A/B/C 그룹'] },
  ],
  cross_cutting_cp: [],
  skipped_non_primary_count: 0,
  validation: { declared_requirement_count: 33, extracted_primary_requirement_count: 33, decomposed_primary_requirement_count: 2, duplicate_requirement_ids: [], missing_requirement_ids: [], undecomposed_primary_refs: [] },
});

/** 🔴 일부러 기간 빈 값·추천 표시 누락·없는 요구사항 ID·틀린 검산을 섞었다 */
const wbsReply = () => ({
  agent: 'WBS_V1',
  project_name: 'AX 진단-컨설팅 통합 서비스 개발',
  project_period: { start: '계약체결일', end: '2026.12.15' },
  work_packages: [
    { wbs_id: '1.1', name: '착수 및 사업수행 계획 수립', deliverable: '사업 수행 계획서', predecessors: [], duration: '', effort_mm: [{ grade: '특급', mm: 0.5 }], is_recommendation: false, requirement_refs: ['SFR-001'], source_page: 13 },
    { wbs_id: '1.2', name: '진단 엔진 분석', deliverable: '분석서', predecessors: ['1.1'], duration: '착수 후 4주', effort_mm: [{ grade: '고급', mm: 1 }, { grade: '특급', mm: 0.5 }], requirement_refs: ['SFR-002', 'NOPE-999'], source_page: 13 },
  ],
  validation: { primary_requirement_count: 1, linked_requirement_count: 9, unlinked_requirement_ids: [], packages_without_requirement: ['9.9'] },
});

/** 🔴 일부러 정렬 뒤바꿈·리드타임 0·알 수 없는 severity·투찰가 환산 가능·틀린 합계를 섞었다 */
const cpReply = () => ({
  agent: 'CRITICAL_PATH_COST_V1',
  project_name: 'AX 진단-컨설팅 통합 서비스 개발',
  deadline: '2026. 08. 24(월) 10:30',
  critical_path: [
    { item: '실적증명서 발급 (발주기관 직인)', lead_time_days: 0, due_label: '3일 전', blocking_reason: '발주기관 직인본', severity: 'urgent', source_page: 4 },
    { item: '조달청 전자입찰 참가자격 등록', lead_time_days: 7, due_label: '7일 전', blocking_reason: '개찰일 전일까지', severity: 'danger', source_page: 1 },
  ],
  cost_estimate: {
    total_mm: 99, by_grade: [{ grade: '특급', mm: 9 }], is_recommendation: false, not_a_bid_price: false,
    amount_convertible: true, amount_note: '', references: [{ label: '추정가격', page: 1 }],
  },
});

// ── 가드 ────────────────────────────────────────────────────────────────
test('guardWbs — 빈 기간은 「미 명시」, 모든 패키지는 추천값, 검산은 공고 요구사항으로 다시 센다', () => {
  const out = guardWbs(wbsReply(), announcement);
  assert.equal(out.work_packages[0].duration, '미 명시');
  assert.equal(out.work_packages[1].duration, '착수 후 4주');
  assert.ok(out.work_packages.every((p) => p.is_recommendation === true));
  assert.equal(out.validation.primary_requirement_count, PRIMARY);
  assert.equal(out.validation.linked_requirement_count, 2, 'SFR-001·SFR-002 둘');
  assert.equal(out.validation.unlinked_requirement_ids.length, PRIMARY - 2);
  assert.ok(out.validation.unlinked_requirement_ids.includes('SFR-003'));
  assert.deepEqual(out.validation.unknown_requirement_refs, ['NOPE-999'], '공고에 없는 ID는 지어낸 것이다');
  assert.deepEqual(out.validation.packages_without_requirement, [], '실제 requirement_refs 로 다시 센다');
});

test('guardCriticalPath — 마감 가까운 순 정렬·리드타임 0 은 [확인필요]·severity 어휘 고정·원가는 WBS 합산', () => {
  const wbs = guardWbs(wbsReply(), announcement);
  const out = guardCriticalPath(cpReply(), wbs);
  assert.equal(out.critical_path[0].item, '조달청 전자입찰 참가자격 등록');
  assert.equal(out.critical_path[0].severity, 'danger');
  assert.equal(out.critical_path[1].due_label, '[확인필요]');
  assert.equal(out.critical_path[1].severity, 'default', '모르는 낱말은 default');
  assert.deepEqual(out.cost_estimate.by_grade, [{ grade: '특급', mm: 1 }, { grade: '고급', mm: 1 }]);
  assert.equal(out.cost_estimate.total_mm, 2);
  assert.equal(out.cost_estimate.is_recommendation, true);
  assert.equal(out.cost_estimate.not_a_bid_price, true);
  assert.equal(out.cost_estimate.amount_convertible, false, '단가 없이는 금액으로 바꾸지 않는다');
  assert.ok(out.cost_estimate.amount_note.length > 0);
});

test('guardCriticalPath — lead_time_days 가 있으면 due_label 을 N일 전 으로 맞춘다', () => {
  const reply = cpReply();
  reply.critical_path[1].due_label = '언젠가';
  reply.critical_path[1].lead_time_days = 3;
  reply.critical_path[1].severity = 'warn';
  const out = guardCriticalPath(reply, guardWbs(wbsReply(), announcement));
  const item = out.critical_path.find((c) => c.lead_time_days === 3);
  assert.equal(item.due_label, '3일 전');
  assert.equal(item.severity, 'warn');
});

// ── 체인 ────────────────────────────────────────────────────────────────
test('judgePlan — WPS/CP → WBS → 임계경로 순서로 3번 부르고, 앞 결과를 다음 입력에 라벨로 넣는다', async () => {
  mockSolarSequence([wpsCpReply(), wbsReply(), cpReply()]);
  const out = await judgePlan({ announcement });
  assert.equal(calls.length, 3);
  assert.ok(calls[0].messages[0].content.includes('WPS'), '1번은 WPS/CP 분해 프롬프트');
  assert.ok(calls[0].messages[1].content.startsWith('===== DOCUMENT_INFO ====='));
  assert.ok(calls[1].messages[1].content.startsWith('===== WPS_CP_V1 =====\n{'), '2번 입력은 WPS_CP_V1 부터');
  assert.ok(calls[1].messages[1].content.includes('"agent": "WPS_CP_V1"'));
  assert.ok(calls[1].messages[1].content.includes('===== DOCUMENT_INFO ====='));
  assert.ok(calls[2].messages[1].content.startsWith('===== WBS_V1 =====\n{'), '3번 입력은 WBS_V1 부터');
  assert.ok(calls[2].messages[1].content.includes('"duration": "미 명시"'), '가드를 거친 WBS 가 다음 입력이 된다');
  assert.equal(out.wpsCp.agent, 'WPS_CP_V1');
  assert.equal(out.wbs.agent, 'WBS_V1');
  assert.equal(out.criticalPath.agent, 'CRITICAL_PATH_COST_V1');
  assert.equal(out.criticalPath.cost_estimate.total_mm, 2);
  assert.equal(out.meta.calls, 3);
});

// ── HTTP ────────────────────────────────────────────────────────────────
migrate();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const post = (path, body) => nativeFetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('POST /api/judge/plan — 200 + { wpsCp, wbs, criticalPath, meta }', async () => {
  mockSolarSequence([wpsCpReply(), wbsReply(), cpReply()]);
  const res = await post('/api/judge/plan', { announcement });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.wbs.work_packages[0].duration, '미 명시');
  assert.equal(body.criticalPath.critical_path[0].severity, 'danger');
  assert.equal(body.meta.model, 'solar-pro3');
});

test('POST /api/judge/plan — announcement 없으면 400', async () => {
  const res = await post('/api/judge/plan', {});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'E_VALIDATION');
});

// ── 2-1 임계경로가 0건으로 오는 실측 — 공고에서 «남이 시간을 쓰는 일»을 찾아 채운다 ──
import { announcementFor } from '../src/services/solarJudge.service.js';

const noticeAnn = {
  schema_version: 'ANNOUNCEMENT_CORE_V1', procurement_project_name: 'PG 대행', issuer: '공단', budget: '16,048,200,000원', project_period: '3년',
  requirements: [{ requirement_id: 'SVR-001' }], scope_items: [{ a: 1 }], execution_conditions: [{ b: 1 }], evaluation_items: [{ c: 1 }],
  eligibility_rules: [
    { rule_id: 'ELIG_001', rule_type: 'REGISTRATION', condition: '조달청에 전자입찰 참가자격 등록을 한 자', gate_level: 'HARD_GATE', mandatory: 'YES', source_page: 1 },
    { rule_id: 'ELIG_003', rule_type: 'RESTRICTION', condition: '부정당업자로 지정되지 아니한 자', gate_level: 'HARD_GATE', mandatory: 'YES', source_page: 14 },
    { rule_id: 'ELIG_005', rule_type: 'REGISTRATION', condition: '전자금융거래법 제28조에 의한 전자금융업자로 전자지급결제대행 업무를 등록한 자', gate_level: 'HARD_GATE', mandatory: 'YES', source_page: 14 },
  ],
  submission_requirements: [
    { name: '입찰보증금(입찰보증증권)', submission_stage: 'BID', validity_basis: '', source_page: 4 },
    { name: '중소기업확인서', submission_stage: 'BID', validity_basis: '제안서 마감일 전일까지 유효', source_page: 4 },
    { name: '제안서', submission_stage: 'BID', validity_basis: '', source_page: 4 },
    { name: '최종보고서', submission_stage: 'COMPLETION', validity_basis: '', source_page: 30 },
  ],
  constraint_deadline: '2025년 3월 14일(금) 11:00까지', constraint_method: '전자입찰', constraint_source_page: 2,
};

test('announcementFor(criticalPath) — 마감·자격 조항·입찰 제출물을 보내고 요구사항 본문·범위·수행조건은 보내지 않는다', () => {
  const a = announcementFor('criticalPath', noticeAnn);
  assert.equal(a.constraint_deadline, noticeAnn.constraint_deadline);
  assert.equal(a.eligibility_rules.length, 3);
  assert.deepEqual(a.submission_requirements.map((s) => s.name), ['입찰보증금(입찰보증증권)', '중소기업확인서', '제안서'], '계약 후 산출물(COMPLETION)은 마감 전 준비가 아니다');
  for (const k of ['requirements', 'scope_items', 'execution_conditions', 'evaluation_items']) assert.equal(k in a, false, k);
});

test('🔴 guardCriticalPath — Solar 가 0건이면 공고에서 채운다: 마감 한 줄 + 등록·증명서·유효기간 서류. 리드타임은 [확인필요]', () => {
  const out = guardCriticalPath({ agent: 'CRITICAL_PATH_COST_V1', critical_path: [], cost_estimate: {} }, { work_packages: [] }, noticeAnn);
  const items = out.critical_path;
  assert.ok(items.length >= 4, JSON.stringify(items.map((i) => i.item)));
  assert.ok(items[0].item.includes('제출 마감'), '마감이 맨 위');
  assert.equal(items[0].due_label, '2025년 3월 14일(금) 11:00까지');
  assert.equal(items[0].severity, 'danger');
  assert.equal(items[0].source_page, 2);
  const names = items.map((i) => i.item);
  assert.ok(names.some((n) => n.includes('전자입찰 참가자격 등록')), '등록 조항');
  assert.ok(names.some((n) => n.includes('전자금융업자')), '등록 조항 2');
  assert.ok(!names.some((n) => n.includes('부정당업자')), '제한 조항은 준비할 일이 아니다');
  assert.ok(names.some((n) => n.includes('입찰보증')), '보증증권 발급');
  assert.ok(names.some((n) => n.includes('중소기업확인서')), '유효기간 있는 서류');
  assert.ok(!names.some((n) => n === '제안서 준비'), '제안서 자체는 항목이 아니다');
  for (const i of items.slice(1)) {
    assert.equal(i.due_label, '[확인필요]', '리드타임을 지어내지 않는다');
    assert.equal(i.lead_time_days, 0);
    assert.ok(i.source_page > 0, '근거 쪽');
  }
  assert.equal(out.synthesized, true);
  assert.ok(out.synthesized_note.includes('공고'));
});

test('guardCriticalPath — Solar 가 항목을 줬으면 채우지 않는다 (synthesized 없음) — 마감 줄만 덧붙는다', () => {
  const out = guardCriticalPath(cpReply(), { work_packages: [] }, noticeAnn);
  assert.equal(out.synthesized, undefined);
  assert.equal(out.critical_path.length, 3);
  assert.ok(out.critical_path[0].item.includes('제출 마감'));
  assert.equal(out.critical_path[1].item, '조달청 전자입찰 참가자격 등록', 'Solar 항목은 리드타임 내림차순 그대로');
});

test('guardCriticalPath — 원가 근거가 없으면 공고 예산을 근거로 (쪽은 0 = 모름)', () => {
  const out = guardCriticalPath({ critical_path: [], cost_estimate: { references: [] } }, { work_packages: [] }, noticeAnn);
  assert.deepEqual(out.cost_estimate.references, [{ label: '예산 16,048,200,000원', page: 0 }]);
});

test('judgePlan — 임계경로 호출에는 자격 조항·제출물이 실려 간다 (계획 호출과 다른 조각)', async () => {
  mockSolarSequence([wpsCpReply(), wbsReply(), cpReply()]);
  await judgePlan({ announcement: noticeAnn });
  const cpUser = calls[2].messages[1].content;   // mockSolarSequence 는 body 를 그대로 쌓는다
  assert.ok(cpUser.includes('ELIG_005'), '자격 조항');
  assert.ok(cpUser.includes('입찰보증금'), '제출물');
  assert.ok(!cpUser.includes('"execution_conditions"'), '수행조건은 안 보낸다');
  const wbsUser = calls[1].messages[1].content;
  assert.ok(!wbsUser.includes('ELIG_005'), 'WBS 호출에는 자격 조항이 없다');
});

test('guardCriticalPath — Solar 가 항목을 줘도 마감 줄이 없으면 맨 위에 마감을 둔다 (날짜는 공고의 것)', () => {
  const reply = cpReply();   // 등록·실적증명 두 건, 마감 줄 없음
  const out = guardCriticalPath(reply, { work_packages: [] }, noticeAnn);
  assert.ok(out.critical_path[0].item.includes('제출 마감'));
  assert.equal(out.critical_path[0].due_label, noticeAnn.constraint_deadline);
  assert.equal(out.critical_path[0].severity, 'danger');
  assert.equal(out.critical_path.length, 3);
  assert.equal(out.synthesized, undefined, '채워 넣은 게 아니라 마감만 덧붙였다');

  // 이미 마감 줄이 있으면 더하지 않는다
  const withDeadline = { ...cpReply(), critical_path: [{ item: '제안서 제출 마감', lead_time_days: 0, source_page: 2 }, ...cpReply().critical_path] };
  assert.equal(guardCriticalPath(withDeadline, { work_packages: [] }, noticeAnn).critical_path.filter((c) => c.item.includes('마감')).length, 1);
});

// ── 2-2 WBS 품질: 기간 전부 「미 명시」·한 패키지에 요구사항 50개 (실측) ──
import { loadPrompt } from '../src/services/solarJudge.service.js';

test('WBS 프롬프트 — 사업기간·추진일정을 기간으로 쓰는 규칙과 패키지당 요구사항 상한(15)이 들어 있다', () => {
  const p = loadPrompt('wbs');
  assert.ok(p.includes('project_period'), '사업기간을 기간의 근거로');
  assert.ok(p.includes('추진일정'), '추진일정 표를 기간의 근거로');
  assert.ok(/15개/.test(p), '패키지당 요구사항 상한');
  assert.ok(p.includes('미 명시'), '그래도 없으면 미 명시');
});

test('guardWbs — 요구사항을 16개 이상 묶은 패키지는 validation.oversized_packages 에 적는다', () => {
  const many = Array.from({ length: 40 }, (_, i) => `SVR-${String(i + 1).padStart(3, '0')}`);
  const ann = { requirements: many.map((id) => ({ requirement_id: id })) };
  const out = guardWbs({ work_packages: [
    { wbs_id: '1.1', name: '큰 묶음', requirement_refs: many.slice(0, 30), effort_mm: [] },
    { wbs_id: '1.2', name: '작은 묶음', requirement_refs: many.slice(30, 35), effort_mm: [] },
  ] }, ann);
  assert.deepEqual(out.validation.oversized_packages, [{ wbs_id: '1.1', count: 30 }]);
});

// ── 2-2 보강: 프롬프트가 안 먹는 실측(8개 패키지·전부 미 명시·5개가 16건 초과) → 가드가 결정적으로 보정 ──
const svr = (n) => `SVR-${String(n).padStart(3, '0')}`;
const bigAnn = {
  project_period: '2025. 7. 1. ~ 2028. 06. 30./ 3년',
  requirements: [
    ...Array.from({ length: 12 }, (_, i) => ({ requirement_id: svr(i + 1), requirement_category: '① 결제 대행', requirement_name: `결제 ${i + 1}`, detailed_content: 'x'.repeat(200), source_page: 4 })),
    ...Array.from({ length: 10 }, (_, i) => ({ requirement_id: svr(i + 13), requirement_category: '② 정산', requirement_name: `정산 ${i + 1}`, detailed_content: 'y'.repeat(200), source_page: 5 })),
    ...Array.from({ length: 8 }, (_, i) => ({ requirement_id: svr(i + 23), requirement_category: '③ 정보보안', requirement_name: `보안 ${i + 1}`, detailed_content: 'z'.repeat(200), source_page: 6 })),
  ],
  scope_items: [{ scope_item: '결제서비스 제공' }], execution_context: [{ context_type: 'SCHEDULE', item: '시행 전 준비기간 3개월' }],
};

test('announcementFor(wbs) — 요구사항은 ID·분류·명칭·쪽만 (본문 200자×145건을 WBS 호출에 싣지 않는다), WPS/CP 호출(plan)은 본문을 그대로', () => {
  const w = announcementFor('wbs', bigAnn);
  assert.equal(w.requirements.length, 30);
  assert.deepEqual(Object.keys(w.requirements[0]).sort(), ['requirement_category', 'requirement_id', 'requirement_name', 'source_page']);
  assert.equal(w.project_period, bigAnn.project_period);
  assert.ok(w.scope_items && w.execution_context);
  const p = announcementFor('plan', bigAnn);
  assert.ok('detailed_content' in p.requirements[0]);
});

test('🔴 guardWbs — 16건 초과 패키지는 공고의 절(requirement_category) 기준으로 나눈다: 1.3 → 1.3.1·1.3.2…, 이름에 절, M/M 은 건수 비례', () => {
  const out = guardWbs({ work_packages: [
    { wbs_id: '1.3', name: '결제·정산 기능 구현', deliverable: '결제 모듈', predecessors: ['1.1'], duration: '', effort_mm: [{ grade: '고급', mm: 3 }], requirement_refs: Array.from({ length: 22 }, (_, i) => svr(i + 1)), source_page: 4 },
    { wbs_id: '1.4', name: '보안 기반 구축', deliverable: '보안 설계서', predecessors: ['1.3'], duration: '', effort_mm: [{ grade: '특급', mm: 1 }], requirement_refs: Array.from({ length: 8 }, (_, i) => svr(i + 23)), source_page: 6 },
  ] }, bigAnn);
  const ids = out.work_packages.map((p) => p.wbs_id);
  assert.deepEqual(ids, ['1.3.1', '1.3.2', '1.4'], JSON.stringify(ids));
  const [a, b] = out.work_packages;
  assert.equal(a.name, '결제·정산 기능 구현 — ① 결제 대행');
  assert.equal(b.name, '결제·정산 기능 구현 — ② 정산');
  assert.equal(a.requirement_refs.length, 12);
  assert.equal(b.requirement_refs.length, 10);
  assert.deepEqual(a.effort_mm, [{ grade: '고급', mm: 1.6 }]);   // 3 × 12/22 = 1.64
  assert.deepEqual(b.effort_mm, [{ grade: '고급', mm: 1.4 }]);   // 나머지 — 합이 3 을 지킨다
  assert.equal(a.split_from, '1.3');
  assert.deepEqual(a.predecessors, ['1.1']);
  assert.deepEqual(b.predecessors, ['1.3.1'], '나눈 조각은 앞 조각을 선행으로 — 순서는 원본이 정한 것');
  assert.deepEqual(out.work_packages[2].predecessors, ['1.3.2'], '원래 1.3 을 선행으로 둔 패키지는 마지막 조각을 본다');
  assert.deepEqual(out.validation.split_packages, [{ wbs_id: '1.3', into: ['1.3.1', '1.3.2'] }]);
  assert.deepEqual(out.validation.oversized_packages, [], '나눈 뒤에는 16건 초과가 없다');
  assert.equal(out.validation.linked_requirement_count, 30);
});

test('guardWbs — 한 절 안에서 16건을 넘으면 나눌 기준이 없다 → 그대로 두고 oversized 로 말한다 · 이미 나눈 조각은 다시 나누지 않는다', () => {
  const ann = { requirements: Array.from({ length: 20 }, (_, i) => ({ requirement_id: svr(i + 1), requirement_category: '① 결제 대행' })) };
  const out = guardWbs({ work_packages: [{ wbs_id: '2.1', name: '결제', requirement_refs: Array.from({ length: 20 }, (_, i) => svr(i + 1)), effort_mm: [] }] }, ann);
  assert.deepEqual(out.work_packages.map((p) => p.wbs_id), ['2.1']);
  assert.deepEqual(out.validation.oversized_packages, [{ wbs_id: '2.1', count: 20 }]);
  const again = guardWbs(out, ann);
  assert.deepEqual(again.work_packages.map((p) => p.wbs_id), ['2.1']);
});

test('🔴 guardWbs — 가드를 다시 걸어도(reguard) 지난번에 나눈 기록(split_packages)이 사라지지 않는다', () => {
  const first = guardWbs({ work_packages: [
    { wbs_id: '1.3', name: '결제·정산', predecessors: [], duration: '', effort_mm: [], requirement_refs: Array.from({ length: 22 }, (_, i) => svr(i + 1)), source_page: 4 },
  ] }, bigAnn);
  assert.deepEqual(first.validation.split_packages, [{ wbs_id: '1.3', into: ['1.3.1', '1.3.2'] }]);
  const again = guardWbs(first, bigAnn);
  assert.deepEqual(again.validation.split_packages, [{ wbs_id: '1.3', into: ['1.3.1', '1.3.2'] }], '다시 걸어도 기록이 남는다');
  assert.deepEqual(guardWbs(again, bigAnn).validation.split_packages.length, 1, '중복으로 쌓이지 않는다');
});

test('🔴 guardWbs — 기간이 비어 있어도 문서에 사업기간이 있으면 운영·대행·유지관리·정산 성격 패키지는 그 기간을 쓴다 (duration_source 표시)', () => {
  const out = guardWbs({ work_packages: [
    { wbs_id: '1.1', name: '전자결제 대행 서비스 제공', requirement_refs: [svr(1)], effort_mm: [] },
    { wbs_id: '1.2', name: '정산·수수료 관리 운영', requirement_refs: [svr(13)], effort_mm: [] },
    { wbs_id: '1.3', name: '시스템 연계·인터페이스 구축', requirement_refs: [svr(23)], effort_mm: [] },
    { wbs_id: '1.4', name: '보안관제 및 유지보수', requirement_refs: [svr(24)], duration: '착수 후 4주', effort_mm: [] },
  ] }, bigAnn);
  const by = Object.fromEntries(out.work_packages.map((p) => [p.wbs_id, p]));
  assert.equal(by['1.1'].duration, '사업기간 전체 (2025. 7. 1. ~ 2028. 06. 30./ 3년)');
  assert.equal(by['1.1'].duration_source, 'project_period');
  assert.equal(by['1.2'].duration_source, 'project_period');
  assert.equal(by['1.3'].duration, '미 명시', '구축·연계는 문서가 기간을 말하지 않았다');
  assert.equal(by['1.4'].duration, '착수 후 4주', '모델이 문서에서 읽어 온 기간은 그대로');
  assert.equal(by['1.4'].duration_source, undefined);
  // 사업기간이 없으면 아무것도 채우지 않는다
  const none = guardWbs({ work_packages: [{ wbs_id: '1.1', name: '운영 대행', requirement_refs: [], effort_mm: [] }] }, { requirements: [] });
  assert.equal(none.work_packages[0].duration, '미 명시');
});

test('guardWbs — 나눈 조각의 M/M 이 반올림으로 0 이 되면 그 등급 칸을 비운다 (「중급 0」을 그리지 않는다)', () => {
  const ann = { requirements: [
    ...Array.from({ length: 20 }, (_, i) => ({ requirement_id: svr(i + 1), requirement_category: 'A' })),
    { requirement_id: svr(21), requirement_category: 'B' },
  ] };
  const out = guardWbs({ work_packages: [{ wbs_id: '1.1', name: '묶음', requirement_refs: Array.from({ length: 21 }, (_, i) => svr(i + 1)), effort_mm: [{ grade: '중급', mm: 0.5 }] }] }, ann);
  const pieces = out.work_packages.filter((p) => p.split_from === '1.1');
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces[0].effort_mm, [{ grade: '중급', mm: 0.5 }]);
  assert.deepEqual(pieces[1].effort_mm, [], '0.5 × 1/21 → 0.0 → 비운다');
});

// ── 3: AX 진단 케이스 실측 — 공고에 추진일정 6단계(7월~8월 … 12월)가 있는데 29개 패키지 전부 기간 「미 명시」·선행 빈 배열로 왔다 ──
const schedAnn = {
  project_period: '계약체결일로부터 2026.12.15',
  requirements: [1, 2, 3].map((n) => ({ requirement_id: svr(n), requirement_category: '기능', requirement_name: `기능 ${n}`, source_page: 3 })),
  execution_context: [
    { context_type: 'GOVERNANCE', title: '추진체계', content: '주관 부서', timing: '' },
    { context_type: 'SCHEDULE', title: '4. 추진일정', content: '제안 내용 협의', timing: '7월~8월' },
    { context_type: 'SCHEDULE', title: '4. 추진일정', content: 'DB 구축', timing: '7월~9월' },
    { context_type: 'SCHEDULE', title: '4. 추진일정', content: '안정화', timing: '' },
  ],
};

test('🔴 guardWbs — 공고의 추진일정(SCHEDULE + timing)을 schedule[] 로 붙인다 — 기간 칸의 「미 명시」 옆에 근거가 같이 간다', () => {
  const out = guardWbs({ work_packages: [{ wbs_id: '1.1', name: 'DB 구축', predecessors: [], duration: '', effort_mm: [], requirement_refs: [svr(1)] }] }, schedAnn);
  assert.deepEqual(out.schedule, [
    { title: '4. 추진일정', content: '제안 내용 협의', timing: '7월~8월' },
    { title: '4. 추진일정', content: 'DB 구축', timing: '7월~9월' },
  ]);
  assert.equal(guardWbs({ work_packages: [] }, { requirements: [] }).schedule, undefined, '추진일정이 없으면 필드를 만들지 않는다');
});

test('🔴 guardWbs — 패키지가 둘 이상인데 선행이 전부 비어 있으면 validation.no_predecessors 로 말한다', () => {
  const pk = (id) => ({ wbs_id: id, name: id, predecessors: [], duration: '미 명시', effort_mm: [], requirement_refs: [svr(1)] });
  // 한 단계 안에서 전부 비면 채울 근거가 없다 — 그대로 말한다 (단계가 여럿이면 아래 stage_order 테스트처럼 채운다)
  assert.equal(guardWbs({ work_packages: [pk('1.1'), pk('1.2'), pk('1.3')] }, schedAnn).validation.no_predecessors, true);
  assert.equal(guardWbs({ work_packages: [pk('1.1'), { ...pk('1.2'), predecessors: ['1.1'] }] }, schedAnn).validation.no_predecessors, false);
  assert.equal(guardWbs({ work_packages: [pk('1.1')] }, schedAnn).validation.no_predecessors, false, '하나뿐이면 선행이 없는 게 맞다');
});

test('🔴 WBS 프롬프트 — 추진일정의 timing 을 그대로 기간으로, 추진일정 순서가 곧 선행이라고 적혀 있다', () => {
  const p = loadPrompt('wbs');
  assert.ok(p.includes('timing'), '추진일정의 timing 을 옮긴다');
  assert.ok(p.includes('추진일정의 순서'), '추진일정 순서 = 선행');
  assert.ok(p.includes('전부 빈 배열'), '전부 빈 배열로 내지 않는다');
});

// ── 3 보강: 프롬프트에 선행 규칙을 적어도 실호출(AX 진단 32개)이 전부 [] 로 왔다 → 단계 번호(1단 = 문서의 추진일정 순서)로 채운다 ──
test('🔴 guardWbs — 선행이 전부 비면 단계 순서로 채운다: 뒤 단계의 패키지는 앞 단계의 마지막 패키지를 선행으로 (predecessor_source: stage_order)', () => {
  const pk = (id, name) => ({ wbs_id: id, name, predecessors: [], duration: '미 명시', effort_mm: [], requirement_refs: [svr(1)] });
  const out = guardWbs({ work_packages: [pk('1.1', '착수'), pk('1.2', '분석'), pk('2.1', '설계'), pk('2.2', '구현'), pk('3.1', '시험')] }, schedAnn);
  const by = Object.fromEntries(out.work_packages.map((p) => [p.wbs_id, p]));
  assert.deepEqual(by['1.1'].predecessors, []);
  assert.deepEqual(by['1.2'].predecessors, [], '같은 단계 안은 병행 — 지어내지 않는다');
  assert.deepEqual(by['2.1'].predecessors, ['1.2']);
  assert.deepEqual(by['2.2'].predecessors, ['1.2']);
  assert.deepEqual(by['3.1'].predecessors, ['2.2']);
  assert.equal(by['2.1'].predecessor_source, 'stage_order');
  assert.equal(by['1.2'].predecessor_source, undefined);
  assert.equal(out.validation.no_predecessors, false);
  assert.equal(out.validation.predecessors_filled, 3);
  assert.equal(guardWbs(out, schedAnn).validation.predecessors_filled, 3, '다시 걸어도 채운 수가 남는다');
});

test('guardWbs — 모델이 선행을 하나라도 냈으면 손대지 않는다 · 단계가 하나뿐이면 채울 것이 없어 no_predecessors 그대로', () => {
  const pk = (id, pred = []) => ({ wbs_id: id, name: id, predecessors: pred, duration: '미 명시', effort_mm: [], requirement_refs: [svr(1)] });
  const some = guardWbs({ work_packages: [pk('1.1'), pk('2.1', ['1.1']), pk('2.2')] }, schedAnn);
  assert.deepEqual(some.work_packages.map((p) => p.predecessors), [[], ['1.1'], []]);
  assert.equal(some.validation.predecessors_filled, 0);
  const one = guardWbs({ work_packages: [pk('1.1'), pk('1.2'), pk('1.3')] }, schedAnn);
  assert.equal(one.validation.no_predecessors, true);
  assert.equal(one.validation.predecessors_filled, 0);
});
