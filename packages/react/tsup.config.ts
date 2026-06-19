import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: [
    // All @gears-frontx packages - peer dependencies
    '@gears-frontx/framework',
    // React ecosystem
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react-redux',
    'use-sync-external-store',
    'use-sync-external-store/shim',
    /^use-sync-external-store/,
    // Common utilities that should not be bundled
    'lodash',
    /^lodash\//,
  ],
});
