// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { definePackageVitestConfig } from '../../vitest.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default definePackageVitestConfig({
  rootDir: __dirname,
  environment: 'jsdom',
  plugins: [react()],
});
