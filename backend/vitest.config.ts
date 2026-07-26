import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // Integration tests share the pfa_test database — run test files serially
    // so their truncateAll() calls don't wipe each other's fixtures.
    fileParallelism: false,
    // Retry once on transient failure. Integration tests hit a real Postgres
    // under load; occasional connection or timing hiccups happen (observed
    // ~1-in-8 rate on a single machine). Persistent bugs still fail because
    // both attempts will fail; genuine flakes stop wasting CI cycles.
    retry: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/db/migrations/**',
      ],
    },
  },
});
