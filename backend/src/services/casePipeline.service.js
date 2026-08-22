import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { parseJson } from '../db/index.js';
import * as caseRepo from '../repositories/case.repo.js';
import * as companyRepo from '../repositories/company.repo.js';
import { loadFixture } from './fixture.service.js';
import { decomposeAnnouncement } from './announcement.service.js';
import { judgeEligibility, judgePlan, judgeWbs, judgeSubmission, guardWbs, guardCriticalPath, guardSubmissionAudit } from './solarJudge.service.js';
import { scanForbidden, forbiddenFromRules } from './proposalScan.service.js';
import { buildKit } from './kit.service.js';
import { listCaseFiles, latestCaseFile } from '../repositories/caseFile.repo.js';

/**
 * 케이스 파이프라인 — 첨부 수집 뒤에 이어 붙는 «공고 해부 → 판정 → 탭» 한 벌.
 *
 *   첨부(나라장터) ─ pickDocuments ─▶ 제안요청서·입찰공고문
 *     → decomposeAnnouncement (Studio 6 job)            … progress[1] 문서 읽기 · progress[2] 문서 종류 분류
 *     → judgeEligibility ∥ judgePlan ∥ judgeSubmission (Solar) … progress[3] 요구사항 추출·판정
 *     → buildKit → case_tab · case_download · verdict · extraction · meta.pipeline
 *
 * 🔴 Upstage 크레딧 — 결과는 DB 에 남고, `isFresh` 인 케이스는 다시 열어도 여기로 오지 않는다 (TTL 7일).
 *    공고 문서는 마감 전까지 바뀌지 않고, 재공고는 차수가 달라 새 케이스다. 다시 돌리려면 `refresh`.
 * 🔴 프론트는 GET /api/cases/{id} 봉투 하나만 본다 — 여기서 만든 탭이 그대로 화면④ 네 장이 된다.
 * 🔴 실패는 숨기지 않는다 — 어느 단계에서 죽었는지 progress 에 남긴다. 손 fixture 가 있는 데모 케이스만
 *    fixture 로 떨어지고, 그때도 meta.cached 로 «캐시 결과»라고 말한다.
 */

export const PIPELINE_TTL_MS = 7 * 24 * 3600 * 1000;

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const DOC_EXT = /\.(hwpx?|pdf|docx?)$/i;
const MIME = { hwp: 'application/x-hwp', hwpx: 'application/hwp+zip', pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

/** 정운 계정 키가 있어야 Studio 6종과 Solar 를 부를 수 있다 */
export function pipelineConfigured() {
  return Boolean(env.studio.agentApiKey);
}

/** 손 fixture 가 있는 케이스인가 (데모 공고) */
export function hasFixture(caseId) {
  const fx = loadFixture('factsheet.demo');
  return Boolean(fx) && (!fx.caseId || fx.caseId === caseId);
}

/** meta.pipeline.ranAt 이 TTL 안이면 다시 돌리지 않는다 */
export function isFresh(meta, now = Date.now()) {
  const t = Date.parse(s(meta?.pipeline?.ranAt));
  return Number.isFinite(t) && now - t < PIPELINE_TTL_MS;
}

/**
 * 첨부 중 제안요청서·입찰공고문을 고른다.
 * 🔴 이름으로 못 고르면 가장 큰 문서를 제안요청서로 본다 — 요구사항은 보통 가장 두꺼운 문서에 있다.
 *    실측(R25BK00645031): 「입찰공고문(…).hwp」「제안요청서.hwp」「계약이행특수조건.hwp」「…특수조건.hwp」「[별첨 1] …협정서.hwpx」
 */
export function pickDocuments(files) {
  const docs = (files ?? []).filter((f) => DOC_EXT.test(s(f.filename)));
  const size = (f) => Number(f.bytes) || f.buffer?.length || 0;
  const notice = docs.find((f) => /공고/.test(f.filename) && !/제안\s*요청/.test(f.filename)) ?? null;
  const rest = docs.filter((f) => f !== notice);
  const rfp = rest.find((f) => /제안\s*요청|과업\s*지시|RFP/i.test(f.filename))
    ?? [...rest].sort((a, b) => size(b) - size(a))[0]
    ?? null;
  const others = (files ?? []).filter((f) => f !== rfp && f !== notice);
  return { rfp, notice, others };
}

/** 저장된 회사 서류를 판정용 COMPANY_CARD_V1 로. 🔴 없으면 null — 자격·제출 판정을 건너뛴다 */
export function companyCardFor(companyId) {
  if (!companyId) return null;
  const company = companyRepo.findCompany(companyId);
  if (!company) return null;
  const docs = companyRepo.listCompanyDocuments(companyId);
  return {
    schema_version: 'COMPANY_CARD_V1',
    company_name: company.name,
    business_number: company.biz_no ?? '',
    documents: docs.map((d) => ({
      ...(d.extracted && typeof d.extracted === 'object' && !Array.isArray(d.extracted) ? d.extracted : {}),
      source_document: d.filename,
      docTypeKey: d.docClass ?? null,
      confidence: d.confidence ?? null,
    })),
  };
}

const toUpload = (f) => ({
  buffer: f.buffer,
  filename: f.filename,
  mimeType: MIME[s(f.filename).split('.').pop().toLowerCase()] ?? 'application/octet-stream',
});

const AGENT_LABEL = { overview: '개요', scopeContext: '범위·맥락', requirements: '요구사항', eligibilitySubmission: '자격·제출', conditionsEvaluation: '수행조건·평가' };

const NO_RULES_VERDICT = {
  badge: 'eligible', excluded: false, unverified: 0, decision: 'pending',
  headline: '참가자격 조항을 공고에서 읽지 못해 판정하지 않았습니다 — 공고문을 직접 확인해 주세요.',
  reasons: [],
};

const NO_COMPANY_VERDICT = {
  badge: 'eligible', excluded: false, unverified: 0, decision: 'pending',
  headline: '회사 카드가 없어 참가자격은 판정하지 않았습니다 — 회사 서류를 올리면 판정합니다.',
  reasons: [],
};

function persistKit(caseId, kit) {
  caseRepo.clearTabs(caseId);
  kit.tabs.forEach((t, i) => caseRepo.upsertTab(caseId, t, i));
  caseRepo.clearDownloads(caseId);
  (kit.downloads ?? []).forEach((d, i) => caseRepo.upsertDownload(caseId, d, i));
}

const DOC_TYPE_LABEL = { biz_reg: '사업자등록증', sme_cert: '중소기업확인서', credit_rating: '신용평가등급확인서', pia_designation: '개인정보 영향평가기관 지정서', sw_business: '소프트웨어사업자 신고확인서', direct_production: '직접생산확인증명서', performance: '실적증명서', financial: '재무제표', tech_staff: '기술인력 보유현황' };

/** 판정에 넣는 서류 = 회사 카드 서류 + 케이스에 올린 제출 파일 (caseFiles.service 와 같은 모양. 순환 import 를 피해 여기서 만든다) */
function documentsWithUploads(caseId, companyCard) {
  const base = Array.isArray(companyCard?.documents) ? companyCard.documents : [];
  const uploads = listCaseFiles(caseId, 'submission').map((f) => ({
    source_document: f.filename, docTypeKey: f.docTypeKey,
    document_kind: f.docTypeKey ? (DOC_TYPE_LABEL[f.docTypeKey] ?? f.docTypeKey) : '(종류를 읽지 못한 파일)',
    uploaded_for: f.requirementName ?? '', source: 'upload', uploaded_at: f.createdAt,
  }));
  return [...base, ...uploads];
}

/**
 * 저장된 공고 해부 결과로 판정 일부만 다시 돈다 — 서류를 올렸을 때(submission)·프롬프트를 고쳤을 때(plan).
 * 🔴 Studio 는 부르지 않는다. 제출 검사의 규칙(SUBMISSION_RULES_V2)은 저장본을 다시 쓴다 → 서류 하나 올릴 때 Solar 1회.
 */
export async function rejudge(caseId, { parts = [], proposalText } = {}) {
  const row = caseRepo.findCase(caseId);
  if (!row) throw new AppError('E_CASE_NOT_FOUND');
  const stored = (name) => caseRepo.listExtractions(caseId, name)[0]?.payload ?? null;
  const announcement = stored('ANNOUNCEMENT_CORE_V1');
  if (!announcement) {
    throw new AppError('E_VALIDATION', '이 케이스는 공고 해부 결과가 없어 다시 판정할 수 없습니다. 응찰 목록에서 「응찰하러 가기」로 먼저 분석해 주세요.');
  }
  const started = Date.now();
  const eligibility = stored('ELIGIBILITY_SCREENING_V1');
  let plan = stored('PLAN_V1');
  let submission = stored('SUBMISSION_V1');
  const companyCard = companyCardFor(row.company_id);
  const card = { schema_version: 'COMPANY_CARD_V1', company_name: companyCard?.company_name ?? '', business_number: companyCard?.business_number ?? '', documents: documentsWithUploads(caseId, companyCard) };
  let solarCalls = 0;

  if (parts.includes('submission')) {
    const text = typeof proposalText === 'string' ? proposalText : (latestCaseFile(caseId, 'proposal')?.text ?? '');
    const proposal = latestCaseFile(caseId, 'proposal');
    submission = await judgeSubmission({ announcement, companyCard: card, proposalText: text, proposalPages: proposal?.pages ?? undefined, rules: submission?.rules, uploads: listCaseFiles(caseId, 'submission') });
    submission = { ...submission, proposalFile: proposal?.filename ?? null };
    solarCalls += submission.meta?.calls ?? 0;
    caseRepo.deleteExtraction(caseId, 'SUBMISSION_V1');
    caseRepo.insertExtraction(caseId, { schemaName: 'SUBMISSION_V1', payload: submission });
  }
  // 🔴 reguard: Solar 없이 저장본에 가드만 다시 적용한다 — 가드(나누기·기간·임계경로 채우기)를 고친 뒤 탭을 다시 그릴 때
  if (parts.includes('reguard')) {
    if (plan?.wbs) {
      const wbs = guardWbs(plan.wbs, announcement);
      const criticalPath = guardCriticalPath(plan.criticalPath ?? {}, wbs, announcement);
      plan = { ...plan, wbs, criticalPath };
      caseRepo.deleteExtraction(caseId, 'PLAN_V1');
      caseRepo.insertExtraction(caseId, { schemaName: 'PLAN_V1', payload: plan });
    }
    if (submission?.audit) {
      const proposal = latestCaseFile(caseId, 'proposal');
      const pages = proposal ? (proposal.pages ?? [proposal.text ?? '']) : [];
      submission = { ...submission, audit: guardSubmissionAudit(submission.audit, {
        proposalScan: submission.proposalScan, uploads: listCaseFiles(caseId, 'submission'),
        localHits: proposal ? scanForbidden(pages, forbiddenFromRules(submission.rules)) : [], pageCount: proposal ? pages.length : 0,
      }) };
      caseRepo.deleteExtraction(caseId, 'SUBMISSION_V1');
      caseRepo.insertExtraction(caseId, { schemaName: 'SUBMISSION_V1', payload: submission });
    }
  }
  // 🔴 wbs: 저장된 WPS/CP 를 입력으로 WBS 만 다시 받는다 — Solar 1회. 프롬프트·입력을 고친 뒤 계획 전체(3회)를 다시 사지 않게
  if (parts.includes('wbs') && plan?.wpsCp) {
    const wbs = await judgeWbs({ announcement, wpsCp: plan.wpsCp });
    solarCalls += 1;
    const criticalPath = guardCriticalPath(plan.criticalPath ?? {}, wbs, announcement);
    plan = { ...plan, wbs, criticalPath, meta: { ...(plan.meta ?? {}), wbsRejudgedAt: new Date().toISOString() } };
    caseRepo.deleteExtraction(caseId, 'PLAN_V1');
    caseRepo.insertExtraction(caseId, { schemaName: 'PLAN_V1', payload: plan });
  }
  if (parts.includes('plan') && announcement.requirements?.length) {
    plan = await judgePlan({ announcement });
    solarCalls += plan.meta?.calls ?? 0;
    caseRepo.deleteExtraction(caseId, 'PLAN_V1');
    caseRepo.insertExtraction(caseId, { schemaName: 'PLAN_V1', payload: plan });
  }

  const kit = buildKit({ announcement, eligibility, plan, submission, caseId });
  persistKit(caseId, kit);
  const meta = parseJson(caseRepo.findCase(caseId)?.meta_json, {});
  const pipeline = { ...(meta.pipeline ?? {}), rejudgedAt: new Date().toISOString(), rejudged: parts, rejudgeSolarCalls: solarCalls, rejudgeElapsedMs: Date.now() - started };
  caseRepo.setCaseResult(caseId, { verdict: kit.verdict ?? parseJson(row.verdict_json, NO_COMPANY_VERDICT), meta: { ...meta, pipeline } });
  logger.info('case_rejudged', { caseId, parts, solarCalls, tabs: kit.tabs.length });
  return { parts, solarCalls, tabs: kit.tabs.length };
}

export async function runPipeline(caseId, files, { companyId = null } = {}) {
  const started = Date.now();
  let step = 1;
  try {
    caseRepo.updateProgressStep(caseId, 1, 'running');
    caseRepo.setCaseStatus(caseId, 'parsing');

    const { rfp, notice, others } = pickDocuments(files);
    if (!rfp) throw new AppError('E_RFP_NOT_FOUND', undefined, { attachments: (files ?? []).map((f) => f.filename) });

    const announcement = await decomposeAnnouncement({ rfp: toUpload(rfp), notice: notice ? toUpload(notice) : undefined });

    caseRepo.upsertAttachment(caseId, { file_seq: rfp.fileSeq, filename: rfp.filename, bytes: rfp.bytes, doc_class: 'rfp' });
    if (notice) caseRepo.upsertAttachment(caseId, { file_seq: notice.fileSeq, filename: notice.filename, bytes: notice.bytes, doc_class: 'notice' });
    for (const f of others) caseRepo.upsertAttachment(caseId, { file_seq: f.fileSeq, filename: f.filename, bytes: f.bytes, doc_class: 'other' });

    // 🔴 일부 Agent 가 분류만 하고 추출을 안 했어도(실측: 용역 RFP) 있는 것으로 간다 — 빠진 것은 숨기지 않고 적는다
    const unextracted = announcement.meta?.unextracted ?? [];
    const partial = unextracted.map((u) => u.key);
    caseRepo.updateProgressStep(caseId, 1, 'done',
      `요구사항 ${announcement.requirements.length}건 · 참가자격 ${announcement.eligibility_rules.length}건 · 제출물 ${announcement.submission_requirements.length}건`
      + (partial.length ? ` · 미추출 ${partial.length}: ${unextracted.map((u) => `${AGENT_LABEL[u.key] ?? u.key}(${u.doc === 'notice' ? '공고문' : '제안요청서'}·${u.classification})`).join(', ')}` : ''));
    caseRepo.updateProgressStep(caseId, 2, 'done',
      notice ? `제안요청서 「${rfp.filename}」 · 입찰공고문 「${notice.filename}」` : `제안요청서 「${rfp.filename}」 — 입찰공고문 없음`);

    step = 3;
    caseRepo.updateProgressStep(caseId, 3, 'running');
    caseRepo.setCaseStatus(caseId, 'judging');

    const companyCard = companyCardFor(companyId);
    const canPlan = announcement.requirements.length > 0;          // 요구사항이 없으면 WBS 를 지어낼 수 없다
    const canScreen = Boolean(companyCard) && announcement.eligibility_rules.length > 0;
    const [eligibility, plan, submission] = await Promise.all([
      canScreen ? judgeEligibility({ companyCard, announcement }) : null,
      canPlan ? judgePlan({ announcement }) : null,
      companyCard ? judgeSubmission({ announcement, companyCard }) : null,
    ]);
    const kit = buildKit({ announcement, eligibility, plan, submission, caseId });

    // ── 저장 — 프론트가 읽는 봉투는 전부 DB 에서 나온다 ──
    persistKit(caseId, kit);
    // 🔴 판정 원본도 남긴다 — 탭을 다시 그리거나 사람이 근거를 볼 때 Upstage 를 다시 부르지 않게
    caseRepo.deleteExtractions(caseId);
    caseRepo.insertExtraction(caseId, { schemaName: 'ANNOUNCEMENT_CORE_V1', payload: announcement });
    if (eligibility) caseRepo.insertExtraction(caseId, { schemaName: 'ELIGIBILITY_SCREENING_V1', payload: eligibility });
    if (plan) caseRepo.insertExtraction(caseId, { schemaName: 'PLAN_V1', payload: plan });
    if (submission) caseRepo.insertExtraction(caseId, { schemaName: 'SUBMISSION_V1', payload: submission });

    const row = caseRepo.findCase(caseId);
    const meta = parseJson(row?.meta_json, {});
    const header = {
      title: s(announcement.procurement_project_name),
      org: s(announcement.issuer),
      deadline: s(announcement.constraint_deadline),
    };
    const elapsedMs = Date.now() - started;
    const pipeline = {
      ranAt: new Date().toISOString(),
      elapsedMs,
      ttlMs: PIPELINE_TTL_MS,
      source: announcement.meta?.source === 'fixture' ? 'fixture+solar' : 'studio+solar',
      announcementCached: Boolean(announcement.meta?.cached),
      partial,
      unextracted,
      studioJobs: announcement.meta?.jobs?.length ?? 0,
      studioRuns: announcement.meta?.studioRuns ?? 0,
      solarCalls: (eligibility ? 1 : 0) + (plan?.meta?.calls ?? 0) + (submission?.meta?.calls ?? 0),
      companyId: companyId ?? null,
      documents: { rfp: rfp.filename, notice: notice?.filename ?? null, others: others.map((f) => f.filename) },
    };
    caseRepo.setCaseResult(caseId, {
      verdict: kit.verdict ?? (companyCard ? NO_RULES_VERDICT : NO_COMPANY_VERDICT),
      meta: { ...meta, header: Object.fromEntries(Object.entries(header).filter(([, v]) => v)), pipeline },
    });
    caseRepo.updateProgressStep(caseId, 3, 'done',
      `${eligibility ? `자격 ${eligibility.verdict}` : (companyCard ? '자격 미판정(조항 없음)' : '자격 미판정(회사 없음)')} · ${plan ? `WBS ${plan.wbs?.work_packages?.length ?? 0}건` : 'WBS 미수행(요구사항 없음)'} · 탭 ${kit.tabs.length}개`);
    logger.info('case_pipeline_done', { caseId, elapsedMs, tabs: kit.tabs.length, partial, studioJobs: pipeline.studioJobs, studioRuns: pipeline.studioRuns, solarCalls: pipeline.solarCalls });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError('E_INTERNAL', undefined, { message: err?.message });
    caseRepo.updateProgressStep(caseId, step, 'failed', e.message);
    caseRepo.setCaseError(caseId, JSON.stringify(e.toEnvelope()));
    logger.error('case_pipeline_failed', { caseId, step, code: e.code, message: e.message, details: e.details });
    // 🔴 데모 공고만 손 fixture 로 — 그 사실은 meta.cached 로 화면에 그대로 나간다
    if (hasFixture(caseId)) caseRepo.setCaseSource(caseId, 'cached');
  }
}
