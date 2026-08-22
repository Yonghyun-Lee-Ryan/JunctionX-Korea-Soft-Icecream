import { AppError } from '../errors/AppError.js';
import * as caseService from '../services/case.service.js';
import { caseRepo } from '../services/case.service.js';
import { collectAttachments } from '../services/g2b.service.js';
import { buildXlsx, contentDisposition } from '../services/xlsx.service.js';
import { logger } from '../config/logger.js';

const isLive = (req) => req.query.live === '1' || req.query.live === 'true';

export function listCases(_req, res) {
  res.json({ cases: caseRepo.listCases().map((c) => ({ caseId: c.id, status: c.status, source: c.source, updatedAt: c.updated_at })) });
}

export async function createCase(req, res) {
  const { bidPbancNo, bidPbancOrd = '000', companyId = null } = req.body ?? {};
  if (!bidPbancNo || !/^[A-Za-z0-9-]{6,}$/.test(String(bidPbancNo))) {
    throw new AppError('E_VALIDATION', '공고번호를 확인해 주세요. 예) R25BK00645031');
  }

  const { caseId, demo } = caseService.createCase({ bidPbancNo, bidPbancOrd, companyId });

  // 🔴 데모 공고는 나라장터에 가지 않는다. 첨부가 있을 리 없어 매번 E_UPSTREAM_G2B로 죽고,
  //    그 실패가 케이스를 live로 되돌려 픽스처를 가렸다.
  if (demo) {
    res.status(202).json(caseService.getFactsheet(caseId));
    return;
  }

  // 🔴 첨부 수집은 응답을 막지 않는다. 화면②가 폴링으로 따라온다
  collectAttachments(bidPbancNo, bidPbancOrd)
    .then((files) => {
      files.forEach((f) => caseRepo.upsertAttachment(caseId, {
        file_seq: f.fileSeq, filename: f.filename, bytes: f.bytes,
      }));
      caseRepo.updateProgressStep(caseId, 0, 'done', `첨부 ${files.length}건`);
      caseRepo.updateProgressStep(caseId, 1, 'running');
      caseRepo.setCaseStatus(caseId, 'parsing');
      logger.info('case_collected', { caseId, files: files.length });
    })
    .catch((err) => {
      caseRepo.updateProgressStep(caseId, 0, 'failed');
      caseRepo.setCaseStatus(caseId, 'failed');
      const e = err instanceof AppError ? err : new AppError('E_UPSTREAM_G2B');
      // 🔴 upsertCase가 아니다 — 그건 빠진 칸을 기본값으로 덮어써 회사·판정·출처를 지운다
      caseRepo.setCaseError(caseId, JSON.stringify(e.toEnvelope()));
      logger.error('case_collect_failed', { caseId, code: e.code });
    });

  res.status(202).json(caseService.getFactsheet(caseId, { live: true }));
}

export function getCase(req, res) {
  res.json(caseService.getFactsheet(req.params.caseId, { live: isLive(req) }));
}

export async function downloadTab(req, res) {
  const { caseId } = req.params;
  // `:file` 은 `wbs.xlsx` 처럼 들어온다
  const tabId = String(req.params.file).replace(/\.xlsx$/i, '');

  const envelope = caseService.getFactsheet(caseId, { live: isLive(req) });
  const tab = (envelope.tabs ?? []).find((t) => t.id === tabId);
  if (!tab) throw new AppError('E_TAB_NOT_FOUND');
  // 🔴 metric·banner·note·tasks·docs에는 columns/rows가 없다. 그대로 xlsx로 만들면
  //    200 OK로 «빈 파일»이 내려가 사람이 내용을 잃었는지 원래 없었는지 알 수 없다.
  if (!Array.isArray(tab.rows) || tab.rows.length === 0) throw new AppError('E_TAB_NOT_TABULAR');

  const buffer = await buildXlsx([tab]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', contentDisposition(`${tab.title || tabId}.xlsx`));
  res.send(buffer);
}
