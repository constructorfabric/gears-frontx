// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
// Root Vitest config owns the host app (everything under `src/`) except nested
// MFE packages, which own their own Vitest configs and are orchestrated as
// separate projects by `scripts/run-monorepo-unit-tests.mjs`. Covering all of
// `src/**` here means any future host-side folder (for example `src/shared/`)
// is picked up automatically instead of being silently skipped by every
// project in the monorepo runner.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import {
  COVERAGE_EXCLUDE,
  COVERAGE_THRESHOLDS,
  DEFAULT_TEST_EXCLUDE,
  HOST_SCRIPT_TEST_INCLUDE,
  SHARED_VITEST_SETUP_FILES,
  TEST_INCLUDE_TSX,
  VITE_RESOLVE_DEDUPE,
  VITEST_SERVER_DEPS_INLINE,
  vitestNodeWorkerExecArgv,
} from './vitest.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@gears-frontx/react/testing',
        replacement: path.resolve(__dirname, './packages/frontx-template-standard/packages/framework/dist/testing.js'),
      },
      {
        find: '@frontx-test-utils',
        replacement: path.resolve(__dirname, './packages/frontx-template-standard/src-app/__test-utils__'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './packages/frontx-template-standard/src-app'),
      },
    ],
    dedupe: [...VITE_RESOLVE_DEDUPE],
  },
  test: {
    globals: true,
    passWithNoTests: false,
    environment: 'jsdom',
    execArgv: vitestNodeWorkerExecArgv(),
    setupFiles: [...SHARED_VITEST_SETUP_FILES],
    include: [
      ...TEST_INCLUDE_TSX,
      // Monorepo runner / helper scripts live outside `src/` but still own
      // logic-heavy routing code that unit tests must cover (UNIT_TESTING.md
      // TRIGGERS: "logic-heavy files"). Picking them up here runs them under
      // the same host-app Vitest project the monorepo runner already drives.
      // `HOST_SCRIPT_TEST_INCLUDE` is re-exported from `vitest.shared.ts` so
      // the scaffold renderer picks up the same globs without duplication.
      ...HOST_SCRIPT_TEST_INCLUDE,
    ],
    exclude: ['packages/frontx-template-standard/src-app/mfe_packages/**', ...DEFAULT_TEST_EXCLUDE],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [...COVERAGE_EXCLUDE],
      thresholds: { ...COVERAGE_THRESHOLDS },
    },
    server: {
      deps: {
        inline: [...VITEST_SERVER_DEPS_INLINE],
      },
    },
  },
});
