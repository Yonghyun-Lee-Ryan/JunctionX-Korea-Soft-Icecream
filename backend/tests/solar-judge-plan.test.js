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
