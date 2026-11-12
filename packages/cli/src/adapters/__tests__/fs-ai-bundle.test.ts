// Real-fs coverage for `createFsBundleExistsFn`/`createFsCopyBundleFn`/
// `createFsRemoveBundleFn` (`cpt-frontx-algo-cli-scaffolding-ai-bundle`) —
// kept in its own file, mirroring `fs-canonicalize-target.test.ts`'s own
// rationale for a dedicated real-fs suite alongside the pure-logic fakes in
// `__tests__/ai-bundle.test.ts`.
//
// The nested-folder shape used below (`extension.json` plus a
// `guidelines/`-style subdirectory with more than one file) mirrors the
// REAL convention folders this checkpoint verified on disk at
// `template-shell/.frontx/ai/@gears-frontx/frontx-template-shell/` and
// `template-mfe/.frontx/ai/@gears-frontx/frontx-template-mfe/` — a scoped
// manifest name (containing its own "/") with more than one file at more
// than one depth, not a single flat file a shallower fixture could pass
// against by accident.
import path from 'node:path';
import fs from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFsBundleExistsFn, createFsCopyBundleFn, createFsRemoveBundleFn } from '../fs-ai-bundle';

const MANIFEST_NAME = '@gears-frontx/frontx-template-shell';

describe('fs-ai-bundle real adapters', () => {
  let sourceRoot: string;
  let destRoot: string;

  afterEach(async () => {
    if (sourceRoot) await rm(sourceRoot, { recursive: true, force: true });
    if (destRoot) await rm(destRoot, { recursive: true, force: true });
    sourceRoot = '';
    destRoot = '';
  });

  async function makeDir(prefix: string): Promise<string> {
    return mkdtemp(path.join(tmpdir(), prefix));
  }

  async function writeRealBundleFixture(root: string): Promise<void> {
    const bundleDir = path.join(root, '.frontx', 'ai', MANIFEST_NAME);
    await mkdir(path.join(bundleDir, 'guidelines'), { recursive: true });
    await writeFile(path.join(bundleDir, 'extension.json'), JSON.stringify({ name: MANIFEST_NAME }));
    await writeFile(path.join(bundleDir, 'guidelines', 'mfe-package-contract.md'), '# contract');
    await writeFile(path.join(bundleDir, 'guidelines', 'navigation-composition.md'), '# navigation');
  }

  describe('createFsBundleExistsFn', () => {
    it('reports false when no bundle folder exists yet', async () => {
      sourceRoot = await makeDir('frontx-ai-bundle-exists-');
      const bundleExists = createFsBundleExistsFn();

      expect(await bundleExists(sourceRoot, MANIFEST_NAME)).toBe(false);
    });

    it('reports true once a real bundle folder is on disk', async () => {
      sourceRoot = await makeDir('frontx-ai-bundle-exists-');
      await writeRealBundleFixture(sourceRoot);
      const bundleExists = createFsBundleExistsFn();

      expect(await bundleExists(sourceRoot, MANIFEST_NAME)).toBe(true);
    });

    // A dangling symlink standing at the bundle path — its own target
    // already removed, the link itself still present — must be reported as
    // existing: `existsSync` follows the final path component and would
    // read it as absent, but `lstat` reports the entry AT the path without
    // dereferencing it, so a dangling link is "there" regardless of whether
    // its target is.
    it('reports true when the bundle path is a dangling symlink', async () => {
      sourceRoot = await makeDir('frontx-ai-bundle-exists-dangling-');
      const bundleDir = path.join(sourceRoot, '.frontx', 'ai', MANIFEST_NAME);
      await mkdir(path.dirname(bundleDir), { recursive: true });
      await symlink(path.join(sourceRoot, 'nonexistent-target'), bundleDir);
      const bundleExists = createFsBundleExistsFn();

      expect(await bundleExists(sourceRoot, MANIFEST_NAME)).toBe(true);
    });
  });

  describe('createFsCopyBundleFn', () => {
    it('copies a real nested bundle folder verbatim into the destination root', async () => {
      sourceRoot = await makeDir('frontx-ai-bundle-source-');
      destRoot = await makeDir('frontx-ai-bundle-dest-');
      await writeRealBundleFixture(sourceRoot);
      const copyBundle = createFsCopyBundleFn();

      await copyBundle(sourceRoot, destRoot, MANIFEST_NAME);

      const destBundleDir = path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME);
      expect(existsSync(path.join(destBundleDir, 'extension.json'))).toBe(true);
      const contract = await readFile(path.join(destBundleDir, 'guidelines', 'mfe-package-contract.md'), 'utf-8');
      expect(contract).toBe('# contract');
      const navigation = await readFile(path.join(destBundleDir, 'guidelines', 'navigation-composition.md'), 'utf-8');
      expect(navigation).toBe('# navigation');
      // The source is untouched — this is a copy, never a move.
      expect(existsSync(path.join(sourceRoot, '.frontx', 'ai', MANIFEST_NAME, 'extension.json'))).toBe(true);
    });

    // `fs.cpSync` internally dereferences its destination to decide
    // file-vs-directory, and dereferencing a DANGLING symlink throws a
    // native `filesystem_error` no JS `try`/`catch` around this call can
    // see, aborting the whole process — so copying onto a dangling symlink
    // destination must replace it with a real directory rather than
    // dereference it. This state arises in practice by applying a template,
    // deleting its last target (removing the bundle), replacing
    // `.frontx/ai/<identity>` with a symlink to a nonexistent path still
    // INSIDE the project (so containment allows it), then applying again.
    it('copies successfully onto a dangling symlink destination, replacing it with a real directory', async () => {
      sourceRoot = await makeDir('frontx-ai-bundle-source-');
      destRoot = await makeDir('frontx-ai-bundle-dest-');
      await writeRealBundleFixture(sourceRoot);
      const destBundleDir = path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME);
      await mkdir(path.dirname(destBundleDir), { recursive: true });
      await symlink(path.join(destRoot, 'nonexistent-target'), destBundleDir);
      const copyBundle = createFsCopyBundleFn();

      await expect(copyBundle(sourceRoot, destRoot, MANIFEST_NAME)).resolves.toBeUndefined();

      expect(lstatSync(destBundleDir).isSymbolicLink()).toBe(false);
      expect(lstatSync(destBundleDir).isDirectory()).toBe(true);
      expect(existsSync(path.join(destBundleDir, 'extension.json'))).toBe(true);
    });

    // The live-symlink mirror of the above: a symlink at the bundle path
    // whose target DOES exist (elsewhere inside the project) behaves the
    // same way — the stale link is removed and replaced with a real,
    // freshly-copied directory, while the symlink's former target (reachable
    // from elsewhere) is left untouched, since only the link itself, never
    // what it points at, is ever removed.
    it('copies successfully onto an existing (live) symlink destination, leaving its former target untouched', async () => {
      sourceRoot = await makeDir('frontx-ai-bundle-source-');
      destRoot = await makeDir('frontx-ai-bundle-dest-');
      await writeRealBundleFixture(sourceRoot);
      const destBundleDir = path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME);
      const elsewhere = path.join(destRoot, 'elsewhere-real-dir');
      await mkdir(elsewhere, { recursive: true });
      await writeFile(path.join(elsewhere, 'keep.txt'), 'do not delete me', 'utf-8');
      await mkdir(path.dirname(destBundleDir), { recursive: true });
      await symlink(elsewhere, destBundleDir);
      const copyBundle = createFsCopyBundleFn();

      await expect(copyBundle(sourceRoot, destRoot, MANIFEST_NAME)).resolves.toBeUndefined();

      expect(lstatSync(destBundleDir).isSymbolicLink()).toBe(false);
      expect(existsSync(path.join(destBundleDir, 'extension.json'))).toBe(true);
      // The former target of the link is untouched — only the stale
      // reference to it was removed, never the directory itself.
      expect(existsSync(path.join(elsewhere, 'keep.txt'))).toBe(true);
    });

    // The containment guard this fix must not weaken: a bundle path that
    // resolves outside the project (here, `.frontx` itself replaced with a
    // symlink escaping the root) is still refused before any removal or
    // copy is attempted — mirroring the existing coverage in
    // `../../__tests__/fs-containment.test.ts`.
    it('still refuses when the destination resolves outside the project root via a symlinked ancestor', async () => {
      sourceRoot = await makeDir('frontx-ai-bundle-source-');
      destRoot = await makeDir('frontx-ai-bundle-dest-');
      await writeRealBundleFixture(sourceRoot);
      const outsideDir = await makeDir('frontx-ai-bundle-outside-');
      try {
        await symlink(outsideDir, path.join(destRoot, '.frontx'));
        const copyBundle = createFsCopyBundleFn();

        await expect(copyBundle(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toThrow(/outside the project root/);
        expect(existsSync(path.join(outsideDir, 'ai', MANIFEST_NAME))).toBe(false);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });
  });

  describe('createFsRemoveBundleFn', () => {
    it('removes a real bundle folder recursively', async () => {
      destRoot = await makeDir('frontx-ai-bundle-remove-');
      await writeRealBundleFixture(destRoot);
      const removeBundle = createFsRemoveBundleFn();

      await removeBundle(destRoot, MANIFEST_NAME);

      expect(existsSync(path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME))).toBe(false);
    });

    it('is a no-op, not a throw, when nothing exists to remove', async () => {
      destRoot = await makeDir('frontx-ai-bundle-remove-noop-');
      const removeBundle = createFsRemoveBundleFn();

      await expect(removeBundle(destRoot, MANIFEST_NAME)).resolves.toBeUndefined();
    });

    // Removal removes the LINK, never what it points at — whether the link
    // is dangling or live. `fs.rmSync` (Node's own documented behaviour)
    // unlinks a symlink at `path` rather than recursing through it, but this
    // proves it directly for the bundle path rather than assuming it.
    it('removes a dangling symlink standing at the bundle path', async () => {
      destRoot = await makeDir('frontx-ai-bundle-remove-dangling-');
      const bundleDir = path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME);
      await mkdir(path.dirname(bundleDir), { recursive: true });
      await symlink(path.join(destRoot, 'nonexistent-target'), bundleDir);
      const removeBundle = createFsRemoveBundleFn();

      await removeBundle(destRoot, MANIFEST_NAME);

      expect(existsSync(bundleDir)).toBe(false);
    });

    it('removes a live symlink standing at the bundle path without touching its target', async () => {
      destRoot = await makeDir('frontx-ai-bundle-remove-live-link-');
      const bundleDir = path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME);
      const elsewhere = path.join(destRoot, 'elsewhere-real-dir');
      await mkdir(elsewhere, { recursive: true });
      await writeFile(path.join(elsewhere, 'keep.txt'), 'do not delete me', 'utf-8');
      await mkdir(path.dirname(bundleDir), { recursive: true });
      await symlink(elsewhere, bundleDir);
      const removeBundle = createFsRemoveBundleFn();

      await removeBundle(destRoot, MANIFEST_NAME);

      // The link itself is gone...
      expect(existsSync(bundleDir)).toBe(false);
      // ...but the directory it pointed at, and its content, survive.
      expect(existsSync(path.join(elsewhere, 'keep.txt'))).toBe(true);
    });
  });
});

// The exact end-to-end reproduction from the task brief, run directly
// against the two real seams together (rather than through the full CLI
// process) since that is what the FIX lives in: apply a template (bundle
// materialized), delete its last target (bundle removed, dangling link left
// in its place by a hostile or careless actor), replace
// `.frontx/ai/<identity>` with a symlink to a nonexistent path still INSIDE
// the project, then apply again. Before the fix, `copyBundle` handed
// `fs.cpSync` that dangling symlink as a destination and the process
// aborted with an uncatchable native `filesystem_error`; this proves the
// full sequence now completes, leaves a real directory behind, and never
// throws.
describe('defect regression — dangling bundle symlink no longer aborts a subsequent apply', () => {
  let sourceRoot: string;
  let destRoot: string;
  const MANIFEST_NAME = 'acme/regression-template';

  afterEach(async () => {
    if (sourceRoot) await rm(sourceRoot, { recursive: true, force: true });
    if (destRoot) await rm(destRoot, { recursive: true, force: true });
    sourceRoot = '';
    destRoot = '';
  });

  it('reports the dangling bundle as existing, removes it, then re-applies onto it without aborting', async () => {
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-regression-source-'));
    destRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-regression-dest-'));
    const bundleSourceDir = path.join(sourceRoot, '.frontx', 'ai', MANIFEST_NAME);
    await mkdir(bundleSourceDir, { recursive: true });
    await writeFile(path.join(bundleSourceDir, 'extension.json'), JSON.stringify({ name: MANIFEST_NAME }));

    const bundleExists = createFsBundleExistsFn();
    const copyBundle = createFsCopyBundleFn();
    const removeBundle = createFsRemoveBundleFn();

    // apply #1: bundle materialized normally.
    await copyBundle(sourceRoot, destRoot, MANIFEST_NAME);
    const destBundleDir = path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME);
    expect(existsSync(path.join(destBundleDir, 'extension.json'))).toBe(true);

    // delete of the last target: bundle removed.
    await removeBundle(destRoot, MANIFEST_NAME);
    expect(existsSync(destBundleDir)).toBe(false);

    // A dangling symlink to a nonexistent path INSIDE the project is left
    // standing exactly where the bundle used to be.
    await symlink(path.join(destRoot, 'still-does-not-exist'), destBundleDir);

    // Defect 2's fix: this must now be reported as existing (dangling or
    // not), not silently absent.
    expect(await bundleExists(destRoot, MANIFEST_NAME)).toBe(true);

    // apply #2: this is the exact call that used to abort the process with
    // an uncatchable native `filesystem_error`.
    await expect(copyBundle(sourceRoot, destRoot, MANIFEST_NAME)).resolves.toBeUndefined();

    expect(lstatSync(destBundleDir).isSymbolicLink()).toBe(false);
    expect(existsSync(path.join(destBundleDir, 'extension.json'))).toBe(true);
  });
});

// NODE-24-DANGLING-SYMLINK (`removeEntryWithoutFollowing` in the adapter): on
// macOS with Node 24 before 24.14, `fs.rmSync` on a dangling symlink is a
// silent no-op and the `cpSync` that follows aborts the whole process — which
// no assertion can observe, because the vitest worker dies with it. So these
// pin the MECHANISM instead of the crash: a symlink standing where the
// adapter clears ground is removed through `unlinkSync`, and `rmSync` is
// never handed that entry — true on every Node version, crash or no crash.
describe('fs-ai-bundle real adapters (symlink removal never goes through rmSync)', () => {
  let sourceRoot: string;
  let destRoot: string;
  const bundleDir = (root: string) => path.join(root, '.frontx', 'ai', MANIFEST_NAME);

  afterEach(async () => {
    vi.restoreAllMocks();
    if (sourceRoot) await rm(sourceRoot, { recursive: true, force: true });
    if (destRoot) await rm(destRoot, { recursive: true, force: true });
    sourceRoot = '';
    destRoot = '';
  });

  async function makeRoots(): Promise<void> {
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-nofollow-src-'));
    destRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-nofollow-dest-'));
    const src = bundleDir(sourceRoot);
    await mkdir(path.join(src, 'guidelines'), { recursive: true });
    await writeFile(path.join(src, 'extension.json'), JSON.stringify({ name: MANIFEST_NAME }));
    await writeFile(path.join(src, 'guidelines', 'a.md'), '# a');
  }

  it('copyBundle unlinks a dangling symlink destination instead of handing it to rmSync', async () => {
    await makeRoots();
    const dest = bundleDir(destRoot);
    await mkdir(path.dirname(dest), { recursive: true });
    await symlink(path.join(destRoot, 'nonexistent-target'), dest);
    const rmSpy = vi.spyOn(fs, 'rmSync');
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

    await createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME);

    expect(unlinkSpy).toHaveBeenCalledWith(dest);
    expect(rmSpy.mock.calls.map(([p]) => p)).not.toContain(dest);
    expect(lstatSync(dest).isDirectory()).toBe(true);
    expect(existsSync(path.join(dest, 'guidelines', 'a.md'))).toBe(true);
  });

  it('copyBundle unlinks a dangling symlink standing at a scope component, then copies through the rebuilt directory', async () => {
    await makeRoots();
    const scope = path.join(destRoot, '.frontx', 'ai', '@gears-frontx');
    await mkdir(path.dirname(scope), { recursive: true });
    // dangling, but lexically INSIDE `.frontx/ai/` — the alias guard refuses
    // a scope link leading anywhere else before this reclaim is reached
    await symlink(path.join(destRoot, '.frontx', 'ai', 'nonexistent-target'), scope);
    const rmSpy = vi.spyOn(fs, 'rmSync');
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

    await createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME);

    expect(unlinkSpy).toHaveBeenCalledWith(scope);
    expect(rmSpy.mock.calls.map(([p]) => p)).not.toContain(scope);
    expect(lstatSync(scope).isDirectory()).toBe(true);
    expect(existsSync(path.join(bundleDir(destRoot), 'extension.json'))).toBe(true);
  });

  it('removeBundle unlinks a dangling symlink at the bundle path instead of handing it to rmSync', async () => {
    await makeRoots();
    const dest = bundleDir(destRoot);
    await mkdir(path.dirname(dest), { recursive: true });
    await symlink(path.join(destRoot, 'nonexistent-target'), dest);
    const rmSpy = vi.spyOn(fs, 'rmSync');
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

    await createFsRemoveBundleFn()(destRoot, MANIFEST_NAME);

    expect(unlinkSpy).toHaveBeenCalledWith(dest);
    expect(rmSpy.mock.calls.map(([p]) => p)).not.toContain(dest);
    expect(() => lstatSync(dest)).toThrow(/ENOENT/);
  });

  it('removeBundle unlinks a live symlink at the bundle path and leaves the directory it pointed at intact', async () => {
    await makeRoots();
    const dest = bundleDir(destRoot);
    const elsewhere = path.join(destRoot, 'elsewhere');
    await mkdir(elsewhere, { recursive: true });
    await writeFile(path.join(elsewhere, 'keep.txt'), 'keep');
    await mkdir(path.dirname(dest), { recursive: true });
    await symlink(elsewhere, dest);

    await createFsRemoveBundleFn()(destRoot, MANIFEST_NAME);

    expect(() => lstatSync(dest)).toThrow(/ENOENT/);
    expect(await readFile(path.join(elsewhere, 'keep.txt'), 'utf-8')).toBe('keep');
  });

  // HALF-TREE: a `cpSync` that fails midway has already created `dest` and
  // some of its files; without the reclaim, the next apply's existing-bundle
  // gate (`commands/apply.ts`, CONTENT_CONFLICT "Something already stands at
  // or above .frontx/ai/<name>") refuses a bundle nobody finished writing.
  // Root reads a mode-000 file regardless, so the probe cannot fail there.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'copyBundle reclaims the half-copied tree and rethrows when the copy fails midway',
    async () => {
      await makeRoots();
      const unreadable = path.join(bundleDir(sourceRoot), 'guidelines', 'locked.md');
      await writeFile(unreadable, 'locked');
      await chmod(unreadable, 0o000);
      const dest = bundleDir(destRoot);
      try {
        await expect(createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toMatchObject({ code: 'EACCES' });
        expect(() => lstatSync(dest)).toThrow(/ENOENT/);
        // the parent namespace the copy legitimately created stays: only the bundle itself is reclaimed
        expect(lstatSync(path.dirname(dest)).isDirectory()).toBe(true);
      } finally {
        await chmod(unreadable, 0o600);
      }
    },
  );

  // The reclaim above is bound to the directory THIS call created: a
  // directory someone else put at `dest` while the copy was failing is not
  // this call's write, so it is left standing with everything in it.
  it('copyBundle leaves a directory someone else replaced the destination with, when the copy fails', async () => {
    await makeRoots();
    const dest = bundleDir(destRoot);
    vi.spyOn(fs, 'cpSync').mockImplementation(() => {
      // someone else swaps in their own directory mid-copy, then the copy fails
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(dest);
      fs.writeFileSync(path.join(dest, 'theirs.txt'), 'not ours');
      throw Object.assign(new Error('copy failed'), { code: 'EIO' });
    });

    await expect(createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toMatchObject({ code: 'EIO' });

    expect(await readFile(path.join(dest, 'theirs.txt'), 'utf-8')).toBe('not ours');
  });

  it('copyBundle refuses with EEXIST, merging nothing, when something appears at the destination between clearing and copying', async () => {
    await makeRoots();
    const dest = bundleDir(destRoot);
    const cpSpy = vi.spyOn(fs, 'cpSync');
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      // the clearing "succeeds" but someone else's directory lands right after it
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, 'theirs.txt'), 'not ours');
    });
    await mkdir(dest, { recursive: true }); // something to clear, so the mocked rmSync is reached

    await expect(createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toMatchObject({ code: 'EEXIST' });

    expect(cpSpy).not.toHaveBeenCalled();
    expect(await readFile(path.join(dest, 'theirs.txt'), 'utf-8')).toBe('not ours');
  });
});

// A symlink inside the SOURCE bundle is refused by the copy's preflight,
// before the destination is cleared or written — never copied by `cpSync`.
describe('fs-ai-bundle real adapters (source bundle symlink refusal)', () => {
  let sourceRoot: string;
  let destRoot: string;

  afterEach(async () => {
    if (sourceRoot) await rm(sourceRoot, { recursive: true, force: true });
    if (destRoot) await rm(destRoot, { recursive: true, force: true });
    sourceRoot = '';
    destRoot = '';
  });

  it('copyBundle refuses with AiBundleSymlinkError and leaves an existing destination bundle untouched', async () => {
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-link-src-'));
    destRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-link-dest-'));
    await writeFile(path.join(sourceRoot, 'frontx-template.json'), JSON.stringify({ name: MANIFEST_NAME }), 'utf-8');
    const src = path.join(sourceRoot, '.frontx', 'ai', MANIFEST_NAME);
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'extension.json'), '{}', 'utf-8');
    await symlink('extension.json', path.join(src, 'alias.json'));
    const dest = path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME);
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, 'previous.md'), 'the bundle that was here', 'utf-8');

    await expect(createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toMatchObject({
      name: 'AiBundleSymlinkError',
      linkPath: `.frontx/ai/${MANIFEST_NAME}/alias.json`,
    });

    expect(await readFile(path.join(dest, 'previous.md'), 'utf-8')).toBe('the bundle that was here');
    expect(existsSync(path.join(dest, 'extension.json'))).toBe(false);
  });
});

// The pin is the only identity this call trusts: when the directory cannot
// be opened, nothing is reclaimed (a half tree is the next apply's
// CONTENT_CONFLICT, never a deleted directory of unknown ownership), and the
// descriptor is closed on success and on failure alike.
describe('fs-ai-bundle real adapters (pin failure and descriptor lifecycle)', () => {
  let sourceRoot: string;
  let destRoot: string;
  const bundleDir = (root: string) => path.join(root, '.frontx', 'ai', MANIFEST_NAME);

  afterEach(async () => {
    vi.restoreAllMocks();
    if (sourceRoot) await rm(sourceRoot, { recursive: true, force: true });
    if (destRoot) await rm(destRoot, { recursive: true, force: true });
    sourceRoot = '';
    destRoot = '';
  });

  async function makeRoots(): Promise<void> {
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-pin-src-'));
    destRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-pin-dest-'));
    const src = bundleDir(sourceRoot);
    await mkdir(src, { recursive: true });
    await writeFile(path.join(src, 'extension.json'), JSON.stringify({ name: MANIFEST_NAME }));
  }

  it('when the directory cannot be opened, a failed copy reclaims nothing: a replacement directory and its file survive', async () => {
    await makeRoots();
    const dest = bundleDir(destRoot);
    vi.spyOn(fs, 'openSync').mockImplementation(() => {
      throw Object.assign(new Error('directories cannot be opened here'), { code: 'EISDIR' });
    });
    const rmSpy = vi.spyOn(fs, 'rmSync');
    vi.spyOn(fs, 'cpSync').mockImplementation(() => {
      // someone else swaps in their own directory mid-copy, then the copy fails;
      // without the pin its inode may even equal ours, so nothing may be judged
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(dest);
      fs.writeFileSync(path.join(dest, 'theirs.txt'), 'not ours');
      throw Object.assign(new Error('copy failed'), { code: 'EIO' });
    });

    await expect(createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toMatchObject({ code: 'EIO' });

    expect(await readFile(path.join(dest, 'theirs.txt'), 'utf-8')).toBe('not ours');
    // the only rmSync of dest was the impostor's own, inside the mocked copy
    expect(rmSpy.mock.calls.filter(([p]) => p === dest)).toHaveLength(1);
  });

  it('when the directory cannot be opened, a failed copy leaves even its own half tree in place (no identity, no reclaim)', async () => {
    await makeRoots();
    const dest = bundleDir(destRoot);
    vi.spyOn(fs, 'openSync').mockImplementation(() => {
      throw Object.assign(new Error('directories cannot be opened here'), { code: 'EISDIR' });
    });
    vi.spyOn(fs, 'cpSync').mockImplementation(() => {
      fs.writeFileSync(path.join(dest, 'half.json'), '{');
      throw Object.assign(new Error('copy failed'), { code: 'EIO' });
    });

    await expect(createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toMatchObject({ code: 'EIO' });

    expect(lstatSync(dest).isDirectory()).toBe(true);
    expect(await readFile(path.join(dest, 'half.json'), 'utf-8')).toBe('{');
  });

  it('closes the pinned descriptor on success and on failure', async () => {
    await makeRoots();
    const openSpy = vi.spyOn(fs, 'openSync');
    const closeSpy = vi.spyOn(fs, 'closeSync');

    await createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME);
    expect(openSpy).toHaveBeenCalledTimes(1);
    const fd = openSpy.mock.results[0]?.value as number;
    expect(closeSpy).toHaveBeenCalledWith(fd);

    openSpy.mockClear();
    closeSpy.mockClear();
    vi.spyOn(fs, 'cpSync').mockImplementation(() => {
      throw Object.assign(new Error('copy failed'), { code: 'EIO' });
    });
    await rm(bundleDir(destRoot), { recursive: true, force: true });
    await expect(createFsCopyBundleFn()(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toMatchObject({ code: 'EIO' });
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledWith(openSpy.mock.results[0]?.value as number);
    expect(() => lstatSync(bundleDir(destRoot))).toThrow(/ENOENT/); // own empty tree reclaimed under a working pin
  });
});
