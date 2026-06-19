import { defineConfig } from 'tsup';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    };
  },
  dts: {
    compilerOptions: {
      skipLibCheck: true,
    },
  },
  clean: true,
  sourcemap: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react-redux',
    '@reduxjs/toolkit',
    '@gears-frontx/react',
    '@gears-frontx/framework',
    'lodash',
  ],
  noExternal: [],
  treeshake: true,
  splitting: false,
  async onSuccess() {
    // Copy i18n folder to dist
    await cp(
      join(__dirname, 'src/i18n'),
      join(__dirname, 'dist/i18n'),
      { recursive: true }
    );
    console.log('✓ Copied i18n files to dist');
  },
});
