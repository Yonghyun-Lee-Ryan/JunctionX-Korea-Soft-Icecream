import { parseJson } from '../db/index.js';
import * as repo from '../repositories/company.repo.js';
import { AppError } from '../errors/AppError.js';
import { loadFixture, stripComments } from './fixture.service.js';
import { runLiveScreening } from './liveScreening.service.js';
import { hasOpenApiKey } from './g2b.service.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

/**
 * screening.envelope.json 모양으로 조립한다.
 * 🔴 summary(분모)를 반드시 담는다 — 「127건을 훑어 3건」이 이 제품의 문장이다.
 */
/**
 * 🔴 실호출과 캐시의 갈림길은 **여기 한 곳**이다.
 *    키가 있고 `?live=1`이면 나라장터를 실제로 훑고, 실패하면 «조용히» 캐시로 떨어진다 —
 *    데모가 죽는 것보다 낫고, 대신 `meta.cached`로 그 사실을 반드시 알린다.
 */
export async function getScreeningLive(companyId) {
  if (!hasOpenApiKey()) return null;
  try {
    return await runLiveScreening(companyId);
  } catch (err) {
    logger.warn('live_screening_failed', { companyId, message: err?.message });
    return null;
  }
}

export function getScreening(companyId, { live = false } = {}) {
  const row = repo.findLatestScreening(companyId);

  if (!row) {
    // 🔴 회사가 DB에 있는데 스크리닝 기록만 없는 것과, 회사 자체가 없는 것은 다르다
    const company = repo.findCompany(companyId);
    const cached = cachedScreening(companyId);
    if (company && cached) return cached;
    if (!company) throw new AppError('E_COMPANY_NOT_FOUND');
    if (cached) return cached;
    throw new AppError('E_NOT_CONFIGURED', '공고 목록을 만들 수 없습니다. 나라장터 인증키를 설정해 주세요.');
  }

  const meta = parseJson(row.meta_json, {});
  const cachedMode = !env.studio.apiKey || (!live && !env.g2b.serviceKey);

  const envelope = {
    companyId: row.company_id,
    status: row.status,
    summary: parseJson(row.summary_json, { scanned: 0, excluded: 0, shortlisted: 0 }),
    shortlist: repo.listScreeningItems(row.id, 'shortlist'),
    excludedSamples: repo.listScreeningItems(row.id, 'excluded'),
    meta: {
      cached: cachedMode,
      listSource: env.g2b.serviceKey && live ? 'openapi' : 'cached',
      ...meta,
    },
  };
  envelope.summary.shortlisted = envelope.shortlist.length;

  const error = parseJson(row.error_json, null);
  if (error) envelope.error = error;
  return { envelope, screeningId: row.id };
}

/**
 * 🔴 나라장터 OpenAPI 키가 아직 없다. 그동안은 **저장된 회사라면 누구에게나** 캐시 목록을 준다.
 *    예전엔 픽스처의 companyId(co_daon_demo)와 다르면 통째로 버려서, 방금 저장한 회사가
 *    404를 받았다 — 화면이 「회사를 못 찾음」으로 잘못 말하게 된다.
 *    🔴 대신 meta.cached·listSource로 «실호출이 아니다»를 반드시 알린다.
 */
function cachedScreening(companyId) {
  const fx = loadFixture('screening.demo');
  if (!fx) return null;
  const clean = stripComments(fx);
  // 요청한 회사 것으로 갈아 끼운다 — 목록 내용은 캐시 그대로다
  clean.companyId = companyId ?? clean.companyId;
  clean.meta = { ...(clean.meta ?? {}), cached: true, listSource: 'cached' };
  return { envelope: clean, screeningId: null };
}

/** 🚪 사람 게이트 — go를 찍은 건만 S5 이후가 돈다 */
export function setDecision(companyId, caseId, decision) {
  if (!['pending', 'go', 'skip'].includes(decision)) {
    throw new AppError('E_VALIDATION', "decision은 pending · go · skip 중 하나여야 합니다.");
  }
  const row = repo.findLatestScreening(companyId);
  if (!row) throw new AppError('E_COMPANY_NOT_FOUND');
  if (!repo.setDecision(row.id, caseId, decision)) throw new AppError('E_CASE_NOT_FOUND');
  return { companyId, caseId, decision };
}

export { repo as companyRepo };
