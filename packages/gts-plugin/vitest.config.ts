import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Suites that build a TypeScript program exceed the default on CI runners.
    testTimeout: 30_000,
    // 'node' (not jsdom, as in packages/mfes): this package resolves type ids and
    // registers JSON schemas, and touches no DOM.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
