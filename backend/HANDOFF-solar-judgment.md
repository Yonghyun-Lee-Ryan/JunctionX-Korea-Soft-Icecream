# Solar 판정 층 인수서 — Solar for Bid 백엔드

2026-08-23 · 작성 정운 · 받는 사람 백엔드 개발자 · 보기 좋은 판: https://claude.ai/code/artifact/2f303aeb-48ae-4d46-8dc9-8044c8d3f117

> **한 줄.** 문서를 읽고·가르고·뽑는 층(Parse·Classify·Extract)은 Upstage Studio가 실측으로 돌아간다.
> 읽은 것을 **맞대어 판정하는 층**(자격·WPS/CP·WBS·임계경로·제출 검사)은 Studio Instruct 노드가 막혀서
> **백엔드가 Solar Chat API로 직접** 태운다. 프롬프트 5벌은 이미 다 쓰여 있고, 입력 fixture는 레포에 실물로 있다.
> 오늘 할 일은 §1 → §2 → §3 순서다.

---

## 0. 오늘 시작 순서 (API 키를 받았다면)

1. **키 1회 확인** — 아래 curl이 JSON을 돌려주면 끝. (§1-2)
2. **`solarJudge.service.js` 스켈레톤 붙이기** — 프롬프트 로더 · 호출 · 파싱 · 가드. 복사해서 시작. (§2)
3. **fixture로 자격 판정 1회** — `backend/fixtures/studio/` 의 회사 카드 + 공고로 `judgeEligibility` 를 돌려 `verdict` 가 나오는지. (§2-5)
4. **나머지 판정 4개** 같은 모양으로. WBS → 임계경로는 순서가 있다. (§3)
5. 판정 출력 → 탭 봉투 매핑. (§5)
6. Studio 층 연결 — 공고 해부 호출 복원·두 문서 병합·회사 카드 1개화. 판정 층이 돌고 난 **다음**이다. (§4)

---

## 1. Solar Chat API — 호출 사양

### 1-1. 확인한 사실 (console.upstage.ai/api/chat)

| 항목 | 값 |
|---|---|
| Endpoint | `POST https://api.upstage.ai/v1/chat/completions` — OpenAI 호환 |
| 인증 | `Authorization: Bearer $UPSTAGE_AGENT_API_KEY` — **정운 계정의 console 키**. Studio Agent 6종이 그 계정에 있어서 공고 해부·회사 카드·Solar 판정 층은 전부 이 키를 쓴다. 팀 키 `UPSTAGE_API_KEY` 는 기존 `/api/docs` 전용 |
| 모델 | `solar-pro3` (Studio 설정과 같음) · `solar-pro4` (최신) · 고정판 `solar-pro4-260806` |
| JSON 강제 | `response_format: {"type":"json_object"}` — 또는 `{"type":"json_schema", ...}` |
| `reasoning_effort` | pro3: `minimal`·`low`·`medium`·`high` · pro4: `xhigh`·`max`까지 |

### 1-2. 키 확인 — 이것부터

```bash
curl -s https://api.upstage.ai/v1/chat/completions \
  -H "Authorization: Bearer $UPSTAGE_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"solar-pro3","messages":[{"role":"user","content":"{\"ping\":1} 을 JSON으로 되돌려줘"}],"response_format":{"type":"json_object"}}'
```

`choices[0].message.content` 에 JSON이 오면 된다. 401이면 키가 console 키가 아닌 것이다.

### 1-3. 🔴 입력은 문자열로, 파일로 보내지 않는다

앞 단계 JSON을 Studio에 **파일**로 올리면 Document Parse가 레이아웃 분석을 해서 따옴표·콜론·중괄호를 지우고
키와 값을 다른 블록으로 흩는다(실측, `agent/README.md` 3-2). Chat API의 user 메시지에 **`JSON.stringify` 한 문자열**을 넣으면
이 문제가 없다. Studio Instruct가 살아나더라도 JSON은 이 길로 보낸다.

---

## 2. `solarJudge.service.js` — 붙여 넣고 시작하는 스켈레톤

기존 코드 관례를 그대로 따른다 — ESM · `AppError` · `env` · 전역 `fetch`(Node ≥ 20.11).
🔴 origin `e7d37a5`(8/23 00:27)가 워크플로 에이전트 층(`workflowAgents*`·`agentOutput.service.js`·`agents.routes.js`·테스트 2개·Agent 전용 키)을 **지웠다.** 그래서 JSON 복구 함수는 아래 스켈레톤에 넣어 뒀고, 남은 Studio 클라이언트는 `studio.service.js`(`uploadFile → runAgent → pollResponse → parseAgentOutput`)다.

### 2-1. `env.js` 에 더할 것

```js
// backend/src/config/env.js — studio: {...} 아래
solar: {
  apiKey: str('UPSTAGE_AGENT_API_KEY'),              // 정운 계정 console 키 — Studio 6종과 같은 키
  chatUrl: str('SOLAR_CHAT_URL', 'https://api.upstage.ai/v1/chat/completions'),
  model: str('SOLAR_MODEL', 'solar-pro3'),
  reasoningEffort: str('SOLAR_REASONING_EFFORT', 'medium'),
  timeoutMs: positiveInt('SOLAR_TIMEOUT_MS', 120000),
},
```

`codes.js` 에 한 줄 — `E_UPSTREAM_SOLAR: { status: 502, message: '판정 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }`
(표 머리말대로 정본 `error-codes.md` 는 정운이 맞춘다. 지금은 여기에 둔다.)

### 2-2. 프롬프트 로더 — 프롬프트는 새로 쓰지 않는다

판정 논리·출력 스키마·규율(`충족/미충족/[확인필요]`, `미 명시`, 투찰가 금지, 검산 블록)은 전부 `agent/*.json` 안에 있다.
**파일을 읽어 system 메시지로 보낸다.** 손으로 옮겨 적지 않는다 — 옮기는 순간 두 벌이 된다.

```js
// backend/src/services/solarJudge.service.js
import fs from 'node:fs';
import path from 'node:path';
import { env, ROOT } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

// backend/ 옆의 agent/ — Studio 설정 원본. 프롬프트의 정본이다.
const AGENT_DIR = path.resolve(ROOT, '..', 'agent');

/** 응답 앞뒤에 설명·fence가 섞여도 가장 바깥 JSON 객체만 꺼낸다 (지워진 agentOutput.service.js 대신) */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const s = text.trim();
  try { const v = JSON.parse(s); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch {}
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const v = JSON.parse(s.slice(a, b + 1)); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/** 판정 키 → [설정 파일, Instruct 노드 이름] */
const PROMPTS = {
  eligibility:     ['Eligibility Screener.json',   'screen-eligibility'],
  wpsCp:           ['WPS CP Decomposer.json',      'decompose-wps-cp'],
  wbs:             ['WBS Planner.json',            'build-wbs'],
  criticalPath:    ['Critical Path and Cost.json', 'estimate-path-cost'],
  submissionRules: ['Submission Auditor.json',     'prepare-document-info'],
  proposalScan:    ['Submission Auditor.json',     'scan-proposal-language'],
  submissionAudit: ['Submission Auditor.json',     'audit-submission-package'],
};

const promptCache = new Map();
export function loadPrompt(key) {
  if (promptCache.has(key)) return promptCache.get(key);
  const [file, node] = PROMPTS[key];
  const cfg = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, file), 'utf8'));
  const found = cfg.agentConfig.instructConfiguration.nodes.find((n) => n.name === node);
  if (!found) throw new Error(`prompt not found: ${file} → ${node}`);
  promptCache.set(key, found.prompt);
  return found.prompt;
}

/**
 * 🔴 각 프롬프트의 [파일 입력 계약]이 「===== 라벨 =====」로 나뉜 영역을 전제한다.
 *    라벨 이름은 프롬프트가 기대하는 그대로 — COMPANY_CARD · DOCUMENT_INFO · WPS_CP_V1 · WBS_V1 …
 */
export function buildUserMessage(sections) {
  return sections
    .map(([label, value]) => `===== ${label} =====\n${JSON.stringify(value, null, 2)}`)
    .join('\n\n');
}
```

### 2-3. 호출 한 벌

```js
export async function callSolar({ system, user, fetchImpl = fetch }) {
  if (!env.solar.apiKey) throw new AppError('E_NOT_CONFIGURED', 'Solar API 키가 설정되지 않았습니다.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.solar.timeoutMs);
  let res;
  try {
    res = await fetchImpl(env.solar.chatUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.solar.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.solar.model,
        reasoning_effort: env.solar.reasoningEffort,
        response_format: { type: 'json_object' },     // 🔴 Markdown 없이 JSON 하나
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err) {
    throw new AppError('E_UPSTREAM_SOLAR', undefined, { cause: err?.message });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError('E_UPSTREAM_SOLAR', undefined, { status: res.status, bodyLength: body.length });
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? '';
  const value = extractJson(text);                                // fence가 섞여도 복구
  if (!value) throw new AppError('E_AGENT_OUTPUT_INVALID', undefined, { outputLength: text.length });
  logger.info('solar_judge_completed', { model: env.solar.model, usage: json.usage });
  return value;
}
```

### 2-4. 자격 판정 — 첫 번째로 붙일 것

```js
export async function judgeEligibility({ companyCard, announcement, fetchImpl }) {
  const out = await callSolar({
    system: loadPrompt('eligibility'),
    user: buildUserMessage([['COMPANY_CARD', companyCard], ['DOCUMENT_INFO', announcement]]),
    fetchImpl,
  });
  return guardEligibility(out, announcement);
}

/**
 * 🔴 검산은 백엔드가 다시 센다. 프롬프트도 세라고 하지만 모델이 틀릴 수 있다.
 * 🔴 규율 — [확인필요]는 제외 사유가 아니다. 근거 쪽이 없는 미충족도 제외 사유가 아니다.
 */
export function guardEligibility(out, announcement) {
  const checks = Array.isArray(out.checks) ? out.checks : [];
  const knownPages = new Set((announcement.eligibility_rules ?? []).map((r) => r.source_page));
  for (const c of checks) {
    if (!knownPages.has(c.announcement_page)) c.announcement_page = 0;   // 쪽을 지어내지 않는다
  }
  const count = (s) => checks.filter((c) => c.status === s).length;
  out.matched_count = count('충족');
  out.failed_count = count('미충족');
  out.unverified_count = count('[확인필요]');

  const groundedHardFail = checks.some((c) =>
    c.gate_level === 'HARD_GATE' && c.mandatory === 'YES'
    && c.status === '미충족' && c.announcement_page > 0);
  if (out.verdict === '제외' && !groundedHardFail) {
    out.verdict = '추천';
    out._meta = { ...(out._meta ?? {}), overridden: 'no-grounded-hard-fail' };
  }
  if (out.verdict !== '제외') out.exclusion_reasons = [];
  return { ...out, checks };
}
```

### 2-5. 첫 스모크 — fixture로, 키 1번

```js
// backend/scripts/run-solar-judge-smoke.js
import fs from 'node:fs';
import { judgeEligibility } from '../src/services/solarJudge.service.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const companyCard = read('company_card.flat.json');
const announcement = {
  schema_version: 'ANNOUNCEMENT_CORE_V1',
  ...read('01_overview.rfp.json'),
  ...read('04_eligibility_submission.notice.json'),   // 자격은 공고서 20조항 + 마감
};

const out = await judgeEligibility({ companyCard, announcement });
console.log(out.verdict, out.headline);
console.log(`충족 ${out.matched_count} · 미충족 ${out.failed_count} · 미확인 ${out.unverified_count}`);
console.table(out.checks.map((c) => ({ rule: c.rule_id, label: c.label, status: c.status, p: c.announcement_page })));
```

**기대값** — 다온피엠씨는 **직접생산확인증명서가 없다**(서류 자체가 없음). 공고는 그걸 HARD_GATE로 요구한다(ELIG_012·013).
규율대로면 그 조항은 `[확인필요]`, `verdict` 는 **추천**, `unverified_count ≥ 1`. `제외` 가 나오면 가드가 잡아야 한다.

---

## 3. 판정 5개 — 프롬프트·입력·출력·순서

| # | 판정 | `PROMPTS` 키 | user 메시지 라벨 | 출력 `agent` | 먹는 탭 |
|---|---|---|---|---|---|
| 1 | 자격 | `eligibility` | `COMPANY_CARD` + `DOCUMENT_INFO` | `ELIGIBILITY_SCREENING_V1` | `verdict` · 화면③④ |
| 2 | WPS/CP 분해 | `wpsCp` | `DOCUMENT_INFO` | `WPS_CP_V1` | (3의 입력) |
| 3 | WBS | `wbs` | `WPS_CP_V1` + `DOCUMENT_INFO` | `WBS_V1` | `wbs` |
| 4 | 임계경로·원가 | `criticalPath` | `WBS_V1` + `DOCUMENT_INFO` | `CRITICAL_PATH_COST_V1` | `criticalpath` · `cost` |
| 5 | 제출 검사 | 아래 3호출 | 아래 | `SUBMISSION_AUDIT_V1` | `constraints` · `checklist` · `rework` · `phrases` |

**순서.** 1·2·5-a·5-b 는 서로 독립 → 병렬. 3 은 2 뒤, 4 는 3 뒤, 5-c 는 5-a·5-b 뒤.

**#5 제출 검사**는 Studio에서 4노드 체인이었다. 백엔드에선 3호출:

| | `PROMPTS` 키 | 라벨 → 내용 | 출력 |
|---|---|---|---|
| 5-a | `submissionRules` | `DOCUMENT_INFO` → 병합된 공고 | `SUBMISSION_RULES_V2` |
| 5-b | `proposalScan` | `PROPOSAL_TEXT` → 제안서 본문 **텍스트** (제안서 PDF를 Document Parse API로 한 번 읽어 `text`) | `PROPOSAL_SCAN_V1` |
| 5-c | `submissionAudit` | `SUBMISSION_RULES_V2` + `PROPOSAL_SCAN_V1` + `COMPANY_DOCUMENT_SUMMARY_V2` → **회사 카드의 `documents[]`** (Studio의 `summarize-company-document` 노드는 건너뛴다 — 카드가 같은 사실을 갖고 있다. 프롬프트가 기대하는 라벨만 맞춘다) | `SUBMISSION_AUDIT_V1` |

**가드 — 판정마다.**

| 판정 | 백엔드가 다시 세거나 막는 것 |
|---|---|
| 1 자격 | §2-4 `guardEligibility` |
| 3 WBS | `validation.primary_requirement_count` 를 `DOCUMENT_INFO.requirements` 로 다시 셈. `duration === ''` → `'미 명시'`. `is_recommendation` 은 항상 `true` |
| 4 임계경로·원가 | `cost_estimate.amount_convertible = false` 고정. `total_mm` 은 `by_grade` 합으로 다시 계산. `severity` 는 `danger|warn|default` 외 값이면 `default` |
| 5 제출 검사 | `summary.*` 를 `documents[].status` 로 다시 셈. 제안서 없으면 `forbidden_expressions = { count: 0, rule_note: '제안서 원고 미제출', items: [] }` — **통과로 바꾸지 않는다** |

프롬프트 첫머리의 「입력은 업로드된 단일 파일…Studio Instruct…」 문장은 Chat API에선 무해하다. 프롬프트를 고치지 않는다.

---

## 4. Studio 층 — 이미 돌아간다. 판정 층 뒤에 잇는다

### 4-1. 실물 출력 = `backend/fixtures/studio/`

| 파일 | Agent · ID | 입력 | 건수 |
|---|---|---|---|
| `01_overview.rfp.json` | `01-Overview` · `agt_2z8o3Lvz9oSuJDPz8hwAiK` | 제안요청서 | 사업명·예산 7,000만원·협상에 의한 계약·목표 7 |
| `02_scope_context.rfp.json` | `02-Scope-Context` · `agt_YkBxZFFfQ5pAqgDY2Tpkte` | 제안요청서 | scope 32 · context 34 |
| `03_requirements.rfp.json` | `03-Requirements` · `agt_Vk8s7vQCevFqy37QrchgFC` | 제안요청서 | 요구사항 **33** · `note_clause`(※) · `source_page` |
| `04_eligibility_submission.notice.json` | `04-Eligibility-Submission` · `agt_n7LXMmk3fmANEWKsSAQ9aU` · **config 3** | 입찰공고서 | 자격 20 · 마감 `2026. 08. 24(월) 10:30` · 전자입찰 |
| `04_eligibility_submission.rfp.json` | 〃 | 제안요청서 | 자격 12 · 서식 13 · 분량 100쪽/요약 50쪽 |
| `05_conditions_evaluation.rfp.json` | `05-Conditions-Evaluation` · `agt_BL4wbrGbHM5SaUcJHHQ4Qn` | 제안요청서 | 수행조건 182 · 평가 32 (기술 90/가격 10/협상적격 85%) |
| `company_card.flat.json` | `Company Card Builder` · `agt_iixJqRpLkzbUxUsB4kudho` | 회사 서류 8종 | 판정 층 입력 모양 |
| `company_card_builder.all8.yaml` | 〃 | 〃 | Studio 모아보기 원본 |

HWP를 변환 없이 먹는다 — 77쪽 2MB가 그대로 Parse됐다. 무료 실행은 **에이전트마다 10회**(정운의 Studio 계정).

### 4-2. `backend/.env.example` — 🔴 `env.js` 가 읽는 건 이 파일이다

`env.js` 는 `.env` 를 `backend/` 기준으로 읽는다. 아래 블록을 **`backend/.env.example` 에 넣어 뒀다** — `.env` 에 복사하고 키만 채우면 된다. 키는 **`UPSTAGE_AGENT_API_KEY`(정운 계정)** — 팀 키 `UPSTAGE_API_KEY` 와 다르다. 이 6종은 정운 Studio 계정에 있어서 팀 키로는 못 부른다:

```env
STUDIO_AGENT_ANNOUNCEMENT_OVERVIEW_ID=agt_2z8o3Lvz9oSuJDPz8hwAiK
STUDIO_AGENT_ANNOUNCEMENT_SCOPE_CONTEXT_ID=agt_YkBxZFFfQ5pAqgDY2Tpkte
STUDIO_AGENT_ANNOUNCEMENT_REQUIREMENTS_ID=agt_Vk8s7vQCevFqy37QrchgFC
STUDIO_AGENT_ANNOUNCEMENT_ELIGIBILITY_SUBMISSION_ID=agt_n7LXMmk3fmANEWKsSAQ9aU
STUDIO_AGENT_ANNOUNCEMENT_ELIGIBILITY_SUBMISSION_CONFIG=3   # fixture를 만든 설정. 4(초안)는 부수 오귀속 수정본
STUDIO_AGENT_ANNOUNCEMENT_CONDITIONS_EVALUATION_ID=agt_BL4wbrGbHM5SaUcJHHQ4Qn
STUDIO_AGENT_COMPANY_CARD_ID=agt_iixJqRpLkzbUxUsB4kudho
STUDIO_AGENT_COMPANY_CARD_CONFIG=1

SOLAR_CHAT_URL=https://api.upstage.ai/v1/chat/completions
SOLAR_MODEL=solar-pro3
SOLAR_REASONING_EFFORT=medium
```

서류별 `STUDIO_AGENT_BIZ_REG` 등 8개는 `Company Card Builder` 하나로 대체된다(§4-4). `env.js` 의 `studio` 에는 지금 `agentId` 하나뿐이다 — 위 6개 ID를 읽는 자리(`studio.agents`)를 만든다.

### 4-3. 공고 해부 — 두 문서를 돌리고 병합한다

공고 해부 호출은 `e7d37a5` 로 사라졌다. `studio.service.js` 로 **같은 file_id를 5 Agent에** 보내는 함수를 다시 만든다 — 지워진 `workflowAgentClient.service.js` 가 참고가 된다(`git show a9314a4:backend/src/services/workflowAgentClient.service.js`, `include=['last']`·폴링·재시도). 데모 공고는 **둘**이다.
마감·전자입찰·접수처는 **입찰공고서에만**, 요구사항·분량·서식은 **제안요청서에만** 있다.

```
제안요청서.hwp ─▶ 01·02·03·04·05 ─┐
                                  ├─▶ mergeAnnouncement ─▶ ANNOUNCEMENT_CORE_V1
입찰공고서.hwp ─▶ 04 (BID_NOTICE) ─┘
```

| 필드 | 규칙 (기획안 4-1 「공고서가 이긴다」) |
|---|---|
| `constraint_deadline` · `constraint_opens_at` · `constraint_method` · `constraint_place` | 공고서가 이긴다. 비어 있을 때만 제안요청서 |
| `constraint_page_limit` · `constraint_summary_page_limit` | 제안요청서 |
| `constraint_proposal_copies` | 🔴 제안요청서가 「최종보고서 5부」(COMPLETION 산출물, p37)의 5를 넣은 실측 사례. 프롬프트는 고쳤고(config 4 초안), 백엔드도 `submission_requirements` 중 `submission_stage==='COMPLETION'` 행의 `copies` 와 같으면 버린다 |
| `eligibility_rules[]` | 합친다. `condition` 공백 정규화 후 같으면 공고서 행 유지 |
| `submission_requirements[]` | 합친다. `submission_stage==='BID'` 만 입찰 제출물 |
| 나머지 (`requirements` · `scope_items` · `execution_conditions` · `evaluation_items`) | 제안요청서만 |

🔴 `source_page` 는 문서별 쪽이다. 행마다 `source_doc: 'notice' | 'rfp'` 를 붙여야 화면의 「p12 참고」가 맞는다.
fixture 둘(`04_*.notice.json` · `04_*.rfp.json`)로 먼저 단위 테스트한다.

### 4-4. 회사 카드 — Agent 1개로, 파일명은 백엔드가

`docs.service.js` 의 서류별 Agent 8개 호출을 `Company Card Builder` 1개로 바꾼다. Classify가 갈래를 가른다.

| Studio 갈래 | `docTypeKey` |
|---|---|
| `CO_BIZ_REG` | `biz_reg` |
| `CO_SME_CERT` | `sme_cert` |
| `CO_CREDIT_RATING` | `credit_rating` |
| `CO_PIA_DESIGNATION` | `pia_designation` |
| `CO_SW_BUSINESS` | `sw_business` |
| `CO_DIRECT_PRODUCTION` | 🆕 `direct_production` — `docTypes.js` 추가. KISTI 공고 참가자격이 요구(세부품명 `8111159801`) |
| `CO_PERFORMANCE` | `performance` |
| `CO_FINANCIAL` | `financial` |
| `CO_TECH_STAFF` | `tech_staff` |
| `CO_OTHER_REVIEW_REQUIRED` | `null` → 화면 「직접 확인」 |

🔴 **`source_document` 는 Studio가 못 채운다** — Extract 프롬프트에 파일명이 안 넘어간다. 응답 받는 자리에서 업로드 파일명을 넣는다.
🔴 실적 합계·최대 단일계약·갈래별 건수(화면② 「공공 PMO 8 · 최대 6.12억 · 합계 38억」)는 Extract가 **세지 않는다**(프롬프트가 금지). `performance_items[]` 의 `client_sector`·`service_category`·`contract_amount` 로 백엔드가 센다.

---

## 5. 판정 출력 → 탭 봉투 (`kitPages.js` 9탭)

어휘는 맞춰 뒀다 — 상태 `준비됨 / 보완 필요 / 미확인`, tone `danger / warn / default`, 기간 `미 명시`. `kitCells.js` 의 `cell/chipCell` 로 감싼다.

| 탭 | 열 | 출처 |
|---|---|---|
| `compliance` (checklist) | 요구사항ID·분류·명칭·단서·근거 페이지 | `03` → `requirement_id`·`requirement_category`·`requirement_name`·`note_clause`·`${source_page}p` |
| `wbs` (table) | ID·작업 패키지·산출물·선행·기간·M/M·근거요구·P | `WBS_V1.work_packages[]` — `predecessors.join('·')` · `effort_mm.map(g => g.grade+' '+g.mm).join('・')` |
| `criticalpath` (table) | 작업 · 남은 일 | `critical_path[].item` · `cell(due_label, severity)` |
| `cost` (metric) | value·unit·caption·note·evidence | `total_mm` · `'M/M'` · `by_grade` 조인 · `amount_note` · `references.map(r => r.label+'・공고 p'+r.page)` |
| `constraints` (banner) | text · evidence | `[constraint_method, copies && '제안서 '+copies+'부', page_limit, price_sealed].filter(Boolean).join('・')` · `'공고문 p'+constraint_source_page` |
| `checklist` (table) | 서류·부수·유효기간·상태·보완요청・리드타임·P | `SUBMISSION_AUDIT_V1.documents[]` — `chipCell(status, {준비됨:'ok','보완 필요':'warn',미확인:'muted'}[status])` |
| `rework` (tasks) | title·chip·detail·action | `rework_requests[]` |
| `phrases` (note) | body·emphasis·evidence | `forbidden_expressions.count` → `'…류 N곳 - 평가에서 불가능한 것으로 간주되는 표현입니다.'`, emphasis `N곳` |
| `submitfiles` (docs) | title·filename·state·label | `04.submission_requirements[stage=BID]` + 업로드 파일명 매칭 |

`verdict`: `headline`·`unverified_count`·`checks[]` 는 판정 1에서. `reasons[].docId` 는 업로드 쪽, `confidence` 는 Studio 응답 `additional_values` 에서.

---

## 6. 왜 백엔드가 판정을 맡나 — 실측 둘

**① Instruct 노드가 프롬프트를 안 탄다.** 무엇을 넣어도 64자 — Upstage 기본 예시.

```
### 1. invoice_total
RAW: Total: 656.5 USD
BASE_DATE: 2025-11-12
```

프롬프트는 설정에 있고(내보내기 2,876자 그대로) UI 편집기에도 보이고 배선도 정상. 입력을 28쪽→12쪽으로 줄여도, 설정 #2로 다시 저장해도 같다.
**실물 PDF도 같다** — `Submission Auditor`에 제안서 PDF를 넣으면 Classify는 `OUR_PROPOSAL`로 정확히 가르는데 Instruct 둘이 같은 64자.
에이전트 3개 · job 4건 · HTML/PDF 전부 동일. `cache_hit:false`. 계정 플랜/베타 권한 문제로 보이고, 설정으로 고칠 게 없다.

**② JSON을 파일로 올리면 Parse가 뭉갠다.** §1-3. Instruct가 살아나도 JSON은 Chat API로 보낸다.

---

## 7. 함정 — 실측으로 밟은 것

| # | 함정 | 대응 |
|---|---|---|
| 1 | JSON을 Studio 파일로 올리면 Parse가 뭉갠다 | Chat API에 문자열로 |
| 2 | Instruct 노드 `invoice_total` 스텁 | 판정은 백엔드. 부스 문의 (§8) |
| 3 | Extract 최상위 `object` 필드는 통째로 사라진다 | 평탄화해 뒀다(`constraint_*`). 새 필드도 최상위는 스칼라·배열만 |
| 4 | 입찰공고서는 Classify가 `OTHER`로 버렸다 | `04`에만 `BID_NOTICE` 갈래(config 3). **03에 공고서를 넣지 않는다** |
| 5 | `proposal_copies`에 「최종보고서 5부」 | 프롬프트 고침(config 4 초안 — 한 번 실행하면 확정). 백엔드도 §4-3 규칙 |
| 6 | `source_document` 빈 값 | 업로드 파일명으로 채운다 |
| 7 | 모아보기 YAML이 스키마 이름을 전부 `extract_co_other`로 찍는다 | API 응답의 step 이름을 믿는다. YAML은 데이터만 |
| 8 | 무료 실행 에이전트당 10회 | 재시도를 아낀다. 다 쓰면 에이전트 복사 |
| 9 | Studio 페이지가 수십 초 「로딩 중」 | API엔 무관 |
| 10 | 실적 합계·최대·갈래 건수를 Extract가 안 센다 | 백엔드가 `performance_items[]`로 센다 (§4-4) |
| 11 | `e7d37a5` 가 백엔드 워크플로 층을 통째로 지웠다 | 이 문서는 그 **이후** 기준. 옛 클라이언트·파서·테스트는 `git show a9314a4:backend/...` 로 참고 |

---

## 8. Upstage 부스에 물어볼 것 (5분)

1. **Instruct 노드가 프롬프트를 무시하고 `### 1. invoice_total …` 만 돌려준다.** 정운의 Studio 계정. `agt_ayktgUpfvDaWXBSeZDLRjZ` job `job_LMZrBkZBz3EyQyFNKcYyTE` · `job_fb7LTC3zTXPKU3HNTX9Hvc` · `job_SKSqGkkA4fWmSfuKQJ4MWC`, `agt_oQSZzqe2Pe2cA9jGEqqWkZ` 실물 PDF `job_CAaFwkwX6mxynbhDvKMz5c`. 플랜/베타 권한인가?
2. Instruct에 JSON 텍스트를 넣을 때 Document Parse를 건너뛰는 옵션이 있나?
3. Extract 프롬프트에 업로드 파일명을 넘길 수 있나?

---

## 9. 끝났다고 말할 수 있는 기준

- [ ] `curl` 키 확인 통과 (§1-2)
- [ ] `run-solar-judge-smoke.js` 가 fixture로 `verdict: 추천` · `unverified_count ≥ 1` 을 낸다 (§2-5)
- [ ] 판정 5개가 각각 JSON으로 파싱되고 가드를 통과한다 (§3)
- [ ] `tests/solar-judge.test.js` — `fetchImpl` 주입으로 Solar 없이 조립·파싱·가드를 검증 (전역 `fetch` 를 갈아끼우는 mock)
- [ ] `tests/announcement-merge.test.js` — fixture 둘로 마감은 공고서·분량은 RFP·부수는 빈 값
- [ ] `GET /api/cases/{caseId}` 봉투의 9탭이 fixture 기준으로 채워진다 (§5)

## 손대지 말 것

- `agent/*.json` 을 손으로 고치지 않는다 — `python3 agent/build_agents.py` 로 다시 뽑는다
- `*.hwp` 는 레포에 넣지 않는다 (`.gitignore` 51행)
- 커밋·PR은 팀이 직접

---

## 10. 2026-08-23 실호출(정운 계정 키)로 바뀐 것

데모 공고 `R25BK00645031`(체육진흥투표권 온라인발매 결제서비스(PG) 대행 용역 · 첨부 5건)로 전체 파이프라인을 실제로 돌렸다. 결과: **요구사항 145 · 참가자격 12 · 제출물 28 · WBS 9 · 체크리스트 24**, 자격 판정은 `추천`(전자금융업자 등록 등 `[확인필요]`), Studio 1회 + Solar 6회 · 251초.

| 실측 | 고친 것 |
|---|---|
| 01·02·03·05 의 Classify 가 용역 RFP 를 전부 `OTHER_REVIEW_REQUIRED` 로 보냈다 (갈래가 「직접 구축」·「PMO/PIA」 둘뿐) | 갈래 `SERVICE_OPERATION_RFP` 추가(`agent/build_agents.py ANNOUNCEMENT_BRANCHES`). **Agent 5종을 새로 임포트해 ID 가 바뀌었다**(v2 · `.env.example` 참조 · 무료 실행 10회 새로 시작) |
| 03 이 용역 RFP 에서 요구사항 0건 (요구사항 총괄표 전제) | 용역 전용 추출 노드 `extract_service_requirements`(`REQ_SERVICE_PROMPT`) — 과업 내용을 SVR-001… 로 센다. 03 v2 의 **Config #3** 로 `POST /v2/agents/{id}/configs` 에 올렸다(아래) |
| 판정 입력이 공고 전체 91KB(약 7.7만 토큰)라 Solar 가 120초 안에 못 냈다 | `announcementFor(kind, announcement)` — 자격·계획·제출 판정마다 필요한 필드만. `SOLAR_TIMEOUT_MS` 기본 300000 |
| 6 job 이 폴링 예산 300초를 넘겨 통째로 실패 → 재시도가 전부 다시 샀다 | `studio_result` 캐시(파일 sha256 + Agent ID). 시작만 한 job 은 `job_id` 를 남겨 **다음 실행이 이어서 기다린다**. 분류만 한 결과는 캐시하지 않는다 |
| 테스트의 `clearStudioResults()` 가 개발 DB 의 실제 캐시를 지웠다 | `npm test` 는 `tests/setup.js` 로 `data/test.sqlite` 를 쓴다 |
| Studio UI 가 느리거나 안 뜰 때 | **Agents API 가 있다** — `GET /v2/agents`, `GET /v2/agents/{id}/configs`, `PATCH /v2/agents/{id}` (이름), `POST /v2/agents/{id}/configs` (런타임 모양 `steps[]` 그대로 올리면 새 설정이 기본값이 된다). 키는 `UPSTAGE_AGENT_API_KEY` |

🔴 남은 것: 임계경로가 0건으로 온다(공고가 처리기간을 명시하지 않으면 프롬프트가 비운다 — 규율대로지만 화면이 비어 보인다). WBS 첫 패키지가 요구사항 50개를 한 행에 묶는다(프롬프트 개선 여지).
