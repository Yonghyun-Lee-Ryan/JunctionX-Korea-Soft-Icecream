import { getDb, parseJson } from '../db/index.js';

/** 🚪 사람이 「응찰 준비」를 찍은 건을 저장한다 */
export function saveBid(companyId, item) {
  getDb().prepare(`
    INSERT INTO bid (company_id, case_id, title, org, deadline, days_left, matched, unverified, payload_json)
    VALUES (@company_id, @case_id, @title, @org, @deadline, @days_left, @matched, @unverified, @payload_json)
    ON CONFLICT(company_id, case_id) DO UPDATE SET
      title = excluded.title,
      org = excluded.org,
      deadline = excluded.deadline,
      days_left = excluded.days_left,
      matched = excluded.matched,
      unverified = excluded.unverified,
      payload_json = excluded.payload_json,
      -- 🔴 되살릴 때 status를 preparing으로 되돌린다
      status = 'preparing',
      updated_at = datetime('now')
  `).run({
    company_id: companyId,
    case_id: item.caseId ?? '',
    title: item.title ?? '',
    org: item.org ?? null,
    deadline: item.deadline ?? null,
    days_left: Number.isFinite(item.daysLeft) ? item.daysLeft : null,
    matched: Number.isFinite(item.matched) ? item.matched : 0,
    unverified: Number.isFinite(item.unverified) ? item.unverified : 0,
    payload_json: JSON.stringify(item ?? {}),
  });
  return findBid(companyId, item.caseId);
}

export function findBid(companyId, caseId) {
  return getDb().prepare('SELECT * FROM bid WHERE company_id = ? AND case_id = ?').get(companyId, caseId);
}

export function listBids(companyId, { status = 'preparing' } = {}) {
  const rows = status === 'all'
    ? getDb().prepare('SELECT * FROM bid WHERE company_id = ? ORDER BY created_at DESC').all(companyId)
    : getDb().prepare('SELECT * FROM bid WHERE company_id = ? AND status = ? ORDER BY created_at DESC')
        .all(companyId, status);
  return rows.map(toItem);
}

export function dropBid(companyId, caseId) {
  const info = getDb()
    .prepare("UPDATE bid SET status = 'dropped', updated_at = datetime('now') WHERE company_id = ? AND case_id = ?")
    .run(companyId, caseId);
  return info.changes > 0;
}

/** 저장 당시의 목록 항목 모양 그대로 돌려준다 — 화면이 추천 카드와 같은 위젯을 쓴다 */
function toItem(row) {
  const payload = parseJson(row.payload_json, {});
  return {
    ...payload,
    caseId: row.case_id,
    title: row.title,
    org: row.org ?? '',
    deadline: row.deadline ?? '',
    daysLeft: row.days_left ?? 0,
    matched: row.matched ?? 0,
    unverified: row.unverified ?? 0,
    // 🔴 여기 온 건은 전부 사람이 go를 찍은 것이다
    decision: 'go',
    status: row.status,
    savedAt: row.created_at,
  };
}
