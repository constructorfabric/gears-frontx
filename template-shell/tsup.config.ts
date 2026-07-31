import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'build/mf-gts': 'src/build/mf-gts.ts',
  },
  outDir: 'dist-lib',
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ['esbuild', 'vite'],
});
