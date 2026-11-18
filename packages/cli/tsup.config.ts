import { defineConfig } from 'tsup';
import { tsupInventoryOptions } from '../../scripts/audit-production-inventory.mjs';

export default defineConfig(({ outDir }) => ({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  ...tsupInventoryOptions(outDir),
  splitting: false,
}));
