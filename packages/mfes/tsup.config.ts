import { defineConfig } from 'tsup';
import { PreservedModuleEsmPlugin } from '../../scripts/build/PreservedModuleEsmPlugin';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'unit-format': 'src/unit-format/index.ts',
    'unit-loader': 'src/unit-loader/index.ts',
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
