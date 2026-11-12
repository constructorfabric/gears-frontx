// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1
//
// A symbolic link inside a template's AI bundle is refused explicitly for
// BOTH origin kinds, at acquisition: a remote archive's link (reported by the
// fetch adapter, never materialized) and a local `path:` template's link (met
// by the folder walk). Real filesystem for the local side; an in-memory
// FetchResult for the remote side, which is what the GitHub adapter returns.
import path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveToInventory } from '../resolver/resolve';
import type { FetchFn } from '../resolver/types';
import { createFsListDiskFilesFn } from '../adapters/fs-upgrade-io';
import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
import { parseSourceSpec } from '../spec-parser/parse';
import { BUNDLE_MARKER, encodeBundleValue } from '../bundle/envelope';
import { MANIFEST_FILENAME } from '../manifest/types';

const NAME = '@x/a';
const manifest = JSON.stringify({ name: NAME, version: '1.0.0', excludedSubtrees: [], description: 'fixture' });

let root: string | undefined;
afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('a symlink inside the AI bundle is refused at acquisition', () => {
  it('local path: origin — the resolver refuses, naming the link, and reads nothing else of the template', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-bundle-link-local-'));
    const tpl = path.join(root, 'vendor', 'a');
    await mkdir(path.join(tpl, '.frontx', 'ai', '@x', 'a'), { recursive: true });
    await writeFile(path.join(tpl, MANIFEST_FILENAME), manifest, 'utf-8');
    await writeFile(path.join(tpl, 'index.ts'), 'export {};', 'utf-8');
    await writeFile(path.join(tpl, '.frontx', 'ai', '@x', 'a', 'guide.md'), 'g', 'utf-8');
    await symlink('guide.md', path.join(tpl, '.frontx', 'ai', '@x', 'a', 'alias.md'));

    const result = await resolveToInventory(
      { kind: 'local', origin: 'path:vendor/a' },
      {
        fetchFn: async () => {
          throw new Error('no fetch for a local origin');
        },
        local: {
          repoRoot: root,
          canonicalizeFn: (raw) => raw,
          existsFn: async (p) => {
            try {
              await import('node:fs/promises').then((fs) => fs.lstat(p));
              return true;
            } catch {
              return false;
            }
          },
          listFolderFilesFn: createFsListDiskFilesFn(),
          readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
        },
      },
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.message).toContain('carries the symlink ".frontx/ai/@x/a/alias.md" inside its AI bundle');
    expect(result.error.message).toContain('refused');
  });

  it('remote origin — a symlink the archive carries inside the bundle is refused the same way', async () => {
    const spec = parseSourceSpec('github:acme/a@v1.0.0');
    if (!spec.ok) throw new Error('fixture spec must parse');
    const fetchFn: FetchFn = async () => ({
      content: JSON.stringify({ [BUNDLE_MARKER]: { [MANIFEST_FILENAME]: encodeBundleValue(Buffer.from(manifest)), 'index.ts': encodeBundleValue(Buffer.from('export {};')) } }),
      pinnedRef: 'a'.repeat(40),
      symlinks: ['.frontx/ai/@x/a/alias.md'],
    });

    const result = await resolveToInventory({ kind: 'remote', ref: spec.value }, { fetchFn });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.message).toContain('carries the symlink ".frontx/ai/@x/a/alias.md"');
    expect(result.error.message).toContain('refused');
  });
});
