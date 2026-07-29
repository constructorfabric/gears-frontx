// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { definePackageVitestConfig } from '../../template-shell/vitest.shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const base = definePackageVitestConfig({
  rootDir: __dirname,
  environment: 'node',
});

export default {
  ...base,
  resolve: {
    alias: {
      '@gears-frontx/frontx-template-shell': path.resolve(
        __dirname,
        '../../template-shell/src/index.ts'
      ),
    },
  },
};
