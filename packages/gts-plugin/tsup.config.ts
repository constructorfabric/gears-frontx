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
  // The ESM output preserves modules, one file per source module; CJS stays
  // bundled.
  esbuildPlugins: [new PreservedModuleEsmPlugin().toEsbuildPlugin()],
  // The store key reads the GTS library's version from its manifest. Left
  // external, the output would import a JSON file, which Node's ESM loader
  // rejects without an import attribute. Only that one file is inlined.
  noExternal: ['@globaltypesystem/gts-ts/package.json'],
});
