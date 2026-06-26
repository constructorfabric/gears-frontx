import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: false,
  },
});
