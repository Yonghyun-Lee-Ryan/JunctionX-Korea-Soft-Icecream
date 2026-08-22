-- ─────────────────────────────────────────────────────────────
-- Solar for Bid — 초기 스키마
-- 🔴 `case`는 SQL 예약어라 테이블 이름은 bid_case다.
-- 🔴 봉투(04_계약/*.envelope.json)를 조립하는 데 필요한 것만 둔다.
--    개별 Extract 필드로 컬럼을 만들지 않는다 — 프리플라이트에서 필드가 바뀐다.
-- ─────────────────────────────────────────────────────────────

-- ── 회사 (S1) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  biz_no        TEXT,
  card_json     TEXT NOT NULL DEFAULT '{}',   -- build_company_card 출력 전문
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS company_document (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  doc_class     TEXT,                          -- 사업자등록증 · 실적증명서 · 재무제표 …
  bytes         INTEGER,
  storage_path  TEXT,
  studio_job_id TEXT,
  extracted_json TEXT,
  confidence    TEXT,                          -- high | low | unknown
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_company_document_company ON company_document(company_id);

-- ── 스크리닝 (S2~S4) : screening.envelope.json ───────────────
CREATE TABLE IF NOT EXISTS screening (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'scanning',  -- scanning|screening|done|failed
  summary_json  TEXT NOT NULL DEFAULT '{}',        -- scanned·excluded·shortlisted (분모)
  meta_json     TEXT NOT NULL DEFAULT '{}',
  error_json    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_screening_company ON screening(company_id);

CREATE TABLE IF NOT EXISTS screening_item (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  screening_id  TEXT NOT NULL REFERENCES screening(id) ON DELETE CASCADE,
  bucket        TEXT NOT NULL,                     -- shortlist | excluded
  seq           INTEGER NOT NULL DEFAULT 0,
  case_id       TEXT NOT NULL,
  payload_json  TEXT NOT NULL,                     -- shortlist[] / excludedSamples[] 항목 전문
  decision      TEXT NOT NULL DEFAULT 'pending'    -- 🚪 사람 게이트: pending|go|skip
);
CREATE INDEX IF NOT EXISTS idx_screening_item_screening ON screening_item(screening_id, bucket, seq);

-- ── 케이스 (공고 1건) : factsheet.envelope.json ──────────────
CREATE TABLE IF NOT EXISTS bid_case (
  id             TEXT PRIMARY KEY,                 -- caseId = 공고번호-차수
  bid_pbanc_no   TEXT NOT NULL,
  bid_pbanc_ord  TEXT NOT NULL DEFAULT '000',
  company_id     TEXT REFERENCES company(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'collecting', -- collecting|parsing|judging|done|failed
  verdict_json   TEXT NOT NULL DEFAULT '{}',
  meta_json      TEXT NOT NULL DEFAULT '{}',
  error_json     TEXT,
  source         TEXT NOT NULL DEFAULT 'live',       -- live | cached
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bid_case_no_ord ON bid_case(bid_pbanc_no, bid_pbanc_ord);

-- 🔴 progress는 순서가 의미다. seq로 정렬해 그대로 내보낸다
CREATE TABLE IF NOT EXISTS case_progress (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id   TEXT NOT NULL REFERENCES bid_case(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL,
  step      TEXT NOT NULL,
  state     TEXT NOT NULL DEFAULT 'pending',        -- pending|running|done|failed
  detail    TEXT,
  UNIQUE(case_id, seq)
);

CREATE TABLE IF NOT EXISTS attachment (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       TEXT NOT NULL REFERENCES bid_case(id) ON DELETE CASCADE,
  file_seq      INTEGER NOT NULL,
  filename      TEXT NOT NULL,                      -- percent-encoded UTF-8을 디코딩한 값
  doc_class     TEXT,                               -- Classify 8갈래
  bytes         INTEGER,
  storage_path  TEXT,
  studio_job_id TEXT,
  UNIQUE(case_id, file_seq)
);

-- Extract 결과는 스키마별 JSON 통째로. 컬럼으로 펴지 않는다
CREATE TABLE IF NOT EXISTS extraction (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id       TEXT NOT NULL REFERENCES bid_case(id) ON DELETE CASCADE,
  attachment_id INTEGER REFERENCES attachment(id) ON DELETE CASCADE,
  schema_name   TEXT NOT NULL,                      -- ie_ntce_notice · ie_req_spec …
  payload_json  TEXT NOT NULL,
  confidence    TEXT,                               -- high | low | unknown
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_extraction_case ON extraction(case_id, schema_name);

-- 🔴 화면④ 탭. 프론트는 columns/rows를 범용 표로 그린다
CREATE TABLE IF NOT EXISTS case_tab (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id        TEXT NOT NULL REFERENCES bid_case(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL DEFAULT 0,
  tab_id         TEXT NOT NULL,                     -- compliance|wbs|criticalpath|cost|…
  kind           TEXT NOT NULL DEFAULT 'table',     -- table | checklist
  title          TEXT NOT NULL,
  columns_json   TEXT NOT NULL DEFAULT '[]',
  rows_json      TEXT NOT NULL DEFAULT '[]',
  warnings_json  TEXT NOT NULL DEFAULT '[]',        -- 🔴 Node가 다시 센 검산 결과
  summary        TEXT,
  UNIQUE(case_id, tab_id)
);

CREATE TABLE IF NOT EXISTS case_download (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id   TEXT NOT NULL REFERENCES bid_case(id) ON DELETE CASCADE,
  seq       INTEGER NOT NULL DEFAULT 0,
  down_id   TEXT NOT NULL,
  label     TEXT NOT NULL,
  url       TEXT NOT NULL,
  bytes     INTEGER,
  UNIQUE(case_id, down_id)
);
