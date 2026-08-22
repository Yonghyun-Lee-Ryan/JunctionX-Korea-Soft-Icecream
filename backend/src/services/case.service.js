import { parseJson } from '../db/index.js';
import * as repo from '../repositories/case.repo.js';
import { AppError } from '../errors/AppError.js';
import { loadFixture, stripComments } from './fixture.service.js';
import { KIT_PAGES, KIT_PRIMARY_ACTION } from '../config/kitPages.js';
import { env } from '../config/env.js';

/** caseId = 공고번호-차수 */
export function toCaseId(bidPbancNo, bidPbancOrd = '000') {
  return `${String(bidPbancNo).trim()}-${String(bidPbancOrd).trim().padStart(3, '0')}`;
}

export function parseCaseId(caseId) {
  const idx = String(caseId).lastIndexOf('-');
  if (idx < 1) throw new AppError('E_VALIDATION', '공고번호-차수 형식이 아닙니다. 예) R25BK00645031-000');
  return { bidPbancNo: caseId.slice(0, idx), bidPbancOrd: caseId.slice(idx + 1) };
}

/**
 * 🔴 봉투 조회는 이 함수 하나를 통한다 (WBS 3.5).
 *    xlsx 라우트도 DB를 직접 보지 않고 여기를 부른다 — 캐시 분기가 한 곳에만 있게.
 */
export function getFactsheet(caseId, { live = false } = {}) {
  const row = repo.findCase(caseId);

  if (!row) {
    // 캐시 폴백 — 데모 케이스면 픽스처를 그대로 준다
    const cached = cachedFactsheet(caseId);
    if (cached) return cached;
    throw new AppError('E_CASE_NOT_FOUND');
  }

  if (row.source === 'cached' && !live) {
    const cached = cachedFactsheet(caseId);
    if (cached) return cached;
  }

  const meta = parseJson(row.meta_json, {});
  const envelope = {
    caseId: row.id,
    status: row.status,
    progress: repo.listProgress(caseId),
    verdict: parseJson(row.verdict_json, { badge: 'eligible' }),
    tabs: repo.listTabs(caseId),
    downloads: repo.listDownloads(caseId),
    meta: {
      cached: row.source === 'cached',
      agentId: env.studio.agentId || undefined,
      configVersion: env.studio.configVersion || undefined,
      ...meta,
      attachments: repo.listAttachments(caseId),
      // 🔴 탭 배치도 서버가 준다 — 프론트가 tab id로 분기하지 않게
      kitPages: KIT_PAGES,
      kitPrimaryAction: KIT_PRIMARY_ACTION,
    },
  };
  const error = parseJson(row.error_json, null);
  if (error) envelope.error = error;
  return envelope;
}

function cachedFactsheet(caseId) {
  const fx = loadFixture('factsheet.demo');
  if (!fx) return null;
  const clean = stripComments(fx);
  if (clean.caseId && clean.caseId !== caseId) return null;
  clean.meta = {
    ...(clean.meta ?? {}),
    cached: true,
    kitPages: KIT_PAGES,
    kitPrimaryAction: KIT_PRIMARY_ACTION,
  };
  return clean;
}

/** 화면②가 기대하는 4줄. 🔴 응답 첫 순간부터 전부 내보낸다 */
export const DEFAULT_PROGRESS = [
  { step: '첨부 수집', state: 'running' },
  { step: '문서 읽기', state: 'pending' },
  { step: '문서 종류 분류', state: 'pending' },
  { step: '요구사항 추출·판정', state: 'pending' },
];

export function createCase({ bidPbancNo, bidPbancOrd = '000', companyId = null }) {
  const caseId = toCaseId(bidPbancNo, bidPbancOrd);
  repo.upsertCase({
    id: caseId,
    bid_pbanc_no: bidPbancNo,
    bid_pbanc_ord: String(bidPbancOrd).padStart(3, '0'),
    company_id: companyId,
    status: 'collecting',
    source: 'live',
  });
  repo.replaceProgress(caseId, DEFAULT_PROGRESS);
  return caseId;
}

export { repo as caseRepo };
