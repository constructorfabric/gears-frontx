import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsContentStore, UnindexedSlotResidueError } from '../adapters/fs-content-store';

// Explicit, non-recursive cleanup of exactly the entries each test creates.
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    for (const file of ['tpl/stale.txt', 'tpl/frontx-template.json', 'fresh/frontx-template.json']) {
      try { fs.unlinkSync(path.join(root, file)); } catch { /* already absent */ }
    }
    for (const dir of ['tpl', 'fresh']) { try { fs.rmdirSync(path.join(root, dir)); } catch { /* already absent */ } }
    fs.rmdirSync(root);
  }
});

describe('first install never overlays residue at an unindexed slot path', () => {
  it('refuses, leaving the residue byte-for-byte, and still installs into an absent path', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-store-residue-')));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'tpl'));
    fs.writeFileSync(path.join(root, 'tpl/stale.txt'), 'left by an interrupted install');
    const store = new FsContentStore(root);
    expect(() => store.write('tpl', '{"name":"tpl","version":"1.0.0"}')).toThrow(UnindexedSlotResidueError);
    expect(fs.readdirSync(path.join(root, 'tpl'))).toEqual(['stale.txt']);
    expect(fs.readFileSync(path.join(root, 'tpl/stale.txt'), 'utf8')).toBe('left by an interrupted install');
    store.write('fresh', '{"name":"fresh","version":"1.0.0"}');
    expect(fs.readdirSync(path.join(root, 'fresh'))).toEqual(['frontx-template.json']);
  });
});
