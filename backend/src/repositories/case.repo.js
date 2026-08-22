import { getDb, parseJson } from '../db/index.js';

export function findCase(caseId) {
  return getDb().prepare('SELECT * FROM bid_case WHERE id = ?').get(caseId);
}

export function listCases(limit = 50) {
  return getDb().prepare('SELECT * FROM bid_case ORDER BY created_at DESC LIMIT ?').all(limit);
}

export function upsertCase(row) {
  getDb().prepare(`
    INSERT INTO bid_case (id, bid_pbanc_no, bid_pbanc_ord, company_id, status, verdict_json, meta_json, error_json, source)
    VALUES (@id, @bid_pbanc_no, @bid_pbanc_ord, @company_id, @status, @verdict_json, @meta_json, @error_json, @source)
    ON CONFLICT(id) DO UPDATE SET
      status       = excluded.status,
      verdict_json = excluded.verdict_json,
      meta_json    = excluded.meta_json,
      error_json   = excluded.error_json,
      source       = excluded.source,
      updated_at   = datetime('now')
  `).run({
    company_id: null, status: 'collecting', verdict_json: '{}', meta_json: '{}',
    error_json: null, source: 'live', bid_pbanc_ord: '000', ...row,
  });
  return findCase(row.id);
}

/**
 * 🔴 실패를 기록할 때 `upsertCase`를 부르면 안 된다.
 *    upsertCase는 빠진 칸을 **기본값으로 채워 넣는다** — company_id는 null,
 *    verdict_json·meta_json은 '{}', source는 'live'가 된다.
 *    즉 첨부 수집이 한 번 실패하면 그 케이스의 회사·판정·출처가 통째로 지워졌다.
 *    실패는 실패만 적는다.
 */
export function setCaseError(caseId, errorJson) {
  getDb().prepare(`
    UPDATE bid_case SET status = 'failed', error_json = ?, updated_at = datetime('now') WHERE id = ?
  `).run(errorJson, caseId);
}

/** 파이프라인이 끝났다 — 판정·메타를 적고 오류를 지운다 */
export function setCaseResult(caseId, { verdict, meta, status = 'done' }) {
  getDb().prepare(`
    UPDATE bid_case SET status = ?, verdict_json = ?, meta_json = ?, error_json = NULL, updated_at = datetime('now') WHERE id = ?
  `).run(status, JSON.stringify(verdict ?? {}), JSON.stringify(meta ?? {}), caseId);
}

export function setCaseSource(caseId, source) {
  getDb().prepare("UPDATE bid_case SET source = ?, updated_at = datetime('now') WHERE id = ?").run(source, caseId);
}

export function setCaseStatus(caseId, status) {
  getDb().prepare("UPDATE bid_case SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, caseId);
}

// ── progress ────────────────────────────────────────────────
export function replaceProgress(caseId, steps) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM case_progress WHERE case_id = ?').run(caseId);
    const ins = db.prepare('INSERT INTO case_progress (case_id, seq, step, state, detail) VALUES (?, ?, ?, ?, ?)');
    steps.forEach((s, i) => ins.run(caseId, i, s.step, s.state ?? 'pending', s.detail ?? null));
  })();
}

export function updateProgressStep(caseId, seq, state, detail) {
  getDb().prepare('UPDATE case_progress SET state = ?, detail = COALESCE(?, detail) WHERE case_id = ? AND seq = ?')
    .run(state, detail ?? null, caseId, seq);
}

export function listProgress(caseId) {
  return getDb().prepare('SELECT step, state, detail FROM case_progress WHERE case_id = ? ORDER BY seq').all(caseId)
    .map((r) => ({ step: r.step, state: r.state, ...(r.detail ? { detail: r.detail } : {}) }));
}

// ── attachment ──────────────────────────────────────────────
export function upsertAttachment(caseId, a) {
  getDb().prepare(`
    INSERT INTO attachment (case_id, file_seq, filename, doc_class, bytes, storage_path, studio_job_id)
    VALUES (@case_id, @file_seq, @filename, @doc_class, @bytes, @storage_path, @studio_job_id)
    ON CONFLICT(case_id, file_seq) DO UPDATE SET
      filename      = excluded.filename,
      doc_class     = COALESCE(excluded.doc_class, attachment.doc_class),
      bytes         = excluded.bytes,
      storage_path  = COALESCE(excluded.storage_path, attachment.storage_path),
      studio_job_id = COALESCE(excluded.studio_job_id, attachment.studio_job_id)
  `).run({ doc_class: null, bytes: null, storage_path: null, studio_job_id: null, case_id: caseId, ...a });
}

export function listAttachments(caseId) {
  return getDb().prepare('SELECT file_seq, filename, doc_class, bytes FROM attachment WHERE case_id = ? ORDER BY file_seq').all(caseId)
    .map((r) => ({ fileSeq: r.file_seq, filename: r.filename, docClass: r.doc_class ?? undefined, bytes: r.bytes ?? undefined }));
}

// ── tabs / downloads ────────────────────────────────────────
/**
 * 🔴 kind마다 짐이 다르다(metric·banner·note·items·columnAlign).
 *    칸을 하나씩 늘리면 kind가 늘 때마다 마이그레이션을 해야 하고,
 *    빠뜨리면 값이 **조용히** 사라진다. 알려진 칸 밖은 통째로 extra_json에 담는다.
 */
const TAB_KNOWN = new Set(['id', 'kind', 'title', 'columns', 'rows', 'warnings', 'summary']);

export function upsertTab(caseId, tab, seq = 0) {
  const extra = {};
  for (const [k, v] of Object.entries(tab)) if (!TAB_KNOWN.has(k) && v !== undefined) extra[k] = v;

  getDb().prepare(`
    INSERT INTO case_tab (case_id, seq, tab_id, kind, title, columns_json, rows_json, warnings_json, summary, extra_json)
    VALUES (@case_id, @seq, @tab_id, @kind, @title, @columns_json, @rows_json, @warnings_json, @summary, @extra_json)
    ON CONFLICT(case_id, tab_id) DO UPDATE SET
      seq = excluded.seq, kind = excluded.kind, title = excluded.title,
      columns_json = excluded.columns_json, rows_json = excluded.rows_json,
      warnings_json = excluded.warnings_json, summary = excluded.summary,
      extra_json = excluded.extra_json
  `).run({
    // 🔴 case_tab.title은 NOT NULL이다. banner·note는 title이 본체가 아니라
    //    없이 오기 쉬운데, 그러면 저장이 SQLITE_CONSTRAINT로 죽어 탭 하나가 통째로 사라진다.
    case_id: caseId, seq, tab_id: tab.id, kind: tab.kind ?? 'table', title: tab.title ?? '',
    columns_json: JSON.stringify(tab.columns ?? []),
    rows_json: JSON.stringify(tab.rows ?? []),
    warnings_json: JSON.stringify(tab.warnings ?? []),
    summary: tab.summary ?? null,
    extra_json: JSON.stringify(extra),
  });
}

/** 🔴 지난 판의 탭이 남아 픽스처나 새 결과를 가리지 않게 */
export function clearTabs(caseId) {
  getDb().prepare('DELETE FROM case_tab WHERE case_id = ?').run(caseId);
}

export function listTabs(caseId) {
  return getDb().prepare('SELECT * FROM case_tab WHERE case_id = ? ORDER BY seq, id').all(caseId).map((r) => ({
    id: r.tab_id,
    kind: r.kind,
    title: r.title,
    columns: parseJson(r.columns_json, []),
    rows: parseJson(r.rows_json, []),
    ...(parseJson(r.warnings_json, []).length ? { warnings: parseJson(r.warnings_json, []) } : {}),
    ...(r.summary ? { summary: r.summary } : {}),
    ...parseJson(r.extra_json, {}),
  }));
}

export function findTab(caseId, tabId) {
  return listTabs(caseId).find((t) => t.id === tabId);
}

export function upsertDownload(caseId, d, seq = 0) {
  getDb().prepare(`
    INSERT INTO case_download (case_id, seq, down_id, label, url, bytes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(case_id, down_id) DO UPDATE SET
      seq = excluded.seq, label = excluded.label, url = excluded.url, bytes = excluded.bytes
  `).run(caseId, seq, d.id, d.label, d.url, d.bytes ?? null);
}

export function clearDownloads(caseId) {
  getDb().prepare('DELETE FROM case_download WHERE case_id = ?').run(caseId);
}

export function listDownloads(caseId) {
  return getDb().prepare('SELECT down_id, label, url, bytes FROM case_download WHERE case_id = ? ORDER BY seq, id').all(caseId)
    .map((r) => ({ id: r.down_id, label: r.label, url: r.url, ...(r.bytes ? { bytes: r.bytes } : {}) }));
}

// ── extraction ──────────────────────────────────────────────
export function insertExtraction(caseId, { attachmentId, schemaName, payload, confidence }) {
  getDb().prepare(`INSERT INTO extraction (case_id, attachment_id, schema_name, payload_json, confidence)
                   VALUES (?, ?, ?, ?, ?)`)
    .run(caseId, attachmentId ?? null, schemaName, JSON.stringify(payload ?? {}), confidence ?? null);
}

export function deleteExtractions(caseId) {
  getDb().prepare('DELETE FROM extraction WHERE case_id = ?').run(caseId);
}

export function listExtractions(caseId, schemaName) {
  const sql = schemaName
    ? 'SELECT * FROM extraction WHERE case_id = ? AND schema_name = ? ORDER BY id'
    : 'SELECT * FROM extraction WHERE case_id = ? ORDER BY id';
  const rows = schemaName ? getDb().prepare(sql).all(caseId, schemaName) : getDb().prepare(sql).all(caseId);
  return rows.map((r) => ({ schemaName: r.schema_name, payload: parseJson(r.payload_json, {}), confidence: r.confidence }));
}
