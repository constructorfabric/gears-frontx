// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSync } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import { resolveToInventory } from '../resolver/resolve';
import type { LocalOriginDeps } from '../resolver/types';
import { createResolvePayloadFn } from '../upgrade/payload';
import { readBundleFiles, decodeBundleValue, isBinaryBundleValue } from '../bundle/envelope';
import { MANIFEST_FILENAME } from '../manifest/types';
import { createFsCanonicalizeTargetFn, createFsPathExistsFn, createFsReadFileFn, createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
import { createFsListDiskFilesFn } from '../adapters/fs-upgrade-io';

const binary = Buffer.from([0, 0xff, 0xfe, 0x80, 10, 65]);
const manifest = (version = '1.0.0', description = 'Valid UTF-8: café 🌍') =>
  Buffer.from(JSON.stringify({ name: '@test/bytes', version, description, excludedSubtrees: [] }));
const invalidUtf8Manifest = Buffer.concat([
  Buffer.from('{"name":"@test/bytes","version":"1.0.0","description":"'),
  Buffer.from([0xff]),
  Buffer.from('","excludedSubtrees":[]}'),
]);

// Each fixture owns an explicit file/dir ledger; cleanup never traverses or removes recursively.
function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pr614-byte-r2-'));
  const dirs = ['vendor', 'vendor/one', 'vendor/two', 'app', '.frontx', 'inventory'];
  for (const dir of dirs) fs.mkdirSync(path.join(root, dir));
  const files = new Set<string>();
  function write(relative: string, bytes: Buffer | string) {
    files.add(relative);
    fs.writeFileSync(path.join(root, relative), bytes);
  }
  const local: LocalOriginDeps = {
    repoRoot: root,
    canonicalizeFn: createFsCanonicalizeTargetFn(root),
    existsFn: createFsPathExistsFn(),
    listFolderFilesFn: createFsListDiskFilesFn(),
    readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
  };
  return {
    root, local, write,
    cleanup() {
      for (const file of files) fs.unlinkSync(path.join(root, file));
      for (const dir of [...dirs].reverse()) fs.rmdirSync(path.join(root, dir));
      fs.rmdirSync(root);
      expect(fs.existsSync(root)).toBe(false);
    },
  };
}
const noFetch = async () => { throw new Error('Local resolution must not fetch'); };

describe('local bytes through real filesystem adapters', () => {
  it.each([['invalid UTF-8', invalidUtf8Manifest], ['valid UTF-8', manifest()]] as const)(
    'preserves %s manifest and every payload byte, reading the manifest exactly once', async (_label, bytes) => {
      const fixture = scratch();
      try {
        const originals = { [MANIFEST_FILENAME]: bytes, 'binary.bin': binary, 'empty.dat': Buffer.alloc(0), 'text.txt': Buffer.from('café\r\n🌍\n') };
        for (const [file, value] of Object.entries(originals)) fixture.write(`vendor/one/${file}`, value);
        const read = vi.fn(fixture.local.readFolderFileBinaryFn);
        const result = await resolveToInventory({ kind: 'local', origin: 'path:vendor/one' }, {
          fetchFn: noFetch, local: { ...fixture.local, readFolderFileBinaryFn: read },
        });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error.message);
        const files = readBundleFiles(result.value.content)!;
        for (const [file, value] of Object.entries(originals)) {
          const encoded = files[file];
          expect(isBinaryBundleValue(encoded)).toBe(true);
          if (!isBinaryBundleValue(encoded)) throw new Error(`Missing bytes: ${file}`);
          expect(decodeBundleValue(encoded)).toEqual(value);
          expect(fs.readFileSync(path.join(fixture.root, 'vendor/one', file))).toEqual(value);
        }
        expect(read.mock.calls.filter(([file]) => file.endsWith(MANIFEST_FILENAME))).toHaveLength(1);
        expect(read.mock.calls[0][0]).toBe(path.join(fixture.root, 'vendor/one', MANIFEST_FILENAME));
        const payload = await createResolvePayloadFn({
          ...fixture.local, fetchFn: noFetch, readFileFn: createFsReadFileFn(), listDiskFiles: fixture.local.listFolderFilesFn,
        })('path:vendor/one');
        expect(payload.ok).toBe(true);
        if (payload.ok) expect(payload.payload.files.get('binary.bin')).toEqual(binary);
      } finally { fixture.cleanup(); }
    },
  );

  it.each(['invalid-json', 'missing', 'directory'])(
    'refuses a %s manifest before enumerating payload', async (kind) => {
      const fixture = scratch();
      const manifestPath = path.join(fixture.root, 'vendor/one', MANIFEST_FILENAME);
      try {
        if (kind === 'invalid-json') fixture.write(`vendor/one/${MANIFEST_FILENAME}`, '{');
        if (kind === 'directory') fs.mkdirSync(manifestPath);
        const list = vi.fn(fixture.local.listFolderFilesFn);
        const result = await resolveToInventory({ kind: 'local', origin: 'path:vendor/one' }, {
          fetchFn: noFetch, local: { ...fixture.local, listFolderFilesFn: list },
        });
        expect(result).toMatchObject({ ok: false, error: { code: kind === 'directory' ? 'CONTENT_CONFLICT' : 'INVALID_MANIFEST' } });
        expect(list).not.toHaveBeenCalled();
      } finally {
        if (kind === 'directory') fs.rmdirSync(manifestPath);
        fixture.cleanup();
      }
    },
  );

  it('CLI review preserves binary baselines and user drift through production caller wiring', () => {
    const fixture = scratch();
    try {
      for (const origin of ['one', 'two']) {
        fixture.write(`vendor/${origin}/${MANIFEST_FILENAME}`, origin === 'one' ? invalidUtf8Manifest : manifest('2.0.0'));
        fixture.write(`vendor/${origin}/binary.bin`, origin === 'one' ? binary : Buffer.from([0, 0xff, 42]));
        fixture.write(`vendor/${origin}/empty.dat`, Buffer.alloc(0));
        fixture.write(`vendor/${origin}/text.txt`, 'café\r\n🌍\n');
      }
      fixture.write('app/binary.bin', binary);
      fixture.write('app/empty.dat', Buffer.alloc(0));
      fixture.write('app/text.txt', 'café\r\n🌍\n');
      const state = JSON.stringify({ formatVersion: 1, templates: {
        '@test/bytes': { origin: 'path:vendor/one', version: '1.0.0', targets: ['app'], excludedSubtrees: [] },
      }, projectOwnedRoots: [] });
      fixture.write('.frontx/project.json', state);
      fixture.write('frontx.mjs', '');
      buildSync({ entryPoints: [path.resolve('src/cli.ts')], bundle: true, platform: 'node', format: 'esm', outfile: path.join(fixture.root, 'frontx.mjs'), logLevel: 'silent' });
      function cli(args: string[]) {
        const result = spawnSync(process.execPath, [path.join(fixture.root, 'frontx.mjs'), ...args, '--json'], {
          cwd: fixture.root, encoding: 'utf8', timeout: 15000,
          env: { ...process.env, FRONTX_INVENTORY_ROOT: path.join(fixture.root, 'inventory'), FRONTX_TEST_LOCAL_SOURCE_DIR: '', FRONTX_CLI_FORCE_MAIN: '' },
        });
        expect(result.error).toBeUndefined();
        expect(result.stderr).toBe('');
        return JSON.parse(result.stdout);
      }
      expect(cli(['register', 'path:vendor/one']).ok).toBe(true);
      expect(cli(['list']).ok).toBe(true);
      expect(cli(['validate', '--project']).ok).toBe(true);
      expect(cli(['assemble', '--input', '{"templates":{"@test/bytes":["preview"]}}']).ok).toBe(true);
      const stateBeforeReview = fs.readFileSync(path.join(fixture.root, '.frontx/project.json'));
      const review = cli(['upgrade', '@test/bytes', 'path:vendor/two']);
      expect(review.error.code).toBe('CONFIRMATION_REQUIRED');
      expect(review.error.details.plan.operations).toEqual([
        { target: 'app', path: 'app/binary.bin', op: 'REPLACE' },
        { target: 'app', path: 'app/empty.dat', op: 'UNCHANGED' },
        { target: 'app', path: 'app/text.txt', op: 'UNCHANGED' },
      ]);
      expect(fs.readFileSync(path.join(fixture.root, 'app/binary.bin'))).toEqual(binary);
      const userBytes = Buffer.from([0, 0xff, 0xff, 85, 83, 69, 82]);
      fixture.write('app/binary.bin', userBytes);
      expect(cli(['upgrade', '@test/bytes', 'path:vendor/two']).error.code).toBe('CONTENT_CONFLICT');
      expect(fs.readFileSync(path.join(fixture.root, 'app/binary.bin'))).toEqual(userBytes);
      expect(fs.readFileSync(path.join(fixture.root, '.frontx/project.json'))).toEqual(stateBeforeReview);
      expect(fs.readFileSync(path.join(fixture.root, 'vendor/one', MANIFEST_FILENAME))).toEqual(invalidUtf8Manifest);
      expect(fs.readdirSync(path.join(fixture.root, 'inventory'))).toEqual([]);
      expect(fs.readdirSync(path.join(fixture.root, '.frontx'))).toEqual(['project.json']);
    } finally { fixture.cleanup(); }
  });
});
