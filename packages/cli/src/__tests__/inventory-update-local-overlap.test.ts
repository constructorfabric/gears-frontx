// @cpt-flow:cpt-frontx-flow-template-resolution-update-local:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-bounded-local-update:p1
//
// `update-local` replaces one entry's content path wholesale, which also clears
// anything nested under it. `updateLocal` therefore refuses, before any write,
// when ANOTHER indexed name overlaps the named one under the CLI's own name
// comparison (`pathsNest`). Scope of what these tests establish: that
// comparison, as one process evaluates it. They do NOT establish physical
// identity or separation of the directories — an inventory on a volume with a
// different case mode than the process's probe, Unicode aliases, filesystem-
// specific folds and symlinks inside the store are not exercised.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { joinWithinRoot } from '@gears-frontx/test-support/path-guard';
import { TemplateInventory } from '../inventory/TemplateInventory';
import { InventoryState } from '../inventory/types';
import type { ContentStorePort, InventoryEntry, InventoryIndexPort } from '../inventory/types';
import type { FetchFn } from '../resolver/types';
import { isVolumeCaseInsensitive } from '../paths/volume-case';
import { run, createRealDeps } from '../cli';

function manifestFetch(name: string, version = '2.0.0'): FetchFn {
  return vi
    .fn()
    .mockResolvedValue(
      JSON.stringify({ name, version, excludedSubtrees: [], description: 'overlap fixture' }),
    );
}

function entry(name: string): InventoryEntry {
  return {
    name,
    source: `github:acme/${name.replace(/[^a-z0-9]/gi, '-')}@v1.0.0`,
    ref: 'v1.0.0',
    status: InventoryState.INSTALLED,
    content: `content-of:${name}`,
  };
}

function fakePorts(names: string[]) {
  const entries = new Map(names.map((n) => [n, entry(n)]));
  const index: InventoryIndexPort = {
    record: vi.fn(),
    lookup: vi.fn((n: string) => entries.get(n)),
    update: vi.fn(),
    all: vi.fn(() => [...entries.values()]),
    getState: vi.fn(() => InventoryState.INSTALLED),
    toJSON: vi.fn(() => '{}'),
  };
  const store: ContentStorePort = {
    write: vi.fn(),
    replace: vi.fn(),
    read: vi.fn(),
    has: vi.fn(() => true),
  };
  return { index, store };
}

describe('TemplateInventory.updateLocal — overlap guard (in-memory ports)', () => {
  // inst-update-return-overlap
  it('inst-update-return-overlap: refuses nested names in either update order, with no store or index write', async () => {
    for (const [target, other] of [
      ['@x/a', '@x/a/b'],
      ['@x/a/b', '@x/a'],
    ] as const) {
      const { index, store } = fakePorts(['@x/a', '@x/a/b']);
      const inv = new TemplateInventory(index, store);
      const result = await inv.updateLocal(target, 'github:acme/t@v2.0.0', manifestFetch(target));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('REGISTRATION_CONFLICT');
      expect(result.error.message).toContain(`"${target}"`);
      expect(result.error.message).toContain(`"${other}"`);
      expect(result.error.message).toContain('This update did not change the inventory index or any inventory content');
      expect(store.replace).not.toHaveBeenCalled();
      expect(store.write).not.toHaveBeenCalled();
      expect(index.update).not.toHaveBeenCalled();
      expect(index.record).not.toHaveBeenCalled();
    }
  });

  it('refusal text never advises deleting and never claims independence', async () => {
    const { index, store } = fakePorts(['@x/a', '@x/a/b']);
    const result = await new TemplateInventory(index, store).updateLocal(
      '@x/a',
      'github:acme/t@v2.0.0',
      manifestFetch('@x/a'),
    );
    if (result.ok) throw new Error('expected refusal');
    expect(result.error.message).not.toMatch(/\b(rm|delete|deleted|uninstall|remove it|independent)\b/i);
    expect(result.error.message).not.toMatch(/nothing was changed/i);
    expect(result.error.message).toMatch(/backup/i);
  });

  // inst-update-write — a name that overlaps nobody still updates, own name is never its own overlap.
  it('inst-update-write: same-name update with only unrelated indexed names proceeds', async () => {
    const { index, store } = fakePorts(['@x/a', '@x/other', '@y/a-sibling']);
    const result = await new TemplateInventory(index, store).updateLocal(
      '@x/a',
      'github:acme/t@v2.0.0',
      manifestFetch('@x/a'),
    );
    expect(result.ok).toBe(true);
    expect(store.replace).toHaveBeenCalledTimes(1);
    expect(index.update).toHaveBeenCalledTimes(1);
  });

  it('a sole entry (own name only) updates', async () => {
    const { index, store } = fakePorts(['@x/a']);
    const result = await new TemplateInventory(index, store).updateLocal(
      '@x/a',
      'github:acme/t@v2.0.0',
      manifestFetch('@x/a'),
    );
    expect(result.ok).toBe(true);
    expect(store.replace).toHaveBeenCalledTimes(1);
  });

  // Error precedence: the overlap check is the LAST validation, after the existing ones.
  it('keeps the earlier errors ahead of the overlap check', async () => {
    const { index, store } = fakePorts(['@x/a', '@x/a/b']);
    const inv = new TemplateInventory(index, store);

    const absent = await inv.updateLocal('@x/missing', 'github:acme/t@v2.0.0', manifestFetch('@x/missing'));
    expect(absent.ok === false && absent.error.code).toBe('TEMPLATE_NOT_REGISTERED');

    const badSpec = await inv.updateLocal('@x/a', 'not-a-spec', manifestFetch('@x/a'));
    expect(badSpec.ok === false && badSpec.error.code).toBe('INVALID_INPUT');

    const unreachable = await inv.updateLocal(
      '@x/a',
      'github:acme/t@v2.0.0',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    expect(unreachable.ok).toBe(false);
    if (!unreachable.ok) expect(unreachable.error.code).not.toBe('REGISTRATION_CONFLICT');

    const mismatch = await inv.updateLocal('@x/a', 'github:acme/t@v2.0.0', manifestFetch('@x/zzz'));
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.code).toBe('REGISTRATION_CONFLICT');
      expect(mismatch.error.message).toContain('resolves to the template "@x/zzz"');
    }
    expect(store.replace).not.toHaveBeenCalled();
    expect(index.update).not.toHaveBeenCalled();
  });
});

// --- real filesystem, through run() ---

interface Snap {
  [relPath: string]: string;
}

function snapshot(root: string): Snap {
  const out: Snap = {};
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const rel = path.relative(root, full);
      const st = fs.lstatSync(full, { bigint: true });
      if (st.isDirectory()) {
        out[rel] = `dir ino=${st.ino}`;
        walk(full);
      } else if (st.isFile()) {
        out[rel] = `file ino=${st.ino} sha256=${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`;
      } else {
        out[rel] = 'other';
      }
    }
  };
  walk(root);
  return out;
}

describe('update-local overlap guard (real filesystem, through run())', () => {
  const originalInventoryRoot = process.env.FRONTX_INVENTORY_ROOT;
  const originalLocalSource = process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
  const originalCwd = process.cwd();
  let sandbox: string;
  let storeRoot: string;
  let sourceDir: string;

  function seed(names: string[]): void {
    const index: Record<string, InventoryEntry> = {};
    for (const n of names) {
      index[n] = entry(n);
      const dir = joinWithinRoot(storeRoot, ...n.split('/'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'frontx-template.json'),
        JSON.stringify({ name: n, version: '1.0.0', excludedSubtrees: [], description: 'seed' }),
      );
      fs.writeFileSync(path.join(dir, 'payload.txt'), `payload of ${n}\n`);
    }
    fs.writeFileSync(path.join(storeRoot, 'index.json'), JSON.stringify(index, null, 2));
  }

  function serve(name: string): void {
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceDir, 'frontx-template.json'),
      JSON.stringify({ name, version: '2.0.0', excludedSubtrees: [], description: 'candidate' }),
    );
    fs.writeFileSync(path.join(sourceDir, 'payload.txt'), `NEW payload for ${name}\n`);
  }

  async function updateLocal(name: string) {
    serve(name);
    return run(['update-local', name, 'github:acme/fixture@v2.0.0', '--json'], createRealDeps());
  }

  beforeEach(() => {
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-update-overlap-')));
    storeRoot = path.join(sandbox, 'store');
    sourceDir = path.join(sandbox, 'source');
    fs.mkdirSync(storeRoot);
    fs.mkdirSync(sourceDir);
    // The case probe the comparator uses runs in cwd: keep it inside the sandbox.
    process.chdir(sandbox);
    process.env.FRONTX_INVENTORY_ROOT = storeRoot;
    process.env.FRONTX_TEST_LOCAL_SOURCE_DIR = sourceDir;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(sandbox, { recursive: true, force: true });
    expect(fs.existsSync(sandbox)).toBe(false);
    if (originalInventoryRoot === undefined) delete process.env.FRONTX_INVENTORY_ROOT;
    else process.env.FRONTX_INVENTORY_ROOT = originalInventoryRoot;
    if (originalLocalSource === undefined) delete process.env.FRONTX_TEST_LOCAL_SOURCE_DIR;
    else process.env.FRONTX_TEST_LOCAL_SOURCE_DIR = originalLocalSource;
  });

  for (const [target, other] of [
    ['@x/a', '@x/a/b'],
    ['@x/a/b', '@x/a'],
  ] as const) {
    it(`inst-update-return-overlap: updating "${target}" while "${other}" is indexed is refused and the store is byte-identical`, async () => {
      seed(['@x/a', '@x/a/b', '@x/unrelated']);
      const before = snapshot(storeRoot);
      const indexBefore = fs.readFileSync(path.join(storeRoot, 'index.json'));

      const outcome = await updateLocal(target);

      expect(outcome.exitCode).not.toBe(0);
      const envelope = JSON.parse(outcome.stdout ?? '') as { ok: boolean; error?: { code: string; message: string } };
      expect(envelope.ok).toBe(false);
      expect(envelope.error?.code).toBe('REGISTRATION_CONFLICT');
      expect(envelope.error?.message).toContain(`"${other}"`);
      expect(envelope.error?.message).toContain('This update did not change the inventory index or any inventory content');
      expect(snapshot(storeRoot)).toEqual(before);
      expect(fs.readFileSync(path.join(storeRoot, 'index.json')).equals(indexBefore)).toBe(true);
      expect(fs.readFileSync(joinWithinRoot(storeRoot, ...other.split('/'), 'payload.txt'), 'utf-8')).toBe(`payload of ${other}\n`);
    });
  }

  it('same-name update with unrelated names indexed replaces only its own directory', async () => {
    seed(['@x/a', '@x/other']);
    const before = snapshot(storeRoot);

    const outcome = await updateLocal('@x/a');

    expect(outcome.exitCode).toBe(0);
    const after = snapshot(storeRoot);
    expect(fs.readFileSync(joinWithinRoot(storeRoot, '@x', 'a', 'payload.txt'), 'utf-8')).toBe('NEW payload for @x/a\n');
    for (const rel of Object.keys(before)) {
      if (rel.startsWith(path.join('@x', 'other'))) expect(after[rel]).toBe(before[rel]);
    }
    const index = JSON.parse(fs.readFileSync(path.join(storeRoot, 'index.json'), 'utf-8')) as Record<
      string,
      InventoryEntry
    >;
    expect(Object.keys(index).sort()).toEqual(['@x/a', '@x/other']);
    expect(index['@x/a'].status).toBe(InventoryState.UPDATED);
    expect(index['@x/other']).toEqual(entry('@x/other'));
  });

  // Case: the expectation follows the comparator the CLI process itself uses, which is
  // the only thing the guard consults. No claim is made about what the directories are
  // physically on any volume.
  it('names differing only in letter case: outcome follows the process comparator', async () => {
    seed(['@x/App', '@x/app']);
    const before = snapshot(storeRoot);
    const comparatorFolds = isVolumeCaseInsensitive(sandbox);

    const outcome = await updateLocal('@x/App');

    if (comparatorFolds) {
      expect(outcome.exitCode).not.toBe(0);
      expect((JSON.parse(outcome.stdout ?? '') as { error?: { code: string } }).error?.code).toBe(
        'REGISTRATION_CONFLICT',
      );
      expect(snapshot(storeRoot)).toEqual(before);
    } else {
      expect(outcome.exitCode).toBe(0);
      expect(fs.readFileSync(joinWithinRoot(storeRoot, '@x', 'App', 'payload.txt'), 'utf-8')).toBe(
        'NEW payload for @x/App\n',
      );
    }
  });
});
