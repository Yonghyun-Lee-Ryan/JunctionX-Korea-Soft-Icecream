#!/usr/bin/env node
/**
 * 모의 Upstage — Studio Jobs API(/v2/files · /v2/responses)와 Solar Chat(/v1/chat/completions)을 흉내 낸다.
 *
 * 🔴 왜 있나: Studio 무료 실행은 에이전트당 10회, Solar 도 크레딧이다. 화면④ 네 장을 리허설할 때마다
 *    진짜 Upstage 를 부르면 데모 전에 크레딧이 바닥난다. 이 서버를 띄우고 backend/.env 를 아래처럼 두면
 *    케이스 파이프라인(첨부 수집 → 공고 해부 → 판정 → 탭)이 **코드는 전부 실제 경로로** 돌되 응답만 fixture 로 온다.
 *
 *      UPSTAGE_AGENT_API_KEY=mock-local
 *      STUDIO_BASE_URL=http://localhost:3999
 *      SOLAR_CHAT_URL=http://localhost:3999/v1/chat/completions
 *      STUDIO_POLL_INTERVAL_MS=500
 *
 *    실행: node backend/scripts/mock-upstage.js   (포트 MOCK_UPSTAGE_PORT, 기본 3999)
 *
 * 🔴 Studio 응답은 fixtures/studio/ 의 **실물 출력**(KISTI AX 진단 RFP)이다 — 어떤 파일을 올려도 그 공고로 답한다.
 * 🔴 Solar 응답은 여기서 손으로 만든 견본이다. 판정의 «내용»이 아니라 파이프라인·화면의 «모양»을 보는 용도다.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const PORT = Number(process.env.MOCK_UPSTAGE_PORT || 3999);
const LATENCY_MS = Number(process.env.MOCK_UPSTAGE_LATENCY_MS || 1500);   // 진행 단계가 화면에 보일 만큼만 느리게
const fx = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures', 'studio', f), 'utf8'));

const notice = fx('04_eligibility_submission.notice.json');
const requirements = fx('03_requirements.rfp.json').requirements;
const card = fx('company_card.flat.json');
const PROJECT = fx('01_overview.rfp.json').procurement_project_name;

// ── Studio: agent id → fixture. 백엔드와 같은 .env 의 ID 를 읽는다 ──
const id = (k) => (process.env[k] ?? '').trim();
const STUDIO = {
  [id('STUDIO_AGENT_ANNOUNCEMENT_OVERVIEW_ID')]: () => fx('01_overview.rfp.json'),
  [id('STUDIO_AGENT_ANNOUNCEMENT_SCOPE_CONTEXT_ID')]: () => fx('02_scope_context.rfp.json'),
  [id('STUDIO_AGENT_ANNOUNCEMENT_REQUIREMENTS_ID')]: () => fx('03_requirements.rfp.json'),
  [id('STUDIO_AGENT_ANNOUNCEMENT_ELIGIBILITY_SUBMISSION_ID')]: (filename) => (/공고/.test(filename) ? notice : fx('04_eligibility_submission.rfp.json')),
  [id('STUDIO_AGENT_ANNOUNCEMENT_CONDITIONS_EVALUATION_ID')]: () => fx('05_conditions_evaluation.rfp.json'),
  [id('STUDIO_AGENT_COMPANY_CARD_ID')]: (filename) => {
    const doc = card.documents.find((d) => d.source_document === filename) ?? card.documents[0];
    const { source_document, ...data } = doc;
    return data;
  },
};
delete STUDIO[''];

// ── Solar: 출력 템플릿의 "agent" 값으로 고른다 (solarJudge.service 의 프롬프트가 그 이름을 품고 있다) ──
const bidDocs = [];
for (const s of notice.submission_requirements) {
  if (s.submission_stage === 'BID' && !bidDocs.some((b) => b.name === s.name)) bidDocs.push(s);
}
const DOC_STATUS = {
  '사업자등록증 및 법인등기부등본': ['준비됨', '', '', '사업자등록증_다온피엠씨_가상.pdf'],
  '중․소기업․소상공인 확인증': ['준비됨', '', '', '중소기업확인서_다온피엠씨_가상.pdf'],
  '소프트웨어사업자 일반 현황 관리확인서 또는 소프트웨어사업자 신고확인서': ['준비됨', '', '', '소프트웨어사업자신고확인서_다온피엠씨_가상.pdf'],
  '직접생산확인증명서(패키지소프트웨어개발 및 도입서비스)': ['보완 필요', '직접생산확인증명서가 없습니다 — 중소기업중앙회(직접생산확인)에서 발급받아 올려 주세요', '5~7일', ''],
  '입찰보증금(입찰보증증권)': ['보완 필요', '입찰보증증권(보증기관 발행)이 아직 없습니다', '1~2일', ''],
};
const SOLAR = {
  ELIGIBILITY_SCREENING_V1: () => {
    const rules = notice.eligibility_rules.slice(0, 8);
    const docFor = ['', '', '', '', '중소기업확인서_다온피엠씨_가상.pdf', '중소기업확인서_다온피엠씨_가상.pdf', '중소기업확인서_다온피엠씨_가상.pdf', '중소기업확인서_다온피엠씨_가상.pdf'];
    const checks = rules.map((r, i) => ({
      rule_id: r.rule_id,
      label: r.condition.replace(/\s+/g, ' ').slice(0, 42),
      status: i === 3 ? '[확인필요]' : '충족',
      gate_level: r.gate_level, mandatory: r.mandatory,
      announcement_page: r.source_page,
      company_source_document: docFor[i],
      evidence: i === 3 ? '연구원 내부 지침은 회사 서류로 확인할 수 없다' : '회사 카드와 대조',
    }));
    return {
      agent: 'ELIGIBILITY_SCREENING_V1', project_name: PROJECT, verdict: '추천',
      headline: `참가자격 ${checks.length}개 확인 — ${checks.length - 1}개 충족, 1개는 서류에서 읽지 못했습니다.`,
      checks, exclusion_reasons: [],
      unverified_items: [{ label: checks[3].label, what_is_missing: '연구원 계약업무요령은 공고문 밖의 문서다' }],
    };
  },
  WPS_CP_V1: () => ({
    agent: 'WPS_CP_V1', document_type: 'SYSTEM_BUILD', project_name: PROJECT,
    decompositions: requirements.slice(0, 8).map((r) => ({
      source_type: 'REQUIREMENT', source_ref: r.requirement_id, service_component: r.service_component || 'BUILD',
      wps: [`${r.requirement_name} 구현`], cp: [r.requirement_name],
    })),
    cross_cutting_cp: [], skipped_non_primary_count: 0,
    validation: { declared_requirement_count: requirements.length, extracted_primary_requirement_count: requirements.length, decomposed_primary_requirement_count: 8, duplicate_requirement_ids: [], missing_requirement_ids: [], undecomposed_primary_refs: [] },
  }),
  WBS_V1: () => {
    const ids = requirements.map((r) => r.requirement_id);
    const page = (i) => Number(requirements[i]?.source_page) || 13;
    return {
      agent: 'WBS_V1', project_name: PROJECT, project_period: { start: '계약체결일', end: '2026.12.15' },
      work_packages: [
        { wbs_id: '1.1', name: '착수 및 사업수행 계획 수립', deliverable: '사업 수행 계획서', predecessors: [], duration: '착수 후 2주', effort_mm: [{ grade: '특급', mm: 0.5 }, { grade: '고급', mm: 0.5 }], requirement_refs: ids.slice(0, 1), source_page: page(0) },
        { wbs_id: '1.2', name: '요구사항 분석 및 설계', deliverable: '요구사항 정의서 · 설계서', predecessors: ['1.1'], duration: '착수 후 6주', effort_mm: [{ grade: '고급', mm: 1.5 }, { grade: '중급', mm: 1.0 }], requirement_refs: ids.slice(1, 4), source_page: page(1) },
        { wbs_id: '2.1', name: 'AX 진단 엔진 개발', deliverable: '진단 엔진 · 시험 결과서', predecessors: ['1.2'], duration: '', effort_mm: [{ grade: '고급', mm: 2.0 }, { grade: '중급', mm: 2.0 }], requirement_refs: ids.slice(4, 9), source_page: page(4) },
        { wbs_id: '2.2', name: '컨설팅 리포트 모듈 개발', deliverable: '리포트 생성 모듈', predecessors: ['1.2'], duration: '', effort_mm: [{ grade: '중급', mm: 1.5 }], requirement_refs: ids.slice(9, 12), source_page: page(9) },
        { wbs_id: '3.1', name: '통합 시험 및 안정화', deliverable: '통합 시험 결과서', predecessors: ['2.1', '2.2'], duration: '종료 4주 전 착수', effort_mm: [{ grade: '고급', mm: 0.5 }, { grade: '중급', mm: 1.0 }], requirement_refs: ids.slice(12, 14), source_page: page(12) },
        { wbs_id: '3.2', name: '교육 · 검수 · 인수인계', deliverable: '교육 자료 · 완료 보고서', predecessors: ['3.1'], duration: '2026.12.15 까지', effort_mm: [{ grade: '특급', mm: 0.3 }, { grade: '중급', mm: 0.5 }], requirement_refs: ids.slice(14, 16), source_page: page(14) },
      ],
      validation: {},
    };
  },
  CRITICAL_PATH_COST_V1: () => ({
    agent: 'CRITICAL_PATH_COST_V1', project_name: PROJECT, deadline: notice.constraint_deadline,
    critical_path: [
      { item: '조달청 전자입찰 참가자격 등록', lead_time_days: 10, blocking_reason: '개찰일 전일까지 등록되어 있어야 한다', source_page: 1 },
      { item: '중소기업확인서 재발급 신청', lead_time_days: 7, blocking_reason: '제출 마감일 전일까지 신청', source_page: 2 },
      { item: '입찰보증증권 발행', lead_time_days: 2, blocking_reason: '입찰서 제출 시 첨부', source_page: 4 },
      { item: '직접생산확인증명서 발급', lead_time_days: 0, blocking_reason: '발급 소요 기간을 공고가 말하지 않는다', source_page: 4 },
    ],
    cost_estimate: { references: [{ label: '추정가격', page: 1 }] },
  }),
  SUBMISSION_RULES_V2: () => ({
    agent: 'SUBMISSION_RULES_V2', project_name: PROJECT,
    constraints: { method: notice.constraint_method, deadline: notice.constraint_deadline, proposal_copies: '', page_limit: '', summary_page_limit: '', price_proposal_sealed: '', place: notice.constraint_place, source_page: notice.constraint_source_page },
    required_documents: bidDocs.map((d) => ({ name: d.name, copies: d.copies, validity_basis: d.validity_basis, submission_method: d.submission_method, mandatory: d.mandatory, template_id: d.template_id, signature_or_seal: d.signature_or_seal, condition_or_note: d.condition_or_note, stage: 'BID', source_page: d.source_page })),
    proposal_checks: [], evaluation_checks: [], forbidden_expression_rules: [],
    default_forbidden_expressions: ['가능하다', '고려할 수 있다', '지원 가능', '검토하겠다'],
    missing_or_uncertain_rules: [],
  }),
  PROPOSAL_SCAN_V1: () => ({ agent: 'PROPOSAL_SCAN_V1', forbidden_expression_hits: [], covered_topics: [] }),
  SUBMISSION_AUDIT_V1: () => ({
    agent: 'SUBMISSION_AUDIT_V1', project_name: PROJECT, overall_status: 'NEEDS_REWORK',
    submission_constraints: { method: notice.constraint_method, deadline: notice.constraint_deadline, proposal_copies: '', page_limit: '', price_proposal_sealed: '', source_page: notice.constraint_source_page },
    documents: bidDocs.map((d) => {
      const [status, rework_note, lead_time, matched_file] = DOC_STATUS[d.name] ?? ['미확인', '', '', ''];
      return { name: d.name, copies: d.copies, validity: d.validity_basis, status, rework_note, lead_time, matched_file, source_page: d.source_page };
    }),
    rework_requests: [], forbidden_expressions: { count: 0, rule_note: '', items: [] }, uncovered_requirement_ids: [], summary: {},
  }),
};

// ── 서버 ──
const files = new Map();   // file_id → filename
const jobs = new Map();    // job_id → { agentId, filename, readyAt }
let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const body = await readBody(req);
  try {
    if (req.method === 'POST' && url.pathname === '/v2/files') {
      const form = await new Response(body, { headers: { 'content-type': req.headers['content-type'] } }).formData();
      const file = form.get('file');
      const fileId = `file_mock_${++seq}`;
      files.set(fileId, file?.name ?? 'unknown');
      console.log(`[mock-upstage] upload  ${fileId}  ${file?.name} (${file?.size ?? 0} bytes)`);
      return json(res, 200, { id: fileId, bytes: file?.size ?? 0, purpose: 'assistants' });
    }
    if (req.method === 'POST' && url.pathname === '/v2/responses') {
      const { model, input } = JSON.parse(body.toString('utf8'));
      const filename = files.get(input?.[0]?.content?.[0]?.file_id) ?? 'unknown';
      if (!STUDIO[model]) return json(res, 404, { error: { message: `unknown agent ${model} — backend/.env 의 STUDIO_AGENT_*_ID 와 같은 .env 를 읽는지 확인` } });
      const jobId = `job_mock_${++seq}`;
      jobs.set(jobId, { agentId: model, filename, readyAt: Date.now() + LATENCY_MS });
      console.log(`[mock-upstage] job     ${jobId}  ${model}  ← ${filename}`);
      return json(res, 200, { id: jobId, status: 'in_progress' });
    }
    const m = url.pathname.match(/^\/v2\/responses\/(job_mock_\d+)$/);
    if (req.method === 'GET' && m) {
      const job = jobs.get(m[1]);
      if (!job) return json(res, 404, { error: { message: 'no such job' } });
      if (Date.now() < job.readyAt) return json(res, 200, { id: m[1], status: 'in_progress' });
      const data = STUDIO[job.agentId](job.filename);
      const isCard = job.agentId === id('STUDIO_AGENT_COMPANY_CARD_ID');
      const output = [];
      if (isCard) output.push({ type: 'message', model: 'Classify-1', content: [{ type: 'output_text', text: JSON.stringify({ category: 'CO_OTHER_REVIEW_REQUIRED' }) }] });
      output.push({ type: 'message', model: job.agentId, content: [{ type: 'output_text', text: JSON.stringify(data), additional_values: { cache_hit: false } }] });
      return json(res, 200, { id: m[1], status: 'completed', output });
    }
    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      const { messages } = JSON.parse(body.toString('utf8'));
      const system = messages?.[0]?.content ?? '';
      const key = Object.keys(SOLAR).find((k) => system.includes(`"agent": "${k}"`));
      if (!key) return json(res, 400, { error: { message: '어느 판정 프롬프트인지 모르겠다' } });
      await sleep(LATENCY_MS);
      console.log(`[mock-upstage] solar   ${key}`);
      return json(res, 200, { id: `chatcmpl_mock_${++seq}`, choices: [{ message: { role: 'assistant', content: JSON.stringify(SOLAR[key]()) } }], usage: { total_tokens: 0 } });
    }
    json(res, 404, { error: { message: `no route ${req.method} ${url.pathname}` } });
  } catch (err) {
    console.error('[mock-upstage] error', err);
    json(res, 500, { error: { message: String(err?.message ?? err) } });
  }
}).listen(PORT, () => {
  console.log(`[mock-upstage] listening on http://localhost:${PORT}  agents=${Object.keys(STUDIO).length}  latency=${LATENCY_MS}ms`);
});
