import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    testing: 'src/testing.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Share query-cache modules across entries so `dist/testing.js` does not duplicate
  // plugin singletons (globalThis + WeakMaps) relative to `dist/index.js`.
  splitting: true,
  external: [
    '@gears-frontx/state',
    '@gears-frontx/screensets',
    '@gears-frontx/api',
    '@gears-frontx/i18n',
    '@reduxjs/toolkit',
    'react',
    'vitest',
  ],
});
