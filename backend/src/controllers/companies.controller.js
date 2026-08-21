import crypto from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import * as screeningService from '../services/screening.service.js';
import { companyRepo } from '../services/screening.service.js';

const isLive = (req) => req.query.live === '1' || req.query.live === 'true';

/** S1 — 회사 서류 업로드 → 회사 카드 생성 */
export function createCompany(req, res) {
  const files = req.files ?? [];
  const name = (req.body?.name ?? '').trim();
  if (!name && files.length === 0) {
    throw new AppError('E_VALIDATION', '회사 서류를 한 건 이상 올리거나 회사명을 입력해 주세요.');
  }

  const companyId = (req.body?.companyId ?? '').trim() || `co_${crypto.randomUUID().slice(0, 8)}`;
  companyRepo.upsertCompany({ id: companyId, name: name || '(문서에서 확인 중)', bizNo: req.body?.bizNo, card: {} });

  for (const f of files) {
    companyRepo.insertCompanyDocument(companyId, {
      id: crypto.randomUUID(),
      filename: Buffer.from(f.originalname, 'latin1').toString('utf8'),
      bytes: f.size,
      doc_class: null,
    });
  }

  res.status(201).json({
    companyId,
    name: name || null,
    documents: companyRepo.listCompanyDocuments(companyId),
  });
}

export function getCompany(req, res) {
  const row = companyRepo.findCompany(req.params.companyId);
  if (!row) throw new AppError('E_COMPANY_NOT_FOUND');
  res.json({
    companyId: row.id,
    name: row.name,
    bizNo: row.biz_no,
    card: JSON.parse(row.card_json || '{}'),
    documents: companyRepo.listCompanyDocuments(row.id),
  });
}

/** S2~S4 — 추천 공고 목록 (분모 포함) */
export function getScreening(req, res) {
  const { envelope } = screeningService.getScreening(req.params.companyId, { live: isLive(req) });
  res.json(envelope);
}

/** 🚪 사람 게이트 */
export function putDecision(req, res) {
  const { companyId, caseId } = req.params;
  const { decision } = req.body ?? {};
  res.json(screeningService.setDecision(companyId, caseId, decision));
}
