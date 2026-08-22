import { parseJson } from '../db/index.js';
import * as repo from '../repositories/case.repo.js';
import { AppError } from '../errors/AppError.js';
import { loadFixture, stripComments } from './fixture.service.js';
import { KIT_PAGES, KIT_PRIMARY_ACTION, KIT_SECONDARY_ACTION } from '../config/kitPages.js';
import { env } from '../config/env.js';
import { isFresh, pipelineConfigured } from './casePipeline.service.js';
import { deadlineStatus } from './deadline.service.js';
import { listAllChecks } from '../repositories/caseCheck.repo.js';

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
    if (cached) return { ...cached, tabs: withChecks(caseId, cached.tabs) };
  }

  const meta = parseJson(row.meta_json, {});
  const { header, ...metaRest } = meta;
  const envelope = {
    caseId: row.id,
    // 헤더용 제목·발주기관·마감 — 파이프라인이 공고 해부에서 적어 둔 것
    ...(header ?? {}),
    status: row.status,
    progress: repo.listProgress(caseId),
    verdict: parseJson(row.verdict_json, { badge: 'eligible' }),
    // 🔴 체크는 탭과 따로 저장된다 — 읽을 때 붙인다. 체크가 있는 탭에만 checked[] 를 만든다
    tabs: withChecks(caseId, repo.listTabs(caseId)),
    downloads: repo.listDownloads(caseId),
    meta: {
      // 🔴 «캐시를 썼다»가 아니라 «캐시로 만들어진 케이스다»만 말하던 값이다.
      //    ?live=1로 DB 분기를 타 열화된 봉투를 받아도 true라, 화면은 자기가 받은 게
      //    픽스처인지 DB인지 구분할 수 없었다. 실제로 판 분기를 적는다.
      cached: false,
      source: row.source,
      agentId: env.studio.agentId || undefined,
      configVersion: env.studio.configVersion || undefined,
      ...metaRest,
      attachments: repo.listAttachments(caseId),
      // 🔴 탭 배치도 서버가 준다 — 프론트가 tab id로 분기하지 않게
      kitPages: KIT_PAGES,
      kitPrimaryAction: KIT_PRIMARY_ACTION,
      kitSecondaryAction: KIT_SECONDARY_ACTION,
    },
  };
  // 🔴 마감은 읽는 시점에 계산한다 — 저장된 D-값은 하루만 지나도 틀린다. 못 읽으면 필드를 만들지 않는다
  const dl = deadlineStatus(header?.deadline);
  if (dl.passed !== null) {
    envelope.deadlineAt = dl.deadlineAt;
    envelope.deadlinePassed = dl.passed;
    envelope.daysLeft = dl.businessDaysLeft;
  }
  const error = parseJson(row.error_json, null);
  if (error) envelope.error = error;
  return envelope;
}

/** 서버가 기억하는 체크를 탭에 싣는다 — 없는 탭은 필드를 만들지 않는다 */
function withChecks(caseId, tabs) {
  const checks = listAllChecks(caseId);
  if (!Object.keys(checks).length) return tabs;
  return (Array.isArray(tabs) ? tabs : []).map((t) => (checks[t?.id] ? { ...t, checked: checks[t.id] } : t));
}

function cachedFactsheet(caseId) {
  const fx = loadFixture('factsheet.demo');
  if (!fx) return null;
  const clean = stripComments(fx);
  if (clean.caseId && clean.caseId !== caseId) return null;
  clean.meta = {
    ...(clean.meta ?? {}),
    cached: true,
    source: 'cached',
    kitPages: KIT_PAGES,
    kitPrimaryAction: KIT_PRIMARY_ACTION,
    kitSecondaryAction: KIT_SECONDARY_ACTION,
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

export function createCase({ bidPbancNo, bidPbancOrd = '000', companyId = null, refresh = false }) {
  const caseId = toCaseId(bidPbancNo, bidPbancOrd);

  // 🔴 Upstage 크레딧 — 7일 안에 끝난 케이스는 다시 돌리지 않는다. 첨부도 다시 받지 않는다
  const existing = repo.findCase(caseId);
  if (existing && !refresh && existing.status === 'done' && isFresh(parseJson(existing.meta_json, {}))) {
    return { caseId, demo: existing.source === 'cached', reuse: true };
  }

  // 🔴 데모 공고는 데모로 남는다. 픽스처가 있는 공고번호를 live로 만들면 첨부 수집이
  //    끝날 때까지 빈 화면이 뜨고, 그게 «아직 안 만들었다»인지 «못 읽었다»인지 알 수 없다.
  //    캐시라는 사실은 meta.cached로 화면에 그대로 나간다 — 숨기는 게 아니다.
  //    🔴 단, 정운 계정 키가 있으면 데모 공고도 실제로 돌린다 — 실패하면 파이프라인이 fixture 로 되돌린다
  const demo = cachedFactsheet(caseId) !== null && !pipelineConfigured();

  repo.upsertCase({
    id: caseId,
    bid_pbanc_no: bidPbancNo,
    bid_pbanc_ord: String(bidPbancOrd).padStart(3, '0'),
    company_id: companyId,
    status: demo ? 'done' : 'collecting',
    source: demo ? 'cached' : 'live',
  });
  if (demo) {
    // 🔴 지난 판에서 만들어 둔 탭이 픽스처를 가린다 — 데모로 되돌릴 때 치운다
    repo.clearTabs(caseId);
    repo.replaceProgress(caseId, cachedFactsheet(caseId).progress ?? []);
  } else {
    // 🔴 지난 판의 탭이 새 결과가 나올 때까지 화면에 남지 않게
    repo.clearTabs(caseId);
    repo.clearDownloads(caseId);
    repo.replaceProgress(caseId, DEFAULT_PROGRESS);
  }
  return { caseId, demo, reuse: false };
}

export { repo as caseRepo };
