#!/usr/bin/env node

/**
 * Verify that the bundler pragmas on the blob-module dynamic import survive
 * the build into both published dist formats.
 *
 * `importBlobModule` (src/handler/mf-dynamic-module-ops.ts) relies on two
 * inline comments — `webpackIgnore: true` and `@vite-ignore` — to keep its
 * `import()` native under webpack/rspack/rsbuild and Vite hosts (#504).
 * Comments are the one part of the source a build step may legally drop:
 * esbuild's `minify: true` strips them without a diagnostic, and nothing at
 * runtime notices until an MFE fails to mount under a bundling host with
 * `Cannot find module 'blob:…'`. Running the code cannot detect the pragma
 * being stripped, so this script asserts its presence in the artifacts
 * (same reasoning as scripts/verify-guard-configs.ts at the repo root).
 *
 * Wired into `npm run build` after tsup; fails the build if either pragma
 * is missing from either format.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PRAGMAS = ['webpackIgnore: true', '@vite-ignore'];
const FILES = ['index.js', 'index.cjs'];

const failures = [];
for (const file of FILES) {
  const path = join(distDir, file);
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    failures.push(`${file}: missing (build did not produce it)`);
    continue;
  }
  for (const pragma of PRAGMAS) {
    if (!content.includes(pragma)) {
      failures.push(`${file}: pragma "${pragma}" not found`);
    }
  }
}

if (failures.length > 0) {
  console.error(
    'verify-dist-import-pragmas: the blob-import bundler pragmas did not survive the build:',
  );
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    'A bundling host will rewrite the dynamic import and MFE mount will fail (#504). Check tsup.config.ts for comment-stripping options (e.g. minify).',
  );
  process.exit(1);
}

console.log(
  `verify-dist-import-pragmas: OK (${PRAGMAS.join(', ')} present in ${FILES.join(', ')})`,
);
