import { AppError } from '../errors/AppError.js';
import { buildCompanyCard } from '../services/companyCard.service.js';

// multer 가 latin1 로 준 한글 파일명을 되돌린다 — 이 이름이 그대로 source_document 가 된다
const toFile = (f) => ({
  buffer: f.buffer,
  filename: Buffer.from(f.originalname, 'latin1').toString('utf8'),
  mimeType: f.mimetype || 'application/pdf',
});

export async function build(req, res) {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    throw new AppError('E_FILE_REQUIRED', '회사 서류를 `documents` 필드로 올려 주세요. 여러 장을 한 번에 올릴 수 있습니다 (사업자등록증·실적증명서·재무제표 …).');
  }
  res.json(await buildCompanyCard({ documents: files.map(toFile) }));
}
