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
import { listCaseFiles, deleteCaseFiles } from '../src/repositories/caseFile.repo.js';
import { caseDocumentsFor } from '../src/services/caseFiles.service.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const flatCard = fx('company_card.flat.json');
const announcement = mergeAnnouncement({
  rfp: { overview: fx('01_overview.rfp.json'), requirements: fx('03_requirements.rfp.json'), eligibilitySubmission: fx('04_eligibility_submission.rfp.json') },
  notice: { eligibilitySubmission: fx('04_eligibility_submission.notice.json') },
});
const REQ_NAME = '사업자등록증 및 법인등기부등본';   // 공고문의 BID 제출물 이름 그대로
const SAMPLE_PDF = path.resolve(ROOT, '..', 'plan', 'Solar_for_Bid', '06_데모입력', '사업자등록증_다온피엠씨_가상.pdf');

// ── Solar mock — 검사(audit)만 온다. 규칙은 저장본을 다시 쓴다 ──
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
    // 🔴 올린 파일이 COMPANY_DOCUMENT_SUMMARY 에 실려 오면 그 서류를 「준비됨 + 파일 연결」로 답한다
    const uploaded = user.match(/"uploaded_for": "([^"]+)"[\s\S]*?"source_document": "([^"]+)"/) ?? user.match(/"source_document": "([^"]+)"[\s\S]*?"uploaded_for": "([^"]+)"/);
    const docs = [
      { name: '입찰참가신청서', copies: '1', validity: '', status: '미확인', rework_note: '', lead_time: '', matched_file: '', source_page: 4 },
      { name: REQ_NAME, copies: '1', validity: '', status: user.includes(REQ_NAME) && user.includes('uploaded_for') ? '준비됨' : '보완 필요', rework_note: user.includes('uploaded_for') ? '' : '사업자등록증 사본이 필요합니다', lead_time: '', matched_file: user.includes('uploaded_for') ? ([...user.matchAll(/"source_document": "([^"]+)"/g)].pop()?.[1] ?? '') : '', source_page: 4 },   // 올린 파일은 목록 끝에 온다
    ];
    const reply = { agent: 'SUBMISSION_AUDIT_V1', overall_status: 'NEEDS_REWORK', submission_constraints: {}, documents: docs, rework_requests: [], forbidden_expressions: { count: 0, rule_note: '', items: [] }, uncovered_requirement_ids: [], summary: {} };
    return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });
env.solar.apiKey = 'solar-test-key';

// ── 끝난 케이스 하나를 DB 에 만든다 (파이프라인이 저장했을 모양 그대로) ──
migrate();
const COMPANY = 'co_files_test';
const CASE = 'R25FILE0000001-000';
companyRepo.upsertCompany({ id: COMPANY, name: '주식회사 다온피엠씨', bizNo: '120-86-01230', card: {} });
companyRepo.replaceCompanyDocuments(COMPANY, flatCard.documents.slice(0, 2).map((d, i) => ({
  id: `files_doc_${i}`, filename: d.source_document, doc_class: ['tech_staff', 'pia_designation'][i], bytes: 1, confidence: 'high',
  extracted_json: JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'source_document'))),
})));
const rules = { agent: 'SUBMISSION_RULES_V2', required_documents: [{ name: REQ_NAME, stage: 'BID', source_page: 4 }], default_forbidden_expressions: ['가능하다'] };
const audit0 = { agent: 'SUBMISSION_AUDIT_V1', overall_status: 'NEEDS_REWORK', documents: [{ name: REQ_NAME, copies: '1', validity: '', status: '보완 필요', rework_note: '사업자등록증 사본이 필요합니다', lead_time: '', matched_file: '', source_page: 4 }], rework_requests: [], forbidden_expressions: { count: 0, rule_note: '제안서 원고 미제출', items: [] }, uncovered_requirement_ids: [], summary: {} };
function seedCase() {
  // 🔴 테스트 DB 는 실행 간에 남는다 — 지난 실행의 업로드를 치운다
  deleteCaseFiles(CASE);
  fs.rmSync(path.join(ROOT, 'data', 'uploads', CASE), { recursive: true, force: true });
  caseRepo.upsertCase({ id: CASE, bid_pbanc_no: 'R25FILE0000001', bid_pbanc_ord: '000', company_id: COMPANY, status: 'done', source: 'live', verdict_json: '{"badge":"eligible"}', meta_json: JSON.stringify({ pipeline: { ranAt: new Date().toISOString() } }) });
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

function upload(caseId, { buffer, filename, mimeType = 'application/pdf', requirement } = {}) {
  const form = new FormData();
  if (buffer) form.append('file', new Blob([buffer], { type: mimeType }), filename);
  if (requirement !== undefined) form.append('requirement', requirement);
  return nativeFetch(`${base}/api/cases/${caseId}/files`, { method: 'POST', body: form });
}
const itemOf = (f, title) => f.tabs.find((t) => t.id === 'submitfiles').items.find((i) => i.title === title);

test('caseDocumentsFor — 회사 서류 + 케이스에 올린 파일을 한 목록으로 (올린 파일은 uploaded_for·source 표시)', () => {
  const docs = caseDocumentsFor(CASE, { documents: [{ source_document: '회사서류.pdf', docTypeKey: 'biz_reg' }] });
  assert.equal(docs.length, 1 + listCaseFiles(CASE, 'submission').length);
  assert.equal(docs[0].source_document, '회사서류.pdf');
});

test('🔴 POST /api/cases/{id}/files — PDF 를 올리면 규칙으로 갈래를 정하고 제출 검사를 다시 돌려 파일제출 탭이 「준비됨」이 된다', async () => {
  seedCase();
  mockSolar();
  const before = await nativeFetch(`${base}/api/cases/${CASE}`).then((r) => r.json());
  assert.equal(itemOf(before, REQ_NAME).state, 'missing');

  const res = await upload(CASE, { buffer: fs.readFileSync(SAMPLE_PDF), filename: '사업자등록증_다온피엠씨_가상.pdf', requirement: REQ_NAME });
  assert.equal(res.status, 200);
  const f = await res.json();
  assert.equal(f.status, 'done');
  const item = itemOf(f, REQ_NAME);
  assert.equal(item.state, 'done');
  assert.equal(item.filename, '사업자등록증_다온피엠씨_가상.pdf');
  assert.equal(item.label, '준비됨');

  // Solar 는 검사 1회만 — 규칙은 저장본, 제안서가 없으니 스캔도 없다
  assert.deepEqual(calls.map((c) => c.key), ['SUBMISSION_AUDIT_V1']);
  assert.ok(calls[0].user.includes('"uploaded_for": "사업자등록증 및 법인등기부등본"'), '올린 파일이 어느 서류용인지 검사에 실려 간다');

  const files = listCaseFiles(CASE, 'submission');
  assert.equal(files.length, 1);
  assert.equal(files[0].docTypeKey, 'biz_reg', 'PDF 텍스트로 갈래를 정한다 (Studio 호출 없음)');
  assert.equal(files[0].requirementName, REQ_NAME);
  assert.ok(fs.existsSync(files[0].storagePath), '파일이 디스크에 남는다');
  assert.ok(files[0].storagePath.includes(path.join('data', 'uploads', CASE)));

  // GET 봉투도 같은 상태 (DB 에 저장됐다)
  const again = await nativeFetch(`${base}/api/cases/${CASE}`).then((r) => r.json());
  assert.equal(itemOf(again, REQ_NAME).state, 'done');
  assert.ok(again.meta.pipeline.rejudgedAt);
});

test('POST files — PDF 가 아니면 갈래 없이 저장하고(읽지 못했다고 적는다) 검사는 돈다', async () => {
  seedCase();
  mockSolar();
  const res = await upload(CASE, { buffer: Buffer.from('%HWP not a pdf'), filename: '공동수급협정서.hwp', mimeType: 'application/x-hwp', requirement: '공동수급협정서' });
  assert.equal(res.status, 200);
  const files = listCaseFiles(CASE, 'submission');
  const hwp = files.find((x) => x.filename === '공동수급협정서.hwp');
  assert.equal(hwp.docTypeKey, null);
  assert.equal(calls.length, 1);
});

test('POST files — requirement 없이 드롭존에 떨어뜨린 파일도 받는다', async () => {
  seedCase();
  mockSolar();
  const res = await upload(CASE, { buffer: fs.readFileSync(SAMPLE_PDF), filename: '사업자등록증.pdf' });
  assert.equal(res.status, 200);
  const f = listCaseFiles(CASE, 'submission').find((x) => x.filename === '사업자등록증.pdf');
  assert.equal(f.requirementName, null);
  assert.equal(f.docTypeKey, 'biz_reg');
});

test('POST files — 파일이 없으면 400, 없는 케이스면 404', async () => {
  const r1 = await upload(CASE, { requirement: 'x' });
  assert.equal(r1.status, 400);
  assert.equal((await r1.json()).error.code, 'E_FILE_REQUIRED');
  const r2 = await upload('R25NOPE0000000-000', { buffer: Buffer.from('%PDF-'), filename: 'a.pdf' });
  assert.equal(r2.status, 404);
  assert.equal((await r2.json()).error.code, 'E_CASE_NOT_FOUND');
});

test('GET /api/cases/{id}/files — 올린 파일 목록', async () => {
  const res = await nativeFetch(`${base}/api/cases/${CASE}/files`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.files));
  assert.ok(body.files.every((f) => f.filename && f.kind === 'submission' && !('storagePath' in f)), '저장 경로는 밖으로 내보내지 않는다');
});
