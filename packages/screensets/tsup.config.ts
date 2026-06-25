import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
    'mfe/plugins/gts/index': 'src/mfe/plugins/gts/index.ts',
    'mfe/handler/index': 'src/mfe/handler/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: [
    '@globaltypesystem/gts-ts',
    '@module-federation/runtime',
  ],
});
