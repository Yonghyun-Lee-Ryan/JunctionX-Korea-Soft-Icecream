import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// env.js 는 import 시점에 .env 를 읽어 고정된다 — 자식 프로세스로 띄워서 변수 이름을 검증한다
function loadEnv(vars) {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    "import { env, envReport } from './src/config/env.js'; console.log(JSON.stringify({ studioKey: env.studio.apiKey, agentKey: env.studio.agentApiKey, solarKey: env.solar.apiKey, report: envReport() }));"],
    { cwd: new URL('..', import.meta.url), env: { ...process.env, ...vars }, encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

test('env — 공고 해부·회사 카드·Solar 는 UPSTAGE_AGENT_API_KEY, 기존 /api/docs 는 UPSTAGE_API_KEY', () => {
  const e = loadEnv({ UPSTAGE_API_KEY: 'team-key', UPSTAGE_AGENT_API_KEY: 'jw-key' });
  assert.equal(e.studioKey, 'team-key');
  assert.equal(e.agentKey, 'jw-key');
  assert.equal(e.solarKey, 'jw-key');
  assert.equal(e.report.agentKeyReady, true);
  assert.equal(e.report.solarReady, true);
});

test('env — UPSTAGE_AGENT_API_KEY 가 없으면 UPSTAGE_API_KEY 로 조용히 대신하지 않는다', () => {
  const e = loadEnv({ UPSTAGE_API_KEY: 'team-key', UPSTAGE_AGENT_API_KEY: '' });
  assert.equal(e.agentKey, '');
  assert.equal(e.solarKey, '');
  assert.equal(e.report.agentKeyReady, false);
  assert.equal(e.report.solarReady, false);
  assert.equal(e.report.studioReady, true);
});
