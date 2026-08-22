import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env } from '../src/config/env.js';
import { buildUserMessage, judgeSubmission, guardSubmissionAudit } from '../src/services/solarJudge.service.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const companyCard = fx('company_card.flat.json');
const announcement = {
  schema_version: 'ANNOUNCEMENT_CORE_V1',
  ...fx('01_overview.rfp.json'),
  ...fx('03_requirements.rfp.json'),
  ...fx('04_eligibility_submission.notice.json'),
};
const proposalText = '당사는 외부 LLM 서비스와의 연계도 가능합니다. 정기 점검은 추가로 고려할 수 있습니다.';

// ── Solar mock — system 프롬프트에 든 출력 스키마 이름으로 답을 고른다 (호출 순서 무관) ──
const nativeFetch = globalThis.fetch;
let calls = [];
function mockSolarByPrompt(replies) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(env.solar.chatUrl)) return nativeFetch(url, init);
    const body = JSON.parse(init.body);
    calls.push(body);
    // 🔴 검사 프롬프트는 본문에서 SUBMISSION_RULES_V2·PROPOSAL_SCAN_V1 을 인용한다 — 출력 템플릿의 "agent" 값으로 고른다
    const key = Object.keys(replies).find((k) => body.messages[0].content.includes(`"agent": "${k}"`));
    assert.ok(key, `어느 프롬프트인지 모르겠다: ${body.messages[0].content.slice(0, 60)}`);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(replies[key]) } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });
env.solar.apiKey = 'solar-test-key';

const rulesReply = () => ({
  agent: 'SUBMISSION_RULES_V2',
  project_name: 'AX 진단-컨설팅 통합 서비스 개발',
  constraints: { method: '전자입찰<국가종합전자조달시스템(나라장터)>', deadline: '2026. 08. 24(월) 10:30', proposal_copies: '', page_limit: '', summary_page_limit: '', price_proposal_sealed: '', place: '나라장터', source_page: 1 },
  required_documents: [
    { name: '입찰참가신청서', copies: '1', validity_basis: '', submission_method: '나라장터', mandatory: 'YES', template_id: '', signature_or_seal: '', condition_or_note: '', stage: 'BID', source_page: 4 },
    { name: '제안서', copies: '', validity_basis: '', submission_method: '나라장터', mandatory: 'YES', template_id: '붙임 1', signature_or_seal: '', condition_or_note: '', stage: 'BID', source_page: 48 },
  ],
  proposal_checks: [{ requirement_id: 'SFR-001', topic: '도메인 모드 선택', source_page: 13 }],
  evaluation_checks: [],
  forbidden_expression_rules: [],
  default_forbidden_expressions: ['가능하다', '고려할 수 있다', '지원 가능'],
  missing_or_uncertain_rules: [],
});

const scanReply = () => ({
  agent: 'PROPOSAL_SCAN_V1',
  source_file: '제안서_다온피엠씨_가상.pdf',
  page_count: 5,
  format_checks: { page_numbering: 'PRESENT', toc_follows_template: 'MATCH' },
  forbidden_expression_hits: [
    { expression: '가능합니다', sentence: '외부 LLM 서비스와의 연계도 가능합니다.', page: 3 },
    { expression: '고려할 수 있다', sentence: '정기 점검은 추가로 고려할 수 있습니다.', page: 4 },
  ],
  covered_topics: [{ requirement_id: 'SFR-001', topic: '도메인 모드 선택', evidence_page: 3 }],
});

/** 🔴 일부러 틀린 summary·준비됨에 붙은 보완 문구·UNKNOWN 상태·빈 rework·count 0 을 섞었다 */
const auditReply = () => ({
  agent: 'SUBMISSION_AUDIT_V1',
  project_name: 'AX 진단-컨설팅 통합 서비스 개발',
  overall_status: 'PASS',
  submission_constraints: { method: '전자입찰', deadline: '2026. 08. 24(월) 10:30', proposal_copies: '', page_limit: '', price_proposal_sealed: '', source_page: 1 },
  documents: [
    { name: '입찰참가신청서', copies: '1', validity: '', status: '준비됨', rework_note: '있으면 안 되는 문구', lead_time: '', matched_file: '사업자등록증_다온피엠씨_가상.pdf', source_page: 4 },
    { name: '제안서', copies: '', validity: '', status: '보완 필요', rework_note: '분량 100쪽 상한을 넘겼습니다', lead_time: '', matched_file: '', source_page: 48 },
    { name: '실적증명서', copies: '1', validity: '발급 30일 내', status: 'UNKNOWN', rework_note: '', lead_time: '', matched_file: '', source_page: 36 },
  ],
  rework_requests: [],
  forbidden_expressions: { count: 0, rule_note: '', items: [{ expression: '가능합니다', sentence: '외부 LLM 서비스와의 연계도 가능합니다.', proposal_page: 3, rule_source_page: 0 }] },
  uncovered_requirement_ids: ['SFR-008'],
  summary: { required_document_count: 9, ready_count: 9, rework_count: 0, unverified_count: 0 },
  missing_or_uncertain_input: [],
});

// ── 입력 조립 ───────────────────────────────────────────────────────────
test('buildUserMessage — 문자열 값은 따옴표 없이 원문 그대로 넣는다 (제안서 본문)', () => {
  const msg = buildUserMessage([['PROPOSAL_TEXT', proposalText]]);
  assert.equal(msg, `===== PROPOSAL_TEXT =====\n${proposalText}`);
});

// ── 가드 ────────────────────────────────────────────────────────────────
test('guardSubmissionAudit — 상태 어휘·보완요청·개수를 다시 만들고 overall_status 를 다시 정한다', () => {
  const out = guardSubmissionAudit(auditReply(), { proposalScan: scanReply() });
  assert.equal(out.documents[0].rework_note, '', '준비됨에는 보완 문구가 없다');
  assert.equal(out.documents[2].status, '미확인', 'UNKNOWN 은 미확인이지 보완 필요가 아니다');
  assert.deepEqual(out.summary, { required_document_count: 3, ready_count: 1, rework_count: 1, unverified_count: 1 });
  assert.equal(out.rework_requests.length, 1);
  assert.equal(out.rework_requests[0].document, '제안서');
  assert.equal(out.rework_requests[0].reason, '분량 100쪽 상한을 넘겼습니다');
  assert.equal(out.overall_status, 'NEEDS_REWORK');
  assert.equal(out.forbidden_expressions.count, 2, '제안서 스캔의 실제 적중 수로 다시 센다');
  assert.equal(out.forbidden_expressions.items[1].expression, '고려할 수 있다');
});

test('guardSubmissionAudit — 제안서가 없으면 금지 표현은 0건 + 미제출 사유이지 통과가 아니다', () => {
  const out = guardSubmissionAudit(auditReply(), { proposalScan: null });
  assert.deepEqual(out.forbidden_expressions, { count: 0, rule_note: '제안서 원고 미제출', items: [] });
});

test('guardSubmissionAudit — 보완 없고 미확인만 있으면 NEEDS_REVIEW, 전부 준비됨이면 READY', () => {
  const reply = auditReply();
  reply.documents[1].status = '준비됨';
  assert.equal(guardSubmissionAudit(reply, { proposalScan: null }).overall_status, 'NEEDS_REVIEW');
  reply.documents[2].status = '준비됨';
  assert.equal(guardSubmissionAudit(reply, { proposalScan: null }).overall_status, 'READY');
});

// ── 체인 ────────────────────────────────────────────────────────────────
test('judgeSubmission — 제안서가 있으면 규칙·스캔·검사 3호출, 검사 입력에 셋이 라벨로 들어간다', async () => {
  mockSolarByPrompt({ SUBMISSION_RULES_V2: rulesReply(), PROPOSAL_SCAN_V1: scanReply(), SUBMISSION_AUDIT_V1: auditReply() });
  const out = await judgeSubmission({ announcement, companyCard, proposalText });
  assert.equal(calls.length, 3);
  const scanCall = calls.find((c) => c.messages[0].content.includes('PROPOSAL_SCAN_V1'));
  assert.ok(scanCall.messages[1].content.startsWith(`===== PROPOSAL_TEXT =====\n${proposalText}`));
  const auditCall = calls.find((c) => c.messages[0].content.includes('SUBMISSION_AUDIT_V1'));
  const user = auditCall.messages[1].content;
  assert.ok(user.includes('===== SUBMISSION_RULES_V2 ====='));
  assert.ok(user.includes('===== PROPOSAL_SCAN_V1 ====='));
  assert.ok(user.includes('===== COMPANY_DOCUMENT_SUMMARY_V2 ====='));
  assert.ok(user.includes('"business_number": "120-86-01230"'), '회사 카드 documents[] 가 들어간다');
  assert.equal(out.audit.overall_status, 'NEEDS_REWORK');
  assert.equal(out.audit.forbidden_expressions.count, 2);
  assert.equal(out.rules.agent, 'SUBMISSION_RULES_V2');
  assert.equal(out.proposalScan.agent, 'PROPOSAL_SCAN_V1');
  assert.equal(out.meta.calls, 3);
});

test('judgeSubmission — 제안서가 없으면 2호출, 검사 입력에 미제출 사유가 들어간다', async () => {
  mockSolarByPrompt({ SUBMISSION_RULES_V2: rulesReply(), SUBMISSION_AUDIT_V1: auditReply() });
  const out = await judgeSubmission({ announcement, companyCard });
  assert.equal(calls.length, 2);
  const auditCall = calls.find((c) => c.messages[0].content.includes('SUBMISSION_AUDIT_V1'));
  assert.ok(auditCall.messages[1].content.includes('"reason": "제안서 원고 미제출"'));
  assert.equal(out.proposalScan, null);
  assert.equal(out.audit.forbidden_expressions.rule_note, '제안서 원고 미제출');
  assert.equal(out.meta.calls, 2);
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

test('POST /api/judge/submission — 200 + { rules, proposalScan, audit, meta }', async () => {
  mockSolarByPrompt({ SUBMISSION_RULES_V2: rulesReply(), PROPOSAL_SCAN_V1: scanReply(), SUBMISSION_AUDIT_V1: auditReply() });
  const res = await post('/api/judge/submission', { announcement, companyCard, proposalText });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.audit.agent, 'SUBMISSION_AUDIT_V1');
  assert.equal(body.audit.summary.rework_count, 1);
  assert.equal(body.meta.calls, 3);
});

test('POST /api/judge/submission — announcement·companyCard 없으면 400', async () => {
  const res = await post('/api/judge/submission', { announcement });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'E_VALIDATION');
  assert.ok(body.error.message.includes('companyCard'));
});
