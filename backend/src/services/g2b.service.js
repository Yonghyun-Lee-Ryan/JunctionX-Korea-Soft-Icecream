import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

/**
 * 나라장터 첨부 수집. 2026-08-22 실호출로 확인된 동작:
 *  🟢 인증 불필요 (쿠키·로그인·API 키 전부 없음)
 *  🔴 User-Agent가 없으면 HTTP 500
 *  🟢 HTTP 422 = 「파일이 존재하지 않습니다」 = 종료 신호
 *  🔴 content-disposition의 파일명이 percent-encoded UTF-8 → 디코딩 필수
 */
export function decodeFilename(contentDisposition, fallback) {
  if (!contentDisposition) return fallback;

  // RFC 5987: filename*=UTF-8''%ED%95%9C%EA%B8%80.hwp
  const ext = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(contentDisposition);
  if (ext) { try { return decodeURIComponent(ext[2].trim()); } catch { /* 아래로 */ } }

  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
  if (plain) {
    const raw = plain[1].trim();
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return fallback;
}

async function fetchOne(bidPbancNo, bidPbancOrd, fileSeq) {
  const url = new URL(env.g2b.downloadUrl);
  url.searchParams.set('bidPbancNo', bidPbancNo);
  url.searchParams.set('bidPbancOrd', bidPbancOrd);
  url.searchParams.set('fileType', '');
  url.searchParams.set('fileSeq', String(fileSeq));

  const res = await fetch(url, { headers: { 'User-Agent': env.g2b.userAgent } });

  if (res.status === 422) return { done: true };          // 🟢 종료 신호
  if (!res.ok) throw new AppError('E_UPSTREAM_G2B', undefined, { status: res.status, fileSeq });

  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = decodeFilename(res.headers.get('content-disposition'), `${bidPbancNo}-${fileSeq}.bin`);
  return { done: false, fileSeq, filename, bytes: buffer.length, buffer };
}

/**
 * fileSeq 1..N 루프. 422를 만나면 멈춘다.
 * @returns {Promise<Array<{fileSeq:number, filename:string, bytes:number, buffer:Buffer}>>}
 */
export async function collectAttachments(bidPbancNo, bidPbancOrd = '000', { maxFileSeq = env.g2b.maxFileSeq } = {}) {
  const files = [];
  for (let seq = 1; seq <= maxFileSeq; seq += 1) {
    const r = await fetchOne(bidPbancNo, bidPbancOrd, seq);
    if (r.done) {
      logger.info('g2b_collect_end', { bidPbancNo, bidPbancOrd, collected: files.length, stoppedAt: seq });
      break;
    }
    files.push(r);
    logger.info('g2b_file', { fileSeq: r.fileSeq, filename: r.filename, bytes: r.bytes });
  }
  if (files.length === 0) throw new AppError('E_NO_ATTACHMENT');
  return files;
}

// ─────────────────────────────────────────────────────────────
// 조달청 OpenAPI — 공고 목록
// 🔴 2026-08-22 실호출로 확정한 것:
//    · `/1230000/**ad**/BidPublicInfoService/...` 만 유효하다.
//      구 경로 `/1230000/BidPublicInfoService/...` 는 **코드 12로 폐기**됐다.
//    · resultCode "00" 이 정상. 오류는 HTTP 200으로도 온다 — 본문을 봐야 한다.
//    · 응답 한 건에 필드가 113개다. 우리가 쓰는 것만 골라 좁힌다.
// ─────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d, end = false) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${end ? '2359' : '0000'}`;

export function hasOpenApiKey() {
  return Boolean(env.g2b.serviceKey);
}

/**
 * 용역 공고 목록. 여러 쪽을 이어 받되 listMaxRows에서 멈춘다.
 * @returns {Promise<{scanned:number, total:number, items:object[]}>}
 */
export async function fetchNoticeList({ windowDays = env.g2b.listWindowDays, maxRows = env.g2b.listMaxRows } = {}) {
  if (!hasOpenApiKey()) throw new AppError('E_NOT_CONFIGURED', '나라장터 인증키가 없습니다.');

  const to = new Date();
  const from = new Date(to.getTime() - windowDays * 86400000);
  const rowsPerPage = Math.min(100, maxRows);

  const items = [];
  let total = 0;

  for (let page = 1; items.length < maxRows; page += 1) {
    const url = new URL(`${env.g2b.openApiBase}/BidPublicInfoService/getBidPblancListInfoServcPPSSrch`);
    url.searchParams.set('serviceKey', env.g2b.serviceKey);
    url.searchParams.set('pageNo', String(page));
    url.searchParams.set('numOfRows', String(rowsPerPage));
    url.searchParams.set('type', 'json');
    url.searchParams.set('inqryDiv', '1');
    url.searchParams.set('inqryBgnDt', stamp(from));
    url.searchParams.set('inqryEndDt', stamp(to, true));

    const res = await fetch(url, { headers: { 'User-Agent': env.g2b.userAgent } });
    if (!res.ok) throw new AppError('E_UPSTREAM_G2B', undefined, { stage: 'list', status: res.status, page });

    const json = await res.json().catch(() => null);
    // 🔴 오류가 HTTP 200으로 온다 — resultCode를 반드시 본다
    const header = json?.response?.header;
    if (!header) {
      const err = json?.OpenAPI_ServiceResponse?.cmmMsgHeader;
      throw new AppError('E_UPSTREAM_G2B',
        `나라장터 목록 조회에 실패했습니다. (${err?.returnAuthMsg ?? '응답 형식 오류'})`,
        { stage: 'list', code: err?.returnReasonCode });
    }
    if (header.resultCode !== '00') {
      throw new AppError('E_UPSTREAM_G2B',
        `나라장터가 오류를 돌려주었습니다. (${header.resultMsg ?? header.resultCode})`,
        { stage: 'list', code: header.resultCode });
    }

    const body = json.response.body ?? {};
    total = Number(body.totalCount ?? 0) || total;
    const page_items = Array.isArray(body.items) ? body.items : [];
    if (page_items.length === 0) break;

    items.push(...page_items);
    if (items.length >= total) break;
  }

  logger.info('g2b_list', { total, fetched: items.length, windowDays });
  return { scanned: items.length, total, items: items.slice(0, maxRows) };
}

/** 113개 필드에서 우리가 쓰는 것만 */
export function normalizeNotice(raw) {
  const s = (k) => (raw[k] ?? '').toString().trim();
  return {
    bidNtceNo: s('bidNtceNo'),
    bidNtceOrd: s('bidNtceOrd') || '000',
    title: s('bidNtceNm'),
    org: s('dminsttNm') || s('ntceInsttNm'),
    noticeInstitution: s('ntceInsttNm'),
    noticeAt: s('bidNtceDt'),
    closeAt: s('bidClseDt') || s('opengDt'),
    openAt: s('opengDt'),
    presumedPrice: s('presmptPrce'),
    budget: s('asignBdgtAmt'),
    contractMethod: s('cntrctCnclsMthdNm'),
    noticeKind: s('ntceKindNm'),
    successMethod: s('sucsfbidMthdNm'),
    detailUrl: s('bidNtceDtlUrl'),
    // 자격 제한 플래그 — 🔴 제외 판정의 «근거»가 되는 칸들
    regionLimitYn: s('cmmnSpldmdCorpRgnLmtYn'),
    regionName: [s('jntcontrctDutyRgnNm1'), s('jntcontrctDutyRgnNm2'), s('jntcontrctDutyRgnNm3')]
      .filter(Boolean).join(' · '),
    regionBasisName: s('rgnLmtBidLocplcJdgmBssNm'),
    bidLimitYn: s('bidPrtcptLmtYn'),
    industryLimitYn: s('indstrytyLmtYn'),
    designatedCompetitionYn: s('dsgntCmptYn'),
    performanceCompetitionYn: s('arsltCmptYn'),
  };
}
