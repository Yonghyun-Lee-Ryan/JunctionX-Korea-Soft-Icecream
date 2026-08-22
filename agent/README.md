# Studio 에이전트 — Solar for Bid

화면 9장이 그리는 값을 만드는 **Upstage Studio 에이전트 11종**의 설정 원본과 사용법.

- 정운의 Studio 계정 · 2026-08-22 생성
- 설정 원본은 이 폴더의 JSON, 생성기는 [`build_agents.py`](build_agents.py)
- 전체 목록·단계·입력은 [`manifest.json`](manifest.json)

> [!warning] 🔴 JSON을 손으로 고치지 않는다
> 스키마를 바꿀 때는 `build_agents.py`를 고쳐서 다시 뽑는다.
> ```bash
> python3 agent/build_agents.py
> ```
> 01·02·05는 팀 원본이라 생성기가 건드리지 않는다.

---

## 1. Studio에 올리는 법

Studio → **「에이전트 만들기」 옆 ⌄** → **「에이전트 설정 일괄 가져오기」** → JSON 선택.

2026-08-22 실측으로 확인한 것 넷:

| | 사실 |
|---|---|
| 🟢 | **임포트는 왕복이 정확하다.** 추출 스키마의 `description`까지 한 글자도 안 바뀐다 |
| 🔴 | **한 번에 파일 하나만 받는다.** 여러 개를 골라도 첫 파일만 들어온다 |
| 🔴 | **`agent_name`이 따라오지 않는다.** 전부 「Agent」로 생기므로 목록에서 ⋮ → 이름 편집으로 고친다 |
| 🟡 | Studio가 `outputFormats`에 `text`를, `base64Encoding`에 `figure`를 더하고 `confidenceThreshold`를 버린다. `nodeMode`는 무시한다 |

## 2. 무료 실행 — 🟢 에이전트마다 10회

에디터 우상단의 `0/10`은 **계정이 아니라 에이전트 단위**다(실측 — 03이 1/10일 때 04는 0/10이었다).
파일 하나가 1회다. 다 쓰면 **에이전트를 복사해서**(목록 ⋮ → 에이전트 복사) 다시 10회를 쓴다.

## 3. 🟢 실측 결과 (2026-08-22)

| 에이전트 | 입력 | 결과 |
|---|---|---|
| `03-Requirements` | 제안요청서.hwp (77쪽) | 🟢 `BUILD_IMPLEMENTATION_RFP` → 요구사항 **33건**, 총괄표 8분류 합계 일치. `note_clause`에 `SFR-010`의 「※ 세부 기능 구현 사항은 발주기관과 협의 하에…」가 분리돼 나왔고 `source_page`가 13~26쪽 실제 값 |
| `04-Eligibility-Submission` | 입찰공고서(재공고).hwp (8쪽) | 🟢 `BID_NOTICE` → 자격 **20조항** + 쪽번호, 직접생산자확인증명서·SW사업자 등록·대기업 배제·공동수급 5개사/10% 전부 포착. `constraint_deadline` = 「2026. 08. 24(월) 10:30」 |
| `Company Card Builder` | 사업자등록증·실적증명서 PDF | 🟢 `CO_BIZ_REG` → 상호·사업자번호·대표자·소재지·설립일·업태·종목 |
| `01-Overview` | 제안요청서.hwp | 🟢 사업명·기관·기간·예산 7,000만원·협상에 의한 계약·목표 7 |
| `02-Scope-Context` | 제안요청서.hwp | 🟢 scope_items **32** · execution_context **34** |
| `04-Eligibility-Submission` | 제안요청서.hwp (2차) | 🟢 자격 12 · 제출서식 13(붙임2 가·나·다) · 분량 100쪽/요약 50쪽. 🔴 `proposal_copies=5`는 「최종보고서 5부」 오귀속 → 프롬프트 고침 |
| `05-Conditions-Evaluation` | 제안요청서.hwp | 🟢 수행조건 **182** · 평가항목 **32** (기술 90/가격 10/협상적격 85%) |
| `Company Card Builder` | 나머지 6종 PDF | 🟢 8종 전부 갈래별 추출. 모아보기 YAML로 일괄 내려받음 |
| `Submission Auditor` | 제안서 PDF | 🟠 Classify `OUR_PROPOSAL` 🟢 · Instruct 2노드 🔴 스텁 (3-1) |

실물 출력은 전부 `backend/fixtures/studio/` 에 있다. 백엔드 인수는 `backend/HANDOFF-solar-judgment.md`.

🔴 **HWP를 변환 없이 그대로 먹는다.** 77쪽 2MB 파일이 Parse에서 그대로 열렸다(Enhanced).

### 실측으로 고친 것 둘

**① `04`에만 `BID_NOTICE` 갈래를 더했다.**
입찰공고서를 넣었더니 Classify가 `OTHER_REVIEW_REQUIRED`로 보내 Extract가 아예 안 돌았다.
분류기가 틀린 게 아니다 — 공유 갈래는 「제안요청서 또는 과업문서」만 BUILD로 정의하는데
공고서는 둘 다 아니다. 🔴 그런데 **마감일시·전자입찰 여부는 공고서에만 있다.**
`03`은 그대로 뒀다. 공고서에는 상세 요구사항이 없으니 `OTHER`로 보내는 게 맞다.

**② 최상위 `object` 필드는 Studio가 통째로 버린다.**
`submission_constraints`를 중첩 객체로 뒀더니 결과에서 사라졌다. `schemaLayout`이 표 지향이라
열로 선언되지 않은 객체가 살아남지 못한다. 🔴 **최상위는 스칼라로 평탄화한다** —
`constraint_deadline` 처럼. (`03`의 `requirement_count`가 최상위 스칼라라 살아남은 것이 힌트였다.)

### 🔴 남은 것 — `source_document`는 백엔드가 채운다

`Company Card Builder`의 `source_document`가 빈 값으로 나온다. Studio가 Extract 프롬프트에
**파일명을 넘겨주지 않기 때문**이고 프롬프트로는 못 고친다.
화면①②는 값마다 「사업자 등록증_다온피엠씨.pdf」를 붙여 그리므로,
**업로드한 쪽(백엔드)이 파일명을 알고 있으니 거기서 채워 넣는다.**

## 3-1. 🔴 막힌 것 — Instruct 노드가 실행되지 않는다

**증상.** `Eligibility Screener`를 돌리면 프롬프트와 무관하게 항상 아래 **64자**만 나온다.

```
### 1. invoice_total
RAW: Total: 656.5 USD
BASE_DATE: 2025-11-12
```

Upstage Studio의 Instruct 노드 **기본 예시 출력**이다. 우리 입력(회사 카드·공고)과 아무 관계가 없다.

**배제한 것 — 설정 문제가 아니다.**

| 확인한 것 | 결과 |
|---|---|
| 임포트된 프롬프트가 설정에 있나 | 🟢 있다. 내보내기하면 2,876자 우리 프롬프트가 그대로 |
| UI 편집기에 보이나 | 🟢 보인다. `인식(Parse) → screen-eligibility(Instruct)` 배선도 정상 |
| 노드 모드·모델 | 🟢 `생성만 하기`(자유 형식 텍스트) · 모델 `기본형` |
| 입력이 너무 큰가 | 🔴 아니다. 28쪽 → 12쪽으로 줄여도 같다 |
| 설정 버전 문제인가 | 🔴 아니다. UI에서 프롬프트를 건드려 **설정 #2**로 저장한 뒤에도 같다 |
| 캐시인가 | 🔴 아니다. `cache_hit: false`, job 3건(`job_LMZr…`·`job_fb7L…`·`job_SKSq…`) 전부 같은 출력 |
| **입력이 JSON/HTML이라서인가** | 🔴 아니다. `Submission Auditor`에 **실제 제안서 PDF**를 넣었더니 Classify는 `OUR_PROPOSAL`로 정확히 갈랐지만 뒤의 Instruct 둘(`scan-proposal-language`·`audit-submission-package`)이 **같은 64자**를 냈다 (`job_CAaFwkwX6mxynbhDvKMz5c`). 세 번째 에이전트, 네 번째 job, 실물 PDF — 전부 동일 |

**결론.** 이 계정에서 Instruct 노드는 입력 형식과 무관하게 모델을 태우지 않고 예시 응답을 돌려준다 (플랜·베타 권한 문제로 추정). 에이전트 3개·job 4건·PDF/HTML 입력 모두 동일. 설정 쪽에서 고칠 수 있는 것이 없다.

**되돌림 지점.** [[01_RFP_기획안]] 4절이 이미 이 경우를 적어 뒀다 —
「여러 문서를 합쳐야 하는 판정은 **우리 Node 층 + Solar API**로 내린다」.
프롬프트 5벌은 그대로 쓸 수 있다. `agent/*.json`의 `instructConfiguration.nodes[].prompt`를
백엔드에서 Solar에 그대로 보내면 된다 — Studio를 거치지 않을 뿐 판정 논리는 이미 다 쓰여 있다.

🟢 **Parse·Classify·Extract 층은 영향이 없다.** 공고 해부 5종과 회사 카드는 실측으로 돌아간다.

## 3-2. 🔴 두 번째 문제 — JSON을 파일로 넘기면 Parse가 뭉갠다

Instruct 입력은 앞 단계 JSON을 이어 붙인 파일이다. 백엔드처럼 `<pre>`로 감싸 HTML로 올렸는데,
Document Parse가 그걸 **문서로 보고 레이아웃 분석을 해서 구조를 부순다.**

`in_wps_cp.html`(공고 해부 JSON 21쪽)의 Parse 결과 실물 —

```
2 - Paragraph   진단컨설팅 통합 서비스 개발 / 한국과학기술정보연구원
3 - Paragraph   기능
4 - Paragraph   성능
6 - Heading1    데이터
13 - List       요구사항 / 모드 선택 기능 구현 / 시작 화면범용피지컬종 모드 선택 구분 제공세션
```

따옴표·콜론·중괄호가 사라지고 키와 값이 **다른 블록으로 흩어졌다.**
`"requirement_id": "SFR-001"` 같은 쌍이 남지 않으므로 판정 노드가 읽을 수 있는 입력이 아니다.

**되돌림.** JSON을 파일로 태우지 않는다. 판정 층을 백엔드 Solar API로 옮기면
JSON을 **문자열 그대로** 프롬프트에 넣으므로 Parse를 거치지 않고 이 문제가 사라진다.
Studio를 꼭 거쳐야 한다면 JSON이 아니라 **표(table) 형태 문서**로 만들어 올려야 한다.

## 4. 파이프라인과 입력 파일

```
[회사 서류 9종] ──▶ Company Card Builder ──▶ COMPANY_CARD ─┐
                                                            ├─▶ Eligibility Screener ─▶ 화면③④
[제안요청서·입찰공고서] ─▶ 01~05 ─▶ ANNOUNCEMENT_CORE_V1 ───┤
                                          │                 │
                                          │                 ├─▶ WPS CP Decomposer
                                          │                 │      └─▶ WBS Planner ─▶ 화면⑧ 좌
                                          │                 │            └─▶ Critical Path and Cost ─▶ 화면⑧ 우
                                          │                 │
[우리 제안서 원고] ───────────────────────┴─────────────────┴─▶ Submission Auditor ─▶ 화면⑨
```

> [!important] 🔴 Instruct 노드는 소스를 하나만 받는다
> `Eligibility Screener` · `WBS Planner` · `Critical Path and Cost`는 **두 문서를 맞대는** 판정이다.
> Studio가 다중 입력을 안 주므로 **호출하는 쪽이 두 JSON을 한 파일로 이어 붙여 올린다.**
> 각 프롬프트의 `[파일 입력 계약]` 절이 경계를 찾는 법을 정해 두었다
> (앞 영역 = 회사/WBS, 뒤 영역 = 공고). `Submission Auditor`만 Classify가 갈래를 갈라 준다.

### 데모 입력 (`plan/Solar_for_Bid/06_데모입력/`)

| 무엇 | 파일 |
|---|---|
| 회사 서류 | `*_다온피엠씨_가상.pdf` 8종 (가상 회사) |
| 우리 제안서 | `제안서_다온피엠씨_가상.pdf` — 🔴 **가상 문서**. 금지 표현 3곳이 심겨 있다. 요구사항은 23건을 다루므로 실측 33건 기준 **미대응 10건**(`SFR-008`·`PER-001`·`DAR-004`·`SER-004`·`TQR-001~002`·`PSR-001~004`)이 남는다 |

공고 문서 둘은 **레포에 두지 않는다.** `.gitignore` 51행이 `*.hwp`를 막으며
「조달 원본자료 — 기밀 문서는 레포에 올리지 않는다」고 못 박았다. 로컬에 두고 경로로 올린다.

| 무엇 | 로컬 파일 |
|---|---|
| 제안요청서 | `제안요청서.hwp` — KISTI 「AX 진단-컨설팅 통합 서비스 개발」, 77쪽. 요구사항 **33건**(실측) |
| 입찰공고서 | `입찰공고서(재공고).hwp` — 🔴 **마감·부수·전자입찰 여부는 여기에만 있다.** 제안요청서는 「입찰관련 안내 : 입찰공고문 참조」로 넘긴다 |

데모 공고의 실측값 — 관리번호 `R26BK01673157-000` · 추정가격 63,636,364원 ·
전자입찰(나라장터) · 접수 2026.08.20 09:00 ~ **08.24 10:30** · 기술평가 08.27 14:00 ·
공동수급 5개사 이하·지분 10% 이상 · 하도급 불가 · 직접생산자확인증명 세부품명번호 `8111159801`

## 5. 에이전트 11종

### 공고 해부 (classify-extract · 5)

같은 원본을 다섯이 각자 읽고 결과를 합쳐 `ANNOUNCEMENT_CORE_V1`을 만든다.
분류는 `BUILD_IMPLEMENTATION_RFP` / `PMO_PIA_SERVICE_SPEC` / `OTHER_REVIEW_REQUIRED` 셋이고
갈래마다 추출 스키마가 다르다.

| Studio 이름 | 화면 | 이번에 바뀐 것 |
|---|---|---|
| `01-Overview` | — | — |
| `02-Scope-Context` | — | — |
| `03-Requirements` | ⑦ 요구사항 체크리스트 | 🟠 `note_clause`(※ 단서)와 `source_page`(정수)를 열로 갈랐다 |
| `04-Eligibility-Submission` | ⑥ 파일제출 · ⑨ 제출준비 | 🟠 `copies`·`validity_basis`·`submission_method`를 갈랐고 `submission_constraints`를 더했다 |
| `05-Conditions-Evaluation` | 배점 | — |

### 회사 (classify-extract · 1)

| Studio 이름 | 화면 | 비고 |
|---|---|---|
| `Company Card Builder` | ① 회사 등록 · ② 회사 카드 | 🔴 신규. 갈래 9 + 미확정 1 |

`backend/.env.example`의 `STUDIO_AGENT_BIZ_REG` 등 **서류별 8개를 하나로 합친 것**이다.
서류 종류마다 Agent를 따로 부르지 않아도 되고 — 실행 10회 제한에서 이게 크다 —
**직접생산확인증명서 갈래는 이 Agent에만 있다.** KISTI 공고의 참가자격이 그 서류를 요구한다.

### 판정·산출 (instruct · 5)

| Studio 이름 | 화면 | 비고 |
|---|---|---|
| `Eligibility Screener` | ③④ 공고 탐색 | 🔴 `Company Bid Fit Assessment` 대체 |
| `WPS CP Decomposer` | — | 그대로 |
| `WBS Planner` | ⑧ WBS 좌측 표 | 🔴 신규 |
| `Critical Path and Cost` | ⑧ 임계경로 · M/M 원가 | 🔴 신규 |
| `Submission Auditor` | ⑨ 제출준비 | 🔴 `Submission Package Compliance` 대체 |

**왜 대체했나**

- `Company Bid Fit Assessment`는 `GO` / `NO-GO` **한 단어만** 뱉는다. 화면③④는 「충족 5」와
  항목별 ✓, 근거 파일, 「제외 124건」의 사유와 쪽 번호를 그린다 — 한 단어로는 못 그린다.
  `Eligibility Screener`는 조항마다 `충족 / 미충족 / [확인필요]`와 쪽 번호를 낸다.
- `Submission Package Compliance`에는 부수·유효기간·리드타임·보완요청 문장이 없고
  **금지 표현 검사**가 아예 없다. `Submission Auditor`가 `OUR_PROPOSAL` 갈래를 더해 채웠다.

🔴 origin `e7d37a5`(8/23)가 백엔드의 워크플로 에이전트 층을 지웠다. 판정은 백엔드가 **Solar Chat API로 직접** 한다 — `backend/HANDOFF-solar-judgment.md`.

### 대체돼 안 쓰는 것

`Company Bid Fit Assessment.json` · `Submission Package Compliance.json` — 배선을 옮길 때까지 참고용으로 남겨 둔다.

## 6. 🔗 백엔드 탭 계약과의 대조 (origin/main `0fcc542` 기준)

백엔드가 `kitPages.js`·`kitCells.js`로 탭 9개를 정의해 뒀다. 에이전트 출력이 그 열에
어떻게 들어가는지 — **9개 중 7개가 1:1이고, 둘은 백엔드만 아는 값이 필요하다.**

| 탭 | 백엔드가 요구하는 것 | 에이전트 출력 | |
|---|---|---|---|
| `compliance` | 요구사항ID·분류·명칭·**단서**·**근거 페이지** | `03` → `requirement_id`·`requirement_category`·`requirement_name`·**`note_clause`**·**`source_page`** | 🟢 그대로 |
| `wbs` | ID·작업패키지·산출물·선행·기간·M/M·근거요구·P | `WBS_V1.work_packages[]` 전 필드 | 🟢 배열 둘만 문자열로 조인 |
| `criticalpath` | 작업 · 남은 일 + `tone` | `critical_path[].item`·`due_label`·`severity` | 🟢 `severity`를 백엔드 tone 어휘로 맞췄다 |
| `cost` | value·unit·caption·note·evidence | `cost_estimate.total_mm`·`by_grade[]`·`amount_note`·`references[]` | 🟢 |
| `constraints` | banner text + evidence | `04` → `constraint_*` 스칼라 조립 | 🟢 평탄화가 여기서 값을 한다 |
| `checklist` | 서류·부수·유효기간·상태·보완요청/리드타임·P | `SUBMISSION_AUDIT_V1.documents[]` | 🟢 보완요청+리드타임만 한 칸으로 합침 |
| `rework` | title·chip·detail·action | `rework_requests[]` | 🟢 |
| `phrases` | body·emphasis·evidence | `forbidden_expressions` | 🟢 |
| `submitfiles` | title·**filename**·state·label | `04.submission_requirements[].name` + 🔴 **업로드 파일명** | 🔴 파일명은 백엔드가 |

`verdict`도 같다 — `headline`·`unverified`는 `ELIGIBILITY_SCREENING_V1`에서 그대로 오지만
`reasons[].docId`와 `confidence`는 에이전트가 모른다. `docId`는 업로드한 쪽이 알고,
`confidence`는 Studio 응답의 `content[].additional_values`에 실려 온다.

🔴 **어휘를 맞춰 둔 것** — 상태는 `준비됨 / 보완 필요 / 미확인`, tone은 `danger / warn / default`,
기간 미상은 `미 명시`. 백엔드 fixture와 같은 낱말이라 변환 없이 꽂힌다.

🟢 원격 main은 `workflowAgents.service.js`·`env.js`·`.env.example`을 **건드리지 않았다.**
이 브랜치와 충돌 0 — 배선 작업은 아직 열려 있다.

## 7. 프롬프트 규율 — 열한 노드 공통

모든 프롬프트에 박아 둔 것:

- **판정 어휘 고정** — 항목은 `충족 / 미충족 / [확인필요]` 셋, 건 판정은 `제외 / 추천` 둘.
  🔴 `[확인필요]`는 제외 사유가 아니다 — 못 읽어서 기회를 지우는 쪽이 더 나쁘다
- **근거 강제** — 모든 판정에 회사 서류 이름 + 공고 쪽 번호. 쪽을 모르면 `0`이지 추측이 아니다
- **지어내지 않기** — 없는 실적·자격·기간·유효기간을 만들지 않는다. WBS의 기간은
  문서에 없으면 정확히 `미 명시`
- **법령 해석 금지** — 조문 이름과 번호만 그대로 옮긴다
- **투찰가 금지** — M/M은 `is_recommendation: true`가 붙은 추천값이고 금액으로 환산하지 않는다
- **문장을 고쳐 주지 않는다** — 금지 표현은 걸린 자리만 짚는다. 고치는 것은 사람이다
- **검산 블록** — `WBS Planner`는 요구사항 미연결을, `Eligibility Screener`는 충족/미충족/미확인
  개수를 실제로 세서 낸다
