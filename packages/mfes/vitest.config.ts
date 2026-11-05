import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // jsdom (not 'node'): DefaultExtensionMounter/*MountStrategy tests exercise real
    // DOM Element creation via ContainerHooks (document.createElement) — extracted
    // from screensets' jsdom-based suite in Stage 1, so mfes needs the same environment.
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    // Acceptance suite (issue #718): asserts phase-8 target behaviour and
    // fails by design until the runtime rebuild lands. Driven separately
    // via `npm run test:acceptance`.
    exclude: [...configDefaults.exclude, 'src/**/__tests__/acceptance/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
