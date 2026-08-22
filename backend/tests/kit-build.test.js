import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { buildKit } from '../src/services/kit.service.js';
import { KIT_PAGES } from '../src/config/kitPages.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const announcement = {
  schema_version: 'ANNOUNCEMENT_CORE_V1',
  ...fx('01_overview.rfp.json'),
  ...fx('03_requirements.rfp.json'),
  ...fx('04_eligibility_submission.notice.json'),
};
const BID_DOCS = announcement.submission_requirements.filter((s) => s.submission_stage === 'BID').length;
const ALL_TAB_IDS = KIT_PAGES.flatMap((p) => p.tabs.map((t) => t.id));

// 가드를 통과한 판정 결과 모양 (solar-judge*.test.js 와 같다)
const eligibility = {
  agent: 'ELIGIBILITY_SCREENING_V1', verdict: '추천', headline: '참가자격 3개 확인 — 2개 충족, 1개는 서류에서 읽지 못했습니다.',
  matched_count: 2, failed_count: 0, unverified_count: 1,
  checks: [
    { rule_id: 'ELIG_005', label: '중소기업확인서', status: '충족', gate_level: 'HARD_GATE', mandatory: 'YES', announcement_page: 1, company_source_document: '중소기업확인서_다온피엠씨_가상.pdf' },
    { rule_id: 'ELIG_012', label: '직접생산확인증명서', status: '[확인필요]', gate_level: 'HARD_GATE', mandatory: 'YES', announcement_page: 2, company_source_document: '' },
    { rule_id: 'ELIG_014', label: '소프트웨어사업자 등록', status: '충족', gate_level: 'HARD_GATE', mandatory: 'YES', announcement_page: 2, company_source_document: '소프트웨어사업자신고확인서_다온피엠씨_가상.pdf' },
  ],
  exclusion_reasons: [], unverified_items: [{ label: '직접생산확인증명서', what_is_missing: '서류 자체가 없다' }],
};
const plan = {
  wpsCp: { agent: 'WPS_CP_V1' },
  wbs: {
    agent: 'WBS_V1',
    work_packages: [
      { wbs_id: '1.1', name: '착수 및 사업수행 계획 수립', deliverable: '사업 수행 계획서', predecessors: [], duration: '미 명시', effort_mm: [{ grade: '특급', mm: 0.5 }, { grade: '고급', mm: 0.5 }], is_recommendation: true, requirement_refs: ['SFR-001'], source_page: 13 },
      { wbs_id: '1.2', name: '진단 엔진 분석', deliverable: '분석서', predecessors: ['1.1'], duration: '착수 후 4주', effort_mm: [{ grade: '고급', mm: 1 }], is_recommendation: true, requirement_refs: ['SFR-002', 'SFR-003'], source_page: 13 },
    ],
    validation: { primary_requirement_count: 33, linked_requirement_count: 3, unlinked_requirement_ids: ['SFR-004'], packages_without_requirement: [], unknown_requirement_refs: [] },
  },
  criticalPath: {
    agent: 'CRITICAL_PATH_COST_V1',
    critical_path: [
      { item: '조달청 전자입찰 참가자격 등록', lead_time_days: 7, due_label: '7일 전', severity: 'danger', source_page: 1 },
      { item: '실적증명서 발급 (발주기관 직인)', lead_time_days: 0, due_label: '[확인필요]', severity: 'default', source_page: 4 },
    ],
    cost_estimate: { total_mm: 2, by_grade: [{ grade: '특급', mm: 0.5 }, { grade: '고급', mm: 1.5 }], is_recommendation: true, not_a_bid_price: true, amount_convertible: false, amount_note: '단가 미입력 — 회사 카드에 등급별 단가가 있을 때만 환산한다', references: [{ label: '추정가격', page: 1 }] },
  },
};
const submission = {
  rules: { agent: 'SUBMISSION_RULES_V2' },
  proposalScan: { agent: 'PROPOSAL_SCAN_V1' },
  audit: {
    agent: 'SUBMISSION_AUDIT_V1', overall_status: 'NEEDS_REWORK',
    submission_constraints: { method: '전자입찰<국가종합전자조달시스템(나라장터)>', deadline: '2026. 08. 24(월) 10:30', proposal_copies: '', page_limit: '100페이지 이내로 작성 권고', price_proposal_sealed: '', source_page: 1 },
    documents: [
      { name: '입찰참가신청서', copies: '1', validity: '', status: '준비됨', rework_note: '', lead_time: '', matched_file: '사업자등록증_다온피엠씨_가상.pdf', source_page: 4 },
      { name: '제안서', copies: '', validity: '', status: '보완 필요', rework_note: '분량 100쪽 상한을 넘겼습니다', lead_time: '인쇄 1일', matched_file: '', source_page: 48 },
      { name: '실적증명서', copies: '1', validity: '발급 30일 내', status: '미확인', rework_note: '', lead_time: '', matched_file: '', source_page: 36 },
    ],
    rework_requests: [{ document: '제안서', reason: '분량 100쪽 상한을 넘겼습니다', action: '보완 자료 올리기' }],
    forbidden_expressions: { count: 2, rule_note: '', items: [{ expression: '가능합니다', sentence: '…', proposal_page: 3, rule_source_page: 18 }, { expression: '고려할 수 있다', sentence: '…', proposal_page: 4, rule_source_page: 18 }] },
    uncovered_requirement_ids: ['SFR-008'],
    summary: { required_document_count: 3, ready_count: 1, rework_count: 1, unverified_count: 1 },
  },
};

const tabOf = (kit, id) => kit.tabs.find((t) => t.id === id);

test('buildKit — 판정 셋이 다 있으면 kitPages 의 9탭이 전부 나온다', () => {
  const kit = buildKit({ announcement, eligibility, plan, submission });
  assert.deepEqual(new Set(kit.tabs.map((t) => t.id)), new Set(ALL_TAB_IDS));
  assert.ok(kit.tabs.every((t) => t.id && t.title && t.kind), '탭마다 id·title·kind');
});

test('buildKit — 공고만 있으면 있는 것만 그린다 (compliance·constraints·submitfiles)', () => {
  const kit = buildKit({ announcement });
  assert.deepEqual(kit.tabs.map((t) => t.id).sort(), ['compliance', 'constraints', 'submitfiles']);
  assert.equal(kit.verdict, undefined);
});

test('compliance — 요구사항 33행, ※ 단서는 proviso 톤, 근거 쪽은 Np, 체크리스트', () => {
  const tab = tabOf(buildKit({ announcement }), 'compliance');
  assert.equal(tab.kind, 'checklist');
  assert.deepEqual(tab.columns, ['요구사항 ID', '분류', '명칭', '단서', '근거 페이지']);
  assert.equal(tab.rows.length, announcement.requirements.length);
  const withNote = tab.rows.find((r) => r[0] === 'SFR-010');
  assert.equal(withNote[3].tone, 'proviso');
  assert.ok(withNote[3].text.startsWith('※'));
  assert.equal(tab.rows[0][3], '-', '단서 없으면 -');
  assert.equal(tab.rows[0][4], '13p');
  assert.ok(tab.summary.includes('33건'));
});

test('wbs·criticalpath·cost — 기간 미 명시 · 톤 셀 · M/M 합계', () => {
  const kit = buildKit({ announcement, plan });
  const wbs = tabOf(kit, 'wbs');
  assert.deepEqual(wbs.columns, ['ID', '작업 패키지', '산출물', '선행', '기간', 'M/M', '근거요구', 'P']);
  assert.deepEqual(wbs.rows[0], ['1.1', '착수 및 사업수행 계획 수립', '사업 수행 계획서', '-', '미 명시', '특급 0.5・고급 0.5', 'SFR-001', '13']);
  assert.equal(wbs.rows[1][3], '1.1');
  assert.ok(wbs.warnings.every((w) => typeof w === 'string'), 'warnings[] 는 문자열 — 프론트 계약');
  assert.ok(wbs.warnings.some((w) => w.includes('미 명시 1건')));
  assert.ok(wbs.warnings.some((w) => w.includes('SFR-004')), '미연결 요구사항을 숨기지 않는다');

  const cp = tabOf(kit, 'criticalpath');
  assert.deepEqual(cp.columns, ['작업', '남은 일']);
  assert.deepEqual(cp.rows[0][1], { text: '7일 전', tone: 'danger', chip: false });
  assert.equal(cp.rows[1][1], '[확인필요]', 'default 톤은 평문');

  const cost = tabOf(kit, 'cost');
  assert.equal(cost.kind, 'metric');
  assert.equal(cost.metric.value, '2.0');
  assert.equal(cost.metric.unit, 'M/M');
  assert.equal(cost.metric.caption, '특급 0.5・고급 1.5');
  assert.deepEqual(cost.metric.evidence, ['추정가격・공고 p1']);
  assert.equal(cost.summary, '투찰가 아님');
});

test('constraints·checklist·rework·phrases — 제출 검사에서', () => {
  const kit = buildKit({ announcement, submission });
  const banner = tabOf(kit, 'constraints');
  assert.equal(banner.kind, 'banner');
  assert.ok(banner.banner.text.includes('전자입찰'));
  assert.ok(banner.banner.text.includes('100페이지'));
  assert.equal(banner.banner.evidence, '공고문 p1');

  const checklist = tabOf(kit, 'checklist');
  assert.deepEqual(checklist.columns, ['서류', '부수', '유효기간', '상태', '보완요청・리드타임', 'P']);
  assert.deepEqual(checklist.rows[1][3], { text: '보완 필요', tone: 'warn', chip: true });
  assert.deepEqual(checklist.rows[2][3], { text: '미확인', tone: 'muted', chip: true });
  assert.equal(checklist.rows[1][4], '분량 100쪽 상한을 넘겼습니다 · 인쇄 1일');
  assert.equal(checklist.rows[0][4], '-');

  const rework = tabOf(kit, 'rework');
  assert.equal(rework.kind, 'tasks');
  assert.equal(rework.title, '보완요청 1건');
  assert.deepEqual(rework.items[0].chip, { text: '보완 필요', tone: 'warn' });
  assert.deepEqual(rework.items[0].action, { label: '보완 자료 올리기', kind: 'upload' });

  const phrases = tabOf(kit, 'phrases');
  assert.equal(phrases.kind, 'note');
  assert.equal(phrases.note.emphasis, '2곳');
  assert.ok(phrases.note.body.includes('2곳'));
  assert.equal(phrases.note.evidence, 'RFP p18');
});

test('phrases — 제안서가 없으면 「미제출」이지 0곳 통과가 아니다', () => {
  const noProposal = { ...submission, proposalScan: null, audit: { ...submission.audit, forbidden_expressions: { count: 0, rule_note: '제안서 원고 미제출', items: [] } } };
  const phrases = tabOf(buildKit({ announcement, submission: noProposal }), 'phrases');
  assert.equal(phrases.note.emphasis, '미제출');
});

test('submitfiles — 공고의 BID 제출물마다 한 줄, 검사 결과의 파일이 붙으면 done', () => {
  const tab = tabOf(buildKit({ announcement, submission }), 'submitfiles');
  assert.equal(tab.kind, 'docs');
  assert.equal(tab.items.length, BID_DOCS);
  const matched = tab.items.find((i) => i.title === '입찰참가신청서');
  assert.equal(matched.state, 'done');
  assert.equal(matched.filename, '사업자등록증_다온피엠씨_가상.pdf');
  const missing = tab.items.find((i) => i.state === 'missing');
  assert.equal(missing.filename, '업로드 되지 않음');
  assert.equal(missing.label, '업로드');
});

test('verdict — 자격 판정에서 headline·unverified·reasons(쪽·근거 서류)', () => {
  const kit = buildKit({ announcement, eligibility });
  assert.equal(kit.verdict.badge, 'eligible');
  assert.equal(kit.verdict.unverified, 1);
  assert.equal(kit.verdict.decision, 'pending');
  assert.equal(kit.verdict.reasons.length, 3);
  assert.equal(kit.verdict.reasons[0].page, 1);
  assert.equal(kit.verdict.reasons[0].confidence, 'high');
  assert.equal(kit.verdict.reasons[1].confidence, 'unknown', '[확인필요]는 unknown');
});

// ── HTTP ────────────────────────────────────────────────────────────────
migrate();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const post = (path, body) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('POST /api/judge/kit — 200 + { verdict, tabs, kitPages }', async () => {
  const res = await post('/api/judge/kit', { announcement, eligibility, plan, submission });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.tabs.length, ALL_TAB_IDS.length);
  assert.equal(body.verdict.badge, 'eligible');
  assert.ok(Array.isArray(body.kitPages));
});

test('POST /api/judge/kit — announcement 없으면 400', async () => {
  const res = await post('/api/judge/kit', { eligibility });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'E_VALIDATION');
});
