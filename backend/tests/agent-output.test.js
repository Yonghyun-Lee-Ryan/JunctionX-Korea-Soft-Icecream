import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractJsonValue,
  fillAnnouncementGaps,
  findEmptyTableRows,
  mergeAnnouncementData,
} from '../src/services/agentOutput.service.js';
import { normalizeAgentInputFile } from '../src/services/workflowAgents.service.js';

test('JSON 사족·fence·문자열 내부 괄호를 제거하고 가장 큰 JSON을 복구한다', () => {
  const raw = [
    '검토 결과 {not-json}',
    '```json',
    '{"agent":"WPS_CP_V1","note":"brace } and escaped \\\"quote\\\"","items":[{"id":"1"}]}',
    '```',
    '이상입니다.',
  ].join('\n');
  assert.deepEqual(extractJsonValue(raw), {
    agent: 'WPS_CP_V1',
    note: 'brace } and escaped "quote"',
    items: [{ id: '1' }],
  });
  assert.equal(extractJsonValue('설명만 있고 JSON 없음'), null);
  assert.equal(extractJsonValue('"scalar"'), null);
});

test('Announcement 병합은 빈 값만 채우고 앞 청크 충돌과 배열 순서를 보존한다', () => {
  const first = {
    project_name: '앞 사업명',
    requirement_count: 0,
    issuer: { name: '앞 기관', contact: '' },
    tags: ['A'],
    requirements: [
      { requirement_id: 'R1', requirement_name: '첫 요구', detailed_content: '', source_reference: 'p1' },
    ],
    eligibility_rules: [
      { rule_id: 'ELIG-001', condition: '조건 A', required_evidence: '증빙 A' },
    ],
  };
  const later = {
    project_name: '뒤 사업명',
    requirement_count: 12,
    issuer: { name: '뒤 기관', contact: '02-0000' },
    tags: ['A', 'B'],
    requirements: [
      { requirement_id: 'R1', requirement_name: '뒤에서 바뀐 요구명', detailed_content: '채워짐', source_reference: 'p2' },
      { requirement_id: 'R2', requirement_name: '둘째 요구', detailed_content: '내용', source_reference: 'p3' },
    ],
    eligibility_rules: [
      { rule_id: 'ELIG-001', condition: '조건 B', required_evidence: '증빙 B' },
    ],
  };

  const merged = mergeAnnouncementData(first, later);
  assert.equal(merged.project_name, '앞 사업명');
  assert.equal(merged.requirement_count, 12);
  assert.deepEqual(merged.issuer, { name: '앞 기관', contact: '02-0000' });
  assert.deepEqual(merged.tags, ['A', 'B']);
  assert.deepEqual(merged.requirements.map((row) => row.requirement_id), ['R1', 'R2']);
  assert.equal(merged.requirements[0].requirement_name, '첫 요구');
  assert.equal(merged.requirements[0].detailed_content, '채워짐');
  assert.equal(merged.requirements[0].source_reference, 'p1');
  assert.equal(merged.eligibility_rules.length, 2, '청크마다 재생성된 동일 rule_id라도 조건이 다르면 보존');
});

test('빈 table scalar cell만 재탐색 대상으로 보고 0/false/빈 top-level은 무시한다', () => {
  assert.deepEqual(findEmptyTableRows({ title: '', tags: [], count: 0 }), []);
  assert.deepEqual(findEmptyTableRows({ rows: [{ id: 'A', value: 0, enabled: false }] }), []);
  assert.deepEqual(findEmptyTableRows({ rows: [{ id: 'A', value: '  ' }, { id: 'B', value: null }] }), [
    ['rows', 0],
    ['rows', 1],
  ]);
});

test('재탐색 결과는 기존 빈 cell만 채우고 이웃 페이지의 새 행은 추가하지 않는다', () => {
  const original = {
    project_name: '원본',
    requirements: [
      { requirement_id: 'R1', requirement_name: '요구', detailed_content: '', source_reference: 'p3' },
    ],
  };
  const retry = {
    project_name: '재탐색',
    requirements: [
      { requirement_id: 'R1', requirement_name: '변경 금지', detailed_content: '보완 내용', source_reference: 'p4' },
      { requirement_id: 'NEIGHBOR', requirement_name: '이웃 행', detailed_content: '추가 금지', source_reference: 'p1' },
    ],
  };
  const filled = fillAnnouncementGaps(original, retry);
  assert.equal(filled.project_name, '원본');
  assert.equal(filled.requirements.length, 1);
  assert.equal(filled.requirements[0].requirement_name, '요구');
  assert.equal(filled.requirements[0].detailed_content, '보완 내용');
  assert.equal(filled.requirements[0].source_reference, 'p3');
});

test('재탐색은 청크별 합성 ELIG/SUB ID가 아닌 내용 키로 원래 행을 찾는다', () => {
  const original = {
    eligibility_rules: [
      { rule_id: 'ELIG-001', condition: '조건 A', required_evidence: '' },
    ],
    submission_requirements: [
      { item_id: 'SUB-001', name: '제안서', requirement: '', source_reference: 'p3' },
    ],
  };
  const retry = {
    eligibility_rules: [
      { rule_id: 'ELIG-001', condition: '앞 페이지 조건 X', required_evidence: 'X 증빙' },
      { rule_id: 'ELIG-002', condition: '조건 A', required_evidence: 'A 증빙' },
    ],
    submission_requirements: [
      { item_id: 'SUB-001', name: '입찰서', requirement: 'X 요구', source_reference: 'p1' },
      { item_id: 'SUB-002', name: '제안서', requirement: '제안 요구', source_reference: 'p3' },
    ],
  };
  const filled = fillAnnouncementGaps(original, retry);
  assert.equal(filled.eligibility_rules[0].condition, '조건 A');
  assert.equal(filled.eligibility_rules[0].required_evidence, 'A 증빙');
  assert.equal(filled.submission_requirements[0].name, '제안서');
  assert.equal(filled.submission_requirements[0].requirement, '제안 요구');
});

test('재탐색에서 빈 cell이 identity 복합키를 바꾸어도 안정 anchor로 보완한다', () => {
  const original = {
    execution_context: [{ title: '추진체계', content: '', timing: '착수 후' }],
    evaluation_items: [{ evaluation_item: '기술평가', criteria: '', score: '10' }],
  };
  const retry = {
    execution_context: [{ title: '추진체계', content: '발주기관과 수행사 역할', timing: '변경 금지' }],
    evaluation_items: [{ evaluation_item: '기술평가', criteria: '수행계획의 적절성', score: '20' }],
  };
  const filled = fillAnnouncementGaps(original, retry);
  assert.equal(filled.execution_context[0].content, '발주기관과 수행사 역할');
  assert.equal(filled.execution_context[0].timing, '착수 후');
  assert.equal(filled.evaluation_items[0].criteria, '수행계획의 적절성');
  assert.equal(filled.evaluation_items[0].score, '10');
});

test('서로 다른 표 행은 보존하고 동일 자격 조건의 충돌은 앞 청크를 우선한다', () => {
  const first = {
    scope_items: [{ scope_role: 'PRIMARY_CONTRACT', scope_item: '통합 구축', service_component: 'BUILD' }],
    execution_context: [{ context_type: 'GOVERNANCE', title: '추진체계', content: '발주기관 역할' }],
    eligibility_rules: [{ condition: '중소기업이어야 함', required_evidence: '확인서 A' }],
    submission_requirements: [{ name: '제안서', submission_stage: 'BID', requirement: 'PDF 제출' }],
  };
  const later = {
    scope_items: [{ scope_role: 'TARGET_PROJECT', scope_item: '통합 구축', service_component: 'BUILD' }],
    execution_context: [{ context_type: 'GOVERNANCE', title: '추진체계', content: '수행사 역할' }],
    eligibility_rules: [{ condition: '중소기업이어야 함', required_evidence: '확인서 B' }],
    submission_requirements: [{ name: '제안서', submission_stage: 'BID', requirement: '100쪽 이내' }],
  };

  const merged = mergeAnnouncementData(first, later);
  assert.equal(merged.scope_items.length, 2);
  assert.equal(merged.execution_context.length, 2);
  assert.equal(merged.submission_requirements.length, 2);
  assert.equal(merged.eligibility_rules.length, 1);
  assert.equal(merged.eligibility_rules[0].required_evidence, '확인서 A');
});

test('재탐색은 비어 있던 식별 셀도 안정 anchor로 채우고 위치만 같은 행은 무시한다', () => {
  const original = {
    requirements: [{
      requirement_id: '', requirement_category: '기술', requirement_name: '통합 요구', detailed_content: '',
    }],
    eligibility_rules: [{ condition: '', required_evidence: '중소기업확인서' }],
    submission_requirements: [{ name: '', submission_stage: 'BID', requirement: 'PDF로 제출' }],
    rows: [{ value: '' }],
  };
  const retry = {
    requirements: [
      { requirement_id: 'N1', requirement_category: '기술', requirement_name: '이웃 요구', detailed_content: '이웃' },
      { requirement_id: 'R1', requirement_category: '기술', requirement_name: '통합 요구', detailed_content: '보완 내용' },
    ],
    eligibility_rules: [
      { condition: '다른 조건', required_evidence: '다른 증빙' },
      { condition: '중소기업이어야 함', required_evidence: '중소기업확인서' },
    ],
    submission_requirements: [
      { name: '입찰서', submission_stage: 'BID', requirement: '다른 형식' },
      { name: '제안서', submission_stage: 'BID', requirement: 'PDF로 제출' },
    ],
    rows: [{ value: '이웃 페이지 값' }, { value: '원래 행 값' }],
  };

  const filled = fillAnnouncementGaps(original, retry);
  assert.equal(filled.requirements[0].requirement_id, 'R1');
  assert.equal(filled.requirements[0].detailed_content, '보완 내용');
  assert.equal(filled.eligibility_rules[0].condition, '중소기업이어야 함');
  assert.equal(filled.submission_requirements[0].name, '제안서');
  assert.equal(filled.rows[0].value, '', 'anchor가 없으면 위치가 같아도 채우지 않는다');
});

test('테이블의 생략된 속성도 빈 셀로 감지한다', () => {
  const requirements = [{
    requirement_id: 'R1',
    requirement_category: '기술',
    requirement_name: '요구',
    scope_role: 'PRIMARY_CONTRACT',
    service_component: 'BUILD',
    source_reference: 'p1',
  }];
  assert.deepEqual(findEmptyTableRows({ requirements }), [['requirements', 0]]);
  assert.deepEqual(findEmptyTableRows({ rows: [{ id: 'A', value: '있음' }, { id: 'B' }] }), [['rows', 1]]);
});

test('Agent JSON의 prototype 관련 키를 데이터로만 병합한다', () => {
  const later = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"polluted":"yes"}}');
  const merged = mergeAnnouncementData({ stable: true }, later);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(merged, '__proto__'), true);
  assert.equal(Object.hasOwn(merged, 'constructor'), true);
  assert.equal(merged.__proto__.polluted, 'yes');
});

test('JSON/TXT 입력은 내용이 보존된 HTML로 변환하고 PDF/HTML은 그대로 둔다', () => {
  const json = normalizeAgentInputFile({
    buffer: Buffer.from('{"text":"<조건>&값"}'),
    filename: 'document-info.json',
    mimeType: 'application/json',
  });
  assert.equal(json.filename, 'document-info.html');
  assert.equal(json.mimeType, 'text/html');
  assert.match(json.buffer.toString(), /&lt;조건&gt;&amp;값/u);

  const pdf = { buffer: Buffer.from('%PDF-'), filename: 'input.pdf', mimeType: 'application/pdf' };
  assert.equal(normalizeAgentInputFile(pdf), pdf);
  const html = { buffer: Buffer.from('<p>x</p>'), filename: 'input.html', mimeType: 'text/html' };
  assert.equal(normalizeAgentInputFile(html), html);
});
