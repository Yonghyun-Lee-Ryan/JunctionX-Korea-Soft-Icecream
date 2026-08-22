import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { DOC_TYPE_MAP } from '../config/docTypes.js';
import * as caseRepo from '../repositories/case.repo.js';
import { insertCaseFile, listCaseFiles } from '../repositories/caseFile.repo.js';
import { looksLikePdf, extractPdfText, extractPdfPages } from './pdfText.service.js';
import { classifyByRules } from './classify.service.js';
import { rejudge } from './casePipeline.service.js';

/**
 * 케이스에 올린 파일 — 화면⑥ 파일제출·화면⑨ 보완요청의 「업로드」가 여기로 온다.
 *
 * 🔴 Studio 를 부르지 않는다. PDF 면 텍스트 레이어로 8갈래 규칙 분류만 하고(무료), 어느 서류용인지는 사람이 누른 줄(requirement)이 말한다.
 *    그 다음 제출 검사(Solar)만 다시 돌려 파일제출·제출준비 탭을 갱신한다 — 규칙은 저장본을 다시 쓰니 Solar 1회다.
 * 🔴 파일은 data/uploads/<caseId>/ 에 남긴다. 검사가 「보완 필요」라 해도 올린 사실은 지우지 않는다.
 */
const UPLOAD_DIR = path.join(ROOT, 'data', 'uploads');
const MIN_TEXT_CHARS = 120;

const safeName = (name) => String(name ?? 'file').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 120);

export function storeFile(caseId, { buffer, filename }) {
  const id = `cf_${crypto.randomUUID().slice(0, 12)}`;
  const dir = path.join(UPLOAD_DIR, safeName(caseId));
  fs.mkdirSync(dir, { recursive: true });
  const storagePath = path.join(dir, `${id}_${safeName(filename)}`);
  fs.writeFileSync(storagePath, buffer);
  return { id, storagePath };
}

/** PDF 면 텍스트로 갈래를 정한다. 못 읽으면 null — 올리기는 막지 않는다 */
export async function classifyUpload(buffer) {
  if (!looksLikePdf(buffer)) return { docTypeKey: null, textChars: 0, text: '' };
  try {
    const { text, chars } = await extractPdfText(buffer);
    if (chars < MIN_TEXT_CHARS) return { docTypeKey: null, textChars: chars, text };
    const cls = classifyByRules(text);
    return { docTypeKey: cls.key ?? null, textChars: chars, text };
  } catch (err) {
    logger.warn('case_file_classify_failed', { message: err?.message });
    return { docTypeKey: null, textChars: 0, text: '' };
  }
}

/**
 * 판정에 넣는 서류 목록 = 회사 카드 서류 + 이 케이스에 올린 제출 파일.
 * 🔴 올린 파일은 uploaded_for(어느 서류용인지)와 source:'upload' 를 달아 검사가 연결할 수 있게 한다.
 */
export function caseDocumentsFor(caseId, companyCard) {
  const base = Array.isArray(companyCard?.documents) ? companyCard.documents : [];
  const uploads = listCaseFiles(caseId, 'submission').map((f) => ({
    source_document: f.filename,
    docTypeKey: f.docTypeKey,
    document_kind: f.docTypeKey ? (DOC_TYPE_MAP[f.docTypeKey]?.label ?? f.docTypeKey) : '(종류를 읽지 못한 파일)',
    uploaded_for: f.requirementName ?? '',
    source: 'upload',
    uploaded_at: f.createdAt,
  }));
  return [...base, ...uploads];
}

export async function addSubmissionFile(caseId, { buffer, filename, mimeType, requirement }) {
  const row = caseRepo.findCase(caseId);
  if (!row) throw new AppError('E_CASE_NOT_FOUND');

  const { id, storagePath } = storeFile(caseId, { buffer, filename });
  const { docTypeKey, textChars } = await classifyUpload(buffer);
  const saved = insertCaseFile({
    id, caseId, kind: 'submission', filename, bytes: buffer.length, storagePath,
    requirementName: requirement ? String(requirement).trim() || null : null, docTypeKey, textChars,
  });
  logger.info('case_file_added', { caseId, id, filename, docTypeKey, requirement: saved.requirementName, mimeType });

  // 🔴 분석이 끝난 케이스만 다시 검사한다. 아직 도는 중이면 파일만 남긴다 — 파이프라인이 끝날 때 같이 본다
  if (row.status === 'done') await rejudge(caseId, { parts: ['submission'] });
  return saved;
}

/**
 * 제안서 원고 — 금지 표현 검사의 입력. 🔴 텍스트 레이어가 있는 PDF 만 받는다 (HWP·스캔본은 글자를 못 읽는다 — 받은 척하지 않는다).
 * 원고는 케이스당 하나만 본다(가장 최근). 올리면 스캔 + 검사(Solar 2회)만 다시 돈다.
 */
export async function addProposal(caseId, { buffer, filename, mimeType }) {
  const row = caseRepo.findCase(caseId);
  if (!row) throw new AppError('E_CASE_NOT_FOUND');

  if (!looksLikePdf(buffer)) {
    throw new AppError('E_UNSUPPORTED_FILE', '제안서 원고는 텍스트가 있는 PDF 로 올려 주세요. HWP·스캔 이미지는 아직 글자를 읽지 못합니다.', { filename, mimeType });
  }
  const { pages, chars } = await extractPdfPages(buffer);   // 손상된 PDF 면 여기서 E_UNSUPPORTED_FILE
  const text = pages.join('\n');
  if (chars < MIN_TEXT_CHARS) {
    throw new AppError('E_UNSUPPORTED_FILE', '이 PDF 에서 글자를 찾지 못했습니다. 스캔 이미지로만 된 원고는 검사하지 못합니다 — 텍스트가 있는 PDF 로 다시 올려 주세요.', { filename, chars });
  }

  const { id, storagePath } = storeFile(caseId, { buffer, filename });
  const saved = insertCaseFile({ id, caseId, kind: 'proposal', filename, bytes: buffer.length, storagePath, textChars: chars, text, pages });
  logger.info('case_proposal_added', { caseId, id, filename, chars });

  if (row.status === 'done') await rejudge(caseId, { parts: ['submission'] });
  return saved;
}

/** 밖으로 내보낼 모양 — 저장 경로·본문은 뺀다 */
export function publicCaseFile(f) {
  return { id: f.id, kind: f.kind, filename: f.filename, bytes: f.bytes, requirementName: f.requirementName, docTypeKey: f.docTypeKey, createdAt: f.createdAt };
}
