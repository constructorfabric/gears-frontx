import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { reviewFsAiCandidate } from '../adapters/fs-ai-review-capture';
import { AiReviewDriftError, applyFsAiReview } from '../adapters/fs-ai-review-materialize';

// Explicit, non-recursive cleanup of the exact tree each test builds.
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    for (const file of ['outside-target', 'project/.frontx/ai/demo/alias.md']) {
      try { fs.unlinkSync(path.join(root, file)); } catch { /* already absent */ }
    }
    for (const link of ['project/.frontx/ai/demo', 'project/.frontx/ai']) {
      try { if (fs.lstatSync(path.join(root, link)).isSymbolicLink()) fs.unlinkSync(path.join(root, link)); } catch { /* already absent */ }
    }
    for (const dir of ['project/.frontx/ai/demo/sub', 'project/.frontx/ai/demo/old', 'project/.frontx/ai/demo', 'project/.frontx/ai', 'project/.frontx', 'outside-a', 'outside-b', 'outside', 'project']) {
      const full = path.join(root, dir);
      let entries: string[];
      try { entries = fs.readdirSync(full); } catch { continue; }
      for (const entry of entries) if (!fs.lstatSync(path.join(full, entry)).isDirectory()) fs.unlinkSync(path.join(full, entry));
      fs.rmdirSync(full);
    }
    fs.rmdirSync(root);
  }
});

function world() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-ai-apply-')));
  roots.push(root);
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.frontx/ai/demo/old'), { recursive: true });
  fs.writeFileSync(path.join(project, '.frontx/ai/demo/keep.md'), 'same');
  fs.writeFileSync(path.join(project, '.frontx/ai/demo/edited.md'), 'local edit');
  fs.writeFileSync(path.join(project, '.frontx/ai/demo/old/gone.md'), 'dropped by candidate');
  return { root, project, dest: path.join(project, '.frontx/ai/demo') };
}

const candidate = new Map<string, Uint8Array>([
  ['keep.md', Buffer.from('same')],
  ['edited.md', Buffer.from([0, 255, 1])],
  ['sub/new.md', Buffer.from('new')],
]);

describe('applyFsAiReview', () => {
  it('shows local edits and removals in the review, then makes the destination exactly the snapshot bytes', () => {
    const { project, dest } = world();
    const snapshot = reviewFsAiCandidate(project, 'demo', candidate);
    expect(snapshot.changes.filter((c) => c.kind !== 'unchanged')).toEqual([
      { path: 'edited.md', kind: 'replace' },
      { path: 'old', kind: 'local-only-directory' },
      { path: 'old/gone.md', kind: 'local-only' },
      { path: 'sub', kind: 'add-directory' },
      { path: 'sub/new.md', kind: 'add' },
    ]);
    candidate.get('edited.md')![0] = 9; // mutating the caller's buffer cannot change the reviewed bytes
    applyFsAiReview(snapshot, project, 'demo');
    candidate.get('edited.md')![0] = 0;
    expect(fs.readFileSync(path.join(dest, 'edited.md'))).toEqual(Buffer.from([0, 255, 1]));
    expect(fs.readFileSync(path.join(dest, 'sub/new.md'), 'utf8')).toBe('new');
    expect(fs.existsSync(path.join(dest, 'old'))).toBe(false);
    expect(fs.readdirSync(dest).sort()).toEqual(['edited.md', 'keep.md', 'sub']);
  });

  it('refuses without writing when the destination changed after review', () => {
    const { project, dest } = world();
    const snapshot = reviewFsAiCandidate(project, 'demo', candidate);
    fs.writeFileSync(path.join(dest, 'edited.md'), 'edited again after review');
    expect(() => applyFsAiReview(snapshot, project, 'demo')).toThrow(AiReviewDriftError);
    expect(fs.readFileSync(path.join(dest, 'edited.md'), 'utf8')).toBe('edited again after review');
    expect(fs.existsSync(path.join(dest, 'sub'))).toBe(false);
  });

  it('refuses when a destination ancestor was replaced by a symlink after review', () => {
    const { root, project } = world();
    const snapshot = reviewFsAiCandidate(project, 'demo', candidate);
    fs.mkdirSync(path.join(root, 'outside'));
    fs.renameSync(path.join(project, '.frontx/ai'), path.join(root, 'outside/ai'));
    fs.symlinkSync(path.join(root, 'outside/ai'), path.join(project, '.frontx/ai'), 'dir');
    expect(() => applyFsAiReview(snapshot, project, 'demo')).toThrow();
    expect(fs.readFileSync(path.join(root, 'outside/ai/demo/edited.md'), 'utf8')).toBe('local edit');
    // move the tree back for the explicit cleanup
    fs.unlinkSync(path.join(project, '.frontx/ai'));
    fs.renameSync(path.join(root, 'outside/ai'), path.join(project, '.frontx/ai'));
  });

  it('a candidate without a bundle removes the destination, as reviewed', () => {
    const { project, dest } = world();
    const snapshot = reviewFsAiCandidate(project, 'demo', undefined);
    expect(snapshot.changes.every((c) => c.kind.startsWith('local-only'))).toBe(true);
    applyFsAiReview(snapshot, project, 'demo');
    expect(fs.existsSync(dest)).toBe(false);
  });

  it.each([false, true])('removes a nested %s local-only symlink without following it', (dangling) => {
    const { root, project, dest } = world();
    const target = dangling ? path.join(root, 'missing-target') : path.join(root, 'outside-target');
    if (!dangling) fs.writeFileSync(target, 'target bytes');
    fs.symlinkSync(target, path.join(dest, 'alias.md'));
    const withoutAlias = new Map(candidate);
    withoutAlias.delete('keep.md');
    withoutAlias.delete('edited.md');
    withoutAlias.delete('sub/new.md');
    const snapshot = reviewFsAiCandidate(project, 'demo', withoutAlias);

    applyFsAiReview(snapshot, project, 'demo');

    expect(fs.existsSync(path.join(dest, 'alias.md'))).toBe(false);
    expect(fs.lstatSync(target, { throwIfNoEntry: false })?.isFile() ?? false).toBe(!dangling);
    if (!dangling) expect(fs.readFileSync(target, 'utf8')).toBe('target bytes');
  });

  it.each([false, true])('replaces a %s root symlink without following it', (dangling) => {
    const { root, project, dest } = world();
    const target = dangling ? path.join(root, 'missing-target') : path.join(root, 'outside');
    if (!dangling) {
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, 'keep'), 'target bytes');
    }
    fs.rmSync(dest, { recursive: true });
    fs.symlinkSync(target, dest, 'dir');
    const snapshot = reviewFsAiCandidate(project, 'demo', candidate);
    expect((snapshot.destination.identity as { ancestors: { type?: string; target?: string }[] }).ancestors)
      .toContainEqual(expect.objectContaining({ type: 'symlink', target }));
    applyFsAiReview(snapshot, project, 'demo');
    expect(fs.lstatSync(dest).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'sub/new.md'), 'utf8')).toBe('new');
    if (!dangling) expect(fs.readFileSync(path.join(target, 'keep'), 'utf8')).toBe('target bytes');
  });

  it('rejects a root link retargeted after review without touching either target', () => {
    const { root, project, dest } = world();
    const a = path.join(root, 'outside-a'), b = path.join(root, 'outside-b');
    fs.mkdirSync(a); fs.mkdirSync(b);
    fs.writeFileSync(path.join(a, 'keep'), 'a'); fs.writeFileSync(path.join(b, 'keep'), 'b');
    fs.rmSync(dest, { recursive: true });
    fs.symlinkSync(a, dest, 'dir');
    const snapshot = reviewFsAiCandidate(project, 'demo', candidate);
    fs.unlinkSync(dest); fs.symlinkSync(b, dest, 'dir');
    expect(() => applyFsAiReview(snapshot, project, 'demo')).toThrow(AiReviewDriftError);
    expect(fs.readFileSync(path.join(a, 'keep'), 'utf8')).toBe('a');
    expect(fs.readFileSync(path.join(b, 'keep'), 'utf8')).toBe('b');
    fs.unlinkSync(dest);
    fs.unlinkSync(path.join(a, 'keep')); fs.unlinkSync(path.join(b, 'keep'));
    fs.rmdirSync(a); fs.rmdirSync(b);
  });
});
