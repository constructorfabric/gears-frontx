import { defineConfig } from 'tsup';
import { PreservedModuleEsmPlugin } from '@gears-frontx/build-tools';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  // The ESM output preserves modules, one file per source module; CJS stays
  // bundled.
  esbuildPlugins: [new PreservedModuleEsmPlugin().toEsbuildPlugin()],
});
