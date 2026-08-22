import { parseJson } from '../db/index.js';
import * as companyRepo from '../repositories/company.repo.js';
import { fetchNoticeList, normalizeNotice } from './g2b.service.js';
import { logger } from '../config/logger.js';

/**
 * 나라장터 목록으로 «값싼 스크리닝»을 돌린다 (기획안 S2~S4의 앞단).
 *
 * 🔴 이 단계는 **첨부를 읽지 않는다.** 목록 메타데이터만 본다.
 *    그래서 「자격 충족」을 선언할 수 없다 — 충족은 문서를 읽어야 알 수 있다.
 *    여기서 하는 일은 **근거가 확실한 제외**뿐이고, 나머지는 전부 추천으로 남긴다.
 *
 * 🔴 규율(기획안 5-5 · P_JUDGE):
 *    · 제외는 **근거가 있을 때만**. 각 제외에는 어느 필드가 그렇게 말했는지가 붙는다.
 *    · 「확인 필요」는 제외 사유가 아니다 — 못 읽어서 기회를 지우는 쪽이 더 나쁘다.
 *    · 값을 지어내지 않는다. 충족 수는 세지 않고 「미확인」으로 둔다.
 */

/** 회사 소재지에서 광역 단위를 뽑는다 (예: '서울특별시 강남구 …' → '서울') */
function regionOf(address) {
  if (!address) return null;
  const head = address.trim().split(/\s+/)[0] ?? '';
  return head.replace(/(특별자치시|특별자치도|특별시|광역시|자치도|자치시|도|시)$/u, '') || null;
}

function companyFacts(companyId) {
  const company = companyRepo.findCompany(companyId);
  if (!company) return null;

  const docs = companyRepo.listCompanyDocuments(companyId);
  const byKey = {};
  for (const d of docs) if (d.docClass) byKey[d.docClass] = d.extracted ?? {};

  const address = byKey.biz_reg?.['사업장소재지'] ?? byKey.biz_reg?.['본점소재지'] ?? null;
  return {
    id: company.id,
    name: company.name,
    address,
    region: regionOf(address),
    sizeClass: byKey.sme_cert?.company_size_classification ?? null,
    savedAt: parseJson(company.card_json, {}).savedAt ?? company.updated_at,
    docCount: docs.length,
  };
}

/** 오늘 이후에 마감하는가. 형식이 이상하면 «모른다»로 둔다(제외하지 않는다) */
function stillOpen(closeAt) {
  if (!closeAt) return null;
  const t = Date.parse(closeAt.replace(' ', 'T'));
  if (Number.isNaN(t)) return null;
  return t > Date.now();
}

/** 마감까지 남은 영업일 (주말만 제외). 🔴 공휴일은 반영하지 않는다 — 그 사실을 화면이 말한다 */
function businessDaysLeft(closeAt) {
  const t = closeAt ? Date.parse(closeAt.replace(' ', 'T')) : NaN;
  if (Number.isNaN(t)) return 0;
  let days = 0;
  const cur = new Date();
  cur.setHours(0, 0, 0, 0);
  const end = new Date(t);
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) days += 1;
  }
  return days;
}

/**
 * 🔴 근거가 확실한 제외만 한다. 각 규칙은 «어느 필드가 그렇게 말했는지»를 남긴다.
 * @returns {{reason:string, field:string}|null}
 */
function cheapExclusion(n, facts) {
  if (n.noticeKind.includes('취소')) {
    return { reason: `취소공고입니다. (공고종류 「${n.noticeKind}」)`, field: 'ntceKindNm' };
  }
  if (stillOpen(n.closeAt) === false) {
    return { reason: `마감이 지났습니다. (마감 ${n.closeAt})`, field: 'bidClseDt' };
  }
  // 지역제한 — 회사 소재지를 알 때만 판정한다. 모르면 «모른다»로 두고 제외하지 않는다
  if (n.regionLimitYn === 'Y' && n.regionName && facts.region) {
    if (!n.regionName.includes(facts.region)) {
      return {
        reason: `지역제한 — ${n.regionName}. 회사 소재 ${facts.region}`,
        field: 'jntcontrctDutyRgnNm',
      };
    }
  }
  return null;
}

export async function runLiveScreening(companyId, { shortlistLimit = 12, sampleLimit = 6 } = {}) {
  const facts = companyFacts(companyId);
  if (!facts) return null;

  const started = Date.now();
  const { scanned, total, items } = await fetchNoticeList();

  const shortlist = [];
  const excludedSamples = [];
  let excludedCheap = 0;

  for (const raw of items) {
    const n = normalizeNotice(raw);
    if (!n.bidNtceNo) continue;

    const ex = cheapExclusion(n, facts);
    if (ex) {
      excludedCheap += 1;
      if (excludedSamples.length < sampleLimit) {
        excludedSamples.push({
          caseId: `${n.bidNtceNo}-${n.bidNtceOrd}`,
          title: n.title,
          stage: 'cheap',
          reason: ex.reason,
          // 🔴 목록 메타데이터에서 판정했으므로 «쪽»이 없다. 0이면 화면이 「쪽 미상」으로 그린다
          page: 0,
        });
      }
      continue;
    }

    if (shortlist.length < shortlistLimit) {
      shortlist.push({
        caseId: `${n.bidNtceNo}-${n.bidNtceOrd}`,
        title: n.title,
        org: n.org,
        budget: n.budget || n.presumedPrice || '',
        deadline: n.closeAt,
        daysLeft: businessDaysLeft(n.closeAt),
        // 🔴 첨부를 읽지 않았으므로 «충족»을 선언하지 않는다
        matched: 0,
        unverified: 1,
        reasons: [
          {
            text: `${n.contractMethod || '계약방법 미상'} · ${n.successMethod || '낙찰방법 미상'}`,
            page: 0,
            docId: null,
            confidence: 'unknown',
          },
        ],
        decision: 'pending',
        factsheetUrl: `/api/cases/${n.bidNtceNo}-${n.bidNtceOrd}`,
      });
    }
  }

  const elapsedMs = Date.now() - started;
  logger.info('live_screening', { companyId, scanned, excludedCheap, shortlisted: shortlist.length, elapsedMs });

  // 🔴 실호출 결과를 저장한다. 안 하면 「응찰 준비」 게이트(PUT .../decision)가
  //    기록할 곳이 없어 404로 죽는다 — 실제로 그렇게 죽었다.
  const summary = {
    scanned,
    excludedCheap,
    parsed: 0,
    excluded: excludedCheap,
    shortlisted: shortlist.length,
    window: `최근 ${new Date().toISOString().slice(0, 10)} 기준 · 용역 · 전체 ${total}건 중 ${scanned}건 조회`,
  };
  const meta = {
    cached: false,
    listSource: 'openapi',
    elapsedMs,
    // 🔴 이 단계가 «무엇을 하지 않았는지»를 응답에 적는다
    note: '목록 메타데이터만으로 걸렀습니다. 첨부 문서는 아직 읽지 않아 자격 충족은 미확인입니다.',
  };
  const screeningId = `scr_${companyId}`;
  companyRepo.upsertScreening({ id: screeningId, companyId, status: 'done', summary, meta });

  // 🔴 이미 찍어 둔 사람 게이트를 실호출이 지우지 않는다
  const previous = Object.fromEntries(
    companyRepo.listScreeningItems(screeningId, 'shortlist').map((x) => [x.caseId, x.decision]),
  );
  const withDecisions = shortlist.map((s) => ({ ...s, decision: previous[s.caseId] ?? s.decision }));

  companyRepo.replaceScreeningItems(screeningId, 'shortlist', withDecisions);
  companyRepo.replaceScreeningItems(screeningId, 'excluded', excludedSamples);

  return {
    companyId,
    status: 'done',
    summary,
    shortlist: withDecisions,
    excludedSamples,
    meta,
  };
}
