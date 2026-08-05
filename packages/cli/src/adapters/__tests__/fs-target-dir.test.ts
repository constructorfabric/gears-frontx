// @cpt-dod:cpt-frontx-dod-cli-scaffolding-seed-empty-target:p1
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createFsReadTargetDirFn } from '../fs-target-dir';

const created: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-target-dir-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('createFsReadTargetDirFn — cpt-frontx-dod-cli-scaffolding-seed-empty-target', () => {
  it('reports an absent path as undefined, distinguishing it from an empty directory', async () => {
    const readTargetDir = createFsReadTargetDirFn();

    const result = await readTargetDir(path.join(tmpDir(), 'does-not-exist'));

    expect(result).toBeUndefined();
  });

  it('reports an existing empty directory as an empty listing', async () => {
    const readTargetDir = createFsReadTargetDirFn();

    const result = await readTargetDir(tmpDir());

    expect(result).toEqual([]);
  });

  it('reports the entry names of a directory that holds content', async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'package.json'), '{}');
    fs.mkdirSync(path.join(dir, 'src'));
    const readTargetDir = createFsReadTargetDirFn();

    const result = await readTargetDir(dir);

    expect(Array.isArray(result) ? [...result].sort() : result).toEqual(['package.json', 'src']);
  });

  // Its own state, not a listing: reporting `[path]` described a file as a
  // directory containing itself, and sent the refusal down the branch that
  // recommends `frontx add` against a path add cannot use either.
  it('reports a path that exists as a file as not-a-directory rather than as a listing', async () => {
    const file = path.join(tmpDir(), 'not-a-dir.txt');
    fs.writeFileSync(file, 'content');
    const readTargetDir = createFsReadTargetDirFn();

    const result = await readTargetDir(file);

    expect(result).toBe('not-a-directory');
  });

  // An unreadable directory says nothing about emptiness; swallowing the error
  // would read it as empty and wave the assembly through.
  it('rethrows a permission failure rather than reporting an unreadable directory as empty', async () => {
    const locked = path.join(tmpDir(), 'locked');
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0o000);
    const readTargetDir = createFsReadTargetDirFn();

    try {
      await expect(readTargetDir(locked)).rejects.toThrow();
    } finally {
      // Restored even when the assertion above fails, so the afterEach sweep can
      // still remove the directory.
      fs.chmodSync(locked, 0o755);
    }
  });
});
