import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env, ROOT } from '../src/config/env.js';
import * as companyRepo from '../src/repositories/company.repo.js';
import * as caseRepo from '../src/repositories/case.repo.js';
import { mergeAnnouncement } from '../src/services/announcement.service.js';
import { buildKit } from '../src/services/kit.service.js';
import { deleteCaseFiles, latestCaseFile } from '../src/repositories/caseFile.repo.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const announcement = mergeAnnouncement({
  rfp: { overview: fx('01_overview.rfp.json'), requirements: fx('03_requirements.rfp.json'), eligibilitySubmission: fx('04_eligibility_submission.rfp.json') },
  notice: { eligibilitySubmission: fx('04_eligibility_submission.notice.json') },
});
// 🔴 데모 입력의 가짜 제안서 — 금지 표현 3곳이 심겨 있다 (e0b376e)
const SAMPLE_PROPOSAL = path.resolve(ROOT, '..', 'plan', 'Solar_for_Bid', '06_데모입력', '제안서_다온피엠씨_가상.pdf');

// ── Solar mock — 스캔·검사만 온다 (규칙은 저장본) ──
const nativeFetch = globalThis.fetch;
let calls;
function mockSolar() {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith(env.solar.chatUrl)) return nativeFetch(url, init);
    const body = JSON.parse(init.body);
    const key = ['SUBMISSION_RULES_V2', 'PROPOSAL_SCAN_V1', 'SUBMISSION_AUDIT_V1'].find((k) => body.messages[0].content.includes(`"agent": "${k}"`));
    const user = body.messages[1].content;
    calls.push({ key, user });
    const reply = key === 'PROPOSAL_SCAN_V1'
      ? {
        agent: 'PROPOSAL_SCAN_V1', source_file: '제안서.pdf', page_count: 5,
        forbidden_expression_hits: [
          { expression: '가능합니다', sentence: '외부 LLM 서비스와의 연계도 가능합니다.', page: 3 },
          { expression: '고려할 수 있다', sentence: '정기 점검은 추가로 고려할 수 있습니다.', page: 4 },
        ],
        covered_topics: [],
      }
      : {
        agent: 'SUBMISSION_AUDIT_V1', overall_status: 'NEEDS_REWORK', submission_constraints: {},
        documents: [{ name: '입찰참가신청서', copies: '1', validity: '', status: '미확인', rework_note: '', lead_time: '', matched_file: '', source_page: 4 }],
        rework_requests: [], forbidden_expressions: { count: 0, rule_note: '', items: [] }, uncovered_requirement_ids: [], summary: {},
      };
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });
env.solar.apiKey = 'solar-test-key';

migrate();
const COMPANY = 'co_proposal_test';
const CASE = 'R25PROP0000001-000';
companyRepo.upsertCompany({ id: COMPANY, name: '주식회사 다온피엠씨', bizNo: '120-86-01230', card: {} });
const rules = { agent: 'SUBMISSION_RULES_V2', required_documents: [], default_forbidden_expressions: ['가능하다', '고려할 수 있다'] };
const audit0 = { agent: 'SUBMISSION_AUDIT_V1', overall_status: 'NEEDS_REVIEW', documents: [], rework_requests: [], forbidden_expressions: { count: 0, rule_note: '제안서 원고 미제출', items: [] }, uncovered_requirement_ids: [], summary: {} };
function seedCase() {
  deleteCaseFiles(CASE);
  fs.rmSync(path.join(ROOT, 'data', 'uploads', CASE), { recursive: true, force: true });
  caseRepo.upsertCase({ id: CASE, bid_pbanc_no: 'R25PROP0000001', bid_pbanc_ord: '000', company_id: COMPANY, status: 'done', source: 'live', verdict_json: '{"badge":"eligible"}', meta_json: JSON.stringify({ pipeline: { ranAt: new Date().toISOString() } }) });
  caseRepo.replaceProgress(CASE, [{ step: '첨부 수집', state: 'done' }, { step: '문서 읽기', state: 'done' }, { step: '문서 종류 분류', state: 'done' }, { step: '요구사항 추출·판정', state: 'done' }]);
  caseRepo.deleteExtractions(CASE);
  caseRepo.insertExtraction(CASE, { schemaName: 'ANNOUNCEMENT_CORE_V1', payload: announcement });
  caseRepo.insertExtraction(CASE, { schemaName: 'SUBMISSION_V1', payload: { rules, proposalScan: null, audit: audit0 } });
  const kit = buildKit({ announcement, submission: { rules, audit: audit0 }, caseId: CASE });
  caseRepo.clearTabs(CASE);
  kit.tabs.forEach((t, i) => caseRepo.upsertTab(CASE, t, i));
}
seedCase();

const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

function upload(caseId, { buffer, filename, mimeType = 'application/pdf' } = {}) {
  const form = new FormData();
  if (buffer) form.append('file', new Blob([buffer], { type: mimeType }), filename);
  return nativeFetch(`${base}/api/cases/${caseId}/proposal`, { method: 'POST', body: form });
}
const phrasesOf = (f) => f.tabs.find((t) => t.id === 'phrases');

test('phrases 탭 — 원고가 없으면 「제안서 원고 올리기」 행동을 서버가 붙인다 (화면이 버튼 문구를 짓지 않는다)', async () => {
  seedCase();
  const f = await nativeFetch(`${base}/api/cases/${CASE}`).then((r) => r.json());
  const note = phrasesOf(f).note;
  assert.equal(note.emphasis, '미제출');
  assert.deepEqual(note.action, { label: '제안서 원고 올리기', kind: 'upload' });
});

test('🔴 POST /api/cases/{id}/proposal — PDF 원고를 올리면 스캔+검사만 다시 돌아 걸린 자리가 카드에 실린다', async () => {
  seedCase();
  mockSolar();
  const res = await upload(CASE, { buffer: fs.readFileSync(SAMPLE_PROPOSAL), filename: '제안서_다온피엠씨_가상.pdf' });
  assert.equal(res.status, 200);
  const f = await res.json();
  const note = phrasesOf(f).note;
  assert.equal(note.emphasis, '2곳');
  assert.ok(note.body.includes('2곳'));
  assert.equal(note.items.length, 2);
  assert.deepEqual(note.items[0], { expression: '가능합니다', sentence: '외부 LLM 서비스와의 연계도 가능합니다.', page: 3 });
  assert.equal(note.proposal_file, '제안서_다온피엠씨_가상.pdf', '어느 원고를 검사했는지 말한다');
  assert.deepEqual(note.action, { label: '다른 원고로 다시 검사', kind: 'upload' });

  // Solar: 스캔 1 + 검사 1. 규칙은 저장본 — 그리고 스캔에는 원고 본문이 실려 간다
  assert.deepEqual([...calls.map((c) => c.key)].sort(), ['PROPOSAL_SCAN_V1', 'SUBMISSION_AUDIT_V1']);
  assert.ok(calls.find((c) => c.key === 'PROPOSAL_SCAN_V1').user.includes('가능합니다'), '원고 텍스트가 스캔에 들어간다');

  const stored = latestCaseFile(CASE, 'proposal');
  assert.equal(stored.filename, '제안서_다온피엠씨_가상.pdf');
  assert.ok(stored.textChars > 1000);

  // 저장된 봉투도 같다
  const again = await nativeFetch(`${base}/api/cases/${CASE}`).then((r) => r.json());
  assert.equal(phrasesOf(again).note.emphasis, '2곳');
});

test('POST proposal — 텍스트가 없는 파일(HWP·스캔본)은 415 로 이유를 말한다, 원고는 남기지 않는다', async () => {
  seedCase();
  mockSolar();
  const r1 = await upload(CASE, { buffer: Buffer.from('%HWP not pdf'), filename: '제안서.hwp', mimeType: 'application/x-hwp' });
  assert.equal(r1.status, 415);
  const e1 = await r1.json();
  assert.equal(e1.error.code, 'E_UNSUPPORTED_FILE');
  assert.ok(e1.error.message.includes('PDF'));
  assert.equal(latestCaseFile(CASE, 'proposal'), null);
  assert.equal(calls.length, 0, 'Solar 를 부르지 않는다');
});

test('POST proposal — 파일이 없으면 400, 없는 케이스면 404', async () => {
  const r1 = await upload(CASE, {});
  assert.equal(r1.status, 400);
  const r2 = await upload('R25NOPE0000000-000', { buffer: Buffer.from('%PDF-'), filename: 'a.pdf' });
  assert.equal(r2.status, 404);
});

test('GET /api/cases/{id}/files — 원고도 kind=proposal 로 목록에 (본문은 내보내지 않는다)', async () => {
  seedCase();
  mockSolar();
  await upload(CASE, { buffer: fs.readFileSync(SAMPLE_PROPOSAL), filename: '제안서_다온피엠씨_가상.pdf' });
  const body = await nativeFetch(`${base}/api/cases/${CASE}/files`).then((r) => r.json());
  const p = body.files.find((x) => x.kind === 'proposal');
  assert.ok(p);
  assert.equal(p.filename, '제안서_다온피엠씨_가상.pdf');
  assert.equal('text' in p, false);
});
