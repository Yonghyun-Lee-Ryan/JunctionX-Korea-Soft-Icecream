import { AppError } from '../errors/AppError.js';
import { processUpload } from '../services/docs.service.js';
import { agentCoverage } from '../config/agents.js';
import { DOC_TYPES } from '../config/docTypes.js';

/** 지원 문서 8종과 에이전트 연결 상태 */
export function listDocTypes(_req, res) {
  const coverage = Object.fromEntries(agentCoverage().map((c) => [c.key, c]));
  res.json({
    docTypes: DOC_TYPES.map((t) => ({
      key: t.key,
      label: t.label,
      titles: t.title,
      agentConfigured: coverage[t.key]?.configured ?? false,
      agentEnv: t.agentEnv,
    })),
  });
}

export async function upload(req, res) {
  const file = req.file;
  if (!file) throw new AppError('E_FILE_REQUIRED');

  // multer가 latin1로 준 한글 파일명을 되돌린다
  const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');

  const result = await processUpload({
    buffer: file.buffer,
    filename,
    mimeType: file.mimetype || 'application/pdf',
  });
  res.json(result);
}
