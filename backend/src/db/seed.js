import { migrate } from './migrate.js';
import { closeDb } from './index.js';
import { logger } from '../config/logger.js';
import { loadFixture, stripComments } from '../services/fixture.service.js';
import * as caseRepo from '../repositories/case.repo.js';
import * as companyRepo from '../repositories/company.repo.js';

migrate();

// ── 팩트시트 데모 1건 ────────────────────────────────────────
const fs0 = loadFixture('factsheet.demo');
if (fs0) {
  const f = stripComments(fs0);
  const idx = f.caseId.lastIndexOf('-');
  caseRepo.upsertCase({
    id: f.caseId,
    bid_pbanc_no: f.caseId.slice(0, idx),
    bid_pbanc_ord: f.caseId.slice(idx + 1),
    status: f.status ?? 'done',
    verdict_json: JSON.stringify(f.verdict ?? {}),
    meta_json: JSON.stringify({ ...(f.meta ?? {}), attachments: undefined }),
    source: 'cached',
  });
  caseRepo.replaceProgress(f.caseId, f.progress ?? []);
  (f.meta?.attachments ?? []).forEach((a) => caseRepo.upsertAttachment(f.caseId, {
    file_seq: a.fileSeq, filename: a.filename, doc_class: a.docClass ?? null, bytes: a.bytes ?? null,
  }));
  (f.tabs ?? []).forEach((t, i) => caseRepo.upsertTab(f.caseId, t, i));
  (f.downloads ?? []).forEach((d, i) => caseRepo.upsertDownload(f.caseId, d, i));
  logger.info('seed_factsheet', { caseId: f.caseId, tabs: (f.tabs ?? []).length });
}

// ── 스크리닝 데모 1건 ────────────────────────────────────────
const sc0 = loadFixture('screening.demo');
if (sc0) {
  const s = stripComments(sc0);
  companyRepo.upsertCompany({ id: s.companyId, name: '주식회사 다온피엠씨 (가상)', bizNo: '120-86-01230', card: {} });
  const screeningId = `scr_${s.companyId}`;
  companyRepo.upsertScreening({
    id: screeningId, companyId: s.companyId, status: s.status ?? 'done',
    summary: s.summary ?? {}, meta: { ...(s.meta ?? {}), cached: true },
  });
  companyRepo.replaceScreeningItems(screeningId, 'shortlist', s.shortlist ?? []);
  companyRepo.replaceScreeningItems(screeningId, 'excluded', s.excludedSamples ?? []);
  logger.info('seed_screening', { companyId: s.companyId, shortlist: (s.shortlist ?? []).length });
}

closeDb();
logger.info('seed_done');
