#!/usr/bin/env node

/**
 * Verify that the bundler pragmas on the blob-module dynamic import survive
 * the build into both published dist formats.
 *
 * `importBlobModule` (src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts) relies on two
 * inline comments — `webpackIgnore: true` and `@vite-ignore` — to keep its
 * `import()` native under webpack/rspack/rsbuild and Vite hosts (#504).
 * Comments are the one part of the source a build step may legally drop:
 * esbuild's `minify: true` strips them without a diagnostic, and nothing at
 * runtime notices until an MFE fails to mount under a bundling host with
 * `Cannot find module 'blob:…'`. Running the code cannot detect the pragma
 * being stripped, so this script asserts its presence in the artifacts
 * (same reasoning as scripts/verify-guard-configs.ts at the repo root).
 *
 * The CJS build is one bundle (`index.cjs`). The ESM build preserves modules
 * (`ecosystem_package_build_output`): the import lives in the emitted module
 * of the trust kernel itself, `handler/mfe-handler-mf/mf-dynamic-module-ops.js`.
 * For each format the script checks that the file exists, that both pragmas
 * sit inside an `import(` call's leading comments (not merely somewhere in
 * the file), and — for ESM — that the module is reached from `index.js`
 * through relative imports, so the checked file is the one the entry ships.
 *
 * Wired into `npm run build` after tsup; fails the build on any miss.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PRAGMAS = ['webpackIgnore: true', '@vite-ignore'];
const ESM_ENTRY = 'index.js';
const ESM_KERNEL = 'handler/mfe-handler-mf/mf-dynamic-module-ops.js';
const CJS_FILES = ['index.cjs'];
const FILES = [ESM_KERNEL, ...CJS_FILES];

/** `import(` followed by its run of leading block comments. */
const DYNAMIC_IMPORT_COMMENTS = /\bimport\(((?:\s*\/\*[\s\S]*?\*\/)+)/g;
/** Relative specifiers of static imports and re-exports in emitted ESM. */
const RELATIVE_STATIC_IMPORT = /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*["'](\.{1,2}\/[^"']+)["']|(?:^|[\s;])import\s*["'](\.{1,2}\/[^"']+)["']/gm;

function read(file) {
  try {
    return readFileSync(join(distDir, file), 'utf8');
  } catch {
    return undefined;
  }
}

function checkPragmasOnImportCall(file, content, failures) {
  const calls = [...content.matchAll(DYNAMIC_IMPORT_COMMENTS)].map((match) => match[1]);
  const pragmaCall = calls.find((comments) => PRAGMAS.every((pragma) => comments.includes(pragma)));
  if (pragmaCall !== undefined) {
    return;
  }
  const missing = PRAGMAS.filter((pragma) => !calls.some((comments) => comments.includes(pragma)));
  for (const pragma of missing) {
    failures.push(`${file}: pragma "${pragma}" not found on an import() call`);
  }
  if (missing.length === 0) {
    failures.push(`${file}: no single import() call carries both pragmas`);
  }
}

function esmReaches(entry, target) {
  const seen = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (file === target) return true;
    const content = read(file);
    if (content === undefined) continue;
    for (const match of content.matchAll(RELATIVE_STATIC_IMPORT)) {
      const specifier = match[1] ?? match[2];
      pending.push(relative(distDir, normalize(join(distDir, dirname(file), specifier))).split('\\').join('/'));
    }
  }
  return false;
}

const failures = [];
for (const file of FILES) {
  const content = read(file);
  if (content === undefined) {
    failures.push(`${file}: missing (build did not produce it)`);
    continue;
  }
  checkPragmasOnImportCall(file, content, failures);
}
if (read(ESM_ENTRY) === undefined) {
  failures.push(`${ESM_ENTRY}: missing (build did not produce it)`);
} else if (!esmReaches(ESM_ENTRY, ESM_KERNEL)) {
  failures.push(`${ESM_ENTRY}: does not reach ${ESM_KERNEL} through relative imports`);
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
  `verify-dist-import-pragmas: OK (${PRAGMAS.join(', ')} on the import() call in ${FILES.join(', ')}; ${ESM_KERNEL} reached from ${ESM_ENTRY})`,
);
