#!/usr/bin/env node

import { access, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');
const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules', 'generated']);
const conflictCopies = [];
const invalidMigrationDirectories = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(absolutePath);
    } else if (/ \d+\.[^.]+$/.test(entry.name)) {
      conflictCopies.push(relative(backendDirectory, absolutePath));
    }
  }
}

await visit(backendDirectory);

const migrationsDirectory = resolve(backendDirectory, 'prisma', 'migrations');
for (const entry of await readdir(migrationsDirectory, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  try {
    await access(resolve(migrationsDirectory, entry.name, 'migration.sql'));
  } catch {
    invalidMigrationDirectories.push(
      relative(backendDirectory, resolve(migrationsDirectory, entry.name)),
    );
  }
}

if (conflictCopies.length > 0 || invalidMigrationDirectories.length > 0) {
  if (conflictCopies.length > 0) {
    console.error('Conflicting duplicate files were found:');
    for (const filepath of conflictCopies.sort()) console.error(`  ${filepath}`);
  }

  if (invalidMigrationDirectories.length > 0) {
    console.error('Migration directories without migration.sql were found:');
    for (const directory of invalidMigrationDirectories.sort()) console.error(`  ${directory}`);
  }

  process.exitCode = 1;
} else {
  console.log('No conflicting duplicate files or incomplete migration directories found.');
}
