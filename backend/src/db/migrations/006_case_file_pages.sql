-- 제안서 원고의 쪽 단위 텍스트 — 금지 표현 전수 검색이 쪽 번호를 붙이려면 쪽 경계가 필요하다
ALTER TABLE case_file ADD COLUMN pages_json TEXT;
