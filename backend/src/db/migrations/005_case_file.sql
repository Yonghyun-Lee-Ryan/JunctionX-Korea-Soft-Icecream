-- 케이스에 사람이 올린 파일 — 제출 서류(submission) · 제안서 원고(proposal)
-- 🔴 파일 본문은 data/uploads/<caseId>/ 에 두고 DB 에는 경로만. 제안서는 텍스트 레이어를 text 에 같이 둔다(금지 표현 검사 입력).
CREATE TABLE IF NOT EXISTS case_file (
  id               TEXT PRIMARY KEY,
  case_id          TEXT NOT NULL REFERENCES bid_case(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,                     -- submission | proposal
  filename         TEXT NOT NULL,
  bytes            INTEGER,
  storage_path     TEXT,
  requirement_name TEXT,                              -- 어느 제출 서류용으로 올렸나 (드롭존이면 NULL)
  doc_type_key     TEXT,                              -- PDF 텍스트로 가른 갈래 (못 가르면 NULL)
  text_chars       INTEGER,
  text             TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_case_file_case ON case_file(case_id, kind, created_at);
