// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  backupSuffix,
  builtEntryPointOf,
  linkEcosystemPackages,
  runCli,
  symlinkSpecFor,
  templateDirName,
} from './link-template-ecosystem.mjs';

/** @typedef {import('./link-template-ecosystem.mjs').FileSystemLike} FileSystemLike */
/** @typedef {import('./link-template-ecosystem.mjs').LinkResult} LinkResult */

const repoRoot = '/repo';

/**
 * The set a run is handed, as a FIXTURE rather than as production knowledge.
 * The script no longer declares one: `runCli` derives it from what the template
 * pins (`templatePinnedPackageDirs`, covered in
 * `template-ecosystem-packages.test.mjs` against a real fixture tree), and
 * everything below tests what `linkEcosystemPackages` does with a set it is
 * given - which is why these cases can run against a fake filesystem at all.
 * Three entries, because the interesting rollback states need a middle one.
 */
const linkedPackageDirs = ['api', 'mfes', 'gts-plugin'];
const scopeDir = path.join(repoRoot, templateDirName, 'node_modules', '@gears-frontx');

/** Tarball content npm wrote: the thing a failed run must not destroy. */
const installedDir = Object.freeze({ kind: 'installed' });

/** A built artifact whose bytes no assertion reads. */
const builtArtifact = Object.freeze({ kind: 'file' });

/**
 * A `node:fs` stand-in over a map of path to the entry that lives there, where
 * an entry is `installedDir`, a `{ kind: 'link' }` record the fake writes, or a
 * file. Modelling what an entry *is* rather than only that the path exists is
 * what lets a test prove a rollback put the original directory back instead of
 * leaving a hole where it used to be.
 *
 * Only the five members the script uses are provided, so a call to anything else
 * fails the test loudly instead of silently touching the real filesystem.
 *
 * @param {Record<string, { kind: string; json?: unknown; text?: string; target?: string }>} initial
 */
function fakeFs(initial) {
  const tree = new Map(Object.entries(initial));
  /** @type {{ links: { target: string; linkPath: string; type: string }[] }} */
  const calls = { links: [] };

  /** @param {string} target */
  const subtreeOf = (target) =>
    [...tree.keys()].filter((key) => key === target || key.startsWith(target + path.sep));

  /**
   * @param {string} code
   * @param {string} target
   */
  const fsError = (code, target) =>
    Object.assign(new Error(`${code}: ${target}`), { code });

  /** @type {FileSystemLike} */
  const fs = {
      existsSync: (target) => tree.has(target),
      readFileSync: (target) => {
        const entry = tree.get(target);

        // `text` is read back verbatim, which is the only way to reach the
        // parse refusal: a manifest that does not parse has no object form to
        // stringify from.
        if (typeof entry?.text === 'string') {
          return entry.text;
        }

        if (entry?.json === undefined) {
          throw fsError('ENOENT', target);
        }
        return JSON.stringify(entry.json);
      },
      rmSync: (target) => {
        for (const key of subtreeOf(target)) {
          tree.delete(key);
        }
      },
      renameSync: (from, to) => {
        const entry = tree.get(from);
        if (entry === undefined) {
          throw fsError('ENOENT', from);
        }
        tree.delete(from);
        tree.set(to, entry);
      },
      // Refuses an occupied path the way the real call does, so a run that
      // forgot to clear a directory before linking fails here rather than
      // passing on a fake that overwrites.
      symlinkSync: (target, linkPath, type) => {
        if (tree.has(linkPath)) {
          throw fsError('EEXIST', linkPath);
        }
        calls.links.push({ target, linkPath, type });
        tree.set(linkPath, { kind: 'link', target });
      },
  };

  return { tree, calls, fs };
}

/**
 * The three pinned packages installed from the registry and built in
 * `packages/`, plus `framework` - a scope neighbour npm owns, whose survival is
 * the "and nothing else" half of the script's contract.
 */
function builtTree() {
  /** @type {Record<string, { kind: string; json?: unknown }>} */
  const entries = {
    [scopeDir]: { kind: 'dir' },
    [path.join(scopeDir, 'framework')]: installedDir,
  };

  for (const name of linkedPackageDirs) {
    const source = path.join(repoRoot, 'packages', name);
    entries[path.join(scopeDir, name)] = installedDir;
    entries[path.join(source, 'package.json')] = {
      kind: 'file',
      json: {
        name: `@gears-frontx/${name}`,
        main: './dist/index.cjs',
        exports: { '.': { import: './dist/index.js' } },
      },
    };
    entries[path.join(source, 'dist/index.js')] = builtArtifact;
  }

  return fakeFs(entries);
}

/**
 * Every entry directly inside the `@gears-frontx` scope, as a map of entry name
 * to its kind. A leftover backup appears here under its own name, so asserting
 * the whole map is how a case proves a run left no debris behind.
 *
 * @param {Map<string, { kind: string }>} tree
 */
function scopeEntries(tree) {
  const prefix = scopeDir + path.sep;

  return Object.fromEntries(
    [...tree.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, entry]) => [key.slice(prefix.length), entry.kind]),
  );
}

/** The scope as `npm ci` leaves it. */
const installedScope = Object.freeze({
  framework: 'installed',
  ...Object.fromEntries(linkedPackageDirs.map((name) => [name, 'installed'])),
});

/** The scope after a successful run: the same neighbour, the three now links. */
const linkedScope = Object.freeze({
  framework: 'installed',
  ...Object.fromEntries(linkedPackageDirs.map((name) => [name, 'link'])),
});

/**
 * Makes exactly one link path fail, the way a Windows EPERM or a directory an
 * antivirus scanner holds open does: after everything before it succeeded.
 *
 * @param {Pick<FileSystemLike, 'symlinkSync'>} fs
 * @param {string} failingLinkPath
 * @returns {FileSystemLike['symlinkSync']}
 */
function failSymlinkAt(fs, failingLinkPath) {
  const original = fs.symlinkSync;

  return (target, linkPath, type) => {
    if (linkPath === failingLinkPath) {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    }

    return original(target, linkPath, type);
  };
}

/**
 * Makes the one move `match` selects fail, the way a directory another process
 * holds open does: every neighbouring move still succeeds. `match` sees both
 * ends, because staging and rollback move the same two paths in opposite
 * directions and a case usually means only one of them.
 *
 * @param {Pick<FileSystemLike, 'renameSync'>} fs
 * @param {(move: { from: string; to: string }) => boolean} match
 * @returns {FileSystemLike['renameSync']}
 */
function failRenameAt(fs, match) {
  const original = fs.renameSync;

  return (from, to) => {
    if (match({ from, to })) {
      throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    }

    return original(from, to);
  };
}

/**
 * Narrows a result to the branch a case is asserting about. `toMatchObject({ ok:
 * false })` alone leaves the static type the full union, and a blind property
 * read would let the opposite branch reach an assertion written for this one.
 *
 * @param {LinkResult} result
 * @returns {Exclude<LinkResult, { ok: true }>}
 */
function expectFailure(result) {
  if (result.ok) {
    throw new Error('expected a failure result');
  }
  return result;
}

/**
 * @param {LinkResult} result
 * @returns {Extract<LinkResult, { ok: true }>}
 */
function expectSuccess(result) {
  if (!result.ok) {
    throw new Error(`expected a success result, got: ${result.message}`);
  }
  return result;
}

/**
 * An `existsSync` that reports one path as absent and defers the rest — the
 * shape every "missing artifact" case below needs.
 *
 * @param {FileSystemLike['existsSync']} original
 * @param {string} missing
 * @returns {FileSystemLike['existsSync']}
 */
function withMissingPath(original, missing) {
  return (target) => (target === missing ? false : original(target));
}

describe('builtEntryPointOf', () => {
  it('prefers the ESM condition of the root export over main and module', () => {
    const entry = builtEntryPointOf({
      main: './dist/index.cjs',
      module: './dist/module.js',
      exports: { '.': { import: './dist/index.js' } },
    });

    expect(entry).toBe('./dist/index.js');
  });

  it('falls back to module then main when the package declares no exports map', () => {
    expect(builtEntryPointOf({ module: './dist/m.js', main: './dist/index.cjs' })).toBe(
      './dist/m.js',
    );
    expect(builtEntryPointOf({ main: './dist/index.cjs' })).toBe('./dist/index.cjs');
  });

  it('reports no entry point for a manifest that declares none', () => {
    expect(builtEntryPointOf({ name: 'x' })).toBeNull();
    expect(builtEntryPointOf(null)).toBeNull();
  });
});

describe('symlinkSpecFor', () => {
  it('links relatively on posix so the tree survives a moved checkout', () => {
    const spec = symlinkSpecFor(scopeDir, path.join(repoRoot, 'packages/api'), 'linux');

    expect(spec).toEqual({ target: path.join('..', '..', '..', 'packages', 'api'), type: 'dir' });
  });

  it('uses an absolute junction on win32, which needs no elevated privilege', () => {
    const source = path.join(repoRoot, 'packages/api');
    const spec = symlinkSpecFor(scopeDir, source, 'win32');

    expect(spec).toEqual({ target: source, type: 'junction' });
  });
});

describe('linkEcosystemPackages', () => {
  it('replaces exactly the pinned ecosystem directories and nothing else', () => {
    const { fs, calls, tree } = builtTree();

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(expectSuccess(result).linked).toEqual(linkedPackageDirs);
    expect(scopeEntries(tree)).toEqual(linkedScope);
    expect(calls.links.map((link) => link.linkPath)).toEqual(
      linkedPackageDirs.map((name) => path.join(scopeDir, name)),
    );
  });

  // Staging by rename would fail on an entry that is not there, where the
  // forced delete it replaced simply did nothing. A pruned or partially
  // installed scope has to keep linking.
  it('links a package the scope directory never had installed', () => {
    const { fs, tree } = builtTree();
    const absent = linkedPackageDirs[0];
    tree.delete(path.join(scopeDir, absent));

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result.ok).toBe(true);
    expect(scopeEntries(tree)).toEqual(linkedScope);
  });

  it('refuses when the template has never been installed', () => {
    const { fs, calls } = fakeFs({});

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({ ok: false, reason: 'template-not-installed' });
    expect(expectFailure(result).message).toContain('npm ci');
    expect(calls.links).toEqual([]);
  });

  // The regression this guard exists for: `package.json` is present in every
  // checkout, so checking it passed on an unbuilt tree and the real failure
  // surfaced later as a missing module inside the template build.
  it('refuses an unbuilt package, naming the missing artifact and the build command', () => {
    const { fs } = builtTree();
    fs.existsSync = withMissingPath(fs.existsSync, path.join(repoRoot, 'packages/mfes/dist/index.js'));

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({ ok: false, reason: 'build-missing' });
    const failure = expectFailure(result);
    expect(failure.message).toContain(path.join('packages/mfes', './dist/index.js'));
    expect(failure.message).toContain('npm run build:packages');
  });

  // A refusal halfway through would leave part of the tree on local sources and
  // part on registry tarballs — harder to diagnose than either end state.
  it('writes nothing at all when a later package fails its build check', () => {
    const { fs, calls, tree } = builtTree();
    fs.existsSync = withMissingPath(fs.existsSync, path.join(repoRoot, 'packages/gts-plugin/dist/index.js'));

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result.ok).toBe(false);
    expect(calls.links).toEqual([]);
    expect(scopeEntries(tree)).toEqual(installedScope);
  });

  it('refuses when a package directory is absent from the checkout', () => {
    const { fs } = builtTree();
    fs.existsSync = withMissingPath(fs.existsSync, path.join(repoRoot, 'packages/api/package.json'));

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({ ok: false, reason: 'source-missing' });
  });

  // A half-written or truncated `package.json` shares its reason code with an
  // absent one, so the message is what separates them; both are refused before
  // anything moves.
  it('refuses a package whose manifest does not parse', () => {
    const { fs, tree } = builtTree();
    tree.set(path.join(repoRoot, 'packages/mfes/package.json'), {
      kind: 'file',
      text: '{ "name": "@gears-frontx/mfes"',
    });

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({ ok: false, reason: 'source-missing' });
    expect(expectFailure(result).message).toContain('packages/mfes/package.json is unreadable');
    expect(scopeEntries(tree)).toEqual(installedScope);
  });

  // The failure the staging exists for, and the one no precondition can rule
  // out: Windows rejects `dir` symlinks without Developer Mode and a scanner can
  // hold a directory open, so package 2 of 3 failing is routine. Deleting before
  // linking left that package destroyed, package 1 linked and package 3 pinned.
  it('restores every installed directory when the symlink for the second package fails', () => {
    const { fs, tree } = builtTree();
    const [first, second] = linkedPackageDirs;
    fs.symlinkSync = failSymlinkAt(fs, path.join(scopeDir, second));

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'link-failed',
      failedPackage: second,
      restored: [first, second],
      cleared: [],
      unrestored: [],
    });
    expect(expectFailure(result).message).toContain(`creating the @gears-frontx/${second} symlink failed`);
    expect(scopeEntries(tree)).toEqual(installedScope);
  });

  // Staging fails for reasons of its own - a directory another process holds
  // open, a busy mount - so reporting it as a symlink failure sends a reader
  // after privileges and link support when nothing was ever linked.
  it('names the move aside rather than the symlink when staging the second package fails', () => {
    const { fs, tree } = builtTree();
    const [first, second] = linkedPackageDirs;
    const secondLink = path.join(scopeDir, second);
    fs.renameSync = failRenameAt(fs, ({ from }) => from === secondLink);

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'link-failed',
      failedPackage: second,
      // The package that failed is absent: nothing of it moved, so the rollback
      // had nothing of its own to undo.
      restored: [first],
      cleared: [],
      unrestored: [],
    });
    expect(expectFailure(result).message).toContain(
      `moving the installed @gears-frontx/${second} directory aside failed`,
    );
    expect(scopeEntries(tree)).toEqual(installedScope);
  });

  // The rollback runs because the filesystem already refused something once, so
  // it can be refused in turn. What must not happen then is a clean-tree claim.
  it('names the package the rollback could not put back and the npm ci that repairs it', () => {
    const { fs, tree } = builtTree();
    const [first, second] = linkedPackageDirs;
    const secondLink = path.join(scopeDir, second);
    fs.symlinkSync = failSymlinkAt(fs, secondLink);
    fs.renameSync = failRenameAt(fs, ({ to }) => to === secondLink);

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'link-failed',
      restored: [first],
      cleared: [],
      unrestored: [second],
    });
    expect(expectFailure(result).message).toContain('npm ci');

    // The content is not lost, only misnamed - which is what makes `npm ci` a
    // repair rather than a re-download of something that vanished.
    /** @type {Record<string, string>} */
    const surviving = { ...installedScope, [`${second}${backupSuffix}`]: 'installed' };
    delete surviving[second];
    expect(scopeEntries(tree)).toEqual(surviving);
  });

  // Review round 3 on #492: a package the scope never had installed has no
  // version to come back to, so reporting it as restored named one that never
  // existed. Its rollback is the removal of the symlink alone.
  it('separates a package that was never installed from the ones it rolled back', () => {
    const { fs, tree } = builtTree();
    const [first, second, third] = linkedPackageDirs;
    tree.delete(path.join(scopeDir, first));
    fs.symlinkSync = failSymlinkAt(fs, path.join(scopeDir, third));

    const result = linkEcosystemPackages({ repoRoot, packageDirs: linkedPackageDirs, fs, platform: 'linux' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'link-failed',
      failedPackage: third,
      restored: [second, third],
      cleared: [first],
      unrestored: [],
    });
    const rollback = expectFailure(result);
    expect(rollback.message).toContain(`rolled @gears-frontx/${second}, @gears-frontx/${third} back to the installed versions`);
    expect(rollback.message).toContain(`removed the @gears-frontx/${first} symlink, where nothing had been installed to put back`);
    // The absent package stays absent; the other two are back at their installed content.
    /** @type {Record<string, string>} */
    const expected = { ...installedScope };
    delete expected[first];
    expect(scopeEntries(tree)).toEqual(expected);
  });
});

describe('runCli', () => {
  const cliOptions = { repoRoot, packageDirs: linkedPackageDirs, platform: /** @type {NodeJS.Platform} */ ('linux') };

  // With the pins on 0.3.0-alpha.1 the template builds without these links, so
  // a stale link no longer announces itself - success is the case that needs the
  // warning now.
  it('exits 0 and warns that a stale link is silent on success', () => {
    const { fs } = builtTree();
    const log = vi.fn();

    const exitCode = runCli({ ...cliOptions, fs, log, error: vi.fn() });

    expect(exitCode).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain('nothing will tell you when these');
  });

  // Review finding on round 2: the note used to say `npm install` and
  // `clean:artifacts` "both undo them", which is wrong about the second and
  // therefore sends a developer to the wrong fix. `npm install` replaces the
  // links; `clean:artifacts` leaves them and deletes what they resolve through.
  it('tells `npm install` (links replaced) apart from `clean:artifacts` (linked targets deleted)', () => {
    const { fs } = builtTree();
    const log = vi.fn();

    runCli({ ...cliOptions, fs, log, error: vi.fn() });
    const printed = log.mock.calls.flat().join('\n');

    expect(printed).toMatch(/`npm install` inside template-shell[\s\S]*REPLACES/);
    expect(printed).toMatch(/clean:artifacts[\s\S]*leaves the links in place and deletes the packages\/\*\/dist/);
    expect(printed).toContain('npm run build:packages');
  });

  it('exits 1 and prints the refusal without listing any link as done', () => {
    const { fs } = fakeFs({});
    const log = vi.fn();
    const error = vi.fn();

    const exitCode = runCli({ ...cliOptions, fs, log, error });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });

  // The set is derived from the template's own pins, so an empty one means the
  // dev loop this script exists for has no subject - either the template stopped
  // pinning anything to the registry, or the derivation broke. Linking nothing
  // and exiting 0 would be indistinguishable from a successful run.
  it('refuses, rather than exiting 0, when nothing is pinned to link', () => {
    const { fs } = builtTree();
    const error = vi.fn();

    const exitCode = runCli({ repoRoot, packageDirs: [], platform: 'linux', fs, log: vi.fn(), error });

    expect(exitCode).toBe(1);
    expect(error.mock.calls.flat().join('\n')).toContain('no packages/* directory is pinned');
  });

  // The derivation reads real manifests and fails closed on an unreadable one;
  // that has to reach the developer as this script's own refusal, naming the
  // file, not as a node stack trace. The one case here that needs a real
  // checkout on disk, since the derivation is deliberately not routed through
  // the injected `fs`.
  it('reports a failure inside the set derivation as an exit code naming the file', async () => {
    const realRoot = await mkdtemp(path.join(tmpdir(), 'frontx-link-derive-'));
    try {
      await mkdir(path.join(realRoot, 'packages', 'api'), { recursive: true });
      await writeFile(path.join(realRoot, 'packages', 'api', 'package.json'), '{ "name": broken');
      const error = vi.fn();

      const exitCode = runCli({ repoRoot: realRoot, fs: builtTree().fs, platform: 'linux', log: vi.fn(), error });

      expect(exitCode).toBe(1);
      const printed = error.mock.calls.flat().join('\n');
      expect(printed).toContain('Cannot link:');
      expect(printed).toContain(path.join('packages', 'api', 'package.json'));
    } finally {
      await rm(realRoot, { recursive: true, force: true });
    }
  });

  // A filesystem exception escaping the core would surface as a stack trace and
  // bypass the exit-code contract every other failure here goes through.
  it('reports a mid-run symlink failure as an exit code rather than an exception', () => {
    const { fs } = builtTree();
    fs.symlinkSync = failSymlinkAt(fs, path.join(scopeDir, linkedPackageDirs[1]));
    const error = vi.fn();

    const exitCode = runCli({ ...cliOptions, fs, log: vi.fn(), error });

    expect(exitCode).toBe(1);
    expect(error.mock.calls.flat().join('\n')).toContain('EPERM');
  });
});
