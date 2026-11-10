import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureFsAiReview } from '../adapters/fs-ai-review-capture';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    for (const link of ['project-link', 'project/.frontx', 'source/.frontx']) {
      try { if (fs.lstatSync(path.join(root, link)).isSymbolicLink()) fs.unlinkSync(path.join(root, link)); } catch { /* already absent */ }
    }
    for (const file of ['outside/ai/demo/secret']) { try { fs.unlinkSync(path.join(root, file)); } catch { /* already absent */ } }
    for (const dir of ['outside/ai/demo', 'outside/ai', 'outside']) { try { fs.rmdirSync(path.join(root, dir)); } catch { /* already absent */ } }
    for (const file of [path.join(root, 'source', '.frontx/ai/demo/nested/file'), path.join(root, 'project/.frontx/ai/demo/local')]) {
      try { fs.unlinkSync(file); } catch { /* already absent */ }
    }
    for (const dir of [path.join(root, 'source/.frontx/ai/demo/nested'), path.join(root, 'source/.frontx/ai/demo/empty'), path.join(root, 'source/.frontx/ai/demo'), path.join(root, 'source/.frontx/ai'), path.join(root, 'source/.frontx'), path.join(root, 'project/.frontx/ai/demo'), path.join(root, 'project/.frontx/ai'), path.join(root, 'project/.frontx'), path.join(root, 'source'), path.join(root, 'project'), root]) {
      try { fs.rmdirSync(dir); } catch { /* already absent */ }
    }
  }
});

describe('captureFsAiReview', () => {
  it('captures empty directories as empty metadata and reads through symlinked project roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-ai-review-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'source/.frontx/ai/demo/nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'source/.frontx/ai/demo/nested/file'), 'candidate');
    fs.mkdirSync(path.join(root, 'project/.frontx/ai/demo'), { recursive: true });
    fs.writeFileSync(path.join(root, 'project/.frontx/ai/demo/local'), 'local');
    fs.symlinkSync(path.join(root, 'project'), path.join(root, 'project-link'), 'dir');

    const review = captureFsAiReview(path.join(root, 'source'), path.join(root, 'project-link'), 'demo');
    expect(review.files.map(file => file.path)).toEqual(['nested/file']);
    expect(review.existing.map(file => file.path)).toEqual(['local']);
    expect(review.changes).toEqual([{ path: 'local', kind: 'local-only' }, { path: 'nested', kind: 'add-directory' }, { path: 'nested/file', kind: 'add' }]);
  });

  it('binds absent source state and captures empty directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-ai-review-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'source'), { recursive: true });
    fs.mkdirSync(path.join(root, 'project'), { recursive: true });
    const absent = captureFsAiReview(path.join(root, 'source'), path.join(root, 'project'), 'demo');
    expect(absent.destination.identity).toMatchObject({ sourceState: 'absent' });

    fs.mkdirSync(path.join(root, 'source/.frontx/ai/demo/empty'), { recursive: true });
    const review = captureFsAiReview(path.join(root, 'source'), path.join(root, 'project'), 'demo');
    expect(review.directories).toEqual(['empty']);
    expect(review.files).toEqual([]);
  });

  it.each(['project', 'source'])('refuses a symlinked %s .frontx ancestor before reading through it', (side) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-ai-review-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'source'), { recursive: true });
    fs.mkdirSync(path.join(root, 'project'), { recursive: true });
    fs.mkdirSync(path.join(root, 'outside/ai/demo'), { recursive: true });
    const secret = path.join(root, 'outside/ai/demo/secret');
    fs.writeFileSync(secret, 'outside');
    fs.symlinkSync(path.join(root, 'outside'), path.join(root, side, '.frontx'), 'dir');
    const before = fs.statSync(secret).atimeMs;
    const readFileSync = fs.readFileSync;
    const read: string[] = [];
    (fs as { readFileSync: unknown }).readFileSync = (file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
      read.push(String(file));
      return (readFileSync as (...a: unknown[]) => unknown)(file, ...rest);
    };
    try {
      expect(() => captureFsAiReview(path.join(root, 'source'), path.join(root, 'project'), 'demo')).toThrow(/ancestor/);
    } finally {
      (fs as { readFileSync: unknown }).readFileSync = readFileSync;
    }
    expect(read).toEqual([]);
    expect(fs.statSync(secret).atimeMs).toBe(before);
  });
});
