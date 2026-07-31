// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  backupSuffix,
  builtEntryPointOf,
  linkEcosystemPackages,
  linkedPackageDirs,
  runCli,
  symlinkSpecFor,
  templateDirName,
} from './link-template-ecosystem.mjs';

const repoRoot = '/repo';
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
 * @param {Record<string, { kind: string; json?: unknown; target?: string }>} initial
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

  return {
    tree,
    calls,
    fs: {
      existsSync: (target) => tree.has(target),
      readFileSync: (target) => {
        const entry = tree.get(target);
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
    },
  };
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
 * @param {{ symlinkSync: (target: string, linkPath: string, type: string) => void }} fs
 * @param {string} failingLinkPath
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

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result.ok).toBe(true);
    expect(result.linked).toEqual(linkedPackageDirs);
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

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result.ok).toBe(true);
    expect(scopeEntries(tree)).toEqual(linkedScope);
  });

  it('refuses when the template has never been installed', () => {
    const { fs, calls } = fakeFs({});

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result).toMatchObject({ ok: false, reason: 'template-not-installed' });
    expect(result.message).toContain('npm ci');
    expect(calls.links).toEqual([]);
  });

  // The regression this guard exists for: `package.json` is present in every
  // checkout, so checking it passed on an unbuilt tree and the real failure
  // surfaced later as a missing module inside the template build.
  it('refuses an unbuilt package, naming the missing artifact and the build command', () => {
    const { fs } = builtTree();
    fs.existsSync = ((original) => (target) =>
      target === path.join(repoRoot, 'packages/mfes/dist/index.js') ? false : original(target))(
      fs.existsSync,
    );

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result).toMatchObject({ ok: false, reason: 'build-missing' });
    expect(result.message).toContain(path.join('packages/mfes', './dist/index.js'));
    expect(result.message).toContain('npm run build:packages');
  });

  // A refusal halfway through would leave part of the tree on local sources and
  // part on registry tarballs — harder to diagnose than either end state.
  it('writes nothing at all when a later package fails its build check', () => {
    const { fs, calls, tree } = builtTree();
    fs.existsSync = ((original) => (target) =>
      target === path.join(repoRoot, 'packages/gts-plugin/dist/index.js')
        ? false
        : original(target))(fs.existsSync);

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result.ok).toBe(false);
    expect(calls.links).toEqual([]);
    expect(scopeEntries(tree)).toEqual(installedScope);
  });

  it('refuses when a package directory is absent from the checkout', () => {
    const { fs } = builtTree();
    fs.existsSync = ((original) => (target) =>
      target === path.join(repoRoot, 'packages/api/package.json') ? false : original(target))(
      fs.existsSync,
    );

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result).toMatchObject({ ok: false, reason: 'source-missing' });
  });

  // The failure the staging exists for, and the one no precondition can rule
  // out: Windows rejects `dir` symlinks without Developer Mode and a scanner can
  // hold a directory open, so package 2 of 3 failing is routine. Deleting before
  // linking left that package destroyed, package 1 linked and package 3 pinned.
  it('restores every installed directory when the symlink for the second package fails', () => {
    const { fs, tree } = builtTree();
    const [first, second] = linkedPackageDirs;
    fs.symlinkSync = failSymlinkAt(fs, path.join(scopeDir, second));

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'link-failed',
      failedPackage: second,
      restored: [first, second],
      unrestored: [],
    });
    expect(result.message).toContain(`creating the @gears-frontx/${second} symlink failed`);
    expect(scopeEntries(tree)).toEqual(installedScope);
  });

  // Staging fails for reasons of its own - a directory another process holds
  // open, a busy mount - so reporting it as a symlink failure sends a reader
  // after privileges and link support when nothing was ever linked.
  it('names the move aside rather than the symlink when staging the second package fails', () => {
    const { fs, tree } = builtTree();
    const [first, second] = linkedPackageDirs;
    const secondLink = path.join(scopeDir, second);
    fs.renameSync = ((original) => (from, to) => {
      if (from === secondLink) {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      }
      return original(from, to);
    })(fs.renameSync);

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'link-failed',
      failedPackage: second,
      // The package that failed is absent: nothing of it moved, so the rollback
      // had nothing of its own to undo.
      restored: [first],
      unrestored: [],
    });
    expect(result.message).toContain(
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
    fs.renameSync = ((original) => (from, to) => {
      if (to === secondLink) {
        throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      }
      return original(from, to);
    })(fs.renameSync);

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result).toMatchObject({
      ok: false,
      reason: 'link-failed',
      restored: [first],
      unrestored: [second],
    });
    expect(result.message).toContain('npm ci');

    // The content is not lost, only misnamed - which is what makes `npm ci` a
    // repair rather than a re-download of something that vanished.
    const surviving = { ...installedScope, [`${second}${backupSuffix}`]: 'installed' };
    delete surviving[second];
    expect(scopeEntries(tree)).toEqual(surviving);
  });
});

describe('runCli', () => {
  // The published 0.3.0-alpha.0 tarballs cannot build the template, so a
  // successful link must not read as "the pinned tree is fine".
  it('exits 0 and warns about the pinned-surface drift on success', () => {
    const { fs } = builtTree();
    const log = vi.fn();

    const exitCode = runCli({ repoRoot, fs, platform: 'linux', log, error: vi.fn() });

    expect(exitCode).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain('FRONTX_ACTION_*');
  });

  it('exits 1 and prints the refusal without listing any link as done', () => {
    const { fs } = fakeFs({});
    const log = vi.fn();
    const error = vi.fn();

    const exitCode = runCli({ repoRoot, fs, platform: 'linux', log, error });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });

  // A filesystem exception escaping the core would surface as a stack trace and
  // bypass the exit-code contract every other failure here goes through.
  it('reports a mid-run symlink failure as an exit code rather than an exception', () => {
    const { fs } = builtTree();
    fs.symlinkSync = failSymlinkAt(fs, path.join(scopeDir, linkedPackageDirs[1]));
    const error = vi.fn();

    const exitCode = runCli({ repoRoot, fs, platform: 'linux', log: vi.fn(), error });

    expect(exitCode).toBe(1);
    expect(error.mock.calls.flat().join('\n')).toContain('EPERM');
  });
});
