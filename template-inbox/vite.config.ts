import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * A plain single-page build. The app owns its whole document, so there is no
 * federation plugin, no shared-dependency externalisation and no remote entry:
 * `@gears-frontx/ui-kit` and `@gears-frontx/api` are ordinary dependencies that
 * Vite bundles like any other.
 *
 * `dedupe` is the one non-default: kit components are Base UI primitives that
 * call hooks, and a primitive holding a different React copy than the one
 * rendering the tree reads a null dispatcher and throws on its first `useRef`.
 * A flat install has one copy anyway; this makes a hoisting accident fail
 * loudly at install time rather than quietly at runtime.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
