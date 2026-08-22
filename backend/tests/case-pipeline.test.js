import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env } from '../src/config/env.js';
import * as companyRepo from '../src/repositories/company.repo.js';
import * as caseRepo from '../src/repositories/case.repo.js';
import { pickDocuments, companyCardFor, isFresh, PIPELINE_TTL_MS } from '../src/services/casePipeline.service.js';
import { clearStudioResults } from '../src/repositories/studioResult.repo.js';

const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const rfpParts = {
  agt_01: fx('01_overview.rfp.json'), agt_02: fx('02_scope_context.rfp.json'), agt_03: fx('03_requirements.rfp.json'),
  agt_04: fx('04_eligibility_submission.rfp.json'), agt_05: fx('05_conditions_evaluation.rfp.json'),
};
const noticePart = fx('04_eligibility_submission.notice.json');
const flatCard = fx('company_card.flat.json');

// ── 나라장터 · Studio · Solar 를 한 fetch 에서 가른다 ────────────────────────
const nativeFetch = globalThis.fetch;
const MOCK = 'https://mock-studio.invalid';
env.studio.apiKey = 'team-key';
env.studio.agentApiKey = 'agent-test-key';
env.studio.baseUrl = MOCK;
env.studio.pollIntervalMs = 0;
env.solar.apiKey = 'agent-test-key';
Object.assign(env.studio.agents, {
  overview: { agentId: 'agt_01' }, scopeContext: { agentId: 'agt_02' }, requirements: { agentId: 'agt_03' },
  eligibilitySubmission: { agentId: 'agt_04' }, conditionsEvaluation: { agentId: 'agt_05' },
});

// 실측: R25BK00645031 첨부 5건 (HWP 4 + HWPX 1)
const G2B_FILES = ['입찰공고문(체육진흥투표권사업 온라인발매 결제서비스(PG) 대행 용역).hwp', '제안요청서.hwp', '계약이행특수조건.hwp'];
const elig1 = noticePart.eligibility_rules[0];

const solarReplies = {
  ELIGIBILITY_SCREENING_V1: () => ({
    agent: 'ELIGIBILITY_SCREENING_V1', verdict: '추천', headline: '참가자격 1개 확인 — 충족',
    checks: [{ rule_id: elig1.rule_id, label: '중소기업확인서', status: '충족', gate_level: 'HARD_GATE', mandatory: 'YES', announcement_page: elig1.source_page, company_source_document: '중소기업확인서_다온피엠씨_가상.pdf' }],
    exclusion_reasons: [], unverified_items: [],
  }),
  WPS_CP_V1: () => ({ agent: 'WPS_CP_V1', decompositions: [] }),
  WBS_V1: () => ({
    agent: 'WBS_V1',
    work_packages: [
      { wbs_id: '1.1', name: '착수', deliverable: '사업 수행 계획서', predecessors: [], duration: '', effort_mm: [{ grade: '특급', mm: 0.5 }], requirement_refs: ['SFR-001'], source_page: 13 },
      { wbs_id: '1.2', name: '분석', deliverable: '분석서', predecessors: ['1.1'], duration: '착수 후 4주', effort_mm: [{ grade: '고급', mm: 1.5 }], requirement_refs: ['SFR-002'], source_page: 13 },
    ],
    validation: {},
  }),
  CRITICAL_PATH_COST_V1: () => ({
    agent: 'CRITICAL_PATH_COST_V1',
    critical_path: [{ item: '조달청 전자입찰 참가자격 등록', lead_time_days: 7, blocking_reason: '개찰일 전일까지', source_page: 1 }],
    cost_estimate: { references: [{ label: '추정가격', page: 1 }] },
  }),
  SUBMISSION_RULES_V2: () => ({ agent: 'SUBMISSION_RULES_V2', required_documents: [], default_forbidden_expressions: ['가능하다'] }),
  SUBMISSION_AUDIT_V1: () => ({
    agent: 'SUBMISSION_AUDIT_V1', overall_status: 'PASS',
    submission_constraints: { method: '전자입찰', deadline: '2026. 08. 24(월) 10:30', proposal_copies: '', page_limit: '', price_proposal_sealed: '', source_page: 1 },
    documents: [
      { name: '입찰참가신청서', copies: '1', validity: '', status: '준비됨', rework_note: '', lead_time: '', matched_file: '사업자등록증_다온피엠씨_가상.pdf', source_page: 4 },
      { name: '실적증명서', copies: '1', validity: '발급 30일 내', status: '보완 필요', rework_note: '발급일이 30일을 넘겼습니다', lead_time: '', matched_file: '', source_page: 36 },
    ],
    rework_requests: [], forbidden_expressions: { count: 0, rule_note: '', items: [] }, uncovered_requirement_ids: [], summary: {},
  }),
};

let calls;
function mockAll({ solarStatus = 200, g2bFiles = G2B_FILES, classifyOnly = new Set() } = {}) {
  calls = { g2b: 0, studioJobs: [], solar: [] };
  const files = new Map();
  const jobs = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith(env.g2b.downloadUrl)) {
      calls.g2b += 1;
      const params = new URL(u).searchParams;
      const seq = Number(params.get('fileSeq'));
      const name = g2bFiles[seq - 1];
      if (!name) return new Response('없음', { status: 422 });
      // 🔴 공고마다 파일 내용이 다르다 — 같은 내용이면 Studio 결과 캐시가 맞아 다른 케이스의 결과를 재사용해 버린다
      return new Response(Buffer.from(`%HWP ${name} ${params.get('bidPbancNo')}`), {
        status: 200, headers: { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` },
      });
    }
    if (u.startsWith(MOCK)) {
      if (u.endsWith('/v2/files')) {
        const file = init.body.get('file');
        const id = `file_${files.size + 1}`;
        files.set(id, file.name);
        return Response.json({ id, bytes: file.size });
      }
      if (u.endsWith('/v2/responses')) {
        const body = JSON.parse(init.body);
        const id = `job_${jobs.size + 1}`;
        const filename = files.get(body.input[0].content[0].file_id);
        jobs.set(id, { agentId: body.model, filename });
        calls.studioJobs.push({ agentId: body.model, filename });
        return Response.json({ id, status: 'in_progress' });
      }
      const m = u.match(/\/v2\/responses\/(job_\d+)$/);
      const { agentId, filename } = jobs.get(m[1]);
      if (classifyOnly.has(agentId)) {
        return Response.json({ id: m[1], status: 'completed', output: [{ type: 'message', model: 'step_2_classify', content: [{ type: 'output_text', text: 'OTHER_REVIEW_REQUIRED', additional_values: {} }] }] });
      }
      const data = agentId === 'agt_04' && filename.includes('공고') ? noticePart : rfpParts[agentId];
      return Response.json({ id: m[1], status: 'completed', output: [{ type: 'message', model: agentId, content: [{ type: 'output_text', text: JSON.stringify(data), additional_values: {} }] }] });
    }
    if (u.startsWith(env.solar.chatUrl)) {
      const body = JSON.parse(init.body);
      const key = Object.keys(solarReplies).find((k) => body.messages[0].content.includes(`"agent": "${k}"`));
      calls.solar.push(key);
      if (solarStatus !== 200) return new Response('{"error":"boom"}', { status: solarStatus });
      return Response.json({ choices: [{ message: { content: JSON.stringify(solarReplies[key]()) } }] });
    }
    return nativeFetch(url, init);
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });

// ── 회사 한 곳 (다온피엠씨 · 실물 8장의 추출값) ─────────────────────────────
migrate();
clearStudioResults(); // 🔴 지난 실행의 Studio 캐시가 job 수 검증을 가리지 않게
const COMPANY = 'co_pipeline_test';
companyRepo.upsertCompany({ id: COMPANY, name: '주식회사 다온피엠씨', bizNo: '120-86-01230', card: { savedAt: '2026-08-23T00:00:00Z' } });
companyRepo.replaceCompanyDocuments(COMPANY, flatCard.documents.map((d, i) => ({
  id: `doc_${i}`, filename: d.source_document, doc_class: ['tech_staff', 'pia_designation', 'credit_rating', 'sw_business', 'financial', 'sme_cert', 'performance', 'biz_reg'][i],
  bytes: 1000, confidence: 'high', extracted_json: JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'source_document'))),
})));

const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const post = (body) => nativeFetch(`${base}/api/cases`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = (caseId) => nativeFetch(`${base}/api/cases/${caseId}`).then((r) => r.json());
async function waitDone(caseId, { timeoutMs = 5000 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const f = await get(caseId);
    if (f.status === 'done' || f.status === 'failed') return f;
    if (Date.now() > until) throw new Error(`timeout: status=${f.status} progress=${JSON.stringify(f.progress)}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// ── 순수 함수 ─────────────────────────────────────────────────────────────
test('pickDocuments — 첨부 5건에서 제안요청서와 입찰공고문을 고른다, 나머지는 others', () => {
  const names = [...G2B_FILES, '개인정보처리위탁특수조건.hwp', '[별첨 1] 공동수급표준협정서(공동이행방식).hwpx'];
  const picked = pickDocuments(names.map((filename, i) => ({ fileSeq: i + 1, filename, buffer: Buffer.from('x'), bytes: 1 })));
  assert.equal(picked.rfp.filename, '제안요청서.hwp');
  assert.ok(picked.notice.filename.startsWith('입찰공고문'));
  assert.equal(picked.others.length, 3);
});

test('pickDocuments — 이름으로 못 고르면 가장 큰 문서가 제안요청서, 문서가 없으면 null', () => {
  const picked = pickDocuments([
    { fileSeq: 1, filename: '붙임.zip', buffer: Buffer.alloc(9), bytes: 9 },
    { fileSeq: 2, filename: '입찰유의서.pdf', buffer: Buffer.alloc(3), bytes: 3 },
    { fileSeq: 3, filename: '별첨서식.hwp', buffer: Buffer.alloc(5), bytes: 5 },
  ]);
  assert.equal(picked.rfp.filename, '별첨서식.hwp');
  assert.equal(picked.notice, null);
  assert.equal(pickDocuments([{ fileSeq: 1, filename: '붙임.zip', buffer: Buffer.alloc(9), bytes: 9 }]).rfp, null);
});

test('companyCardFor — 저장된 회사 서류를 판정용 COMPANY_CARD_V1 로 (source_document·docTypeKey 포함)', () => {
  const card = companyCardFor(COMPANY);
  assert.equal(card.schema_version, 'COMPANY_CARD_V1');
  assert.equal(card.company_name, '주식회사 다온피엠씨');
  assert.equal(card.business_number, '120-86-01230');
  assert.equal(card.documents.length, 8);
  const biz = card.documents.find((d) => d.docTypeKey === 'biz_reg');
  assert.equal(biz.source_document, '사업자등록증_다온피엠씨_가상.pdf');
  assert.equal(biz.representative, '강민서');
  assert.equal(companyCardFor('co_nope'), null);
  assert.equal(companyCardFor(null), null);
});

test('isFresh — 7일 안이면 재실행하지 않는다', () => {
  const now = Date.parse('2026-08-23T00:00:00Z');
  assert.equal(isFresh({ pipeline: { ranAt: '2026-08-22T00:00:00Z' } }, now), true);
  assert.equal(isFresh({ pipeline: { ranAt: '2026-08-15T00:00:00Z' } }, now), false);
  assert.equal(isFresh({}, now), false);
  assert.equal(PIPELINE_TTL_MS, 7 * 24 * 3600 * 1000);
});

// ── HTTP 흐름 — 첨부 수집 → 공고 해부 → 판정 → 탭 ───────────────────────────
test('POST /api/cases → 202 → 파이프라인이 돌아 GET 봉투에 탭 9개·verdict·진행 4줄 done', async () => {
  mockAll();
  // 🔴 테스트 DB 는 실행 간에 남는다 — 지난 실행의 7일 캐시에 걸리지 않게 refresh 로 시작한다
  const res = await post({ bidPbancNo: 'R25TEST00000001', companyId: COMPANY, refresh: true });
  assert.equal(res.status, 202);
  const first = await res.json();
  assert.equal(first.status, 'collecting');
  assert.equal(first.progress.length, 4);

  const f = await waitDone('R25TEST00000001-000');
  assert.equal(f.status, 'done', JSON.stringify(f.error));
  assert.deepEqual(f.progress.map((p) => p.state), ['done', 'done', 'done', 'done']);
  assert.deepEqual(f.tabs.map((t) => t.id), ['submitfiles', 'compliance', 'wbs', 'criticalpath', 'cost', 'constraints', 'checklist', 'rework', 'phrases']);
  assert.equal(f.tabs.find((t) => t.id === 'compliance').rows.length, 33);
  assert.equal(f.tabs.find((t) => t.id === 'cost').metric.value, '2.0');
  assert.equal(f.verdict.badge, 'eligible');
  assert.equal(f.verdict.reasons.length, 1);
  assert.equal(f.downloads.length, 2);
  assert.equal(f.title, 'AX 진단-컨설팅 통합 서비스 개발', '헤더용 제목은 공고 해부에서');
  assert.equal(f.org, '한국과학기술정보연구원');
  assert.equal(f.deadline, '2026. 08. 24(월) 10:30');
  assert.equal(f.meta.cached, false);
  assert.equal(f.meta.pipeline.source, 'studio+solar');
  assert.ok(f.meta.pipeline.ranAt);
  assert.equal(f.meta.attachments.length, 3);

  // 🔴 호출 수 — 제안요청서 5 + 입찰공고문 1 (Studio) · 자격 1 + 계획 3 + 제출 2 (Solar, 제안서 없음)
  assert.equal(calls.studioJobs.length, 6);
  assert.deepEqual([...calls.solar].sort(), ['CRITICAL_PATH_COST_V1', 'ELIGIBILITY_SCREENING_V1', 'SUBMISSION_AUDIT_V1', 'SUBMISSION_RULES_V2', 'WBS_V1', 'WPS_CP_V1']);
});

test('🔴 크레딧 — 7일 안에 같은 케이스를 다시 열면 Upstage 를 부르지 않는다, refresh 면 다시 돈다', async () => {
  mockAll();
  const res = await post({ bidPbancNo: 'R25TEST00000001', companyId: COMPANY });
  assert.equal(res.status, 200, '이미 끝난 케이스는 202 가 아니라 200 으로 그대로');
  const f = await res.json();
  assert.equal(f.status, 'done');
  assert.equal(f.tabs.length, 9);
  assert.equal(f.meta.pipeline.reused, true);
  assert.equal(calls.g2b, 0);
  assert.equal(calls.studioJobs.length, 0);
  assert.equal(calls.solar.length, 0);

  const again = await post({ bidPbancNo: 'R25TEST00000001', companyId: COMPANY, refresh: true });
  assert.equal(again.status, 202);
  const g = await waitDone('R25TEST00000001-000');
  assert.equal(g.status, 'done');
  // 🔴 refresh 는 판정(Solar)만 다시 돈다 — 공고 파일이 그대로면 Studio 결과는 캐시에서 (무료 실행 10회를 지킨다)
  assert.equal(calls.studioJobs.length, 0);
  assert.equal(calls.solar.length, 6);
  assert.equal(g.meta.pipeline.studioRuns, 0);
  assert.equal(g.meta.pipeline.studioJobs, 6);
  assert.ok(calls.g2b >= 4);
});

test('회사가 없으면 자격·제출 판정은 건너뛰고 공고·계획 탭만 — 파일제출은 전부 「업로드」', async () => {
  mockAll();
  await post({ bidPbancNo: 'R25TEST00000002', refresh: true });
  const f = await waitDone('R25TEST00000002-000');
  assert.equal(f.status, 'done', JSON.stringify(f.error));
  assert.deepEqual(f.tabs.map((t) => t.id), ['submitfiles', 'compliance', 'wbs', 'criticalpath', 'cost', 'constraints']);
  assert.ok(f.tabs.find((t) => t.id === 'submitfiles').items.every((i) => i.state === 'missing'));
  assert.deepEqual([...calls.solar].sort(), ['CRITICAL_PATH_COST_V1', 'WBS_V1', 'WPS_CP_V1']);
  assert.equal(f.verdict.badge, 'eligible');
});

test('🔴 일부 Agent 가 추출을 안 하면(실측: 용역 RFP) 있는 것으로만 판정하고 빠진 탭·이유를 남긴다', async () => {
  mockAll({ classifyOnly: new Set(['agt_01', 'agt_02', 'agt_03', 'agt_05']) });
  await post({ bidPbancNo: 'R25TEST00000005', companyId: COMPANY, refresh: true });
  const f = await waitDone('R25TEST00000005-000');
  assert.equal(f.status, 'done', JSON.stringify(f.error));
  assert.equal(f.meta.cached, false, '부분 성공은 실패가 아니다 — fixture 로 떨어지지 않는다');
  assert.deepEqual(f.tabs.map((t) => t.id), ['submitfiles', 'compliance', 'constraints', 'checklist', 'rework', 'phrases']);
  assert.equal(f.tabs.find((t) => t.id === 'compliance').rows.length, 0, '요구사항은 못 읽었다 — 0건으로 «그려진다»가 아니라 비어 있다');
  assert.deepEqual(f.meta.pipeline.partial, ['overview', 'scopeContext', 'requirements', 'conditionsEvaluation']);
  assert.ok(f.progress[1].detail.includes('미추출 4'), f.progress[1].detail);
  assert.deepEqual([...calls.solar].sort(), ['ELIGIBILITY_SCREENING_V1', 'SUBMISSION_AUDIT_V1', 'SUBMISSION_RULES_V2'], '요구사항이 없으면 계획(WBS)은 돌리지 않는다');
  assert.equal(f.verdict.badge, 'eligible');
  assert.equal(f.title ?? '', '', '개요를 못 읽었으면 제목도 지어내지 않는다');
});

test('판정이 실패하면 케이스는 failed 고 어느 단계에서 죽었는지 남는다', async () => {
  mockAll({ solarStatus: 500 });
  await post({ bidPbancNo: 'R25TEST00000003', companyId: COMPANY });
  const f = await waitDone('R25TEST00000003-000');
  assert.equal(f.status, 'failed');
  assert.equal(f.error.code, 'E_UPSTREAM_SOLAR');
  assert.deepEqual(f.progress.map((p) => p.state), ['done', 'done', 'done', 'failed']);
  assert.equal(f.tabs.length, 0);
});

test('제안요청서를 첨부에서 못 찾으면 E_RFP_NOT_FOUND 로 실패한다', async () => {
  mockAll({ g2bFiles: ['붙임.zip'] });
  await post({ bidPbancNo: 'R25TEST00000004', companyId: COMPANY });
  const f = await waitDone('R25TEST00000004-000');
  assert.equal(f.status, 'failed');
  assert.equal(f.error.code, 'E_RFP_NOT_FOUND');
  assert.equal(calls.studioJobs.length, 0);
});

test('🔴 데모 케이스 — 실호출이 실패하면 fixture 로 떨어지고 cached 를 밝힌다', async () => {
  mockAll({ solarStatus: 500 });
  const res = await post({ bidPbancNo: 'R25BK00645031', companyId: COMPANY, refresh: true });
  assert.equal(res.status, 202);
  const f = await waitDone('R25BK00645031-000');
  assert.equal(f.status, 'done');
  assert.equal(f.meta.cached, true);
  assert.equal(f.meta.source, 'cached');
  assert.ok(f.tabs.length > 0, '손 fixture 의 탭');
});

test('키가 없으면 데모 케이스는 지금처럼 fixture, 나라장터에도 가지 않는다', async () => {
  mockAll();
  const saved = env.studio.agentApiKey;
  env.studio.agentApiKey = '';
  try {
    const res = await post({ bidPbancNo: 'R25BK00645031', refresh: true });
    assert.equal(res.status, 202);
    const f = await res.json();
    assert.equal(f.meta.cached, true);
    assert.equal(calls.g2b, 0);
  } finally {
    env.studio.agentApiKey = saved;
  }
});

// ── 2-2 보강: Solar 없이 저장본에 가드만 다시 적용해 탭을 다시 그린다 ──
import { rejudge } from '../src/services/casePipeline.service.js';

test('rejudge(reguard) — Solar 를 부르지 않고 저장된 계획에 가드를 다시 적용해 큰 패키지를 나누고 탭을 다시 그린다', async () => {
  mockAll();
  await post({ bidPbancNo: 'R25TEST00000006', companyId: COMPANY, refresh: true });
  const f = await waitDone('R25TEST00000006-000');
  assert.equal(f.status, 'done');
  // 저장된 PLAN_V1 을 «옛 가드» 모양으로 바꿔 놓는다: 1.1 에 요구사항 33개를 몰아넣는다 (실측 모양)
  const plan = caseRepo.listExtractions('R25TEST00000006-000', 'PLAN_V1')[0].payload;
  const all = rfpParts.agt_03.requirements.map((r) => r.requirement_id);
  plan.wbs.work_packages = [{ wbs_id: '1.1', name: '전체 구현', deliverable: '시스템', predecessors: [], duration: '미 명시', effort_mm: [{ grade: '고급', mm: 3.3 }], requirement_refs: all, source_page: 13 }];
  caseRepo.deleteExtraction('R25TEST00000006-000', 'PLAN_V1');
  caseRepo.insertExtraction('R25TEST00000006-000', { schemaName: 'PLAN_V1', payload: plan });

  const solarBefore = calls.solar.length;
  const r = await rejudge('R25TEST00000006-000', { parts: ['reguard'] });
  assert.equal(r.solarCalls, 0);
  assert.equal(calls.solar.length, solarBefore, 'Solar 를 부르지 않는다');
  const g = await get('R25TEST00000006-000');
  const wbs = g.tabs.find((t) => t.id === 'wbs');
  assert.ok(wbs.rows.length > 1, '요구사항 분류(절) 기준으로 나뉘었다: ' + wbs.rows.length);
  assert.ok(wbs.rows.every((row) => (row[6].match(/SFR-|PFR-|DAR-|INR-|SER-|QUR-|COR-|PMR-|ECR-|TER-|PSR-|TQR-|[A-Z]{3}-/g) || []).length <= 9));
  assert.ok(wbs.warnings.some((w) => w.includes('나눴습니다')), JSON.stringify(wbs.warnings));
  assert.ok(g.meta.pipeline.rejudged.includes('reguard'));
});

// ── 3: WBS 만 다시 — 프롬프트·입력을 고친 뒤 Solar 1회로 WBS 를 다시 받고 임계경로 가드를 다시 건다 ──
test('🔴 rejudge(wbs) — Solar 를 WBS 한 번만 부르고, 저장된 WPS/CP 를 입력으로 WBS 를 갈아 끼운다', async () => {
  mockAll();
  await post({ bidPbancNo: 'R25TEST00000007', companyId: COMPANY, refresh: true });
  const f = await waitDone('R25TEST00000007-000');
  assert.equal(f.status, 'done');
  calls.solar.length = 0;
  const r = await rejudge('R25TEST00000007-000', { parts: ['wbs'] });
  assert.equal(r.solarCalls, 1);
  assert.deepEqual(calls.solar, ['WBS_V1']);
  const plan = caseRepo.listExtractions('R25TEST00000007-000', 'PLAN_V1')[0].payload;
  assert.ok(plan.wpsCp && plan.wbs && plan.criticalPath, 'WPS/CP·임계경로는 그대로, WBS 는 새것');
  assert.ok(plan.wbs.work_packages.length >= 1);
  const g = await get('R25TEST00000007-000');
  assert.ok(g.meta.pipeline.rejudged.includes('wbs'));
  assert.ok(g.tabs.find((t) => t.id === 'wbs').rows.length >= 1);
});
