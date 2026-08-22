-- ─────────────────────────────────────────────────────────────
-- 응찰 대상 공고 (🚪 사람이 「응찰 준비」를 찍은 건)
--
-- 🔴 screening_item.decision 으로는 부족하다. 실호출 스크리닝은 매번 목록을 갈아 끼우는데,
--    조회 창(최근 14일·300건) 밖으로 밀려난 공고는 그 자리에서 «사라진다».
--    사람이 하겠다고 정한 건은 목록과 무관하게 남아야 한다.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bid (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  case_id      TEXT NOT NULL,
  title        TEXT NOT NULL,
  org          TEXT,
  deadline     TEXT,
  days_left    INTEGER,
  matched      INTEGER DEFAULT 0,
  unverified   INTEGER DEFAULT 0,
  -- 목록에서 받은 항목 전문. 🔴 근거(reasons)를 잃지 않는다
  payload_json TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'preparing',  -- preparing | submitted | dropped
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, case_id)
);
CREATE INDEX IF NOT EXISTS idx_bid_company ON bid(company_id, status, created_at DESC);
