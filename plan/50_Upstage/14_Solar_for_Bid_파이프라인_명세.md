---
title: Solar for Bid 파이프라인 명세 — Studio에 그대로 붙여넣는 것
tags: [junction, upstage, solar-for-bid, studio, 파이프라인, 명세]
type: 산출물
status: draft
created: 2026-08-22
updated: 2026-08-22
source: studio.upstage.ai/api/agents/agt_TQ573pyaUjGWP7xxPtGKZH 공개 설정 실측 + PDF p21·p22·p23·p25
related: "[[13_Solar_for_Bid_기획안]]"
---
> [!warning] 공개 레포 사본 — 발주처·제안사 실명은 익명화했다
> 원본은 팀 기획자 볼트 `30_projects/JUNCTION/50_Upstage/`에 있고 **권위는 볼트다**.
> 실제 조달 문서의 발주처명·기밀 조항은 이 사본에 넣지 않는다. 수치의 모양만 남겼다.


# Solar for Bid — Studio 파이프라인 명세

> [!summary] 이 문서의 용도
> `https://studio.upstage.ai/agents` 에서 **에이전트를 만들면서 칸에 그대로 붙여넣는 값**만 담았다. 왜 그렇게 설계했는지는 [[13_Solar_for_Bid_기획안]] 5절에 있다.
> 작업 순서는 아래 0절. **04:00까지 §1·§2가 끝나야 한다.**

---

## 0. 만드는 순서 (Studio UI 기준)

1. `studio.upstage.ai` 로그인 → **에이전트 만들기**
2. 이름: `Solar for Bid — 조달 공고 분해기` · 설명: `한국 공공조달 공고 묶음을 6종으로 가려 읽고 자격판정·요구사항 조견표·WBS·임계경로를 만든다`
3. **Parse**는 기본으로 켜져 있다 → 우측 패널에서 §1 값으로 맞춘다
4. 툴바 `■ Classify +` → §2의 6갈래 + others 붙여넣기 → **Split 활성화 ON**
5. 툴바 `■ Extract +` × 6 → 갈래별로 §3 스키마 붙여넣기 → 노드 이름 지정
6. 툴바 `■ Instruct +` × 4 → §4 프롬프트 붙여넣기 → 노드 이름 지정
7. `Config` 버전 확인 → **데모 전날 밤 버전 고정, 그 뒤 캔버스 금지**
8. 우상단 `</> Code` → API 스니펫 복사 → 백엔드로

> 🔴 **노드 이름을 반드시 짓는다.** 안 지으면 `instruct-6` 같은 기본 이름이 남는다 (Upstage 자체 데모 p23이 실제로 그렇다). 캔버스를 화면에 띄울 거면 이름이 곧 설명이다.

---

## 1. Parse 설정

Upstage 자신이 `Federal RFPs`에 쓴 설정을 기준선으로, **한 칸만 바꾼다.**

| 항목 | 값 | 근거 |
|---|---|---|
| model | `document-parse` (최신) | Federal RFPs는 `document-parse-260128` |
| mode | `auto` | 같음 |
| **ocr** | 🔴 **`force`** | **Upstage 자신이 RFP에 OCR을 강제한다.** 한국 조달 첨부는 스캔·직인이 섞인다 |
| coordinates | `true` | 근거 페이지·좌표 인용에 필수 |
| output_formats | `["html", "text"]` | 같음 |
| base64_encoding | `["figure"]` | 도면·직인 이미지를 따로 받는다 |
| chart_recognition | `false` | 조달 문서에 차트가 거의 없다. 켜면 느려진다 |
| **merge_multipage_tables** | 🔴 **`true`** ← **유일하게 바꾸는 칸** | Federal RFPs는 `false`. **한국 요구사항 정의서는 표 하나가 수십 쪽에 걸쳐 이어진다** — 끄면 행이 쪼개진다 |

---

## 2. Classify — 노드 이름 `classify-doc-kind`

**Split 활성화: ON** 🔴 (Federal RFPs는 OFF다. 한국은 한 건에 문서 여섯이 딸려 오거나 합본 스캔으로 온다)

아래 표의 **레이블**과 **설명**을 스키마 표에 한 행씩 그대로 붙여넣는다.

### `ntce_notice`
```
입찰공고문. 식별 특징: 문서 상단에 「입찰공고」 또는 「◯◯ 공고 제YYYY-NN호」 표기, 공고번호, 입찰방식·계약방법·낙찰자결정방법·입찰서 제출마감일시·개찰일시·추정가격 또는 기초금액이 한 표에 모여 있다. 분량 1~5쪽으로 짧다. 이것이 아님: 과업 요구를 장·절로 서술한 문서는 rfp_main이고, 요구사항이 ID로 번호 매겨진 표는 req_spec이다. 경계: 공고문은 「언제·어떻게·누가 낼 수 있나」만 말하고 「무엇을 만드나」는 말하지 않는다.
```

### `rfp_main`
```
제안요청서(RFP) 본문. 식별 특징: 「제안요청서」 표제, 장·절 목차(Ⅰ 사업개요 / Ⅱ 사업내용 / Ⅲ 제안서 작성요령 / Ⅳ 제안 안내사항 / Ⅴ 제안 가격), 사업 배경·목적·범위·기간·예산 서술, 제안서 목차 지정, 작성 분량·부수·양식 규정, 금지 표현 열거. 분량 15~200쪽. 이것이 아님: 요구사항이 ID로 표 형태로만 나열된 문서는 req_spec, 배점만 있는 표는 eval_sheet. 경계: 제안요청서는 서술문이고 요구사항정의서는 표다. 한 파일 안에 둘 다 있으면 Split으로 가른다.
```

### `sow_task`
```
과업내용서·과업지시서·과업설명서. 식별 특징: 해당 표제, 수행 과업을 단계·영역별로 서술, 산출물 목록과 제출 시기, 투입인력 등급·기간, 검수 기준. 이것이 아님: 제안 작성 방법·평가·제출을 다루면 rfp_main. 경계: 과업내용서는 「낙찰 후에 무엇을 하나」이고 제안요청서는 「낙찰되려면 무엇을 내나」다. 별도 파일로 오는 경우가 많고, 감리·PMO 사업에서는 이 문서가 요구사항의 원천이다.
```

### `req_spec`
```
요구사항 정의서·요구사항 목록. 식별 특징: 요구사항 고유번호 체계가 있는 표 — 접두사와 일련번호(SFR-001, CSR-014, PMR-003, ECR-004 등)와 「요구사항 분류 / 요구사항 명칭 / 정의 / 세부내용」 열. 한 행이 한 요구사항이고 수십에서 수백 행이다. 세부내용 칸에 ※로 시작하는 단서·예외 문장이 자주 붙는다. 이것이 아님: 배점과 평가항목이 있는 표는 eval_sheet, 서술식 과업 설명은 sow_task. 경계: 이 클래스가 제안서 요구사항 조견표의 원재료다. 행 단위로 빠짐없이 뽑는 것이 이 갈래의 유일한 목적이고, ※ 단서를 잃으면 요구를 반대로 읽는다.
```

### `eval_sheet`
```
제안서 평가표·배점표·평가기준. 식별 특징: 「평가항목 / 배점 / 평가방법」 열이 있는 표, 정성·정량 구분, 기술평가와 가격평가의 비율(예: 기술 90 / 가격 10), 등급 환산표(S·A·B·C·D 또는 우수·보통·미흡), 기술평가 하한(예: 85% 미만 탈락), 동점 처리 기준. 이것이 아님: 요구사항 ID 표는 req_spec. 경계: 배점의 합이 100 또는 90과 10으로 떨어지는지가 이 클래스의 검산 지점이다. 표기 배점과 항목 합이 어긋나는 실물이 존재한다.
```

### `form_annex`
```
제출 서식·별첨 양식. 식별 특징: 빈 칸과 서명·날인란이 있는 서식 — 입찰참가신청서, 제안서 표지, 청렴계약이행서약서, 가격제안서 양식, 실적증명서 양식(서식 제N호), 산출내역서, 인력투입계획표. 「서식 제N호」 표기, 채워지지 않은 밑줄과 표 칸, 「(인)」 표기. 이것이 아님: 내용이 채워진 문서는 다른 클래스다. 경계: 이 갈래는 값을 뽑는 것이 아니라 「무엇을 몇 부 내야 하는가」의 목록을 만드는 것이 목적이다.
```

### `others`
```
위 여섯에 속하지 않는 문서 — 사업 참고자료, 현황 자료, 도면, 기존 시스템 설명서, 회의록, 정정공고. 경계: 지원 범위 밖으로 두고 「이 문서는 자동 분석 대상이 아닙니다 — 사람이 확인하세요」로 라우팅한다. 억지로 다른 클래스에 넣지 않는다.
```

> 🔴 모델 선택: Classify 패널 원문 — *"Solar 모델은 confidence score 기능을 아직 제공하지 않습니다."* 선택지는 `Auto` / `solar-pro2`. **`Auto`로 둔다** (confidence가 필요하다).

---

## 3. Extract — 갈래별 스키마 6벌

노드 이름: `ex-notice` · `ex-rfp` · `ex-sow` · `ex-req` · `ex-eval` · `ex-form`

**공통 작법 (Federal RFPs 규칙 그대로)**
- 열거형은 `"다음 중 정확히 하나: A|B|C"` 로 강제
- 날짜는 `"ISO YYYY-MM-DD"`
- 금액은 `"콤마와 원 표기 없는 정수 문자열 (예: '400000000')"`
- 값을 못 찾으면 `"문서에 없으면 빈 문자열. 추론하거나 지어내지 않는다."`
- 여러 곳에 있으면 폴백 사다리를 적는다 — `"(1) 공고문 표 → (2) 제안요청서 Ⅰ장 → (3) 없으면 빈칸"`

### 3-1. `ex-notice` (입찰공고문)
```json
{
  "type": "object",
  "properties": {
    "공고번호": {"type": "string", "description": "공고번호를 인쇄된 그대로 (예: '20260812345-00')"},
    "차수": {"type": "string", "description": "공고 차수. 정정공고면 숫자가 올라간다. 없으면 빈칸"},
    "사업명": {"type": "string", "description": "공고문에 인쇄된 사업명 그대로. 합성하지 않는다"},
    "공고기관": {"type": "string", "description": "공고를 낸 기관명 전체"},
    "수요기관": {"type": "string", "description": "실제 사용 기관. 공고기관과 다를 수 있다. 같으면 같게 적는다"},
    "업무구분": {"type": "string", "description": "다음 중 정확히 하나: 용역|물품|공사|외자"},
    "세부품명": {"type": "string", "description": "세부품명과 번호 (예: '정보화프로젝트관리서비스(PMO) 8010169801')"},
    "계약방법": {"type": "string", "description": "다음 중 정확히 하나: 협상에의한계약|적격심사|수의계약|규격가격분리동시입찰|2단계경쟁입찰|기타"},
    "낙찰자결정방법": {"type": "string", "description": "인쇄된 표현 그대로"},
    "추정가격_원": {"type": "string", "description": "콤마와 원 표기 없는 정수 문자열. 없으면 빈칸"},
    "배정예산_원": {"type": "string", "description": "콤마와 원 표기 없는 정수 문자열. 없으면 빈칸"},
    "부가세포함여부": {"type": "string", "description": "다음 중 정확히 하나: 포함|별도|불명"},
    "낙찰하한율": {"type": "string", "description": "퍼센트 숫자만 (예: '87.745'). 없으면 빈칸"},
    "가격평가산식": {"type": "string", "description": "공고에 적힌 가격점수 계산식을 원문 그대로. 없으면 빈칸. 지어내지 않는다"},
    "공고일시": {"type": "string", "description": "ISO YYYY-MM-DD"},
    "입찰마감일시": {"type": "string", "description": "ISO YYYY-MM-DD HH:MM"},
    "개찰일시": {"type": "string", "description": "ISO YYYY-MM-DD HH:MM"},
    "질의마감일시": {"type": "string", "description": "ISO YYYY-MM-DD HH:MM. 없으면 빈칸"},
    "사업기간_개월": {"type": "string", "description": "숫자만. 없으면 빈칸"},
    "지역제한": {"type": "string", "description": "지역 제한 조건 원문. 없으면 빈칸"},
    "업종제한": {"type": "string", "description": "업종·면허 제한 원문. 없으면 빈칸"},
    "공동수급": {"type": "string", "description": "다음 중 정확히 하나: 허용|불허|불명. 허용이면 최대 구성원 수와 최소 지분을 함께 적는다"},
    "기업규모제한": {"type": "string", "description": "중소기업만·대기업 배제 등 원문. 없으면 빈칸"},
    "첨부파일": {"type": "array", "description": "첨부 파일 목록. 한 행에 하나",
      "items": {"type": "object", "properties": {
        "파일명": {"type": "string"},
        "추정문서종류": {"type": "string", "description": "다음 중 정확히 하나: ntce_notice|rfp_main|sow_task|req_spec|eval_sheet|form_annex|others"}
      }}}
  }
}
```

### 3-2. `ex-rfp` (제안요청서) — 🔴 **한국 고유 필드가 몰려 있는 스키마**
```json
{
  "type": "object",
  "properties": {
    "사업배경": {"type": "string", "description": "추진 배경·목적을 원문에서 3문장 이내로. 없으면 빈칸"},
    "제안서_지정목차": {"type": "array", "description": "RFP가 지정한 제안서 목차. 장·절 순서대로 한 행씩",
      "items": {"type": "object", "properties": {
        "장": {"type": "string"}, "절": {"type": "string"}, "page": {"type": "integer"}}}},
    "참가자격": {"type": "array", "description": "입찰 참가 자격 요건. 한 행에 하나",
      "items": {"type": "object", "properties": {
        "구분": {"type": "string", "description": "다음 중 정확히 하나: 실적|등록면허|업종코드|지역|기업규모|공동수급|재무|인력|설명회|기타"},
        "요건_원문": {"type": "string", "description": "조건을 문서에 적힌 문장 그대로. 요약하지 않는다"},
        "자격인가_가점인가": {"type": "string", "description": "다음 중 정확히 하나: 자격|가점|불명. 문서가 '참가 자격'·'제한'이라 하면 자격, '가점'·'우대'라 하면 가점, 애매하면 불명"},
        "page": {"type": "integer"}}}},
    "인력요건": {"type": "array",
      "items": {"type": "object", "properties": {
        "역할": {"type": "string"}, "요건_원문": {"type": "string"},
        "상주여부": {"type": "string", "description": "다음 중 정확히 하나: 상주|비상주|불명"},
        "page": {"type": "integer"}}}},
    "제출물": {"type": "array", "description": "제출해야 하는 서류. 한 행에 하나",
      "items": {"type": "object", "properties": {
        "이름": {"type": "string"},
        "부수": {"type": "string", "description": "숫자만. 없으면 빈칸"},
        "분량상한_쪽": {"type": "string", "description": "숫자만. 없으면 빈칸"},
        "유효기간": {"type": "string", "description": "예: '최근 3개월 이내'. 없으면 빈칸"},
        "별첨양식여부": {"type": "string", "description": "다음 중 정확히 하나: 별첨양식|자유양식|불명"},
        "page": {"type": "integer"}}}},
    "제출방법": {"type": "string", "description": "다음 중 정확히 하나: 인편|전자|우편|혼합|불명"},
    "제출장소": {"type": "string", "description": "주소 원문. 없으면 빈칸"},
    "작성양식_지정": {"type": "string", "description": "다음 중 정확히 하나: 지정|자유|불명. '당사가 제시한 제안서 작성양식에 의거' 같은 문장이 있으면 지정"},
    "문서형태": {"type": "string", "description": "예: 'MS 파워포인트'. 없으면 빈칸"},
    "금지표현": {"type": "array", "description": "RFP가 명시적으로 금지한 부정확 표현을 인용부호 안 문자열 그대로. 예: '가능하다', '고려할 수 있다'. 없으면 빈 배열",
      "items": {"type": "string"}},
    "제안발표": {"type": "object", "properties": {
      "일시": {"type": "string"}, "발표자_요건": {"type": "string"},
      "발표시간_분": {"type": "string"}, "참석인원_제한": {"type": "string"}, "page": {"type": "integer"}}},
    "효력조항": {"type": "array", "description": "제안서 효력·허위기재·산출물 권리귀속·사업취소 등 리스크 조항. 원문 그대로",
      "items": {"type": "object", "properties": {"조항_원문": {"type": "string"}, "page": {"type": "integer"}}}}
  }
}
```

### 3-3. `ex-req` (요구사항 정의서) — 🔴 **조견표와 WBS의 원재료**
```json
{
  "type": "object",
  "properties": {
    "요구사항": {"type": "array", "description": "요구사항 정의서의 모든 행. 한 행도 빠뜨리지 않는다. 표가 여러 쪽에 이어지면 이어서 계속 뽑는다",
      "items": {"type": "object", "properties": {
        "요구사항ID": {"type": "string", "description": "인쇄된 그대로 (예: 'CSR-017'). 번호가 없으면 빈칸"},
        "분류": {"type": "string", "description": "요구사항 분류명 (예: '기능요구사항', '성능요구사항')"},
        "명칭": {"type": "string"},
        "정의": {"type": "string"},
        "세부내용": {"type": "string", "description": "세부내용 칸 전문. 줄여 쓰지 않는다"},
        "단서_주석": {"type": "array", "description": "세부내용 안에서 ※ 또는 '단,' 또는 '다만'으로 시작하는 문장을 그대로. 이 배열이 비어 있는데 원문에 ※가 있으면 추출 실패다",
          "items": {"type": "string"}},
        "page": {"type": "integer"}}}},
    "요구사항_총건수": {"type": "string", "description": "문서가 스스로 밝힌 총 건수 (예: 목차나 머리말의 '총 151개'). 없으면 빈칸. 위 배열 길이와 다르면 그대로 둔다 — 검산은 우리가 한다"}
  }
}
```

### 3-4. `ex-eval` (배점표)
```json
{
  "type": "object",
  "properties": {
    "기술배점": {"type": "string", "description": "숫자만 (예: '90')"},
    "가격배점": {"type": "string", "description": "숫자만 (예: '10')"},
    "기술평가_하한": {"type": "string", "description": "커트라인. 예: '85' (기술배점의 85% 미만 탈락). 없으면 빈칸"},
    "평가항목": {"type": "array", "description": "배점표의 모든 행",
      "items": {"type": "object", "properties": {
        "대항목": {"type": "string"}, "소항목": {"type": "string"},
        "배점": {"type": "string", "description": "숫자만"},
        "정성정량": {"type": "string", "description": "다음 중 정확히 하나: 정성|정량|불명"},
        "평가방법": {"type": "string"}, "page": {"type": "integer"}}}},
    "등급환산": {"type": "array", "description": "S/A/B/C/D 같은 등급과 환산 비율",
      "items": {"type": "object", "properties": {"등급": {"type": "string"}, "비율": {"type": "string"}}}},
    "동점처리": {"type": "string", "description": "원문 그대로. 없으면 빈칸"}
  }
}
```

### 3-5. `ex-sow` (과업내용서) — 🔴 **WBS의 원재료**
```json
{
  "type": "object",
  "properties": {
    "과업단계": {"type": "array", "description": "과업을 단계·영역으로 나눈 구조. 문서의 계층을 그대로 보존한다",
      "items": {"type": "object", "properties": {
        "단계명": {"type": "string"}, "상위단계": {"type": "string", "description": "최상위면 빈칸"},
        "수행내용": {"type": "string"},
        "기간_원문": {"type": "string", "description": "문서에 적힌 기간 표현 그대로. 없으면 빈칸"},
        "page": {"type": "integer"}}}},
    "산출물": {"type": "array",
      "items": {"type": "object", "properties": {
        "산출물명": {"type": "string"},
        "제출시기": {"type": "string", "description": "원문 그대로. 없으면 빈칸"},
        "관련단계": {"type": "string"}, "page": {"type": "integer"}}}},
    "검수기준": {"type": "array", "items": {"type": "object", "properties": {
      "기준_원문": {"type": "string"}, "page": {"type": "integer"}}}},
    "투입인력": {"type": "array", "items": {"type": "object", "properties": {
      "역할": {"type": "string"}, "등급": {"type": "string"},
      "투입기간_원문": {"type": "string"}, "page": {"type": "integer"}}}}
  }
}
```

### 3-6. `ex-form` (제출 서식)
```json
{
  "type": "object",
  "properties": {
    "서식": {"type": "array",
      "items": {"type": "object", "properties": {
        "서식번호": {"type": "string", "description": "예: '서식 제4호'. 없으면 빈칸"},
        "서식명": {"type": "string"},
        "용도": {"type": "string", "description": "이 서식이 무엇을 증명·신청하는지 한 문장"},
        "필수기재항목": {"type": "array", "items": {"type": "string"}},
        "날인_서명_필요": {"type": "string", "description": "다음 중 정확히 하나: 필요|불필요|불명"},
        "page": {"type": "integer"}}}}
  }
}
```

---

## 4. Instruct — 4단 체인

🔴 Federal RFPs가 `prep_kit → risk_triage` 2단 체인을 쓰는 것을 확인했다 (`connectionMapping`). **Instruct가 Instruct를 받는다.** 우리는 4단으로 간다.

연결: `ex-*` → `judge-eligibility` → `build-compliance-matrix` → `build-wbs` → `build-critical-path`

### 4-1. `judge-eligibility` — 자격 판정 (🔴 데모의 주인공)
```
You are a matcher, not a consultant. 당신은 판단하지 않는다 — 공고가 요구한 것과 회사가 가진 것을 맞대 놓기만 한다.

판정 어휘는 셋뿐이다: 충족 / 미충족 / [확인필요].
규칙:
- 모든 판정에 근거를 붙인다 — 회사 프로필의 항목명과 공고의 페이지 번호.
- 회사 프로필에 없는 실적·자격·등록을 만들지 않는다. 없으면 [확인필요]다.
- 법령을 해석하지 않는다. 조문 이름은 문서에 적힌 그대로 옮긴다.
- 「자격인가_가점인가」가 '자격'인 항목이 하나라도 미충족이면 판정은 No-Go다. '가점'만 미충족이면 조건부다.

Return this output verbatim with the bracketed sections filled in:

## 판정: [Go / No-Go / 조건부]
[한 문장 이유]

### 자격 대조
| 요건 | 자격/가점 | 판정 | 근거 |
|---|---|---|---|
[한 행씩]

### 미충족 항목
[없으면 "없음". 있으면 항목마다 한 줄로: 무엇이 부족하고, 공고 몇 쪽에 그렇게 적혀 있는지]

### [확인필요]
[회사 프로필에 정보가 없어 판정하지 못한 항목. 없으면 "없음"]
```

### 4-2. `build-compliance-matrix` — 요구사항 조견표
```
You build a submittable compliance matrix. 이것은 분석 결과가 아니라 발주처에 제출하는 문서다.

규칙:
- 앞 단계가 뽑은 요구사항을 한 행도 빠뜨리지 않는다.
- 「단서_주석」(※ · 단, · 다만)을 별도 열로 살린다. 이 열을 잃으면 요구를 반대로 읽는다.
- 「수용 여부」는 비워 둔다 — 사람이 채운다. 지어내지 않는다.
- 「대응 제안서 목차」는 RFP가 지정한 목차 중에서만 고른다. 목차에 없는 절을 만들지 않는다.
- 마지막에 반드시 검산 두 줄을 낸다.

Return this output verbatim with the bracketed sections filled in:

## 요구사항 조견표
| 요구사항ID | 분류 | 명칭 | 세부내용 | ※ 단서 | 근거 p | 수용 여부 | 대응 제안서 목차 |
|---|---|---|---|---|---|---|---|
[한 행씩]

## 검산
- 추출 행 수: [N] / 문서가 밝힌 총 건수: [M 또는 "문서에 없음"] → [일치 / 불일치 — 불일치면 사람 확인 필요]
- ※ 단서가 붙은 행: [K]건
```

### 4-3. `build-wbs` — WBS 전개
```
You are a project planner. 과업내용서와 요구사항에서 작업분해구조(WBS)를 만든다.

규칙:
- 문서에 있는 단계·산출물만 쓴다. 일반적인 SI 방법론을 끌어와 채우지 않는다.
- 각 작업 패키지에 근거 요구사항 ID를 단다. 근거가 없으면 그 칸을 비운다.
- 기간은 문서에 적힌 것만. 적혀 있지 않으면 "문서에 없음"으로 두고 숫자를 만들지 않는다.
- WBS ID는 계층을 반영한 점 표기(1 / 1.1 / 1.1.1)로 만든다.

Return this output verbatim with the bracketed sections filled in:

## WBS
| WBS ID | 작업 패키지 | 상위 | 산출물 | 선행 작업 | 기간 | 투입 등급 | 근거 요구사항ID | 근거 p |
|---|---|---|---|---|---|---|---|---|
[한 행씩]

## 공수 합계
- 작업 패키지 수: [N]
- 기간이 문서에 명시된 것: [K] / 명시되지 않은 것: [N-K]
- 총 기간(문서 명시분만): [일]
```

### 4-4. `build-critical-path` — 임계경로 + 제출 체크리스트
```
You compute two critical paths and one checklist. 두 경로를 구분해서 낸다.

경로 A(제안 준비) — 오늘부터 입찰 마감까지. 공휴일과 주말을 빼고 영업일로 센다.
  반드시 포함: 발주처 질의 마감, 제3자 발급 서류의 리드타임(제조사 확약서·실적증명서·신용평가등급확인서),
  출력·제본 물량(제출물의 부수 합계), 제출 방법이 '인편'이면 이동 시간.
경로 B(사업 수행) — WBS의 선후행에서 계산.

규칙:
- 날짜를 지어내지 않는다. 문서에 없는 리드타임은 "[확인필요 — 리드타임 미상]"으로 둔다.
- 임계경로는 여유(Float)가 0인 경로다. 계산 근거를 함께 낸다.

Return this output verbatim with the bracketed sections filled in:

## 경로 A — 제안 준비 (마감 [YYYY-MM-DD])
- 달력 일수: [N]일 / 실질 영업일: [M]일 (제외: [공휴일 목록])
| 작업 | 시작 | 종료 | 소요 | 여유 | 임계 |
|---|---|---|---|---|---|
[한 행씩]
**임계경로: [작업 → 작업 → 작업]**
**가장 먼저 착수해야 할 것: [한 줄]**

## 경로 B — 사업 수행
**임계경로: [WBS ID 나열]** / 총 기간: [일]

## 제출 체크리스트
| 서류 | 부수 | 분량상한 | 유효기간 | 별첨양식 | 준비 주체 |
|---|---|---|---|---|---|
[한 행씩]
- 총 출력 부수: [N]부
- 작성양식 지정 여부: [지정 / 자유 / 불명] [지정인데 양식 미보유면 경고 한 줄]

## 금지 표현 검사 대상
[RFP가 금지한 표현 목록. 제출 직전 전수 검색할 것]
```

---

## 5. 백엔드가 붙잡을 것

| 항목 | 값 |
|---|---|
| 흐름 | 파일 업로드 → Job 생성(`agent_id` + `config_id` + `file_id`) → **Job 조회 폴링** (webhook 없음) |
| 폴링 간격 | 2~5초. 처리는 *"보통 분 단위"* |
| 식별자 | `agt_` + 22자 · `job_` + 22자 · 버전은 `Config #N` |
| API 키 | `up_` 접두사. **`.env`에만.** `.env.example`엔 이름만 |
| 실패 | *"실패한 실행은 과금되지 않아요"* → 재시도 단순 |
| 버전 | 🔴 운영 호출은 **검증된 config 버전을 지정**해서 부른다. 데모 전날 고정 |

**04:00에 동결할 계약 하나** — 위 Instruct 4개의 출력을 담는 팩트시트 JSON. 바꾸려면 둘이 같이.

---

## 6. 04:00 프리플라이트 체크리스트

나라장터 **전면 공개** 공고 1건의 HWP 첨부로 확인한다. 🔴 **기밀 RFP 금지.**

- [ ] Parse가 **HWP를 그대로** 받는가 (변환 없이)
- [ ] 🔴 **요구사항 표의 행이 몇 % 살아남는가** — 원문 행 수와 대조. 실패하면 조견표를 빼고 WBS로 좁힌다
- [ ] 🔴 **`※` 단서가 보존되는가** — 원문 ※ 개수와 추출 `단서_주석` 개수 대조
- [ ] **Split이 합본을 가르는가** (Upstage 자체 데모 p22·p23은 둘 다 Split 꺼짐 — 켠 사례를 못 봤다)
- [ ] `merge_multipage_tables: true`가 여러 쪽 표를 잇는가
- [ ] 직인·도장이 찍힌 스캔 쪽에서 `ocr: force`가 도는가
- [ ] 1건 처리에 몇 분 걸리는가 → 데모 캐시 설계에 반영
- [ ] Instruct가 **Instruct를 받는가** (4단 체인이 실제로 도는가)
- [ ] 1건 실제 차감 크레딧 — $50으로 몇 건인가

## 관련

- [[13_Solar_for_Bid_기획안]] · [[02_기능사전]] · [[06_Studio_실측]] · [[02_외부_사실_확인]]
