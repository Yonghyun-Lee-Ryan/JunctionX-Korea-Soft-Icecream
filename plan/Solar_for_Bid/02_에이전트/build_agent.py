#!/usr/bin/env python3
"""Solar for Bid — Studio 에이전트 설정 초안 생성.
Upstage 자체 제작 `Federal RFPs`(agt_TQ573pyaUjGWP7xxPtGKZH) 공개 설정과 같은 구조로 쓴다.
"""
import json, pathlib

S = lambda d: {"type": "string", "description": d}
I = lambda d: {"type": "integer", "description": d}
def A(desc, props, req=None):
    return {"type": "array", "description": desc,
            "items": {"type": "object", "properties": props, **({"required": req} if req else {})}}

NONE = "문서에 없으면 빈 문자열. 추론하거나 지어내지 않는다."
PAGE = I("이 값이 나온 쪽 번호. 모르면 0")

# ─────────────────────────────────────────── Classify
CLASSES = [
 ("ntce_notice",
  "입찰공고문. 식별 특징: 문서 상단에 「입찰공고」 또는 「◯◯ 공고 제YYYY-NN호」, 공고번호, 입찰방식·계약방법·낙찰자결정방법·입찰서 제출마감일시·개찰일시·추정가격 또는 기초금액이 한 표에 모여 있다. 분량 1~5쪽으로 짧다. "
  "KEY NEGATIVE: 과업 요구를 장·절로 서술하면 rfp_main이고, 요구사항이 ID로 번호 매겨진 표면 req_spec이다. "
  "KEY DISTINCTION vs rfp_main: 공고문은 「언제·어떻게·누가 낼 수 있나」만 말하고 「무엇을 만드나」는 말하지 않는다."),
 ("rfp_main",
  "제안요청서(RFP) 본문. 식별 특징: 「제안요청서」 표제, 장·절 목차(Ⅰ 사업개요 / Ⅱ 사업내용 / Ⅲ 제안서 작성요령 / Ⅳ 제안 안내사항 / Ⅴ 제안 가격), 사업 배경·목적·범위·기간·예산 서술, 제안서 목차 지정, 작성 분량·부수·양식 규정, 금지 표현 열거. 분량 15~200쪽. "
  "KEY NEGATIVE: 요구사항이 ID 표로만 나열되면 req_spec, 배점만 있는 표면 eval_sheet. "
  "KEY DISTINCTION vs req_spec: 제안요청서는 서술문이고 요구사항정의서는 표다. 한 파일 안에 둘 다 있으면 Split으로 가른다."),
 ("sow_task",
  "과업내용서·과업지시서·과업설명서. 식별 특징: 해당 표제, 수행 과업을 단계·영역별로 서술, 산출물 목록과 제출 시기, 투입인력 등급·기간, 검수 기준. "
  "KEY NEGATIVE: 제안 작성 방법·평가·제출을 다루면 rfp_main이다. "
  "KEY DISTINCTION vs rfp_main: 과업내용서는 「낙찰 후에 무엇을 하나」이고 제안요청서는 「낙찰되려면 무엇을 내나」다. 이 갈래가 WBS의 원재료다."),
 ("req_spec",
  "요구사항 정의서·요구사항 목록. 식별 특징: 요구사항 고유번호 체계가 있는 표 — 접두사와 일련번호(SFR-001, CSR-014, PMR-003, ECR-004 등)와 「요구사항 분류 / 명칭 / 정의 / 세부내용」. "
  "🔴 평평한 표가 아니라 세로 5행 라벨 표가 요구사항 개수만큼 반복되는 형태일 수 있다. 세부내용 칸에 ※로 시작하는 단서·예외가 자주 붙는다. "
  "KEY NEGATIVE: 배점과 평가항목이 있는 표는 eval_sheet, 서술식 과업 설명은 sow_task. "
  "KEY DISTINCTION: 이 갈래가 제안서 요구사항 조견표의 원재료다. 행 단위로 빠짐없이 뽑는 것이 유일한 목적이고, ※ 단서를 잃으면 요구를 반대로 읽는다."),
 ("eval_sheet",
  "제안서 평가표·배점표·평가기준. 식별 특징: 「평가항목 / 배점 / 평가방법」 열이 있는 표, 정성·정량 구분, 기술평가와 가격평가 비율(예: 기술 90 / 가격 10), 등급 환산표(S·A·B·C·D), 기술평가 하한(예: 배점한도의 85% 미만 제외), 동점 처리. "
  "🔴 병합셀 때문에 배점 열 위치가 행마다 다를 수 있다. "
  "KEY NEGATIVE: 요구사항 ID 표는 req_spec이다. "
  "KEY DISTINCTION: 배점 합이 100 또는 90과 10으로 떨어지는지가 검산 지점이다. 표기 소계와 항목합이 어긋나는 실물이 존재한다."),
 ("contract_terms",
  "계약 조건 문서 — 계약이행 특수조건·일반조건·개인정보 처리위탁 특수조건·청렴계약 조건. 식별 특징: 「특수조건」·「일반조건」 표제, 제N조 형태의 조문 번호가 이어지는 구조, 계약보증금·지체상금·손해배상·하자담보·산출물 권리귀속·비밀유지·개인정보 위탁·재위탁 제한 같은 의무 조항. "
  "KEY NEGATIVE: 제안 작성·평가·제출을 다루면 rfp_main, 수행할 과업을 서술하면 sow_task. "
  "KEY DISTINCTION: 이 갈래는 「낙찰 후에 우리가 지는 의무」다 — 요구사항이 아니라 리스크다. 한 공고에 이 종류가 둘 이상 딸려 오는 일이 흔하다."),
 ("form_annex",
  "제출 서식·별첨 양식. 식별 특징: 빈 칸과 서명·날인란이 있는 서식 — 입찰참가신청서, 제안서 표지, 청렴계약이행서약서, 가격제안서 양식, 실적증명서 양식(서식 제N호), 산출내역서, 인력투입계획표, 공동수급표준협정서. 「서식 제N호」 표기, 채워지지 않은 밑줄과 표 칸, 「(인)」 표기. "
  "KEY NEGATIVE: 내용이 채워진 문서는 다른 클래스다. "
  "KEY DISTINCTION: 값을 뽑는 것이 아니라 「무엇을 몇 부 내야 하는가」와 ※ 주석의 인정 범위 규칙을 잡는 것이 목적이다."),
 ("others",
  "위 일곱에 속하지 않는 문서 — 사업 참고자료, 현황 자료, 도면, 기존 시스템 설명서, 회의록, 정정공고, 추진일정 간트. "
  "KEY DISTINCTION: 지원 범위 밖으로 두고 「자동 분석 대상 아님 — 사람이 확인」으로 라우팅한다. 억지로 다른 클래스에 넣지 않는다."),
]

classify_schema = {
  "type": "json_schema",
  "json_schema": {
    "name": "document-classify",
    "schema": {"type": "string", "oneOf": [{"const": c, "description": d} for c, d in CLASSES]}
  }
}

# ─────────────────────────────────────────── Extract ×7
def sch(name, props):
    return {"type": "json_schema", "mode": "standard", "modelName": "",
            "json_schema": {"name": name, "schema": {"type": "object", "properties": props}}}

ie_notice = sch("ie_ntce_notice", {
 "공고번호": S("인쇄된 그대로 (예: 'R25BK00645031'). " + NONE),
 "공고차수": S("차수. 정정공고면 숫자가 올라간다. " + NONE),
 "사업명": S("공고문에 인쇄된 사업명 그대로. 합성하지 않는다"),
 "공고기관": S("공고를 낸 기관명 전체"),
 "수요기관": S("실제 사용 기관. 공고기관과 다를 수 있다. 폴백 사다리: (1) 수요기관 칸 → (2) 사업명 안의 기관명 → (3) 공고기관과 동일"),
 "업무구분": S("다음 중 정확히 하나: 용역|물품|공사|외자"),
 "세부품명": S("세부품명과 번호 (예: '정보화프로젝트관리서비스(PMO) 8010169801'). " + NONE),
 "계약방법": S("다음 중 정확히 하나: 협상에의한계약|적격심사|수의계약|규격가격분리동시입찰|2단계경쟁입찰|기타"),
 "낙찰자결정방법": S("인쇄된 표현 그대로. " + NONE),
 "추정가격_원": S("콤마와 원 표기 없는 정수 문자열 (예: '400000000'). " + NONE),
 "배정예산_원": S("콤마와 원 표기 없는 정수 문자열. " + NONE),
 "부가세포함여부": S("다음 중 정확히 하나: 포함|별도|불명"),
 "낙찰하한율": S("퍼센트 숫자만 (예: '87.745'). " + NONE),
 "가격평가산식": S("공고에 적힌 가격점수 계산식을 원문 그대로 옮긴다. 🔴 계산하거나 일반식으로 바꾸지 않는다. " + NONE),
 "공고일시": S("ISO YYYY-MM-DD"),
 "입찰마감일시": S("ISO YYYY-MM-DD HH:MM"),
 "개찰일시": S("ISO YYYY-MM-DD HH:MM. " + NONE),
 "질의마감일시": S("ISO YYYY-MM-DD HH:MM. " + NONE),
 "설명회_실시여부": S("다음 중 정확히 하나: 실시|미실시|불명"),
 "설명회_일시장소": S("원문 그대로. " + NONE),
 "설명회_참가의무": S("🔴 다음 중 정확히 하나: 참가자에한함|의무아님|불명. 「설명에 참가한 자에 한하여 계약에 참가하게 할 수 있다」 류 문장이 있으면 '참가자에한함'. 이 한 줄이 입찰 자격을 가른다 — 공고문에 한 줄로만 적혀 있으니 놓치지 않는다"),
 "사업기간_개월": S("숫자만. " + NONE),
 "지역제한": S("지역 제한 조건 원문. " + NONE),
 "업종제한": S("업종·면허 제한 원문. " + NONE),
 "공동수급": S("다음 중 정확히 하나: 허용|불허|불명. 허용이면 최대 구성원 수와 최소 지분을 이어서 적는다"),
 "기업규모제한": S("중소기업만·대기업 배제 등 원문. " + NONE),
 "긴급공고여부": S("다음 중 정확히 하나: 긴급|일반|불명. 긴급이면 공고기간이 40일에서 10일로 단축될 수 있다"),
 "전자제출_제한": S("총 용량 상한·파일 형식·제출 순서 규정 원문 (예: '총 300MB 이내, 전 서류 PDF, 제안서 제출 완료 후 가격입찰서 제출 가능'). " + NONE),
 "입찰가격_상한": S("입찰가격이 넘으면 안 되는 금액과 그 근거 문장. 통상 사업금액(추정가격+부가세). " + NONE),
 "적용지침": S("공고서 앞머리의 「입찰 설명서 구성 목록」에 적힌 적용 지침명 (예: '조달청 협상에 의한 계약 제안서평가 세부기준'). 조달청 경유 건과 기관 자체집행 건은 지침이 다르다. " + NONE),
 "첨부파일": A("공고에 딸린 첨부 목록. 한 행에 하나", {
   "파일명": S("확장자까지"),
   "추정문서종류": S("다음 중 정확히 하나: ntce_notice|rfp_main|sow_task|req_spec|eval_sheet|contract_terms|form_annex|others")}),
 "page": PAGE,
})

ie_rfp = sch("ie_rfp_main", {
 "사업배경": S("추진 배경·목적을 원문에서 3문장 이내로. " + NONE),
 "사업범위": S("제안 범위를 원문에서. " + NONE),
 "제안서_지정목차": A("RFP가 지정한 제안서 목차. 장·절 순서대로 한 행씩. 🔴 지정 목차는 임의로 바꿀 수 없다", {
   "장": S("예: 'Ⅲ. 사업 수행 부문'"), "절": S("예: '나. PMO 수행 방안'"), "page": PAGE}),
 "참가자격": A("입찰 참가 자격 요건. 한 행에 하나. 🔴 이 배열이 자격 판정의 유일한 근거다", {
   "구분": S("다음 중 정확히 하나: 실적|등록면허|업종코드|지역|기업규모|공동수급|재무|인력|설명회|기타"),
   "요건_원문": S("조건을 문서에 적힌 문장 그대로. 요약하지 않는다"),
   "자격인가_가점인가": S("다음 중 정확히 하나: 자격|가점|불명. 문서가 '참가 자격'·'제한'·'~하여야 함'이라 하면 자격, '가점'·'우대'라 하면 가점, 애매하면 불명. 🔴 추측해서 자격을 가점으로 낮추지 않는다"),
   "page": PAGE}),
 "인력요건": A("투입 인력 요건", {
   "역할": S("예: 'PMO 수행책임자'"), "요건_원문": S("적힌 그대로"),
   "상주여부": S("다음 중 정확히 하나: 상주|비상주|불명"), "page": PAGE}),
 "제출물": A("제출해야 하는 서류. 한 행에 하나", {
   "이름": S(""), "부수": S("숫자만. " + NONE),
   "분량상한_쪽": S("숫자만. " + NONE), "유효기간": S("예: '최근 3개월 이내'. " + NONE),
   "별첨양식여부": S("다음 중 정확히 하나: 별첨양식|자유양식|불명"), "page": PAGE}),
 "제출방법": S("다음 중 정확히 하나: 인편|전자|우편|혼합|불명"),
 "제출장소": S("주소 원문. " + NONE),
 "작성양식_지정": S("다음 중 정확히 하나: 지정|자유|불명. '당사가 제시한 제안서 작성양식에 의거' 같은 문장이 있으면 지정"),
 "문서형태": S("예: 'MS 파워포인트'. " + NONE),
 "금지표현": {"type": "array", "description": "🔴 RFP가 명시적으로 금지한 부정확 표현을 인용부호 안 문자열 그대로 (예: '가능하다', '고려할 수 있다'). 이런 표현은 평가에서 불가능한 것으로 간주된다. 없으면 빈 배열", "items": {"type": "string"}},
 "제안발표": {"type": "object", "properties": {
   "일시": S(NONE), "발표자_요건": S(NONE), "발표시간_분": S("숫자만. " + NONE),
   "참석인원_제한": S(NONE), "page": PAGE}},
 "효력조항": A("제안서 효력·허위기재·산출물 권리귀속·사업취소 등 리스크 조항", {
   "조항_원문": S("그대로"), "page": PAGE}),
 "page": PAGE,
})

ie_sow = sch("ie_sow_task", {
 "과업단계": A("과업을 단계·영역으로 나눈 구조. 문서의 계층을 그대로 보존한다. 🔴 WBS의 원재료다", {
   "단계명": S(""), "상위단계": S("최상위면 빈칸"),
   "수행내용": S("줄여 쓰지 않는다"),
   "기간_원문": S("문서에 적힌 기간 표현 그대로. 🔴 없으면 빈칸 — 숫자를 만들지 않는다"),
   "page": PAGE}),
 "산출물": A("단계별 산출물", {
   "산출물명": S(""), "제출시기": S("원문 그대로. " + NONE),
   "관련단계": S(""), "page": PAGE}),
 "검수기준": A("검수·인수 기준", {"기준_원문": S(""), "page": PAGE}),
 "투입인력": A("등급별 투입 계획", {
   "역할": S(""), "등급": S("예: '특급', '고급'"),
   "투입기간_원문": S(NONE), "page": PAGE}),
 "page": PAGE,
})

ie_req = sch("ie_req_spec", {
 "요구사항": A("요구사항 정의서의 모든 항목. 🔴 한 항목도 빠뜨리지 않는다. 표가 여러 쪽에 이어지면 계속 뽑는다. "
              "🔴 이 문서는 평평한 표가 아니라 세로 라벨 표(요구사항 고유번호 / 분류 / 명칭 / 정의 / 세부내용)가 반복되는 형태일 수 있다 — 반복되는 표 하나가 한 항목이다", {
   "요구사항ID": S("인쇄된 그대로 (예: 'CSR-017'). 번호가 없으면 빈칸"),
   "분류": S("요구사항 분류명 (예: '기능요구사항')"),
   "명칭": S(""),
   "정의": S(""),
   "세부내용": S("세부내용 칸 전문. 🔴 줄여 쓰지 않는다"),
   "단서_주석": {"type": "array", "description": "🔴 세부내용 안에서 ※ 또는 '단,' 또는 '다만'으로 시작하는 문장을 그대로. 이 단서가 요구의 뜻을 뒤집는 경우가 많다. 원문에 ※가 있는데 이 배열이 비면 추출 실패다", "items": {"type": "string"}},
   "page": PAGE}),
 "요구사항_총괄표": A("상세 요구사항 앞에 있는 분류별 개수 총괄표. 검산의 기준이 된다", {
   "분류코드": S("예: 'CSR'"), "분류명": S(""), "개수": S("숫자만"), "page": PAGE}),
 "요구사항_총건수": S("문서가 스스로 밝힌 총 건수 (예: 목차나 총괄표의 '합계 151'). " + NONE + " 🔴 위 배열 길이와 달라도 그대로 둔다 — 검산은 다음 단계가 한다"),
 "page": PAGE,
})

ie_eval = sch("ie_eval_sheet", {
 "기술배점": S("숫자만 (예: '90'). " + NONE),
 "가격배점": S("숫자만 (예: '10'). " + NONE),
 "기술평가_하한": S("커트라인. 예: '85' (배점한도의 85% 미만 제외). " + NONE),
 "평가항목": A("배점표의 모든 행. 🔴 병합셀 때문에 배점 열 위치가 행마다 다를 수 있다 — 열 위치가 아니라 라벨로 찾는다", {
   "평가부문": S("예: '정성평가'"),
   "대항목": S("예: '사업전략'"),
   "부문소계": S("부문 옆 괄호에 적힌 소계 숫자만. " + NONE),
   "소항목": S("예: '사업이해도'"),
   "배점": S("숫자만"),
   "정성정량": S("다음 중 정확히 하나: 정성|정량|불명"),
   "평가방법": S(NONE), "page": PAGE}),
 "등급환산": A("S/A/B/C/D 같은 등급과 환산 점수", {"등급": S(""), "환산": S("")}),
 "동점처리": S("원문 그대로. " + NONE),
 "점수처리규칙": S("평가위원 최고·최저 제외 등 원문. " + NONE),
 "page": PAGE,
})

ie_terms = sch("ie_contract_terms", {
 "문서명": S("표제 그대로 (예: '계약이행 특수조건')"),
 "조항": A("제N조 단위로 한 행씩. 의무·제재·권리귀속이 걸린 조항만", {
   "조번호": S("예: '제12조'. " + NONE),
   "제목": S(""),
   "원문": S("조문 그대로. 요약하지 않는다"),
   "유형": S("다음 중 정확히 하나: 계약보증|지체상금|손해배상|하자담보|산출물권리귀속|비밀유지|개인정보위탁|재위탁제한|인력교체|검수|해지|기타"),
   "우리부담인가": S("다음 중 정확히 하나: 수급인부담|발주처부담|양측|불명. 🔴 문서에 명시된 것만. 추론하지 않는다"),
   "page": PAGE}),
 "지체상금률": S("숫자만 (예: '0.00125'). " + NONE),
 "계약보증금률": S("퍼센트 숫자만. " + NONE),
 "산출물_권리귀속": S("원문 그대로. " + NONE),
 "개인정보_위탁여부": S("다음 중 정확히 하나: 있음|없음|불명"),
 "page": PAGE,
})

ie_form = sch("ie_form_annex", {
 "서식": A("별첨 서식 목록", {
   "서식번호": S("예: '별지 제4호 서식'. " + NONE),
   "서식명": S(""),
   "용도": S("이 서식이 무엇을 증명·신청하는지 한 문장"),
   "필수기재항목": {"type": "array", "items": {"type": "string"}},
   "날인_서명_필요": S("다음 중 정확히 하나: 필요|불필요|불명"),
   "주석": {"type": "array", "description": "🔴 이 서식에 붙은 ※ 주석을 원문 그대로. 빈칸 양식이라 값은 없어도 실질 판정 규칙이 여기 있다 (예: '공공기관 유지관리 사업에 한함', '확인이 불가능한 실적은 인정하지 않음')", "items": {"type": "string"}},
   "page": PAGE}),
 "page": PAGE,
})

SCHEMAS = [ie_notice, ie_rfp, ie_sow, ie_req, ie_eval, ie_terms, ie_form]

# ─────────────────────────────────────────── Instruct ×4
P_JUDGE = """You are a MATCHER, not a consultant. 당신은 판단하지 않는다 — 공고가 요구한 것과 회사가 가진 것을 맞대 놓기만 한다.

판정 어휘는 셋뿐이다: 충족 / 미충족 / [확인필요].
규칙:
- 모든 판정에 근거를 붙인다 — 회사 프로필의 항목명과 공고의 쪽 번호.
- 회사 프로필에 없는 실적·자격·등록을 만들지 않는다. 없으면 [확인필요]다.
- 법령을 해석하지 않는다. 조문 이름은 문서에 적힌 그대로 옮긴다.
- 「자격인가_가점인가」가 '자격'인 항목이 하나라도 미충족이면 판정은 No-Go다. '가점'만 미충족이면 조건부다. 공동수급이 허용이면 조건부에 그 경로를 한 줄 적는다.
- 🔴 「설명회_참가의무」가 '참가자에한함'이면 이것을 **참가자격 항목으로 취급**한다. 설명회가 이미 지났으면 그 자리에서 No-Go다.
- 🔴 「전자제출_제한」에 제출 순서·용량·형식 규정이 있으면 판정 아래 「제출 제약」 항목으로 그대로 옮긴다.

Return this output verbatim with the bracketed sections filled in:

## 판정: [Go / No-Go / 조건부]
[한 문장 이유]

### 자격 대조
| 요건 | 자격/가점 | 판정 | 근거 |
|---|---|---|---|
[한 행씩]

### 미충족 항목
[없으면 "없음". 있으면 항목마다 한 줄: 무엇이 부족하고 공고 몇 쪽에 그렇게 적혀 있는지]

### 우회 경로
[공동수급 허용 여부와 그 경로. 없으면 "없음"]

### 제출 제약
[전자제출 용량·형식·순서 규정. 없으면 "공고에 명시 없음"]

### [확인필요]
[회사 프로필에 정보가 없어 판정하지 못한 항목. 없으면 "없음"]"""

P_MATRIX = """You build a SUBMITTABLE compliance matrix. 이것은 분석 결과가 아니라 발주처에 제출하는 문서다.

규칙:
- 앞 단계가 뽑은 요구사항을 한 항목도 빠뜨리지 않는다.
- 「단서_주석」(※ · 단, · 다만)을 별도 열로 살린다. 이 열을 잃으면 요구를 반대로 읽는다.
- 「수용 여부」는 비워 둔다 — 사람이 채운다. 지어내지 않는다.
- 「대응 제안서 목차」는 RFP가 지정한 목차 중에서만 고른다. 목차에 없는 절을 만들지 않는다. 모르면 빈칸.
- 마지막에 반드시 검산 블록을 낸다. 총괄표의 분류별 개수와 실제 추출 개수를 분류 단위로 대조한다.

Return this output verbatim with the bracketed sections filled in:

## 요구사항 조견표
| 요구사항ID | 분류 | 명칭 | 세부내용 | ※ 단서 | 근거 p | 수용 여부 | 대응 제안서 목차 |
|---|---|---|---|---|---|---|---|
[한 행씩]

## 검산
| 분류 | 총괄표 개수 | 추출 개수 | 일치 |
|---|---|---|---|
[분류마다 한 행]
- 총 추출 항목: [N] / 문서가 밝힌 총 건수: [M 또는 "문서에 없음"] → [일치 / 불일치]
- ※ 단서가 붙은 항목: [K]건
- 🔴 불일치가 있으면: [어느 분류에서 몇 건 차이인지. 사람 확인 필요]"""

P_WBS = """You are a PROJECT PLANNER. 앞 단계의 요구사항과 과업 구조에서 작업분해구조(WBS)를 만든다.

규칙:
- 문서에 있는 단계·산출물만 쓴다. 일반적인 SI 방법론을 끌어와 채우지 않는다.
- 각 작업 패키지에 근거 요구사항 ID를 단다. 근거가 없으면 그 칸을 비운다.
- 기간은 문서에 적힌 것만. 적혀 있지 않으면 "문서에 없음"으로 두고 숫자를 만들지 않는다.
- WBS ID는 계층을 반영한 점 표기(1 / 1.1 / 1.1.1)로 만든다.
- 선행 작업은 문서가 순서를 말한 경우에만 적는다. 추측한 선후행에는 "(추정)"을 붙인다.

Return this output verbatim with the bracketed sections filled in:

## WBS
| WBS ID | 작업 패키지 | 상위 | 산출물 | 선행 작업 | 기간 | 투입 등급 | 근거 요구사항ID | 근거 p |
|---|---|---|---|---|---|---|---|---|
[한 행씩]

## 집계
- 작업 패키지: [N]개
- 기간이 문서에 명시된 것 [K] / 명시되지 않은 것 [N-K]
- 요구사항 ID가 연결된 작업 [J] / 연결 없는 작업 [N-J]
- 🔴 어느 요구사항에도 대응되지 않는 작업이 있으면 여기 나열한다"""

P_CP = """You compute TWO critical paths and ONE submission checklist. 두 경로를 반드시 구분해서 낸다.

경로 A(제안 준비) — 오늘부터 입찰 마감까지. 주말과 공휴일을 빼고 영업일로 센다.
  반드시 포함: 발주처 질의 마감, 제3자 발급 서류의 리드타임(제조사 확약서·실적증명서·신용평가등급확인서·법인등기부등본),
  출력·제본 물량(제출물 부수 합계), 제출 방법이 '인편'이면 이동 시간, 제안발표 준비.
경로 B(사업 수행) — 앞 단계 WBS의 선후행에서 계산.

규칙:
- 날짜를 지어내지 않는다. 문서에 없는 리드타임은 "[확인필요 — 리드타임 미상]"으로 둔다.
- 임계경로는 여유(Total Float)가 0인 경로다. 계산 근거를 함께 낸다.
- 🔴 전자입찰 투찰(입찰서 제출)은 공동인증서와 보안토큰이 필요한 사람의 작업이다. 경로에 넣되 "사람" 표시를 한다.

Return this output verbatim with the bracketed sections filled in:

## 경로 A — 제안 준비 (마감 [YYYY-MM-DD HH:MM])
- 달력 일수 [N]일 / 실질 영업일 [M]일 (제외: [주말·공휴일 목록])
| 작업 | 시작 | 종료 | 소요 | 여유 | 임계 | 담당 |
|---|---|---|---|---|---|---|
[한 행씩]
**임계경로: [작업 → 작업 → 작업]**
**가장 먼저 착수해야 할 것: [한 줄]**

## 경로 B — 사업 수행
**임계경로: [WBS ID 나열]** / 총 기간 [일]

## 제출 체크리스트
| 서류 | 부수 | 분량상한 | 유효기간 | 별첨양식 | 준비 주체 |
|---|---|---|---|---|---|
[한 행씩]
- 총 출력 부수 [N]부 · 제출 방법 [인편/전자/우편]
- 작성양식 지정 여부 [지정/자유/불명] [지정인데 양식 미보유면 경고 한 줄]

## 금지 표현 검사 대상
[RFP가 금지한 표현 목록. 제출 직전 원고 전수 검색할 것. 없으면 "명시된 금지 표현 없음"]"""

P_MISMATCH = """You detect MISMATCH between two documents. 🔴 조달 실무의 기본 규칙: **공고서와 제안요청서(규격서)의 내용이 다르면 공고서가 우선한다.** 사람은 200쪽을 두 번 읽지 못해 이걸 놓친다.

판정 어휘는 셋뿐이다 — grounded / not-in-document / mismatch.
규칙:
- 두 문서에 다 있는 항목만 비교한다. 한쪽에만 있으면 mismatch가 아니라 not-in-document다.
- 비교 대상: 사업명 · 사업기간 · 추정가격/배정예산 · 계약방법 · 제출 마감일시 · 제출 방법 · 제출물 부수 · 분량 상한 · 참가자격 · 기술/가격 배점 비율 · 설명회 실시 여부.
- 값이 다르면 **공고서 값을 정답으로 표시**하고 두 쪽 번호를 모두 붙인다.
- 🔴 다르지 않은데 다르다고 말하지 않는다. 표기 차이(예: '4억' vs '400,000,000원')는 mismatch가 아니다.

Return this output verbatim with the bracketed sections filled in:

## 문서 간 대조
| 항목 | 공고문 값 (p) | 제안요청서 값 (p) | 판정 |
|---|---|---|---|
[한 행씩 — 판정은 grounded / not-in-document / mismatch]

## 🔴 불일치
[mismatch 항목마다 한 줄: 무엇이 어떻게 다르고, **공고서 기준으로 어느 값이 맞는지**. 없으면 "불일치 없음"]

## 한쪽에만 있는 것
[not-in-document 항목. 없으면 "없음"]"""

instruct = {
  "nodes": [
    {"name": "cross_check_notice_vs_rfp", "modelName": "default", "prompt": P_MISMATCH},
    {"name": "judge_eligibility",  "modelName": "default", "prompt": P_JUDGE},
    {"name": "compliance_matrix",  "modelName": "default", "prompt": P_MATRIX},
    {"name": "build_wbs",          "modelName": "default", "prompt": P_WBS},
    {"name": "critical_path",      "modelName": "default", "prompt": P_CP},
  ],
  # Federal RFPs 관찰: {노드: 그 노드가 읽는 곳}. targetType은 "extract" 또는 "instruct".
  "connectionMapping": {
    "cross_check_notice_vs_rfp": {"targetType": "extract", "schemaName": "ie_ntce_notice"},
    "judge_eligibility": {"targetType": "instruct", "instructNodeName": "cross_check_notice_vs_rfp"},
    "compliance_matrix": {"targetType": "extract",  "schemaName": "ie_req_spec"},
    "build_wbs":         {"targetType": "instruct", "instructNodeName": "compliance_matrix"},
    "critical_path":     {"targetType": "instruct", "instructNodeName": "build_wbs"},
  }
}

agent = {
  "_주의": "Solar for Bid 에이전트 설정 초안 (2026-08-22). Upstage 자체 제작 Federal RFPs(agt_TQ573pyaUjGWP7xxPtGKZH) 공개 설정과 같은 구조로 작성. Studio UI에 손으로 옮겨 넣는 것이 기준이고, 이 JSON은 그 원본이다.",
  "name": "Solar for Bid — 조달 공고 분해기",
  "description": "한국 공공조달 공고 묶음을 7종으로 가려 읽고 참가자격 판정·요구사항 조견표·WBS·임계경로를 만든다",
  "category": "Others",
  "language": "ko",
  "documentParseConfiguration": {
    "modelName": "document-parse",
    "mode": "auto",
    "ocrMode": "force",
    "lang": "",
    "chartRecognition": False,
    "coordinates": True,
    "mergeMultipageTables": True,
    "outputFormats": ["html", "text"],
    "base64Encoding": ["figure"]
  },
  "documentClassifyConfiguration": {"modelName": "", "schema": classify_schema},
  "documentClassifyNodes": [{"name": "classify-doc-kind", "modelName": "", "schema": classify_schema}],
  "informationExtractConfiguration": {
    "modelName": "",
    "schemas": SCHEMAS,
    "categorySchemaMapping": {
      "ntce_notice": "ie_ntce_notice", "rfp_main": "ie_rfp_main", "sow_task": "ie_sow_task",
      "req_spec": "ie_req_spec", "eval_sheet": "ie_eval_sheet",
      "contract_terms": "ie_contract_terms", "form_annex": "ie_form_annex"
    },
    "location": True
  },
  "instructConfiguration": instruct,
  "documentParseEnabled": True, "documentClassifyEnabled": True,
  "informationExtractEnabled": True, "instructEnabled": True,
}

out = pathlib.Path(__file__).parent / "solar_for_bid_agent.json"
out.write_text(json.dumps(agent, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# 리포트
n_cls = len(CLASSES)
print(f"written: {out.name}  {out.stat().st_size:,} bytes")
print(f"  Classify 레이블 : {n_cls} (others 포함)")
for s in SCHEMAS:
    nm = s["json_schema"]["name"]; pr = s["json_schema"]["schema"]["properties"]
    arr = [k for k, v in pr.items() if v.get("type") == "array"]
    print(f"  Extract {nm:22s} 필드 {len(pr):2d}  배열 {arr}")
print(f"  Instruct 노드    : {len(instruct['nodes'])} — " + " · ".join(n["name"] for n in instruct["nodes"]))
print("  체인 A          : cross_check → judge_eligibility (2단)")
print("  체인 B          : compliance_matrix → build_wbs → critical_path (3단)")
json.loads(out.read_text(encoding="utf-8"))
print("  JSON 유효성      : OK")
