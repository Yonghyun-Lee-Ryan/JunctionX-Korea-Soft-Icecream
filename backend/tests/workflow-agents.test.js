import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';

const nativeFetch = globalThis.fetch;
const mockOrigin = 'https://mock-upstage.invalid';

env.workflowAgents.apiKey = 'agent-only-secret';
env.workflowAgents.baseUrl = mockOrigin;
env.workflowAgents.pollIntervalMs = 0;
env.workflowAgents.pollTimeoutMs = 2000;
env.workflowAgents.announcementExtractors = [
  { key: 'overview', agentId: 'agt_announcement_overview', configId: '1' },
  { key: 'scope_context', agentId: 'agt_announcement_scope', configId: '2' },
  { key: 'requirements', agentId: 'agt_announcement_requirements', configId: '3' },
  { key: 'eligibility_submission', agentId: 'agt_announcement_eligibility', configId: '4' },
  { key: 'conditions_evaluation', agentId: 'agt_announcement_evaluation', configId: '5' },
];
env.workflowAgents.companyBidFit.agentId = 'agt_E29Ks2PXGGqiXT3YFL6xHn';
env.workflowAgents.companyBidFit.configId = '1';
env.workflowAgents.wpsCpDecomposer.agentId = 'agt_A32DpZyKcq7cKh8pkzfHLv';
env.workflowAgents.wpsCpDecomposer.configId = '1';
env.workflowAgents.submissionCompliance.agentId = 'agt_9uqVjjumhkyNiMMBUx83Ye';
env.workflowAgents.submissionCompliance.configId = '1';

let state;
function resetMock(outputs = []) {
  state = {
    outputs: [...outputs],
    uploads: [],
    jobs: new Map(),
    jobRequests: [],
    pollUrls: [],
    requestAuth: [],
    failNextJob: false,
    uploadAttempts: 0,
    jobCreateAttempts: 0,
    uploadStatus: null,
    jobCreateStatus: null,
    hangPoll: false,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.origin !== mockOrigin) return nativeFetch(input, init);

  state.requestAuth.push(new Headers(init.headers).get('authorization'));
  if (url.pathname === '/v2/files' && init.method === 'POST') {
    state.uploadAttempts += 1;
    if (state.uploadStatus) return jsonResponse({ error: 'mock upload failure' }, state.uploadStatus);
    const form = init.body;
    const file = form.get('file');
    const bytes = Buffer.from(await file.arrayBuffer());
    const index = state.uploads.length + 1;
    state.uploads.push({
      purpose: form.get('purpose'),
      filename: file.name,
      mimeType: file.type,
      bytes,
    });
    return index % 2 === 0
      ? jsonResponse({ file_id: `file-${index}` })
      : jsonResponse({ id: `file-${index}` });
  }

  if (url.pathname === '/v2/responses' && init.method === 'POST') {
    state.jobCreateAttempts += 1;
    if (state.jobCreateStatus) return jsonResponse({ error: 'mock job failure' }, state.jobCreateStatus);
    const request = JSON.parse(init.body);
    const index = state.jobRequests.length + 1;
    const jobId = `job-${index}`;
    state.jobRequests.push(request);
    state.jobs.set(jobId, {
      output: state.outputs.shift(),
      failed: state.failNextJob,
      polls: 0,
    });
    state.failNextJob = false;
    return index % 2 === 0
      ? jsonResponse({ job_id: jobId, status: 'queued' })
      : jsonResponse({ id: jobId, status: 'queued' });
  }

  if (url.pathname.startsWith('/v2/responses/') && (!init.method || init.method === 'GET')) {
    if (state.hangPoll) {
      return new Promise((resolve, reject) => {
        const abort = () => {
          const error = new Error('mock aborted request');
          error.name = 'AbortError';
          reject(error);
        };
        if (init.signal?.aborted) abort();
        else init.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    const jobId = decodeURIComponent(url.pathname.split('/').at(-1));
    const job = state.jobs.get(jobId);
    state.pollUrls.push(url.toString());
    job.polls += 1;
    if (job.failed) return jsonResponse({ id: jobId, status: 'failed', error: { message: 'mock failure' } });
    if (job.polls === 1) return jsonResponse({ id: jobId, status: 'in_progress' });
    const parts = Array.isArray(job.output) ? job.output : [job.output];
    return jsonResponse({
      id: jobId,
      status: 'completed',
      output: [{
        type: 'message',
        content: parts.map((text) => ({ type: 'output_text', text })),
      }],
    });
  }

  return jsonResponse({ error: 'unexpected mock request' }, 500);
};

const server = createApp().listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;

test.after(() => {
  globalThis.fetch = nativeFetch;
  server.close();
});

function uploadForm(bytes, filename = 'input.pdf', type = 'application/pdf') {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), filename);
  return form;
}

function requirementRow(overrides = {}) {
  return {
    requirement_id: 'R1',
    requirement_category: '기술',
    requirement_name: '요구',
    detailed_content: '내용',
    scope_role: 'PRIMARY_CONTRACT',
    service_component: 'BUILD',
    source_reference: 'p1',
    ...overrides,
  };
}

test('OpenAPI에 네 workflow Agent endpoint가 공개된다', async () => {
  resetMock();
  const response = await nativeFetch(`${base}/openapi.json`);
  const spec = await response.json();
  for (const path of [
    '/api/agents/announcement-decomposition',
    '/api/agents/company-bid-fit',
    '/api/agents/wps-cp-decomposer',
    '/api/agents/submission-compliance',
  ]) {
    assert.ok(spec.paths[path], path);
    assert.equal(spec.paths[path].post.security, undefined);
  }
});

test('Company/WPS/Submission은 정확한 Agent와 config를 호출하고 JSON 사족을 제거한다', async () => {
  resetMock([
    '"GO"',
    ['중간 설명\n```json\n{"agent":"WPS_CP_V1","note":"bra', 'ce } ok"}\n```\n끝'],
    '검토 결과: {"agent":"SUBMISSION_COMPLIANCE_V1","overall_status":"PASS"} 이상',
  ]);
  const bytes = Buffer.from('<html>input</html>');

  const company = await nativeFetch(`${base}/api/agents/company-bid-fit`, {
    method: 'POST', body: uploadForm(bytes, 'company.html', 'text/html'),
  });
  assert.equal(company.status, 200);
  assert.equal(await company.text(), 'GO');

  const wps = await nativeFetch(`${base}/api/agents/wps-cp-decomposer`, {
    method: 'POST', body: uploadForm(bytes, 'document-info.json', 'application/json'),
  });
  assert.equal(wps.status, 200);
  assert.deepEqual(await wps.json(), { agent: 'WPS_CP_V1', note: 'brace } ok' });

  const submission = await nativeFetch(`${base}/api/agents/submission-compliance`, {
    method: 'POST', body: uploadForm(bytes, 'submission.pdf'),
  });
  assert.equal(submission.status, 200);
  assert.deepEqual(await submission.json(), { agent: 'SUBMISSION_COMPLIANCE_V1', overall_status: 'PASS' });

  assert.deepEqual(state.jobRequests.map((request) => [request.model, request.config_id]), [
    ['agt_E29Ks2PXGGqiXT3YFL6xHn', '1'],
    ['agt_A32DpZyKcq7cKh8pkzfHLv', '1'],
    ['agt_9uqVjjumhkyNiMMBUx83Ye', '1'],
  ]);
  for (const request of state.jobRequests) {
    assert.deepEqual(request.include, ['last']);
    assert.equal(request.input.length, 1);
    assert.equal(request.input[0].content.length, 1);
  }
  assert.ok(state.uploads.every((upload) => upload.purpose === 'user_data'));
  assert.deepEqual(state.uploads.map((upload) => [upload.filename, upload.mimeType]), [
    ['company.html', 'text/html'],
    ['document-info.html', 'text/html'],
    ['submission.pdf', 'application/pdf'],
  ]);
  assert.ok(state.requestAuth.every((auth) => auth === 'Bearer agent-only-secret'));
  assert.ok(state.pollUrls.every((url) => new URL(url).searchParams.getAll('include[]').includes('last')));
});

test('Announcement는 원본 파일을 한 번 업로드해 다섯 Agent에 전달하고 고정 순서로 병합한다', async () => {
  resetMock([
    JSON.stringify({
      schema_version: 'ANNOUNCEMENT_CORE_V1',
      procurement_project_name: '앞 사업',
      issuer: '발주기관',
      shared: '앞 값',
    }),
    JSON.stringify({
      scope_items: [{ scope_item: '구축 범위' }],
      execution_context: [{ title: '추진체계', content: '역할' }],
      shared: '뒤 값',
    }),
    JSON.stringify({
      requirement_count: 1,
      requirement_summary: [{ category_code: 'SFR', declared_count: '1' }],
      requirements: [requirementRow()],
    }),
    JSON.stringify({
      eligibility_rules: [{ rule_id: 'ELIG-1', condition: '자격' }],
      submission_requirements: [{ item_id: 'SUB-1', name: '제안서' }],
    }),
    JSON.stringify({
      execution_conditions: [{ condition_category: '보안', condition: '준수' }],
      evaluation_items: [{ evaluation_item: '기술평가', score: '90' }],
    }),
  ]);

  const original = Buffer.from('original-hwpx-binary');
  const response = await nativeFetch(`${base}/api/agents/announcement-decomposition`, {
    method: 'POST', body: uploadForm(
      original,
      'announcement.hwpx',
      'application/vnd.hancom.hwpx',
    ),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.procurement_project_name, '앞 사업');
  assert.equal(body.requirement_count, 1);
  assert.equal(body.shared, '앞 값');
  assert.deepEqual(body.requirements.map((row) => row.requirement_id), ['R1']);
  assert.equal(body.scope_items[0].scope_item, '구축 범위');
  assert.equal(body.submission_requirements[0].item_id, 'SUB-1');
  assert.equal(body.evaluation_items[0].score, '90');
  assert.equal(state.uploads.length, 1);
  assert.equal(state.uploads[0].filename, 'announcement.hwpx');
  assert.equal(state.uploads[0].mimeType, 'application/vnd.hancom.hwpx');
  assert.deepEqual(state.uploads[0].bytes, original);
  assert.deepEqual(state.jobRequests.map((request) => [request.model, request.config_id]), [
    ['agt_announcement_overview', '1'],
    ['agt_announcement_scope', '2'],
    ['agt_announcement_requirements', '3'],
    ['agt_announcement_eligibility', '4'],
    ['agt_announcement_evaluation', '5'],
  ]);
  const referencedFileIds = state.jobRequests.map(
    (request) => request.input[0].content[0].file_id,
  );
  assert.deepEqual(referencedFileIds, Array(5).fill('file-1'));
});

test('Announcement의 다섯 결과 중 하나라도 JSON 객체가 아니면 502로 반환한다', async () => {
  resetMock([
    '{"schema_version":"ANNOUNCEMENT_CORE_V1"}',
    '{"scope_items":[]}',
    'JSON이 아닌 설명문',
    '{"eligibility_rules":[]}',
    '{"evaluation_items":[]}',
  ]);
  const response = await nativeFetch(`${base}/api/agents/announcement-decomposition`, {
    method: 'POST', body: uploadForm(Buffer.from('original'), 'announcement.hwp'),
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'E_AGENT_OUTPUT_INVALID');
  assert.equal(state.uploads.length, 1);
  assert.equal(state.jobRequests.length, 5);
});

test('파일 누락·복수 파일을 4xx로 거부한다', async () => {
  resetMock();
  const missing = await nativeFetch(`${base}/api/agents/company-bid-fit`, {
    method: 'POST', body: new FormData(),
  });
  assert.equal(missing.status, 400);

  const two = new FormData();
  two.append('file', new Blob(['a']), 'a.txt');
  two.append('file', new Blob(['b']), 'b.txt');
  const multiple = await nativeFetch(`${base}/api/agents/company-bid-fit`, { method: 'POST', body: two });
  assert.equal(multiple.status, 400);

});

test('Announcement 다섯 Agent 중 하나라도 설정되지 않으면 업로드 전에 503을 반환한다', async () => {
  resetMock();
  const saved = env.workflowAgents.announcementExtractors[2].agentId;
  env.workflowAgents.announcementExtractors[2].agentId = '';
  let response;
  try {
    response = await nativeFetch(`${base}/api/agents/announcement-decomposition`, {
      method: 'POST', body: uploadForm(Buffer.from('original'), 'announcement.hwpx'),
    });
  } finally {
    env.workflowAgents.announcementExtractors[2].agentId = saved;
  }
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'E_AGENT_NOT_SET');
  assert.equal(state.uploads.length, 0);
});

test('WPS/Submission의 유효 JSON 부재와 Upstage 실패는 502로 반환한다', async () => {
  resetMock(['사족만 있고 JSON이 없습니다.']);
  const invalid = await nativeFetch(`${base}/api/agents/wps-cp-decomposer`, {
    method: 'POST', body: uploadForm(Buffer.from('{}'), 'input.json', 'application/json'),
  });
  assert.equal(invalid.status, 502);
  assert.equal((await invalid.json()).error.code, 'E_AGENT_OUTPUT_INVALID');

  resetMock(['unused']);
  state.failNextJob = true;
  const failed = await nativeFetch(`${base}/api/agents/submission-compliance`, {
    method: 'POST', body: uploadForm(Buffer.from('{}'), 'input.json', 'application/json'),
  });
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).error.code, 'E_UPSTREAM_STUDIO');
});

test('Company Agent의 GO/NO-GO 외 사족 응답은 502로 거부한다', async () => {
  resetMock(['판단 결과는 GO입니다.']);
  const response = await nativeFetch(`${base}/api/agents/company-bid-fit`, {
    method: 'POST', body: uploadForm(Buffer.from('{}'), 'input.json', 'application/json'),
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'E_AGENT_OUTPUT_INVALID');
});

test('신규 API는 UPSTAGE_AGENT_API_KEY가 없으면 기존 키로 대체하지 않는다', async () => {
  resetMock(['GO']);
  const saved = env.workflowAgents.apiKey;
  env.workflowAgents.apiKey = '';
  const response = await nativeFetch(`${base}/api/agents/company-bid-fit`, {
    method: 'POST', body: uploadForm(Buffer.from('{}'), 'input.json', 'application/json'),
  });
  env.workflowAgents.apiKey = saved;
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'E_AGENT_API_NOT_CONFIGURED');
  assert.equal(state.jobRequests.length, 0);
});

test('멈춘 Upstage 요청은 timeout으로 중단하고 비멱등 POST는 자동 재시도하지 않는다', async () => {
  resetMock(['GO']);
  state.uploadStatus = 503;
  let response = await nativeFetch(`${base}/api/agents/company-bid-fit`, {
    method: 'POST', body: uploadForm(Buffer.from('{}'), 'input.json', 'application/json'),
  });
  assert.equal(response.status, 502);
  assert.equal(state.uploadAttempts, 1, '파일 업로드 POST는 중복 호출하지 않는다');

  resetMock(['GO']);
  state.jobCreateStatus = 503;
  response = await nativeFetch(`${base}/api/agents/company-bid-fit`, {
    method: 'POST', body: uploadForm(Buffer.from('{}'), 'input.json', 'application/json'),
  });
  assert.equal(response.status, 502);
  assert.equal(state.uploadAttempts, 1);
  assert.equal(state.jobCreateAttempts, 1, 'Job 생성 POST는 중복 호출하지 않는다');

  resetMock(['GO']);
  state.hangPoll = true;
  const savedTimeout = env.workflowAgents.pollTimeoutMs;
  env.workflowAgents.pollTimeoutMs = 25;
  try {
    response = await nativeFetch(`${base}/api/agents/company-bid-fit`, {
      method: 'POST', body: uploadForm(Buffer.from('{}'), 'input.json', 'application/json'),
    });
  } finally {
    env.workflowAgents.pollTimeoutMs = savedTimeout;
  }
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'E_STUDIO_TIMEOUT');
});
