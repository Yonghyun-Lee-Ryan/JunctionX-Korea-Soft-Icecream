import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/env.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      concurrent: false,
    },
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      exclude: ['src/generated/**', 'src/server.ts', 'src/**/*.d.ts', 'tests/**', 'dist/**'],
    },
  },
});
