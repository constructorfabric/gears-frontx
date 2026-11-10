// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-state:cpt-frontx-state-cli-scaffolding-delete-op:p1
//
// Approval of a `delete` is bound to the plan that was reviewed: a plan that
// differs when the deletion is about to run stops the command and presents the
// updated plan for a renewed decision. Unit-level (injected fakes, one
// process); the built-binary counterpart is `delete-plan-binding-real-cli.test.ts`.
import { describe, expect, it, vi } from 'vitest';
import { deleteTarget, computeDeletionPlanDigest } from '../commands/delete';
import type { ConfirmDeletionFn, DeleteCommandFlags, DeleteOutcome, DeletionReview } from '../commands/delete';
import type { DeletePlanInventoryPort, ListTargetFilesFn, ListUnenumerableTargetEntriesFn } from '../scaffold/delete-plan';
import { InventoryState } from '../inventory/types';
import type { CanonicalizeTargetFn } from '../scaffold/conflict-check';
import type { ProjectStateDocument, ReadProjectStateFn, WriteProjectStateFn, TemplateEntry } from '../project-state/types';
import type { ReadFileFn } from '../manifest/types';
import { computePlanDigest } from '../upgrade/plan';
import type { UpgradePlan } from '../upgrade/types';

const identity: CanonicalizeTargetFn = (raw) => raw;
const neverRead: ReadFileFn = async () => {
  throw new Error('readFileFn must not be called for a remote-origin fixture');
};
const inventory: DeletePlanInventoryPort = {
  lookup: (name) => ({
    name,
    source: `github:acme/${name}@v1.0.0`,
    ref: 'v1.0.0',
    status: InventoryState.INSTALLED,
    content: JSON.stringify({ name, version: '1.0.0', excludedSubtrees: [], description: 'A template.' }),
  }),
};
const entry = (targets: string[], extra: Partial<TemplateEntry> = {}): TemplateEntry => ({
  origin: 'github:acme/tmpl@v1',
  version: '1.0.0',
  targets,
  ...extra,
});

interface Harness {
  // What the next plan computation sees; mutated by a test to model a change.
  files: Record<string, string[]>;
  unenumerable: Record<string, string[]>;
  document: () => ProjectStateDocument;
  setDocument: (d: ProjectStateDocument) => void;
  reads: () => number;
  // Called with the 1-based number of the state read each plan computation makes.
  onRead: (fn: (n: number) => void) => void;
  removed: string[];
  write: WriteProjectStateFn;
  removeAiBundle: ReturnType<typeof vi.fn>;
  call: (flags: DeleteCommandFlags, confirm?: ConfirmDeletionFn, target?: string) => Promise<DeleteOutcome>;
}

function harness(initial: ProjectStateDocument, files: Record<string, string[]>): Harness {
  let stored = JSON.stringify(initial);
  let readCount = 0;
  let hook: (n: number) => void = () => undefined;
  const removed: string[] = [];
  const write: WriteProjectStateFn = vi.fn(async (_p, content) => {
    stored = content;
  });
  const removeAiBundle = vi.fn(async () => undefined);
  const h: Harness = {
    files,
    unenumerable: {},
    document: () => JSON.parse(stored) as ProjectStateDocument,
    setDocument: (d) => {
      stored = JSON.stringify(d);
    },
    reads: () => readCount,
    onRead: (fn) => {
      hook = fn;
    },
    removed,
    write,
    removeAiBundle,
    call: (flags, confirm, target = 'app') => {
      const read: ReadProjectStateFn = async () => {
        readCount += 1;
        hook(readCount);
        return stored;
      };
      const list: ListTargetFilesFn = async (dir) => h.files[dir] ?? [];
      const unenumerable: ListUnenumerableTargetEntriesFn = async (dir) => h.unenumerable[dir] ?? [];
      return deleteTarget(
        target,
        '/repo',
        flags,
        inventory,
        identity,
        list,
        unenumerable,
        neverRead,
        async (p) => {
          removed.push(p);
        },
        () => undefined,
        read,
        write,
        confirm ??
          (async () => {
            throw new Error('confirmDeletionFn must not be called in this mode');
          }),
        removeAiBundle,
      );
    },
  };
  return h;
}

const REVIEW: DeleteCommandFlags = { jsonMode: true, dryRun: false, yes: false };
const confirming = (digest: string | undefined): DeleteCommandFlags => ({
  jsonMode: true,
  dryRun: false,
  yes: true,
  ...(digest !== undefined ? { expectedPlanDigest: digest } : {}),
});
const stateWith = (...templates: [string, TemplateEntry][]): ProjectStateDocument => ({
  formatVersion: 1,
  templates: Object.fromEntries(templates),
  projectOwnedRoots: [],
});

function details(outcome: DeleteOutcome): Record<string, unknown> {
  if (outcome.ok || outcome.code !== 'CONFIRMATION_REQUIRED') throw new Error(`not a review: ${JSON.stringify(outcome)}`);
  return outcome.details ?? {};
}
const digestOf = (outcome: DeleteOutcome): string => details(outcome).planDigest as string;

function expectNothingWritten(h: Harness): void {
  expect(h.removed).toEqual([]);
  expect(h.write).not.toHaveBeenCalled();
  expect(h.removeAiBundle).not.toHaveBeenCalled();
}

describe('delete plan digest (cpt-frontx-flow-cli-scaffolding-delete-target / inst-del-digest-plan)', () => {
  const base: DeletionReview = {
    target: 'app',
    templateName: 'tpl',
    toDelete: ['app/a.ts', 'app/b.ts'],
    toPreserve: ['app/keep'],
    aiBundle: { removed: false, path: null },
  };

  it('is 64 hex, stable, and domain-separated from the upgrade plan digest', () => {
    const d = computeDeletionPlanDigest(base);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(computeDeletionPlanDigest({ ...base })).toBe(d);
    const upgradePlan = { template: 'tpl', from: base, to: base, targets: ['app'], operations: [] } as unknown as UpgradePlan;
    expect(computePlanDigest(upgradePlan)).not.toBe(d);
  });

  it.each<[string, Partial<DeletionReview>]>([
    ['a path added to toDelete', { toDelete: ['app/a.ts', 'app/b.ts', 'app/c.ts'] }],
    ['a path removed from toDelete', { toDelete: ['app/a.ts'] }],
    ['toPreserve changed', { toPreserve: ['app/keep', 'app/keep2'] }],
    ['drift appeared', { exclusionsDrift: { current: ['x'], recorded: [] } }],
    ['relinquishedGround appeared', { relinquishedGround: ['app/plugins'] }],
    ['owner changed', { templateName: 'other' }],
    ['the AI bundle removal flipped', { aiBundle: { removed: true, path: '.frontx/ai/tpl' } }],
    ['the target changed', { target: 'app2' }],
  ])('changes when %s', (_label, change) => {
    expect(computeDeletionPlanDigest({ ...base, ...change })).not.toBe(computeDeletionPlanDigest(base));
  });
});

describe('--json protocol: the confirming call is bound to the reviewed plan', () => {
  const doc = () => stateWith(['tpl', entry(['app', 'other'])]);

  it('the review carries the whole projection and a digest that is stable between calls', async () => {
    const h = harness(doc(), { '/repo/app': ['b.ts', 'a.ts'] });
    const first = await h.call(REVIEW);
    const second = await h.call(REVIEW);
    expect(details(first)).toMatchObject({
      target: 'app',
      templateName: 'tpl',
      toDelete: ['app/a.ts', 'app/b.ts'],
      toPreserve: [],
      aiBundle: { removed: false, path: null },
    });
    expect(digestOf(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(digestOf(first)).toBe(digestOf(second));
    expectNothingWritten(h);
  });

  it('is independent of the order the plan source lists paths in', async () => {
    const a = harness(doc(), { '/repo/app': ['a.ts', 'b.ts'] });
    const b = harness(doc(), { '/repo/app': ['b.ts', 'a.ts'] });
    expect(digestOf(await a.call(REVIEW))).toBe(digestOf(await b.call(REVIEW)));
  });

  it('a matching digest deletes and reports it was bound to the reviewed plan', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const digest = digestOf(await h.call(REVIEW));
    const done = await h.call(confirming(digest));
    expect(done).toMatchObject({ ok: true, outcome: 'deleted', boundToReviewedPlan: true, planDigest: digest, wasLastTarget: false });
    expect(h.removed).toEqual(['/repo/app/a.ts']);
    expect(h.document().templates.tpl.targets).toEqual(['other']);
  });

  it('binds the AI bundle tree the last-target deletion removes: an edit to it after review is a changed plan', async () => {
    const h = harness(stateWith(['tpl', entry(['app'])]), { '/repo/app': ['a.ts'] });
    let guide = 'aaaa';
    Object.assign(h.removeAiBundle, {
      describe: () => ({ files: [{ path: 'guide.md', length: guide.length, sha256: guide }], directories: [], digest: guide }),
    });
    const review = await h.call(REVIEW);
    expect(details(review)).toMatchObject({ aiBundle: { removed: true, tree: { files: [{ path: 'guide.md' }] } } });
    const d1 = digestOf(review);
    guide = 'local edit after review';
    const refused = await h.call(confirming(d1));
    expect(refused).toMatchObject({ ok: false, code: 'CONFIRMATION_REQUIRED' });
    expect(digestOf(refused)).not.toBe(d1);
    expectNothingWritten(h);
    const done = await h.call(confirming(digestOf(refused)));
    expect(done).toMatchObject({ ok: true, outcome: 'deleted', wasLastTarget: true });
    expect(h.removeAiBundle).toHaveBeenCalledWith('tpl');
  });

  it('a file that appeared after the review is a changed plan: the updated plan is returned, nothing is written', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const d1 = digestOf(await h.call(REVIEW));
    h.files['/repo/app'] = ['a.ts', 'notes-after-review.md'];
    const refused = await h.call(confirming(d1));
    expect(refused).toMatchObject({ ok: false, code: 'CONFIRMATION_REQUIRED' });
    expect(details(refused)).toMatchObject({ toDelete: ['app/a.ts', 'app/notes-after-review.md'], planChangedSinceReview: true });
    expect(digestOf(refused)).not.toBe(d1);
    expectNothingWritten(h);
    // Only the digest of the updated plan, once reviewed, deletes it — in full.
    const done = await h.call(confirming(digestOf(refused)));
    expect(done).toMatchObject({ ok: true, outcome: 'deleted' });
    expect(h.removed).toEqual(['/repo/app/a.ts', '/repo/app/notes-after-review.md']);
  });

  it('a second change after the second review is refused again; only the last digest deletes', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const d1 = digestOf(await h.call(REVIEW));
    h.files['/repo/app'] = ['a.ts', 'b.ts'];
    const r2 = await h.call(confirming(d1));
    h.files['/repo/app'] = ['a.ts', 'b.ts', 'c.ts'];
    const r3 = await h.call(confirming(digestOf(r2)));
    expect(details(r3).planChangedSinceReview).toBe(true);
    expectNothingWritten(h);
    expect(await h.call(confirming(digestOf(r3)))).toMatchObject({ ok: true, outcome: 'deleted' });
    expect(h.removed).toHaveLength(3);
  });

  it('a bare --yes (no digest) deletes nothing and returns the current plan with its digest', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const out = await h.call(confirming(undefined));
    expect(out).toMatchObject({ ok: false, code: 'CONFIRMATION_REQUIRED' });
    expect(out.ok === false && out.message).toContain('--plan-digest');
    expect(details(out).planChangedSinceReview).toBeUndefined();
    expect(digestOf(out)).toMatch(/^[0-9a-f]{64}$/);
    expectNothingWritten(h);
  });

  it('the FINAL plan is compared: a change between the first and second computation of one process is refused', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const d1 = digestOf(await h.call(REVIEW));
    const readsBefore = h.reads();
    // Reads in the confirming call: #1 is the initial computation, #2 the final recompute.
    h.onRead((n) => {
      if (n === readsBefore + 2) h.files['/repo/app'] = ['a.ts', 'late.ts'];
    });
    const out = await h.call(confirming(d1));
    expect(out).toMatchObject({ ok: false, code: 'CONFIRMATION_REQUIRED' });
    expect(details(out).toDelete).toEqual(['app/a.ts', 'app/late.ts']);
    expectNothingWritten(h);
  });

  it('a changed set of preserved paths alone is a changed plan', async () => {
    const h = harness(stateWith(['tpl', entry(['app'])]), { '/repo/app': ['a.ts'] });
    const d1 = digestOf(await h.call(REVIEW));
    h.unenumerable['/repo/app'] = ['socket.sock'];
    const out = await h.call(confirming(d1));
    expect(details(out).planChangedSinceReview).toBe(true);
    expect(details(out).toPreserve).toEqual(['app/socket.sock']);
    expectNothingWritten(h);
  });

  it('a change of the owner or of whether the AI bundle goes is a changed plan', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const d1 = digestOf(await h.call(REVIEW));
    expect(details(await h.call(REVIEW)).aiBundle).toEqual({ removed: false, path: null });
    // `other` was removed elsewhere: `app` is now the owner's last target.
    h.setDocument(stateWith(['tpl', entry(['app'])]));
    const out = await h.call(confirming(d1));
    expect(details(out)).toMatchObject({ planChangedSinceReview: true, aiBundle: { removed: true, path: '.frontx/ai/tpl' } });
    expectNothingWritten(h);
  });

  it('shows the bundle removal in the review of a last target', async () => {
    const h = harness(stateWith(['tpl', entry(['app'])]), { '/repo/app': ['a.ts'] });
    expect(details(await h.call(REVIEW)).aiBundle).toEqual({ removed: true, path: '.frontx/ai/tpl' });
  });

  describe('empty plans are plans, not no-ops', () => {
    it('an unchanged empty plan for a last target still deletes: state updated, bundle removed', async () => {
      const h = harness(stateWith(['tpl', entry(['app'])]), { '/repo/app': [] });
      const d1 = digestOf(await h.call(REVIEW));
      const done = await h.call(confirming(d1));
      expect(done).toMatchObject({ ok: true, outcome: 'deleted', wasLastTarget: true, toDelete: [] });
      expect(h.document().templates.tpl.targets).toEqual([]);
      expect(h.removeAiBundle).toHaveBeenCalledWith('tpl');
    });

    it('empty → non-empty is refused with no writes of any kind', async () => {
      const h = harness(stateWith(['tpl', entry(['app'])]), { '/repo/app': [] });
      const d1 = digestOf(await h.call(REVIEW));
      h.files['/repo/app'] = ['appeared.ts'];
      const out = await h.call(confirming(d1));
      expect(details(out)).toMatchObject({ toDelete: ['app/appeared.ts'], planChangedSinceReview: true });
      expectNothingWritten(h);
    });

    it('non-empty → empty is refused with no writes of any kind', async () => {
      const h = harness(stateWith(['tpl', entry(['app'])]), { '/repo/app': ['a.ts'] });
      const d1 = digestOf(await h.call(REVIEW));
      h.files['/repo/app'] = [];
      const out = await h.call(confirming(d1));
      expect(details(out)).toMatchObject({ toDelete: [], planChangedSinceReview: true });
      expectNothingWritten(h);
    });
  });

  describe('a failed recomputation is that failure, never a fresh list', () => {
    it('the target disappearing from the record → TARGET_NOT_APPLIED, no digest, no writes', async () => {
      const h = harness(doc(), { '/repo/app': ['a.ts'] });
      const d1 = digestOf(await h.call(REVIEW));
      h.setDocument(stateWith(['tpl', entry(['other'])]));
      const out = await h.call(confirming(d1));
      expect(out).toMatchObject({ ok: false, code: 'TARGET_NOT_APPLIED' });
      expect(out.ok === false && out.details?.planDigest).toBeUndefined();
      expectNothingWritten(h);
    });

    it('an unreadable project state → PROJECT_INVALID, no digest, no writes', async () => {
      const h = harness(doc(), { '/repo/app': ['a.ts'] });
      const d1 = digestOf(await h.call(REVIEW));
      const readsBefore = h.reads();
      h.onRead((n) => {
        if (n === readsBefore + 2) h.setDocument({ formatVersion: 99 } as unknown as ProjectStateDocument);
      });
      const out = await h.call(confirming(d1));
      expect(out).toMatchObject({ ok: false, code: 'PROJECT_INVALID' });
      expect(out.ok === false && out.details?.planDigest).toBeUndefined();
      expectNothingWritten(h);
    });
  });

  it('a dry run issues no digest and writes nothing', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const out = await h.call({ jsonMode: true, dryRun: true, yes: false });
    expect(out).toMatchObject({ ok: true, outcome: 'dry-run', aiBundle: { removed: false } });
    expect(JSON.stringify(out)).not.toContain('planDigest');
    expectNothingWritten(h);
  });
});

describe('interactive: a plan that differs after "yes" is shown again for a renewed decision', () => {
  const doc = () => stateWith(['tpl', entry(['app', 'other'])]);
  type Shown = Parameters<ConfirmDeletionFn>[0];
  const INTERACTIVE: DeleteCommandFlags = { jsonMode: false, dryRun: false, yes: false };

  function scripted(h: Harness, steps: { decision: 'confirmed' | 'declined'; then?: () => void }[]): { confirm: ConfirmDeletionFn; shown: Shown[] } {
    const shown: Shown[] = [];
    const confirm: ConfirmDeletionFn = async (plan) => {
      const step = steps[shown.length];
      if (step === undefined) throw new Error('prompted more often than scripted');
      shown.push(plan);
      step.then?.();
      return step.decision;
    };
    void h;
    return { confirm, shown };
  }

  it('unchanged plan: one prompt, deletes', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const { confirm, shown } = scripted(h, [{ decision: 'confirmed' }]);
    expect(await h.call(INTERACTIVE, confirm)).toMatchObject({ ok: true, outcome: 'deleted' });
    expect(shown).toHaveLength(1);
    expect(shown[0].changedSinceShown).toBeUndefined();
    expect(shown[0].aiBundle).toEqual({ removed: false, path: null });
    expect(shown[0].templateName).toBe('tpl');
  });

  it('changed once: the updated plan is shown with changedSinceShown, a second "yes" deletes exactly that plan', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const { confirm, shown } = scripted(h, [
      { decision: 'confirmed', then: () => (h.files['/repo/app'] = ['a.ts', 'late.md']) },
      { decision: 'confirmed' },
    ]);
    // The change lands while the first prompt is open, i.e. after the review.
    const out = await h.call(INTERACTIVE, confirm);
    expect(out).toMatchObject({ ok: true, outcome: 'deleted', toDelete: ['app/a.ts', 'app/late.md'] });
    expect(shown.map((s) => s.toDelete)).toEqual([['app/a.ts'], ['app/a.ts', 'app/late.md']]);
    expect(shown.map((s) => s.changedSinceShown)).toEqual([undefined, true]);
    expect(shown.map((s) => s.templateName)).toEqual(['tpl', 'tpl']);
    expect(h.removed).toEqual(['/repo/app/a.ts', '/repo/app/late.md']);
  });

  it('changed twice: three prompts, each needing its own answer', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const { confirm, shown } = scripted(h, [
      { decision: 'confirmed', then: () => (h.files['/repo/app'] = ['a.ts', 'b.ts']) },
      { decision: 'confirmed', then: () => (h.files['/repo/app'] = ['a.ts', 'b.ts', 'c.ts']) },
      { decision: 'confirmed' },
    ]);
    expect(await h.call(INTERACTIVE, confirm)).toMatchObject({ ok: true, outcome: 'deleted' });
    expect(shown).toHaveLength(3);
    expect(h.removed).toHaveLength(3);
  });

  it('declining the updated plan deletes nothing and reports the plan that was declined', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const { confirm } = scripted(h, [
      { decision: 'confirmed', then: () => (h.files['/repo/app'] = ['a.ts', 'late.md']) },
      { decision: 'declined' },
    ]);
    const out = await h.call(INTERACTIVE, confirm);
    expect(out).toMatchObject({ ok: true, outcome: 'declined', toDelete: ['app/a.ts', 'app/late.md'] });
    expectNothingWritten(h);
  });

  it('a recomputation failure after "yes" is that failure, with nothing written', async () => {
    const h = harness(doc(), { '/repo/app': ['a.ts'] });
    const { confirm } = scripted(h, [{ decision: 'confirmed', then: () => h.setDocument(stateWith(['tpl', entry(['other'])])) }]);
    expect(await h.call(INTERACTIVE, confirm)).toMatchObject({ ok: false, code: 'TARGET_NOT_APPLIED' });
    expectNothingWritten(h);
  });
});
