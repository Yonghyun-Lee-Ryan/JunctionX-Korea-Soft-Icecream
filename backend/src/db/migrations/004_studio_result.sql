-- 🔴 Studio 결과 캐시 — 같은 파일(sha256)·같은 Agent 는 다시 돌리지 않는다.
--    정운 계정의 무료 실행은 에이전트당 10회다. 판정(Solar)을 다시 돌리거나(refresh) 파이프라인이 중간에 죽어
--    재시도할 때 공고 파일이 그대로면 Studio 추출은 여기서 꺼낸다.
--    분류만 하고 추출을 안 한 결과(OTHER_REVIEW_REQUIRED)는 넣지 않는다 — 갈래를 고치면 다시 돌아야 한다.
CREATE TABLE IF NOT EXISTS studio_result (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id     TEXT NOT NULL,
  file_sha256  TEXT NOT NULL,
  filename     TEXT,
  job_id       TEXT,
  payload_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(agent_id, file_sha256)
);
