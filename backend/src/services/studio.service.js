import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

/**
 * Upstage Studio 에이전트 호출. 2026-08-22 실호출로 확인된 경로:
 *
 *   1) POST {base}/v2/files          multipart(file, purpose=assistants)  → file_id
 *   2) POST {base}/v2/responses      { model: agentId, input:[input_file] } → job_... (in_progress)
 *   3) GET  {base}/v2/responses/{id} 폴링 → completed
 *
 * 🔴 webhook이 없다 — 폴링 확정.
 * 🔴 결과 JSON은 output[].content[].text 에 **문자열**로 들어온다.
 * 🟢 같은 content[].additional_values 에 필드별 confidence · page · coordinates가 실려 온다.
 *    「모든 판정에 쪽 번호」 규율의 원천이 여기다.
 */
const V2 = () => `${env.studio.baseUrl}/v2`;
const auth = () => ({ Authorization: `Bearer ${env.studio.apiKey}` });

export function isConfigured() {
  return Boolean(env.studio.apiKey);
}

function assertConfigured() {
  if (!isConfigured()) throw new AppError('E_NOT_CONFIGURED', 'UPSTAGE_API_KEY가 설정되지 않아 문서를 분석할 수 없습니다.');
}

export async function uploadFile({ buffer, filename, mimeType = 'application/pdf' }) {
  assertConfigured();
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('purpose', 'assistants');

  const res = await fetch(`${V2()}/files`, { method: 'POST', headers: auth(), body: form });
  if (!res.ok) {
    throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'upload', status: res.status, body: await res.text().catch(() => '') });
  }
  const json = await res.json();
  logger.info('studio_file_uploaded', { fileId: json.id, bytes: json.bytes });
  return json.id;
}

export async function runAgent({ agentId, fileId }) {
  assertConfigured();
  const res = await fetch(`${V2()}/responses`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: agentId,
      input: [{ role: 'user', content: [{ type: 'input_file', file_id: fileId }] }],
    }),
  });
  if (!res.ok) {
    throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'run', agentId, status: res.status, body: await res.text().catch(() => '') });
  }
  const json = await res.json();
  logger.info('studio_job_started', { jobId: json.id, agentId, status: json.status });
  return json;
}

const TERMINAL = new Set(['completed', 'failed', 'incomplete', 'cancelled']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function pollResponse(jobId, { intervalMs = env.studio.pollIntervalMs, timeoutMs = env.studio.pollTimeoutMs, onTick } = {}) {
  assertConfigured();
  const deadline = Date.now() + timeoutMs;

  for (let tick = 0; ; tick += 1) {
    const res = await fetch(`${V2()}/responses/${jobId}`, { headers: auth() });
    if (!res.ok) throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'poll', jobId, status: res.status });

    const job = await res.json();
    onTick?.(job, tick);

    if (job.status === 'completed') return job;
    if (TERMINAL.has(job.status)) {
      throw new AppError('E_UPSTREAM_STUDIO', '문서 분석이 완료되지 못했습니다. 다른 파일로 다시 시도해 주세요.',
        { stage: 'poll', jobId, status: job.status, error: job.error });
    }
    if (Date.now() > deadline) {
      throw new AppError('E_STUDIO_TIMEOUT', undefined, { jobId, timeoutMs });
    }
    await sleep(intervalMs);
  }
}

/**
 * 에이전트 응답에서 추출 JSON과 필드 메타를 꺼낸다.
 * 🔴 JSON 파싱이 실패해도 던지지 않는다 — 원문을 raw로 넘겨 사람이 볼 수 있게 한다.
 */
export function parseAgentOutput(job) {
  const messages = (job.output ?? []).filter((o) => o.type === 'message');
  const part = messages.flatMap((m) => (m.content ?? []).map((c) => ({ ...c, stepModel: m.model })))
    .findLast((c) => c.type === 'output_text');

  if (!part) return { data: null, raw: null, fields: {}, stepModel: null };

  let data = null;
  try { data = JSON.parse(part.text); } catch { /* raw로 넘긴다 */ }

  // additional_values: 필드별 { _value, confidence, page, coordinates } + 실행 메타
  let extras = {};
  try {
    extras = typeof part.additional_values === 'string' ? JSON.parse(part.additional_values) : (part.additional_values ?? {});
  } catch { extras = {}; }

  const RESERVED = new Set(['previous_step_name', 'step_run_id', 'occurrence_id', 'job_execution_id', 'cache_hit']);
  const fields = {};
  for (const [k, v] of Object.entries(extras)) {
    if (RESERVED.has(k) || v === null || typeof v !== 'object') continue;
    fields[k] = {
      confidence: v.confidence ?? 'unknown',
      page: typeof v.page === 'number' ? v.page : 0,
      ...(v.coordinates ? { coordinates: v.coordinates } : {}),
    };
  }

  return { data, raw: part.text, fields, stepModel: part.stepModel ?? null, cacheHit: extras.cache_hit ?? null };
}

/**
 * 필드 하나라도 low면 전체를 low로 본다 — 🔴 낙관하지 않는다.
 * 🔴 배열 필드에는 confidence가 실려 오지 않아 unknown이 남는다. 그 수를 숨기지 않고 counts로 낸다 —
 *    화면이 「16개 중 low 1건」처럼 쓸 수 있어야 하고, 그게 unknown 한 단어보다 정직하다.
 */
export function rollupConfidence(fields) {
  const values = Object.values(fields).map((f) => f.confidence);
  if (values.length === 0) return 'unknown';
  if (values.includes('low')) return 'low';
  if (values.every((v) => v === 'high')) return 'high';
  return 'unknown';
}

export function confidenceCounts(fields) {
  const counts = { high: 0, low: 0, unknown: 0 };
  for (const f of Object.values(fields)) {
    counts[f.confidence in counts ? f.confidence : 'unknown'] += 1;
  }
  return counts;
}

/** 업로드 → 실행 → 폴링 → 파싱을 한 번에 */
export async function extractWithAgent({ agentId, buffer, filename, mimeType, onTick }) {
  const fileId = await uploadFile({ buffer, filename, mimeType });
  const started = await runAgent({ agentId, fileId });
  const job = await pollResponse(started.id, { onTick });
  return { jobId: started.id, fileId, ...parseAgentOutput(job) };
}
