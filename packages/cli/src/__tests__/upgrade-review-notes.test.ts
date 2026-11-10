import { describe, expect, it } from 'vitest';
import { createAiReview } from '../operations/ai-review';
import { protectedSkipNote, renderReviewablePlan, reviewNotes } from '../upgrade/plan';
import type { UpgradePlan } from '../upgrade/types';

// Pure: no filesystem, nothing to clean up.
const bytes = (s: string) => Buffer.from(s);
const plan = (extra: Partial<UpgradePlan>): UpgradePlan =>
  ({
    name: 'demo',
    from: { origin: 'path:v1', version: '1.0.0' },
    to: { origin: 'path:v2', version: '2.0.0' },
    targets: ['.'],
    operations: [],
    skipped: [],
    exclusionRootsByTarget: {},
    toExcludedSubtrees: [],
    ...extra,
  }) as UpgradePlan;

describe('upgrade review discloses consequences settled by rulings', () => {
  it('names overwritten local AI edits and removed local-only files, with the hashes of what is there now', () => {
    const ai = createAiReview(
      { path: '/p/.frontx/ai/demo', identity: { state: 'present' } },
      [{ path: 'SKILL.md', bytes: bytes('v2') }],
      [{ path: 'SKILL.md', bytes: bytes('my edit') }, { path: 'my-notes.md', bytes: bytes('mine') }],
    );
    const p = plan({ ai });
    expect(reviewNotes(p)).toEqual([expect.stringContaining('1 file(s) will be overwritten and 1 file(s)/folder(s) that only the project has will be removed; local edits there are not kept')]);
    expect(renderReviewablePlan(p).ai?.existing.map((f) => f.path)).toEqual(['SKILL.md', 'my-notes.md']);
  });

  it('states the risk of protected skips while the version advances, and stays silent without them', () => {
    const p = plan({ skipped: [{ target: '.', path: 'assets/blob.bin', reason: 'OUTSIDE_BOUNDARY' }] });
    expect(protectedSkipNote(p)).toMatch(/1 path\(s\) are skipped as protected .* the recorded version still advances, so a later upgrade may conflict/);
    expect(reviewNotes(plan({}))).toEqual([]);
  });

  it('explicitly identifies a bundle root symlink and says the target stays untouched', () => {
    const ai = createAiReview(
      { path: '/p/.frontx/ai/demo', identity: { state: 'absent', ancestors: [{ type: 'symlink', target: '../outside' }] } },
      [ { path: 'new.md', bytes: bytes('new') } ],
    );
    expect(reviewNotes(plan({ ai }))).toEqual([
      expect.stringContaining('is a symbolic link to "../outside"; the link itself will be replaced and its target will be left untouched'),
    ]);
  });
});
