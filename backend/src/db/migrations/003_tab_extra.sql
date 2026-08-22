-- 탭의 kind별 짐을 저장한다.
--
-- 🔴 case_tab은 columns/rows/warnings/summary만 칸을 갖고 있었다.
--    새 kind(metric·tasks·note·banner·docs)의 짐과 columnAlign은 저장할 자리가 없어
--    에이전트가 만들어 보내도 DB를 한 번 지나면 **조용히 사라진다.**
--    화면에는 「아직 없음」이 뜨고, 원인은 에이전트 쪽에서 찾게 된다.
ALTER TABLE case_tab ADD COLUMN extra_json TEXT NOT NULL DEFAULT '{}';
