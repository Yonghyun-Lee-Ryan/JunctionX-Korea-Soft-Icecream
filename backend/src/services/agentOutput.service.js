const OPEN_TO_CLOSE = { '{': '}', '[': ']' };

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function parseContainer(candidate, { objectOnly }) {
  try {
    const value = JSON.parse(candidate);
    if (objectOnly && !isPlainObject(value)) return null;
    if (!objectOnly && !isPlainObject(value) && !Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Agent가 JSON 앞뒤에 설명이나 Markdown fence를 붙여도 가장 큰 JSON container만 복구한다.
 * 문자열 내부의 괄호와 escape를 추적하므로 greedy 정규식보다 안전하다.
 */
export function extractJsonValue(raw, { objectOnly = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  const direct = parseContainer(text, { objectOnly });
  if (direct !== null) return direct;

  const candidates = [];
  for (let start = 0; start < text.length; start += 1) {
    if (!(text[start] in OPEN_TO_CLOSE)) continue;

    const stack = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char in OPEN_TO_CLOSE) {
        stack.push(OPEN_TO_CLOSE[char]);
        continue;
      }
      if (char !== '}' && char !== ']') continue;
      if (stack.at(-1) !== char) break;
      stack.pop();
      if (stack.length > 0) continue;

      const source = text.slice(start, index + 1);
      const value = parseContainer(source, { objectOnly });
      if (value !== null) candidates.push({ start, length: source.length, value });
      break;
    }
  }

  candidates.sort((a, b) => b.length - a.length || a.start - b.start);
  return candidates[0]?.value ?? null;
}

export function extractJsonFromTexts(texts, options) {
  for (const text of [...texts].reverse()) {
    const value = extractJsonValue(text, options);
    if (value !== null) return value;
  }
  return null;
}

function scalarKey(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/gu, ' ');
    return normalized ? normalized : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

const TABLE_IDENTITIES = {
  scope_items: { fields: ['scope_role', 'scope_item'] },
  requirement_summary: { primary: 'category_code', fields: ['category_name'] },
  requirements: { primary: 'requirement_id', fields: ['requirement_category', 'requirement_name'] },
  execution_context: { fields: ['context_type', 'title', 'content'] },
  execution_conditions: { fields: ['condition_category', 'condition'] },
  // rule_id/item_id는 청크마다 ELIG-001/SUB-001로 다시 매겨질 수 있어 primary로 쓰지 않는다.
  eligibility_rules: {
    decisiveFields: ['condition'],
    fields: ['eligibility_type', 'required_evidence'],
  },
  evaluation_items: { fields: ['evaluation_section', 'evaluation_item'] },
  submission_requirements: { fields: ['item_type', 'name', 'submission_stage', 'requirement'] },
};
const GENERIC_IDENTITY = {
  primary: 'id',
  fields: ['source_ref', 'source_reference', 'field', 'topic', 'name', 'title', 'key', 'code'],
};

function recordsCompatible(existing, incoming, spec) {
  const existingPrimary = scalarKey(existing[spec.primary]);
  const incomingPrimary = scalarKey(incoming[spec.primary]);
  if (existingPrimary !== null && incomingPrimary !== null) {
    return existingPrimary === incomingPrimary ? 'primary-match' : 'conflict';
  }

  // 자격 조건처럼 본문 자체가 행을 식별하는 경우, 같은 본문이면 다른 셀의
  // 충돌은 "동일 행의 앞 값 우선"으로 처리한다. 본문 한쪽이 비었을 때만
  // 증빙/유형을 보조 anchor로 사용한다.
  let decisiveShared = 0;
  for (const field of spec.decisiveFields ?? []) {
    const left = scalarKey(existing[field]);
    const right = scalarKey(incoming[field]);
    if (left === null || right === null) continue;
    if (left !== right) return 'conflict';
    decisiveShared += 1;
  }
  if (decisiveShared > 0) return 'compatible';

  let shared = 0;
  for (const field of spec.fields) {
    const left = scalarKey(existing[field]);
    const right = scalarKey(incoming[field]);
    if (left === null || right === null) continue;
    if (left !== right) return 'conflict';
    shared += 1;
  }
  return shared > 0 ? 'compatible' : 'unknown';
}

function findMatchingRow(rows, incoming, tableName) {
  const exact = rows.findIndex((existing) => JSON.stringify(existing) === JSON.stringify(incoming));
  if (exact >= 0) return exact;

  const spec = TABLE_IDENTITIES[tableName] ?? GENERIC_IDENTITY;
  const candidates = [];
  for (let index = 0; index < rows.length; index += 1) {
    const relation = recordsCompatible(rows[index], incoming, {
      primary: spec.primary ?? '__no_primary__',
      fields: spec.fields,
      decisiveFields: spec.decisiveFields,
    });
    if (relation === 'primary-match') return index;
    if (relation === 'compatible') candidates.push(index);
  }
  return candidates.length === 1 ? candidates[0] : -1;
}

function isEmpty(value, path) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return path.at(-1) === 'requirement_count' && value === 0;
}

function mergeArrays(earlier, later, path, mode) {
  if (earlier.length === 0) return mode === 'fill' ? clone(earlier) : clone(later);
  if (later.length === 0) return clone(earlier);

  const result = clone(earlier);
  const tableName = path.at(-1);
  const objectRows = [...earlier, ...later].every((value) => isPlainObject(value));

  if (!objectRows) {
    if (mode === 'fill') return result;
    for (const value of later) {
      if (!result.some((existing) => JSON.stringify(existing) === JSON.stringify(value))) {
        result.push(clone(value));
      }
    }
    return result;
  }

  later.forEach((incoming) => {
    const match = findMatchingRow(result, incoming, tableName);
    if (match < 0) {
      if (mode !== 'fill') result.push(clone(incoming));
      return;
    }
    result[match] = mergeValues(result[match], incoming, [...path, match], mode);
  });
  return result;
}

function mergeValues(earlier, later, path, mode) {
  if (isEmpty(earlier, path)) return clone(later);
  if (later === null || later === undefined) return clone(earlier);
  if (Array.isArray(earlier) && Array.isArray(later)) {
    return mergeArrays(earlier, later, path, mode);
  }
  if (isPlainObject(earlier) && isPlainObject(later)) {
    const result = clone(earlier);
    for (const [key, value] of Object.entries(later)) {
      const merged = Object.hasOwn(result, key)
        ? mergeValues(result[key], value, [...path, key], mode)
        : clone(value);
      Object.defineProperty(result, key, {
        value: merged,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  }
  return clone(earlier);
}

/** 청크 순서대로 호출한다. 충돌은 earlier, 빈 값은 later가 채운다. */
export function mergeAnnouncementData(earlier, later) {
  if (earlier === undefined || earlier === null) return clone(later);
  return mergeValues(earlier, later, [], 'merge');
}

/** 재탐색 결과는 기존 빈 값만 채우며 기존 근거를 덮어쓰지 않는다. */
export function fillAnnouncementGaps(original, retry) {
  return mergeValues(original, retry, [], 'fill');
}

const ANNOUNCEMENT_TABLE_COLUMNS = {
  scope_items: ['scope_role', 'service_component', 'scope_category', 'scope_item', 'responsible_party', 'source_reference'],
  requirement_summary: ['category_code', 'category_name', 'declared_count'],
  requirements: ['requirement_id', 'requirement_category', 'requirement_name', 'detailed_content', 'scope_role', 'service_component', 'source_reference'],
  execution_context: ['context_type', 'title', 'content', 'relationships_and_flow', 'timing', 'scope_role', 'source_reference'],
  execution_conditions: ['condition_category', 'condition', 'responsible_party', 'related_requirement_id', 'source_reference'],
  eligibility_rules: ['rule_id', 'eligibility_type', 'condition', 'required_evidence', 'gate_level', 'mandatory', 'joint_fulfillment_allowed', 'source_reference'],
  evaluation_items: ['evaluation_section', 'evaluation_item', 'criteria', 'score', 'evaluation_type', 'source_reference'],
  submission_requirements: ['item_type', 'item_id', 'name', 'requirement', 'deadline_or_validity', 'submission_stage', 'method_or_format', 'quantity_or_limit', 'condition_or_note', 'template_id', 'signature_or_seal', 'mandatory', 'source_reference'],
};

function rowHasBlankCell(value, expectedFields = []) {
  if (!isPlainObject(value)) return false;
  if (expectedFields.some((field) => !Object.hasOwn(value, field))) return true;
  for (const cell of Object.values(value)) {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === 'string' && cell.trim() === '') return true;
    if (isPlainObject(cell) && rowHasBlankCell(cell)) return true;
  }
  return false;
}

/** 객체 배열을 테이블로 보고, 존재하는 레코드의 빈 scalar cell만 찾는다. */
export function findEmptyTableRows(value, path = [], found = []) {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => isPlainObject(item))) {
      const tableName = path.at(-1);
      const expectedFields = ANNOUNCEMENT_TABLE_COLUMNS[tableName]
        ?? [...new Set(value.flatMap((row) => Object.keys(row)))];
      value.forEach((row, index) => {
        if (rowHasBlankCell(row, expectedFields)) found.push([...path, index]);
      });
    }
    value.forEach((item, index) => findEmptyTableRows(item, [...path, index], found));
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      findEmptyTableRows(child, [...path, key], found);
    }
  }
  return found;
}
