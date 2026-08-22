import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import * as caseRepo from '../src/repositories/case.repo.js';
import { parseDeadline, deadlineStatus } from '../src/services/deadline.service.js';

// ── 2-5 마감이 지난 공고 — 공고의 마감 문자열을 읽어 «지났다»를 서버가 말한다 ──
const NOW = new Date('2026-08-23T03:00:00+09:00');   // 일요일

test('parseDeadline — 공고문에 인쇄된 여러 표기를 읽는다 (KST)', () => {
  assert.equal(parseDeadline('2025년 3월 14일(금) 11:00까지')?.toISOString(), '2025-03-14T02:00:00.000Z');
  assert.equal(parseDeadline('2026. 08. 24(월) 10:30')?.toISOString(), '2026-08-24T01:30:00.000Z');
  assert.equal(parseDeadline('2026-09-02 18:00')?.toISOString(), '2026-09-02T09:00:00.000Z');
  assert.equal(parseDeadline('2026.09.02 18:00')?.toISOString(), '2026-09-02T09:00:00.000Z');
  assert.equal(parseDeadline('2026년 9월 2일 18시')?.toISOString(), '2026-09-02T09:00:00.000Z');
  // 시각이 없으면 그날 자정 직전이 아니라 «그날 00:00»이 아니라 — 마감은 보수적으로 그날 끝으로 본다
  assert.equal(parseDeadline('2026년 9월 2일')?.toISOString(), '2026-09-02T14:59:59.000Z');
  assert.equal(parseDeadline(''), null);
  assert.equal(parseDeadline('입찰공고문 참조'), null, '날짜가 아니면 지어내지 않는다');
});

test('deadlineStatus — 지난 마감은 passed, 남은 영업일은 주말 빼고 센다', () => {
  const past = deadlineStatus('2025년 3월 14일(금) 11:00까지', NOW);
  assert.equal(past.passed, true);
  assert.equal(past.deadlineAt, '2025-03-14T02:00:00.000Z');
  assert.equal(past.businessDaysLeft, 0);
  assert.ok(past.label.includes('2025-03-14'), past.label);

  const soon = deadlineStatus('2026. 08. 24(월) 10:30', NOW);   // 일요일 새벽 → 월요일 마감 = 영업일 1
  assert.equal(soon.passed, false);
  assert.equal(soon.businessDaysLeft, 1);

  const later = deadlineStatus('2026-09-02 18:00', NOW);         // 8/24~9/2 평일 8일
  assert.equal(later.passed, false);
  assert.equal(later.businessDaysLeft, 8);

  assert.deepEqual(deadlineStatus('', NOW), { deadlineAt: null, passed: null, businessDaysLeft: null, label: '' });
  assert.equal(deadlineStatus('공고문 참조', NOW).passed, null, '못 읽으면 모른다고 한다 — 지났다고도 안 지났다고도 하지 않는다');
});

// ── 봉투: 읽는 시점에 계산한다 (저장된 날짜가 아니라 «오늘» 기준) ──
migrate();
const app = createApp();
const server = app.listen(0);
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('GET /api/cases/{id} — 헤더에 deadlineAt·deadlinePassed·daysLeft 를 서버가 붙인다', async () => {
  caseRepo.upsertCase({ id: 'R25DL00000001-000', bid_pbanc_no: 'R25DL00000001', bid_pbanc_ord: '000', status: 'done', source: 'live', verdict_json: '{}', meta_json: JSON.stringify({ header: { title: '지난 공고', deadline: '2025년 3월 14일(금) 11:00까지' }, pipeline: { ranAt: new Date().toISOString() } }) });
  const f = await fetch(`${base}/api/cases/R25DL00000001-000`).then((r) => r.json());
  assert.equal(f.deadline, '2025년 3월 14일(금) 11:00까지');
  assert.equal(f.deadlineAt, '2025-03-14T02:00:00.000Z');
  assert.equal(f.deadlinePassed, true);
  assert.equal(f.daysLeft, 0);

  caseRepo.upsertCase({ id: 'R25DL00000002-000', bid_pbanc_no: 'R25DL00000002', bid_pbanc_ord: '000', status: 'done', source: 'live', verdict_json: '{}', meta_json: JSON.stringify({ header: { title: '먼 공고', deadline: '2099년 1월 5일(월) 10:00' } }) });
  const g = await fetch(`${base}/api/cases/R25DL00000002-000`).then((r) => r.json());
  assert.equal(g.deadlinePassed, false);
  assert.ok(g.daysLeft > 1000);

  caseRepo.upsertCase({ id: 'R25DL00000003-000', bid_pbanc_no: 'R25DL00000003', bid_pbanc_ord: '000', status: 'done', source: 'live', verdict_json: '{}', meta_json: JSON.stringify({ header: { title: '마감 모름' } }) });
  const h = await fetch(`${base}/api/cases/R25DL00000003-000`).then((r) => r.json());
  assert.equal('deadlinePassed' in h, false, '모르면 필드를 만들지 않는다');
});
