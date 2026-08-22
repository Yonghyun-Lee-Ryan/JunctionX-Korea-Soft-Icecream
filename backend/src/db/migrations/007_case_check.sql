-- 요구사항 체크리스트의 체크 — 화면 로컬 상태는 탭을 나가면 사라졌다(실측). 탭(case_tab)과 따로 둔다: 판정을 다시 돌려 탭을 다시 써도 체크는 남는다
CREATE TABLE IF NOT EXISTS case_check (
  case_id     TEXT NOT NULL REFERENCES bid_case(id) ON DELETE CASCADE,
  tab_id      TEXT NOT NULL,                      -- compliance …
  row_key     TEXT NOT NULL,                      -- 행의 첫 칸 (요구사항 ID)
  checked_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (case_id, tab_id, row_key)
);
