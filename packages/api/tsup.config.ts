import { defineConfig } from 'tsup';
import { PreservedModuleEsmPlugin } from '@gears-frontx/build-tools';
import { tsupInventoryOptions } from '../../scripts/audit-production-inventory.mjs';

export default defineConfig(({ outDir }) => ({
  entry: {
    index: 'src/index.ts',
    types: 'src/types.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  ...tsupInventoryOptions(outDir),
  splitting: false,
  // The ESM output preserves modules, one file per source module; CJS stays
  // bundled.
  esbuildPlugins: [new PreservedModuleEsmPlugin().toEsbuildPlugin()],
}));
