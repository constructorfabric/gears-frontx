import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Alias @gears-frontx/react to its own source entry so that tests importing
// hooks via relative '../src/...' paths and tests importing via the package
// name both resolve to the SAME module instance. Without this, two separate
// copies of FrontXQueryClientContext are created (one from dist/index.js via
// the package exports map, one from src/queryClient.tsx via relative import),
// and FrontXProvider providing to one context is invisible to hooks reading
// from the other.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@gears-frontx/react/testing': path.resolve(__dirname, 'src/testing.ts'),
      '@gears-frontx/react': path.resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['__tests__/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
