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

POST   /api/cases                                           # S1 공고번호 → 첨부 수집 시작 (202)
GET    /api/cases/{caseId}                                  # 팩트시트 봉투 (화면②·④가 폴링)
GET    /api/cases/{caseId}/files/{tabId}.xlsx               # 산출물
```

🔴 **`/api/cases/` 복수형으로 통일한다.** 이미 커밋된 `factsheet.demo.json`의 `downloads[].url`이 복수형이고 그쪽이 정본이다 (WBS 결정 12).

## 구조

```
src/
├── server.js              부트스트랩 — migrate() 후 listen. SIGTERM 처리
├── app.js                 express 조립 (테스트가 listen 없이 쓴다)
├── config/
│   ├── env.js             🔴 절대 throw 하지 않는다 — 키가 없어도 부팅해야 한다
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
│   ├── case.service.js      🔴 봉투 조회는 이 함수 하나를 통한다 (캐시 분기가 한 곳에)
│   ├── screening.service.js
│   ├── fixture.service.js   캐시 봉투 로더
│   ├── g2b.service.js       나라장터 첨부 수집
│   ├── studio.service.js    Upstage Studio 업로드·Job·폴링
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
| 🔴 Studio에 **webhook 없음** | `pollJob()` 폴링 + 타임아웃. 넘기면 캐시로 떨어진다 |

## 테스트

```bash
npm test        # node:test — 7건
```

## 다음에 채울 자리

- [ ] `services/studio.service.js` 실제 엔드포인트 경로 — Studio `</> Code` 스니펫 받은 뒤 확정
- [ ] `POST /api/cases` 이후 파이프라인 — 업로드 → Job → 폴링 → `case_tab` 채우기
- [ ] 🔴 **검산은 Node가 다시 센다** — Instruct가 자기 출력에 쓴 숫자를 화면·파일에 쓰지 않는다 (WBS 3.3)
- [ ] `errors/codes.js` ← `04_계약/error-codes.md` (정운)
- [ ] 회사 서류 → `build_company_card` 연결 (`06_데모입력/`의 견본 8종이 입력이다)
