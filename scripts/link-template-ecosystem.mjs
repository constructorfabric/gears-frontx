/**
 * In-monorepo dev loop for the shell template.
 *
 * `template-shell/` is not a root workspace: it is a standalone npm project
 * that pins `@gears-frontx/api`, `@gears-frontx/mfes` and
 * `@gears-frontx/gts-plugin` to exact registry versions so a seeded project can
 * install outside the monorepo. The cost of that pin is that a plain
 * `npm install` inside the template resolves the *published* alpha, so edits to
 * `packages/*` never reach the template and the failure is silent — the
 * template builds, type-checks and tests green against code nobody changed.
 *
 * This script repoints the three installed ecosystem directories at the local
 * sources. It replaces exactly those three entries and touches nothing else:
 * not `package.json`, not `package-lock.json`, not the rest of the tree.
 *
 * A `npm install --no-save --no-package-lock <paths>` would do the linking too,
 * but npm rebuilds the whole ideal tree for it — pruning unrelated packages and
 * replacing the template's `file:.` self-link with a packed snapshot of
 * `dist-lib`, which breaks the template's own rebuild-on-change loop.
 *
 * Run `npm ci` inside `template-shell` to go back to the pinned versions. There
 * is no `--unlink`: the links replace published tarball *content*, which only
 * npm can put back, so any inverse this script could offer would still end in
 * `npm ci` — after leaving three holes in the tree in the meantime.
 *
 * Core logic is exported for unit tests; only `runCli` touches the process.
 *
 * CLI entry: `npm run dev:template:link` (exit 0 on success).
 */
import fsDefault from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Template whose `node_modules` the links are written into. */
export const templateDirName = 'template-shell';

/**
 * Only the packages the template pins to the registry. The rest of
 * `@gears-frontx/*` inside the template either lives in its own subtree or is
 * already linked by npm, and must keep whatever npm gave it.
 */
export const linkedPackageDirs = ['api', 'mfes', 'gts-plugin'];

/**
 * The template's own code imports `FRONTX_ACTION_*` from
 * `@gears-frontx/gts-plugin` and reads `DomainContext.typeSystem`, neither of
 * which exists in the published `0.3.0-alpha.0` tarballs — the constants still
 * sit in `@gears-frontx/mfes` there. Linking is what makes the template compile
 * at all until the next ecosystem alpha ships, so the warning is printed on
 * success: it explains why the pinned tree is red, not why linking failed.
 */
const pinnedSurfaceDriftWarning =
  'Note: the pinned registry versions cannot build template-shell right now — the published\n' +
  '0.3.0-alpha.0 tarballs predate the FRONTX_ACTION_*/DomainContext.typeSystem move into\n' +
  '@gears-frontx/gts-plugin, so 17 type errors surface without these links. Linking is the\n' +
  'only working path until the next ecosystem alpha is published (#485).';

/**
 * @typedef {{ ok: true; linked: string[]; warning: string }} LinkSuccess
 * @typedef {{
 *   ok: false;
 *   reason: 'template-not-installed' | 'source-missing' | 'build-missing';
 *   message: string;
 * }} LinkFailure
 * @typedef {LinkSuccess | LinkFailure} LinkResult
 */

/**
 * Repo-relative path of the ESM entry point a consumer actually loads.
 *
 * All three packages resolve exclusively through `dist/`, so a checkout without
 * a build has a complete `package.json` and no loadable code. Reading the entry
 * from `exports['.'].import` rather than hardcoding `dist/index.js` keeps the
 * guard honest if a package changes its output layout.
 *
 * @param {unknown} manifest
 * @returns {string | null}
 */
export function builtEntryPointOf(manifest) {
  if (typeof manifest !== 'object' || manifest === null) {
    return null;
  }

  const rootExport = readObjectProperty(readObjectProperty(manifest, 'exports'), '.');

  const candidates = [
    readObjectProperty(rootExport, 'import'),
    readObjectProperty(manifest, 'module'),
    readObjectProperty(manifest, 'main'),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function readObjectProperty(value, key) {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return Object.prototype.hasOwnProperty.call(value, key) ? Reflect.get(value, key) : undefined;
}

/**
 * Windows rejects `symlinkSync(..., 'dir')` with EPERM unless Developer Mode or
 * an elevated shell is active, and it does so *after* the target directory has
 * already been removed — leaving the tree worse than before and recoverable
 * only by `npm ci`. Junctions need no privilege but only accept an absolute
 * target, so the platform decides both the type and the path form.
 *
 * @param {string} scopeDir
 * @param {string} source
 * @param {NodeJS.Platform} platform
 * @returns {{ target: string; type: 'dir' | 'junction' }}
 */
export function symlinkSpecFor(scopeDir, source, platform) {
  return platform === 'win32'
    ? { target: source, type: 'junction' }
    : // Relative link so the tree stays valid if the checkout moves.
      { target: path.relative(scopeDir, source), type: 'dir' };
}

/**
 * Repoints the template's installed ecosystem directories at `packages/*`.
 *
 * Every precondition is checked across all packages before the first write:
 * a failure halfway through would leave part of the tree linked to sources and
 * part on registry tarballs, which is a harder state to diagnose than either
 * end point.
 *
 * @param {{
 *   repoRoot: string;
 *   fs?: typeof fsDefault;
 *   platform?: NodeJS.Platform;
 *   packageDirs?: string[];
 * }} options
 * @returns {LinkResult}
 */
export function linkEcosystemPackages({
  repoRoot,
  fs = fsDefault,
  platform = process.platform,
  packageDirs = linkedPackageDirs,
}) {
  const scopeDir = path.join(repoRoot, templateDirName, 'node_modules', '@gears-frontx');

  if (!fs.existsSync(scopeDir)) {
    return {
      ok: false,
      reason: 'template-not-installed',
      message:
        `Cannot link: ${path.relative(repoRoot, scopeDir)} does not exist.\n` +
        `Run \`npm ci\` inside ${templateDirName} first.`,
    };
  }

  /** @type {{ name: string; source: string; entryPoint: string }[]} */
  const plan = [];

  for (const name of packageDirs) {
    const source = path.join(repoRoot, 'packages', name);
    const manifestPath = path.join(source, 'package.json');

    if (!fs.existsSync(manifestPath)) {
      return {
        ok: false,
        reason: 'source-missing',
        message: `Cannot link: packages/${name} is missing (no ${path.relative(repoRoot, manifestPath)}).`,
      };
    }

    /** @type {unknown} */
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      return {
        ok: false,
        reason: 'source-missing',
        message:
          `Cannot link: packages/${name}/package.json is unreadable ` +
          `(${error instanceof Error ? error.message : String(error)}).`,
      };
    }

    const entryPoint = builtEntryPointOf(manifest);
    if (entryPoint === null) {
      return {
        ok: false,
        reason: 'source-missing',
        message: `Cannot link: packages/${name}/package.json declares no importable entry point.`,
      };
    }

    // The condition that actually breaks the template: a package with sources
    // but no build. Linking it exits 0 and the failure resurfaces much later as
    // `Cannot find module '@gears-frontx/<name>'` inside the template build.
    if (!fs.existsSync(path.join(source, entryPoint))) {
      return {
        ok: false,
        reason: 'build-missing',
        message:
          `Cannot link: packages/${name} is not built — ${path.join(`packages/${name}`, entryPoint)} is missing.\n` +
          'Run `npm run build:packages` first.',
      };
    }

    plan.push({ name, source, entryPoint });
  }

  /** @type {string[]} */
  const linked = [];

  for (const { name, source } of plan) {
    const linkPath = path.join(scopeDir, name);
    const { target, type } = symlinkSpecFor(scopeDir, source, platform);

    fs.rmSync(linkPath, { recursive: true, force: true });
    fs.symlinkSync(target, linkPath, type);
    linked.push(name);
  }

  return { ok: true, linked, warning: pinnedSurfaceDriftWarning };
}

/**
 * @param {{
 *   repoRoot?: string;
 *   fs?: typeof fsDefault;
 *   platform?: NodeJS.Platform;
 *   log?: (message: string) => void;
 *   error?: (message: string) => void;
 * }} [options]
 * @returns {number}
 */
export function runCli({
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  fs = fsDefault,
  platform = process.platform,
  log = console.log,
  error = console.error,
} = {}) {
  const result = linkEcosystemPackages({ repoRoot, fs, platform });

  if (!result.ok) {
    error(result.message);
    return 1;
  }

  for (const name of result.linked) {
    log(`linked @gears-frontx/${name} -> packages/${name}`);
  }
  log('');
  log(result.warning);
  return 0;
}

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  process.exit(runCli());
}
