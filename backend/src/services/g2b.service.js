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
