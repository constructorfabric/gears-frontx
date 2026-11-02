// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  consumerSource,
  entrySpecifiers,
  exportTargets,
  exportsShapeProblems,
  isDualFormat,
  readDualFormatPackages,
} from './verify-dual-format-consumers.mjs';

/** @type {string | undefined} */
let rootDir;

afterEach(async () => {
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
});

/**
 * @param {Record<string, Record<string, unknown>>} manifests directory name -> manifest
 */
async function makeRoot(manifests) {
  rootDir = await mkdtemp(path.join(tmpdir(), 'frontx-dual-format-'));
  for (const [dir, manifest] of Object.entries(manifests)) {
    await mkdir(path.join(rootDir, 'packages', dir), { recursive: true });
    await writeFile(path.join(rootDir, 'packages', dir, 'package.json'), JSON.stringify(manifest));
  }
  return rootDir;
}

/** The per-condition entry #503 asks for. */
function dualEntry(base = 'index') {
  return {
    import: { types: `./dist/${base}.d.ts`, default: `./dist/${base}.js` },
    require: { types: `./dist/${base}.d.cts`, default: `./dist/${base}.cjs` },
  };
}

/** The entry every dual-format package shipped before #503. */
function sharedTypesEntry(base = 'index') {
  return { types: `./dist/${base}.d.ts`, import: `./dist/${base}.js`, require: `./dist/${base}.cjs` };
}

describe('isDualFormat', () => {
  it('is true when an entry carries a require condition', () => {
    expect(isDualFormat({ exports: { '.': dualEntry() } })).toBe(true);
  });

  it('is false for an ESM-only package, the ui-kit shape', () => {
    expect(isDualFormat({ exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } })).toBe(false);
  });

  it('is false with no exports object at all', () => {
    expect(isDualFormat({ main: './dist/index.cjs' })).toBe(false);
    expect(isDualFormat({ exports: './dist/index.js' })).toBe(false);
  });
});

describe('readDualFormatPackages', () => {
  it('returns published packages with a CommonJS entry and skips ESM-only and private ones', async () => {
    const root = await makeRoot({
      mfes: { name: '@gears-frontx/mfes', version: '1.0.0', exports: { '.': dualEntry() } },
      'ui-kit': { name: '@gears-frontx/ui-kit', version: '1.0.0', exports: { '.': { import: './dist/index.js' } } },
      internal: { name: '@gears-frontx/internal', version: '1.0.0', private: true, exports: { '.': dualEntry() } },
    });

    expect(readDualFormatPackages(root).map(({ dir, name }) => [dir, name])).toEqual([['mfes', '@gears-frontx/mfes']]);
  });
});

describe('exportsShapeProblems', () => {
  it('accepts per-condition types on every entry', () => {
    const manifest = { exports: { '.': dualEntry(), './types': dualEntry('types'), './package.json': './package.json' } };
    expect(exportsShapeProblems('@gears-frontx/api', manifest)).toEqual([]);
  });

  it('rejects the pre-#503 shape: one types key matched first by CommonJS consumers too', () => {
    const problems = exportsShapeProblems('@gears-frontx/mfes', { exports: { '.': sharedTypesEntry() } });

    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain('exports["."] has a "types" key beside "import" and "require"');
    expect(problems[1]).toContain('exports["."].import must be { "types": "*.d.ts", "default": "*.js" }');
    expect(problems[2]).toContain('exports["."].require must be { "types": "*.d.cts", "default": "*.cjs" }');
  });

  it('checks every subpath, not only the root entry', () => {
    const manifest = { exports: { '.': dualEntry(), './types': sharedTypesEntry('types') } };
    const problems = exportsShapeProblems('@gears-frontx/api', manifest);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((problem) => problem.includes('exports["./types"]'))).toBe(true);
  });

  it('rejects ESM declarations under require', () => {
    const entry = dualEntry();
    entry.require.types = './dist/index.d.ts';

    expect(exportsShapeProblems('@gears-frontx/mfes', { exports: { '.': entry } })).toEqual([
      '@gears-frontx/mfes exports["."].require.types must name a .d.cts file, not "./dist/index.d.ts"',
    ]);
  });

  it('rejects a condition that lists default before types', () => {
    const manifest = {
      exports: {
        '.': {
          import: { default: './dist/index.js', types: './dist/index.d.ts' },
          require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
        },
      },
    };

    expect(exportsShapeProblems('@gears-frontx/mfes', manifest)).toEqual([
      '@gears-frontx/mfes exports["."].import must list "types" first, so it matches before "default"',
    ]);
  });

  it('ignores entries without a require condition', () => {
    const manifest = { exports: { '.': dualEntry(), './theme.css': './dist/theme.css' } };
    expect(exportsShapeProblems('@gears-frontx/x', manifest)).toEqual([]);
  });
});

describe('entrySpecifiers', () => {
  it('names the root entry by the package and every other subpath by name plus subpath', () => {
    const manifest = { exports: { '.': dualEntry(), './types': dualEntry('types') } };
    expect(entrySpecifiers('@gears-frontx/api', manifest)).toEqual(['@gears-frontx/api', '@gears-frontx/api/types']);
  });

  it('leaves out pattern subpaths and ./package.json', () => {
    const manifest = { exports: { '.': dualEntry(), './*': dualEntry('*'), './package.json': './package.json' } };
    expect(entrySpecifiers('@gears-frontx/x', manifest)).toEqual(['@gears-frontx/x']);
  });
});

describe('exportTargets', () => {
  it('lists every file the exports name, once each', () => {
    const manifest = { exports: { '.': dualEntry(), './types': dualEntry('types') } };
    expect(exportTargets(manifest)).toEqual([
      'dist/index.cjs',
      'dist/index.d.cts',
      'dist/index.d.ts',
      'dist/index.js',
      'dist/types.cjs',
      'dist/types.d.cts',
      'dist/types.d.ts',
      'dist/types.js',
    ]);
  });
});

describe('consumerSource', () => {
  it('imports every specifier as a namespace and uses it', () => {
    expect(consumerSource(['@gears-frontx/api', '@gears-frontx/api/types'])).toBe(
      "import * as entry0 from '@gears-frontx/api';\nvoid entry0;\n" +
        "import * as entry1 from '@gears-frontx/api/types';\nvoid entry1;\n",
    );
  });
});
