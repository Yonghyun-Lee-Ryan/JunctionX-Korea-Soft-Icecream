# Solar for Bid — backend

나라장터 공고를 **제안 착수 패키지**로 바꾸는 파이프라인의 API 서버.
Node.js + Express · SQLite · Swagger · Docker.

```bash
cp .env.example .env      # 🔴 키가 비어 있어도 그대로 뜬다
npm install
npm run seed              # 마이그레이션 + 데모 픽스처 적재
npm run dev               # http://localhost:3000/docs
```

```bash
docker compose up --build
```

## 이 서버가 지키는 계약

정본은 `plan/Solar_for_Bid/04_계약/`의 두 봉투다. **여기 코드가 아니라 그쪽이 권위다.**

| 봉투 | 무엇 | 라우트 |
|---|---|---|
| `screening.envelope.json` | 추천 공고 목록 + **분모** | `GET /api/companies/{id}/screening` |
| `factsheet.envelope.json` | 공고 1건 상세 | `GET /api/cases/{caseId}` |

> [!IMPORTANT]
> - 🔴 계약은 응답의 **바깥 구조**다. 개별 Extract 필드는 계약이 아니다 — 프리플라이트에서 바뀐다.
> - 🔴 프론트는 `progress[].step` 문자열이나 `tabs[].columns` 내용으로 **분기하지 않는다.**
> - 🔴 오류는 `error.code`를 문장으로 매핑하지 않는다. **`error.message`를 그대로 렌더**한다. 그래서 서버가 완성문을 만든다.
> - 🔴 `?live=1`이 없으면 캐시 응답(`meta.cached=true`)이다. **키가 없어도 200이 나온다.**

## 라우트

```
GET    /health                                              # 🔴 키가 없어도 200
GET    /docs                                                # Swagger UI
GET    /openapi.json

POST   /api/companies                                       # S1 회사 서류 → 카드 (multipart)
GET    /api/companies/{companyId}
GET    /api/companies/{companyId}/screening                 # S2~S4 추천 목록 + 분모
PUT    /api/companies/{companyId}/screening/{caseId}/decision   # 🚪 사람 게이트 (go/skip)

POST   /api/docs/upload                                     # 🔴 PDF 1장 → 8갈래 판정 → 에이전트 추출 (동기)
GET    /api/docs/types                                      # 지원 8종 + 에이전트 연결 상태

POST   /api/cases                                           # S1 공고번호 → 첨부 수집 시작 (202)
GET    /api/cases/{caseId}                                  # 팩트시트 봉투 (화면②·④가 폴링)
GET    /api/cases/{caseId}/files/{tabId}.xlsx               # 산출물
```

🔴 **`/api/cases/` 복수형으로 통일한다.** 이미 커밋된 `factsheet.demo.json`의 `downloads[].url`이 복수형이고 그쪽이 정본이다 (WBS 결정 12).

## POST /api/docs/upload — 회사 서류 1장 → JSON

PDF를 올리면 **8갈래 중 어느 것인지 가르고**, 그 갈래의 **Studio 에이전트**를 불러 값을 뽑아 돌려준다. 동기 응답이다.

```bash
curl -X POST -F "file=@사업자등록증.pdf" http://localhost:3000/api/docs/upload
```

### ① 분류는 백엔드가 규칙으로 한다

PDF 텍스트를 읽어 표제로 판정한다. API 호출 0회 · 100ms 안쪽 · 무료다.

> [!IMPORTANT]
> 🔴 **매칭 전에 모든 공백을 지운다.** 이 서식들은 제목에 자간이 들어가서 추출 결과가
> 「사 업 자 등 록 증」으로 나온다 — 공백을 두면 **하나도 안 걸린다.**
>
> 🔴 **표제는 문서 앞부분에서 걸릴 때만 제 무게를 갖는다.** 지정서 각주의
> *"현재 현황은 「기술인력 보유현황」을 따릅니다"* 가 실제로 남의 갈래를 훔쳤다.
>
> 🔴 **판정이 서지 않으면 아무 에이전트도 돌리지 않는다.** 422 + 후보를 돌려준다.
> 엉뚱한 에이전트를 돌리면 **그럴듯하게 틀린 JSON**이 나오고, 그게 제일 나쁘다.

견본 8종 전부 `high`로 통과한다 (`npm test`).

| 갈래 | key | 에이전트 env |
|---|---|---|
| 사업자등록증 | `biz_reg` | `STUDIO_AGENT_BIZ_REG` |
| 중소기업확인서 | `sme_cert` | `STUDIO_AGENT_SME_CERT` |
| 신용평가등급확인서 | `credit_rating` | `STUDIO_AGENT_CREDIT_RATING` |
| 개인정보 영향평가기관 지정서 | `pia_designation` | `STUDIO_AGENT_PIA_DESIGNATION` |
| 소프트웨어사업자 신고확인서 | `sw_business` | `STUDIO_AGENT_SW_BUSINESS` |
| 실적증명서 | `performance` | `STUDIO_AGENT_PERFORMANCE` |
| 재무제표 | `financial` | `STUDIO_AGENT_FINANCIAL` |
| 기술인력 보유현황 | `tech_staff` | `STUDIO_AGENT_TECH_STAFF` |

### ② 에이전트 호출 — 2026-08-22 실호출로 확정

```
POST {base}/v2/files           multipart(file, purpose=assistants)      → file_id
POST {base}/v2/responses       { model: <agentId>, input:[input_file] } → job_... (in_progress)
GET  {base}/v2/responses/{id}  폴링 → completed
```

- 🔴 **`model`에 에이전트 ID를 넣는다.** OpenAI 호환 responses API다
- 🔴 webhook 없음 — 폴링. 실측 **8~10초/건**
- 🔴 결과 JSON은 `output[].content[].text`에 **문자열**로 온다
- 🟢 같은 자리 `additional_values`에 **필드별 confidence · page · coordinates**가 실려 온다

🔴 `studio.upstage.ai/api/agents/{id}/run`은 **로그인 세션 전용(401)**이라 서버에서 못 쓴다. 공개 에이전트 조회(`GET /api/agents/{id}`)만 열려 있다.

### ③ 응답

```jsonc
{
  "uploadId": "up_11ec25ee-11a",
  "filename": "사업자등록증.pdf",
  "docType": {
    "key": "biz_reg", "label": "사업자등록증",
    "confidence": "high", "score": 22, "margin": 21,
    "matched": ["사업자등록증", "법인사업자", "세무서장", …],
    "candidates": [{ "key": "biz_reg", "score": 22 }, { "key": "sw_business", "score": 1 }]
  },
  "extraction": {
    "data": { "등록번호": "120-86-01230", … },          // 에이전트 JSON 그대로
    "fields": { "등록번호": { "confidence": "high", "page": 1, "coordinates": [...] } },
    "confidence": "unknown",                            // 🔴 하나라도 low면 low
    "confidenceCounts": { "high": 15, "low": 0, "unknown": 1 },
    "lowFields": []                                     // 화면이 ⚠를 여기에 단다
  },
  "meta": { "source": "agent", "agentId": "agt_…", "jobId": "job_…", "elapsedMs": 7899, … }
}
```

🔴 **배열 필드에는 confidence가 실려 오지 않아 `unknown`이 남는다.** 그 수를 숨기지 않고
`confidenceCounts`로 낸다 — 「16개 중 low 0건, unknown 1건」이 `unknown` 한 단어보다 정직하다.

### 오류

| code | status | 언제 |
|---|---:|---|
| `E_FILE_REQUIRED` | 400 | 파일이 없다 |
| `E_UNSUPPORTED_FILE` | 415 | PDF가 아니거나 열리지 않는다 |
| `E_DOC_TYPE_UNKNOWN` | 422 | 판정이 서지 않았다 · 스캔본이라 글자가 없다 |
| `E_AGENT_NOT_SET` | 503 | 그 갈래의 에이전트 ID가 `.env`에 없다 |
| `E_STUDIO_TIMEOUT` | 504 | 폴링이 시간을 넘겼다 |

## 구조

```
src/
├── server.js              부트스트랩 — migrate() 후 listen. SIGTERM 처리
├── app.js                 express 조립 (테스트가 listen 없이 쓴다)
├── config/
│   ├── env.js             🔴 절대 throw 하지 않는다 — 키가 없어도 부팅해야 한다
│   ├── docTypes.js        🔴 8갈래 정의 + 표제/단서/deny + normalize
│   ├── agents.js          🔴 에이전트 ID를 넣는 유일한 자리
│   └── logger.js          JSON 한 줄 로거 + 요청 로거 (의존성 0)
├── db/
│   ├── index.js           better-sqlite3 · WAL · foreign_keys ON
│   ├── migrate.js         _migration 테이블로 1회 적용
│   ├── seed.js            fixtures/*.demo.json → DB
│   ├── reset.js           파일 삭제 후 재생성
│   └── migrations/001_init.sql
├── repositories/          SQL만. 봉투를 모른다
│   ├── case.repo.js
│   └── company.repo.js
├── services/              봉투 조립 · 외부 연동
│   ├── docs.service.js      🔴 업로드 오케스트레이션 — 텍스트 → 분류 → 에이전트
│   ├── pdfText.service.js   unpdf로 텍스트 레이어 추출
│   ├── classify.service.js  🔴 규칙 분류. 서지 않으면 고르지 않는다
│   ├── schema.service.js    fixtures/extract/*.json에서 스키마 역산
│   ├── case.service.js      🔴 봉투 조회는 이 함수 하나를 통한다 (캐시 분기가 한 곳에)
│   ├── screening.service.js
│   ├── fixture.service.js   캐시 봉투 로더
│   ├── g2b.service.js       나라장터 첨부 수집
│   ├── studio.service.js    🔴 Upstage v2 — files → responses → 폴링 → 파싱
│   └── xlsx.service.js      🔴 탭별 빌더 없음 — 제너릭 한 벌
├── controllers/           HTTP ↔ 서비스
├── routes/                @openapi 주석이 여기 산다
├── docs/
│   ├── swagger.js         swagger-jsdoc + UI 마운트
│   └── components.js      🔴 04_계약/*.envelope.json 의 사본
├── middlewares/
└── errors/
    ├── codes.js           🔴 임시. 04_계약/error-codes.md가 생기면 복사해 온다
    └── AppError.js
```

## 데이터 모델

기획안 §9를 봉투에 맞춰 옮겼다. 🔴 **개별 Extract 필드로 컬럼을 만들지 않는다** — `payload_json`에 통째로 넣는다. 프리플라이트에서 필드가 바뀌어도 마이그레이션이 필요 없다.

```
company ─┬─ company_document
         └─ screening ── screening_item (bucket: shortlist | excluded, decision)

bid_case ─┬─ case_progress   (seq 순서가 의미다)
          ├─ attachment      (file_seq · docClass)
          ├─ extraction      (schema_name + payload_json)
          ├─ case_tab        (columns_json · rows_json · warnings_json)
          └─ case_download
```

`case`는 SQL 예약어라 테이블 이름은 **`bid_case`**다.

## 🔴 스택이 기획안과 다른 곳

| | 기획안 | 지금 | 왜 |
|---|---|---|---|
| DB | PostgreSQL → (실행계획) JSON 파일 | **SQLite** | 파일 1개라 배포·백업이 `cp` 한 번. JSON 파일보다 조회·정렬·트랜잭션이 있고, Postgres보다 운영 비용이 0에 가깝다 |

`05_실행계획_30시간.md`의 「Postgres는 26시간에 손해」 판단은 그대로 유효하다. SQLite는 그 판단을 뒤집지 않고 **JSON 파일 쪽을 대체**한다.

## 외부 연동에서 물린 것 셋

| 무엇 | 어떻게 |
|---|---|
| 🔴 G2B가 **UA 없으면 500** | `env.g2b.userAgent` 기본값을 비워 두지 않았다 |
| 🟢 G2B **422 = 종료 신호** | `collectAttachments`가 422에서 루프를 멈춘다 |
| 🔴 파일명이 **percent-encoded UTF-8** | `decodeFilename()` — RFC 5987 `filename*`과 평문 둘 다. 테스트 3건 |
| 🔴 Studio에 **webhook 없음** | `pollResponse()` 폴링 + 타임아웃. 실측 8~10초/건 |
| 🔴 서식 제목의 **자간** | 「사 업 자 등 록 증」 — `normalize()`가 공백을 지운 뒤 매칭한다 |

## 테스트

```bash
npm test        # node:test — 18건 (분류 8종 실PDF 포함)
```

## 다음에 채울 자리

- [x] ~~`services/studio.service.js` 실제 엔드포인트 경로~~ ✅ v2 responses API로 확정 (2026-08-22)
- [ ] `POST /api/docs/upload` 결과를 `company_document` · `company.card_json`에 적재
- [ ] 스캔본 대응 — 텍스트가 없으면 `document-digitization`(OCR)로 한 번 파싱한 뒤 분류
- [ ] `POST /api/cases` 이후 파이프라인 — 업로드 → Job → 폴링 → `case_tab` 채우기
- [ ] 🔴 **검산은 Node가 다시 센다** — Instruct가 자기 출력에 쓴 숫자를 화면·파일에 쓰지 않는다 (WBS 3.3)
- [ ] `errors/codes.js` ← `04_계약/error-codes.md` (정운)
- [ ] 회사 서류 → `build_company_card` 연결 (`06_데모입력/`의 견본 8종이 입력이다)
