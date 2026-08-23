# Solar for Bid — backend

The API server for the pipeline that turns a public procurement notice into a proposal kickoff package.
Node.js 20.11 or newer, Express, SQLite (better-sqlite3), Swagger.

## Running it

```bash
cp .env.example .env      # it boots fine with empty keys
npm install
npm run dev               # http://localhost:3000/docs
```

Migrations run automatically on boot. `npm run seed` is optional, and since the committed DB already holds results from real calls, running seed overwrites them with hand-made fixtures.

`.env.example` already has the Studio agent IDs filled in. Only three values are yours to add.

| Key | If empty |
|---|---|
| `UPSTAGE_API_KEY` | `POST /api/docs/upload` responds with the samples in `fixtures/extract/` |
| `UPSTAGE_AGENT_API_KEY` | Notice parsing and the company card fall back to `fixtures/studio/`, and `/api/judge/*` returns 503 |
| `DATA_GO_KR_SERVICE_KEY` | The notice list is a cached copy. Attachment collection works without this key |

The server boots with no keys at all. `src/config/env.js` never throws under any circumstance, and what is missing shows up in `GET /health` as `hasApiKey`, `agentKeyReady`, `solarReady`, and `listSourceReady`.

There are two keys because there are two accounts. The team's shared `UPSTAGE_API_KEY` is for the per-document-type agents, while the five notice-parsing agents, the company card, and Solar judgment use `UPSTAGE_AGENT_API_KEY`, the personal account key that owns those agents. Neither substitutes for the other.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run with `--watch` |
| `npm start` | Run |
| `npm run migrate` | Apply `src/db/migrations/*.sql` once each, tracked against `_migration` |
| `npm run seed` | Load `fixtures/*.demo.json` after migrating |
| `npm run reset` | Delete the sqlite file and build it again. The committed demo snapshot goes with it |
| `npm test` | node:test, 158 tests |
| `node scripts/mock-upstage.js` | Mock Upstage server (port 3999) |
| `docker compose up --build` | Container and the `sfb-data` volume |

## Routes

`GET /docs` and `GET /openapi.json` are authoritative for the full list. Grouped, it looks like this.

| Group | Routes |
|---|---|
| Health | `GET /health` |
| Documents | `GET /api/docs/types` · `POST /api/docs/upload` |
| Company | `POST /api/companies` · `GET /api/companies/current` · `GET /api/companies/{id}` · `GET /api/companies/{id}/card` · `GET /api/companies/card/requirements` · `POST /api/companies/card` |
| Recommendation | `GET /api/companies/{id}/screening` · `PUT /api/companies/{id}/screening/{caseId}/decision` |
| Bidding list | `GET·POST /api/companies/{id}/bids` · `DELETE /api/companies/{id}/bids/{caseId}` |
| Cases | `GET·POST /api/cases` · `GET /api/cases/{caseId}` · `GET·POST /api/cases/{caseId}/files` · `POST /api/cases/{caseId}/proposal` · `PUT /api/cases/{caseId}/checks/{tabId}` · `GET /api/cases/{caseId}/files/{tab}.xlsx` |
| Parsing and card | `POST /api/announcements/decompose` · `POST /api/company-card/build` |
| Judgment | `POST /api/judge/eligibility` · `/plan` · `/submission` · `/kit` |

The two envelope schemas in `plan/Solar_for_Bid/04_계약/` are authoritative for the response contract. The contract is the outer shape of a response; individual Extract fields are not part of it. The frontend does not branch on the `progress[].step` string or on the contents of `tabs[].columns`. Errors work the same way: the screen never turns an `error.code` into a sentence, it renders the `error.message` the server composed.

## Document upload

`POST /api/docs/upload` takes one PDF, decides which of the nine document types it is, extracts the values with that type's Studio agent, and returns synchronously.

```bash
curl -X POST -F "file=@사업자등록증.pdf" http://localhost:3000/api/docs/upload
```

The backend classifies the document type by rule. It reads the PDF text and sorts on the title, so there is no API call and it finishes inside 100ms. Three things bit us here.

- Strip every space before matching. These forms put letter spacing in the title, so the extraction comes out as 「사 업 자 등 록 증」 (business registration certificate, spaced out), and if you leave the spaces in, nothing matches at all.
- A title only carries its weight when it is found near the front of the document. A footnote in a designation certificate reading "현재 현황은 「기술인력 보유현황」을 따릅니다" (current status follows the technical staff roster) actually stole another type's classification.
- When the classification does not hold, we run no agent at all and return 422 with the candidates. Running the wrong agent produces plausible, wrong JSON, and that is the worst outcome there is.

There are nine types: business registration certificate (사업자등록증), SME confirmation (중소기업확인서), credit rating certificate (신용평가등급확인서), privacy impact assessment agency designation (개인정보 영향평가기관 지정서), software business operator report confirmation (소프트웨어사업자 신고확인서), direct production confirmation certificate (직접생산확인증명서), track-record statement (실적증명서), financial statements (재무제표), and technical staff roster (기술인력 보유현황). Of these, the direct production confirmation certificate has no agent wired up yet, so `/api/docs/types` reports it as `agentConfigured: false`.

Studio calls use the v2 responses API. Upload with `POST /v2/files`, create a job with `POST /v2/responses` passing the agent ID as `model`, then poll. There is no webhook, hence the polling, and we measured 8 to 10 seconds per job. The result JSON arrives as a string in `output[].content[].text`, and `additional_values` in the same position carries per-field confidence, page, and coordinates.

Array fields come back with no confidence attached, so `unknown` stays. We do not hide that count; it goes out as `confidenceCounts`. "0 low and 1 unknown out of 16" is more honest than the single word `unknown`.

## Case pipeline

`POST /api/cases` returns 202 right away and continues behind it like this.

```
Attachment collection (procurement portal)
  → Notice parsing   6 Studio jobs  (RFP × 5 agents, bid notice × 1 eligibility/submission agent)
  → Judgment         6 Solar calls  (eligibility 1 · planning 3 · submission 2)
  → buildKit → case_tab · case_download · extraction
```

The screen polls one envelope, `GET /api/cases/{caseId}`. In the committed run records, a cold run from scratch took 10 minutes 22 seconds, and a run with the parsing results already cached took 4 minutes 11 seconds.

Three layers keep the call count down.

- Seven-day case cache. For a case that finished within seven days, `POST /api/cases` answers 200 instead of 202 and hands back the stored envelope as is. Send `{"refresh": true}` to run it again.
- Studio result cache. Results are kept in `studio_result` keyed by `(agent ID, file sha256)`. The same file never goes to the same agent twice. A result that was only classified and never extracted is not stored.
- Job resume. A job keeps running on Studio even after the polling budget (300 seconds by default) is spent. We leave the job_id behind so the next run waits on that job instead of paying for a new one.

When a document is added or a prompt is edited, `rejudge(caseId, { parts })` re-runs only part of the judgment. The submission review reuses the stored rules for one Solar call, re-fetching just the WBS is one call, and re-applying only the guards is zero.

## Judgment layer

Judgment does not run in Studio's Instruct nodes; the backend calls the Solar Chat API directly. How that came about is in `agent/README.md`, sections 3-1 through 3-3.

The prompts live authoritatively in `agent/*.json`, outside `backend/`. At run time `src/services/solarJudge.service.js` reads the Instruct node out of that file and sends it as the system message. The file name and the node name are hardcoded as strings, so moving or renaming either one stops judgment. Prompts are cached in memory, so restart the server after editing the JSON.

The JSON the model returns is not used as is. We recount the eligibility judgment, reset page numbers that do not exist in the notice back to zero, split any WBS package holding sixteen or more requirements along the notice's own categories, and fill an empty critical path from the notice's deadline and registration documents. For forbidden phrases, the backend re-scans the full manuscript and adds the spots the model missed.

Detailed inputs, outputs, and guards are in `HANDOFF-solar-judgment.md`.

## Structure

```
src/
├── server.js            listen after migrations, SIGTERM handling
├── app.js               express assembly. Tests use it without listen
├── config/              env · docTypes (9 types) · agents · kitPages · kitCells · cardRequirements · logger
├── db/                  index (WAL) · migrate · seed · reset · 7 migrations/*.sql
├── repositories/        SQL only. They know nothing about envelopes (6)
├── services/            envelope assembly and external integration (20)
├── controllers/         between HTTP and the services (8)
├── routes/              the @openapi comments live here (7)
├── docs/                swagger-jsdoc, copies of the contract envelope schemas
├── middlewares/         asyncHandler · errorHandler · notFound
└── errors/              codes (20) · AppError
```

The data model looks like this. `case` is a SQL reserved word, so the table is named `bid_case`.

```
company ─┬─ company_document
         └─ screening ── screening_item (shortlist | excluded, decision)

bid_case ─┬─ case_progress   (the seq order is the meaning)
          ├─ attachment
          ├─ extraction      (schema_name + payload_json)
          ├─ case_tab        (columns_json · rows_json · warnings_json)
          ├─ case_file       (submission documents · proposal manuscript)
          ├─ case_check      (checklist checks)
          └─ case_download

bid            a notice a person marked for bidding
studio_result  (agent ID, file sha256) cache
```

We do not create a column per Extract field; the whole thing goes into `payload_json`. Fields can change without a migration.

## Tests

```bash
npm test    # 158 tests
```

Tests use a temporary SQLite file under `os.tmpdir()` per process, so the development database is never touched. The classification tests read eight real PDFs from `plan/Solar_for_Bid/06_데모입력/`.

## Extension points

We decided in advance where the next version goes. Here is what to touch.

To add a document type, put the type and its title cues in `src/config/docTypes.js` and add the agent ID to `.env`. The classifier, the upload path, and the screen stay as they are. The direct production confirmation certificate sits in that spot right now with only the type defined.

To add a tab, add one tab builder to `src/services/kit.service.js` and slot it into the layout in `src/config/kitPages.js`. The screen draws whatever `kind` the server sends, so no frontend code changes. An unknown `kind` falls back to a table, which makes it safe for the server to ship first.

To add a judgment, drop a prompt JSON into `agent/` and register the file and node name in the `PROMPTS` map in `solarJudge.service.js`. The judgment logic lives in prompt files rather than in code, so widening the domain means adding prompts, not changing code.

Adding notice categories works the same way. The list API we call today is `getBidPblancListInfoServcPPSSrch`, with services (Servc) in the name. The procurement portal offers the same shape of operation for each category, so changing the endpoint in `g2b.service.js` widens coverage to goods or construction.

If Studio's Instruct nodes ever open up on this account, the judgment layer can move back inside Studio. For that day we left the prompts' file-input contract and JSON-output contract unchanged.

## Deploying

Two places need work before this goes up in a container.

The judgment layer reads `../agent/*.json`, and the Dockerfile does not copy `agent/`. To run judgment in the container too, that folder has to go into the image.

`docker-compose.yml` dates from the per-document-type agent era, so it does not pass `UPSTAGE_AGENT_API_KEY`, `STUDIO_AGENT_ANNOUNCEMENT_*`, or `SOLAR_*`. Bring it up as is and parsing and judgment fall back to fixtures. We develop locally with `npm run dev`, so we have not fixed it yet.

## Things to know

- `backend/.env` is the only `.env` that gets read. `env.js` calls dotenv against the package root rather than cwd, so starting it from the repo root with `node backend/src/server.js` works fine. `npm test`, though, has to run inside `backend/`.
- `data/solar-for-bid.sqlite` is committed with the demo snapshot inside it. `npm run reset` deletes that too.
- The procurement portal returns 500 when there is no User-Agent, and signals the end of an attachment list with 422. File names are percent-encoded UTF-8, so `decodeFilename()` unwraps both RFC 5987 and plain text.
