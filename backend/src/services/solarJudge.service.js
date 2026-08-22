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
    .map(([label, value]) => `===== ${label} =====\n${JSON.stringify(value, null, 2)}`)
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
    throw new AppError('E_NOT_CONFIGURED', 'Solar API 키(UPSTAGE_API_KEY)가 설정되지 않아 판정을 실행할 수 없습니다.');
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
// 판정 1 — 자격 (화면③④)
// ─────────────────────────────────────────────────────────────────────────────

export async function judgeEligibility({ companyCard, announcement, fetchImpl }) {
  const started = Date.now();
  const out = await callSolar({
    system: loadPrompt('eligibility'),
    user: buildUserMessage([['COMPANY_CARD', companyCard], ['DOCUMENT_INFO', announcement]]),
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
  const wpsCp = await callSolar({
    system: loadPrompt('wpsCp'),
    user: buildUserMessage([['DOCUMENT_INFO', announcement]]),
    fetchImpl,
  });
  const wbs = guardWbs(await callSolar({
    system: loadPrompt('wbs'),
    user: buildUserMessage([['WPS_CP_V1', wpsCp], ['DOCUMENT_INFO', announcement]]),
    fetchImpl,
  }), announcement);
  const criticalPath = guardCriticalPath(await callSolar({
    system: loadPrompt('criticalPath'),
    user: buildUserMessage([['WBS_V1', wbs], ['DOCUMENT_INFO', announcement]]),
    fetchImpl,
  }), wbs);
  return { wpsCp, wbs, criticalPath, meta: { ...runMeta(started), calls: 3 } };
}

const round1 = (x) => Math.round(x * 10) / 10;
const idOf = (r) => String(r?.requirement_id ?? '').trim();

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
  };
  return result;
}

/**
 * 🔴 임계경로는 «마감 전에 끝나 있어야 하는 준비»다. 리드타임을 지어내지 않는다 — 0 이면 [확인필요].
 * 🔴 severity 는 화면 tone 어휘(danger/warn/default)로, 리드타임에서 결정한다 — 모델의 낱말을 믿지 않는다.
 * 🔴 원가는 WBS 의 effort_mm 을 합산한 M/M 이다. 투찰가가 아니고, 단가 없이 금액으로 바꾸지 않는다.
 */
export function guardCriticalPath(out, wbs) {
  const result = { ...(out ?? {}) };

  result.critical_path = (Array.isArray(result.critical_path) ? result.critical_path : [])
    .map((c) => {
      const lead = Math.max(0, Math.round(Number(c?.lead_time_days) || 0));
      return {
        ...c,
        lead_time_days: lead,
        due_label: lead > 0 ? `${lead}일 전` : '[확인필요]',
        severity: lead >= 7 ? 'danger' : lead >= 3 ? 'warn' : 'default',
        source_page: Number(c?.source_page) || 0,
      };
    })
    .sort((a, b) => b.lead_time_days - a.lead_time_days);

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
    references: Array.isArray(cost.references) ? cost.references : [],
  };
  return result;
}
