import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config/env.js';

const cache = new Map();
const EXTRACT_DIR = path.join(ROOT, 'fixtures', 'extract');

/**
 * 🔴 스키마를 손으로 8벌 쓰지 않는다.
 *    Studio 에이전트가 실제로 뱉은 결과(fixtures/extract/*.json)에서 모양을 역산한다.
 *    에이전트 출력이 바뀌면 그 파일만 갈아 끼우면 스키마가 따라온다.
 */
function infer(value) {
  if (Array.isArray(value)) {
    return { type: 'array', items: value.length ? infer(value[0]) : { type: 'string' } };
  }
  if (value !== null && typeof value === 'object') {
    return { type: 'object', properties: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, infer(v)])) };
  }
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

/** 갈래별 추출 스키마. 없으면 null (그 갈래는 견본이 아직 없다는 뜻) */
export function schemaFor(docTypeKey) {
  if (cache.has(docTypeKey)) return cache.get(docTypeKey);
  const file = path.join(EXTRACT_DIR, `${docTypeKey}.json`);
  if (!fs.existsSync(file)) { cache.set(docTypeKey, null); return null; }
  const sample = JSON.parse(fs.readFileSync(file, 'utf8'));
  const schema = infer(sample);
  cache.set(docTypeKey, schema);
  return schema;
}

export function sampleFor(docTypeKey) {
  const file = path.join(EXTRACT_DIR, `${docTypeKey}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
