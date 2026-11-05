import { defineConfig } from 'vitest/config';

/**
 * Acceptance suite for issue #718 — the finding-driven tests that assert
 * phase-8 target behaviour and fail by design until the runtime rebuild
 * lands. Kept out of `npm test` via the `exclude` in `vitest.config.ts`
 * and driven explicitly through `npm run test:acceptance`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/__tests__/acceptance/**/*.test.ts'],
  },
});
