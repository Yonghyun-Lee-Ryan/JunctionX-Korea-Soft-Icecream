import ExcelJS from 'exceljs';
import { cellText, rowText } from '../config/kitCells.js';

/**
 * 🔴 탭별 빌더를 만들지 않는다 — 제너릭 한 벌 (WBS 3.5).
 *    1행 A열 = warnings를 ` · `로 이어 붙인 한 줄
 *    2행     = columns
 *    3행~    = rows
 * 탭이 3개든 4개든 같은 코드가 시트를 만든다.
 */
export async function buildXlsx(tabs) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Solar for Bid';
  wb.created = new Date();

  for (const tab of tabs) {
    // 시트 이름은 31자 제한 + / \ ? * [ ] 금지
    const safe = String(tab.id).replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'sheet';
    const ws = wb.addWorksheet(safe);

    const warnings = (tab.warnings ?? []).map(cellText).join(' · ');
    ws.addRow([warnings]);
    if (warnings) ws.getRow(1).font = { color: { argb: 'FFB02828' }, bold: true };

    ws.addRow((tab.columns ?? []).map(cellText));
    ws.getRow(2).font = { bold: true };

    // 🔴 셀이 `{text,tone}` 객체일 수 있다. 그대로 넘기면 exceljs가 그 객체를 값으로 받아
    //    셀에 `{"text":"준비됨","tone":"ok","chip":true}` 라는 **생 JSON 문자열**을 찍는다.
    //    (실측: exceljs 4.x. 빈 칸이 되는 게 아니라 사람이 읽을 수 없는 값이 들어간다.)
    for (const row of tab.rows ?? []) ws.addRow(rowText(row));

    (tab.columns ?? []).forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(60, Math.max(10, cellText(c).length * 2 + 6));
      // 🔴 «열 정렬은 서버가 정한다»는 계약은 파일에서도 지켜져야 한다.
      //    화면에서만 오른쪽이고 xlsx에서는 왼쪽이면, 같은 표가 두 곳에서 다르게 읽힌다.
      const align = (tab.columnAlign ?? [])[i];
      if (align === 'right') col.alignment = { horizontal: 'right' };
    });
  }

  if (wb.worksheets.length === 0) wb.addWorksheet('empty');
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 🔴 한글 파일명 — G2B에서 겪은 percent-encoding이 우리 응답에도 온다 */
export function contentDisposition(filename) {
  // 🔴 «M/M 예상 원가» 같은 제목에는 슬래시가 있다. 슬래시는 출력 가능 ASCII라
  //    그대로 통과해 filename="…M/M….xlsx" 가 되고, 받는 쪽이 경로로 읽는다.
  const ascii = filename.replace(/[\\/:*?"<>|]/g, '_').replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
