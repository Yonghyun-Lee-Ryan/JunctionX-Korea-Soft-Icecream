import crypto from 'node:crypto';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { agentFor } from '../config/agents.js';
import { DOC_TYPE_MAP } from '../config/docTypes.js';
import { extractPdfText } from './pdfText.service.js';
import { classifyByRules } from './classify.service.js';
import { sampleFor } from './schema.service.js';
import { extractWithAgent, isConfigured, rollupConfidence, confidenceCounts } from './studio.service.js';

const MIN_TEXT_CHARS = 120;   // 이보다 적으면 텍스트 레이어가 없는 스캔본으로 본다

/**
 * PDF 한 장을 받아 ① 8갈래로 가르고 ② 그 갈래의 Studio 에이전트로 값을 뽑는다.
 *
 * 🔴 분류를 억지로 하지 않는다. 판정이 서지 않으면 422 + 후보를 돌려준다 —
 *    엉뚱한 에이전트를 돌리면 그럴듯하게 틀린 JSON이 나오고, 그게 제일 나쁘다.
 */
export async function processUpload({ buffer, filename, mimeType }) {
  const started = Date.now();
  const uploadId = `up_${crypto.randomUUID().slice(0, 12)}`;

  // ── ① 텍스트 → 분류 ─────────────────────────────────
  const { text, pages, chars } = await extractPdfText(buffer);
  if (chars < MIN_TEXT_CHARS) {
    throw new AppError('E_DOC_TYPE_UNKNOWN',
      '이 PDF에서 글자를 찾지 못했습니다. 스캔 이미지로만 된 파일은 아직 종류를 판정하지 못합니다.',
      { uploadId, chars, pages });
  }

  const cls = classifyByRules(text);
  logger.info('doc_classified', { uploadId, filename, key: cls.key, score: cls.score, margin: cls.margin, confidence: cls.confidence });

  if (!cls.key) {
    const err = new AppError('E_DOC_TYPE_UNKNOWN', undefined, { uploadId, candidates: cls.candidates });
    err.candidates = cls.candidates;
    throw err;
  }

  const type = DOC_TYPE_MAP[cls.key];
  const agent = agentFor(cls.key);
  if (!agent) throw new AppError('E_AGENT_NOT_SET', `「${type.label}」을 처리할 분석기가 아직 연결되지 않았습니다.`, { key: cls.key, env: type.agentEnv });

  // ── ② 에이전트 호출 ─────────────────────────────────
  if (!isConfigured()) {
    const sample = sampleFor(cls.key);
    if (!sample) throw new AppError('E_NOT_CONFIGURED');
    logger.warn('extract_fallback_fixture', { uploadId, key: cls.key });
    return envelope({ uploadId, filename, buffer, pages, chars, cls, type, agent, data: sample, fields: {}, source: 'fixture', started });
  }

  const result = await extractWithAgent({ agentId: agent.agentId, buffer, filename, mimeType });

  return envelope({
    uploadId, filename, buffer, pages, chars, cls, type, agent, started,
    data: result.data, raw: result.data ? undefined : result.raw,
    fields: result.fields, source: 'agent',
    jobId: result.jobId, fileId: result.fileId, stepModel: result.stepModel, cacheHit: result.cacheHit,
  });
}

function envelope({ uploadId, filename, buffer, pages, chars, cls, type, agent, data, raw, fields, source, started, jobId, fileId, stepModel, cacheHit }) {
  return {
    uploadId,
    filename,
    bytes: buffer.length,
    docType: {
      key: cls.key,
      label: type.label,
      confidence: cls.confidence,
      score: cls.score,
      margin: cls.margin,
      matched: cls.matched,
      candidates: cls.candidates,
    },
    extraction: {
      data: data ?? null,
      ...(raw ? { raw } : {}),
      // 🔴 필드별 confidence · 근거 쪽. 값이 어디서 나왔는지를 잃지 않는다
      fields,
      confidence: rollupConfidence(fields),
      confidenceCounts: confidenceCounts(fields),
      // 🔴 low인 필드는 이름으로 뽑아 준다 — 화면이 ⚠를 어디에 달지 알아야 한다
      lowFields: Object.entries(fields).filter(([, f]) => f.confidence === 'low').map(([k]) => k),
    },
    meta: {
      source,                       // agent | fixture
      cached: source === 'fixture',
      agentId: agent.agentId,
      configId: agent.configId ?? null,
      ...(stepModel ? { stepModel } : {}),
      ...(jobId ? { jobId } : {}),
      ...(fileId ? { fileId } : {}),
      ...(cacheHit === null || cacheHit === undefined ? {} : { agentCacheHit: cacheHit }),
      pages,
      textChars: chars,
      elapsedMs: Date.now() - started,
    },
  };
}
