# Studio 에이전트 (Solar for Bid)

화면에 들어가는 값을 만드는 Upstage Studio 에이전트 11개의 설정 원본과, 올리고 돌려 본 기록입니다.

- 설정 원본은 이 폴더의 JSON 파일이고, 생성기는 `build_agents.py` 입니다.
- 전체 목록과 단계, 입력 파일은 `manifest.json` 에 정리해 뒀습니다.
- 2026-08-22 Studio 계정에서 만들었습니다.

JSON 을 손으로 고치지 마세요. 스키마나 프롬프트를 바꿀 때는 `build_agents.py` 를 고친 뒤 다시 뽑습니다.

```bash
python3 agent/build_agents.py
```

01·02·05 는 팀원이 Studio 에서 직접 만들어 내보낸 원본이라 생성기가 건드리지 않습니다.

---

## 1. Studio 에 올리기

Studio → 「에이전트 만들기」 옆 ⌄ → 「에이전트 설정 일괄 가져오기」 → JSON 선택.

직접 해 보면서 알게 된 것들:

- 임포트는 정확합니다. 내보내기로 다시 받아 보면 추출 스키마의 description 까지 그대로입니다.
- 한 번에 파일 하나만 들어갑니다. 여러 개를 골라도 첫 파일만 올라갑니다.
- `agent_name` 은 따라오지 않습니다. 전부 「Agent」라는 이름으로 생기니 목록에서 ⋮ → 이름 편집으로 바꿔야 합니다.
- Studio 가 `outputFormats` 에 `text` 를, `base64Encoding` 에 `figure` 를 추가하고 `confidenceThreshold` 는 버립니다. `nodeMode` 도 무시합니다. 동작에는 영향이 없었습니다.

## 2. 무료 실행 횟수

에디터 우상단의 `0/10` 은 계정이 아니라 에이전트 단위입니다 (03 이 1/10 일 때 04 는 0/10 이었습니다). 파일 하나를 돌리면 1회 소모됩니다. 다 쓰면 에이전트를 복사해서 (목록 ⋮ → 에이전트 복사) 10회를 더 쓸 수 있습니다.

## 3. 돌려 본 결과 (2026-08-22)

| 에이전트 | 입력 | 결과 |
|---|---|---|
| 01-Overview | 제안요청서.hwp | 사업명·기관·기간·예산(7,000만원)·협상에 의한 계약·목표 7개 |
| 02-Scope-Context | 제안요청서.hwp | scope_items 32, execution_context 34 |
| 03-Requirements | 제안요청서.hwp (77쪽) | `BUILD_IMPLEMENTATION_RFP` 로 분류, 요구사항 33건. 총괄표 8분류 합계와 일치. SFR-010 의 「※ 세부 기능 구현 사항은 발주기관과 협의 하에…」가 `note_clause` 로 분리됐고 `source_page` 는 13~26쪽 실제 값 |
| 04-Eligibility-Submission | 입찰공고서(재공고).hwp (8쪽) | `BID_NOTICE` 로 분류, 자격 20개 조항 + 쪽번호. 직접생산확인증명, SW사업자 등록, 대기업 배제, 공동수급(5개사/10%) 모두 잡힘. `constraint_deadline` = 2026. 08. 24(월) 10:30 |
| 04-Eligibility-Submission | 제안요청서.hwp | 자격 12, 제출서식 13(붙임2 가·나·다), 분량 100쪽/요약 50쪽. `proposal_copies=5` 는 「최종보고서 5부」를 잘못 가져온 것이라 프롬프트를 고쳤습니다 |
| 05-Conditions-Evaluation | 제안요청서.hwp | 수행조건 182, 평가항목 32 (기술 90/가격 10/협상적격 85%) |
| Company Card Builder | 회사 서류 PDF 8종 | 8종 모두 갈래별로 추출됨. 모아보기 YAML 로 한 번에 내려받았습니다 |
| Submission Auditor | 제안서 PDF | Classify 는 `OUR_PROPOSAL` 로 정확히 갈랐지만 뒤의 Instruct 노드 두 개는 스텁 출력 (3-1 참고) |

실제 출력 파일은 `backend/fixtures/studio/` 에 있고, 백엔드 쪽 인수 내용은 `backend/HANDOFF-solar-judgment.md` 에 있습니다.

HWP 는 변환 없이 그대로 올려도 됩니다. 77쪽 2MB 파일이 Parse(Enhanced)에서 바로 열렸습니다.

### 돌려 보고 고친 것

**04 에만 `BID_NOTICE` 갈래를 추가했습니다.**
입찰공고서를 넣었더니 Classify 가 `OTHER_REVIEW_REQUIRED` 로 보내서 Extract 가 돌지 않았습니다. 분류기가 틀린 건 아닙니다. 공유 갈래는 「제안요청서 또는 과업문서」만 BUILD 로 정의하는데 공고서는 둘 다 아니니까요. 문제는 마감일시와 전자입찰 여부가 공고서에만 있다는 점이어서 04 에만 갈래를 더했습니다. 03 은 그대로 뒀습니다. 공고서에는 상세 요구사항이 없으니 OTHER 로 보내는 게 맞습니다.

**최상위 object 필드는 Studio 가 버립니다.**
`submission_constraints` 를 중첩 객체로 뒀더니 결과에서 사라졌습니다. `schemaLayout` 이 표 지향이라 열로 선언되지 않은 객체는 살아남지 못하는 것 같습니다. 그래서 최상위는 `constraint_deadline` 처럼 스칼라로 평탄화했습니다. 03 의 `requirement_count` 가 최상위 스칼라라서 살아남은 게 힌트였습니다.

### 남은 것: `source_document` 는 백엔드가 채웁니다

Company Card Builder 의 `source_document` 가 빈 값으로 나옵니다. Studio 가 Extract 프롬프트에 파일명을 넘겨주지 않아서 프롬프트로는 해결이 안 됩니다. 화면 ①②는 값마다 「사업자 등록증_다온피엠씨.pdf」 같은 파일명을 붙여 보여 주므로, 파일명을 아는 쪽(업로드한 백엔드)에서 채워 넣습니다.

## 3-1. Instruct 노드가 프롬프트를 태우지 않았습니다

Eligibility Screener 를 돌리면 프롬프트와 상관없이 항상 아래 64자만 나옵니다.

```
### 1. invoice_total
RAW: Total: 656.5 USD
BASE_DATE: 2025-11-12
```

Studio Instruct 노드의 기본 예시 출력입니다. 우리 입력(회사 카드, 공고)과는 아무 관계가 없습니다.

설정 문제는 아닌 것으로 확인했습니다.

| 확인한 것 | 결과 |
|---|---|
| 임포트된 프롬프트가 설정에 있는지 | 있음. 내보내기하면 2,876자 프롬프트가 그대로 나옴 |
| UI 편집기에 보이는지 | 보임. `인식(Parse) → screen-eligibility(Instruct)` 배선도 정상 |
| 노드 모드·모델 | `생성만 하기`(자유 형식 텍스트), 모델 `기본형` |
| 입력이 너무 큰지 | 아님. 28쪽을 12쪽으로 줄여도 같음 |
| 설정 버전 문제인지 | 아님. UI 에서 프롬프트를 건드려 설정 #2 로 저장해도 같음 |
| 캐시인지 | 아님. `cache_hit: false`, job 3건 모두 같은 출력 |
| 입력이 JSON/HTML 이라서인지 | 아님. Submission Auditor 에 실제 제안서 PDF 를 넣어도 Classify 만 맞고 뒤 Instruct 둘은 같은 64자 |

이 계정에서는 Instruct 노드가 입력 형식과 관계없이 모델을 태우지 않고 예시 응답을 돌려줍니다. 플랜이나 베타 권한 문제로 보이고, 설정 쪽에서 손댈 수 있는 게 없었습니다. 에이전트 3개, job 4건, PDF/HTML 입력 모두 같았습니다.

대안은 기획안 4절에 적어 둔 대로입니다. 여러 문서를 합쳐야 하는 판정은 백엔드 Node 층에서 Solar API 로 직접 합니다. 프롬프트 5벌은 그대로 쓸 수 있습니다. `agent/*.json` 의 `instructConfiguration.nodes[].prompt` 를 백엔드에서 Solar 에 그대로 보내면 되고, Studio 를 거치지 않을 뿐 판정 로직은 이미 다 들어 있습니다.

Parse·Classify·Extract 층은 영향이 없습니다. 공고 해부 5종과 회사 카드는 정상 동작합니다.

## 3-2. JSON 을 파일로 넘기면 Parse 가 구조를 깨뜨립니다

Instruct 입력은 앞 단계 JSON 을 이어 붙인 파일입니다. 백엔드에서 하던 대로 `<pre>` 로 감싼 HTML 로 올렸더니 Document Parse 가 그걸 문서로 보고 레이아웃 분석을 해서 구조를 부숩니다.

`in_wps_cp.html`(공고 해부 JSON 21쪽)의 Parse 결과 일부:

```
2 - Paragraph   진단컨설팅 통합 서비스 개발 / 한국과학기술정보연구원
3 - Paragraph   기능
4 - Paragraph   성능
6 - Heading1    데이터
13 - List       요구사항 / 모드 선택 기능 구현 / 시작 화면범용피지컬종 모드 선택 구분 제공세션
```

따옴표, 콜론, 중괄호가 사라지고 키와 값이 다른 블록으로 흩어집니다. `"requirement_id": "SFR-001"` 같은 쌍이 남지 않으니 판정 노드가 읽을 수 있는 입력이 아닙니다.

그래서 JSON 을 파일로 태우지 않기로 했습니다. 판정 층을 백엔드 Solar API 로 옮기면 JSON 을 문자열 그대로 프롬프트에 넣으니 Parse 를 거치지 않고 이 문제가 사라집니다. 꼭 Studio 를 거쳐야 한다면 JSON 이 아니라 표 형태 문서로 만들어 올려야 합니다.

## 3-3. 해결 방법: 판정 층을 백엔드 + Solar API 로

3-1 과 3-2 는 같은 방법으로 풀었습니다. Instruct 노드가 하던 일을 Studio 밖으로 꺼내서, 백엔드가 Solar Pro 3 chat API 를 직접 호출합니다. 이 폴더 기준으로 달라지는 점은 아래와 같습니다.

**프롬프트 원본은 그대로 이 폴더의 JSON 입니다.** 백엔드는 실행 시점에 `agent/*.json` 을 열어 `instructConfiguration.nodes[].prompt` 를 system 프롬프트로 씁니다. 파일과 노드 이름을 백엔드가 고정해서 보고 있으니 이름을 바꾸면 안 됩니다.

| 판정 | JSON 파일 | 노드 이름 |
|---|---|---|
| 참가자격 | `Eligibility Screener.json` | `screen-eligibility` |
| WPS/CP 분해 | `WPS CP Decomposer.json` | `decompose-wps-cp` |
| WBS | `WBS Planner.json` | `build-wbs` |
| 임계경로·M/M | `Critical Path and Cost.json` | `estimate-path-cost` |
| 제출 규칙 정리 | `Submission Auditor.json` | `prepare-document-info` |
| 원고 금지 표현 스캔 | `Submission Auditor.json` | `scan-proposal-language` |
| 제출 패키지 검사 | `Submission Auditor.json` | `audit-submission-package` |

프롬프트를 고칠 때의 순서도 같습니다. `build_agents.py` 수정 → `python3 agent/build_agents.py` 로 JSON 재생성 → 백엔드 재시작(프롬프트를 메모리에 캐시합니다). Studio 에 다시 올리지 않아도 됩니다.

**입력은 파일이 아니라 문자열입니다.** 앞 단계 JSON(`COMPANY_CARD`, `ANNOUNCEMENT_CORE_V1`, `WPS_CP_V1`, `WBS_V1`, `PROPOSAL_SCAN_V1`)을 user 메시지에 이름표를 붙여 그대로 넣습니다. Parse 를 거치지 않으니 3-2 의 구조 깨짐은 생기지 않고, 두 문서를 한 파일로 이어 붙일 필요도 없습니다. 프롬프트의 `[파일 입력 계약]` 절은 이름표가 같아서 그대로 읽힙니다.

**공고 전체를 보내지 않고 판정마다 필요한 칸만 보냅니다.** 공고 해부 결과가 90KB 정도라 통째로 보내면 응답이 2분을 넘겨 끊겼습니다. 자격 판정에는 개요·제약·자격 조항, 제출 검사에는 제출물·평가항목, WBS 에는 요구사항의 ID·분류·이름·쪽만, 임계경로에는 자격 조항과 입찰 제출물만 보냅니다. 모델은 `solar-pro3`, 응답 대기는 기본 300초입니다.

**출력은 JSON 만 받고, 백엔드가 검산합니다.** 프롬프트 끝의 JSON-only 계약은 그대로이고, 받은 뒤에는 백엔드가 한 번 더 손봅니다. 자격 판정의 충족/미충족/확인필요 개수를 다시 세고 근거 쪽이 공고에 없는 값이면 0 으로 되돌리고, WBS 는 요구사항 미연결과 16건 넘는 패키지를 세고 기간이 비면 「미 명시」로 두고, 임계경로가 비어 오면 공고의 마감·등록 서류로 채우고, 금지 표현은 모델이 놓친 자리를 백엔드가 전문 검색으로 보탭니다. 모델이 틀려도 화면에 거짓이 올라가지 않게 하는 장치입니다.

**Studio 가 맡는 층은 그대로입니다.** Company Card Builder 와 01~05 는 여전히 Studio 의 `/v2/files` + `/v2/responses` 로 돌리고, 결과는 파일 해시 기준으로 DB 에 캐시해 같은 파일을 두 번 사지 않습니다. 키는 둘로 나뉩니다. 팀 공용 `UPSTAGE_API_KEY` 는 Studio 용이고, Solar 호출과 Agents API 는 `UPSTAGE_AGENT_API_KEY` 를 씁니다.

**호출 횟수.** 케이스 하나에 Solar 는 자격 1회 + 계획 3회 + 제출 검사 1~3회이고, 판정 일부만 다시 돌리는 경로(`rejudge`)가 있어서 서류 하나 올릴 때는 제출 검사 1회만 듭니다. 수치와 구현 위치는 `backend/HANDOFF-solar-judgment.md` 에 있습니다.

나중에 Instruct 노드가 이 계정에서 정상 동작하면, 같은 JSON 을 그대로 Studio 에서 돌릴 수 있습니다. 그 경우에 대비해 프롬프트의 파일 입력 계약과 JSON 출력 계약은 바꾸지 않았습니다.

## 4. 파이프라인

전체 흐름은 7단계입니다. 단계마다 프론트·백엔드·Upstage 가 맡는 일이 다르고, 04(추천)와 07(제출 준비)은 사람이 결정해야 다음으로 넘어갑니다.

| 단계 | 프론트 | 백엔드 | Upstage |
|---|---|---|---|
| 01 회사 등록 | 서류 9종 → 회사 프로필. 읽지 못한 값은 직접 입력할 수 있게 남겨 둠 | `POST /api/companies`. 실적·파일 메타데이터를 모아 프로필을 만들고, 한 번 만들면 캐시 | Company Card Builder. Parse → 9갈래 Classify → Extract. 서류당 1 job, 회사당 한 번 |
| 02 공고 탐색 | 「127건 중 3건」처럼 전체 모수와 선별 결과를 보여 주고, 제외된 건마다 사유를 붙임 | `GET …/screening`. 목록 메타데이터만으로 싸게 거름. 근거가 분명할 때만 제외하고 아니면 후보로 둠 | — |
| 03 분석 | 4초마다 폴링. 어느 단계에서 실패했는지 그대로 표시 | 나라장터 첨부를 자동 수집 → 분석 → 병합. 결과는 SHA-256 으로 캐시하고 끊긴 job 은 이어받음 | Studio 에이전트 01~05, 케이스당 6 job. HWP 를 변환 없이 Parse → Classify → Extract, 핵심 필드와 RFP 요구사항 추출 |
| 04 추천 (사람 결정) | 추천 카드 → 응찰 준비. 사람이 결정해야 다음 단계가 열리고, 확인 필요 항목은 전부 보여 줌 | 회사 프로필과 참가자격을 대조해 추천/제외를 냄. 제외에는 쪽 단위 근거가 있어야 하고, 읽지 못한 칸은 확인 필요로 남김 | Solar Pro 3 · Eligibility Screener. 자격·제출 관련 절만 잘라서 입력 |
| 05 요구사항 | 체크리스트. 요구사항 ID·단서·근거 쪽, XLSX 내려받기 | 요구사항 145건 → 체크리스트. 라벨은 백엔드가 정하고 프론트는 추론하지 않음 | — |
| 06 계획 | WBS·임계경로·M/M. 마감은 항상 보이게 | WPS/CP → WBS → 임계경로 + 검산. 큰 패키지는 나누고, 있는 결과는 다시 씀 | Solar Pro 3 · 계획 3종 (WPS/CP Decomposer, WBS Planner, Critical Path & Cost) |
| 07 제출 준비 (사람 결정) | 파일 제출·제출 준비도. 필요한 서류와 제안서 원고를 올리면 금지 표현과 사람이 봐야 할 항목을 표시 | 업로드 → 제출 검사. 금지 표현은 전문을 검색하고, 바뀐 것만 다시 검사 | Solar Pro 3 · Submission Auditor (규칙 정리 → 원고 스캔 → 패키지 검사) |

흐름만 간단히 적으면 이렇습니다.

```
회사 서류 9종 ─ Company Card Builder ─▶ COMPANY_CARD ──┐
                                                       ├─▶ Eligibility Screener ─▶ 04 추천
제안요청서·입찰공고서 ─ 01~05 ─▶ ANNOUNCEMENT_CORE_V1 ──┤
                                                       ├─▶ WPS/CP → WBS → Critical Path & Cost ─▶ 06 계획
우리 제안서 원고 ───────────────────────────────────────┴─▶ Submission Auditor ─▶ 07 제출 준비
```

### Studio 와 Solar API 의 역할 분담

Upstage 쪽은 두 층으로 나뉩니다.

**문서를 읽는 층은 Studio 가 맡습니다.** Company Card Builder 와 01~05 는 Parse → Classify → Extract 구조이고, 3절에 적은 대로 HWP·PDF 원본을 그대로 넣어도 잘 돌아갑니다. 이 층의 출력(`COMPANY_CARD`, `ANNOUNCEMENT_CORE_V1`)이 뒤 단계의 입력이 됩니다.

**판정하는 층은 백엔드가 Solar Pro 3 API 를 직접 불러서 합니다.** 원래는 Eligibility Screener, WPS CP Decomposer, WBS Planner, Critical Path and Cost, Submission Auditor 의 Instruct 노드가 이 일을 하도록 설계했는데, 3-1 에 적었듯 우리 계정에서는 Instruct 노드가 실행되지 않고 예시 응답만 돌려줍니다. 설정 쪽에서는 고칠 수 없는 문제라서, 같은 프롬프트를 백엔드가 `agent/*.json` 의 `instructConfiguration.nodes[].prompt` 에서 읽어 Solar Pro 3 chat API 에 보내는 방식으로 바꿨습니다. 판정 로직은 프롬프트에 이미 다 들어 있으니 Studio 를 거치지 않을 뿐 결과의 모양은 같습니다. 구체적인 수단은 3-3 에 있습니다.

이렇게 바꾸면서 같이 해결된 것이 있습니다.

- 3-2 의 Parse 문제가 사라집니다. 앞 단계 JSON 을 파일로 올리지 않고 문자열 그대로 프롬프트에 넣으니 구조가 깨지지 않습니다.
- 두 문서를 맞대는 판정(회사 카드 ↔ 공고, WBS ↔ 공고)을 한 파일로 이어 붙일 필요가 없습니다. 백엔드가 두 JSON 을 각각 프롬프트에 넣습니다.
- 판정마다 필요한 필드만 잘라 보냅니다. 자격 판정에는 자격 조항과 제출물, WBS 에는 요구사항 ID·분류·이름·쪽만 보내는 식입니다. 공고 전체(약 90KB)를 그대로 보내면 응답이 너무 느려서 이렇게 나눴습니다.

프롬프트 안의 `[파일 입력 계약]` 절(앞 영역 = 회사/WBS, 뒤 영역 = 공고)은 그대로 남겨 뒀습니다. Studio 의 Instruct 노드가 나중에 정상 동작하면 백엔드를 거치지 않고도 같은 설정으로 돌릴 수 있게 하려는 것입니다.

백엔드 쪽 구현과 호출 횟수는 `backend/HANDOFF-solar-judgment.md` 에 있습니다.

### 데모 입력 (`plan/Solar_for_Bid/06_데모입력/`)

| 무엇 | 파일 |
|---|---|
| 회사 서류 | `*_다온피엠씨_가상.pdf` 8종 (가상 회사) |
| 우리 제안서 | `제안서_다온피엠씨_가상.pdf`. 가상 문서이고 금지 표현 3곳을 일부러 넣어 뒀습니다. 요구사항 23건만 다루므로 33건 기준으로 10건(`SFR-008`·`PER-001`·`DAR-004`·`SER-004`·`TQR-001~002`·`PSR-001~004`)이 미대응으로 남습니다 |

공고 문서 두 개는 레포에 두지 않습니다. `.gitignore` 에서 `*.hwp` 를 막아 뒀습니다 (조달 원본은 기밀이라 올리지 않기로 했습니다). 로컬에 두고 경로로 올립니다.

| 무엇 | 로컬 파일 |
|---|---|
| 제안요청서 | `제안요청서.hwp` — KISTI 「AX 진단-컨설팅 통합 서비스 개발」, 77쪽, 요구사항 33건 |
| 입찰공고서 | `입찰공고서(재공고).hwp` — 마감·부수·전자입찰 여부는 여기에만 있습니다. 제안요청서는 「입찰관련 안내 : 입찰공고문 참조」로 넘깁니다 |

데모 공고 정보: 관리번호 `R26BK01673157-000`, 추정가격 63,636,364원, 전자입찰(나라장터), 접수 2026.08.20 09:00 ~ 08.24 10:30, 기술평가 08.27 14:00, 공동수급 5개사 이하·지분 10% 이상, 하도급 불가, 직접생산확인증명 세부품명번호 `8111159801`.

## 5. 에이전트 11개

### 공고 해부 (classify-extract, 5개)

같은 원본을 다섯이 각자 읽고 결과를 합쳐 `ANNOUNCEMENT_CORE_V1` 을 만듭니다. 분류는 `BUILD_IMPLEMENTATION_RFP` / `PMO_PIA_SERVICE_SPEC` / `OTHER_REVIEW_REQUIRED` 셋이고 갈래마다 추출 스키마가 다릅니다.

| Studio 이름 | 화면 | 이번에 바뀐 것 |
|---|---|---|
| 01-Overview | — | — |
| 02-Scope-Context | — | — |
| 03-Requirements | ⑦ 요구사항 체크리스트 | `note_clause`(※ 단서)와 `source_page`(정수)를 별도 열로 분리 |
| 04-Eligibility-Submission | ⑥ 파일제출 · ⑨ 제출준비 | `copies`·`validity_basis`·`submission_method` 분리, `submission_constraints` 추가 |
| 05-Conditions-Evaluation | 배점 | — |

### 회사 (classify-extract, 1개)

| Studio 이름 | 화면 | 비고 |
|---|---|---|
| Company Card Builder | ① 회사 등록 · ② 회사 카드 | 신규. 갈래 9개 + 미확정 1개 |

`backend/.env.example` 의 `STUDIO_AGENT_BIZ_REG` 같은 서류별 에이전트 8개를 하나로 합친 것입니다. 서류 종류마다 에이전트를 따로 부르지 않아도 되고(실행 10회 제한에서 이게 큽니다), 직접생산확인증명서 갈래는 이 에이전트에만 있습니다. KISTI 공고의 참가자격이 그 서류를 요구합니다.

### 판정·산출 (instruct, 5개)

| Studio 이름 | 화면 | 비고 |
|---|---|---|
| Eligibility Screener | ③④ 공고 탐색 | `Company Bid Fit Assessment` 를 대체 |
| WPS CP Decomposer | — | 그대로 |
| WBS Planner | ⑧ WBS 좌측 표 | 신규 |
| Critical Path and Cost | ⑧ 임계경로 · M/M 원가 | 신규 |
| Submission Auditor | ⑨ 제출준비 | `Submission Package Compliance` 를 대체 |

대체한 이유:

- Company Bid Fit Assessment 는 `GO` / `NO-GO` 한 단어만 냅니다. 화면 ③④는 「충족 5」와 항목별 체크, 근거 파일, 「제외 124건」의 사유와 쪽번호를 그리는데 한 단어로는 안 됩니다. Eligibility Screener 는 조항마다 `충족 / 미충족 / [확인필요]` 와 쪽번호를 냅니다.
- Submission Package Compliance 에는 부수, 유효기간, 리드타임, 보완요청 문장이 없고 금지 표현 검사도 없습니다. Submission Auditor 가 `OUR_PROPOSAL` 갈래를 더해 채웠습니다.

8/23 에 백엔드의 워크플로 에이전트 층이 정리되면서 판정은 백엔드가 Solar Chat API 로 직접 합니다. 자세한 건 `backend/HANDOFF-solar-judgment.md` 를 보세요.

### 대체돼서 안 쓰는 것

`Company Bid Fit Assessment.json`, `Submission Package Compliance.json`. 배선을 옮길 때까지 참고용으로 남겨 둡니다.

## 6. 백엔드 탭 계약과의 대조

백엔드가 `kitPages.js`·`kitCells.js` 로 탭 9개를 정의해 뒀습니다. 에이전트 출력이 그 열에 어떻게 들어가는지 맞춰 봤습니다. 9개 중 7개는 1:1 이고, 둘은 백엔드만 아는 값이 필요합니다.

| 탭 | 백엔드가 요구하는 것 | 에이전트 출력 | 비고 |
|---|---|---|---|
| compliance | 요구사항ID·분류·명칭·단서·근거 페이지 | 03 → `requirement_id`·`requirement_category`·`requirement_name`·`note_clause`·`source_page` | 그대로 |
| wbs | ID·작업패키지·산출물·선행·기간·M/M·근거요구·P | `WBS_V1.work_packages[]` 전 필드 | 배열 둘만 문자열로 조인 |
| criticalpath | 작업 · 남은 일 + tone | `critical_path[].item`·`due_label`·`severity` | severity 를 백엔드 tone 어휘로 맞춤 |
| cost | value·unit·caption·note·evidence | `cost_estimate.total_mm`·`by_grade[]`·`amount_note`·`references[]` | 그대로 |
| constraints | banner text + evidence | 04 → `constraint_*` 스칼라 조립 | 평탄화가 여기서 쓰임 |
| checklist | 서류·부수·유효기간·상태·보완요청/리드타임·P | `SUBMISSION_AUDIT_V1.documents[]` | 보완요청+리드타임만 한 칸으로 합침 |
| rework | title·chip·detail·action | `rework_requests[]` | 그대로 |
| phrases | body·emphasis·evidence | `forbidden_expressions` | 그대로 |
| submitfiles | title·filename·state·label | `04.submission_requirements[].name` + 업로드 파일명 | 파일명은 백엔드가 채움 |

`verdict` 도 마찬가지입니다. `headline`·`unverified` 는 `ELIGIBILITY_SCREENING_V1` 에서 그대로 오지만 `reasons[].docId` 와 `confidence` 는 에이전트가 모릅니다. `docId` 는 업로드한 쪽이 알고, `confidence` 는 Studio 응답의 `content[].additional_values` 에 실려 옵니다.

어휘는 백엔드 fixture 와 맞춰 뒀습니다. 상태는 `준비됨 / 보완 필요 / 미확인`, tone 은 `danger / warn / default`, 기간 미상은 `미 명시`. 같은 낱말이라 변환 없이 들어갑니다.

## 7. 프롬프트 공통 규칙

열한 노드 모두에 넣어 둔 것들입니다.

- 판정 어휘 고정. 항목은 `충족 / 미충족 / [확인필요]` 셋, 건 판정은 `제외 / 추천` 둘. `[확인필요]` 는 제외 사유가 아닙니다. 못 읽어서 기회를 지우는 쪽이 더 나쁩니다.
- 근거 강제. 모든 판정에 회사 서류 이름과 공고 쪽번호를 붙입니다. 쪽을 모르면 `0` 으로 두고 추측하지 않습니다.
- 지어내지 않기. 없는 실적, 자격, 기간, 유효기간을 만들지 않습니다. WBS 기간은 문서에 없으면 `미 명시` 로 둡니다.
- 법령 해석 금지. 조문 이름과 번호만 그대로 옮깁니다.
- 투찰가 금지. M/M 은 `is_recommendation: true` 가 붙은 추천값이고 금액으로 환산하지 않습니다.
- 문장을 고쳐 주지 않기. 금지 표현은 걸린 자리만 짚습니다. 고치는 건 사람이 합니다.
- 검산 블록. WBS Planner 는 요구사항 미연결을, Eligibility Screener 는 충족/미충족/미확인 개수를 실제로 세서 냅니다.

## 8. 앞으로

지금 구조가 다음 단계를 싸게 만들어 줍니다.

서류 갈래를 늘리는 비용이 에이전트 하나입니다. Company Card Builder 에 갈래를 더하고 `build_agents.py` 를 다시 돌리면, 백엔드의 분류 규칙과 화면은 그대로 둔 채 새 서류를 읽을 수 있습니다. 직접생산확인증명서가 지금 그 자리에 갈래만 정의된 채로 있습니다.

공고 종류도 마찬가지입니다. 지금은 용역 RFP 와 입찰공고서를 보고 있는데, Classify 갈래를 늘리고 그 갈래의 추출 스키마를 붙이면 물품이나 공사 공고로 넓어집니다. `SERVICE_OPERATION_RFP` 를 추가할 때 실제로 그렇게 했습니다.

판정 층은 프롬프트가 파일이라 확장이 더 쌉니다. 낙찰 사후 추적이나 발주기관 카드 같은 판정이 생기면, JSON 을 하나 더 두고 백엔드의 프롬프트 맵에 등록하면 됩니다. 코드는 바뀌지 않습니다.

Instruct 노드가 이 계정에서 열리면 판정 층을 Studio 안으로 되돌릴 수 있습니다. 그때를 위해 프롬프트의 파일 입력 계약과 JSON 출력 계약을 그대로 두었습니다. 백엔드로 옮긴 것은 실행 위치일 뿐, 판정 논리는 이 폴더의 JSON 에 그대로 남아 있습니다.
