import crypto from 'node:crypto';
import { AppError } from '../errors/AppError.js';
import { CARD_REQUIREMENTS, checkCardRequirements } from '../config/cardRequirements.js';
import { buildCardView, findCurrentCompany } from '../services/cardView.service.js';
import { DOC_TYPE_MAP } from '../config/docTypes.js';
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
export async function getScreening(req, res) {
  if (isLive(req)) {
    // 🔴 실호출을 먼저 시도하고, 안 되면 캐시로 떨어진다. 어느 쪽인지는 meta가 말한다
    const liveResult = await screeningService.getScreeningLive(req.params.companyId);
    if (liveResult) return res.json(liveResult);
  }
  const { envelope } = screeningService.getScreening(req.params.companyId, { live: isLive(req) });
  res.json(envelope);
}

/** 🚪 사람 게이트 */
export function putDecision(req, res) {
  const { companyId, caseId } = req.params;
  const { decision } = req.body ?? {};
  res.json(screeningService.setDecision(companyId, caseId, decision));
}


/** 카드 완성 요건표. 🔴 프론트가 이 표를 그대로 쓴다 — 두 벌로 갈라지지 않게 */
export function getCardRequirements(_req, res) {
  res.json({
    requirements: CARD_REQUIREMENTS.map((r) => ({
      ...r,
      labels: r.anyOf.map((k) => DOC_TYPE_MAP[k]?.label ?? k),
    })),
  });
}

/**
 * 회사 카드 저장.
 * 🔴 요건을 못 채우면 **저장하지 않는다.** 무엇이 빠졌는지 코드가 아니라 사람이 읽는 문장으로 돌려준다.
 */
export function saveCard(req, res) {
  const { companyId: given, name, bizNo, fields, documents } = req.body ?? {};

  if (!Array.isArray(documents) || documents.length === 0) {
    throw new AppError('E_VALIDATION', '저장할 서류가 없습니다. 서류를 먼저 올려 주세요.');
  }

  const presentKeys = documents.map((d) => d?.docTypeKey).filter(Boolean);
  const { complete, missing } = checkCardRequirements(presentKeys);
  if (!complete) {
    const names = missing.map((m) => m.field).join(' · ');
    const err = new AppError('E_CARD_INCOMPLETE', `아직 채워지지 않은 항목이 있습니다 — ${names}`);
    err.missing = missing;
    throw err;
  }

  const companyId = (given ?? '').trim() || `co_${crypto.randomUUID().slice(0, 8)}`;
  const card = {
    fields: fields ?? {},
    documents: documents.map((d) => ({
      docTypeKey: d.docTypeKey,
      filename: d.filename,
      uploadId: d.uploadId ?? null,
      confidence: d.confidence ?? null,
    })),
    savedAt: new Date().toISOString(),
  };

  companyRepo.upsertCompany({
    id: companyId,
    name: (name ?? '').trim() || '(문서에서 확인)',
    bizNo: bizNo ?? null,
    card,
  });

  // 🔴 다시 저장하면 서류 목록을 갈아 끼운다 — 이전 목록이 남아 쌓이지 않게
  companyRepo.replaceCompanyDocuments(
    companyId,
    documents.map((d) => ({
      id: crypto.randomUUID(),
      filename: d.filename ?? '',
      doc_class: d.docTypeKey ?? null,
      bytes: d.bytes ?? null,
      confidence: d.confidence ?? null,
      extracted_json: d.data ? JSON.stringify(d.data) : null,
    })),
  );

  res.status(201).json({
    companyId,
    savedAt: card.savedAt,
    documents: companyRepo.listCompanyDocuments(companyId),
    card,
  });
}


/**
 * 🔴 첫 진입 분기. 저장된 회사가 있으면 등록 화면이 아니라 카드로 보낸다.
 *    프론트가 «회사가 있나»를 스스로 판단하지 않게 서버가 알려 준다.
 */
export function getCurrentCompany(_req, res) {
  const row = findCurrentCompany();
  if (!row) {
    // 🔴 404가 아니라 200이다 — 「없음」은 오류가 아니라 정상 상태다
    return res.json({ exists: false, companyId: null });
  }
  res.json({ exists: true, companyId: row.id, name: row.name, savedAt: row.updated_at });
}

/** 저장된 회사 카드를 화면이 그대로 그릴 모양으로 */
export function getCardView(req, res) {
  res.json(buildCardView(req.params.companyId));
}
