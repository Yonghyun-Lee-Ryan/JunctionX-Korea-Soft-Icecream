import { AppError } from '../errors/AppError.js';
import { decomposeAnnouncement } from '../services/announcement.service.js';

// multer 가 latin1 로 준 한글 파일명을 되돌린다
const toFile = (f) => ({
  buffer: f.buffer,
  filename: Buffer.from(f.originalname, 'latin1').toString('utf8'),
  mimeType: f.mimetype || 'application/octet-stream',
});

export async function decompose(req, res) {
  const rfp = req.files?.rfp?.[0];
  const notice = req.files?.notice?.[0];
  if (!rfp) {
    throw new AppError('E_FILE_REQUIRED', '제안요청서 파일을 `rfp` 필드로 올려 주세요. 입찰공고서는 `notice` 필드로 함께 올리면 마감·제출방식이 채워집니다.');
  }
  res.json(await decomposeAnnouncement({ rfp: toFile(rfp), notice: notice ? toFile(notice) : undefined }));
}
