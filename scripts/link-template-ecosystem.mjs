/**
 * In-monorepo dev loop for the shell template.
 *
 * `template-shell/` is not a root workspace: it is a standalone npm project
 * that pins the FrontX ecosystem packages it consumes to exact registry
 * versions so a seeded project can install outside the monorepo. The cost of
 * that pin is that a plain `npm install` inside the template resolves the
 * *published* alpha, so edits to `packages/*` never reach the template and the
 * failure is silent - the template builds, type-checks and tests green against
 * code nobody changed.
 *
 * WHICH packages those are is asked of the template, not declared here: the set
 * is every `packages/*` directory the template pins at an exact registry
 * version (`templatePinnedPackageDirs`). That is the honest question, because a
 * published tarball is the only thing a link can shadow - a dependency the
 * template already reaches through `file:` or a workspace resolves locally and
 * needs no link. A hand-written array was the predecessor of that derivation and
 * it went stale exactly as expected: `packages/telemetry` (#496) would have been
 * left unlinked with nothing reporting it.
 *
 * This script repoints those installed ecosystem directories at the local
 * `packages/*` builds. What it links is the whole package directory, but what a
 * consumer then resolves through it is `dist/` - which is why an unbuilt package
 * is refused instead of linked. It replaces exactly those entries and touches
 * nothing else: not `package.json`, not `package-lock.json`, not the rest of the
 * tree.
 *
 * A `npm install --no-save --no-package-lock <paths>` would do the linking too,
 * but npm rebuilds the whole ideal tree for it — pruning unrelated packages and
 * replacing the template's `file:.` self-link with a packed snapshot of
 * `dist-lib`, which breaks the template's own rebuild-on-change loop.
 *
 * Run `npm ci` inside `template-shell` to go back to the pinned versions. There
 * is no `--unlink`: the links replace published tarball *content*, which only
 * npm can put back, so any inverse this script could offer would still end in
 * `npm ci` - after leaving a hole per linked package in the meantime.
 *
 * That same asymmetry is why a run that cannot create every link puts the tree
 * back rather than reporting how far it got: the installed content is moved
 * aside, never deleted, until the last symlink is in place. A failed link then
 * usually costs a re-run rather than an `npm ci` - and when the rollback itself
 * cannot put a directory back, the result says so and names it (`unrestored`),
 * because that is the one case `npm ci` is genuinely needed for.
 *
 * Core logic is exported for unit tests; only `runCli` touches the process.
 *
 * CLI entry: `npm run dev:template:link` (exit 0 on success).
 */
import fsDefault from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { templatePinnedPackageDirs } from './template-ecosystem-packages.mjs';

/** Template whose `node_modules` the links are written into. */
export const templateDirName = 'template-shell';

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
 * Printed on SUCCESS, because success is now the dangerous case.
 *
 * While the pins sat on `0.3.0-alpha.0` this warning said the opposite: those
 * tarballs predated the `FRONTX_ACTION_*`/`DomainContext.typeSystem` move into
 * `@gears-frontx/gts-plugin`, so the template did not compile without these
 * links and forgetting to relink announced itself as a wall of type errors.
 * With the pins on `0.3.0-alpha.1` (#485) the template builds from the registry
 * on its own - which removes the error AND the signal. A stale link now costs
 * nothing visible and silently tests the published code instead of the working
 * copy, so the note names that trade rather than a build failure.
 */
const silentStalenessNote =
  'Note: the template also builds from its pins alone, so nothing will tell you when these\n' +
  'links go stale. Two different things break them, and they need different fixes:\n' +
  '  - `npm install` inside template-shell reifies the tree from the lockfile and REPLACES\n' +
  '    the links with the pinned registry tarballs. Re-run this command.\n' +
  '  - `npm run clean:artifacts` leaves the links in place and deletes the packages/*/dist\n' +
  '    they resolve through, so they point at nothing. Re-run `npm run build:packages`.\n' +
  'A template result that contradicts an edit you just made in packages/* is the symptom;\n' +
  'check both before believing it.';

/**
 * @typedef {{ ok: true; linked: string[]; warning: string }} LinkSuccess
 * @typedef {{
 *   ok: false;
 *   reason: 'template-not-installed' | 'nothing-pinned' | 'source-missing' | 'build-missing';
 *   message: string;
 * }} LinkRefusal
 * @typedef {LinkSuccess | LinkRefusal | LinkRollback} LinkResult
 */

/**
 * Structural subset of `node:fs` that this script calls. Narrower than
 * `typeof fs` on purpose: the real module's members carry encoding overloads
 * and extra call signatures a test fake has no reason to implement, so typing
 * the injection point as the whole module makes every fake in the unit tests a
 * type error. This shape is exactly the five calls made below.
 *
 * @typedef {{
 *   existsSync: (path: string) => boolean;
 *   readFileSync: (path: string, encoding: 'utf8') => string;
 *   rmSync: (path: string, options: { recursive: boolean; force: boolean }) => void;
 *   renameSync: (from: string, to: string) => void;
 *   symlinkSync: (target: string, linkPath: string, type: 'dir' | 'junction') => void;
 * }} FileSystemLike
 */

/**
 * The only failure that can be raised after the first write, and the reason the
 * caller has to read fields rather than just the message.
 *
 * `restored` names the packages whose installed directory the rollback moved
 * back: those, and only those, are at the version `npm ci` had put there. That
 * includes the package that failed when its symlink was refused, and excludes
 * it when the move aside itself was refused - nothing of it had moved, so it
 * appears in no list at all.
 *
 * `cleared` names the packages that had NOTHING installed when the run started
 * (a hand-pruned scope, a partial install). Their rollback is the removal of
 * the symlink alone, which already returns the scope to the state `npm ci` left
 * it in - there is no version to come back to, so reporting them as `restored`
 * would name one that never existed.
 *
 * `unrestored` names the packages the rollback could not put back, and a
 * non-empty `unrestored` is the only outcome of this script that needs
 * `npm ci` to repair.
 *
 * @typedef {{
 *   ok: false;
 *   reason: 'link-failed';
 *   message: string;
 *   failedPackage: string;
 *   restored: string[];
 *   cleared: string[];
 *   unrestored: string[];
 * }} LinkRollback
 */

/**
 * Repo-relative path of the ESM entry point a consumer actually loads.
 *
 * Every linked package resolves exclusively through `dist/`, so a checkout without
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
 * @param {FileSystemLike} fs
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
 *   fs: FileSystemLike;
 *   staged: { name: string; linkPath: string; backupPath: string | null }[];
 *   failedPackage: string;
 *   failedStep: 'stage' | 'link';
 *   cause: unknown;
 * }} context
 * @returns {LinkRollback}
 */
function restoreInstalledTree({ fs, staged, failedPackage, failedStep, cause }) {
  /** @type {string[]} */
  const restored = [];
  /** @type {string[]} */
  const cleared = [];
  /** @type {string[]} */
  const unrestored = [];

  for (const { name, linkPath, backupPath } of [...staged].reverse()) {
    try {
      // Removes the symlink itself rather than what it points at - `rm` does not
      // follow links, so `packages/<name>` is never at risk here. The link may
      // also not exist, which is the case this run failed on.
      fs.rmSync(linkPath, { recursive: true, force: true });

      if (backupPath === null) {
        // Nothing was installed here, so nothing was moved aside and there is
        // nothing to put back - taking the symlink away already returned the
        // scope to the state `npm ci` left it in. Calling that "restored to the
        // installed version" would name a version that never existed.
        cleared.push(name);
      } else {
        fs.renameSync(backupPath, linkPath);
        restored.push(name);
      }
    } catch {
      unrestored.push(name);
    }
  }

  // Reported in the order the packages are linked, not the order they were undone.
  restored.reverse();
  cleared.reverse();
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
  } else if (restored.length > 0 || cleared.length > 0) {
    // Two different true statements, and saying only the first of them about a
    // package that was never installed is the wording this fixes.
    const parts = [];
    if (restored.length > 0) {
      parts.push(`rolled ${describePackages(restored)} back to the installed versions`);
    }
    if (cleared.length > 0) {
      parts.push(`removed the ${describePackages(cleared)} symlink, where nothing had been installed to put back`);
    }
    stateLine = `Rollback ${parts.join(' and ')}; nothing was left half-removed.`;
    // The rollback already returned the tree to what `npm ci` left, so unlike
    // the unrestored case above there is nothing to repair - re-running is the
    // whole remedy. Left unassigned, this line printed as literal "undefined"
    // in the message join below.
    recoveryLine = 'Fix the cause and re-run.';
  } else {
    stateLine = 'Nothing had been written yet, so the installed tree is untouched.';
    recoveryLine =
      `Fix the cause and re-run, or run \`npm ci\` inside ${templateDirName} to rebuild ` +
      'the tree from the lockfile.';
  }

  // Naming the wrong syscall sends a reader looking for a symlink problem when
  // the move aside is what the filesystem refused, and the two have different
  // causes: privileges and link support for one, a lock or a busy directory for
  // the other.
  const failedOperation =
    failedStep === 'stage'
      ? `moving the installed @gears-frontx/${failedPackage} directory aside`
      : `creating the @gears-frontx/${failedPackage} symlink`;

  return {
    ok: false,
    reason: 'link-failed',
    message: [
      `Cannot link: ${failedOperation} failed ` +
        `(${cause instanceof Error ? cause.message : String(cause)}).`,
      stateLine,
      recoveryLine,
    ].join('\n'),
    failedPackage,
    restored,
    cleared,
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
 * `packageDirs` is passed in rather than derived here: the derivation reads the
 * real repository (`templatePinnedPackageDirs`), and keeping it in `runCli`
 * leaves this function a pure function of the tree it is handed - which is what
 * lets the rollback cases be tested against a fake filesystem at all.
 *
 * @param {{
 *   repoRoot: string;
 *   packageDirs: string[];
 *   fs?: FileSystemLike;
 *   platform?: NodeJS.Platform;
 * }} options
 * @returns {LinkResult}
 */
export function linkEcosystemPackages({
  repoRoot,
  packageDirs,
  fs = fsDefault,
  platform = process.platform,
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

  // An empty set is not "nothing to do": the set comes from the template's own
  // pins, so an empty one means either the template stopped pinning anything to
  // the registry (in which case the dev loop it exists for is obsolete) or the
  // derivation broke. Linking nothing and exiting 0 would look exactly like a
  // successful run to everyone downstream.
  if (packageDirs.length === 0) {
    return {
      ok: false,
      reason: 'nothing-pinned',
      message:
        `Cannot link: no packages/* directory is pinned at an exact registry version by ${templateDirName}.\n` +
        'Nothing published can shadow a local edit, so there is nothing to link - which is either a real\n' +
        'change in how the template declares its dependencies, or a broken derivation.',
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

    // One `try` per step rather than one around both: the two fail for
    // different reasons and the message has to say which one the filesystem
    // refused.
    /** @type {string | null} */
    let backupPath;
    try {
      backupPath = stageInstalledAside(fs, linkPath, `${linkPath}${backupSuffix}`);
    } catch (error) {
      return restoreInstalledTree({
        fs,
        staged,
        failedPackage: name,
        failedStep: 'stage',
        cause: error,
      });
    }

    // Recorded only once the move succeeded, so the rollback never tries to
    // restore a package whose directory never left its place.
    staged.push({ name, linkPath, backupPath });

    try {
      fs.symlinkSync(target, linkPath, type);
    } catch (error) {
      return restoreInstalledTree({
        fs,
        staged,
        failedPackage: name,
        failedStep: 'link',
        cause: error,
      });
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
    warning: silentStalenessNote,
  };
}

/**
 * The set derivation lives here, and so does the only place a failure inside it
 * is turned into an exit code: reading the template's manifests fails closed
 * (`readPackageManifest`), and a thrown message naming an unreadable file is
 * more useful to a developer than the same message wrapped in a stack trace.
 *
 * @param {{
 *   repoRoot?: string;
 *   packageDirs?: string[];
 *   fs?: FileSystemLike;
 *   platform?: NodeJS.Platform;
 *   log?: (message: string) => void;
 *   error?: (message: string) => void;
 * }} [options]
 * @returns {number}
 */
export function runCli({
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  packageDirs,
  fs = fsDefault,
  platform = process.platform,
  log = console.log,
  error = console.error,
} = {}) {
  /** @type {string[]} */
  let dirs;
  try {
    dirs = packageDirs ?? templatePinnedPackageDirs(repoRoot, templateDirName);
  } catch (cause) {
    error(`Cannot link: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }

  const result = linkEcosystemPackages({ repoRoot, packageDirs: dirs, fs, platform });

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
  // `process.exitCode` rather than `process.exit()`: the latter can truncate a
  // still-flushing stdout write, and the warning this script prints on success
  // is the whole reason it says anything at all.
  process.exitCode = runCli();
}
