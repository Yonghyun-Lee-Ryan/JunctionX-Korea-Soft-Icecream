import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from './index.js';
import { logger } from '../config/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, 'migrations');

export function migrate() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS _migration (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(db.prepare('SELECT name FROM _migration').all().map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migration (name) VALUES (?)').run(file);
    })();
    logger.info('migration_applied', { file });
    count += 1;
  }
  if (count === 0) logger.info('migration_up_to_date', { files: files.length });
  return count;
}

// 직접 실행됐을 때만 (npm run migrate)
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  closeDb();
}
