import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { env } from '../src/config/env.js';
import {
  loadPrompt,
  buildUserMessage,
  extractJson,
  callSolar,
  guardEligibility,
  judgeEligibility,
} from '../src/services/solarJudge.service.js';

// ── fixture: Studio 실물 출력 (2026-08-22~23) ───────────────────────────
const fx = (f) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${f}`, import.meta.url), 'utf8'));
const companyCard = fx('company_card.flat.json');
const announcement = {
  schema_version: 'ANNOUNCEMENT_CORE_V1',
  ...fx('01_overview.rfp.json'),
  ...fx('04_eligibility_submission.notice.json'),
};

// ── Solar mock — 🔴 전역 fetch를 갈아끼우되, Solar URL이 아니면 진짜 fetch로 넘긴다
//    (이 테스트 자신이 로컬 서버를 부를 때도 fetch를 쓴다)
const nativeFetch = globalThis.fetch;
let calls = [];
function mockSolar(reply, { status = 200 } = {}) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(env.solar.chatUrl)) return nativeFetch(url, init);
    calls.push({ url: String(url), headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : null });
    const content = typeof reply === 'string' ? reply : JSON.stringify(reply);
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 1 } }),
      { status, headers: { 'content-type': 'application/json' } },
    );
  };
}
test.afterEach(() => { globalThis.fetch = nativeFetch; });

env.solar.apiKey = 'solar-test-key';
env.solar.model = 'solar-pro3';

/** Solar가 냈다고 치는 자격 판정 — 🔴 일부러 틀린 개수·근거 없는 제외·없는 쪽을 섞었다 */
const screeningReply = () => ({
  agent: 'ELIGIBILITY_SCREENING_V1',
  project_name: 'AX 진단-컨설팅 통합 서비스 개발',
  verdict: '제외',
  headline: '직접생산확인증명서를 확인하지 못했습니다.',
  matched_count: 99,
  failed_count: 99,
  unverified_count: 99,
  checks: [
    { rule_id: 'ELIG_005', label: '중소기업확인서', status: '충족', gate_level: 'HARD_GATE', mandatory: 'YES', announcement_page: 1, company_source_document: '중소기업확인서_다온피엠씨_가상.pdf' },
    { rule_id: 'ELIG_012', label: '직접생산확인증명서', status: '[확인필요]', gate_level: 'HARD_GATE', mandatory: 'YES', announcement_page: 2, company_source_document: '' },
    { rule_id: 'ELIG_014', label: '소프트웨어사업자 등록', status: '충족', gate_level: 'HARD_GATE', mandatory: 'YES', announcement_page: 77, company_source_document: '소프트웨어사업자신고확인서_다온피엠씨_가상.pdf' },
  ],
  exclusion_reasons: [{ text: '직접생산확인증명서 없음', page: 2 }],
  unverified_items: [{ label: '직접생산확인증명서', what_is_missing: '서류 자체가 없다' }],
});

// ── 프롬프트·입력 조립 ───────────────────────────────────────────────────
test('loadPrompt — agent/*.json 의 Instruct 프롬프트를 그대로 읽는다', () => {
  const p = loadPrompt('eligibility');
  assert.ok(p.includes('[판정 어휘 고정]'), '프롬프트 규율 절이 들어 있어야 한다');
  assert.ok(p.length > 2000);
  assert.throws(() => loadPrompt('nope'), /unknown prompt/);
});

test('buildUserMessage — ===== 라벨 ===== 로 영역을 나눈다', () => {
  const msg = buildUserMessage([['COMPANY_CARD', { a: 1 }], ['DOCUMENT_INFO', { b: 2 }]]);
  assert.ok(msg.startsWith('===== COMPANY_CARD =====\n{'));
  assert.ok(msg.includes('\n\n===== DOCUMENT_INFO =====\n{'));
  assert.ok(msg.includes('"b": 2'));
});

test('extractJson — fence·설명이 섞여도 바깥 객체만 꺼내고, 객체가 아니면 null', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('결과입니다 {"a":{"b":2}} 끝'), { a: { b: 2 } });
  assert.equal(extractJson('[1,2]'), null);
  assert.equal(extractJson('nope'), null);
  assert.equal(extractJson(undefined), null);
});

// ── 호출 ────────────────────────────────────────────────────────────────
test('callSolar — chat/completions 에 system+user·json_object·Bearer 로 보내고 content 의 JSON을 돌려준다', async () => {
  mockSolar({ ok: true });
  const out = await callSolar({ system: 'SYS', user: 'USER' });
  assert.deepEqual(out, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, env.solar.chatUrl);
  assert.equal(calls[0].headers.Authorization, 'Bearer solar-test-key');
  assert.equal(calls[0].body.model, 'solar-pro3');
  assert.deepEqual(calls[0].body.response_format, { type: 'json_object' });
  assert.deepEqual(calls[0].body.messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }]);
});

test('callSolar — 키가 없으면 E_NOT_CONFIGURED', async () => {
  const saved = env.solar.apiKey;
  env.solar.apiKey = '';
  try {
    await assert.rejects(callSolar({ system: 's', user: 'u' }), (e) => e.code === 'E_NOT_CONFIGURED');
  } finally {
    env.solar.apiKey = saved;
  }
});

test('callSolar — 5xx 는 E_UPSTREAM_SOLAR, JSON 아닌 응답은 E_JUDGE_OUTPUT_INVALID', async () => {
  mockSolar({ x: 1 }, { status: 502 });
  await assert.rejects(callSolar({ system: 's', user: 'u' }), (e) => e.code === 'E_UPSTREAM_SOLAR');
  mockSolar('죄송합니다, 판단할 수 없습니다.');
  await assert.rejects(callSolar({ system: 's', user: 'u' }), (e) => e.code === 'E_JUDGE_OUTPUT_INVALID');
});

// ── 가드 ────────────────────────────────────────────────────────────────
test('guardEligibility — 개수를 다시 세고, 근거 있는 미충족이 없으면 제외를 추천으로 되돌린다', () => {
  const out = guardEligibility(screeningReply(), announcement);
  assert.equal(out.matched_count, 2);
  assert.equal(out.failed_count, 0);
  assert.equal(out.unverified_count, 1);
  assert.equal(out.verdict, '추천', '[확인필요]는 제외 사유가 아니다');
  assert.deepEqual(out.exclusion_reasons, []);
  assert.equal(out._meta.overridden, 'no-grounded-hard-fail');
});

test('guardEligibility — 공고에 없는 쪽은 0으로 (쪽을 지어내지 않는다)', () => {
  const out = guardEligibility(screeningReply(), announcement);
  assert.equal(out.checks[2].announcement_page, 0);
  assert.equal(out.checks[0].announcement_page, 1);
});

test('guardEligibility — HARD_GATE·mandatory·미충족·쪽 있음이면 제외를 유지한다', () => {
  const reply = screeningReply();
  reply.checks[1].status = '미충족';
  const out = guardEligibility(reply, announcement);
  assert.equal(out.verdict, '제외');
  assert.equal(out.failed_count, 1);
  assert.equal(out.exclusion_reasons.length, 1);
  assert.equal(out._meta?.overridden, undefined);
});

test('guardEligibility — checks 가 없어도 죽지 않는다', () => {
  const out = guardEligibility({ verdict: '제외' }, announcement);
  assert.deepEqual(out.checks, []);
  assert.equal(out.verdict, '추천');
});

// ── 판정 1 끝까지 ───────────────────────────────────────────────────────
test('judgeEligibility — 회사 카드 + 공고를 라벨로 이어 보내고 가드를 통과한 결과를 준다', async () => {
  mockSolar(screeningReply());
  const out = await judgeEligibility({ companyCard, announcement });
  assert.equal(out.verdict, '추천');
  assert.equal(out.unverified_count, 1);
  const user = calls[0].body.messages[1].content;
  assert.ok(user.startsWith('===== COMPANY_CARD =====\n'));
  assert.ok(user.includes('===== DOCUMENT_INFO ====='));
  assert.ok(user.includes('"business_number": "120-86-01230"'), '회사 카드가 문자열 그대로 들어간다');
  assert.ok(user.includes('ELIG_012'), '공고 자격 조항이 들어간다');
  assert.ok(calls[0].body.messages[0].content.includes('[파일 입력 계약]'));
});

// ── HTTP ────────────────────────────────────────────────────────────────
migrate();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const post = (path, body) => nativeFetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('POST /api/judge/eligibility — 200 + ELIGIBILITY_SCREENING_V1 (가드 적용)', async () => {
  mockSolar(screeningReply());
  const res = await post('/api/judge/eligibility', { companyCard, announcement });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.agent, 'ELIGIBILITY_SCREENING_V1');
  assert.equal(body.verdict, '추천');
  assert.equal(body.matched_count, 2);
  assert.equal(body.meta.model, 'solar-pro3');
});

test('POST /api/judge/eligibility — companyCard·announcement 없으면 400 완성문', async () => {
  const res = await post('/api/judge/eligibility', { companyCard });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'E_VALIDATION');
  assert.ok(body.error.message.includes('announcement'));
});

test('POST /api/judge/eligibility — 키가 없으면 503 E_NOT_CONFIGURED', async () => {
  const saved = env.solar.apiKey;
  env.solar.apiKey = '';
  try {
    const res = await post('/api/judge/eligibility', { companyCard, announcement });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error.code, 'E_NOT_CONFIGURED');
  } finally {
    env.solar.apiKey = saved;
  }
});
