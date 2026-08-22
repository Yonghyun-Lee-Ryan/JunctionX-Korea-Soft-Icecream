import { DOC_TYPES, HEAD_CHARS, TITLE_HEAD, TITLE_TAIL, MIN_SCORE, MIN_MARGIN, normalize } from '../config/docTypes.js';

/**
 * 규칙 분류. 🔴 억지로 하나를 고르지 않는다 —
 * 점수가 낮거나 1·2등이 붙어 있으면 key를 null로 두고 후보를 그대로 넘긴다.
 * (기획안 5-5 「지어내지 않기」와 같은 규율이다)
 */
export function classifyByRules(rawText) {
  const norm = normalize(rawText);
  const head = norm.slice(0, HEAD_CHARS);

  const scored = DOC_TYPES.map((t) => {
    const denied = t.deny.some((d) => norm.includes(normalize(d)));

    const matchedTitles = t.title.filter((p) => norm.includes(normalize(p)));
    const inHead = matchedTitles.some((p) => head.includes(normalize(p)));
    const matchedSupport = t.support.filter((p) => norm.includes(normalize(p)));

    // 🔴 표제가 앞부분에 있으면 제 무게, 뒤에서만 걸리면 인용으로 보고 깎는다
    const titleScore = matchedTitles.length === 0 ? 0 : (inHead ? TITLE_HEAD : TITLE_TAIL);
    const score = denied ? 0 : titleScore + matchedSupport.length;

    return {
      key: t.key,
      label: t.label,
      score,
      denied,
      matched: [...matchedTitles, ...matchedSupport],
    };
  }).sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  const margin = best.score - (second?.score ?? 0);
  const decided = best.score >= MIN_SCORE && margin >= MIN_MARGIN;

  return {
    key: decided ? best.key : null,
    label: decided ? best.label : null,
    confidence: !decided ? 'unknown' : margin >= MIN_SCORE ? 'high' : 'low',
    score: best.score,
    margin,
    matched: decided ? best.matched : [],
    candidates: scored.filter((s) => s.score > 0).slice(0, 3).map(({ key, label, score }) => ({ key, label, score })),
  };
}
