import fs from 'node:fs';
import { env } from '../config/env.js';
import { closeDb } from './index.js';
import { migrate } from './migrate.js';
import { logger } from '../config/logger.js';

closeDb();
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const f = env.databaseFile + suffix;
  if (fs.existsSync(f)) { fs.rmSync(f); logger.warn('db_file_removed', { file: f }); }
}
migrate();
closeDb();
logger.info('db_reset_done');
