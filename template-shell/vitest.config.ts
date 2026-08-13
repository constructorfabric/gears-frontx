import { defineConfig } from 'vitest/config';

import { COLD_START_TIMEOUT_MS } from './vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    // The shared constant rather than a local literal, for the reason its own
    // docstring gives. This lane is hand-written because it is the only one that
    // is not a package or an app, so it has to opt in by hand; the suites here
    // are import-bound rather than assertion-bound, which makes it the lane a
    // per-lane timeout would have hurt first.
    testTimeout: COLD_START_TIMEOUT_MS,
    hookTimeout: COLD_START_TIMEOUT_MS,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
