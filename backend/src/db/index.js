import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let db;

export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(env.databaseFile), { recursive: true });
  db = new Database(env.databaseFile);

  // WAL: 폴링이 초당 여러 번 읽는 동안 쓰기가 막히지 않게
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  logger.info('db_opened', { file: env.databaseFile });
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = undefined; }
}

/** JSON 컬럼을 안전하게 푼다 — 깨진 값 하나가 응답 전체를 죽이지 않게 */
export function parseJson(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}
