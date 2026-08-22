/**
 * 제안서 원고의 금지 표현 전수 검색 — 백엔드가 직접 한다.
 *
 * 🔴 실측(2026-08-23): 견본 원고에 「가능합니다」「고려할 수 있습니다」「지원 가능」이 심겨 있는데 Solar 스캔은 hits 0 을 돌려줬다.
 *    모델에만 맡기면 「0곳」이 거짓이 된다. 표현 목록은 스캔 프롬프트(agent/Submission Auditor.json)의 것과 같고,
 *    공고 규칙(SUBMISSION_RULES_V2)이 더 주면 합친다. 걸린 문장은 원문 그대로, 쪽은 PDF 텍스트 레이어의 쪽이다.
 * 🔴 문장을 고쳐 주지 않는다 — 자리만 짚는다. 인용문(「」·""·『』 안)은 뺀다 — 우리가 쓴 문장만 대상이다.
 * 🔴 PDF 텍스트 레이어는 «행»마다 줄바꿈이 들어온다(실측: 「외부 LLM 서비\n스와의 연계도 가능합니다.」). 줄바꿈은 문장 경계가 아니다 —
 *    제목·목록 줄만 따로 두고 나머지는 이어 붙인 뒤 문장 부호로 가른다.
 */

// 긴 표현이 먼저 — 「고려할 수 있습니다」가 「가능」류보다 앞서 잡히게
export const DEFAULT_FORBIDDEN = [
  '고려할 수 있습니다', '고려할 수 있다', '검토할 수 있습니다', '검토할 수 있다',
  '협의 후 결정', '필요시 제공', '필요 시 제공', '지원 가능',
  '할 예정입니다', '할 예정이다', '예정입니다', '예정이다',
  '노력하겠습니다', '노력한다',
  '가능합니다', '가능하다', '가능함',
];

const QUOTED = /"[^"]*"|“[^”]*”|「[^」]*」|『[^』]*』/g;
const SENTENCE_END = /[.。!?]$/;
// 제목·목록의 줄머리 — 「2.3 연계 방안」「① …」「- …」「(1) …」「가. …」「제3조 …」
const HEADING = /^(\d+(\.\d+)*\.?\s|[①-⑳]|[-•·□■◦▪]\s?|\(\d+\)\s?|[가-힣]\.\s|제\s*\d+\s*[조장절항])/;
const HANGUL_END = /[가-힣]$/;
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** 행을 문장으로 — 제목·목록 줄은 따로, 행 바꿈은 이어 붙인다(줄 끝에 공백이 있었으면 띄어서, 없으면 단어 중간으로 보고 붙여서), 그 뒤 문장 부호로 가른다 */
export function splitSentences(text) {
  const rawLines = String(text ?? '').split(/\r?\n/);
  const chunks = [];
  let buf = '';
  let prevHadTrailingSpace = false;
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ''; };
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (HEADING.test(line)) {
      flush();
      buf = line;
      if (!SENTENCE_END.test(line) && line.length <= 40) flush();   // 짧은 제목·목록 머리는 한 줄이 한 조각
      prevHadTrailingSpace = /\s$/.test(raw);
      continue;
    }
    if (!buf) buf = line;
    else buf += (prevHadTrailingSpace || !HANGUL_END.test(buf) || !/^[가-힣]/.test(line) ? ' ' : '') + line;
    prevHadTrailingSpace = /\s$/.test(raw);
    if (SENTENCE_END.test(line)) flush();
  }
  flush();
  return chunks.flatMap((c) => c.split(/(?<=[^\d.][.。!?])\s+/).map((s) => s.trim()).filter(Boolean));
}

/**
 * @param {string[]} pages 쪽 단위 텍스트 (1쪽부터)
 * @param {string[]} extra 공고 규칙이 더 준 표현
 * @returns {{ expression: string, sentence: string, page: number }[]} 문장 하나에 한 번 — 먼저 걸린 표현
 */
export function scanForbidden(pages, extra = []) {
  const expressions = [...DEFAULT_FORBIDDEN, ...extra.map(squash).filter((e) => e && !DEFAULT_FORBIDDEN.includes(e))];
  const hits = [];
  (Array.isArray(pages) ? pages : []).forEach((pageText, i) => {
    for (const sentence of splitSentences(pageText)) {
      const own = squash(sentence.replace(QUOTED, ''));   // 인용 부분은 뺀 채로 본다
      const expression = expressions.find((e) => own.includes(e));
      if (expression) hits.push({ expression, sentence: squash(sentence), page: i + 1 });
    }
  });
  return hits;
}

/** 공고 규칙에서 표현 목록을 모은다 */
export function forbiddenFromRules(rules) {
  const a = Array.isArray(rules?.default_forbidden_expressions) ? rules.default_forbidden_expressions : [];
  const b = (Array.isArray(rules?.forbidden_expression_rules) ? rules.forbidden_expression_rules : []).map((r) => r?.expression ?? r);
  return [...a, ...b].map((x) => (typeof x === 'string' ? x : '')).filter(Boolean);
}
