# Solar for Bid

Reads public procurement notices for you, picks the ones you can actually bid on, and produces what you need to start writing the proposal.

Upload your company documents once and the notices that match your eligibility get shortlisted. For the ones you decide to pursue, you get a requirements checklist, a WBS, a critical path, an effort estimate in man-months, and a submission checklist. The last screen answers a single question: what has to be submitted, by when, and where.

JunctionX Korea 2026 · Upstage track · Team soft icecream (planning and AI engineering Jeong-Woon, code engineering Yonghyun Lee and Jeongmin Kil, design Yejin Joo)

## Why we built it

Preparing a single public bid at a small SI or PMO firm starts with reading a hundred-page RFP end to end. Whether you meet the eligibility rules, how many copies of which documents are due and when, how many requirements there are, how many people you need to staff, all of it is scattered across the document. Korea's national procurement portal posts more than five thousand service notices in a two-week window, so just narrowing down what you can bid on eats a day.

Machines are good at the reading part. The hard part is what happens when the machine is wrong. In bidding, one missing document disqualifies you on the spot, so "probably right" is worth nothing.

That is why we spent as much effort on keeping evidence as on extracting values. Every number on screen carries the document and page it came from. Fields we could not read are left empty and labeled unverified rather than filled with zero. When a judgment cannot be made, the notice goes to a human instead of being dropped from the list.

## Five screens

| | Screen | What it does |
|---|---|---|
| 1 | Company registration | Drop in documents like a business registration certificate or a track-record statement. Each one is classified, values are extracted, and the company card on the right fills in |
| 2 | Company card | Public PMO track record, technical staff, credit rating, largest single contract, each shown with the source file |
| 3 | Notice discovery | The headline is "M of N". Every excluded notice carries the reason it was excluded. Whether to bid is a human decision |
| 4 | Notices in preparation | Only what a person picked. The header counts business days to the nearest deadline |
| 5 | Bid Kit | File submission, requirements checklist, WBS and critical path, submission readiness. The server decides the tab layout and even the button labels |

Parsing and judging one notice takes a few minutes. In the runs we committed, a cold run took 10 minutes 22 seconds and a run with cached Studio results took 4 minutes 11 seconds. While it runs, the screen re-asks every four seconds and names the current stage. We did not want to leave people staring at a spinner.

## Running it in five minutes

You need Node 20.11 or newer, Flutter (Dart SDK 3.11.5 or newer), and Python 3. We developed on Node 22.23 and Flutter 3.47.1.

```bash
# Backend
cp backend/.env.example backend/.env      # it boots fine with empty keys
cd backend && npm install && npm run dev  # http://localhost:3000, migrations run on boot

# Frontend (new terminal)
cd front && flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:3000
```

API docs are served as Swagger UI at `http://localhost:3000/docs`.

To serve a built web bundle instead:

```bash
cd front
flutter build web --release --no-web-resources-cdn \
  --dart-define=API_BASE_URL=http://localhost:3000
python3 -m http.server 8123 --directory build/web
```

`API_BASE_URL` is a compile-time constant, so the address is baked in once you build. Drop `--no-web-resources-cdn` and the page pulls CanvasKit from gstatic, which means a blank screen anywhere without network.

Three entries are defined in `.claude/launch.json` at the repo root.

| Name | Command | Port |
|---|---|---|
| `backend` | `node backend/src/server.js` | 3000 |
| `front-web` | `python3 -m http.server 8123 --directory front/build/web` | 8123 |
| `mock-upstage` | `node backend/scripts/mock-upstage.js` | 3999 |

### It runs end to end without any API key

The server boots and every screen works even with no keys at all. What comes back tells you it is not a live call, through `meta.cached`, `meta.listSource`, and `meta.source`. Check those fields before claiming a demo is live.

Document upload falls back to the samples in `backend/fixtures/extract/`, notice parsing and the company card fall back to the real Studio output stored in `backend/fixtures/studio/`, and the notice list falls back to `backend/fixtures/screening.demo.json`.

On top of that, `backend/data/solar-for-bid.sqlite` ships with two cases that went through the real pipeline. A fresh clone opens with all nine Bid Kit tabs already filled.

- `R25BK00645031-000` Payment gateway agency for the sports promotion voting online sales business
- `R26BK01673157-000` AX diagnosis and consulting integrated service development (KISTI)

Studio gives ten free runs per agent, which a few rehearsals burn through. So we wrote a server that imitates the Studio Jobs API and Solar Chat. Put the four lines below in `backend/.env` and start it, and the code takes every real path while the responses come from fixtures.

```bash
node backend/scripts/mock-upstage.js   # port 3999
```

```
UPSTAGE_AGENT_API_KEY=mock-local
STUDIO_BASE_URL=http://localhost:3999
SOLAR_CHAT_URL=http://localhost:3999/v1/chat/completions
STUDIO_POLL_INTERVAL_MS=500
```

### When you do add keys

`backend/.env` is the only file that gets read. A `.env` at the repo root is read by nobody.

`backend/.env.example` already has the fourteen Studio agent IDs filled in. Only three values are yours to add.

| Key | If empty |
|---|---|
| `UPSTAGE_API_KEY` | Document upload returns fixture responses |
| `UPSTAGE_AGENT_API_KEY` | Notice parsing and the company card fall back to fixtures, and judgment returns 503 |
| `DATA_GO_KR_SERVICE_KEY` | The notice list is a cached copy. Attachment collection works without this key |

There are two keys because there are two accounts. The shared `UPSTAGE_API_KEY` is for document upload, while the five notice-parsing agents, the company card, and Solar judgment use `UPSTAGE_AGENT_API_KEY`, the personal Studio account key that owns those agents. Neither substitutes for the other.

## What mattered in the design

```
Flutter (front)
   │  REST, JSON envelopes
Node/Express (backend) ── SQLite
   │
   ├─ Upstage Studio Agents   read documents (Parse → Classify → Extract)
   └─ Upstage Solar Chat API  judge (eligibility, planning, submission review)
```

### The screen does not decide anything

Bid Kit draws exactly what the server sends. Tab layout (`meta.kitPages`), table columns and rows, the tone of a status chip, button labels, the server decides all of it. Because there is no rule like "green if ready" living in the UI, adding a tab or changing a phrase does not touch screen code. Error messages are composed on the server too, and the frontend just renders them. The outer shape of every response is frozen by the two envelope schemas in `plan/Solar_for_Bid/04_계약/`.

### Upstage is used in two layers

Studio agents handle the reading layer. All of them are Parse → Classify → Extract, and taking HWP files with no conversion mattered a lot. A 77-page, 2MB file opened in Parse directly.

Five agents each read the same notice and their results are merged. Company documents are read one at a time by eight per-type agents on screen 1, and Company Card Builder, which folds those eight into one, is exposed separately at `POST /api/company-card/build`.

The judgment layer is the backend calling the Solar Chat API directly. We originally designed Studio's Instruct nodes to do this, but on this account Instruct returned Upstage's default sample response no matter what the prompt said. We swapped agents three times, halved the input, saved the configuration as a new version, and fed it a real PDF instead of HTML. Four jobs all came back with the same 64 characters. We concluded it was not something configuration could fix, left the prompts alone, and moved only where they run. The backend reads the Instruct node prompt out of `agent/*.json` and sends it to `solar-pro3`.

Moving it solved a second problem for free. When you upload an intermediate JSON to Studio as a file, Document Parse treats it as a document and runs layout analysis, which strips the quotes and braces. The Chat API takes JSON as a plain string, so nothing gets mangled, and judgments that compare two documents no longer need them concatenated into one file. The whole trail is in `agent/README.md`, sections 3-1 through 3-3.

### We do not take the model's answer as final

The backend recounts every judgment. It recounts how many rules were met, unmet, and unverified, and resets page numbers that do not exist in the notice back to zero. For the WBS it splits any package holding sixteen or more requirements along the notice's own categories, and leaves the duration as "not specified" when the document does not state one. If the critical path comes back empty, it fills it from the notice's deadline and registration documents.

The forbidden-phrase check shows why this matters. The model reported zero occurrences of hedging phrases in a sample proposal; the backend re-scanned the manuscript page by page and found three. Both results are merged before anything reaches the screen.

## Pipeline

| Stage | Frontend | Backend | Upstage |
|---|---|---|---|
| 01 Company registration | Drop documents and the slots fill in | Read one at a time via `POST /api/docs/upload`, save with `POST /api/companies/card` | Per-type document agents, one job per file |
| 02 Notice discovery | Full denominator, shortlist, exclusion reasons | First pass on list metadata alone | No calls |
| 03 Analysis | Polls every 4s, shows which stage failed | Collect attachments, parse, merge, cache by file hash | Five notice-parsing agents, up to 6 jobs per case |
| 04 Recommendation | Mark a notice for bidding (human decision) | Match the company card against eligibility rules | Solar, Eligibility Screener |
| 05 Requirements | Checklist, checks persist on the server | Flatten requirements into a table, store check state | No calls |
| 06 Planning | WBS, critical path, man-months, XLSX export | WPS/CP → WBS → critical path, with verification | Solar, three planning agents |
| 07 Submission | File submission and forbidden phrases (human decision) | Upload, re-run submission review on what changed | Solar, Submission Auditor |

One case costs six Studio jobs and six Solar calls. Adding one more document only re-runs the submission review, which is a single Solar call.

Three layers of caching keep the credit cost down. A case finished within seven days is served from storage instead of being re-run, Studio results are reused by file hash and agent ID, and a job that outlives the polling budget leaves its ID behind so the next run picks it up rather than paying again.

Stage-by-stage detail is in `agent/README.md` section 4, and the judgment layer implementation is in `backend/HANDOFF-solar-judgment.md`.

## Rules we held to

In a product built on document AI, the dangerous failure is a plausible wrong value. The same rules are written into both the code and the prompts.

Nothing is asserted without evidence. Every judgment carries a source document and a page number, and when the page is unknown we write zero rather than guess. Unknown values are never filled with zero; they stay unverified with a place to enter them by hand. Needing verification is not grounds for exclusion, because erasing an opportunity we could not read is worse than surfacing one we should not have. Bidding and submission only advance when a person says so. For forbidden phrases we point at the spot and do not rewrite the sentence; that is the writer's call.

## Repository

| Folder | What is in it |
|---|---|
| `front/` | Flutter app. Five screens plus widgets, theme, API client |
| `backend/` | Node/Express API server. Pipeline, judgment, SQLite, Swagger |
| `agent/` | Source configuration for the Upstage Studio agents, and the generator |
| `plan/` | Planning documents. Product plan, response contracts, execution plan, demo inputs |
| `design/` | Designer mockups |

`front/`, `backend/`, and `agent/` each have their own README. This document is the map; those are authoritative on detail.

| Document | What it covers |
|---|---|
| `front/README.md` | Screens, responsive layout, drag and drop, design tokens |
| `backend/README.md` | Routes, upload pipeline, data model, what bit us in external integrations |
| `backend/HANDOFF-solar-judgment.md` | Judgment layer handover. Inputs, outputs, guards, and real-call records for all five judgments |
| `agent/README.md` | Studio import, run results, what blocked us and how we solved it, the pipeline |
| `plan/Solar_for_Bid/01_RFP_기획안.md` | Product plan, frozen 2026-08-22 |
| `plan/Solar_for_Bid/04_계약/` | Response schemas for the frontend and backend contract |

## Tests

```bash
cd backend && npm test     # node:test, 158 tests
cd front && flutter test   # 104 passing, 5 skipped
```

Backend tests create a temporary SQLite file per process, so the development database is never touched. The five skipped frontend tests hit a real backend. Their default address is port 3010, so they skip unless you point them somewhere:

```bash
cd front && flutter test test/live_api_test.dart \
  --dart-define=API_BASE_URL=http://localhost:3000
```
