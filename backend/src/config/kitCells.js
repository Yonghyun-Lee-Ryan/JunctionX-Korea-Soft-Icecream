/**
 * 봉투 표의 **셀**.
 *
 * 🔴 셀은 문자열이거나 `{ text, tone, chip }` 객체다.
 *    프론트가 «준비됨이면 초록»처럼 값을 보고 색을 정하면, 문구가 바뀌는 순간 색이 죽는다.
 *    색을 정하는 건 값을 아는 쪽(서버)이고, 화면은 받은 tone을 그릴 뿐이다.
 *
 * tone: default | proviso | ok | warn | danger | muted
 */
export const TONES = ['default', 'proviso', 'ok', 'warn', 'danger', 'muted'];

/** 표 셀 하나 */
export function cell(text, tone = 'default', { chip = false } = {}) {
  if (tone === 'default' && !chip) return String(text ?? '');
  return { text: String(text ?? ''), tone, chip };
}

/** 칩으로 그릴 셀 */
export const chipCell = (text, tone) => cell(text, tone, { chip: true });

/**
 * 셀에서 글자만 뽑는다.
 * 🔴 xlsx는 색을 모른다 — 객체를 그대로 넘기면 exceljs가 셀을 통째로 망친다.
 */
export function cellText(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'object') return String(c.text ?? '');
  return String(c);
}

/** 행 하나를 글자 배열로 */
export const rowText = (row) => (Array.isArray(row) ? row.map(cellText) : []);
