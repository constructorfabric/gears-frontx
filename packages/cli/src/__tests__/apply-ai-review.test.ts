import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureFsAiReview, reviewFsAiCandidate } from '../adapters/fs-ai-review-capture';
import { applyFsAiReview } from '../adapters/fs-ai-review-materialize';
import { hashCandidateTree, reviewApplyAiReplacements } from '../commands/apply-ai-review';
import type { ProjectStateDocument } from '../project-state/types';

// Explicit, non-recursive cleanup of exactly the files and directories built here.
const created: string[][] = [];
afterEach(() => {
  for (const [root, ...files] of created.splice(0)) {
    for (const file of files) { try { fs.unlinkSync(path.join(root, file)); } catch { /* already absent */ } }
    for (const dir of ['project/.frontx/ai/demo', 'project/.frontx/ai', 'project/.frontx', 'project', 'source/.frontx/ai/demo', 'source/.frontx/ai', 'source/.frontx', 'source']) {
      try { fs.rmdirSync(path.join(root, dir)); } catch { /* absent or not empty: left for inspection */ }
    }
    fs.rmdirSync(root);
  }
});

function world(withSourceBundle = true) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-apply-ai-')));
  fs.mkdirSync(path.join(root, 'project/.frontx/ai/demo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'project/.frontx/ai/demo/guide.md'), 'my local edit');
  fs.mkdirSync(path.join(root, 'source'));
  if (withSourceBundle) {
    fs.mkdirSync(path.join(root, 'source/.frontx/ai/demo'), { recursive: true });
    fs.writeFileSync(path.join(root, 'source/.frontx/ai/demo/guide.md'), 'guide v1');
  }
  created.push([root, 'project/.frontx/ai/demo/guide.md', 'source/.frontx/ai/demo/guide.md']);
  return { project: path.join(root, 'project'), source: path.join(root, 'source') };
}

const docWith = (targets: Record<string, string[]>): ProjectStateDocument => ({
  formatVersion: 1,
  templates: Object.fromEntries(Object.entries(targets).map(([name, t]) => [name, { origin: 'path:x', version: '1.0.0', targets: t }])),
  projectOwnedRoots: [],
});

describe('apply AI bundle replacement review (plan-ai-recovery r9 §5)', () => {
  it('reviews replacing an existing bundle (local edit shown), and the approved snapshot writes exactly the reviewed bytes', async () => {
    const { project, source } = world();
    const review = await reviewApplyAiReplacements({
      projectRoot: project,
      names: ['demo'],
      document: docWith({ demo: [] }),
      sourceOf: async () => ({ kind: 'source', root: source }),
      capture: captureFsAiReview, captureBytes: reviewFsAiCandidate, hashSource: hashCandidateTree, blocked: 'skip', scope: {},
    });
    if (!review.ok) throw new Error(review.message);
    expect(review.needsApproval).toBe(true);
    expect(review.reviewable).toEqual([expect.objectContaining({ name: 'demo', changes: [{ path: 'guide.md', kind: 'replace' }] })]);
    expect(review.planDigest).toMatch(/^[0-9a-f]{64}$/);
    // The source changing after review does not change what is written.
    fs.writeFileSync(path.join(source, '.frontx/ai/demo/guide.md'), 'changed after review');
    applyFsAiReview(review.snapshots.get('demo')!, project, 'demo');
    expect(fs.readFileSync(path.join(project, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('guide v1');
  });

  it('refuses before any effect when the candidate cannot be acquired, and skips names it does not concern', async () => {
    const { project, source } = world();
    const refusal = await reviewApplyAiReplacements({
      projectRoot: project, names: ['demo'], document: docWith({ demo: [] }),
      sourceOf: async () => ({ kind: 'refused', message: 'cannot acquire' }), capture: captureFsAiReview, captureBytes: reviewFsAiCandidate, hashSource: hashCandidateTree, blocked: 'skip', scope: {},
    });
    expect(refusal).toMatchObject({ ok: false, details: { aiBundle: '.frontx/ai/demo' } });
    // Already applied elsewhere (not a first target), or no destination: nothing to review.
    for (const [names, targets] of [[['demo'], { demo: ['app'] }], [['fresh'], { fresh: [] }]] as [string[], Record<string, string[]>][]) {
      const review = await reviewApplyAiReplacements({
        projectRoot: project, names, document: docWith(targets),
        sourceOf: async () => ({ kind: 'source', root: source }), capture: captureFsAiReview, captureBytes: reviewFsAiCandidate, hashSource: hashCandidateTree, blocked: 'skip', scope: {},
      });
      expect(review).toMatchObject({ ok: true, needsApproval: false });
      if (review.ok) expect(review.snapshots.size).toBe(0);
    }
    expect(fs.readFileSync(path.join(project, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('my local edit');
  });

  it('a candidate without a bundle leaves the existing tree alone (no transition to review)', async () => {
    const { project, source } = world(false);
    const review = await reviewApplyAiReplacements({
      projectRoot: project, names: ['demo'], document: docWith({ demo: [] }),
      sourceOf: async () => ({ kind: 'source', root: source }), capture: captureFsAiReview, captureBytes: reviewFsAiCandidate, hashSource: hashCandidateTree, blocked: 'skip', scope: {},
    });
    expect(review).toMatchObject({ ok: true, needsApproval: false });
    if (review.ok) expect(review.snapshots.size).toBe(0);
  });

  it('reviews in-memory candidate bytes, binds the command scope into the digest, and fails closed on a blocker only when asked', async () => {
    const { project } = world(false);
    const bytes = new Map([['guide.md', Buffer.from('acquired, never installed')]]);
    const base = {
      projectRoot: project, names: ['demo'], document: docWith({ demo: [] }),
      sourceOf: async () => ({ kind: 'bytes' as const, files: bytes, identity: 'whole-candidate-v1' }),
      capture: captureFsAiReview, captureBytes: reviewFsAiCandidate, hashSource: hashCandidateTree, blocked: 'skip' as const,
    };
    const a = await reviewApplyAiReplacements({ ...base, scope: { batch: 1 } });
    const b = await reviewApplyAiReplacements({ ...base, scope: { batch: 2 } });
    if (!a.ok || !b.ok) throw new Error('expected reviews');
    expect(a.reviewable[0].changes).toEqual([{ path: 'guide.md', kind: 'replace' }]);
    expect(a.planDigest).not.toBe(b.planDigest);
    // A file standing at the destination: apply leaves it to the bundle step's guards, seed refuses.
    fs.unlinkSync(path.join(project, '.frontx/ai/demo/guide.md'));
    fs.rmdirSync(path.join(project, '.frontx/ai/demo'));
    fs.writeFileSync(path.join(project, '.frontx/ai/demo'), 'a file, not a bundle');
    expect(await reviewApplyAiReplacements({ ...base, scope: {} })).toMatchObject({ ok: true, needsApproval: false });
    expect(await reviewApplyAiReplacements({ ...base, blocked: 'refuse', scope: {} })).toMatchObject({ ok: false, details: { aiBundle: '.frontx/ai/demo' } });
    expect(fs.readFileSync(path.join(project, '.frontx/ai/demo'), 'utf8')).toBe('a file, not a bundle');
    fs.unlinkSync(path.join(project, '.frontx/ai/demo'));
  });

  it('binds the WHOLE candidate: a non-AI payload change alone yields a different digest', async () => {
    const { project, source } = world();
    fs.writeFileSync(path.join(source, 'payload.ts'), 'export const v = 1;');
    created[created.length - 1].push('source/payload.ts');
    const review = () =>
      reviewApplyAiReplacements({
        projectRoot: project, names: ['demo'], document: docWith({ demo: [] }),
        sourceOf: async () => ({ kind: 'source', root: source }),
        capture: captureFsAiReview, captureBytes: reviewFsAiCandidate, hashSource: hashCandidateTree, blocked: 'refuse', scope: {},
      });
    const before = await review();
    fs.writeFileSync(path.join(source, 'payload.ts'), 'export const v = 2;');
    const after = await review();
    if (!before.ok || !after.ok) throw new Error('expected reviews');
    expect(after.reviewable).toEqual(before.reviewable); // the AI tree is unchanged
    expect(after.planDigest).not.toBe(before.planDigest); // but the approval token is not
    expect(after.candidates.get('demo')?.root).toBe(source);
  });

  it('refuses a folder candidate that changes while its AI tree is being captured (one state for diff and digest)', async () => {
    const { project, source } = world();
    let calls = 0;
    const review = await reviewApplyAiReplacements({
      projectRoot: project, names: ['demo'], document: docWith({ demo: [] }),
      sourceOf: async () => ({ kind: 'source', root: source }),
      capture: captureFsAiReview, captureBytes: reviewFsAiCandidate, blocked: 'refuse', scope: {},
      hashSource: () => `state-${calls++}`, // the folder differs before and after the capture
    });
    expect(review).toMatchObject({ ok: false, message: expect.stringContaining('changed while it was being reviewed') });
    expect(fs.readFileSync(path.join(project, '.frontx/ai/demo/guide.md'), 'utf8')).toBe('my local edit');
  });
});
