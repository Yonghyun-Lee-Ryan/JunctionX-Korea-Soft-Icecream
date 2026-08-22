import { getDb } from '../db/index.js';

/** 체크를 켜거나 끈다 — 같은 키를 두 번 켜도 한 줄 */
export function setCheck(caseId, tabId, rowKey, checked) {
  if (checked) {
    getDb().prepare('INSERT OR IGNORE INTO case_check (case_id, tab_id, row_key) VALUES (?, ?, ?)').run(caseId, tabId, rowKey);
  } else {
    getDb().prepare('DELETE FROM case_check WHERE case_id = ? AND tab_id = ? AND row_key = ?').run(caseId, tabId, rowKey);
  }
  return listChecks(caseId, tabId);
}

/** 그 탭에서 체크된 키 — 켠 순서대로 */
export function listChecks(caseId, tabId) {
  return getDb().prepare('SELECT row_key FROM case_check WHERE case_id = ? AND tab_id = ? ORDER BY checked_at, rowid').all(caseId, tabId).map((r) => r.row_key);
}

/** 케이스의 체크 전부 — 탭 id → 키 목록 */
export function listAllChecks(caseId) {
  const out = {};
  for (const r of getDb().prepare('SELECT tab_id, row_key FROM case_check WHERE case_id = ? ORDER BY checked_at, rowid').all(caseId)) {
    (out[r.tab_id] ??= []).push(r.row_key);
  }
  return out;
}
