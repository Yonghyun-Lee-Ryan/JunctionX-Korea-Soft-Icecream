import { parseJson } from '../db/index.js';
import * as repo from '../repositories/company.repo.js';
import { AppError } from '../errors/AppError.js';
import { loadFixture, stripComments } from './fixture.service.js';
import { env } from '../config/env.js';

/**
 * screening.envelope.json 모양으로 조립한다.
 * 🔴 summary(분모)를 반드시 담는다 — 「127건을 훑어 3건」이 이 제품의 문장이다.
 */
export function getScreening(companyId, { live = false } = {}) {
  const row = repo.findLatestScreening(companyId);

  if (!row) {
    const cached = cachedScreening(companyId);
    if (cached) return cached;
    throw new AppError('E_COMPANY_NOT_FOUND');
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

function cachedScreening(companyId) {
  const fx = loadFixture('screening.demo');
  if (!fx) return null;
  const clean = stripComments(fx);
  if (clean.companyId && companyId && clean.companyId !== companyId) return null;
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
