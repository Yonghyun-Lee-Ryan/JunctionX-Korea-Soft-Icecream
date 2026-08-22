import { getDb, parseJson } from '../db/index.js';

/** 같은 파일·같은 Agent 의 추출 결과 — 없으면 null */
export function findStudioResult(agentId, fileSha256) {
  const r = getDb().prepare('SELECT * FROM studio_result WHERE agent_id = ? AND file_sha256 = ?').get(agentId, fileSha256);
  if (!r) return null;
  return { jobId: r.job_id, filename: r.filename, payload: parseJson(r.payload_json, null), createdAt: r.created_at };
}

export function saveStudioResult({ agentId, fileSha256, filename, jobId, payload }) {
  getDb().prepare(`
    INSERT INTO studio_result (agent_id, file_sha256, filename, job_id, payload_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(agent_id, file_sha256) DO UPDATE SET
      filename = excluded.filename, job_id = excluded.job_id, payload_json = excluded.payload_json, created_at = datetime('now')
  `).run(agentId, fileSha256, filename ?? null, jobId ?? null, JSON.stringify(payload ?? {}));
}

/** 🔴 시작만 하고 결과를 못 받은 job — payload 없이 job_id 만 남긴다. 다음 실행이 새로 사지 않고 이어서 기다린다 */
export function savePendingStudioJob({ agentId, fileSha256, filename, jobId }) {
  getDb().prepare(`
    INSERT INTO studio_result (agent_id, file_sha256, filename, job_id, payload_json)
    VALUES (?, ?, ?, ?, 'null')
    ON CONFLICT(agent_id, file_sha256) DO UPDATE SET
      filename = excluded.filename, job_id = excluded.job_id, payload_json = 'null', created_at = datetime('now')
  `).run(agentId, fileSha256, filename ?? null, jobId);
}

export function deleteStudioResult(agentId, fileSha256) {
  getDb().prepare('DELETE FROM studio_result WHERE agent_id = ? AND file_sha256 = ?').run(agentId, fileSha256);
}

export function clearStudioResults() {
  getDb().prepare('DELETE FROM studio_result').run();
}

export function countStudioResults() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM studio_result').get().n;
}
