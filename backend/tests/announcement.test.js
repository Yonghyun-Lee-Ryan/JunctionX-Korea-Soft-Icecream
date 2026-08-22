import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env } from '../src/config/env.js';
import { mergeAnnouncement, decomposeAnnouncement } from '../src/services/announcement.service.js';
import { clearStudioResults } from '../src/repositories/studioResult.repo.js';

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
// classifyOnly: 이 Agent 들은 Classify 가 OTHER_REVIEW_REQUIRED 로 갈라 Extract 를 안 탄다 (실측: PG 대행 용역 RFP 에서 01·02·03·05)
function mockStudio({ classifyOnly = new Set(), neverComplete = false, knownJobs = new Map() } = {}) {
  studioCalls = { uploads: [], jobs: [], jobIds: new Map(), authHeaders: new Set() };
  const files = new Map();
  const jobs = new Map(knownJobs);   // 지난 mock 이 시작한 job — 이어받기 검증용
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
      const id = `job_${process.pid}_${Date.now()}_${jobs.size + 1}`;
      jobs.set(id, { agentId: body.model, filename: files.get(fileId) });
      studioCalls.jobIds.set(id, jobs.get(id));
      studioCalls.jobs.push({ agentId: body.model, filename: files.get(fileId) });
      return Response.json({ id, status: 'in_progress' });
    }
    const m = u.match(/\/v2\/responses\/(job_[\w]+)$/);
    if (m) {
      if (neverComplete) return Response.json({ id: m[1], status: 'in_progress' });
      const { agentId, filename } = jobs.get(m[1]);
      if (classifyOnly.has(agentId)) {
        return Response.json({
          id: m[1], status: 'completed',
          output: [{ type: 'message', model: 'step_2_classify', content: [{ type: 'output_text', text: 'OTHER_REVIEW_REQUIRED', additional_values: { previous_step_name: 'step_1_parse', cache_hit: false } }] }],
        });
      }
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

// ── 부분 추출 · Studio 결과 캐시 ───────────────────────────────────────────
const unique = (tag) => ({ buffer: Buffer.from(`%HWP ${tag} ${process.pid} ${Date.now()}`), filename: `${tag}.hwp`, mimeType: 'application/x-hwp' });

test('decomposeAnnouncement — 일부 Agent 가 분류만 하고 추출을 안 해도 나머지로 병합하고 meta.unextracted 에 남긴다', async () => {
  mockStudio({ classifyOnly: new Set(['agt_01', 'agt_02', 'agt_03', 'agt_05']) });
  const out = await decomposeAnnouncement({ rfp: unique('제안요청서-부분'), notice: unique('입찰공고문-부분') });
  assert.equal(out.requirements.length, 0, '03 이 추출을 안 했다');
  assert.ok(out.eligibility_rules.length > 0, '04 는 추출했다');
  assert.equal(out.constraint_deadline, '2026. 08. 24(월) 10:30');
  assert.equal(out.meta.partial, true);
  assert.deepEqual(out.meta.unextracted, [
    { key: 'overview', doc: 'rfp', classification: 'OTHER_REVIEW_REQUIRED' },
    { key: 'scopeContext', doc: 'rfp', classification: 'OTHER_REVIEW_REQUIRED' },
    { key: 'requirements', doc: 'rfp', classification: 'OTHER_REVIEW_REQUIRED' },
    { key: 'conditionsEvaluation', doc: 'rfp', classification: 'OTHER_REVIEW_REQUIRED' },
  ]);
  assert.equal(out.meta.studioRuns, 6);
});

test('decomposeAnnouncement — 전부 분류만 하면 E_ANNOUNCEMENT_UNREADABLE 로 어느 갈래였는지 말한다', async () => {
  mockStudio({ classifyOnly: new Set(['agt_01', 'agt_02', 'agt_03', 'agt_04', 'agt_05']) });
  await assert.rejects(decomposeAnnouncement({ rfp: unique('제안요청서-전부') }), (e) =>
    e.code === 'E_ANNOUNCEMENT_UNREADABLE' && e.message.includes('OTHER_REVIEW_REQUIRED'));
});

test('🔴 Studio 결과 캐시 — 같은 파일·같은 Agent 는 다시 돌리지 않는다 (업로드도 없다)', async () => {
  mockStudio();
  const rfp = unique('제안요청서-캐시');
  const notice = unique('입찰공고문-캐시');
  const first = await decomposeAnnouncement({ rfp, notice });
  assert.equal(studioCalls.jobs.length, 6);
  assert.equal(first.meta.studioRuns, 6);

  mockStudio();
  const second = await decomposeAnnouncement({ rfp, notice });
  assert.equal(studioCalls.uploads.length, 0);
  assert.equal(studioCalls.jobs.length, 0);
  assert.equal(second.meta.studioRuns, 0);
  assert.ok(second.meta.jobs.every((j) => j.fromCache === true));
  assert.deepEqual(second.requirements, first.requirements);
  assert.equal(second.constraint_deadline, first.constraint_deadline);
});

test('Studio 결과 캐시 — 분류만 한 결과는 캐시하지 않는다 (갈래를 고친 뒤 다시 돌 수 있게)', async () => {
  const rfp = unique('제안요청서-부분캐시');
  mockStudio({ classifyOnly: new Set(['agt_03']) });
  const first = await decomposeAnnouncement({ rfp });
  assert.equal(first.requirements.length, 0);

  mockStudio();
  const second = await decomposeAnnouncement({ rfp });
  assert.deepEqual(studioCalls.jobs.map((j) => j.agentId), ['agt_03'], '03 만 다시 돈다');
  assert.equal(second.requirements.length, 33);
  assert.equal(second.meta.partial, false);
});

test('🔴 폴링 예산을 넘겨 놓친 job 은 다음 실행에서 새로 사지 않고 이어서 기다린다', async () => {
  const rfp = unique('제안요청서-이어받기');
  // 1회차: job 은 시작됐지만 완료되지 않는다 → E_STUDIO_TIMEOUT
  mockStudio({ neverComplete: true });
  const savedTimeout = env.studio.pollTimeoutMs;
  env.studio.pollTimeoutMs = 30;
  try {
    await assert.rejects(decomposeAnnouncement({ rfp }), (e) => e.code === 'E_STUDIO_TIMEOUT');
  } finally {
    env.studio.pollTimeoutMs = savedTimeout;
  }
  const startedJobs = studioCalls.jobs.map((j) => j.agentId);
  assert.equal(startedJobs.length, 5);

  // 2회차: 같은 파일 — 업로드도 실행도 없이 그 job 들을 다시 폴링해 결과를 받는다
  mockStudio({ knownJobs: studioCalls.jobIds });
  const out = await decomposeAnnouncement({ rfp });
  assert.equal(studioCalls.uploads.length, 0, '다시 올리지 않는다');
  assert.equal(studioCalls.jobs.length, 0, '다시 사지 않는다');
  assert.equal(out.requirements.length, 33);
  assert.equal(out.meta.studioRuns, 0);
  assert.ok(out.meta.jobs.every((j) => j.resumed === true));
});

// ── HTTP ────────────────────────────────────────────────────────────────
migrate();
clearStudioResults(); // 🔴 테스트 DB 는 실행 간에 남는다 — 지난 실행의 캐시가 「6 job」 검증을 가리지 않게
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
