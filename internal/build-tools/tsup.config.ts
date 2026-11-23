import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  // The plugin drives the TypeScript compiler API at build time; typescript is
  // CommonJS and cannot be inlined into an ESM bundle.
  external: ['typescript'],
});
