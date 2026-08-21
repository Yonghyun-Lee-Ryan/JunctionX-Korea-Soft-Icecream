#!/usr/bin/env node

import { access, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, '..');

function usage() {
  return 'Usage: npm run generate:module -- <module-name>';
}

function splitWords(value) {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    .split('-')
    .map((word) => word.toLowerCase());
}

function normalizeModuleName(value) {
  if (!value || value.length > 64 || !/^[A-Za-z][A-Za-z0-9-]*$/.test(value)) {
    throw new Error(
      'Module name must start with a letter and contain only letters, numbers, or single hyphens.',
    );
  }

  if (value.endsWith('-') || value.includes('--')) {
    throw new Error('Module name cannot end with a hyphen or contain consecutive hyphens.');
  }

  const words = splitWords(value);
  const kebabCase = words.join('-');
  const camelCase = words[0] + words.slice(1).map(capitalize).join('');
  const pascalCase = words.map(capitalize).join('');

  return { kebabCase, camelCase, pascalCase };
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function pathExists(filepath) {
  try {
    await access(filepath);
    return true;
  } catch {
    return false;
  }
}

function templates(names) {
  const { kebabCase, camelCase, pascalCase } = names;

  return {
    [`${kebabCase}.schema.ts`]: `import { z } from 'zod';

export const ${camelCase}ListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ${pascalCase}ListQuery = z.infer<typeof ${camelCase}ListQuerySchema>;
`,
    [`${kebabCase}.service.ts`]: `export class ${pascalCase}Service {
  async list(): Promise<unknown[]> {
    // Add business logic and Prisma queries here.
    return [];
  }
}

export const ${camelCase}Service = new ${pascalCase}Service();
`,
    [`${kebabCase}.controller.ts`]: `import type { Request, Response } from 'express';

import { ${camelCase}Service } from './${kebabCase}.service.js';

export class ${pascalCase}Controller {
  list = async (_request: Request, response: Response): Promise<void> => {
    const items = await ${camelCase}Service.list();
    response.status(200).json({ data: items });
  };
}

export const ${camelCase}Controller = new ${pascalCase}Controller();
`,
    [`${kebabCase}.routes.ts`]: `import { Router } from 'express';

import { ${camelCase}Controller } from './${kebabCase}.controller.js';

export const ${camelCase}Router = Router();

${camelCase}Router.get('/', ${camelCase}Controller.list);
`,
  };
}

async function run() {
  const arguments_ = process.argv.slice(2);

  if (arguments_.length !== 1) {
    throw new Error(usage());
  }

  const names = normalizeModuleName(arguments_[0]);
  const moduleDirectory = resolve(backendDirectory, 'src', 'modules', names.kebabCase);
  const testFile = resolve(backendDirectory, 'tests', 'unit', `${names.kebabCase}.service.test.ts`);

  if ((await pathExists(moduleDirectory)) || (await pathExists(testFile))) {
    throw new Error(`Refusing to overwrite existing module or test for "${names.kebabCase}".`);
  }

  await mkdir(resolve(backendDirectory, 'src', 'modules'), { recursive: true });
  await mkdir(resolve(backendDirectory, 'tests', 'unit'), { recursive: true });

  let moduleCreated = false;
  let testCreated = false;

  try {
    await mkdir(moduleDirectory);
    moduleCreated = true;

    await Promise.all(
      Object.entries(templates(names)).map(([filename, contents]) =>
        writeFile(resolve(moduleDirectory, filename), contents, { flag: 'wx' }),
      ),
    );

    const testContents = `import { ${names.pascalCase}Service } from '../../src/modules/${names.kebabCase}/${names.kebabCase}.service.js';

describe('${names.pascalCase}Service', () => {
  it('starts with an empty list', async () => {
    const service = new ${names.pascalCase}Service();

    await expect(service.list()).resolves.toEqual([]);
  });
});
`;

    await writeFile(testFile, testContents, { flag: 'wx' });
    testCreated = true;
  } catch (error) {
    if (moduleCreated) {
      await rm(moduleDirectory, { recursive: true, force: true });
    }

    if (testCreated) {
      await unlink(testFile);
    }

    throw error;
  }

  console.log(`Created module "${names.kebabCase}":`);
  console.log(`  src/modules/${names.kebabCase}/`);
  console.log(`  tests/unit/${names.kebabCase}.service.test.ts`);
  console.log('\nRegister it manually in src/routes.ts:');
  console.log(
    `import { ${names.camelCase}Router } from './modules/${names.kebabCase}/${names.kebabCase}.routes.js';`,
  );
  console.log(`router.use('/api/v1/${names.kebabCase}', ${names.camelCase}Router);`);
}

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Module generation failed: ${message}`);
  process.exitCode = 1;
}
