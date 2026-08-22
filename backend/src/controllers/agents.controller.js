import { AppError } from '../errors/AppError.js';
import {
  runAnnouncementDecomposition,
  runCompanyBidFit,
  runSubmissionCompliance,
  runWpsCpDecomposer,
} from '../services/workflowAgents.service.js';

function uploadedFile(req) {
  if (!req.file) throw new AppError('E_FILE_REQUIRED', '분석할 파일을 올려 주세요.');
  return {
    buffer: req.file.buffer,
    filename: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    mimeType: req.file.mimetype || 'application/octet-stream',
  };
}

export async function announcementDecomposition(req, res) {
  res.json(await runAnnouncementDecomposition(uploadedFile(req)));
}

export async function companyBidFit(req, res) {
  res.type('text/plain').send(await runCompanyBidFit(uploadedFile(req)));
}

export async function wpsCpDecomposer(req, res) {
  res.json(await runWpsCpDecomposer(uploadedFile(req)));
}

export async function submissionCompliance(req, res) {
  res.json(await runSubmissionCompliance(uploadedFile(req)));
}
