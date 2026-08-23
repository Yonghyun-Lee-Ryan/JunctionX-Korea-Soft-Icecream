# Studio Agents (Solar for Bid)

The source configuration for the eleven Upstage Studio agents that produce the values on screen, plus the record of uploading them and running them.

- The configuration source is the JSON files in this folder, and the generator is `build_agents.py`.
- The full list, the stages, and the input files are collected in `manifest.json`.
- Built on a Studio account on 2026-08-22.

Do not hand-edit the JSON. To change a schema or a prompt, edit `build_agents.py` and generate again.

```bash
python3 agent/build_agents.py
```

01, 02, and 05 were built by hand in Studio by a teammate and exported, so the generator leaves them alone.

---

## 1. Uploading to Studio

Studio → the ⌄ next to 「에이전트 만들기」 (create agent) → 「에이전트 설정 일괄 가져오기」 (bulk import agent configuration) → pick the JSON.

What we learned doing it ourselves:

- The import is faithful. Export it back out and even the descriptions in the extraction schema come through unchanged.
- One file goes in at a time. Select several and only the first one uploads.
- `agent_name` does not come along. Everything is created under the name 「Agent」, so you have to rename each one from the list with ⋮ → 이름 편집 (rename).
- Studio adds `text` to `outputFormats` and `figure` to `base64Encoding`, and throws `confidenceThreshold` away. It ignores `nodeMode` too. None of that affected behavior.

## 2. Free run quota

The `0/10` in the top right of the editor is per agent, not per account (when 03 was at 1/10, 04 was still at 0/10). Running one file spends one. Once it is used up, copy the agent (list ⋮ → 에이전트 복사, duplicate agent) and you get another 10.

## 3. Run results (2026-08-22)

| Agent | Input | Result |
|---|---|---|
| 01-Overview | 제안요청서.hwp (the RFP) | Project name, agency, period, budget (70,000,000 KRW), contract by negotiation, 7 objectives |
| 02-Scope-Context | 제안요청서.hwp | scope_items 32, execution_context 34 |
| 03-Requirements | 제안요청서.hwp (77 pages) | Classified as `BUILD_IMPLEMENTATION_RFP`, 33 requirements. Matches the sum of the 8 categories in the summary table. SFR-010's 「※ 세부 기능 구현 사항은 발주기관과 협의 하에…」 (detailed feature implementation subject to agreement with the contracting agency) was split off into `note_clause`, and `source_page` holds the real values, pages 13 to 26 |
| 04-Eligibility-Submission | 입찰공고서(재공고).hwp (the re-issued bid notice, 8 pages) | Classified as `BID_NOTICE`, 20 eligibility clauses with page numbers. Direct production confirmation certificate (직접생산확인증명), software business registration, large-company exclusion, and consortium terms (5 companies / 10%) all caught. `constraint_deadline` = 2026. 08. 24(월) 10:30 |
| 04-Eligibility-Submission | 제안요청서.hwp | 12 eligibility items, 13 submission forms (붙임2 가·나·다, attachment 2 sections a, b, c), 100-page limit with a 50-page summary. `proposal_copies=5` had been pulled from 「최종보고서 5부」 (5 copies of the final report) by mistake, so we fixed the prompt |
| 05-Conditions-Evaluation | 제안요청서.hwp | 182 execution conditions, 32 evaluation items (technical 90 / price 10 / negotiation eligibility 85%) |
| Company Card Builder | 8 company document PDFs | All 8 extracted, each into its own branch. We downloaded them in one go as 모아보기 (combined view) YAML |
| Submission Auditor | Proposal PDF | Classify sorted it correctly as `OUR_PROPOSAL`, but the two Instruct nodes behind it returned stub output (see 3-1) |

The actual output files are in `backend/fixtures/studio/`, and the backend handover notes are in `backend/HANDOFF-solar-judgment.md`.

HWP files go up as they are, with no conversion. A 77-page, 2MB file opened directly in Parse (Enhanced).

### What we fixed after running it

We added the `BID_NOTICE` branch to 04 only.
We fed in the bid notice and Classify sent it to `OTHER_REVIEW_REQUIRED`, so Extract never ran. The classifier was not wrong. The shared branch defines only 「제안요청서 또는 과업문서」 (an RFP or a statement of work) as BUILD, and a bid notice is neither. The problem is that the deadline and the electronic-bidding flag exist only in the notice, so we added the branch to 04 alone. We left 03 as it was. A bid notice carries no detailed requirements, so sending it to OTHER is correct.

Studio drops top-level object fields.
We declared `submission_constraints` as a nested object and it vanished from the result. `schemaLayout` is table-oriented, so an object that is not declared as a column seems unable to survive. So we flattened the top level into scalars like `constraint_deadline`. The hint was that 03's `requirement_count` survived because it is a top-level scalar.

### Still open: the backend fills in `source_document`

Company Card Builder returns an empty `source_document`. Studio does not hand the filename to the Extract prompt, so no prompt can fix it. Screens ① and ② show a filename such as 「사업자 등록증_다온피엠씨.pdf」 next to every value, so the side that knows the filename, the backend that took the upload, fills it in.

## 3-1. The Instruct node never ran our prompt

Run Eligibility Screener and, whatever the prompt says, you always get the same 64 characters.

```
### 1. invoice_total
RAW: Total: 656.5 USD
BASE_DATE: 2025-11-12
```

That is the Studio Instruct node's default sample output. It has nothing to do with our input, the company card and the notice.

We confirmed it is not a configuration problem.

| What we checked | Result |
|---|---|
| Whether the imported prompt is in the configuration | It is. Export it and the 2,876-character prompt comes back intact |
| Whether it shows in the UI editor | It does. The `인식(Parse) → screen-eligibility(Instruct)` wiring is fine too |
| Node mode and model | `생성만 하기` (generate only, free-form text), model `기본형` (standard) |
| Whether the input is too large | No. Cutting 28 pages to 12 changed nothing |
| Whether it is a configuration-version problem | No. Editing the prompt in the UI and saving it as configuration #2 changed nothing |
| Whether it is a cache | No. `cache_hit: false`, and all 3 jobs returned the same output |
| Whether it is because the input is JSON or HTML | No. Feed a real proposal PDF to Submission Auditor and Classify still gets it right while the two Instruct nodes behind it return the same 64 characters |

On this account the Instruct node returns the sample response without ever running the model, whatever the input format. It looks like a plan or beta-access issue, and there was nothing left to touch on the configuration side. 3 agents, 4 jobs, PDF and HTML input, all identical.

The fallback is the one written into section 4 of the product plan. Judgments that have to combine several documents happen in the backend Node layer, calling the Solar API directly. All 5 prompts can be used as they are. The backend sends `instructConfiguration.nodes[].prompt` from `agent/*.json` straight to Solar; it simply does not go through Studio, and the judgment logic is already all in there.

The Parse, Classify, and Extract layers are unaffected. The five notice-parsing agents and the company card work fine.

## 3-2. Hand JSON in as a file and Parse breaks the structure

The Instruct input is a file made by concatenating the JSON from the previous stages. We uploaded it as HTML wrapped in `<pre>`, the way the backend had been doing it, and Document Parse treated it as a document, ran layout analysis on it, and broke the structure.

Part of the Parse result for `in_wps_cp.html` (21 pages of notice-parsing JSON):

```
2 - Paragraph   진단컨설팅 통합 서비스 개발 / 한국과학기술정보연구원
3 - Paragraph   기능
4 - Paragraph   성능
6 - Heading1    데이터
13 - List       요구사항 / 모드 선택 기능 구현 / 시작 화면범용피지컬종 모드 선택 구분 제공세션
```

Quotes, colons, and braces are gone, and keys and values scatter into separate blocks. No pair like `"requirement_id": "SFR-001"` survives, so it is not an input a judgment node can read.

So we stopped feeding JSON in as a file. Move the judgment layer onto the backend Solar API and the JSON goes into the prompt as a plain string, never touching Parse, and the problem disappears. If you must go through Studio, build a table-shaped document instead of JSON and upload that.

## 3-3. The fix: judgment layer moves to the backend plus the Solar API

3-1 and 3-2 were solved the same way. We pulled the Instruct node's job out of Studio, and the backend calls the Solar Pro 3 chat API directly. From this folder's point of view, here is what changes.

The prompt source is still the JSON in this folder. At run time the backend opens `agent/*.json` and uses `instructConfiguration.nodes[].prompt` as the system prompt. The backend looks up the file and node names as fixed strings, so do not rename them.

| Judgment | JSON file | Node name |
|---|---|---|
| Eligibility | `Eligibility Screener.json` | `screen-eligibility` |
| WPS/CP decomposition | `WPS CP Decomposer.json` | `decompose-wps-cp` |
| WBS | `WBS Planner.json` | `build-wbs` |
| Critical path and M/M | `Critical Path and Cost.json` | `estimate-path-cost` |
| Submission rule collation | `Submission Auditor.json` | `prepare-document-info` |
| Forbidden-phrase scan of the manuscript | `Submission Auditor.json` | `scan-proposal-language` |
| Submission package audit | `Submission Auditor.json` | `audit-submission-package` |

The order for changing a prompt is unchanged too. Edit `build_agents.py` → regenerate the JSON with `python3 agent/build_agents.py` → restart the backend (it caches prompts in memory). No need to upload to Studio again.

The input is a string, not a file. The previous stage's JSON (`COMPANY_CARD`, `ANNOUNCEMENT_CORE_V1`, `WPS_CP_V1`, `WBS_V1`, `PROPOSAL_SCAN_V1`) goes into the user message as is, under a label. Nothing passes through Parse, so the structure breakage from 3-2 does not happen, and two documents no longer need to be concatenated into one file. The `[파일 입력 계약]` (file input contract) section of the prompt still reads correctly because the labels are the same.

We send only the fields each judgment needs, not the whole notice. The notice-parsing result runs about 90KB, and sending it whole pushed the response past 2 minutes until it was cut off. Eligibility gets the overview, the constraints, and the eligibility clauses; the submission audit gets the deliverables and the evaluation items; the WBS gets only requirement ID, category, name, and page; the critical path gets only the eligibility clauses and the bid deliverables. The model is `solar-pro3` and the response timeout defaults to 300 seconds.

We accept JSON only, and the backend rechecks it. The JSON-only contract at the end of the prompt is unchanged, and once an answer comes back the backend works it over once more. It recounts the 충족 / 미충족 / 확인필요 (met / unmet / needs verification) totals in the eligibility judgment and resets any evidence page that does not exist in the notice back to 0; for the WBS it counts unlinked requirements and packages holding 16 or more requirements, and leaves the duration as 「미 명시」 (not specified) when it is empty; if the critical path comes back empty it fills it from the notice's deadline and registration documents; and for forbidden phrases the backend adds the spots the model missed by searching the full text. It is the mechanism that keeps a false value off the screen when the model is wrong.

The layer Studio owns is unchanged. Company Card Builder and 01 through 05 still run on Studio's `/v2/files` + `/v2/responses`, and results are cached in the DB by file hash so we never pay for the same file twice. The keys split in two. The team's shared `UPSTAGE_API_KEY` is for Studio, while Solar calls and the Agents API use `UPSTAGE_AGENT_API_KEY`.

Call counts. One case costs Solar 1 eligibility call, 3 planning calls, and 1 to 3 submission audits, and because there is a path that re-runs only part of the judgment (`rejudge`), uploading a single document costs one submission audit. The numbers and where they are implemented are in `backend/HANDOFF-solar-judgment.md`.

If the Instruct node starts working on this account later, the same JSON can run in Studio unchanged. We left the file input contract and the JSON output contract in the prompts alone for that case.

## 4. Pipeline

The whole flow is 7 stages. The frontend, the backend, and Upstage each take on something different at each stage, and 04 (recommendation) and 07 (submission preparation) move on only once a person decides.

| Stage | Frontend | Backend | Upstage |
|---|---|---|---|
| 01 Company registration | 9 document types → company profile. Values we could not read are left open for manual entry | `POST /api/companies`. Gathers track-record and file metadata into a profile, and caches it once built | Company Card Builder. Parse → Classify into 9 branches → Extract. 1 job per document, once per company |
| 02 Notice discovery | Shows the full denominator and the shortlist, as in 「127건 중 3건」 (3 of 127), with a reason attached to every excluded notice | `GET …/screening`. Filters cheaply on list metadata alone. Excludes only when the evidence is clear, otherwise keeps the notice as a candidate | — |
| 03 Analysis | Polls every 4 seconds. Shows exactly which stage failed | Collects attachments from 나라장터 (the national procurement portal) automatically → analyze → merge. Caches results by SHA-256 and picks up jobs that were cut off | Studio agents 01 through 05, 6 jobs per case. Parse → Classify → Extract on HWP with no conversion, pulling out the core fields and the RFP requirements |
| 04 Recommendation (human decision) | Recommendation card → prepare to bid. The next stage opens only after a person decides, and every item needing verification is shown | Matches the company profile against the eligibility rules to produce a recommendation or an exclusion. An exclusion has to carry page-level evidence, and fields we could not read stay as needs verification | Solar Pro 3 · Eligibility Screener. Only the eligibility and submission clauses are cut out and passed in |
| 05 Requirements | Checklist. Requirement ID, caveat, evidence page, XLSX download | 145 requirements → checklist. The backend decides the labels and the frontend infers nothing | — |
| 06 Planning | WBS, critical path, M/M. The deadline is always visible | WPS/CP → WBS → critical path plus verification. Large packages are split, and existing results are reused | Solar Pro 3 · three planning agents (WPS/CP Decomposer, WBS Planner, Critical Path & Cost) |
| 07 Submission preparation (human decision) | File submission and submission readiness. Upload the required documents and the proposal manuscript and it marks the forbidden phrases and the items a person has to look at | Upload → submission audit. Forbidden phrases are searched across the full text, and only what changed is re-audited | Solar Pro 3 · Submission Auditor (collate rules → scan the manuscript → audit the package) |

The flow in short:

```
Company documents (9 types) ─ Company Card Builder ─▶ COMPANY_CARD ──┐
                                                                     ├─▶ Eligibility Screener ─▶ 04 Recommendation
RFP and bid notice ─ 01~05 ─▶ ANNOUNCEMENT_CORE_V1 ──────────────────┤
                                                                     ├─▶ WPS/CP → WBS → Critical Path & Cost ─▶ 06 Planning
Our proposal manuscript ─────────────────────────────────────────────┴─▶ Submission Auditor ─▶ 07 Submission preparation
```

### How Studio and the Solar API split the work

The Upstage side splits into two layers.

Studio owns the layer that reads documents. Company Card Builder and 01 through 05 are all Parse → Classify → Extract, and as written in section 3 they run fine on the original HWP and PDF with no conversion. This layer's output (`COMPANY_CARD`, `ANNOUNCEMENT_CORE_V1`) becomes the input to the stages behind it.

The judging layer is the backend calling the Solar Pro 3 API directly. We originally designed the Instruct nodes of Eligibility Screener, WPS CP Decomposer, WBS Planner, Critical Path and Cost, and Submission Auditor to do this work, but as written in 3-1, on our account the Instruct node does not run and returns only the sample response. It is not something the configuration side can fix, so we switched to having the backend read the same prompt out of `instructConfiguration.nodes[].prompt` in `agent/*.json` and send it to the Solar Pro 3 chat API. The judgment logic is already all in the prompt, so the shape of the result is the same; it just does not go through Studio. The concrete means are in 3-3.

The change solved a few other things along the way.

- The Parse problem from 3-2 disappears. The previous stage's JSON goes into the prompt as a plain string instead of being uploaded as a file, so the structure stays intact.
- Judgments that put two documents side by side (company card ↔ notice, WBS ↔ notice) no longer need concatenating into one file. The backend puts each JSON into the prompt separately.
- Each judgment gets only the fields it needs cut out and sent: the eligibility clauses and the deliverables for eligibility, only requirement ID, category, name, and page for the WBS. Sending the whole notice (about 90KB) made the response far too slow, which is why we split it up.

We left the `[파일 입력 계약]` section in the prompts as it was (first region = company/WBS, second region = notice). The point is that if Studio's Instruct node starts working later, the same configuration can run without going through the backend.

The backend implementation and the call counts are in `backend/HANDOFF-solar-judgment.md`.

### Demo inputs (`plan/Solar_for_Bid/06_데모입력/`)

| What | File |
|---|---|
| Company documents | 8 files matching `*_다온피엠씨_가상.pdf` (a fictional company) |
| Our proposal | `제안서_다온피엠씨_가상.pdf`. A fictional document, with 3 forbidden phrases planted in it on purpose. It covers only 23 requirements, so against the 33 total, 10 of them (`SFR-008`·`PER-001`·`DAR-004`·`SER-004`·`TQR-001~002`·`PSR-001~004`) stay unaddressed |

The two notice documents are not kept in the repo. `.gitignore` blocks `*.hwp` (procurement originals are confidential, so we decided not to commit them). Keep them locally and upload them by path.

| What | Local file |
|---|---|
| RFP | `제안요청서.hwp` — KISTI 「AX 진단-컨설팅 통합 서비스 개발」 (AX diagnosis and consulting integrated service development), 77 pages, 33 requirements |
| Bid notice | `입찰공고서(재공고).hwp` — the deadline, the copy count, and the electronic-bidding flag exist only here. The RFP hands them off with 「입찰관련 안내 : 입찰공고문 참조」 (for bidding information, refer to the bid notice) |

Demo notice details: reference number `R26BK01673157-000`, estimated price 63,636,364 KRW, electronic bidding (나라장터), submission window 2026.08.20 09:00 ~ 08.24 10:30, technical evaluation 08.27 14:00, consortium of at most 5 companies with a stake of 10% or more, no subcontracting, direct production confirmation with detail item number `8111159801`.

## 5. The 11 agents

### Notice parsing (classify-extract, 5)

Five agents each read the same original and their results are merged into `ANNOUNCEMENT_CORE_V1`. There are three classes, `BUILD_IMPLEMENTATION_RFP` / `PMO_PIA_SERVICE_SPEC` / `OTHER_REVIEW_REQUIRED`, and each branch has its own extraction schema.

| Studio name | Screen | What changed this time |
|---|---|---|
| 01-Overview | — | — |
| 02-Scope-Context | — | — |
| 03-Requirements | ⑦ Requirements checklist | Split `note_clause` (※ caveat) and `source_page` (integer) into separate columns |
| 04-Eligibility-Submission | ⑥ File submission · ⑨ Submission preparation | Split out `copies`, `validity_basis`, and `submission_method`, added `submission_constraints` |
| 05-Conditions-Evaluation | Scoring | — |

### Company (classify-extract, 1)

| Studio name | Screen | Notes |
|---|---|---|
| Company Card Builder | ① Company registration · ② Company card | New. 9 branches plus 1 undetermined |

It folds the 8 per-document agents in `backend/.env.example`, such as `STUDIO_AGENT_BIZ_REG`, into one. You no longer call a separate agent for every document type, which counts for a lot under the 10-run limit, and the direct production confirmation certificate branch exists only in this agent. The eligibility rules in the KISTI notice demand that document.

### Judgment and output (instruct, 5)

| Studio name | Screen | Notes |
|---|---|---|
| Eligibility Screener | ③④ Notice discovery | Replaces `Company Bid Fit Assessment` |
| WPS CP Decomposer | — | Unchanged |
| WBS Planner | ⑧ WBS table on the left | New |
| Critical Path and Cost | ⑧ Critical path · M/M cost | New |
| Submission Auditor | ⑨ Submission preparation | Replaces `Submission Package Compliance` |

Why we replaced them:

- Company Bid Fit Assessment emits one word, `GO` or `NO-GO`. Screens ③ and ④ draw 「충족 5」 (5 met), a check per item, the evidence file, and the reason and page number behind 「제외 124건」 (124 excluded), and one word cannot carry that. Eligibility Screener emits `충족 / 미충족 / [확인필요]` and a page number for every clause.
- Submission Package Compliance has no copy count, no validity period, no lead time, no rework-request sentence, and no forbidden-phrase check. Submission Auditor added the `OUR_PROPOSAL` branch and filled those in.

On 8/23, with the backend's workflow agent layer sorted out, judgment is done by the backend calling the Solar Chat API directly. See `backend/HANDOFF-solar-judgment.md` for the detail.

### Replaced, no longer used

`Company Bid Fit Assessment.json`, `Submission Package Compliance.json`. Kept for reference until the wiring is moved over.

## 6. Cross-checked against the backend tab contract

The backend defines 9 tabs in `kitPages.js` and `kitCells.js`. We lined up how the agent output lands in those columns. 7 of the 9 are 1:1, and two need a value only the backend knows.

| Tab | What the backend needs | Agent output | Notes |
|---|---|---|---|
| compliance | Requirement ID, category, name, caveat, evidence page | 03 → `requirement_id`·`requirement_category`·`requirement_name`·`note_clause`·`source_page` | As is |
| wbs | ID, work package, deliverable, predecessor, duration, M/M, source requirement, P | Every field of `WBS_V1.work_packages[]` | Two arrays joined into strings |
| criticalpath | Task · days remaining, plus tone | `critical_path[].item`·`due_label`·`severity` | severity mapped onto the backend's tone vocabulary |
| cost | value·unit·caption·note·evidence | `cost_estimate.total_mm`·`by_grade[]`·`amount_note`·`references[]` | As is |
| constraints | banner text plus evidence | 04 → assembled from the `constraint_*` scalars | This is where the flattening pays off |
| checklist | Document, copies, validity period, status, rework request / lead time, P | `SUBMISSION_AUDIT_V1.documents[]` | Only rework request and lead time are merged into one cell |
| rework | title·chip·detail·action | `rework_requests[]` | As is |
| phrases | body·emphasis·evidence | `forbidden_expressions` | As is |
| submitfiles | title·filename·state·label | `04.submission_requirements[].name` plus the uploaded filename | The backend fills in the filename |

`verdict` is the same story. `headline` and `unverified` come straight from `ELIGIBILITY_SCREENING_V1`, but the agent does not know `reasons[].docId` or `confidence`. `docId` is known by whoever did the upload, and `confidence` rides in on `content[].additional_values` in the Studio response.

The vocabulary is matched to the backend fixtures. Status is `준비됨 / 보완 필요 / 미확인` (ready / needs work / unverified), tone is `danger / warn / default`, and an unknown duration is `미 명시`. The words are identical, so they go in with no conversion.

## 7. Rules common to every prompt

These are written into all eleven nodes.

- Fixed judgment vocabulary. An item is one of `충족 / 미충족 / [확인필요]`; a notice is one of `제외 / 추천` (excluded / recommended). `[확인필요]` is not a reason to exclude. Erasing an opportunity because we could not read it is worse.
- Evidence is mandatory. Every judgment carries the company document name and the page number in the notice. If the page is unknown we leave `0` and do not guess.
- No inventing. We do not manufacture track records, qualifications, durations, or validity periods that do not exist. If the document does not state a WBS duration, it stays `미 명시`.
- No interpreting statutes. We copy the article name and number as they stand, nothing more.
- No bid prices. M/M is a recommendation carrying `is_recommendation: true`, and it is never converted into an amount.
- No rewriting sentences. For forbidden phrases we point at the spot that was caught. Fixing it is a person's job.
- A verification block. WBS Planner actually counts unlinked requirements, and Eligibility Screener actually counts how many are met, unmet, and unverified.

## 8. What comes next

The current structure makes the next step cheap.

Adding a document branch costs one agent. Add a branch to Company Card Builder, run `build_agents.py` again, and a new document type can be read without touching the backend's classification rules or the screens. The direct production confirmation certificate sits in exactly that spot right now, with only its branch defined.

Notice types work the same way. Today we look at service RFPs and bid notices; add a Classify branch and attach an extraction schema for it and the coverage widens to goods or construction notices. That is exactly what we did when we added `SERVICE_OPERATION_RFP`.

The judgment layer is cheaper still to extend, because the prompts are files. If a new judgment comes along, post-award tracking or an agency card, you add one more JSON and register it in the backend's prompt map. The code does not change.

If the Instruct node opens up on this account, the judgment layer can move back inside Studio. We left the file input contract and the JSON output contract in the prompts intact for that day. What moved to the backend is only where it runs; the judgment logic still sits in the JSON in this folder.
