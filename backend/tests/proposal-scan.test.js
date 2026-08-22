import test from 'node:test';
import assert from 'node:assert/strict';
import { scanForbidden, DEFAULT_FORBIDDEN, splitSentences } from '../src/services/proposalScan.service.js';
import { guardSubmissionAudit } from '../src/services/solarJudge.service.js';

// ── 1-2 보강: Solar 가 금지 표현을 놓친 실측(원고에 세 표현이 있는데 hits 0) → 백엔드가 쪽 단위로 전수 검색해 합친다 ──
const pages = [
  '1. 사업 이해\n당사는 체육진흥투표권 결제 대행을 제공한다. 외부 LLM 서비스와의 연계도 가능합니다.\n정기 점검은 추가로 고려할 수 있습니다.',
  '2. 수행 계획\n모바일 환경도 지원 가능하도록 설계합니다. 납기는 계약 후 협의 후 결정합니다.\n공고문 인용: "수행사는 … 제공 가능하다"',
  '3. 맺음말\n당사는 모든 요구사항을 제공한다.',
];

test('splitSentences — 마침표·줄바꿈으로 문장을 가른다, 빈 조각은 버린다', () => {
  const s = splitSentences(pages[0]);
  assert.deepEqual(s, ['1. 사업 이해', '당사는 체육진흥투표권 결제 대행을 제공한다.', '외부 LLM 서비스와의 연계도 가능합니다.', '정기 점검은 추가로 고려할 수 있습니다.']);
});

test('🔴 scanForbidden — 기본 목록으로 쪽마다 걸린 문장을 모두 찾는다 (표현·문장·쪽)', () => {
  const hits = scanForbidden(pages);
  const byExpr = Object.fromEntries(hits.map((h) => [h.expression, h]));
  assert.ok(byExpr['가능합니다'], JSON.stringify(hits));
  assert.equal(byExpr['가능합니다'].sentence, '외부 LLM 서비스와의 연계도 가능합니다.');
  assert.equal(byExpr['가능합니다'].page, 1);
  assert.equal(byExpr['고려할 수 있습니다'].page, 1);
  assert.equal(byExpr['지원 가능'].page, 2);
  assert.equal(byExpr['협의 후 결정'].page, 2);
  assert.ok(!hits.some((h) => h.sentence.includes('제공한다.') && h.page === 3), '확약 문장은 걸리지 않는다');
  assert.ok(DEFAULT_FORBIDDEN.length >= 8);
});

test('scanForbidden — 공고 규칙의 표현을 더 받는다, 같은 문장은 한 번만', () => {
  const hits = scanForbidden(pages, ['설계합니다']);
  const s = hits.filter((h) => h.sentence.startsWith('모바일 환경도'));
  assert.equal(s.length, 1, '지원 가능·설계합니다 둘 다 걸려도 문장은 하나');
  assert.equal(s[0].expression, '지원 가능', '먼저 걸린 표현');
});

test('🔴 guardSubmissionAudit — Solar 스캔이 놓친 자리를 로컬 검색으로 보탠다 (같은 문장은 합치고, 개수는 합친 뒤 센다)', () => {
  const proposalScan = { forbidden_expression_hits: [{ expression: '가능합니다', sentence: '외부 LLM 서비스와의 연계도 가능합니다.', page: 1 }] };
  const localHits = scanForbidden(pages);
  const out = guardSubmissionAudit({ documents: [], forbidden_expressions: { count: 0, items: [] } }, { proposalScan, localHits });
  const fe = out.forbidden_expressions;
  assert.equal(fe.count, fe.items.length);
  assert.ok(fe.count >= 4, JSON.stringify(fe.items));
  assert.equal(fe.items.filter((i) => i.sentence === '외부 LLM 서비스와의 연계도 가능합니다.').length, 1, '중복 없음');
  assert.ok(fe.items.every((i) => i.proposal_page >= 1));
  assert.ok(fe.items.some((i) => i.expression === '지원 가능'));
});

// ── 실측 2: PDF 텍스트 레이어는 줄바꿈으로 문장을 자른다 · Solar 가 쪽을 지어낸다(5쪽 원고에 p63) ──
test('🔴 splitSentences — 줄바꿈(행 바꿈)은 문장 경계가 아니다: 이어 붙인다. 제목·목록 줄만 따로', () => {
  const s = splitSentences('2.3 연계 방안\n당사는 외부 LLM 서비\n스와의 연계도 가능합니다. 정기 점검은 \n추가로 고려할 수 있습니다.\n- 모바일 환경도 지원 가능하도록 설계합니다.\n① 정산 보고는 월 1회 제출한다.');
  assert.deepEqual(s, [
    '2.3 연계 방안',
    '당사는 외부 LLM 서비스와의 연계도 가능합니다.',
    '정기 점검은 추가로 고려할 수 있습니다.',
    '- 모바일 환경도 지원 가능하도록 설계합니다.',
    '① 정산 보고는 월 1회 제출한다.',
  ]);
});

test('🔴 guardSubmissionAudit — 같은 자리면 쪽은 PDF 에서 읽은 쪽(localHits)을 쓴다 — 모델이 5쪽 원고에 p63 을 붙인 실측', () => {
  const proposalScan = { forbidden_expression_hits: [{ expression: '고려할 수 있다', sentence: '정기 점검은 추가로 고려할 수 있습니다.', page: 63 }] };
  const localHits = [{ expression: '고려할 수 있습니다', sentence: '정기 점검은 추가로 고려할 수 있습니다.', page: 1 }];
  const out = guardSubmissionAudit({ documents: [], forbidden_expressions: { items: [] } }, { proposalScan, localHits });
  assert.equal(out.forbidden_expressions.count, 1);
  assert.equal(out.forbidden_expressions.items[0].proposal_page, 1);
  // 로컬에 없는 모델 항목은 모델의 쪽을 그대로 — 다만 쪽 수를 알면 범위 밖은 0(모름)
  const out2 = guardSubmissionAudit({ documents: [], forbidden_expressions: { items: [] } }, { proposalScan, localHits: [], pageCount: 5 });
  assert.equal(out2.forbidden_expressions.items[0].proposal_page, 0);
});
