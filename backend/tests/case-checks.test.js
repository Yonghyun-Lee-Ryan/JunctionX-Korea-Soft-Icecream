import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import * as caseRepo from '../src/repositories/case.repo.js';

// ── 2: 요구사항 체크리스트의 체크를 서버가 기억한다 — 화면 로컬 상태는 탭을 나가면 사라졌다(실측) ──
migrate();
const CASE = 'R25CHECK000001-000';
const TABS = [
  { id: 'compliance', title: '요구사항 체크리스트', kind: 'checklist', columns: ['요구사항 ID', '분류', '명칭', '단서', '근거 페이지'], rows: [['SFR-001', '기능', '로그인', '-', '3p'], ['SFR-002', '기능', '검색', '-', '4p']] },
  { id: 'wbs', title: 'WBS', kind: 'table', columns: ['ID'], rows: [['1.1']] },
];
function seed() {
  caseRepo.upsertCase({ id: CASE, bid_pbanc_no: 'R25CHECK000001', bid_pbanc_ord: '000', company_id: null, status: 'done', source: 'live', verdict_json: '{"badge":"eligible"}', meta_json: '{}' });
  caseRepo.clearTabs(CASE);
  TABS.forEach((t, i) => caseRepo.upsertTab(CASE, t, i));
}
seed();

const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const put = (caseId, tabId, body) => fetch(`${base}/api/cases/${caseId}/checks/${tabId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const get = () => fetch(`${base}/api/cases/${CASE}`).then((r) => r.json());
const tabOf = (f, id) => f.tabs.find((t) => t.id === id);

test('🔴 PUT /api/cases/{id}/checks/{tab} — 체크를 저장하고, 봉투의 그 탭에 checked[] 로 돌아온다', async () => {
  const r = await put(CASE, 'compliance', { key: 'SFR-001', checked: true });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { caseId: CASE, tabId: 'compliance', checked: ['SFR-001'] });
  const f = await get();
  assert.deepEqual(tabOf(f, 'compliance').checked, ['SFR-001']);
  assert.equal(tabOf(f, 'wbs').checked, undefined, '체크가 없는 탭은 필드를 만들지 않는다');
});

test('체크 해제는 목록에서 뺀다 — 같은 키를 두 번 눌러도 한 번만 남는다', async () => {
  await put(CASE, 'compliance', { key: 'SFR-002', checked: true });
  await put(CASE, 'compliance', { key: 'SFR-002', checked: true });
  assert.deepEqual(tabOf(await get(), 'compliance').checked, ['SFR-001', 'SFR-002']);
  const r = await put(CASE, 'compliance', { key: 'SFR-001', checked: false });
  assert.deepEqual((await r.json()).checked, ['SFR-002']);
  assert.deepEqual(tabOf(await get(), 'compliance').checked, ['SFR-002']);
});

test('🔴 판정을 다시 돌려 탭을 다시 저장해도 체크는 남는다 — 탭과 따로 둔다', async () => {
  caseRepo.clearTabs(CASE);
  TABS.forEach((t, i) => caseRepo.upsertTab(CASE, t, i));
  assert.deepEqual(tabOf(await get(), 'compliance').checked, ['SFR-002']);
});

test('없는 케이스는 404 · key 가 없거나 checked 가 불리언이 아니면 400', async () => {
  assert.equal((await put('R00NOPE0000000-000', 'compliance', { key: 'SFR-001', checked: true })).status, 404);
  assert.equal((await put(CASE, 'compliance', { checked: true })).status, 400);
  assert.equal((await put(CASE, 'compliance', { key: 'SFR-001', checked: 'yes' })).status, 400);
});
