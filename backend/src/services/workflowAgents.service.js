import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import {
  extractJsonFromTexts,
  mergeAnnouncementData,
} from './agentOutput.service.js';
import {
  executeWorkflowAgent,
  executeWorkflowAgents,
} from './workflowAgentClient.service.js';

function requireFile(file) {
  if (!file?.buffer || !file?.filename) {
    throw new AppError('E_FILE_REQUIRED', '분석할 파일을 올려 주세요.');
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Upstage Files API가 거부하는 JSON/TXT 계열은 내용 보존 HTML로 감싸서 보낸다. */
export function normalizeAgentInputFile(file) {
  const extension = file.filename.split('.').at(-1)?.toLowerCase();
  const textual = file.mimeType?.startsWith('text/')
    || ['json', 'txt', 'md', 'csv', 'xml'].includes(extension)
    || ['application/json', 'application/xml'].includes(file.mimeType);
  if (!textual || file.mimeType === 'text/html' || extension === 'html' || extension === 'htm') {
    return file;
  }

  const stem = file.filename.replace(/\.[^.]+$/u, '');
  const source = file.buffer.toString('utf8');
  const html = [
    '<!doctype html>',
    '<html lang="ko"><head><meta charset="utf-8"><title>Agent input</title></head>',
    `<body><pre>${escapeHtml(source)}</pre></body></html>`,
  ].join('');
  return {
    ...file,
    buffer: Buffer.from(html, 'utf8'),
    filename: `${stem}.html`,
    mimeType: 'text/html',
  };
}

function strictJsonOutput(texts, agentName, { objectOnly = false } = {}) {
  const value = extractJsonFromTexts(texts, { objectOnly });
  if (value === null) {
    throw new AppError('E_AGENT_OUTPUT_INVALID', `${agentName} Agent가 올바른 JSON을 반환하지 않았습니다.`, {
      agentName,
      outputLength: texts.reduce((total, text) => total + text.length, 0),
    });
  }
  return value;
}

async function callDirectAgent(file, config, { json, name, execute }) {
  requireFile(file);
  const normalized = normalizeAgentInputFile(file);
  const result = await execute({
    agentId: config.agentId,
    configId: config.configId,
    buffer: normalized.buffer,
    filename: normalized.filename,
    mimeType: normalized.mimeType,
  });
  if (json) return strictJsonOutput(result.texts, name);
  const rawOutput = result.texts.at(-1)?.trim();
  let output = rawOutput;
  try {
    const parsed = JSON.parse(rawOutput);
    if (typeof parsed === 'string') output = parsed.trim();
  } catch {
    // plain text GO/NO-GO도 정상 형식이다.
  }
  if (output !== 'GO' && output !== 'NO-GO') {
    throw new AppError('E_AGENT_OUTPUT_INVALID', `${name} Agent가 GO 또는 NO-GO를 반환하지 않았습니다.`, {
      outputLength: rawOutput?.length ?? 0,
    });
  }
  return output;
}

export function runCompanyBidFit(file, { execute = executeWorkflowAgent } = {}) {
  return callDirectAgent(file, env.workflowAgents.companyBidFit, {
    json: false,
    name: 'Company Bid Fit Assessment',
    execute,
  });
}

export function runWpsCpDecomposer(file, { execute = executeWorkflowAgent } = {}) {
  return callDirectAgent(file, env.workflowAgents.wpsCpDecomposer, {
    json: true,
    name: 'WPS CP Decomposer',
    execute,
  });
}

export function runSubmissionCompliance(file, { execute = executeWorkflowAgent } = {}) {
  return callDirectAgent(file, env.workflowAgents.submissionCompliance, {
    json: true,
    name: 'Submission Package Compliance',
    execute,
  });
}

/**
 * 원본 파일을 변환하거나 페이지 분할하지 않고 다섯 전용 Extract Agent에 전달한다.
 * 결과는 환경변수에 선언된 순서대로 병합하므로 충돌 시 앞 Agent 값이 우선한다.
 */
export async function runAnnouncementDecomposition(file, { executeMany = executeWorkflowAgents } = {}) {
  requireFile(file);
  const results = await executeMany({
    agents: env.workflowAgents.announcementExtractors,
    buffer: file.buffer,
    filename: file.filename,
    mimeType: file.mimeType,
  });
  const merged = results.reduce((current, result) => mergeAnnouncementData(
    current,
    strictJsonOutput(
      result.texts,
      `Announcement ${result.key ?? result.agentId}`,
      { objectOnly: true },
    ),
  ), undefined);

  if (merged === undefined) {
    throw new AppError('E_AGENT_OUTPUT_INVALID', 'Announcement Agent 결과가 비어 있습니다.');
  }
  return merged;
}
