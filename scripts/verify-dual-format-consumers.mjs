/**
 * Packed-consumer check for every package that ships a CommonJS entry
 * alongside its ESM one (#503, `cpt-frontx-adr-dual-format-package-declarations`).
 *
 * TypeScript picks a consumer's declaration file by the same `exports`
 * conditions Node uses to pick its runtime file. An entry that put one
 * `types` key before `import` and `require` matched that key first for both,
 * so a CommonJS consumer compiled under `moduleResolution` Node16 or NodeNext
 * was handed the ESM `.d.ts` and rejected every import with TS1479, although
 * the `.d.cts` the build emits sat next to it.
 *
 * Two halves:
 *  1. Shape: every entry with a `require` condition nests that condition's own
 *     `types` (`.d.cts`) and `default` (`.cjs`), and its `import` condition
 *     nests `types` (`.d.ts`) and `default` (`.js`), `types` first in each.
 *  2. Consumers: each package is packed as `npm publish` packs it and unpacked
 *     into a scratch `node_modules`. The tarball must hold every file its
 *     `exports` name, and a `.cts` and an `.mts` consumer importing every entry
 *     point must type-check under Node16 and NodeNext.
 *
 * Packing reads `dist/`, so this runs after `npm run build:packages`, as CI
 * does. The scratch consumer installs no third-party dependencies, so it
 * type-checks with `skipLibCheck`: which declaration file a condition resolves
 * to is reported at the consumer's own import, not inside the declarations.
 *
 * CLI entry: `node scripts/verify-dual-format-consumers.mjs` (exit 0 on
 * success). Core logic is exported for
 * `scripts/verify-dual-format-consumers.test.mjs`.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readEcosystemPackages, readPackageManifest } from './ecosystem-packages.mjs';

/**
 * @typedef {object} DualFormatPackage
 * @property {string} dir directory name under `packages/`
 * @property {string} name npm package name
 * @property {Record<string, unknown>} manifest parsed `package.json`
 */

/** The module resolution modes whose condition matching the consumers exercise. */
export const RESOLUTION_MODES = ['Node16', 'NodeNext'];

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A manifest's `exports` entries as `[subpath, entry]` pairs. A manifest with
 * no `exports` object has none.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {Array<[string, unknown]>}
 */
export function exportEntries(manifest) {
  const exportsField = manifest['exports'];
  return isRecord(exportsField) ? Object.entries(exportsField) : [];
}

/**
 * Whether a manifest offers a CommonJS entry: some `exports` entry carries a
 * `require` condition. An ESM-only package (ui-kit) carries none and is not
 * this check's concern.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {boolean}
 */
export function isDualFormat(manifest) {
  return exportEntries(manifest).some(([, entry]) => isRecord(entry) && 'require' in entry);
}

/**
 * Every published (non-`private`) package under `packages/` that offers a
 * CommonJS entry, in directory order.
 *
 * @param {string} rootDir monorepo root
 * @returns {DualFormatPackage[]}
 */
export function readDualFormatPackages(rootDir) {
  return readEcosystemPackages(rootDir).flatMap(({ dir, name }) => {
    const manifest = readPackageManifest(path.join(rootDir, 'packages', dir, 'package.json'));
    return manifest['private'] === true || !isDualFormat(manifest) ? [] : [{ dir, name, manifest }];
  });
}

/**
 * @param {string} where
 * @param {string} condition
 * @param {unknown} value
 * @param {string} typesExtension
 * @param {string} defaultExtension
 * @returns {string[]}
 */
function conditionProblems(where, condition, value, typesExtension, defaultExtension) {
  const expected = `{ "types": "*${typesExtension}", "default": "*${defaultExtension}" }`;
  if (!isRecord(value)) return [`${where}.${condition} must be ${expected}, not ${JSON.stringify(value)}`];

  const problems = [];
  if (Object.keys(value)[0] !== 'types') {
    problems.push(`${where}.${condition} must list "types" first, so it matches before "default"`);
  }
  const types = value['types'];
  if (typeof types !== 'string' || !types.endsWith(typesExtension)) {
    problems.push(`${where}.${condition}.types must name a ${typesExtension} file, not ${JSON.stringify(types)}`);
  }
  const target = value['default'];
  if (typeof target !== 'string' || !target.endsWith(defaultExtension)) {
    problems.push(`${where}.${condition}.default must name a ${defaultExtension} file, not ${JSON.stringify(target)}`);
  }
  return problems;
}

/**
 * Every way an entry carrying a `require` condition hands a consumer the
 * wrong declaration file, or no runtime file of its own format. Empty when
 * the shape is right.
 *
 * @param {string} name
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
export function exportsShapeProblems(name, manifest) {
  /** @type {string[]} */
  const problems = [];
  for (const [subpath, entry] of exportEntries(manifest)) {
    if (!isRecord(entry) || !('require' in entry)) continue;
    const where = `${name} exports["${subpath}"]`;
    if ('types' in entry) {
      problems.push(`${where} has a "types" key beside "import" and "require"; it matches first for both, so CommonJS consumers get ESM declarations`);
    }
    problems.push(...conditionProblems(where, 'import', entry['import'], '.d.ts', '.js'));
    problems.push(...conditionProblems(where, 'require', entry['require'], '.d.cts', '.cjs'));
  }
  return problems;
}

/**
 * The import specifier of every entry point a manifest exports: the package
 * name for `"."`, name plus subpath for any other subpath. Pattern subpaths
 * and `./package.json` are not entry points a consumer imports by name.
 *
 * @param {string} name
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
export function entrySpecifiers(name, manifest) {
  return exportEntries(manifest)
    .map(([subpath]) => subpath)
    .filter((subpath) => !subpath.includes('*') && subpath !== './package.json')
    .map((subpath) => (subpath === '.' ? name : `${name}/${subpath.slice(2)}`));
}

/**
 * Every file an `exports` map names, relative to the package root.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {string[]}
 */
export function exportTargets(manifest) {
  /** @type {Set<string>} */
  const targets = new Set();
  /** @param {unknown} value */
  const visit = (value) => {
    if (typeof value === 'string') targets.add(path.posix.normalize(value));
    else if (isRecord(value)) Object.values(value).forEach(visit);
  };
  exportEntries(manifest).forEach(([, entry]) => visit(entry));
  return [...targets].sort();
}

/**
 * A consumer module that imports every specifier, so the compiler resolves
 * each one in the consumer's module format.
 *
 * @param {string[]} specifiers
 * @returns {string}
 */
export function consumerSource(specifiers) {
  return specifiers.map((specifier, i) => `import * as entry${i} from '${specifier}';\nvoid entry${i};\n`).join('');
}

/**
 * Packs one package as publication packs it and unpacks the tarball into
 * `nodeModulesDir`, under the package's own name.
 *
 * @param {string} packageDir
 * @param {string} name
 * @param {string} packDir
 * @param {string} nodeModulesDir
 * @returns {string} the unpacked package's root
 */
function packAndUnpack(packageDir, name, packDir, nodeModulesDir) {
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [{ filename }] = /** @type {Array<{ filename: string }>} */ (JSON.parse(output));
  const unpacked = path.join(nodeModulesDir, ...name.split('/'));
  fs.mkdirSync(unpacked, { recursive: true });
  execFileSync('tar', ['-xzf', path.join(packDir, path.basename(filename)), '-C', unpacked, '--strip-components=1']);
  return unpacked;
}

/**
 * Type-checks one consumer file with the repository's own TypeScript.
 *
 * @param {string} rootDir
 * @param {string} consumerDir
 * @param {string} file consumer file name inside `consumerDir`
 * @param {string} mode
 * @returns {string | null} the compiler's output when it failed, otherwise null
 */
function typeCheckConsumer(rootDir, consumerDir, file, mode) {
  const configPath = path.join(consumerDir, `tsconfig.${file}.${mode}.json`);
  const compilerOptions = {
    module: mode,
    moduleResolution: mode,
    target: 'ES2022',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  fs.writeFileSync(configPath, JSON.stringify({ compilerOptions, files: [file] }, null, 2));
  const tsc = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
  try {
    execFileSync(process.execPath, [tsc, '-p', configPath], { cwd: consumerDir, encoding: 'utf8', stdio: 'pipe' });
    return null;
  } catch (error) {
    const { stdout = '', stderr = '' } = /** @type {{ stdout?: string, stderr?: string }} */ (error);
    return `${stdout}${stderr}`.trim() || String(error);
  }
}

/**
 * @param {{ rootDir: string, log?: (line: string) => void, logError?: (line: string) => void }} options
 * @returns {number} process exit code
 */
export function runCli({ rootDir, log = console.log, logError = console.error }) {
  // @cpt-algo:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1
  // @cpt-dod:cpt-frontx-dod-ecosystem-distribution-dual-format-declarations:p1
  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-collect
  const packages = readDualFormatPackages(rootDir);
  if (packages.length === 0) {
    logError('[dual-format-consumers] FAIL: no package under packages/ offers a CommonJS entry - nothing was checked.');
    return 1;
  }
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-collect

  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-shape
  const shapeProblems = packages.flatMap(({ name, manifest }) => exportsShapeProblems(name, manifest));
  // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-shape
  if (shapeProblems.length > 0) {
    shapeProblems.forEach((problem) => logError(`[dual-format-consumers] FAIL: ${problem}`));
    return 1;
  }
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-shape
  // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-shape

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-dual-format-'));
  try {
    const packDir = path.join(scratch, 'packs');
    const consumerDir = path.join(scratch, 'consumer');
    const nodeModulesDir = path.join(consumerDir, 'node_modules');
    fs.mkdirSync(packDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-pack
    const unpackedRoots = packages.map(({ dir, name }) =>
      packAndUnpack(path.join(rootDir, 'packages', dir), name, packDir, nodeModulesDir),
    );
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-pack

    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-if-missing
    const missing = packages.flatMap(({ name, manifest }, i) =>
      exportTargets(manifest)
        .filter((target) => !fs.existsSync(path.join(unpackedRoots[i] ?? '', target)))
        .map((target) => `${name}: the packed tarball has no ${target}, which its exports name (was the package built?)`),
    );
    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-missing
    if (missing.length > 0) {
      missing.forEach((problem) => logError(`[dual-format-consumers] FAIL: ${problem}`));
      return 1;
    }
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-missing
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-if-missing

    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-typecheck
    const specifiers = packages.flatMap(({ name, manifest }) => entrySpecifiers(name, manifest));
    const source = consumerSource(specifiers);
    fs.writeFileSync(path.join(consumerDir, 'consumer.cts'), source);
    fs.writeFileSync(path.join(consumerDir, 'consumer.mts'), source);
    /** @type {string[]} */
    const errors = [];
    for (const file of ['consumer.cts', 'consumer.mts']) {
      for (const mode of RESOLUTION_MODES) {
        const output = typeCheckConsumer(rootDir, consumerDir, file, mode);
        if (output !== null) errors.push(`${file} under ${mode}:\n${output}`);
      }
    }
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-typecheck

    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-if-errors
    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-errors
    if (errors.length > 0) {
      errors.forEach((error) => logError(`[dual-format-consumers] FAIL: ${error}`));
      return 1;
    }
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-errors
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-if-errors

    // @cpt-begin:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-pass
    log(
      `Dual-format consumer check passed: ${specifiers.length} entry point(s) of ${packages.length} package(s) ` +
        `type-check in a CommonJS (.cts) and an ESM (.mts) consumer under ${RESOLUTION_MODES.join(' and ')}: ` +
        `${packages.map(({ name }) => name).join(', ')}.`,
    );
    return 0;
    // @cpt-end:cpt-frontx-algo-ecosystem-distribution-dual-format-consumer-check:p1:inst-df-return-pass
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  process.exit(runCli({ rootDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') }));
}
