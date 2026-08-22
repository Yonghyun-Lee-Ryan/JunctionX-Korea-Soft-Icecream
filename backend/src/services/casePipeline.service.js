import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { parseJson } from '../db/index.js';
import * as caseRepo from '../repositories/case.repo.js';
import * as companyRepo from '../repositories/company.repo.js';
import { loadFixture } from './fixture.service.js';
import { decomposeAnnouncement } from './announcement.service.js';
import { judgeEligibility, judgePlan, judgeSubmission } from './solarJudge.service.js';
import { buildKit } from './kit.service.js';

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

const NO_COMPANY_VERDICT = {
  badge: 'eligible', excluded: false, unverified: 0, decision: 'pending',
  headline: '회사 카드가 없어 참가자격은 판정하지 않았습니다 — 회사 서류를 올리면 판정합니다.',
  reasons: [],
};

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

    caseRepo.updateProgressStep(caseId, 1, 'done',
      `요구사항 ${announcement.requirements.length}건 · 참가자격 ${announcement.eligibility_rules.length}건 · 제출물 ${announcement.submission_requirements.length}건`);
    caseRepo.updateProgressStep(caseId, 2, 'done',
      notice ? `제안요청서 「${rfp.filename}」 · 입찰공고문 「${notice.filename}」` : `제안요청서 「${rfp.filename}」 — 입찰공고문 없음`);

    step = 3;
    caseRepo.updateProgressStep(caseId, 3, 'running');
    caseRepo.setCaseStatus(caseId, 'judging');

    const companyCard = companyCardFor(companyId);
    const [eligibility, plan, submission] = await Promise.all([
      companyCard ? judgeEligibility({ companyCard, announcement }) : null,
      judgePlan({ announcement }),
      companyCard ? judgeSubmission({ announcement, companyCard }) : null,
    ]);
    const kit = buildKit({ announcement, eligibility, plan, submission, caseId });

    // ── 저장 — 프론트가 읽는 봉투는 전부 DB 에서 나온다 ──
    caseRepo.clearTabs(caseId);
    kit.tabs.forEach((t, i) => caseRepo.upsertTab(caseId, t, i));
    caseRepo.clearDownloads(caseId);
    (kit.downloads ?? []).forEach((d, i) => caseRepo.upsertDownload(caseId, d, i));
    // 🔴 판정 원본도 남긴다 — 탭을 다시 그리거나 사람이 근거를 볼 때 Upstage 를 다시 부르지 않게
    caseRepo.deleteExtractions(caseId);
    caseRepo.insertExtraction(caseId, { schemaName: 'ANNOUNCEMENT_CORE_V1', payload: announcement });
    if (eligibility) caseRepo.insertExtraction(caseId, { schemaName: 'ELIGIBILITY_SCREENING_V1', payload: eligibility });
    caseRepo.insertExtraction(caseId, { schemaName: 'PLAN_V1', payload: plan });
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
      studioJobs: announcement.meta?.jobs?.length ?? 0,
      solarCalls: (eligibility ? 1 : 0) + (plan.meta?.calls ?? 3) + (submission?.meta?.calls ?? 0),
      companyId: companyId ?? null,
      documents: { rfp: rfp.filename, notice: notice?.filename ?? null, others: others.map((f) => f.filename) },
    };
    caseRepo.setCaseResult(caseId, {
      verdict: kit.verdict ?? NO_COMPANY_VERDICT,
      meta: { ...meta, header: Object.fromEntries(Object.entries(header).filter(([, v]) => v)), pipeline },
    });
    caseRepo.updateProgressStep(caseId, 3, 'done',
      `${eligibility ? `자격 ${eligibility.verdict}` : '자격 미판정(회사 없음)'} · WBS ${plan.wbs?.work_packages?.length ?? 0}건 · 탭 ${kit.tabs.length}개`);
    logger.info('case_pipeline_done', { caseId, elapsedMs, tabs: kit.tabs.length, studioJobs: pipeline.studioJobs, solarCalls: pipeline.solarCalls });
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError('E_INTERNAL', undefined, { message: err?.message });
    caseRepo.updateProgressStep(caseId, step, 'failed', e.message);
    caseRepo.setCaseError(caseId, JSON.stringify(e.toEnvelope()));
    logger.error('case_pipeline_failed', { caseId, step, code: e.code, message: e.message, details: e.details });
    // 🔴 데모 공고만 손 fixture 로 — 그 사실은 meta.cached 로 화면에 그대로 나간다
    if (hasFixture(caseId)) caseRepo.setCaseSource(caseId, 'cached');
  }
}
