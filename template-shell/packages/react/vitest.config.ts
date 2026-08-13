import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { definePackageVitestConfig } from '../../vitest.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Alias @gears-frontx/react to its own source entry so that tests importing
// hooks via relative '../src/...' paths and tests importing via the package
// name both resolve to the SAME module instance. Without this, two separate
// copies of FrontXQueryClientContext are created (one from dist/index.js via
// the package exports map, one from src/queryClient.tsx via relative import),
// and FrontXProvider providing to one context is invisible to hooks reading
// from the other.
export default definePackageVitestConfig({
  rootDir: __dirname,
  environment: 'jsdom',
  plugins: [react()],
  alias: {
    '@gears-frontx/react/testing': path.resolve(__dirname, 'src/testing.ts'),
    '@gears-frontx/react': path.resolve(__dirname, 'src/index.ts'),
  },
});
