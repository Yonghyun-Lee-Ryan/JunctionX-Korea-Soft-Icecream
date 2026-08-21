import ExcelJS from 'exceljs';

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

    const warnings = (tab.warnings ?? []).join(' · ');
    ws.addRow([warnings]);
    if (warnings) ws.getRow(1).font = { color: { argb: 'FFB02828' }, bold: true };

    ws.addRow(tab.columns ?? []);
    ws.getRow(2).font = { bold: true };

    for (const row of tab.rows ?? []) ws.addRow(row);

    (tab.columns ?? []).forEach((c, i) => {
      const width = Math.min(60, Math.max(10, String(c).length * 2 + 6));
      ws.getColumn(i + 1).width = width;
    });
  }

  if (wb.worksheets.length === 0) wb.addWorksheet('empty');
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** 🔴 한글 파일명 — G2B에서 겪은 percent-encoding이 우리 응답에도 온다 */
export function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
