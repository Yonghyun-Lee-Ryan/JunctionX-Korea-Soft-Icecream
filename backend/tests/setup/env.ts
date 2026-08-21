import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

for (const filename of ['.env.test', '.env']) {
  const path = resolve(filename);
  if (existsSync(path)) config({ path, override: false, quiet: true });
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required for tests.');

const testUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(testUrl.pathname).replace(/^\/+/, '');
if (!testDatabaseName.toLowerCase().endsWith('_test')) {
  throw new Error('Refusing to run tests: TEST_DATABASE_URL database name must end with _test.');
}

if (process.env.DATABASE_URL) {
  const applicationUrl = new URL(process.env.DATABASE_URL);
  const applicationDatabaseName = decodeURIComponent(applicationUrl.pathname).replace(/^\/+/, '');
  if (applicationDatabaseName === testDatabaseName) {
    throw new Error('Refusing to run tests: development and test database names must differ.');
  }
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
