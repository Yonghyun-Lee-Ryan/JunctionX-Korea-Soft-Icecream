import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

/**
 * Upstage Studio Agents API 프록시.
 * 🔴 webhook이 없다 — 폴링 확정. 처리는 「보통 분 단위」.
 * 🔴 키가 없으면 throw하지 않고 { configured:false }를 준다. 호출부가 캐시로 떨어진다.
 */
export function isConfigured() {
  return Boolean(env.studio.apiKey && env.studio.agentId);
}

function headers(extra = {}) {
  return { Authorization: `Bearer ${env.studio.apiKey}`, ...extra };
}

export async function uploadFile({ filename, buffer, contentType = 'application/octet-stream' }) {
  if (!isConfigured()) throw new AppError('E_NOT_CONFIGURED');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: contentType }), filename);

  const res = await fetch(`${env.studio.baseUrl}/v1/agents/files`, { method: 'POST', headers: headers(), body: form });
  if (!res.ok) throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'upload', status: res.status, filename });
  return res.json();
}

export async function createJob({ fileIds, agentId = env.studio.agentId, configVersion = env.studio.configVersion }) {
  if (!isConfigured()) throw new AppError('E_NOT_CONFIGURED');
  const res = await fetch(`${env.studio.baseUrl}/v1/agents/jobs`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ agent_id: agentId, file_ids: fileIds, ...(configVersion ? { config_id: configVersion } : {}) }),
  });
  if (!res.ok) throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'createJob', status: res.status });
  return res.json();
}

export async function getJob(jobId) {
  if (!isConfigured()) throw new AppError('E_NOT_CONFIGURED');
  const res = await fetch(`${env.studio.baseUrl}/v1/agents/jobs/${jobId}`, { headers: headers() });
  if (!res.ok) throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'getJob', status: res.status, jobId });
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {(job:object)=>void} [onTick] 매 폴링마다. progress[] 갱신을 여기서 한다
 */
export async function pollJob(jobId, { onTick, intervalMs = env.studio.pollIntervalMs, timeoutMs = env.studio.pollTimeoutMs } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await getJob(jobId);
    onTick?.(job);
    const status = String(job.status ?? '').toLowerCase();
    if (['succeeded', 'completed', 'done'].includes(status)) return job;
    if (['failed', 'error', 'cancelled'].includes(status)) {
      throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'poll', jobId, status });
    }
    if (Date.now() > deadline) {
      logger.warn('studio_poll_timeout', { jobId, timeoutMs });
      throw new AppError('E_UPSTREAM_STUDIO', '문서 분석이 예상보다 오래 걸립니다. 저장된 결과를 보여 드립니다.', { jobId });
    }
    await sleep(intervalMs);
  }
}
