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
    '@gears-frontx/state',
    '@gears-frontx/screensets',
    '@gears-frontx/api',
    '@gears-frontx/i18n',
    '@reduxjs/toolkit',
    'react',
  ],
});
