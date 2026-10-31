import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', root: 'packages/core', include: ['test/**/*.test.ts'] } },
      { test: { name: 'ingest', root: 'ingest', include: ['test/**/*.test.ts'] } },
      { test: { name: 'repo', include: ['tests/**/*.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts', 'ingest/src/**/*.ts'],
      exclude: ['ingest/src/cli.ts', 'ingest/src/demo.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
