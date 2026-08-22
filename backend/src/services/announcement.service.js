import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env, ROOT } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { isConfigured, uploadFile, runAgent, pollResponse, parseAgentOutput } from './studio.service.js';
import { findStudioResult, saveStudioResult, savePendingStudioJob, deleteStudioResult } from '../repositories/studioResult.repo.js';

/**
 * S3 공고 해부 — 제안요청서·입찰공고서를 Studio Extract 5종에 돌리고 ANNOUNCEMENT_CORE_V1 로 병합한다.
 *
 * 🔴 데모 공고는 문서가 **둘**이다. 마감·전자입찰·접수처는 입찰공고서에만, 요구사항·분량·서식은 제안요청서에만 있다.
 *    제안요청서 → 01·02·03·04·05 (같은 file_id), 입찰공고서 → 04 (BID_NOTICE 갈래) 만.
 * 🔴 병합 규칙은 기획안 4-1 「공고서가 이긴다」를 코드로 옮긴 것이다 (backend/HANDOFF-solar-judgment.md §4-3).
 * 🔴 키가 없으면 fixtures/studio 의 실물 출력으로 떨어진다 — meta.cached 로 밝힌다.
 * 🔴 키는 정운 Studio 계정의 것(UPSTAGE_AGENT_API_KEY) — Agent 6종이 그 계정에 있다. 팀 키(UPSTAGE_API_KEY)로는 404.
 * 🔴 실측(2026-08-23, PG 대행 용역 RFP): Classify 가 갈래를 못 정하면(OTHER_REVIEW_REQUIRED) Extract 를 안 타고
 *    분류 라벨만 돌아온다. 그건 «실패»가 아니라 «추출 없음»이다 — 나머지 Agent 결과로 병합하고 meta.unextracted 에 남긴다.
 * 🔴 Studio 결과 캐시(studio_result): 같은 파일(sha256)·같은 Agent 는 업로드도 실행도 하지 않는다 (무료 실행 10회).
 */

const KEY = () => env.studio.agentApiKey;

const RFP_AGENTS = ['overview', 'scopeContext', 'requirements', 'eligibilitySubmission', 'conditionsEvaluation'];
const AGENT_ENV = {
  overview: 'STUDIO_AGENT_ANNOUNCEMENT_OVERVIEW_ID',
  scopeContext: 'STUDIO_AGENT_ANNOUNCEMENT_SCOPE_CONTEXT_ID',
  requirements: 'STUDIO_AGENT_ANNOUNCEMENT_REQUIREMENTS_ID',
  eligibilitySubmission: 'STUDIO_AGENT_ANNOUNCEMENT_ELIGIBILITY_SUBMISSION_ID',
  conditionsEvaluation: 'STUDIO_AGENT_ANNOUNCEMENT_CONDITIONS_EVALUATION_ID',
};
const FIXTURE_DIR = path.join(ROOT, 'fixtures', 'studio');
const FIXTURES = {
  rfp: {
    overview: '01_overview.rfp.json',
    scopeContext: '02_scope_context.rfp.json',
    requirements: '03_requirements.rfp.json',
    eligibilitySubmission: '04_eligibility_submission.rfp.json',
    conditionsEvaluation: '05_conditions_evaluation.rfp.json',
  },
  notice: { eligibilitySubmission: '04_eligibility_submission.notice.json' },
};

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);
const norm = (v) => s(v).replace(/\s+/g, '');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const CLASSIFY_LABEL = /^[A-Z][A-Z_]+$/;

function agentFor(key) {
  const a = env.studio.agents?.[key];
  if (!a?.agentId) {
    throw new AppError('E_AGENT_NOT_SET',
      `공고 해부 Agent 「${key}」의 ID가 없습니다. backend/.env 의 ${AGENT_ENV[key]} 를 채워 주세요.`, { key });
  }
  return a;
}

function loadFixtureParts(doc) {
  return Object.fromEntries(Object.entries(FIXTURES[doc]).map(([key, file]) =>
    [key, JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'))]));
}

/** 문서 하나 = 업로드 한 번, 그것도 캐시에 없는 Agent 가 있을 때만. 🔴 Promise 를 메모해야 병렬 호출이 다섯 번 올리지 않는다 */
function source(file) {
  let upload = null;
  return { file, sha: sha256(file.buffer), getFileId: () => (upload ??= uploadFile({ ...file, apiKey: KEY() })) };
}

/**
 * Agent 하나 → { data | null }. 🔴 config_id 는 보내지 않는다 — Studio 가 기본(default) 설정을 쓴다.
 *   data      : 추출 JSON (캐시에 저장)
 *   data null : Classify 가 갈래를 못 정해 Extract 를 안 탔다 — classification 에 라벨. 캐시하지 않는다
 * 🔴 폴링 예산(STUDIO_POLL_TIMEOUT_MS)을 넘기면 job 은 Studio 에서 계속 돈다. job_id 를 남겨 두고(pending),
 *    다음 실행은 새로 사지 않고 그 job 을 이어서 기다린다 — 실측: 6 job 이 300초를 넘겨 한 번 통째로 날렸다.
 */
async function runOn(src, key, doc, { retried = false } = {}) {
  const { agentId } = agentFor(key);
  const hit = findStudioResult(agentId, src.sha);
  if (hit?.payload) return { key, doc, agentId, jobId: hit.jobId, fromCache: true, resumed: false, classification: null, data: hit.payload };

  let jobId = hit?.jobId ?? null;
  const resumed = Boolean(jobId);
  if (!jobId) {
    const fileId = await src.getFileId();
    const started = await runAgent({ agentId, fileId, apiKey: KEY() });
    jobId = started.id;
    savePendingStudioJob({ agentId, fileSha256: src.sha, filename: src.file.filename, jobId });
  } else {
    logger.info('announcement_job_resumed', { key, doc, agentId, jobId });
  }

  let job;
  try {
    job = await pollResponse(jobId, { apiKey: KEY() });
  } catch (err) {
    // 이어받은 job 이 실패·취소·사라졌으면 한 번만 새로 돈다. 타임아웃은 그대로 — pending 이 남아 다음에 또 이어받는다
    if (resumed && !retried && err instanceof AppError && err.code === 'E_UPSTREAM_STUDIO') {
      logger.warn('announcement_job_resume_failed', { key, doc, agentId, jobId, details: err.details });
      deleteStudioResult(agentId, src.sha);
      return runOn(src, key, doc, { retried: true });
    }
    throw err;
  }

  const parsed = parseAgentOutput(job);
  if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
    saveStudioResult({ agentId, fileSha256: src.sha, filename: src.file.filename, jobId, payload: parsed.data });
    return { key, doc, agentId, jobId, fromCache: false, resumed, classification: null, data: parsed.data };
  }
  deleteStudioResult(agentId, src.sha);   // 분류만 한 결과는 남기지 않는다 — 갈래를 고치면 다시 돌아야 한다
  const label = s(parsed.raw);
  if (CLASSIFY_LABEL.test(label)) {
    logger.warn('announcement_not_extracted', { key, doc, agentId, classification: label, jobId });
    return { key, doc, agentId, jobId, fromCache: false, resumed, classification: label, data: null };
  }
  throw new AppError('E_UPSTREAM_STUDIO', `공고 해부 Agent 「${key}」가 JSON 결과를 돌려주지 않았습니다.`,
    { key, doc, jobId, rawLength: parsed.raw?.length ?? 0 });
}

export async function decomposeAnnouncement({ rfp, notice }) {
  const started = Date.now();

  if (!isConfigured(KEY())) {
    logger.warn('announcement_fallback_fixture', { rfp: rfp?.filename, notice: notice?.filename });
    const merged = mergeAnnouncement({ rfp: loadFixtureParts('rfp'), notice: notice ? loadFixtureParts('notice') : undefined });
    return { ...merged, meta: { source: 'fixture', cached: true, jobs: [], elapsedMs: Date.now() - started } };
  }

  // 🔴 업로드 전에 ID 를 전부 확인한다 — 무료 실행(에이전트당 10회)을 반쯤 쓰고 죽지 않게
  for (const key of RFP_AGENTS) agentFor(key);

  const rfpSrc = source(rfp);
  const rfpResults = await Promise.all(RFP_AGENTS.map((key) => runOn(rfpSrc, key, 'rfp')));

  let noticeResult = null;
  if (notice) noticeResult = await runOn(source(notice), 'eligibilitySubmission', 'notice');

  const results = [...rfpResults, noticeResult].filter(Boolean);
  if (!results.some((r) => r.data)) {
    const labels = [...new Set(results.map((r) => r.classification).filter(Boolean))];
    throw new AppError('E_ANNOUNCEMENT_UNREADABLE',
      `공고 문서에서 아무것도 추출하지 못했습니다 — Studio 분류: ${labels.join(', ') || '(없음)'}. Agent 갈래 설정(agent/build_agents.py ANNOUNCEMENT_BRANCHES)을 확인해 주세요.`,
      { results: results.map(({ key, doc, classification, jobId }) => ({ key, doc, classification, jobId })) });
  }

  const merged = mergeAnnouncement({
    rfp: Object.fromEntries(rfpResults.filter((r) => r.data).map((r) => [r.key, r.data])),
    notice: noticeResult?.data ? { eligibilitySubmission: noticeResult.data } : undefined,
  });
  const unextracted = results.filter((r) => !r.data).map(({ key, doc, classification }) => ({ key, doc, classification }));
  const jobs = results.map(({ key, doc, agentId, jobId, fromCache, resumed, classification }) => ({ key, doc, agentId, jobId, fromCache, resumed, classification }));
  const studioRuns = results.filter((r) => !r.fromCache && !r.resumed).length;
  logger.info('announcement_decomposed', { jobs: jobs.length, studioRuns, unextracted: unextracted.length, requirements: merged.requirements.length, elapsedMs: Date.now() - started });
  return { ...merged, meta: { source: 'studio', cached: false, partial: unextracted.length > 0, unextracted, studioRuns, jobs, elapsedMs: Date.now() - started } };
}

/**
 * 병합 규칙 — 「공고서가 이긴다」
 *   마감·접수·방식·접수처 → 공고서, 비어 있을 때만 제안요청서
 *   분량 상한             → 제안요청서
 *   제안서 부수           → 🔴 계약 후 산출물(COMPLETION)의 부수와 같으면 버린다 (실측: 「최종보고서 5부」 오귀속)
 *   자격·제출물           → 합친다. 행마다 source_doc. 공고서 행이 앞
 *   요구사항·범위·수행조건·평가 → 제안요청서만
 */
export function mergeAnnouncement({ rfp = {}, notice } = {}) {
  const ov = rfp.overview ?? {};
  const sc = rfp.scopeContext ?? {};
  const rq = rfp.requirements ?? {};
  const el = rfp.eligibilitySubmission ?? {};
  const ce = rfp.conditionsEvaluation ?? {};
  const n = notice?.eligibilitySubmission ?? null;
  const warnings = [];

  const noticeFirst = (k) => (n ? s(n[k]) : '') || s(el[k]);
  const rfpFirst = (k) => s(el[k]) || (n ? s(n[k]) : '');

  const copiesOf = (part, doc) => {
    const v = s(part?.constraint_proposal_copies);
    if (!v) return '';
    const deliverables = arr(part?.submission_requirements)
      .filter((x) => s(x.submission_stage) === 'COMPLETION' && s(x.copies) === v);
    if (deliverables.length) {
      warnings.push(`${doc === 'notice' ? '입찰공고서' : '제안요청서'}의 제안서 부수 ${v}는 계약 후 산출물(${deliverables.map((x) => s(x.name)).join('·')})의 부수와 같아 버렸다 — 부수는 빈 값`);
      return '';
    }
    return v;
  };

  const noticeHasConstraint = Boolean(n && ['constraint_deadline', 'constraint_method', 'constraint_opens_at', 'constraint_place'].some((k) => s(n[k])));
  const constraintDoc = noticeHasConstraint ? 'notice' : 'rfp';
  const constraintSource = constraintDoc === 'notice' ? n : el;

  // 🔴 같은 문서 안의 중복도 한 번만 — 실측: 공고문이 같은 제출 서류를 두 번 나열했다(12행 중 5행이 중복)
  const dedupe = (rows, keyOf, seen = new Set()) => rows.filter((r) => { const k = keyOf(r); if (seen.has(k)) return false; seen.add(k); return true; });
  const tag = (rows, doc) => arr(rows).map((r) => ({ ...r, source_doc: doc }));
  const ruleKey = (r) => norm(r.condition);
  const seenRule = new Set();
  const noticeRules = dedupe(tag(n?.eligibility_rules, 'notice'), ruleKey, seenRule);
  const rfpRules = dedupe(tag(el.eligibility_rules, 'rfp'), ruleKey, seenRule);

  const subKey = (r) => `${norm(r.name)}|${s(r.submission_stage)}`;
  const seenSub = new Set();
  const noticeSubs = dedupe(tag(n?.submission_requirements, 'notice'), subKey, seenSub);
  const rfpSubs = dedupe(tag(el.submission_requirements, 'rfp'), subKey, seenSub);

  return {
    ...ov,
    schema_version: 'ANNOUNCEMENT_CORE_V1',
    source_documents: [...new Set([...arr(ov.source_documents), ...(n ? ['입찰공고서'] : [])])],

    requirement_count: Number(rq.requirement_count) || arr(rq.requirements).length,
    requirement_summary: arr(rq.requirement_summary),
    requirements: arr(rq.requirements),
    scope_items: arr(sc.scope_items),
    execution_context: arr(sc.execution_context),
    execution_conditions: arr(ce.execution_conditions),
    evaluation_items: arr(ce.evaluation_items),

    eligibility_rules: [...noticeRules, ...rfpRules],
    submission_requirements: [...noticeSubs, ...rfpSubs],

    constraint_method: noticeFirst('constraint_method'),
    constraint_deadline: noticeFirst('constraint_deadline'),
    constraint_opens_at: noticeFirst('constraint_opens_at'),
    constraint_place: noticeFirst('constraint_place'),
    constraint_page_limit: rfpFirst('constraint_page_limit'),
    constraint_summary_page_limit: rfpFirst('constraint_summary_page_limit'),
    constraint_price_sealed: noticeFirst('constraint_price_sealed'),
    constraint_proposal_copies: (n ? copiesOf(n, 'notice') : '') || copiesOf(el, 'rfp'),
    constraint_source_page: Number(constraintSource?.constraint_source_page) || 0,
    constraint_source_doc: constraintDoc,

    _warnings: warnings,
  };
}
