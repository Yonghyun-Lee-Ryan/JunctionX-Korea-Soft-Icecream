# Solar for Bid

공공 입찰 공고를 대신 읽고, 낼 수 있는 건을 골라, 제안 착수에 필요한 것을 만들어 냅니다.

회사 서류를 한 묶음 올리면 참가자격이 맞는 공고가 추려집니다. 응찰하기로 정한 건은 요구사항 체크리스트와 WBS, 임계경로, 투입 M/M 추정, 제출 서류 점검표까지 이어집니다. 마지막 화면이 답하는 질문은 하나입니다. 무엇을 언제까지 어디에 내야 하는가.

JunctionX Korea 2026 · Upstage 트랙 · 팀 soft icecream (기획 정운, 개발 이용현·길정민, 디자인 주예진)

## 왜 만들었나

중소 SI·PMO 회사가 입찰 한 건을 준비하는 일은 100쪽짜리 제안요청서를 처음부터 끝까지 읽는 데서 시작합니다. 참가자격을 채우는지, 제출물이 몇 종이고 언제까지 몇 부인지, 요구사항이 몇 건인지, 사람을 얼마나 붙여야 하는지가 문서 곳곳에 흩어져 있습니다. 나라장터에는 용역 공고만 2주에 5천 건 넘게 올라오니, 낼 수 있는 건을 추리는 일부터 하루가 갑니다.

읽는 일 자체는 기계가 잘합니다. 어려운 쪽은 기계가 틀렸을 때입니다. 입찰은 서류 한 장이 비면 그 자리에서 떨어지는 판이라 "아마 맞을 것"은 쓸모가 없습니다.

그래서 값을 뽑는 일만큼 근거를 남기는 데 공을 들였습니다. 화면의 모든 숫자에는 어느 서류 몇 쪽에서 나왔는지가 따라붙습니다. 읽어 내지 못한 칸은 0으로 메우지 않고 비워 둔 채 미확인이라고 적습니다. 판정이 서지 않으면 후보에서 지우는 대신 사람에게 넘깁니다.

## 화면 다섯 장

| | 화면 | 하는 일 |
|---|---|---|
| 1 | 회사 등록 | 사업자등록증, 실적증명서 같은 서류를 끌어다 놓으면 종류를 갈라 값을 뽑고, 오른쪽 회사 카드가 채워집니다 |
| 2 | 회사 카드 | 공공 PMO 실적, 기술인력, 신용등급, 최대 단일 계약을 근거 파일과 함께 보여 줍니다 |
| 3 | 공고 탐색 | 「N건 중 M건」이 헤드라인입니다. 걸러 낸 건은 사유를 적어 함께 보여 줍니다. 응찰 여부는 사람이 찍습니다 |
| 4 | 응찰 준비중인 공고 | 사람이 고른 건만 남습니다. 가장 급한 마감을 영업일로 셉니다 |
| 5 | Bid Kit | 파일 제출, 요구사항 체크리스트, WBS와 임계경로, 제출 준비. 탭 구성과 버튼 문구까지 서버가 내려 줍니다 |

공고 하나를 해부하고 판정하는 데 몇 분이 걸립니다. 커밋해 둔 실행 기록으로는 캐시 없이 처음부터 돌 때 10분 22초, Studio 결과가 이미 있을 때 4분 11초였습니다. 그동안 화면은 4초마다 다시 물어 지금 어느 단계인지 알려 줍니다. 도는 원 하나만 띄워 놓고 기다리게 하지 않았습니다.

## 5분 만에 돌려보기

필요한 것은 Node 20.11 이상, Flutter(Dart SDK 3.11.5 이상), Python 3입니다. 개발은 Node 22.23과 Flutter 3.47.1에서 했습니다.

```bash
# 백엔드
cp backend/.env.example backend/.env      # 키가 비어 있어도 그대로 뜹니다
cd backend && npm install && npm run dev  # http://localhost:3000, 부팅할 때 마이그레이션까지

# 프론트 (새 터미널)
cd front && flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000
```

API 문서는 `http://localhost:3000/docs`에 Swagger UI로 떠 있습니다.

웹 산출물로 띄우려면 이렇게 합니다.

```bash
cd front
flutter build web --release --no-web-resources-cdn \
  --dart-define=API_BASE_URL=http://localhost:3000
python3 -m http.server 8123 --directory build/web
```

`API_BASE_URL`은 컴파일 타임 상수라 한 번 빌드하면 주소를 바꿀 수 없습니다. `--no-web-resources-cdn`을 빼면 CanvasKit을 gstatic에서 받아오므로, 네트워크가 없는 자리에서는 흰 화면이 됩니다.

레포 루트 `.claude/launch.json`에 세 항목을 정의해 뒀습니다.

| 이름 | 명령 | 포트 |
|---|---|---|
| `backend` | `node backend/src/server.js` | 3000 |
| `front-web` | `python3 -m http.server 8123 --directory front/build/web` | 8123 |
| `mock-upstage` | `node backend/scripts/mock-upstage.js` | 3999 |

### 키가 없어도 끝까지 돕니다

API 키를 하나도 넣지 않아도 서버는 뜨고 화면은 끝까지 돌아갑니다. 대신 지금 보고 있는 것이 실호출이 아니라는 사실을 응답이 스스로 밝힙니다(`meta.cached`, `meta.listSource`, `meta.source`). 데모에서 실시간이라고 말하기 전에 이 필드를 보면 됩니다.

서류 업로드는 `backend/fixtures/extract/`의 표본으로, 공고 해부와 회사 카드는 `backend/fixtures/studio/`에 담아 둔 Studio 실물 출력으로, 공고 목록은 `backend/fixtures/screening.demo.json`으로 떨어집니다.

여기에 더해 `backend/data/solar-for-bid.sqlite`에 실제 파이프라인을 완주한 케이스 두 건을 커밋해 두었습니다. 클론 직후에도 Bid Kit 아홉 탭이 채워진 채로 열립니다.

- `R25BK00645031-000` 체육진흥투표권사업 온라인발매 결제서비스(PG) 대행사 선정
- `R26BK01673157-000` AX 진단-컨설팅 통합 서비스 개발 (한국과학기술정보연구원)

Studio 무료 실행은 에이전트마다 10회뿐이라 리허설을 몇 번 돌리면 금세 바닥납니다. 그래서 Studio Jobs API와 Solar Chat을 흉내 내는 서버를 하나 두었습니다. 아래 네 줄을 `backend/.env`에 넣고 띄우면 코드는 전부 실제 경로로 도는데 응답만 픽스처로 옵니다.

```bash
node backend/scripts/mock-upstage.js   # 포트 3999
```

```
UPSTAGE_AGENT_API_KEY=mock-local
STUDIO_BASE_URL=http://localhost:3999
SOLAR_CHAT_URL=http://localhost:3999/v1/chat/completions
STUDIO_POLL_INTERVAL_MS=500
```

### 키를 넣을 때

읽는 파일은 `backend/.env` 하나입니다. 레포 루트에 `.env`를 두면 아무도 읽지 않습니다.

`backend/.env.example`에는 Studio 에이전트 ID 14개가 이미 채워져 있습니다. 손으로 넣을 것은 셋뿐입니다.

| 키 | 비어 있으면 |
|---|---|
| `UPSTAGE_API_KEY` | 서류 업로드가 픽스처 응답으로 떨어집니다 |
| `UPSTAGE_AGENT_API_KEY` | 공고 해부와 회사 카드가 픽스처로 떨어지고, 판정은 503입니다 |
| `DATA_GO_KR_SERVICE_KEY` | 공고 목록이 캐시본입니다. 첨부 수집은 이 키 없이도 됩니다 |

키가 둘로 갈린 것은 계정이 다르기 때문입니다. 팀 공용 `UPSTAGE_API_KEY`는 서류 업로드에 쓰고, 공고 해부 5종과 회사 카드, Solar 판정은 에이전트를 만든 개인 Studio 계정 키인 `UPSTAGE_AGENT_API_KEY`를 씁니다. 서로 대신하지 못합니다.

## 설계에서 중요했던 것

```
Flutter (front)
   │  REST · JSON 봉투
Node/Express (backend) ── SQLite
   │
   ├─ Upstage Studio Agents   문서를 읽는다 (Parse → Classify → Extract)
   └─ Upstage Solar Chat API  판정한다 (자격 · 계획 · 제출 검사)
```

### 화면은 판단하지 않습니다

Bid Kit은 서버가 내려 준 봉투를 그대로 그립니다. 탭 구성(`meta.kitPages`), 표의 열과 행, 상태 칩의 색(`tone`), 버튼 문구까지 서버가 정합니다. 화면 쪽에 "준비됨이면 초록" 같은 규칙을 두지 않았기 때문에 탭이 늘거나 문구가 바뀌어도 화면 코드는 그대로입니다. 오류 문장도 서버가 완성해 내려보내고 프론트는 그것을 렌더할 뿐입니다. 응답의 바깥 구조는 `plan/Solar_for_Bid/04_계약/`의 봉투 두 벌로 얼려 두었습니다.

### Upstage를 두 층으로 나눠 씁니다

문서를 읽는 층은 Studio 에이전트가 맡습니다. 전부 Parse → Classify → Extract 구조이고, HWP를 변환 없이 그대로 받는 점이 컸습니다. 77쪽 2MB 파일이 Parse에서 바로 열렸습니다.

공고는 다섯 에이전트가 같은 원본을 각자 읽고 결과를 합칩니다. 회사 서류는 화면 ①에서 갈래별 에이전트 여덟 종이 한 장씩 읽고, 이 여덟을 하나로 합친 Company Card Builder는 `POST /api/company-card/build`에 따로 열어 두었습니다.

판정하는 층은 백엔드가 Solar Chat API를 직접 부릅니다. 처음에는 Studio의 Instruct 노드가 이 일을 하도록 설계했는데, 이 계정에서는 Instruct가 프롬프트와 무관하게 Upstage 기본 예시 응답만 돌려줬습니다. 에이전트를 셋 바꿔 보고, 입력을 절반으로 줄여 보고, 설정을 새 버전으로 저장해 보고, HTML 대신 실물 PDF도 넣어 봤지만 네 번의 job이 전부 같은 64자를 냈습니다. 설정에서 손댈 수 있는 문제가 아니라고 판단하고, 프롬프트는 그대로 둔 채 실행 위치만 옮겼습니다. 백엔드가 `agent/*.json`의 Instruct 노드 프롬프트를 읽어 `solar-pro3`에 보냅니다.

옮기면서 다른 문제 하나가 같이 풀렸습니다. 앞 단계 JSON을 Studio에 파일로 올리면 Document Parse가 그것을 문서로 보고 레이아웃을 분석하는 바람에 따옴표와 중괄호가 사라집니다. Chat API에는 JSON을 문자열 그대로 넣으니 구조가 깨지지 않고, 두 문서를 맞대는 판정을 한 파일로 이어 붙일 필요도 없어졌습니다. 이 과정은 `agent/README.md` 3-1부터 3-3절에 남겨 두었습니다.

### 모델의 답을 그대로 쓰지 않습니다

판정 결과는 백엔드가 한 번 더 셉니다. 충족과 미충족, 미확인 개수를 다시 세고, 공고에 없는 쪽번호는 0으로 되돌립니다. WBS는 요구사항을 열여섯 건 이상 묶은 패키지를 공고의 분류 기준으로 쪼개고, 기간이 비면 「미 명시」로 남깁니다. 임계경로가 빈 채로 오면 공고의 마감과 등록 서류로 채웁니다.

금지 표현 검사가 이 장치의 필요를 잘 보여 줍니다. 모델은 견본 제안서에서 "가능합니다", "고려할 수 있습니다" 같은 표현을 0곳이라고 답했는데, 백엔드가 원고를 쪽 단위로 다시 훑어 세 곳을 찾아냈습니다. 지금은 두 결과를 합쳐서 보여 줍니다.

## 파이프라인

| 단계 | 프론트 | 백엔드 | Upstage |
|---|---|---|---|
| 01 회사 등록 | 서류를 끌어다 놓으면 칸이 채워집니다 | `POST /api/docs/upload`로 한 장씩 읽고 `POST /api/companies/card`로 저장 | 서류 갈래별 에이전트, 파일당 1 job |
| 02 공고 탐색 | 전체 모수와 선별 결과, 제외 사유 | 목록 메타데이터만으로 1차 선별 | 호출 없음 |
| 03 분석 | 4초 폴링, 실패한 단계를 그대로 표시 | 첨부 수집 → 해부 → 병합, 파일 해시로 캐시 | 공고 해부 5종, 케이스당 최대 6 job |
| 04 추천 | 추천 카드에서 응찰 준비 (사람이 결정) | 회사 카드와 참가자격 대조 | Solar · Eligibility Screener |
| 05 요구사항 | 체크리스트, 체크는 서버에 남습니다 | 요구사항을 표로 펴고 체크 상태를 저장 | 호출 없음 |
| 06 계획 | WBS, 임계경로, M/M, XLSX 내려받기 | WPS/CP → WBS → 임계경로에 검산까지 | Solar · 계획 3종 |
| 07 제출 준비 | 파일 제출과 금지 표현 (사람이 결정) | 업로드 → 제출 검사, 바뀐 것만 다시 | Solar · Submission Auditor |

케이스 하나에 Studio job 여섯 개와 Solar 여섯 번이 듭니다. 서류를 한 장 더 올릴 때는 제출 검사만 다시 돌아 Solar 한 번으로 끝납니다.

크레딧을 아끼려고 캐시를 세 겹 두었습니다. 7일 안에 끝난 케이스는 다시 돌리지 않고 저장된 봉투를 그대로 주고, Studio 결과는 파일 해시와 에이전트 ID로 묶어 재사용하며, 폴링 예산을 넘겨 끊긴 job은 ID를 남겨 두었다가 다음 실행이 이어받습니다.

단계별 상세는 `agent/README.md` 4절에, 판정 층 구현은 `backend/HANDOFF-solar-judgment.md`에 있습니다.

## 지킨 원칙

문서 AI를 쓰는 제품에서 가장 위험한 것은 그럴듯하게 틀린 값입니다. 코드와 프롬프트 양쪽에 같은 규칙을 박아 두었습니다.

근거 없이 말하지 않습니다. 모든 판정에 근거 서류 이름과 공고 쪽번호가 붙고, 쪽을 모르면 추측 대신 0을 적습니다. 모르는 값을 0으로 채우지 않고 미확인으로 남긴 뒤 직접 입력할 자리를 만듭니다. 확인이 필요하다는 사실은 제외 사유가 아닙니다. 못 읽어서 기회를 지우는 쪽이 잘못 추천하는 쪽보다 나쁩니다. 응찰과 제출은 사람이 찍어야 다음 단계가 열립니다. 금지 표현은 걸린 자리만 짚고 문장을 고쳐 주지 않습니다. 고치는 것은 사람 몫입니다.

## 저장소

| 폴더 | 무엇이 있나 |
|---|---|
| `front/` | Flutter 앱. 화면 다섯 장과 위젯, 테마, API 클라이언트 |
| `backend/` | Node/Express API 서버. 파이프라인, 판정, SQLite, Swagger |
| `agent/` | Upstage Studio 에이전트 설정 원본과 생성기 |
| `plan/` | 기획 문서. 기획안, 응답 계약, 실행계획, 데모 입력 |
| `design/` | 디자이너 목업 |

`front/`, `backend/`, `agent/`에는 각자 README가 있습니다. 이 문서는 지도이고, 세부는 그쪽이 정본입니다.

| 문서 | 무엇 |
|---|---|
| `front/README.md` | 화면, 반응형, 드래그앤드롭, 디자인 토큰 |
| `backend/README.md` | 라우트, 업로드 파이프라인, 데이터 모델, 외부 연동에서 물린 것 |
| `backend/HANDOFF-solar-judgment.md` | 판정 층 인수서. 판정 다섯 개의 입력과 출력, 가드, 실호출 기록 |
| `agent/README.md` | Studio 임포트, 실행 결과, 부딪힌 문제와 푼 방법, 파이프라인 |
| `plan/Solar_for_Bid/01_RFP_기획안.md` | 기획 정본 (2026-08-22 동결) |
| `plan/Solar_for_Bid/04_계약/` | 프론트와 백엔드 접점의 응답 스키마 두 벌 |

## 테스트

```bash
cd backend && npm test     # node:test · 158건
cd front && flutter test   # 104건 통과 + 5건 skip
```

백엔드 테스트는 프로세스마다 임시 SQLite를 만들어 개발 DB를 건드리지 않습니다. 프론트에서 함께 도는 것 중에는 화면 폭 스물다섯 개를 훑으며 오버플로가 하나도 없는지 확인하는 테스트가 있습니다.

skip되는 5건은 실제 백엔드에 붙는 테스트입니다. 기본 주소가 3010이라 그냥 돌리면 건너뛰고, 주소를 맞춰 줘야 붙습니다.

```bash
cd front && flutter test test/live_api_test.dart \
  --dart-define=API_BASE_URL=http://localhost:3000
```
