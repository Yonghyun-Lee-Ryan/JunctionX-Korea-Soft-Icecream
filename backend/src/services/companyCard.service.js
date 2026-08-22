import fs from 'node:fs';
import path from 'node:path';
import { env, ROOT } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../errors/AppError.js';
import { DOC_TYPES, DOC_TYPE_MAP, normalize } from '../config/docTypes.js';
import { checkCardRequirements } from '../config/cardRequirements.js';
import { isConfigured, uploadFile, runAgent, pollResponse, parseAgentOutput, rollupConfidence } from './studio.service.js';

/**
 * S2 회사 카드 — 서류 묶음을 `Company Card Builder` Agent 1개에 돌리고 COMPANY_CARD_V1 로 모은다.
 *
 * 🔴 Classify 가 갈래(CO_*)를 가른다. 서류별 Agent 8개 호출이 아니다.
 * 🔴 `source_document` 는 Studio 가 못 채운다 (Extract 프롬프트에 파일명이 안 넘어간다) — 응답 받는 자리에서 업로드 파일명을 넣는다.
 * 🔴 실적 합계·최대 단일계약·갈래별 건수는 Extract 가 세지 않는다 (프롬프트가 금지) — 여기서 센다.
 * 🔴 키가 없으면 fixtures/studio/company_card.flat.json (다온피엠씨 실물 8장) 으로 떨어진다 — meta.cached 로 밝힌다.
 */

const AGENT_ENV = 'STUDIO_AGENT_COMPANY_CARD_ID';
const FIXTURE = path.join(ROOT, 'fixtures', 'studio', 'company_card.flat.json');

/** Studio 갈래 → docTypeKey. 검토 갈래는 null — 화면 「직접 확인」 */
const CATEGORY_TO_KEY = {
  CO_BIZ_REG: 'biz_reg',
  CO_SME_CERT: 'sme_cert',
  CO_CREDIT_RATING: 'credit_rating',
  CO_PIA_DESIGNATION: 'pia_designation',
  CO_SW_BUSINESS: 'sw_business',
  CO_DIRECT_PRODUCTION: 'direct_production',
  CO_PERFORMANCE: 'performance',
  CO_FINANCIAL: 'financial',
  CO_TECH_STAFF: 'tech_staff',
  CO_OTHER_REVIEW_REQUIRED: null,
};

/** 표제로 못 거는 서류를 필드 이름으로 건다 (「경영상태 평가자료 — 주요 재무비율」에는 재무상태표라는 말이 없다). 앞쪽이 우선 */
const FIELD_SIGNATURES = [
  ['performance', ['performance_items']],
  ['tech_staff', ['staff_grades', 'total_headcount']],
  ['financial', ['debt_ratio', 'total_assets', 'total_liabilities', 'operating_profit']],
  ['credit_rating', ['credit_grade', 'rating_agency']],
  ['pia_designation', ['designation_number', 'designated_at']],
  ['sw_business', ['report_number']],
  ['sme_cert', ['enterprise_size']],
  ['direct_production', ['product_detail_code', 'direct_production_items']],
  ['biz_reg', ['corporate_number', 'representative']],
];

const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);
const has = (data, k) => data[k] !== undefined && data[k] !== null && (Array.isArray(data[k]) ? data[k].length > 0 : s(data[k]) !== '');

/**
 * 갈래 판별 — 셋 다 받는다: ① Classify 라벨 ② Extract 노드 이름 ③ 서류 종류·필드 추론.
 * ①이 검토 갈래(CO_OTHER_REVIEW_REQUIRED)면 데이터가 그럴듯해도 null — 사람에게 넘긴다.
 */
export function docTypeKeyFor({ category, nodeName, data } = {}) {
  const label = s(category).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CATEGORY_TO_KEY, label)) return CATEGORY_TO_KEY[label];

  const m = s(nodeName).match(/^extract_co_([a-z_]+)$/i);
  if (m) return DOC_TYPE_MAP[m[1].toLowerCase()] ? m[1].toLowerCase() : null;

  if (!data || typeof data !== 'object') return null;
  const kind = normalize(data.document_kind);
  if (kind) {
    const hit = DOC_TYPES.find((t) => t.title.some((title) => kind.includes(normalize(title))));
    if (hit) return hit.key;
  }
  const sig = FIELD_SIGNATURES.find(([, keys]) => keys.some((k) => has(data, k)));
  return sig ? sig[0] : null;
}

/** 「286,000,000, 425,000,000」은 한 행에 두 계약 — 둘 다. 「효력 67,000,000」은 숫자만. 빈 값은 [] */
function parseAmounts(value) {
  return s(value).split(/,\s+|\s*\/\s*/).map((piece) => piece.replace(/\D/g, '')).filter(Boolean).map(Number);
}

const eok = (amount) => {
  const n = amount / 1e8;
  return `${(n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, '')}억`;
};

const bump = (table, key) => { table[key] = (table[key] ?? 0) + 1; };

export function summarizePerformance(items) {
  const rows = arr(items);
  const out = {
    count: rows.length, by_sector: {}, by_category: {}, by_sector_category: {},
    max_contract_amount: 0, max_contract_project: '', total_contract_amount: 0, amount_missing_count: 0, headline: '실적 없음',
  };
  if (!rows.length) return out;

  for (const row of rows) {
    const sector = s(row.client_sector) || 'UNKNOWN';
    const category = s(row.service_category) || 'UNKNOWN';
    bump(out.by_sector, sector);
    bump(out.by_category, category);
    out.by_sector_category[sector] ??= {};
    bump(out.by_sector_category[sector], category);

    const amounts = parseAmounts(row.contract_amount);
    if (!amounts.length) { out.amount_missing_count += 1; continue; }
    out.total_contract_amount += amounts.reduce((a, b) => a + b, 0);
    const rowMax = Math.max(...amounts);
    if (rowMax > out.max_contract_amount) {
      out.max_contract_amount = rowMax;
      out.max_contract_project = s(row.project_name);
    }
  }
  const publicPmo = out.by_sector_category.PUBLIC?.PMO ?? 0;
  out.headline = `공공 PMO ${publicPmo}건 · 최대 ${eok(out.max_contract_amount)} · 합계 ${eok(out.total_contract_amount)}`;
  return out;
}

/** 메시지들 중 CO_* 라벨을 찾는다 — Classify 단계가 JSON({category}) 으로도, 맨 라벨로도 올 수 있다 */
function detectCategory(job) {
  const LABEL_KEYS = ['category', 'class', 'label', 'document_class', 'classification', 'condition'];
  for (const message of arr(job?.output).filter((o) => o.type === 'message')) {
    for (const part of arr(message.content).filter((c) => c.type === 'output_text')) {
      const text = s(part.text);
      if (/^CO_[A-Z_]+$/.test(text)) return text;
      try {
        const json = JSON.parse(text);
        if (json && typeof json === 'object') {
          const found = LABEL_KEYS.map((k) => s(json[k])).find((v) => /^CO_[A-Z_]+$/.test(v));
          if (found) return found;
        }
      } catch { /* 추출 본문 — 라벨 아님 */ }
    }
  }
  return null;
}

function agentId() {
  const a = env.studio.agents?.companyCard;
  if (!a?.agentId) {
    throw new AppError('E_AGENT_NOT_SET', `회사 카드 Agent 의 ID가 없습니다. backend/.env 의 ${AGENT_ENV} 를 채워 주세요.`);
  }
  return a.agentId;
}

async function buildOne(file, agent) {
  const fileId = await uploadFile(file);
  const started = await runAgent({ agentId: agent, fileId });
  const job = await pollResponse(started.id);
  const parsed = parseAgentOutput(job);
  const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
  const category = detectCategory(job);
  const docTypeKey = docTypeKeyFor({ category, nodeName: parsed.stepModel, data });
  return {
    document: { ...data, source_document: file.filename, docTypeKey, category, confidence: rollupConfidence(parsed.fields), job_id: started.id },
    job: { source_document: file.filename, agentId: agent, jobId: started.id, category, docTypeKey, cacheHit: parsed.cacheHit },
  };
}

/** 상호·사업자번호는 사업자등록증이 정본, 없으면 서류들이 가장 많이 말한 값 */
function pickIdentity(documents, field) {
  const bizReg = documents.find((d) => d.docTypeKey === 'biz_reg' && s(d[field]));
  if (bizReg) return s(bizReg[field]);
  const votes = {};
  for (const d of documents) if (s(d[field])) bump(votes, s(d[field]));
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function assemble(documents) {
  const perf = documents.find((d) => d.docTypeKey === 'performance');
  return {
    schema_version: 'COMPANY_CARD_V1',
    company_name: pickIdentity(documents, 'company_name'),
    business_number: pickIdentity(documents, 'business_number'),
    documents,
    performance_summary: summarizePerformance(perf?.performance_items),
    review_required: documents.filter((d) => !d.docTypeKey).map((d) => ({
      source_document: d.source_document,
      document_kind: s(d.document_kind) || '(종류 미확인)',
      reason: '서류 갈래를 확정하지 못했습니다 — 직접 확인해 주세요.',
    })),
    requirements: checkCardRequirements(documents.map((d) => d.docTypeKey).filter(Boolean)),
  };
}

export async function buildCompanyCard({ documents }) {
  const started = Date.now();

  if (!isConfigured()) {
    logger.warn('company_card_fallback_fixture', { uploaded: documents.map((d) => d.filename) });
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const docs = arr(fixture.documents).map((d) => ({ ...d, docTypeKey: docTypeKeyFor({ data: d }), category: null, confidence: null, job_id: null }));
    return { ...assemble(docs), meta: { source: 'fixture', cached: true, jobs: [], elapsedMs: Date.now() - started } };
  }

  const agent = agentId(); // 🔴 업로드 전에 확인 — 무료 실행을 반쯤 쓰고 죽지 않게
  const results = await Promise.all(documents.map((file) => buildOne(file, agent)));
  const card = assemble(results.map((r) => r.document));
  logger.info('company_card_built', { documents: card.documents.length, review: card.review_required.length, elapsedMs: Date.now() - started });
  return { ...card, meta: { source: 'studio', cached: false, jobs: results.map((r) => r.job), elapsedMs: Date.now() - started } };
}
