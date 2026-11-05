import { defineConfig } from 'tsup';
import { PreservedModuleEsmPlugin } from '../../scripts/build/PreservedModuleEsmPlugin';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  // ESM keeps one file per source module so a host can share the package at
  // unit granularity (ecosystem_package_build_output); CJS stays bundled.
  esbuildPlugins: [new PreservedModuleEsmPlugin().toEsbuildPlugin()],
});
