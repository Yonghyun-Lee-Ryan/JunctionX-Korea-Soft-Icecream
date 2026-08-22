import { getDb } from '../db/index.js';

// 없으면 null — undefined 를 밖으로 내보내지 않는다 (호출부가 === null 로 본다)
const row = (r) => (!r ? null : {
  id: r.id, caseId: r.case_id, kind: r.kind, filename: r.filename, bytes: r.bytes ?? null,
  storagePath: r.storage_path ?? null, requirementName: r.requirement_name ?? null,
  docTypeKey: r.doc_type_key ?? null, textChars: r.text_chars ?? null, text: r.text ?? null,
  pages: (() => { try { const v = r.pages_json ? JSON.parse(r.pages_json) : null; return Array.isArray(v) ? v : null; } catch { return null; } })(),
  createdAt: r.created_at,
});

export function insertCaseFile({ id, caseId, kind, filename, bytes, storagePath, requirementName, docTypeKey, textChars, text, pages }) {
  getDb().prepare(`
    INSERT INTO case_file (id, case_id, kind, filename, bytes, storage_path, requirement_name, doc_type_key, text_chars, text, pages_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, caseId, kind, filename, bytes ?? null, storagePath ?? null, requirementName ?? null, docTypeKey ?? null, textChars ?? null, text ?? null, Array.isArray(pages) ? JSON.stringify(pages) : null);
  return findCaseFile(id);
}

export function findCaseFile(id) {
  return row(getDb().prepare('SELECT * FROM case_file WHERE id = ?').get(id));
}

/** kind 를 주면 그 종류만. 올린 순서대로 */
export function listCaseFiles(caseId, kind) {
  const rows = kind
    ? getDb().prepare('SELECT * FROM case_file WHERE case_id = ? AND kind = ? ORDER BY created_at, id').all(caseId, kind)
    : getDb().prepare('SELECT * FROM case_file WHERE case_id = ? ORDER BY created_at, id').all(caseId);
  return rows.map(row);
}

/** 제안서 원고는 하나만 본다 — 가장 최근 것 */
export function latestCaseFile(caseId, kind) {
  return row(getDb().prepare('SELECT * FROM case_file WHERE case_id = ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(caseId, kind));
}

/** 케이스의 올린 파일 기록을 전부 지운다 (테스트·초기화용 — 디스크 파일은 호출부가 치운다) */
export function deleteCaseFiles(caseId) {
  return getDb().prepare('DELETE FROM case_file WHERE case_id = ?').run(caseId).changes;
}
