import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

import { cell, chipCell, cellText, rowText } from '../src/config/kitCells.js';
import { buildXlsx, contentDisposition } from '../src/services/xlsx.service.js';
import { KIT_PAGES, KIT_PRIMARY_ACTION, KIT_SECONDARY_ACTION } from '../src/config/kitPages.js';

/**
 * 🔴 이 계약에는 테스트가 한 줄도 없었다. 그래서 객체 셀이 xlsx에 생 JSON으로 찍히는 동안
 *    백엔드 39개 테스트가 전부 초록이었다. 여기서 지키는 것은 «봉투가 파일까지 살아 가는가»다.
 */

test('셀은 문자열이거나 {text,tone,chip}이고, 글자는 언제나 뽑을 수 있다', () => {
  assert.equal(cell('평문'), '평문');
  assert.deepEqual(chipCell('준비됨', 'ok'), { text: '준비됨', tone: 'ok', chip: true });
  assert.equal(cellText('평문'), '평문');
  assert.equal(cellText({ text: '준비됨', tone: 'ok' }), '준비됨');
  assert.equal(cellText(null), '');
  assert.deepEqual(rowText(['a', { text: 'b' }, null]), ['a', 'b', '']);
});

test('🔴 객체 셀을 exceljs에 그대로 넘기면 생 JSON이 찍힌다 — rowText가 그걸 막는다', async () => {
  const raw = new ExcelJS.Workbook();
  raw.addWorksheet('s').addRow(['x', { text: '준비됨', tone: 'ok', chip: true }]);
  const rawCell = raw.getWorksheet('s').getRow(1).getCell(2).value;
  // 「빈 칸」이 아니다 — 사람이 읽을 수 없는 값이 들어간다
  assert.notEqual(rawCell, '준비됨');

  const buf = await buildXlsx([{
    id: 't', title: 'T', columns: ['a', 'b'],
    rows: [['x', chipCell('준비됨', 'ok')]],
  }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  assert.equal(wb.getWorksheet('t').getRow(3).getCell(2).value, '준비됨');
});

test('🔴 warnings와 columns도 객체를 견딘다', async () => {
  const buf = await buildXlsx([{
    id: 't', title: 'T',
    columns: ['평문', { text: '상태', tone: 'muted' }],
    warnings: [{ text: '검산 실패', tone: 'danger' }],
    rows: [['1', '2']],
  }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('t');
  assert.equal(ws.getRow(1).getCell(1).value, '검산 실패');
  assert.equal(ws.getRow(2).getCell(2).value, '상태');
});

test('🔴 columnAlign은 화면에만이 아니라 파일에도 간다', async () => {
  const buf = await buildXlsx([{
    id: 't', title: 'T',
    columns: ['이름', '쪽'],
    columnAlign: ['left', 'right'],
    rows: [['가', '47']],
  }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet('t');
  assert.equal(ws.getColumn(2).alignment?.horizontal, 'right');
  assert.notEqual(ws.getColumn(1).alignment?.horizontal, 'right');
});

test('🔴 「M/M」이 든 제목이 경로처럼 보이는 파일명을 만들지 않는다', () => {
  const h = contentDisposition('M/M 예상 원가 (추천).xlsx');
  assert.ok(!/filename="[^"]*\//.test(h), `슬래시가 남았다: ${h}`);
  assert.match(h, /filename\*=UTF-8''/);
});

test('페이지 구성이 네 장이고 버튼 문구가 전부 있다', () => {
  assert.deepEqual(KIT_PAGES.map((p) => p.id), ['files', 'compliance', 'wbs', 'submit']);
  // 🔴 파일제출은 보조 버튼이 「임시저장」이 아니다 — 저장할 원고가 아직 없다
  assert.equal(KIT_SECONDARY_ACTION.files, '나중에');
  for (const p of KIT_PAGES) {
    assert.ok(KIT_PRIMARY_ACTION[p.id], `${p.id} 1차 버튼 문구 없음`);
    assert.ok(KIT_SECONDARY_ACTION[p.id], `${p.id} 2차 버튼 문구 없음`);
  }
  // 제출준비의 배너와 큰 표는 열 위에 전폭으로 얹힌다
  const submit = KIT_PAGES.find((p) => p.id === 'submit');
  assert.deepEqual(submit.tabs.filter((t) => t.span === 'full').map((t) => t.id),
    ['constraints', 'checklist']);
});
