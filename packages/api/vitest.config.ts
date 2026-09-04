// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import { defineConfig } from 'vitest/config';

// Self-contained, like every other packages/* vitest config (mfes,
// gts-plugin, telemetry): this package must not depend on template
// territory (ecosystem packages never import template content - templates
// now live in their own repository, constructorfabric/gears-frontx-templates).
// This used to borrow `definePackageVitestConfig` from
// `template-shell/vitest.shared.ts` and alias `@gears-frontx/frontx-template-shell`
// to that template's source, but nothing under `src/` ever imported that
// package - the alias was dead weight, not a real test dependency.
//
// What DID carry real behavior from that shared config, and is restored
// here rather than dropped along with it:
// - `setupFiles: ['./vitest.setup.ts']` - a local copy of the one piece of
//   the shared cleanup hook this package's tests actually rely on (real
//   timers restored after a fake-timer test; see that file).
// - `testTimeout`/`hookTimeout: 30_000` - the shared config's cold-start
//   allowance (`COLD_START_TIMEOUT_MS` in the old `vitest.shared.ts`):
//   Vitest's 5s default runs from test start, so on a cold transform cache it
//   also covers the first test file's Vite transform, which measured cold
//   runs cross by more than 10x.
// - `passWithNoTests: false` - an empty `include` match (a typo'd glob, a
//   deleted last test file) must fail loudly, not report a vacuous pass.
export default defineConfig({
  test: {
    globals: true,
    // 'node' (not jsdom): this package builds REST/plugin descriptors and
    // touches no DOM.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
