import { AppError } from '../errors/AppError.js';
import * as caseService from '../services/case.service.js';
import { addSubmissionFile, addProposal, publicCaseFile } from '../services/caseFiles.service.js';
import { listCaseFiles } from '../repositories/caseFile.repo.js';

// multer 가 latin1 로 준 한글 파일명을 되돌린다
const toFile = (f) => ({
  buffer: f.buffer,
  filename: Buffer.from(f.originalname, 'latin1').toString('utf8'),
  mimeType: f.mimetype || 'application/octet-stream',
});

/** 제출 서류 업로드 → 검사 재실행 → 갱신된 봉투 */
export async function upload(req, res) {
  if (!req.file) throw new AppError('E_FILE_REQUIRED', '올릴 파일을 `file` 필드로 보내 주세요. 어느 서류용인지는 `requirement` 필드(서류 이름)에.');
  const { caseId } = req.params;
  const requirement = typeof req.body?.requirement === 'string' ? req.body.requirement : undefined;
  await addSubmissionFile(caseId, { ...toFile(req.file), requirement });
  res.json(caseService.getFactsheet(caseId, { live: true }));
}

/** 제안서 원고 업로드 → 스캔·검사 재실행 → 갱신된 봉투 */
export async function uploadProposal(req, res) {
  if (!req.file) throw new AppError('E_FILE_REQUIRED', '제안서 원고(PDF)를 `file` 필드로 보내 주세요.');
  const { caseId } = req.params;
  await addProposal(caseId, toFile(req.file));
  res.json(caseService.getFactsheet(caseId, { live: true }));
}

export function list(req, res) {
  const { caseId } = req.params;
  if (!caseService.caseRepo.findCase(caseId)) throw new AppError('E_CASE_NOT_FOUND');
  res.json({ caseId, files: listCaseFiles(caseId).map(publicCaseFile) });
}
