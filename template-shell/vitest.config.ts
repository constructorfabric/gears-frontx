import { defineConfig } from 'vitest/config';

import { COLD_START_TIMEOUT_MS } from './vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    // This lane was the one config the cold-start timeout never reached: every
    // sibling gets it from `vitest.shared.ts` (package configs, the MFE base,
    // the scaffolded host twin), while this hand-written host config kept
    // Vitest's 5000 ms default. The suites here are import-bound rather than
    // assertion-bound — `__tests__/mfe-manifest-gts-ids.test.ts` and
    // `__tests__/template-example-packages.test.ts` both pull in
    // `scripts/generate-mfe-manifests.ts` and through it the GTS parser, which
    // measured 3.43 s of `import` against 68 ms of actual test bodies on a warm
    // idle checkout. Under a concurrent monorepo build that gap alone crosses
    // 5 s, so a red here described the machine's load, not the code. Reusing
    // the shared constant rather than a local literal keeps the lanes equal:
    // a timeout that differed by lane would move the false red rather than
    // remove it.
    testTimeout: COLD_START_TIMEOUT_MS,
    hookTimeout: COLD_START_TIMEOUT_MS,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
