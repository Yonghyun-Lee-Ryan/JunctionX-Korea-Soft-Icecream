import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';

migrate();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
test.after(() => server.close());

test('GET /health — 키가 없어도 200', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.studioReady, 'boolean');
});

test('GET /openapi.json — 스펙에 두 봉투가 들어 있다', async () => {
  const res = await fetch(`${base}/openapi.json`);
  assert.equal(res.status, 200);
  const spec = await res.json();
  assert.ok(spec.components.schemas.Factsheet);
  assert.ok(spec.components.schemas.Screening);
  assert.ok(spec.paths['/api/cases/{caseId}']);
});

test('GET /api/cases/:caseId — 없는 건은 error.message가 완성문이다', async () => {
  const res = await fetch(`${base}/api/cases/NOPE-000`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'E_CASE_NOT_FOUND');
  assert.ok(body.error.message.length > 10);
});

test('POST /api/cases — 잘못된 공고번호는 400', async () => {
  const res = await fetch(`${base}/api/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bidPbancNo: 'x' }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'E_VALIDATION');
});
