# Solar for Bid — backend

나라장터 공고를 제안 착수 패키지로 바꾸는 파이프라인의 API 서버입니다.
Node.js 20.11 이상, Express, SQLite(better-sqlite3), Swagger 로 되어 있습니다.

## 실행

```bash
cp .env.example .env      # 키가 비어 있어도 그대로 뜹니다
npm install
npm run dev               # http://localhost:3000/docs
```

부팅할 때 마이그레이션이 자동으로 돕니다. `npm run seed` 는 선택인데, 커밋된 DB 에 실호출 결과가 들어 있어서 seed 를 돌리면 손으로 만든 픽스처로 덮어씁니다.

`.env.example` 에는 Studio 에이전트 ID 가 이미 채워져 있습니다. 직접 넣을 것은 셋뿐입니다.

| 키 | 비어 있으면 |
|---|---|
| `UPSTAGE_API_KEY` | `POST /api/docs/upload` 이 `fixtures/extract/` 표본으로 응답합니다 |
| `UPSTAGE_AGENT_API_KEY` | 공고 해부와 회사 카드가 `fixtures/studio/` 로 떨어지고 `/api/judge/*` 는 503 입니다 |
| `DATA_GO_KR_SERVICE_KEY` | 공고 목록이 캐시본입니다. 첨부 수집은 이 키 없이도 됩니다 |

키가 하나도 없어도 서버는 뜹니다. `src/config/env.js` 는 어떤 경우에도 throw 하지 않고, 무엇이 없는지는 `GET /health` 의 `hasApiKey`, `agentKeyReady`, `solarReady`, `listSourceReady` 로 드러납니다.

키가 둘로 갈린 것은 계정이 다르기 때문입니다. 팀 공용 `UPSTAGE_API_KEY` 는 서류 갈래별 에이전트에 쓰고, 공고 해부 5종과 회사 카드, Solar 판정은 에이전트를 만든 개인 계정 키인 `UPSTAGE_AGENT_API_KEY` 를 씁니다. 서로 대신하지 못합니다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | `--watch` 로 실행 |
| `npm start` | 실행 |
| `npm run migrate` | `src/db/migrations/*.sql` 을 `_migration` 기준으로 한 번씩 적용 |
| `npm run seed` | 마이그레이션 뒤 `fixtures/*.demo.json` 적재 |
| `npm run reset` | sqlite 파일을 지우고 다시 만듭니다. 커밋된 데모 스냅샷도 사라집니다 |
| `npm test` | node:test, 158건 |
| `node scripts/mock-upstage.js` | 모의 Upstage 서버(포트 3999) |
| `docker compose up --build` | 컨테이너와 `sfb-data` 볼륨 |

## 라우트

전체 목록은 `GET /docs` 와 `GET /openapi.json` 이 정본입니다. 갈래만 적으면 이렇습니다.

| 갈래 | 라우트 |
|---|---|
| 헬스 | `GET /health` |
| 서류 | `GET /api/docs/types` · `POST /api/docs/upload` |
| 회사 | `POST /api/companies` · `GET /api/companies/current` · `GET /api/companies/{id}` · `GET /api/companies/{id}/card` · `GET /api/companies/card/requirements` · `POST /api/companies/card` |
| 추천 | `GET /api/companies/{id}/screening` · `PUT /api/companies/{id}/screening/{caseId}/decision` |
| 응찰 목록 | `GET·POST /api/companies/{id}/bids` · `DELETE /api/companies/{id}/bids/{caseId}` |
| 케이스 | `GET·POST /api/cases` · `GET /api/cases/{caseId}` · `GET·POST /api/cases/{caseId}/files` · `POST /api/cases/{caseId}/proposal` · `PUT /api/cases/{caseId}/checks/{tabId}` · `GET /api/cases/{caseId}/files/{tab}.xlsx` |
| 해부·카드 | `POST /api/announcements/decompose` · `POST /api/company-card/build` |
| 판정 | `POST /api/judge/eligibility` · `/plan` · `/submission` · `/kit` |

응답 계약은 `plan/Solar_for_Bid/04_계약/` 의 봉투 두 벌이 정본입니다. 계약은 응답의 바깥 구조이고, 개별 Extract 필드는 계약이 아닙니다. 프론트는 `progress[].step` 문자열이나 `tabs[].columns` 내용으로 분기하지 않습니다. 오류도 `error.code` 를 화면에서 문장으로 바꾸지 않고, 서버가 만든 `error.message` 를 그대로 렌더합니다.

## 서류 업로드

`POST /api/docs/upload` 은 PDF 한 장을 받아 아홉 갈래 중 어느 것인지 가르고, 그 갈래의 Studio 에이전트로 값을 뽑아 동기로 돌려줍니다.

```bash
curl -X POST -F "file=@사업자등록증.pdf" http://localhost:3000/api/docs/upload
```

갈래 판정은 백엔드가 규칙으로 합니다. PDF 텍스트를 읽어 표제로 가르므로 API 호출이 없고 100ms 안쪽입니다. 여기서 물린 것이 셋 있었습니다.

- 매칭 전에 공백을 모두 지웁니다. 이 서식들은 제목에 자간이 들어가 추출 결과가 「사 업 자 등 록 증」으로 나오는데, 공백을 두면 하나도 걸리지 않습니다.
- 표제는 문서 앞부분에서 걸릴 때만 제 무게를 갖습니다. 지정서 각주의 "현재 현황은 「기술인력 보유현황」을 따릅니다" 가 실제로 남의 갈래를 가져갔습니다.
- 판정이 서지 않으면 아무 에이전트도 돌리지 않고 422 와 후보를 돌려줍니다. 엉뚱한 에이전트를 돌리면 그럴듯하게 틀린 JSON 이 나오는데, 그게 제일 나쁩니다.

갈래는 아홉입니다. 사업자등록증, 중소기업확인서, 신용평가등급확인서, 개인정보 영향평가기관 지정서, 소프트웨어사업자 신고확인서, 직접생산확인증명서, 실적증명서, 재무제표, 기술인력 보유현황. 이 중 직접생산확인증명서는 에이전트를 아직 붙이지 못해 `/api/docs/types` 에서 `agentConfigured: false` 로 나옵니다.

Studio 호출은 v2 responses API 를 씁니다. `POST /v2/files` 로 올리고 `POST /v2/responses` 에 에이전트 ID 를 `model` 로 넣어 job 을 만든 뒤 폴링합니다. webhook 이 없어서 폴링이고, 실측으로 건당 8~10초입니다. 결과 JSON 은 `output[].content[].text` 에 문자열로 오고, 같은 자리 `additional_values` 에 필드별 confidence 와 page, coordinates 가 실려 옵니다.

배열 필드에는 confidence 가 실려 오지 않아 `unknown` 이 남습니다. 그 수를 숨기지 않고 `confidenceCounts` 로 내보냅니다. 「16개 중 low 0건, unknown 1건」이 `unknown` 한 단어보다 정직합니다.

## 케이스 파이프라인

`POST /api/cases` 는 202 로 곧장 돌아오고 뒤에서 이렇게 이어집니다.

```
첨부 수집(나라장터)
  → 공고 해부   Studio job 6개  (제안요청서 × 에이전트 5종, 입찰공고문 × 자격·제출 1종)
  → 판정        Solar 6회       (자격 1 · 계획 3 · 제출 2)
  → buildKit → case_tab · case_download · extraction
```

화면은 `GET /api/cases/{caseId}` 봉투 하나만 폴링합니다. 커밋된 실행 기록으로는 캐시 없이 처음부터 돌 때 10분 22초, 해부 결과가 캐시에 있을 때 4분 11초였습니다.

호출을 아끼는 층이 셋입니다.

- 케이스 7일 캐시. 7일 안에 끝난 케이스는 `POST /api/cases` 가 202 가 아니라 200 으로 저장된 봉투를 그대로 줍니다. 다시 돌리려면 `{"refresh": true}` 를 보냅니다.
- Studio 결과 캐시. `(에이전트 ID, 파일 sha256)` 단위로 `studio_result` 에 남습니다. 같은 파일을 같은 에이전트로 다시 올리지 않습니다. 분류만 하고 추출하지 않은 결과는 저장하지 않습니다.
- job 이어받기. 폴링 예산(기본 300초)을 넘겨도 job 은 Studio 에서 계속 돕니다. job_id 를 남겨 두었다가 다음 실행이 새로 사지 않고 그 job 을 이어서 기다립니다.

서류를 올리거나 프롬프트를 고쳤을 때는 `rejudge(caseId, { parts })` 로 판정 일부만 다시 돕니다. 제출 검사는 저장된 규칙을 재사용해 Solar 1회, WBS 만 다시 받으면 1회, 가드만 다시 걸면 0회입니다.

## 판정 층

판정은 Studio 의 Instruct 노드가 아니라 백엔드가 Solar Chat API 를 직접 부릅니다. 그렇게 된 경위는 `agent/README.md` 3-1 부터 3-3 절에 있습니다.

프롬프트의 정본은 `backend/` 밖의 `agent/*.json` 입니다. `src/services/solarJudge.service.js` 가 실행할 때 그 파일의 Instruct 노드를 읽어 system 메시지로 보냅니다. 파일 이름과 노드 이름이 코드에 문자열로 박혀 있어서, 옮기거나 이름을 바꾸면 판정이 멈춥니다. 프롬프트를 메모리에 캐시하므로 JSON 을 고친 뒤에는 서버를 다시 띄워야 합니다.

모델이 낸 JSON 은 그대로 쓰지 않습니다. 자격 판정의 개수를 다시 세고, 공고에 없는 쪽번호는 0 으로 되돌리고, WBS 는 요구사항을 열여섯 건 이상 묶은 패키지를 분류 기준으로 쪼개고, 임계경로가 비면 공고의 마감과 등록 서류로 채웁니다. 금지 표현은 모델이 놓친 자리를 백엔드가 원고 전문에서 다시 찾아 보탭니다.

자세한 입력과 출력, 가드는 `HANDOFF-solar-judgment.md` 에 있습니다.

## 구조

```
src/
├── server.js            마이그레이션 뒤 listen, SIGTERM 처리
├── app.js               express 조립. 테스트가 listen 없이 씁니다
├── config/              env · docTypes(9갈래) · agents · kitPages · kitCells · cardRequirements · logger
├── db/                  index(WAL) · migrate · seed · reset · migrations/*.sql 7개
├── repositories/        SQL 만 담당합니다. 봉투를 모릅니다 (6개)
├── services/            봉투 조립과 외부 연동 (20개)
├── controllers/         HTTP 와 서비스 사이 (8개)
├── routes/              @openapi 주석이 여기 있습니다 (7개)
├── docs/                swagger-jsdoc, 계약 봉투 스키마 사본
├── middlewares/         asyncHandler · errorHandler · notFound
└── errors/              codes(20개) · AppError
```

데이터 모델은 이렇습니다. `case` 가 SQL 예약어라 테이블 이름은 `bid_case` 입니다.

```
company ─┬─ company_document
         └─ screening ── screening_item (shortlist | excluded, decision)

bid_case ─┬─ case_progress   (seq 순서가 의미입니다)
          ├─ attachment
          ├─ extraction      (schema_name + payload_json)
          ├─ case_tab        (columns_json · rows_json · warnings_json)
          ├─ case_file       (제출 서류 · 제안서 원고)
          ├─ case_check      (체크리스트 체크)
          └─ case_download

bid            사람이 응찰 준비를 찍은 건
studio_result  (에이전트 ID, 파일 sha256) 캐시
```

개별 Extract 필드로 컬럼을 만들지 않고 `payload_json` 에 통째로 넣습니다. 필드가 바뀌어도 마이그레이션이 필요 없습니다.

## 테스트

```bash
npm test    # 158건
```

테스트는 프로세스마다 `os.tmpdir()` 아래 임시 SQLite 를 써서 개발 DB 를 건드리지 않습니다. 분류 테스트는 `plan/Solar_for_Bid/06_데모입력/` 의 실제 PDF 여덟 장을 읽습니다.

## 확장 지점

다음 버전이 들어올 자리를 미리 정해 두었습니다. 어디를 건드리면 되는지 적어 둡니다.

서류 갈래를 늘리려면 `src/config/docTypes.js` 에 갈래 하나와 표제 단서를 넣고 `.env` 에 에이전트 ID 를 더하면 됩니다. 분류기와 업로드 경로, 화면은 그대로입니다. 직접생산확인증명서가 지금 갈래만 정의된 채로 그 자리에 있습니다.

탭을 늘리려면 `src/services/kit.service.js` 에 탭 빌더를 하나 더하고 `src/config/kitPages.js` 의 배치에 끼웁니다. 화면은 서버가 준 `kind` 대로 그리므로 프론트 코드는 바뀌지 않습니다. 모르는 `kind` 는 표로 떨어지도록 되어 있어서 서버가 먼저 나가도 안전합니다.

판정을 늘리려면 `agent/` 에 프롬프트 JSON 을 두고 `solarJudge.service.js` 의 `PROMPTS` 맵에 파일과 노드 이름을 등록합니다. 판정 로직이 코드가 아니라 프롬프트 파일에 있어서, 도메인이 넓어질 때 코드 변경 없이 프롬프트만 늘립니다.

공고 종류를 늘리는 것도 같은 방식입니다. 지금 부르는 목록 API 는 `getBidPblancListInfoServcPPSSrch` 로 이름에 용역(Servc)이 들어 있습니다. 나라장터가 갈래별로 같은 모양의 오퍼레이션을 두고 있으므로, `g2b.service.js` 의 엔드포인트를 바꾸는 것으로 물품이나 공사까지 넓힐 수 있습니다.

Studio 의 Instruct 노드가 이 계정에서 열리면 판정 층을 Studio 안으로 되돌릴 수 있습니다. 그때를 위해 프롬프트의 파일 입력 계약과 JSON 출력 계약을 바꾸지 않았습니다.

## 배포할 때

컨테이너로 올릴 때 손봐야 할 자리가 둘 있습니다.

판정 층이 `../agent/*.json` 을 읽는데 Dockerfile 이 `agent/` 를 복사하지 않습니다. 판정까지 컨테이너에서 돌리려면 그 폴더를 이미지에 넣어야 합니다.

`docker-compose.yml` 은 서류 갈래별 에이전트 시절에 쓴 것이라 `UPSTAGE_AGENT_API_KEY` 와 `STUDIO_AGENT_ANNOUNCEMENT_*`, `SOLAR_*` 를 전달하지 않습니다. 그대로 띄우면 해부와 판정이 픽스처로 떨어집니다. 로컬 개발은 `npm run dev` 로 하고 있어서 아직 맞추지 않았습니다.

## 알아 둘 것

- 읽는 `.env` 는 `backend/.env` 하나입니다. `env.js` 가 cwd 가 아니라 패키지 루트를 기준으로 dotenv 를 부르므로, 레포 루트에서 `node backend/src/server.js` 로 띄워도 정상입니다. 다만 `npm test` 는 `backend/` 안에서 돌려야 합니다.
- `data/solar-for-bid.sqlite` 는 데모 스냅샷이 든 채로 커밋돼 있습니다. `npm run reset` 은 그것까지 지웁니다.
- 나라장터는 User-Agent 가 없으면 500 을 돌려주고, 첨부 목록의 끝을 422 로 알립니다. 파일명은 percent-encoded UTF-8 이라 `decodeFilename()` 이 RFC 5987 과 평문을 모두 풉니다.
