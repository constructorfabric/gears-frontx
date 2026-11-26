import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Suites that build a TypeScript program exceed the default on CI runners.
    testTimeout: 30_000,
    // jsdom (not 'node'): DefaultExtensionMounter/*MountStrategy tests exercise real
    // DOM Element creation via ContainerHooks (document.createElement) — extracted
    // from screensets' jsdom-based suite in Stage 1, so mfes needs the same environment.
    environment: 'jsdom',
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
