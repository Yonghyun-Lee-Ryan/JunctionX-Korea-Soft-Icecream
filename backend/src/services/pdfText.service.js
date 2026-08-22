import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../errors/AppError.js';

const PDF_MAGIC = Buffer.from('%PDF-');

export function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 5).equals(PDF_MAGIC);
}

/**
 * PDF에서 텍스트 레이어를 뽑는다.
 * 🔴 스캔본이면 텍스트가 거의 없다 — 그 사실을 숨기지 않고 chars로 돌려준다.
 *    호출부가 「너무 적으면 규칙 분류를 포기한다」를 판단한다.
 */
export async function extractPdfText(buffer) {
  if (!looksLikePdf(buffer)) {
    throw new AppError('E_UNSUPPORTED_FILE');
  }
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    return { pages: totalPages, text: text ?? '', chars: (text ?? '').length };
  } catch (err) {
    throw new AppError('E_UNSUPPORTED_FILE', 'PDF를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.', { cause: err?.message });
  }
}
