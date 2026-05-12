import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Alias @cyberfabric/react to its own source entry so that tests importing
// hooks via relative '../src/...' paths and tests importing via the package
// name both resolve to the SAME module instance. Without this, two separate
// copies of HAI3QueryClientContext are created (one from dist/index.js via
// the package exports map, one from src/queryClient.tsx via relative import),
// and HAI3Provider providing to one context is invisible to hooks reading
// from the other.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@cyberfabric/react/testing': path.resolve(__dirname, 'src/testing.ts'),
      '@cyberfabric/react': path.resolve(__dirname, 'src/index.ts'),
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
