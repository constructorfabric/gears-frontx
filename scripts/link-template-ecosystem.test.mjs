// @cpt-dod:cpt-frontx-dod-unit-test-generation-and-agent-verification-standard-test-convention:p1
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  builtEntryPointOf,
  linkEcosystemPackages,
  linkedPackageDirs,
  runCli,
  symlinkSpecFor,
  templateDirName,
} from './link-template-ecosystem.mjs';

const repoRoot = '/repo';
const scopeDir = path.join(repoRoot, templateDirName, 'node_modules', '@gears-frontx');

/**
 * A `node:fs` stand-in backed by a set of paths that "exist". Only the four
 * members the script uses are provided, so a call to anything else fails the
 * test loudly instead of silently touching the real filesystem.
 *
 * @param {{ existing: string[]; manifests?: Record<string, unknown> }} options
 */
function fakeFs({ existing, manifests = {} }) {
  const present = new Set(existing);
  /** @type {{ removed: string[]; links: { target: string; linkPath: string; type: string }[] }} */
  const calls = { removed: [], links: [] };

  return {
    calls,
    fs: {
      existsSync: (target) => present.has(target),
      readFileSync: (target) => {
        const name = Object.keys(manifests).find((key) => target === key);
        if (name === undefined) {
          throw Object.assign(new Error(`ENOENT: ${target}`), { code: 'ENOENT' });
        }
        return JSON.stringify(manifests[name]);
      },
      rmSync: (target) => {
        calls.removed.push(target);
        present.delete(target);
      },
      symlinkSync: (target, linkPath, type) => {
        calls.links.push({ target, linkPath, type });
        present.add(linkPath);
      },
    },
  };
}

/** A tree where all three packages are present and built. */
function builtTree() {
  const existing = [scopeDir];
  /** @type {Record<string, unknown>} */
  const manifests = {};

  for (const name of linkedPackageDirs) {
    const source = path.join(repoRoot, 'packages', name);
    const manifestPath = path.join(source, 'package.json');
    existing.push(manifestPath, path.join(source, 'dist/index.js'));
    manifests[manifestPath] = {
      name: `@gears-frontx/${name}`,
      main: './dist/index.cjs',
      exports: { '.': { import: './dist/index.js' } },
    };
  }

  return fakeFs({ existing, manifests });
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
    const { fs, calls } = builtTree();

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result.ok).toBe(true);
    expect(result.linked).toEqual(linkedPackageDirs);
    expect(calls.removed).toEqual(linkedPackageDirs.map((name) => path.join(scopeDir, name)));
    expect(calls.links.map((link) => link.linkPath)).toEqual(
      linkedPackageDirs.map((name) => path.join(scopeDir, name)),
    );
  });

  it('refuses when the template has never been installed', () => {
    const { fs, calls } = fakeFs({ existing: [] });

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
    const { fs, calls } = builtTree();
    fs.existsSync = ((original) => (target) =>
      target === path.join(repoRoot, 'packages/gts-plugin/dist/index.js')
        ? false
        : original(target))(fs.existsSync);

    const result = linkEcosystemPackages({ repoRoot, fs, platform: 'linux' });

    expect(result.ok).toBe(false);
    expect(calls.removed).toEqual([]);
    expect(calls.links).toEqual([]);
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
    const { fs } = fakeFs({ existing: [] });
    const log = vi.fn();
    const error = vi.fn();

    const exitCode = runCli({ repoRoot, fs, platform: 'linux', log, error });

    expect(exitCode).toBe(1);
    expect(error).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });
});
