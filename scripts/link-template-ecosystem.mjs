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
 * That same asymmetry is why a run that cannot create every link puts the tree
 * back rather than reporting how far it got: the installed content is moved
 * aside, never deleted, until the last symlink is in place. A failed link costs
 * a re-run, not an `npm ci`.
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
 * Suffix of the directory an installed package is moved to while its symlink
 * takes its place. Nothing outside one run of this script reads it: the backups
 * are discarded once every link exists, and a run that fails renames them back.
 *
 * It can survive on disk if the process is killed mid-run, so staging clears a
 * leftover before reusing the name - the content there is a copy of a published
 * tarball, which npm can always fetch again.
 */
export const backupSuffix = '.frontx-link-backup';

/**
 * The template's own code imports `FRONTX_ACTION_*` from
 * `@gears-frontx/gts-plugin` and reads `DomainContext.typeSystem`, neither of
 * which exists in the published `0.3.0-alpha.0` tarballs — the constants still
 * sit in `@gears-frontx/mfes` there. Linking is what makes the template compile
 * at all until the pins move onto `0.3.0-alpha.1`, so the warning is printed on
 * success: it explains why the pinned tree is red, not why linking failed.
 *
 * The warning names the failing exports and not a count of errors. The count
 * moves with every ecosystem change, and `type-check` chains its sub-steps with
 * `&&`, so the number a developer sees also depends on which sub-step
 * short-circuits first — a figure quoted here would be wrong more often than
 * right.
 */
const pinnedSurfaceDriftWarning =
  'Note: the pinned registry versions cannot build template-shell right now — the published\n' +
  '0.3.0-alpha.0 tarballs predate the FRONTX_ACTION_*/DomainContext.typeSystem move into\n' +
  '@gears-frontx/gts-plugin, so type-check and build:packages fail on those exports without\n' +
  'these links. Linking is the only working path until the template pins move onto the\n' +
  '0.3.0-alpha.1 packages this branch publishes (#485).';

/**
 * @typedef {{ ok: true; linked: string[]; warning: string }} LinkSuccess
 * @typedef {{
 *   ok: false;
 *   reason: 'template-not-installed' | 'source-missing' | 'build-missing';
 *   message: string;
 * }} LinkRefusal
 * @typedef {LinkSuccess | LinkRefusal | LinkRollback} LinkResult
 */

/**
 * The only failure that can be raised after the first write, and the reason the
 * caller has to read fields rather than just the message.
 *
 * `restored` names the packages the rollback returned to the state `npm ci` left
 * them in: every package linked before the failure, plus the one that failed.
 * `unrestored` names the packages it could not put back, and a non-empty
 * `unrestored` is the only outcome of this script that needs `npm ci` to repair.
 *
 * @typedef {{
 *   ok: false;
 *   reason: 'link-failed';
 *   message: string;
 *   failedPackage: string;
 *   restored: string[];
 *   unrestored: string[];
 * }} LinkRollback
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
 * an elevated shell is active. Junctions need no privilege but only accept an
 * absolute target, so the platform decides both the type and the path form.
 *
 * A privilege check would not make this safe on its own: EPERM here lands
 * mid-loop, after earlier packages are linked, which is why the write phase
 * stages the installed content aside instead of trusting the spec to work.
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
 * @param {unknown} error
 * @returns {boolean}
 */
function isMissingEntryError(error) {
  return readObjectProperty(error, 'code') === 'ENOENT';
}

/**
 * Moves the installed package directory aside so a symlink can take its place
 * without anything being destroyed.
 *
 * Deleting the directory first is the obvious way to clear the path, and it is
 * what makes a mid-loop failure unrecoverable: what it deletes is published
 * tarball content that only `npm ci` can put back. A rename keeps that content
 * one syscall away for as long as the run can still fail.
 *
 * @param {typeof fsDefault} fs
 * @param {string} linkPath
 * @param {string} backupPath
 * @returns {string | null} The backup path, or `null` when nothing was installed
 *   at `linkPath` and a rollback would therefore have nothing to restore.
 */
function stageInstalledAside(fs, linkPath, backupPath) {
  // A backup left behind by a killed run would block the rename on Windows,
  // where renaming onto an existing directory fails.
  fs.rmSync(backupPath, { recursive: true, force: true });

  try {
    fs.renameSync(linkPath, backupPath);
  } catch (error) {
    // npm installs all three, but a hand-pruned or partially installed tree can
    // be missing one, and a link left dangling by a moved checkout renames
    // fine. Only a genuinely absent entry gets here, and the symlink below
    // simply creates it - exactly what the previous forced delete allowed.
    if (isMissingEntryError(error)) {
      return null;
    }

    throw error;
  }

  return backupPath;
}

/**
 * @param {string[]} names
 * @returns {string}
 */
function describePackages(names) {
  return names.map((name) => `@gears-frontx/${name}`).join(', ');
}

/**
 * Undoes every write of a failed run and reports what the tree holds afterwards.
 *
 * Entries are undone newest first and independently: this code runs because the
 * filesystem already refused something once, so one package that will not come
 * back must not strand the ones that would. That is also why the result
 * separates `restored` from `unrestored` instead of telling every caller to run
 * `npm ci` - a rollback that worked leaves nothing to repair, and a blanket
 * recovery instruction would train developers to ignore the one case that does.
 *
 * @param {{
 *   fs: typeof fsDefault;
 *   staged: { name: string; linkPath: string; backupPath: string | null }[];
 *   failedPackage: string;
 *   cause: unknown;
 * }} context
 * @returns {LinkRollback}
 */
function restoreInstalledTree({ fs, staged, failedPackage, cause }) {
  /** @type {string[]} */
  const restored = [];
  /** @type {string[]} */
  const unrestored = [];

  for (const { name, linkPath, backupPath } of [...staged].reverse()) {
    try {
      // Removes the symlink itself rather than what it points at - `rm` does not
      // follow links, so `packages/<name>` is never at risk here. The link may
      // also not exist, which is the case this run failed on.
      fs.rmSync(linkPath, { recursive: true, force: true });

      if (backupPath !== null) {
        fs.renameSync(backupPath, linkPath);
      }

      restored.push(name);
    } catch {
      unrestored.push(name);
    }
  }

  // Reported in the order the packages are linked, not the order they were undone.
  restored.reverse();
  unrestored.reverse();

  /** @type {string} */
  let stateLine;
  /** @type {string} */
  let recoveryLine;

  if (unrestored.length > 0) {
    stateLine =
      `Rollback could not restore ${describePackages(unrestored)} - the installed ` +
      `content is still there under \`${backupSuffix}\`.`;
    recoveryLine = `Run \`npm ci\` inside ${templateDirName} to repair the tree.`;
  } else {
    stateLine =
      restored.length > 0
        ? `Rolled ${describePackages(restored)} back to the installed versions; nothing was left half-removed.`
        : 'Nothing had been written yet, so the installed tree is untouched.';
    recoveryLine =
      `Fix the cause and re-run, or run \`npm ci\` inside ${templateDirName} to rebuild ` +
      'the tree from the lockfile.';
  }

  return {
    ok: false,
    reason: 'link-failed',
    message: [
      `Cannot link: creating the @gears-frontx/${failedPackage} symlink failed ` +
        `(${cause instanceof Error ? cause.message : String(cause)}).`,
      stateLine,
      recoveryLine,
    ].join('\n'),
    failedPackage,
    restored,
    unrestored,
  };
}

/**
 * Repoints the template's installed ecosystem directories at `packages/*`.
 *
 * The run is all-or-nothing in both phases. Every precondition is checked across
 * all packages before the first write, and each write moves the installed
 * directory aside instead of deleting it, so a failure on the second of three
 * packages rolls back to the tree `npm ci` produced. Either half-state - part
 * linked and part on registry tarballs, or worse, one package deleted and not
 * replaced - is harder to diagnose than both end points.
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

  /** @type {{ name: string; linkPath: string; backupPath: string | null }[]} */
  const staged = [];

  for (const { name, source } of plan) {
    const linkPath = path.join(scopeDir, name);
    const { target, type } = symlinkSpecFor(scopeDir, source, platform);

    try {
      const backupPath = stageInstalledAside(fs, linkPath, `${linkPath}${backupSuffix}`);

      // Recorded only once the move succeeded, so the rollback never tries to
      // restore a package whose directory never left its place.
      staged.push({ name, linkPath, backupPath });

      fs.symlinkSync(target, linkPath, type);
    } catch (error) {
      return restoreInstalledTree({ fs, staged, failedPackage: name, cause: error });
    }
  }

  // Only now is the installed content unreachable, so discarding it can no
  // longer cost anything.
  for (const { backupPath } of staged) {
    if (backupPath === null) {
      continue;
    }

    try {
      fs.rmSync(backupPath, { recursive: true, force: true });
    } catch {
      // The links are already in place, so the run succeeded; a backup that
      // refuses to be deleted is debris the next run clears before staging.
      // Failing here would report a failure for a correctly linked tree.
    }
  }

  return {
    ok: true,
    linked: plan.map(({ name }) => name),
    warning: pinnedSurfaceDriftWarning,
  };
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
