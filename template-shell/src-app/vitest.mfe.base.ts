import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import {
  COLD_START_TIMEOUT_MS,
  COVERAGE_EXCLUDE,
  COVERAGE_THRESHOLDS,
  DEFAULT_TEST_EXCLUDE,
  SHARED_VITEST_SETUP_FILES,
  TEST_INCLUDE_TSX,
  vitestNodeWorkerExecArgv,
} from '../vitest.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @cpt-dod:cpt-frontx-dod-framework-composition-reexports:p1

/**
 * Shared test-only helpers live at the top-level `src/__test-utils__/` boundary
 * so host and MFE tests consume the same helpers without coupling to the
 * `src/mfe_packages/shared/` runtime tree.
 */
const frontxTestUtilsRoot = path.resolve(__dirname, './__test-utils__');

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-mfe-vitest-base-config
export const mfeVitestBaseConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@frontx-test-utils': frontxTestUtilsRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: false,
    execArgv: vitestNodeWorkerExecArgv(),
    setupFiles: [...SHARED_VITEST_SETUP_FILES],
    // A newly scaffolded MFE package pays its whole Vite transform inside the
    // first test's own budget; see COLD_START_TIMEOUT_MS for the measurement
    // that fixed the value.
    testTimeout: COLD_START_TIMEOUT_MS,
    hookTimeout: COLD_START_TIMEOUT_MS,
    include: [...TEST_INCLUDE_TSX],
    exclude: [...DEFAULT_TEST_EXCLUDE],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [...COVERAGE_EXCLUDE],
      thresholds: { ...COVERAGE_THRESHOLDS },
    },
  },
});
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-mfe-vitest-base-config

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-mfe-vitest-define-project
export function defineMfeProject(rootDir: string) {
  return mergeConfig(
    mfeVitestBaseConfig,
    defineConfig({
      root: rootDir,
    }),
  );
}
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-mfe-vitest-define-project
