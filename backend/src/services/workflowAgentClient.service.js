import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';

const TERMINAL_FAILURES = new Set([
  'failed',
  'cancelled',
  'canceled',
  'expired',
  'incomplete',
]);
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function v2Base() {
  const base = env.workflowAgents.baseUrl.replace(/\/+$/u, '');
  return base.endsWith('/v2') ? base : `${base}/v2`;
}

function assertClientConfigured() {
  if (!env.workflowAgents.apiKey) throw new AppError('E_AGENT_API_NOT_CONFIGURED');
}

function authHeaders() {
  return { Authorization: `Bearer ${env.workflowAgents.apiKey}` };
}

function retryDelay(response, attempt) {
  const retryAfter = Number.parseFloat(response.headers.get('retry-after') ?? '');
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
  return Math.min(250 * (2 ** attempt), 4000);
}

async function requestJson(
  url,
  makeOptions,
  { stage, maxAttempts = 1, timeoutMs = env.workflowAgents.pollTimeoutMs } = {},
) {
  let lastStatus = null;
  const deadline = Date.now() + Math.max(1, timeoutMs);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new AppError('E_STUDIO_TIMEOUT', undefined, { stage, timeoutMs });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    let response;
    try {
      response = await fetch(url, { ...makeOptions(), signal: controller.signal });

      if (response.ok) {
        try {
          return await response.json();
        } catch (err) {
          throw new AppError('E_UPSTREAM_STUDIO', undefined, {
            stage,
            status: response.status,
            cause: `invalid JSON response: ${err?.message}`,
          });
        }
      }

      lastStatus = response.status;
      if (TRANSIENT_STATUSES.has(response.status) && attempt + 1 < maxAttempts) {
        const delayMs = retryDelay(response, attempt);
        clearTimeout(timeout);
        const retryRemainingMs = deadline - Date.now();
        if (retryRemainingMs <= 0) {
          throw new AppError('E_STUDIO_TIMEOUT', undefined, { stage, timeoutMs });
        }
        await sleep(Math.min(delayMs, retryRemainingMs));
        continue;
      }

      // Upstream 본문에 문서 내용이 섞일 수 있어 로그 detail에는 길이만 남긴다.
      const body = await response.text().catch(() => '');
      let upstreamErrorCode;
      try {
        upstreamErrorCode = JSON.parse(body)?.error?.code;
      } catch {
        // JSON 오류 본문이 아니면 길이만 기록한다.
      }
      throw new AppError('E_UPSTREAM_STUDIO', undefined, {
        stage,
        status: response.status,
        bodyLength: body.length,
        upstreamErrorCode,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (controller.signal.aborted) {
        throw new AppError('E_STUDIO_TIMEOUT', undefined, { stage, timeoutMs });
      }
      if (attempt + 1 < maxAttempts) {
        clearTimeout(timeout);
        const retryRemainingMs = deadline - Date.now();
        if (retryRemainingMs <= 0) {
          throw new AppError('E_STUDIO_TIMEOUT', undefined, { stage, timeoutMs });
        }
        await sleep(Math.min(250 * (2 ** attempt), 4000, retryRemainingMs));
        continue;
      }
      throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage, cause: err?.message });
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage, status: lastStatus });
}

function nestedObjects(payload) {
  const values = [payload];
  for (const key of ['data', 'response', 'result']) {
    if (payload?.[key] && typeof payload[key] === 'object') values.push(payload[key]);
  }
  return values;
}

function firstIdentifier(payload, keys) {
  for (const object of nestedObjects(payload)) {
    for (const key of keys) {
      if (typeof object[key] === 'string' && object[key]) return object[key];
    }
  }
  return null;
}

export function collectAgentOutputTexts(payload) {
  const texts = [];
  for (const object of nestedObjects(payload ?? {})) {
    if (Array.isArray(object.output)) {
      for (const item of object.output) {
        const messageText = (item?.content ?? [])
          .map((part) => (typeof part?.text === 'string' ? part.text : ''))
          .filter((text) => text.trim())
          // content part가 JSON 문자열 한가운데에서 나뉠 수 있으므로 문자를 추가하지 않는다.
          .join('');
        if (messageText) texts.push(messageText);
      }
    }
    for (const key of ['output_text', 'text']) {
      if (typeof object[key] === 'string' && object[key].trim()) texts.push(object[key]);
    }
  }
  return texts;
}

async function uploadAgentFile({ buffer, filename, mimeType }) {
  const payload = await requestJson(
    `${v2Base()}/files`,
    () => {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename);
      form.append('purpose', 'user_data');
      return { method: 'POST', headers: authHeaders(), body: form };
    },
    { stage: 'agent_file_upload' },
  );
  const fileId = firstIdentifier(payload, ['id', 'file_id']);
  if (!fileId) throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'agent_file_upload', cause: 'missing file id' });
  logger.info('workflow_agent_file_uploaded', { fileId, filename, bytes: buffer.length });
  return fileId;
}

async function createAgentJob({ fileId, agentId, configId }) {
  const body = {
    model: agentId,
    input: [{ role: 'user', content: [{ type: 'input_file', file_id: fileId }] }],
    include: ['last'],
  };
  if (configId) body.config_id = configId;

  const payload = await requestJson(
    `${v2Base()}/responses`,
    () => ({
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { stage: 'agent_job_create' },
  );
  const jobId = firstIdentifier(payload, ['id', 'job_id', 'response_id']);
  if (!jobId) throw new AppError('E_UPSTREAM_STUDIO', undefined, { stage: 'agent_job_create', cause: 'missing job id' });
  return { jobId, payload };
}

async function pollAgentJob(jobId) {
  const deadline = Date.now() + env.workflowAgents.pollTimeoutMs;
  for (let tick = 0; ; tick += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new AppError('E_STUDIO_TIMEOUT', undefined, {
        stage: 'agent_job_poll',
        jobId,
        timeoutMs: env.workflowAgents.pollTimeoutMs,
      });
    }
    const url = new URL(`${v2Base()}/responses/${encodeURIComponent(jobId)}`);
    url.searchParams.append('include[]', 'last');
    const payload = await requestJson(
      url.toString(),
      () => ({ headers: authHeaders() }),
      {
        stage: 'agent_job_poll',
        maxAttempts: 5,
        timeoutMs: remainingMs,
      },
    );
    const status = payload.status ?? payload.data?.status ?? payload.response?.status;
    if (status === 'completed') return payload;
    if (TERMINAL_FAILURES.has(status)) {
      throw new AppError('E_UPSTREAM_STUDIO', 'Agent 작업이 완료되지 못했습니다. 파일을 확인하고 다시 시도해 주세요.', {
        stage: 'agent_job_poll',
        jobId,
        status,
        upstreamErrorCode: payload.error?.code,
      });
    }
    const sleepBudgetMs = deadline - Date.now();
    if (sleepBudgetMs <= 0) {
      throw new AppError('E_STUDIO_TIMEOUT', undefined, { jobId, timeoutMs: env.workflowAgents.pollTimeoutMs });
    }
    logger.debug('workflow_agent_poll', { jobId, tick, status });
    await sleep(Math.min(env.workflowAgents.pollIntervalMs, sleepBudgetMs));
  }
}

async function completeAgentJob({ agentId, configId, fileId, started }) {
  const startedStatus = started.payload.status ?? started.payload.data?.status;
  const job = startedStatus === 'completed' && collectAgentOutputTexts(started.payload).length > 0
    ? started.payload
    : await pollAgentJob(started.jobId);
  const texts = collectAgentOutputTexts(job);
  if (texts.length === 0) {
    throw new AppError('E_AGENT_OUTPUT_INVALID', undefined, { jobId: started.jobId, cause: 'missing output text' });
  }
  logger.info('workflow_agent_completed', { agentId, fileId, jobId: started.jobId, outputParts: texts.length });
  return { agentId, configId, fileId, jobId: started.jobId, texts };
}

/** 신규 전용 키로 파일 1개를 Agent에 보내고 최종 output text들을 반환한다. */
export async function executeWorkflowAgent({ agentId, configId, buffer, filename, mimeType }) {
  assertClientConfigured();
  if (!agentId) throw new AppError('E_AGENT_NOT_SET');

  const fileId = await uploadAgentFile({ buffer, filename, mimeType });
  const started = await createAgentJob({ fileId, agentId, configId });
  logger.info('workflow_agent_started', {
    agentId,
    configId: configId || undefined,
    fileId,
    jobId: started.jobId,
  });
  return completeAgentJob({ agentId, configId, fileId, started });
}

/** 원본 파일을 한 번 업로드하고 동일한 file_id로 여러 Agent를 병렬 실행한다. */
export async function executeWorkflowAgents({ agents, buffer, filename, mimeType }) {
  assertClientConfigured();
  if (!Array.isArray(agents) || agents.length === 0 || agents.some(({ agentId }) => !agentId)) {
    throw new AppError('E_AGENT_NOT_SET');
  }

  const fileId = await uploadAgentFile({ buffer, filename, mimeType });
  const startedJobs = [];
  for (const { agentId, configId, key } of agents) {
    const started = await createAgentJob({ fileId, agentId, configId });
    logger.info('workflow_agent_started', {
      key,
      agentId,
      configId: configId || undefined,
      fileId,
      jobId: started.jobId,
    });
    startedJobs.push({ agentId, configId, key, started });
  }
  return Promise.all(startedJobs.map(async ({ agentId, configId, key, started }) => ({
    key,
    ...await completeAgentJob({ agentId, configId, fileId, started }),
  })));
}
