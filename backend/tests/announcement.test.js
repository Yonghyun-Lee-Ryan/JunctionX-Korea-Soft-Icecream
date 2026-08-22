import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env } from '../src/config/env.js';
import { mergeAnnouncement, decomposeAnnouncement } from '../src/services/announcement.service.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const rfpParts = {
  overview: fx('01_overview.rfp.json'),
  scopeContext: fx('02_scope_context.rfp.json'),
  requirements: fx('03_requirements.rfp.json'),
  eligibilitySubmission: fx('04_eligibility_submission.rfp.json'),
  conditionsEvaluation: fx('05_conditions_evaluation.rfp.json'),
};
const noticeParts = { eligibilitySubmission: fx('04_eligibility_submission.notice.json') };

// ── Studio mock — /v2/files · /v2/responses · /v2/responses/{id} ────────────
//    agentId × 올린 파일 이름으로 어느 fixture 를 돌려줄지 정한다
const nativeFetch = globalThis.fetch;
const MOCK = 'https://mock-studio.invalid';
const AGENTS = {
  overview: 'agt_01', scopeContext: 'agt_02', requirements: 'agt_03', eligibilitySubmission: 'agt_04', conditionsEvaluation: 'agt_05',
};
const REPLY = {
  agt_01: () => rfpParts.overview,
  agt_02: () => rfpParts.scopeContext,
  agt_03: () => rfpParts.requirements,
  agt_04: (filename) => (filename.includes('공고') ? noticeParts.eligibilitySubmission : rfpParts.eligibilitySubmission),
  agt_05: () => rfpParts.conditionsEvaluation,
};
let studioCalls;
function mockStudio() {
  studioCalls = { uploads: [], jobs: [], authHeaders: new Set() };
  const files = new Map();
  const jobs = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith(MOCK)) return nativeFetch(url, init);
    studioCalls.authHeaders.add(init.headers?.Authorization ?? '(none)');
    if (u.endsWith('/v2/files')) {
      const file = init.body.get('file');
      const id = `file_${files.size + 1}`;
      files.set(id, file.name);
      studioCalls.uploads.push(file.name);
      return Response.json({ id, bytes: file.size });
    }
    if (u.endsWith('/v2/responses')) {
      const body = JSON.parse(init.body);
      const fileId = body.input[0].content[0].file_id;
      const id = `job_${jobs.size + 1}`;
      jobs.set(id, { agentId: body.model, filename: files.get(fileId) });
      studioCalls.jobs.push({ agentId: body.model, filename: files.get(fileId) });
      return Response.json({ id, status: 'in_progress' });
    }
    const m = u.match(/\/v2\/responses\/(job_\d+)$/);
    if (m) {
      const { agentId, filename } = jobs.get(m[1]);
      const data = REPLY[agentId](filename);
      return Response.json({
        id: m[1], status: 'completed',
        output: [{ type: 'message', model: agentId, content: [{ type: 'output_text', text: JSON.stringify(data), additional_values: { cache_hit: false } }] }],
      });
    }
    throw new Error(`unexpected studio call: ${u}`);
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });

// 🔴 내 층(공고 해부·회사 카드·Solar)은 정운 계정 키(UPSTAGE_AGENT_API_KEY)를 쓴다 — 기존 /api/docs 의 UPSTAGE_API_KEY 와 다르다
env.studio.apiKey = 'other-team-key';
env.studio.agentApiKey = 'agent-test-key';
env.studio.baseUrl = MOCK;
env.studio.pollIntervalMs = 0;
Object.assign(env.studio.agents, Object.fromEntries(Object.entries(AGENTS).map(([k, id]) => [k, { agentId: id, configId: '1' }])));

const rfpFile = { buffer: Buffer.from('%HWP rfp'), filename: '제안요청서.hwp', mimeType: 'application/x-hwp' };
const noticeFile = { buffer: Buffer.from('%HWP notice'), filename: '입찰공고서_재공고.hwp', mimeType: 'application/x-hwp' };

// ── 병합 규칙 ───────────────────────────────────────────────────────────
test('mergeAnnouncement — 마감·방식은 공고서가 이기고, 분량은 제안요청서에서', () => {
  const m = mergeAnnouncement({ rfp: rfpParts, notice: noticeParts });
  assert.equal(m.schema_version, 'ANNOUNCEMENT_CORE_V1');
  assert.equal(m.constraint_deadline, '2026. 08. 24(월) 10:30');
  assert.ok(m.constraint_method.includes('전자입찰'));
  assert.equal(m.constraint_page_limit, '100페이지 이내로 작성 권고');
  assert.equal(m.constraint_summary_page_limit, '50페이지 이내로 작성 권고');
  assert.equal(m.constraint_source_doc, 'notice');
  assert.equal(m.procurement_project_name, 'AX 진단-컨설팅 통합 서비스 개발');
});

test('mergeAnnouncement — 부수 오귀속: COMPLETION 산출물 부수와 같으면 버린다 (「최종보고서 5부」)', () => {
  const m = mergeAnnouncement({ rfp: rfpParts, notice: noticeParts });
  assert.equal(m.constraint_proposal_copies, '');
  assert.ok(m._warnings.some((w) => w.includes('최종보고서')), '버린 이유를 남긴다');
});

test('mergeAnnouncement — 자격·제출물은 합치고 행마다 source_doc, 요구사항은 제안요청서만', () => {
  const m = mergeAnnouncement({ rfp: rfpParts, notice: noticeParts });
  const noticeRules = noticeParts.eligibilitySubmission.eligibility_rules.length;
  const rfpRules = rfpParts.eligibilitySubmission.eligibility_rules.length;
  assert.ok(m.eligibility_rules.length >= noticeRules && m.eligibility_rules.length <= noticeRules + rfpRules);
  assert.equal(m.eligibility_rules[0].source_doc, 'notice', '공고서 행이 앞에');
  assert.ok(m.eligibility_rules.every((r) => r.source_doc === 'notice' || r.source_doc === 'rfp'));
  assert.ok(m.submission_requirements.every((r) => r.source_doc));
  assert.equal(m.requirements.length, 33);
  assert.equal(m.requirement_count, 33);
  assert.equal(m.scope_items.length, 32);
  assert.ok(m.evaluation_items.length > 0);
});

test('mergeAnnouncement — 공고서가 없어도 제안요청서만으로 만든다', () => {
  const m = mergeAnnouncement({ rfp: rfpParts });
  assert.equal(m.constraint_deadline, '');
  assert.equal(m.constraint_page_limit, '100페이지 이내로 작성 권고');
  assert.equal(m.eligibility_rules.length, rfpParts.eligibilitySubmission.eligibility_rules.length);
  assert.equal(m.constraint_source_doc, 'rfp');
});

// ── Studio 호출 ─────────────────────────────────────────────────────────
test('decomposeAnnouncement — 제안요청서는 5 Agent 에 같은 file_id 로, 공고서는 04 에만', async () => {
  mockStudio();
  const out = await decomposeAnnouncement({ rfp: rfpFile, notice: noticeFile });
  assert.deepEqual(studioCalls.uploads, ['제안요청서.hwp', '입찰공고서_재공고.hwp']);
  assert.equal(studioCalls.jobs.length, 6);
  assert.equal(studioCalls.jobs.filter((j) => j.filename === '제안요청서.hwp').length, 5);
  assert.deepEqual(studioCalls.jobs.filter((j) => j.filename === '입찰공고서_재공고.hwp').map((j) => j.agentId), ['agt_04']);
  assert.equal(out.requirements.length, 33);
  assert.equal(out.constraint_deadline, '2026. 08. 24(월) 10:30');
  assert.equal(out.meta.source, 'studio');
  assert.equal(out.meta.jobs.length, 6);
  assert.equal(out.meta.cached, false);
  assert.deepEqual([...studioCalls.authHeaders], ['Bearer agent-test-key'], '업로드·실행·폴링 전부 정운 계정 키로');
});

test('decomposeAnnouncement — 키가 없으면 fixtures/studio 로 폴백하고 cached 를 밝힌다', async () => {
  const saved = env.studio.agentApiKey;
  env.studio.agentApiKey = '';
  try {
    const out = await decomposeAnnouncement({ rfp: rfpFile, notice: noticeFile });
    assert.equal(out.meta.source, 'fixture');
    assert.equal(out.meta.cached, true);
    assert.equal(out.requirements.length, 33);
    assert.equal(out.constraint_deadline, '2026. 08. 24(월) 10:30');
  } finally {
    env.studio.agentApiKey = saved;
  }
});

test('decomposeAnnouncement — Agent ID 가 비어 있으면 E_AGENT_NOT_SET 으로 어느 변수인지 말한다', async () => {
  mockStudio();
  const saved = env.studio.agents.requirements;
  env.studio.agents.requirements = { agentId: '', configId: '' };
  try {
    await assert.rejects(decomposeAnnouncement({ rfp: rfpFile }), (e) => e.code === 'E_AGENT_NOT_SET' && e.message.includes('REQUIREMENTS'));
  } finally {
    env.studio.agents.requirements = saved;
  }
});

// ── HTTP ────────────────────────────────────────────────────────────────
migrate();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

function multipart(files) {
  const form = new FormData();
  for (const [field, f] of Object.entries(files)) form.append(field, new Blob([f.buffer], { type: f.mimeType }), f.filename);
  return nativeFetch(`${base}/api/announcements/decompose`, { method: 'POST', body: form });
}

test('POST /api/announcements/decompose — rfp + notice 멀티파트 → ANNOUNCEMENT_CORE_V1', async () => {
  mockStudio();
  const res = await multipart({ rfp: rfpFile, notice: noticeFile });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.schema_version, 'ANNOUNCEMENT_CORE_V1');
  assert.equal(body.requirements.length, 33);
  assert.equal(body.constraint_source_doc, 'notice');
  assert.equal(body.meta.source, 'studio');
});

test('POST /api/announcements/decompose — rfp 가 없으면 400', async () => {
  const res = await multipart({ notice: noticeFile });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'E_FILE_REQUIRED');
  assert.ok(body.error.message.includes('rfp'));
});
