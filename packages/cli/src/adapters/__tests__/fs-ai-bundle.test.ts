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
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
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
  });
});
