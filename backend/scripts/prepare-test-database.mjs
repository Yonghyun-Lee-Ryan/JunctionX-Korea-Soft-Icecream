#!/usr/bin/env node

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parse } from 'dotenv';

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');

function readEnvironmentFiles() {
  const fileEnvironment = {};

  // Later files override earlier files, while explicit shell/CI variables win over both.
  for (const filename of ['.env', '.env.test']) {
    const filepath = resolve(backendDirectory, filename);

    if (existsSync(filepath)) {
      Object.assign(fileEnvironment, parse(readFileSync(filepath)));
    }
  }

  return { ...fileEnvironment, ...process.env };
}

function parsePostgresDatabaseUrl(value, variableName) {
  if (!value) {
    throw new Error(`${variableName} is required.`);
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${variableName} must use the postgresql:// or postgres:// protocol.`);
  }

  const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');

  if (!pathname || pathname.includes('/')) {
    throw new Error(`${variableName} must identify exactly one PostgreSQL database.`);
  }

  return {
    databaseName: pathname,
    host: parsed.hostname,
    port: parsed.port || '5432',
  };
}

function assertSafeTestDatabase(environment) {
  const testDatabase = parsePostgresDatabaseUrl(environment.TEST_DATABASE_URL, 'TEST_DATABASE_URL');

  if (!testDatabase.databaseName.toLowerCase().endsWith('_test')) {
    throw new Error(
      `Refusing to prepare database "${testDatabase.databaseName}": ` +
        'the test database name must end with "_test".',
    );
  }

  if (environment.DATABASE_URL) {
    const applicationDatabase = parsePostgresDatabaseUrl(environment.DATABASE_URL, 'DATABASE_URL');

    if (applicationDatabase.databaseName === testDatabase.databaseName) {
      throw new Error(
        'Refusing to continue because DATABASE_URL and TEST_DATABASE_URL use the same database name.',
      );
    }
  }

  return testDatabase;
}

function run() {
  const environment = readEnvironmentFiles();
  const testDatabase = assertSafeTestDatabase(environment);

  let prismaCli;

  try {
    prismaCli = require.resolve('prisma/build/index.js');
  } catch {
    throw new Error('The local Prisma CLI was not found. Run "npm ci" first.');
  }

  console.log(
    `Applying committed migrations to test database "${testDatabase.databaseName}" ` +
      `on ${testDatabase.host}:${testDatabase.port}.`,
  );

  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDirectory,
    env: {
      ...environment,
      NODE_ENV: 'test',
      DATABASE_URL: environment.TEST_DATABASE_URL,
    },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    throw new Error(`Prisma migrate deploy was terminated by ${result.signal}.`);
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Test database preparation failed: ${message}`);
  process.exitCode = 1;
}
