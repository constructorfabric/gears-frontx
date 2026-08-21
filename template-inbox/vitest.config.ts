import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same reason as the build config: kit components are Base UI primitives
    // that call hooks, and two React copies in one tree throw on the first
    // `useRef`.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    server: {
      deps: {
        /*
         * Kit components carry their own CSS, and Vitest hands node_modules
         * imports to Node untouched - which has no idea what a `.css` file is
         * and throws before a single test runs. Inlining the kit routes it
         * through Vite's transform instead, the same one the app build uses.
         */
        inline: ['@gears-frontx/ui-kit'],
      },
    },
    passWithNoTests: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
