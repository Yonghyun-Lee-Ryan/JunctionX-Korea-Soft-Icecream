import { getDb, parseJson } from '../db/index.js';

/** 🔴 가장 최근에 저장된 회사. 첫 진입 화면을 정하는 데 쓴다 */
export function findLatestCompany() {
  return getDb().prepare('SELECT * FROM company ORDER BY updated_at DESC, created_at DESC LIMIT 1').get();
}

export function findCompany(companyId) {
  return getDb().prepare('SELECT * FROM company WHERE id = ?').get(companyId);
}

export function upsertCompany({ id, name, bizNo, card }) {
  getDb().prepare(`
    INSERT INTO company (id, name, biz_no, card_json) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, biz_no = excluded.biz_no,
      card_json = excluded.card_json, updated_at = datetime('now')
  `).run(id, name, bizNo ?? null, JSON.stringify(card ?? {}));
  return findCompany(id);
}

export function insertCompanyDocument(companyId, doc) {
  getDb().prepare(`
    INSERT INTO company_document (id, company_id, filename, doc_class, bytes, storage_path, studio_job_id, extracted_json, confidence)
    VALUES (@id, @company_id, @filename, @doc_class, @bytes, @storage_path, @studio_job_id, @extracted_json, @confidence)
  `).run({
    doc_class: null, bytes: null, storage_path: null, studio_job_id: null,
    extracted_json: null, confidence: null,
    company_id: companyId, ...doc,
  });
}

/** 🔴 다시 저장할 때 이전 목록을 갈아 끼운다 */
export function replaceCompanyDocuments(companyId, docs) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM company_document WHERE company_id = ?').run(companyId);
    for (const d of docs) insertCompanyDocument(companyId, d);
  })();
}

export function listCompanyDocuments(companyId) {
  return getDb().prepare('SELECT * FROM company_document WHERE company_id = ? ORDER BY created_at, id').all(companyId)
    .map((r) => ({
      id: r.id, filename: r.filename, docClass: r.doc_class ?? undefined,
      bytes: r.bytes ?? undefined, confidence: r.confidence ?? undefined,
      extracted: parseJson(r.extracted_json, undefined),
    }));
}

// ── screening ───────────────────────────────────────────────
export function upsertScreening({ id, companyId, status, summary, meta, error }) {
  getDb().prepare(`
    INSERT INTO screening (id, company_id, status, summary_json, meta_json, error_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status, summary_json = excluded.summary_json,
      meta_json = excluded.meta_json, error_json = excluded.error_json,
      updated_at = datetime('now')
  `).run(id, companyId, status ?? 'scanning',
    JSON.stringify(summary ?? {}), JSON.stringify(meta ?? {}),
    error ? JSON.stringify(error) : null);
}

export function findLatestScreening(companyId) {
  return getDb().prepare('SELECT * FROM screening WHERE company_id = ? ORDER BY created_at DESC LIMIT 1').get(companyId);
}

export function replaceScreeningItems(screeningId, bucket, items) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM screening_item WHERE screening_id = ? AND bucket = ?').run(screeningId, bucket);
    const ins = db.prepare(`INSERT INTO screening_item (screening_id, bucket, seq, case_id, payload_json, decision)
                            VALUES (?, ?, ?, ?, ?, ?)`);
    items.forEach((it, i) => ins.run(screeningId, bucket, i, it.caseId ?? '', JSON.stringify(it), it.decision ?? 'pending'));
  })();
}

export function listScreeningItems(screeningId, bucket) {
  return getDb().prepare('SELECT payload_json, decision FROM screening_item WHERE screening_id = ? AND bucket = ? ORDER BY seq')
    .all(screeningId, bucket)
    .map((r) => {
      const payload = parseJson(r.payload_json, {});
      return bucket === 'shortlist' ? { ...payload, decision: r.decision } : payload;
    });
}

export function setDecision(screeningId, caseId, decision) {
  const info = getDb().prepare('UPDATE screening_item SET decision = ? WHERE screening_id = ? AND bucket = ? AND case_id = ?')
    .run(decision, screeningId, 'shortlist', caseId);
  return info.changes > 0;
}
