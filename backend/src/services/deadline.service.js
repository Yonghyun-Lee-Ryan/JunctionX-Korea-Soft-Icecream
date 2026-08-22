/**
 * 공고의 마감 문자열을 읽어 «지났는가»와 «영업일로 며칠 남았는가»를 낸다.
 *
 * 🔴 실측: 데모 공고의 마감(2025-03-14)이 지났는데 헤더가 목록에서 받은 「영업일 D-0」을 그대로 보여 줬다.
 *    마감은 공고 해부가 인쇄된 표기 그대로 남긴 문자열이라(「2025년 3월 14일(금) 11:00까지」, 「2026. 08. 24(월) 10:30」)
 *    읽는 시점에 서버가 계산한다 — 저장된 D-값은 하루만 지나도 틀린다.
 * 🔴 못 읽으면 null — 지났다고도 안 지났다고도 하지 않는다. 시각이 없으면 그날 끝(23:59:59 KST)으로 본다.
 * 🔴 영업일은 주말만 뺀다. 공휴일은 반영하지 않는다 — 화면이 그 사실을 말한다.
 */
const KST_OFFSET_MS = 9 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');

export function parseDeadline(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // 2025년 3월 14일(금) 11:00까지 · 2026. 08. 24(월) 10:30 · 2026-09-02 18:00 · 2026.09.02 18:00 · 2026년 9월 2일 18시
  const m = s.match(/(20\d{2})\s*[.년\-/]\s*(\d{1,2})\s*[.월\-/]\s*(\d{1,2})\s*일?/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const rest = s.slice(m.index + m[0].length);
  const t = rest.match(/(\d{1,2})\s*[:시]\s*(\d{2})?/);
  let hh = 23; let mi = 59; let ss = 59;
  if (t) { hh = Number(t[1]); mi = Number(t[2] ?? 0); ss = 0; }
  if (hh > 23 || mi > 59) return null;
  const date = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** KST 달력 날짜(자정 UTC 로 표현) */
const kstDay = (date) => {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
};
const ymd = (date) => new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** 오늘 이후 ~ 마감일까지의 평일 수 (오늘은 세지 않는다, 마감 당일은 센다) */
export function businessDaysBetween(now, deadline) {
  let day = kstDay(now);
  const end = kstDay(deadline);
  let count = 0;
  while (day < end) {
    day += 86400000;
    const dow = new Date(day).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

export function deadlineStatus(raw, now = new Date()) {
  const at = parseDeadline(raw);
  if (!at) return { deadlineAt: null, passed: null, businessDaysLeft: null, label: '' };
  const passed = at.getTime() <= now.getTime();
  const businessDaysLeft = passed ? 0 : businessDaysBetween(now, at);
  return {
    deadlineAt: at.toISOString(),
    passed,
    businessDaysLeft,
    label: passed ? `마감 지남 (${ymd(at)})` : `영업일 D-${businessDaysLeft}`,
  };
}
