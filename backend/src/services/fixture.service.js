import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config/env.js';

const FIXTURES = path.join(ROOT, 'fixtures');
const cache = new Map();

/**
 * 🔴 캐시 봉투. 04_계약/*.demo.json 사본이다.
 *    UPSTAGE_API_KEY가 없거나 실호출이 늦으면 여기로 떨어진다 — 데모가 죽지 않는 마지막 층.
 */
export function loadFixture(name) {
  if (cache.has(name)) return structuredClone(cache.get(name));
  const file = path.join(FIXTURES, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  cache.set(name, parsed);
  return structuredClone(parsed);
}

/** `_주의` 같은 주석 키는 응답에서 뺀다 */
export function stripComments(obj) {
  if (Array.isArray(obj)) return obj.map(stripComments);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, stripComments(v)]),
    );
  }
  return obj;
}
