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

  const caseId = caseService.createCase({ bidPbancNo, bidPbancOrd, companyId });

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
      caseRepo.upsertCase({ id: caseId, bid_pbanc_no: bidPbancNo, bid_pbanc_ord: String(bidPbancOrd).padStart(3, '0'), status: 'failed', error_json: JSON.stringify(e.toEnvelope()) });
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

  const buffer = await buildXlsx([tab]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', contentDisposition(`${tab.title || tabId}.xlsx`));
  res.send(buffer);
}
