import fs from 'node:fs';
import path from 'node:path';
import { env, ROOT } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

/**
 * Solar 판정 층.
 *
 * 🔴 Studio Instruct 노드가 프롬프트를 안 타서(2026-08-22 실측, agent/README.md 3-1)
 *    판정은 백엔드가 Solar Chat API로 직접 한다 — backend/HANDOFF-solar-judgment.md.
 * 🔴 프롬프트는 새로 쓰지 않는다. agent/*.json 의 Instruct 노드 프롬프트를 **파일에서 읽어**
 *    system 메시지로 보낸다. 손으로 옮기는 순간 두 벌이 된다.
 * 🔴 앞 단계 JSON은 **문자열로** user 메시지에 넣는다. 파일로 올리면 Document Parse가 구조를 뭉갠다.
 */

// backend/ 옆의 agent/ — Studio 설정 원본이자 프롬프트의 정본
const AGENT_DIR = path.resolve(ROOT, '..', 'agent');

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
  const spec = PROMPTS[key];
  if (!spec) throw new Error(`unknown prompt: ${key}`);
  if (promptCache.has(key)) return promptCache.get(key);
  const [file, node] = spec;
  const cfg = JSON.parse(fs.readFileSync(path.join(AGENT_DIR, file), 'utf8'));
  const found = cfg.agentConfig.instructConfiguration.nodes.find((n) => n.name === node);
  if (!found) throw new Error(`prompt not found: ${file} → ${node}`);
  promptCache.set(key, found.prompt);
  return found.prompt;
}

/**
 * 🔴 각 프롬프트의 [파일 입력 계약]이 「===== 라벨 =====」로 나뉜 영역을 전제한다.
 *    라벨은 프롬프트가 기대하는 이름 그대로 — COMPANY_CARD · DOCUMENT_INFO · WPS_CP_V1 · WBS_V1 …
 */
export function buildUserMessage(sections) {
  return sections
    // 🔴 문자열(제안서 본문 등)은 따옴표 없이 원문 그대로, 객체는 JSON 문자열로
    .map(([label, value]) => `===== ${label} =====\n${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`)
    .join('\n\n');
}

/** 응답 앞뒤에 설명·fence가 섞여도 가장 바깥 JSON **객체**만 꺼낸다. 배열·스칼라는 null */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const s = text.trim();
  const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  try { return asObject(JSON.parse(s)); } catch { /* 아래에서 복구 */ }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return asObject(JSON.parse(s.slice(a, b + 1))); } catch { return null; }
}

function assertConfigured() {
  if (!env.solar.apiKey) {
    throw new AppError('E_NOT_CONFIGURED', 'Solar API 키(UPSTAGE_AGENT_API_KEY · 정운 계정)가 설정되지 않아 판정을 실행할 수 없습니다.');
  }
}

/** Chat API 한 번. 🔴 response_format=json_object — Markdown 없이 JSON 하나를 받는다 */
export async function callSolar({ system, user, fetchImpl }) {
  assertConfigured();
  const doFetch = fetchImpl ?? globalThis.fetch;   // 호출 시점의 전역 fetch — 테스트가 갈아끼운다
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.solar.timeoutMs);
  let res;
  try {
    res = await doFetch(env.solar.chatUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.solar.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.solar.model,
        reasoning_effort: env.solar.reasoningEffort,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err) {
    throw new AppError('E_UPSTREAM_SOLAR', undefined, { cause: err?.message, aborted: controller.signal.aborted });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 🔴 upstream 본문에 문서 내용이 섞일 수 있어 로그에는 길이만 남긴다
    const body = await res.text().catch(() => '');
    throw new AppError('E_UPSTREAM_SOLAR', undefined, { status: res.status, bodyLength: body.length });
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? '';
  const value = extractJson(text);
  if (!value) throw new AppError('E_JUDGE_OUTPUT_INVALID', undefined, { outputLength: text.length });
  logger.info('solar_judge_completed', { model: env.solar.model, usage: json.usage ?? null });
  return value;
}

const runMeta = (started) => ({
  model: env.solar.model,
  reasoningEffort: env.solar.reasoningEffort,
  elapsedMs: Date.now() - started,
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 입력 다이어트 — 판정마다 공고의 «필요한 부분»만 보낸다.
//    실측(2026-08-23, PG 대행 용역 RFP): 공고 해부 결과 전체가 91KB(수행조건 189건·범위 121건 …)라 매 판정에
//    ~7.7만 토큰이 실려 갔고, Solar 가 120초 안에 답을 못 냈다. 자격 판정에 수행조건 189건은 필요 없다.
// ─────────────────────────────────────────────────────────────────────────────

const OVERVIEW_KEYS = ['schema_version', 'document_type', 'document_form', 'procurement_project_name', 'issuer', 'project_period', 'budget', 'bid_method', 'contract_method', 'primary_supplier_role', 'project_objectives', 'source_documents'];
const CONSTRAINT_KEYS = ['constraint_method', 'constraint_deadline', 'constraint_opens_at', 'constraint_place', 'constraint_page_limit', 'constraint_summary_page_limit', 'constraint_price_sealed', 'constraint_proposal_copies', 'constraint_source_page', 'constraint_source_doc'];
const SLICES = {
  eligibility: [...OVERVIEW_KEYS, ...CONSTRAINT_KEYS, 'eligibility_rules'],
  plan: [...OVERVIEW_KEYS, 'constraint_deadline', 'constraint_opens_at', 'requirement_count', 'requirement_summary', 'requirements', 'scope_items', 'execution_context'],
  submission: [...OVERVIEW_KEYS, ...CONSTRAINT_KEYS, 'submission_requirements', 'evaluation_items'],
  // 🔴 임계경로는 «마감 전에 남이 시간을 쓰는 일»이다 — 자격 조항(등록·증명)과 입찰 제출물(유효기간·발급)이 재료. 요구사항 본문은 필요 없다
  criticalPath: [...OVERVIEW_KEYS, ...CONSTRAINT_KEYS, 'requirement_count', 'eligibility_rules', 'submission_requirements'],
};

/** 판정 종류별로 공고에서 필요한 필드만 — 없는 필드는 만들지 않는다 */
export function announcementFor(kind, announcement) {
  const keys = SLICES[kind];
  if (!keys) throw new Error(`unknown slice: ${kind}`);
  const out = {};
  for (const k of keys) if (announcement && announcement[k] !== undefined) out[k] = announcement[k];
  // 계약 후 산출물(COMPLETION 등)은 마감 전 준비가 아니다
  if (kind === 'criticalPath' && Array.isArray(out.submission_requirements)) {
    out.submission_requirements = out.submission_requirements.filter((s) => !s?.submission_stage || s.submission_stage === 'BID');
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 판정 1 — 자격 (화면③④)
// ─────────────────────────────────────────────────────────────────────────────

export async function judgeEligibility({ companyCard, announcement, fetchImpl }) {
  const started = Date.now();
  const out = await callSolar({
    system: loadPrompt('eligibility'),
    user: buildUserMessage([['COMPANY_CARD', companyCard], ['DOCUMENT_INFO', announcementFor('eligibility', announcement)]]),
    fetchImpl,
  });
  return { ...guardEligibility(out, announcement), meta: runMeta(started) };
}

/**
 * 🔴 검산은 백엔드가 다시 센다 — 프롬프트도 세라고 하지만 모델이 틀릴 수 있다.
 * 🔴 규율 — [확인필요]는 제외 사유가 아니다. 근거 쪽이 없는 미충족도 제외 사유가 아니다.
 *    못 읽어서 기회를 지우는 쪽이 잘못 추천하는 쪽보다 나쁘다.
 */
export function guardEligibility(out, announcement) {
  const result = { ...(out ?? {}) };
  const checks = Array.isArray(result.checks) ? result.checks.map((c) => ({ ...c })) : [];

  // 쪽을 지어내지 않는다 — 공고 해부 결과에 있는 쪽만 인정
  const knownPages = new Set((announcement?.eligibility_rules ?? []).map((r) => Number(r.source_page)));
  for (const c of checks) {
    if (!knownPages.has(Number(c.announcement_page))) c.announcement_page = 0;
  }

  const count = (s) => checks.filter((c) => c.status === s).length;
  result.matched_count = count('충족');
  result.failed_count = count('미충족');
  result.unverified_count = count('[확인필요]');

  const groundedHardFail = checks.some((c) =>
    c.gate_level === 'HARD_GATE' && c.mandatory === 'YES'
    && c.status === '미충족' && c.announcement_page > 0);

  if (result.verdict === '제외' && !groundedHardFail) {
    result.verdict = '추천';
    result._meta = { ...(result._meta ?? {}), overridden: 'no-grounded-hard-fail' };
  } else if (result.verdict !== '제외') {
    result.verdict = '추천';   // 제3의 값을 만들지 않는다
  }
  if (result.verdict !== '제외') result.exclusion_reasons = [];
  else if (!Array.isArray(result.exclusion_reasons)) result.exclusion_reasons = [];

  return { ...result, checks };
}

// ─────────────────────────────────────────────────────────────────────────────
// 판정 2·3·4 — 계획: WPS/CP 분해 → WBS → 임계경로·M/M 원가 (화면⑧)
//   🔴 순서가 있다. 앞 판정의 **가드를 거친** 결과가 다음 입력이 된다.
// ─────────────────────────────────────────────────────────────────────────────

export async function judgePlan({ announcement, fetchImpl }) {
  const started = Date.now();
  const doc = announcementFor('plan', announcement);
  const wpsCp = await callSolar({
    system: loadPrompt('wpsCp'),
    user: buildUserMessage([['DOCUMENT_INFO', doc]]),
    fetchImpl,
  });
  const wbs = guardWbs(await callSolar({
    system: loadPrompt('wbs'),
    user: buildUserMessage([['WPS_CP_V1', wpsCp], ['DOCUMENT_INFO', doc]]),
    fetchImpl,
  }), announcement);
  const criticalPath = guardCriticalPath(await callSolar({
    system: loadPrompt('criticalPath'),
    user: buildUserMessage([['WBS_V1', wbs], ['DOCUMENT_INFO', announcementFor('criticalPath', announcement)]]),
    fetchImpl,
  }), wbs, announcement);
  return { wpsCp, wbs, criticalPath, meta: { ...runMeta(started), calls: 3 } };
}

const round1 = (x) => Math.round(x * 10) / 10;
const idOf = (r) => String(r?.requirement_id ?? '').trim();
export const WBS_MAX_REFS = 15;   // 한 패키지에 묶는 요구사항 상한 — 프롬프트와 같은 숫자

/**
 * 🔴 기간은 문서가 말한 것만 — 비어 있으면 정확히 「미 명시」. M/M 은 전부 추천값.
 * 🔴 검산은 공고 요구사항으로 다시 센다. 공고에 없는 요구사항 ID 는 지어낸 것이라 따로 낸다.
 */
export function guardWbs(out, announcement) {
  const result = { ...(out ?? {}) };
  const reqs = Array.isArray(announcement?.requirements) ? announcement.requirements : [];
  const known = new Set(reqs.map(idOf).filter(Boolean));
  const primaryIds = reqs
    .filter((r) => !r.scope_role || r.scope_role === 'PRIMARY_CONTRACT')
    .map(idOf).filter(Boolean);

  const packages = (Array.isArray(result.work_packages) ? result.work_packages : []).map((p) => ({
    ...p,
    duration: typeof p?.duration === 'string' && p.duration.trim() ? p.duration.trim() : '미 명시',
    effort_mm: (Array.isArray(p?.effort_mm) ? p.effort_mm : [])
      .map((e) => ({ grade: String(e?.grade ?? '').trim(), mm: round1(Number(e?.mm) || 0) }))
      .filter((e) => e.grade),
    predecessors: Array.isArray(p?.predecessors) ? p.predecessors : [],
    requirement_refs: (Array.isArray(p?.requirement_refs) ? p.requirement_refs : []).map((x) => String(x).trim()).filter(Boolean),
    is_recommendation: true,
    source_page: Number(p?.source_page) || 0,
  }));

  const linked = new Set();
  const unknown = new Set();
  for (const p of packages) for (const r of p.requirement_refs) (known.has(r) ? linked : unknown).add(r);

  result.work_packages = packages;
  result.validation = {
    ...(result.validation ?? {}),
    primary_requirement_count: primaryIds.length,
    linked_requirement_count: primaryIds.filter((id) => linked.has(id)).length,
    unlinked_requirement_ids: primaryIds.filter((id) => !linked.has(id)),
    packages_without_requirement: packages
      .filter((p) => !p.requirement_refs.some((r) => known.has(r)))
      .map((p) => p.wbs_id),
    unknown_requirement_refs: [...unknown],
    // 🔴 실측: 첫 패키지가 요구사항 50개를 한 행에 묶었다 — 쪼개야 할 패키지를 센다 (프롬프트 상한 15)
    oversized_packages: packages.filter((p) => p.requirement_refs.length > WBS_MAX_REFS).map((p) => ({ wbs_id: p.wbs_id, count: p.requirement_refs.length })),
  };
  return result;
}

/**
 * 🔴 임계경로는 «마감 전에 끝나 있어야 하는 준비»다. 리드타임을 지어내지 않는다 — 0 이면 [확인필요].
 * 🔴 severity 는 화면 tone 어휘(danger/warn/default)로, 리드타임에서 결정한다 — 모델의 낱말을 믿지 않는다.
 * 🔴 원가는 WBS 의 effort_mm 을 합산한 M/M 이다. 투찰가가 아니고, 단가 없이 금액으로 바꾸지 않는다.
 */
// ── 임계경로가 비어 오면 공고에서 채운다 ──
//    실측(2026-08-23, PG 대행 용역): 공고가 처리기간을 명시하지 않으면 Solar 가 0건을 돌려줬고 화면이 비었다.
//    🔴 리드타임은 여전히 지어내지 않는다([확인필요]). 다만 «무엇을 준비해야 하는지»는 공고가 말하고 있다 —
//    등록·증명·확인서가 걸린 자격 조항과, 유효기간·발급이 걸린 입찰 제출물. 마감 자체는 날짜가 있으니 그대로 적는다.
const PREP_RULE = /(등록|신고|지정|증명서|확인서|인증|면허|허가)/;
const NOT_PREP = /(아니한|아닌|없는|없을|배제|제한|금지)/;
const PREP_DOC = /(보증|증권|등록증|확인서|증명서|인감|신고서|지정서|면허|허가증|납세)/;
const shortLabel = (s) => text(s).replace(/\s+/g, ' ').trim().replace(/[.。]$/, '').slice(0, 48);

export function synthesizeCriticalPath(ann) {
  const items = [];
  const deadline = text(ann?.constraint_deadline).trim();
  const method = text(ann?.constraint_method).split(/[,·(（]/)[0].trim();
  items.push({
    item: `입찰서·제안서 제출 마감${method ? ` (${method})` : ''}`,
    lead_time_days: 0, due_label: deadline || '[확인필요]', severity: 'danger',
    blocking_reason: '마감 후 제출은 무효', source_page: Number(ann?.constraint_source_page) || 0, synthesized: true,
  });
  const seen = new Set();
  const push = (item, extra) => { const k = item.replace(/\s+/g, ''); if (seen.has(k)) return; seen.add(k); items.push({ item, lead_time_days: 0, due_label: '[확인필요]', severity: 'default', synthesized: true, ...extra }); };
  for (const r of Array.isArray(ann?.eligibility_rules) ? ann.eligibility_rules : []) {
    const cond = text(r?.condition); const type = text(r?.rule_type);
    if (type === 'RESTRICTION' || NOT_PREP.test(cond)) continue;
    if (!(type === 'REGISTRATION' || type === 'CERTIFICATE' || PREP_RULE.test(cond))) continue;
    push(`${shortLabel(cond)} — 등록·증빙 준비`, { blocking_reason: '입찰참가자격 — 갖추지 못하면 입찰 무효', source_page: Number(r?.source_page) || 0, rule_id: text(r?.rule_id) });
  }
  for (const s of Array.isArray(ann?.submission_requirements) ? ann.submission_requirements : []) {
    if (s?.submission_stage && s.submission_stage !== 'BID') continue;
    const name = shortLabel(s?.name); const validity = text(s?.validity_basis).trim();
    if (!name || !(validity || PREP_DOC.test(name))) continue;
    push(`${name} 발급·준비`, { blocking_reason: validity ? `유효기간: ${validity}` : '발급 기관의 처리기간이 걸린다', source_page: Number(s?.source_page) || 0 });
  }
  return items.slice(0, 10);
}

export function guardCriticalPath(out, wbs, announcement) {
  const result = { ...(out ?? {}) };

  const given = Array.isArray(result.critical_path) ? result.critical_path : [];
  if (given.length === 0 && announcement) {
    result.synthesized = true;
    result.synthesized_note = '공고가 처리기간을 명시하지 않아 리드타임은 [확인필요] — 항목은 자격 조항·제출 서류에서 뽑았습니다';
  }
  // 🔴 마감은 임계경로의 기준선이다 — Solar 가 빠뜨려도 공고의 마감 날짜를 맨 위에 둔다 (날짜가 있을 때만)
  const base = given.length ? given : (announcement ? synthesizeCriticalPath(announcement) : []);
  const hasDeadlineRow = base.some((c) => /마감/.test(text(c?.item)));
  const deadlineRow = announcement && !hasDeadlineRow && text(announcement.constraint_deadline).trim() ? [synthesizeCriticalPath(announcement)[0]] : [];
  result.critical_path = [...deadlineRow, ...base]
    .map((c) => {
      const lead = Math.max(0, Math.round(Number(c?.lead_time_days) || 0));
      // 채워 넣은 마감 줄은 날짜가 곧 라벨이다 — 「N일 전」으로 바꾸지 않는다
      const isDeadline = c?.synthesized && lead === 0 && text(c?.due_label) && c.due_label !== '[확인필요]';
      return {
        ...c,
        lead_time_days: lead,
        due_label: isDeadline ? c.due_label : (lead > 0 ? `${lead}일 전` : '[확인필요]'),
        severity: isDeadline ? 'danger' : (lead >= 7 ? 'danger' : lead >= 3 ? 'warn' : 'default'),
        source_page: Number(c?.source_page) || 0,
      };
    });
  // 리드타임 내림차순 — 단, 마감 줄은 항상 맨 위
  const deadlineRows = result.critical_path.filter((c) => c.synthesized && /마감/.test(text(c.item)));
  const rest = result.critical_path.filter((c) => !deadlineRows.includes(c)).sort((a, b) => b.lead_time_days - a.lead_time_days);
  result.critical_path = [...deadlineRows, ...rest];

  const byGrade = new Map();
  for (const p of wbs?.work_packages ?? []) {
    for (const e of p.effort_mm ?? []) byGrade.set(e.grade, round1((byGrade.get(e.grade) ?? 0) + (Number(e.mm) || 0)));
  }
  const by_grade = [...byGrade].map(([grade, mm]) => ({ grade, mm }));
  const cost = result.cost_estimate ?? {};
  result.cost_estimate = {
    ...cost,
    total_mm: round1(by_grade.reduce((s, g) => s + g.mm, 0)),
    by_grade,
    is_recommendation: true,
    not_a_bid_price: true,
    amount_convertible: false,
    amount_note: typeof cost.amount_note === 'string' && cost.amount_note.trim()
      ? cost.amount_note : '단가 미입력 — 회사 카드에 등급별 단가가 있을 때만 환산한다',
    // 근거가 없으면 공고의 예산을 근거로 — 쪽은 모르니 0 (화면이 p0 를 찍지 않는다)
    references: Array.isArray(cost.references) && cost.references.length
      ? cost.references
      : (text(announcement?.budget).trim() ? [{ label: `예산 ${text(announcement.budget).trim()}`, page: 0 }] : []),
  };
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 판정 5 — 제출 검사 (화면⑨). Studio 의 4노드 체인을 3호출로:
//   규칙(공고) ∥ 스캔(제안서 원고) → 검사(규칙 + 스캔 + 회사 카드 documents[])
//   🔴 summarize-company-document 노드는 건너뛴다 — 회사 카드가 같은 사실을 갖고 있다
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param rules   이미 뽑아 둔 SUBMISSION_RULES_V2 — 있으면 규칙 호출을 건너뛴다 (서류를 올릴 때마다 공고 규칙을 다시 살 이유가 없다)
 * @param uploads 이 케이스에 올린 제출 파일 — 검사가 파일을 빠뜨려도 가드가 requirement 이름으로 연결한다
 */
export async function judgeSubmission({ announcement, companyCard, proposalText, rules: givenRules, uploads = [], fetchImpl }) {
  const started = Date.now();
  const hasProposal = typeof proposalText === 'string' && proposalText.trim().length > 0;
  const reuseRules = Boolean(givenRules && typeof givenRules === 'object');

  const [rules, proposalScan] = await Promise.all([
    reuseRules ? Promise.resolve(givenRules) : callSolar({
      system: loadPrompt('submissionRules'),
      user: buildUserMessage([['DOCUMENT_INFO', announcementFor('submission', announcement)]]),
      fetchImpl,
    }),
    hasProposal
      ? callSolar({
        system: loadPrompt('proposalScan'),
        user: buildUserMessage([['PROPOSAL_TEXT', proposalText]]),
        fetchImpl,
      })
      : Promise.resolve(null),
  ]);

  const audit = guardSubmissionAudit(await callSolar({
    system: loadPrompt('submissionAudit'),
    user: buildUserMessage([
      ['SUBMISSION_RULES_V2', rules],
      // 🔴 없는 것을 통과로 바꾸지 않는다 — 없다는 사실을 그대로 넣는다
      ['PROPOSAL_SCAN_V1', proposalScan ?? { absent: true, reason: '제안서 원고 미제출' }],
      ['COMPANY_DOCUMENT_SUMMARY_V2', Array.isArray(companyCard?.documents) ? companyCard.documents : companyCard],
    ]),
    fetchImpl,
  }), { proposalScan, uploads });

  return { rules, proposalScan, audit, meta: { ...runMeta(started), calls: (reuseRules ? 0 : 1) + (hasProposal ? 1 : 0) + 1, rulesReused: reuseRules } };
}

const DOC_STATUS = new Set(['준비됨', '보완 필요', '미확인']);
const text = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * 🔴 상태는 셋뿐 — 준비됨 / 보완 필요 / 미확인. 모르는 값(UNKNOWN 등)은 미확인이지 보완 필요가 아니다.
 * 🔴 개수·보완요청·overall_status 는 documents[] 에서 다시 만든다.
 * 🔴 금지 표현은 제안서 스캔의 실제 적중으로 다시 센다. 제안서가 없으면 0건 + 미제출 사유 — 통과가 아니다.
 */
export function guardSubmissionAudit(out, { proposalScan, uploads = [] } = {}) {
  const result = { ...(out ?? {}) };
  // 🔴 사람이 「이 서류용」이라고 올린 파일은 검사가 빠뜨려도 연결한다 — 상태(준비됨/보완 필요/미확인)는 검사의 판단 그대로 둔다
  const squash = (v) => text(v).replace(/\s+/g, '');
  const uploadFor = (name) => uploads.find((u) => u.requirementName && (squash(u.requirementName) === squash(name) || squash(name).includes(squash(u.requirementName)) || squash(u.requirementName).includes(squash(name))));
  if (Array.isArray(result.documents)) {
    result.documents = result.documents.map((d) => {
      const up = uploadFor(d?.name);
      return up && !text(d?.matched_file) ? { ...d, matched_file: up.filename } : d;
    });
  }

  const documents = (Array.isArray(result.documents) ? result.documents : []).map((d) => {
    const status = DOC_STATUS.has(d?.status) ? d.status : '미확인';
    return {
      ...d,
      name: text(d?.name),
      copies: text(d?.copies),
      validity: text(d?.validity),
      status,
      rework_note: status === '보완 필요' ? text(d?.rework_note) : '',
      lead_time: text(d?.lead_time),
      matched_file: text(d?.matched_file),
      source_page: Number(d?.source_page) || 0,
    };
  });

  const count = (s) => documents.filter((d) => d.status === s).length;
  const summary = {
    ...(result.summary ?? {}),
    required_document_count: documents.length,
    ready_count: count('준비됨'),
    rework_count: count('보완 필요'),
    unverified_count: count('미확인'),
  };

  const previous = Array.isArray(result.rework_requests) ? result.rework_requests : [];
  const rework_requests = documents
    .filter((d) => d.status === '보완 필요')
    .map((d) => ({
      document: d.name,
      reason: d.rework_note,
      action: text(previous.find((r) => r?.document === d.name)?.action) || '보완 자료 올리기',
    }));

  const fe = result.forbidden_expressions ?? {};
  const ruleItems = Array.isArray(fe.items) ? fe.items : [];
  const hits = Array.isArray(proposalScan?.forbidden_expression_hits) ? proposalScan.forbidden_expression_hits : null;
  const forbidden_expressions = hits
    ? {
      count: hits.length,
      rule_note: text(fe.rule_note),
      items: hits.map((h) => ({
        expression: text(h?.expression),
        sentence: text(h?.sentence),
        proposal_page: Number(h?.page) || 0,
        rule_source_page: Number(ruleItems.find((i) => i?.expression === h?.expression)?.rule_source_page) || 0,
      })),
    }
    : { count: 0, rule_note: '제안서 원고 미제출', items: [] };

  return {
    ...result,
    documents,
    summary,
    rework_requests,
    forbidden_expressions,
    uncovered_requirement_ids: Array.isArray(result.uncovered_requirement_ids) ? result.uncovered_requirement_ids : [],
    overall_status: summary.rework_count > 0 ? 'NEEDS_REWORK' : summary.unverified_count > 0 ? 'NEEDS_REVIEW' : 'READY',
  };
}
