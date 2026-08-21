#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');
const outputDirectory = resolve(backendDirectory, 'dist');

if (dirname(outputDirectory) !== backendDirectory) {
  throw new Error('Refusing to clean a build directory outside the backend root.');
}

await rm(outputDirectory, { recursive: true, force: true });
