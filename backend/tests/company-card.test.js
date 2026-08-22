import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env } from '../src/config/env.js';
import { DOC_TYPE_MAP } from '../src/config/docTypes.js';
import { docTypeKeyFor, summarizePerformance, buildCompanyCard } from '../src/services/companyCard.service.js';

const flat = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/company_card.flat.json', import.meta.url), 'utf8'));
const byFile = Object.fromEntries(flat.documents.map(({ source_document, ...data }) => [source_document, data]));
const FILES = Object.keys(byFile); // 8 실물 서류 (다온피엠씨 · 가상)

// 파일명 → Studio 가 응답에 어떻게 갈래를 드러내는지 (셋 다 실제로 올 수 있어 셋 다 받는다)
const CATEGORY = {
  '사업자등록증_다온피엠씨_가상.pdf': { classifyMessage: 'CO_BIZ_REG' },
  '중소기업확인서_다온피엠씨_가상.pdf': { classifyMessage: 'CO_SME_CERT' },
  '신용평가등급확인서_다온피엠씨_가상.pdf': { classifyMessage: 'CO_CREDIT_RATING' },
  '개인정보영향평가기관지정서_다온피엠씨_가상.pdf': { classifyMessage: 'CO_PIA_DESIGNATION' },
  '소프트웨어사업자신고확인서_다온피엠씨_가상.pdf': { classifyMessage: 'CO_SW_BUSINESS' },
  '실적증명서_다온피엠씨_가상.pdf': { classifyMessage: 'CO_PERFORMANCE' },
  '재무제표_다온피엠씨_가상.pdf': { nodeName: 'extract_co_financial' },   // 분류 메시지 없이 노드 이름만
  '기술인력보유현황_다온피엠씨_가상.pdf': {},                              // 둘 다 없음 → 필드로 추론
};

const nativeFetch = globalThis.fetch;
const MOCK = 'https://mock-studio.invalid';
let studioCalls;
function mockStudio({ replyFor = (filename) => byFile[filename], howFor = (filename) => CATEGORY[filename] } = {}) {
  studioCalls = { uploads: [], jobs: [] };
  const files = new Map();
  const jobs = new Map();
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith(MOCK)) return nativeFetch(url, init);
    if (u.endsWith('/v2/files')) {
      const file = init.body.get('file');
      const id = `file_${files.size + 1}`;
      files.set(id, file.name);
      studioCalls.uploads.push(file.name);
      return Response.json({ id, bytes: file.size });
    }
    if (u.endsWith('/v2/responses')) {
      const body = JSON.parse(init.body);
      const filename = files.get(body.input[0].content[0].file_id);
      const id = `job_${jobs.size + 1}`;
      jobs.set(id, { agentId: body.model, filename });
      studioCalls.jobs.push({ agentId: body.model, filename });
      return Response.json({ id, status: 'in_progress' });
    }
    const m = u.match(/\/v2\/responses\/(job_\d+)$/);
    if (m) {
      const { filename } = jobs.get(m[1]);
      const how = howFor(filename) ?? {};
      const output = [];
      if (how.classifyMessage) {
        output.push({ type: 'message', model: 'Classify-1', content: [{ type: 'output_text', text: JSON.stringify({ category: how.classifyMessage }) }] });
      }
      output.push({
        type: 'message', model: how.nodeName ?? 'extract', content: [{ type: 'output_text', text: JSON.stringify(replyFor(filename)), additional_values: { cache_hit: false, company_name: { confidence: 'high', page: 1 } } }],
      });
      return Response.json({ id: m[1], status: 'completed', output });
    }
    throw new Error(`unexpected studio call: ${u}`);
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });

env.studio.apiKey = 'studio-test-key';
env.studio.baseUrl = MOCK;
env.studio.pollIntervalMs = 0;
env.studio.agents.companyCard = { agentId: 'agt_cc', configId: '1' };

const uploads = FILES.map((filename) => ({ buffer: Buffer.from(`%PDF ${filename}`), filename, mimeType: 'application/pdf' }));

// ── 갈래 → docTypeKey ───────────────────────────────────────────────────
test('docTypes — direct_production 갈래가 생겼다 (KISTI 참가자격 · 세부품명 8111159801)', () => {
  assert.equal(DOC_TYPE_MAP.direct_production.label, '직접생산확인증명서');
});

test('docTypeKeyFor — Studio 갈래 라벨이 1순위, 검토 갈래는 null', () => {
  assert.equal(docTypeKeyFor({ category: 'CO_BIZ_REG' }), 'biz_reg');
  assert.equal(docTypeKeyFor({ category: 'CO_DIRECT_PRODUCTION' }), 'direct_production');
  assert.equal(docTypeKeyFor({ category: 'CO_OTHER_REVIEW_REQUIRED', data: byFile['사업자등록증_다온피엠씨_가상.pdf'] }), null, '검토 갈래는 데이터가 그럴듯해도 사람에게 넘긴다');
});

test('docTypeKeyFor — 라벨이 없으면 Extract 노드 이름, 그것도 없으면 서류 종류·필드로 추론', () => {
  assert.equal(docTypeKeyFor({ nodeName: 'extract_co_financial' }), 'financial');
  assert.equal(docTypeKeyFor({ data: byFile['기술인력보유현황_다온피엠씨_가상.pdf'] }), 'tech_staff');
  assert.equal(docTypeKeyFor({ data: byFile['재무제표_다온피엠씨_가상.pdf'] }), 'financial', '「경영상태 평가자료」는 표제로 못 걸고 debt_ratio 같은 필드로 건다');
  assert.equal(docTypeKeyFor({ data: { document_kind: '신용평가등급확인서' } }), 'credit_rating');
  assert.equal(docTypeKeyFor({ data: { document_kind: '알 수 없는 서류' } }), null);
});

// ── 실적 집계 — Extract 가 세지 않는 것을 백엔드가 센다 ────────────────────
test('summarizePerformance — 건수·갈래별·최대 단일계약·합계 (실물 15건)', () => {
  const items = byFile['실적증명서_다온피엠씨_가상.pdf'].performance_items;
  const s = summarizePerformance(items);
  assert.equal(s.count, 15);
  assert.deepEqual(s.by_sector, { PUBLIC: 14, PRIVATE: 1 });
  assert.deepEqual(s.by_category, { PMO: 8, AUDIT: 3, ISP: 2, PIA: 2 });
  assert.equal(s.by_sector_category.PUBLIC.PMO, 8);
  assert.equal(s.max_contract_amount, 612_000_000);
  assert.equal(s.max_contract_project, '차세대 통합정보시스템 구축 PMO');
  // 「286,000,000, 425,000,000」은 한 행에 두 계약 — 둘 다 더한다. 「효력 67,000,000」은 숫자만
  assert.equal(s.total_contract_amount, 4_037_000_000);
  assert.equal(s.amount_missing_count, 1, '업무포털 행은 금액이 비어 있다 — 0으로 세지 않고 빠진 건수로');
  assert.ok(s.headline.includes('공공 PMO 8건') && s.headline.includes('6.12억') && s.headline.includes('40.4억'), s.headline);
});

test('summarizePerformance — 비어 있으면 0 과 빈 표', () => {
  assert.deepEqual(summarizePerformance([]), {
    count: 0, by_sector: {}, by_category: {}, by_sector_category: {},
    max_contract_amount: 0, max_contract_project: '', total_contract_amount: 0, amount_missing_count: 0, headline: '실적 없음',
  });
});

// ── Studio 호출 ─────────────────────────────────────────────────────────
test('buildCompanyCard — 파일마다 Agent 1개, source_document 는 백엔드가 채우고 갈래를 단다', async () => {
  mockStudio();
  const card = await buildCompanyCard({ documents: uploads });
  assert.equal(studioCalls.uploads.length, 8);
  assert.ok(studioCalls.jobs.every((j) => j.agentId === 'agt_cc'));
  assert.equal(card.schema_version, 'COMPANY_CARD_V1');
  assert.equal(card.company_name, '주식회사 다온피엠씨');
  assert.equal(card.business_number, '120-86-01230');
  assert.equal(card.documents.length, 8);
  assert.deepEqual(card.documents.map((d) => d.source_document), FILES, '올린 순서 그대로');
  const keys = Object.fromEntries(card.documents.map((d) => [d.source_document, d.docTypeKey]));
  assert.equal(keys['사업자등록증_다온피엠씨_가상.pdf'], 'biz_reg');
  assert.equal(keys['재무제표_다온피엠씨_가상.pdf'], 'financial');
  assert.equal(keys['기술인력보유현황_다온피엠씨_가상.pdf'], 'tech_staff');
  assert.equal(card.documents.find((d) => d.docTypeKey === 'biz_reg').representative, '강민서', '추출 데이터는 평평하게 그대로');
  assert.equal(card.performance_summary.max_contract_amount, 612_000_000);
  assert.deepEqual(card.review_required, []);
  assert.equal(card.requirements.complete, true);
  assert.equal(card.meta.source, 'studio');
  assert.equal(card.meta.jobs.length, 8);
});

test('buildCompanyCard — 검토 갈래 서류는 review_required 로 내고 요건 빠짐을 문장으로', async () => {
  mockStudio({
    replyFor: (filename) => (filename.includes('재무제표') ? { document_kind: '정체불명 표' } : byFile[filename]),
    howFor: (filename) => (filename.includes('재무제표') ? { classifyMessage: 'CO_OTHER_REVIEW_REQUIRED' } : CATEGORY[filename]),
  });
  const card = await buildCompanyCard({ documents: uploads });
  assert.equal(card.review_required.length, 1);
  assert.equal(card.review_required[0].source_document, '재무제표_다온피엠씨_가상.pdf');
  assert.equal(card.requirements.complete, false);
  assert.equal(card.requirements.missing[0].field, '재무');
});

test('buildCompanyCard — 키가 없으면 fixtures/studio/company_card.flat.json 으로 폴백', async () => {
  const saved = env.studio.apiKey;
  env.studio.apiKey = '';
  try {
    const card = await buildCompanyCard({ documents: uploads.slice(0, 2) });
    assert.equal(card.meta.source, 'fixture');
    assert.equal(card.meta.cached, true);
    assert.equal(card.documents.length, 8);
    assert.ok(card.documents.every((d) => d.docTypeKey));
    assert.equal(card.performance_summary.count, 15);
  } finally {
    env.studio.apiKey = saved;
  }
});

test('buildCompanyCard — Agent ID 가 비어 있으면 E_AGENT_NOT_SET', async () => {
  mockStudio();
  const saved = env.studio.agents.companyCard;
  env.studio.agents.companyCard = { agentId: '', configId: '' };
  try {
    await assert.rejects(buildCompanyCard({ documents: uploads }), (e) => e.code === 'E_AGENT_NOT_SET' && e.message.includes('STUDIO_AGENT_COMPANY_CARD_ID'));
  } finally {
    env.studio.agents.companyCard = saved;
  }
});

// ── HTTP ────────────────────────────────────────────────────────────────
migrate();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

function post(files) {
  const form = new FormData();
  for (const f of files) form.append('documents', new Blob([f.buffer], { type: f.mimeType }), f.filename);
  return nativeFetch(`${base}/api/company-card/build`, { method: 'POST', body: form });
}

test('POST /api/company-card/build — documents[] 멀티파트 → COMPANY_CARD_V1', async () => {
  mockStudio();
  const res = await post(uploads);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.schema_version, 'COMPANY_CARD_V1');
  assert.equal(body.documents.length, 8);
  assert.equal(body.documents[0].source_document, FILES[0]);
  assert.equal(body.meta.source, 'studio');
});

test('POST /api/company-card/build — 파일이 없으면 400', async () => {
  const res = await post([]);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'E_FILE_REQUIRED');
  assert.ok(body.error.message.includes('documents'));
});
