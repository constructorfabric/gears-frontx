import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    // happy-dom (not jsdom): the autocapture suite drives shadow roots, matchMedia and
    // getComputedStyle, and these are the assertions the SDK was validated against upstream.
    environment: 'happy-dom',
    include: ['src/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: './vitest.global-setup.ts',
    passWithNoTests: false,
    restoreMocks: true,
  },
});
