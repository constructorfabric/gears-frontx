/**
 * Self-contained test config, deliberately not `defineMfeProject` from the
 * shell's `src-app/vitest.mfe.base.ts`: that module lives in a subtree this
 * template does not own, so a package reaching for it compiles only once a
 * shell has been seeded around it and never inside this template's own dev
 * harness. Everything the shell's base adds beyond what is here - coverage
 * thresholds, the shared setup files, the cold-start timeout - governs the
 * shell's own suite, not this package's.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

/**
 * Render against the React the kit itself resolves.
 *
 * Kit components are built on Base UI primitives that call hooks, and a
 * primitive holding a different React copy than the one rendering the tree
 * reads a null dispatcher and throws on its first `useRef`. Resolving from
 * the kit rather than from this package keeps the two the same instance: in
 * a project there is one copy and both answers are identical, while in a
 * monorepo checkout the kit is a linked source tree whose own dependencies
 * sit beside the repository's copy rather than this package's.
 *
 * `dedupe` cannot do this on its own - it applies while Vite resolves, and
 * Vitest hands node_modules imports to Node untouched.
 */
const kitRequire = createRequire(require.resolve('@gears-frontx/ui-kit/package.json'));

const kitCopyOf = (packageName: string): string =>
  path.dirname(kitRequire.resolve(`${packageName}/package.json`));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: kitCopyOf('react'),
      'react-dom': kitCopyOf('react-dom'),
      // Icons render inside kit components, so the same rule applies to the
      // one runtime package this workspace and the kit both import directly.
      'lucide-react': kitCopyOf('lucide-react'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
