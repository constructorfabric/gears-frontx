/**
 * Self-contained test config, deliberately not `defineMfeProject` from the
 * shell's `src-app/vitest.mfe.base.ts`: that module lives in a subtree this
 * template does not own, so a package reaching for it compiles only once a
 * shell has been seeded around it and never inside this template's own dev
 * harness. Everything the shell's base adds beyond what is here - coverage
 * thresholds, the shared setup files, the cold-start timeout - governs the
 * shell's own suite, not this package's.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
