// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
//
// The AI bundle review a `delete` executes against is the one accepted at the
// plan-digest check — captured ONCE, never re-captured after the targets are
// gone. The real `RemoveAiBundleFn` (`cli.ts`) re-arms its drift reference on
// every `describe` call, so a second review after the deletion would (a) make
// the drift check compare the bundle against its own current state and always
// pass, deleting an edit made in that window unreviewed, and (b) report that
// late digest in the envelope instead of the one that was checked.
import { describe, expect, it, vi } from 'vitest';
import { deleteTarget } from '../commands/delete';
import type { ConfirmDeletionFn, DeleteCommandFlags, DeleteOutcome, RemoveAiBundleFn } from '../commands/delete';
import type { DeletePlanInventoryPort, ListTargetFilesFn, ListUnenumerableTargetEntriesFn } from '../scaffold/delete-plan';
import { InventoryState } from '../inventory/types';
import type { CanonicalizeTargetFn } from '../scaffold/conflict-check';
import type { ProjectStateDocument, ReadProjectStateFn, WriteProjectStateFn } from '../project-state/types';
import type { ReadFileFn } from '../manifest/types';

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

interface Harness {
  // The live bundle content; `describe` snapshots it, the removal checks it.
  bundle: { guide: string };
  describeCalls: string[]; // digest returned by each describe call, in order
  removeAiBundle: RemoveAiBundleFn & ReturnType<typeof vi.fn>;
  call: (flags: DeleteCommandFlags, confirm?: ConfirmDeletionFn) => Promise<DeleteOutcome>;
}

// Mirrors `cli.ts`'s real wiring: `describe` records the reference digest, the
// removal refuses when the bundle no longer matches the LAST recorded one.
function harness(onRemoveFile: (h: Harness) => void = () => undefined): Harness {
  let stored = JSON.stringify({
    formatVersion: 1,
    templates: { tpl: { origin: 'github:acme/tpl@v1.0.0', version: '1.0.0', targets: ['app'] } },
    projectOwnedRoots: [],
  } satisfies ProjectStateDocument);
  let reviewed: string | undefined;
  const h = {} as Harness;
  h.bundle = { guide: 'original guide' };
  h.describeCalls = [];
  const removeAiBundle = Object.assign(
    vi.fn(async () => {
      if (reviewed === undefined || reviewed !== h.bundle.guide) throw new Error('The AI bundle changed since it was reviewed; it was left in place.');
    }),
    {
      describe: () => {
        reviewed = h.bundle.guide;
        h.describeCalls.push(reviewed);
        return { files: [{ path: 'guide.md', length: reviewed.length, sha256: reviewed }], directories: [], digest: reviewed };
      },
    },
  );
  h.removeAiBundle = removeAiBundle as Harness['removeAiBundle'];
  h.call = (flags, confirm) => {
    const read: ReadProjectStateFn = async () => stored;
    const write: WriteProjectStateFn = async (_p, content) => {
      stored = content;
    };
    const list: ListTargetFilesFn = async () => ['a.ts'];
    const unenumerable: ListUnenumerableTargetEntriesFn = async () => [];
    return deleteTarget(
      'app',
      '/repo',
      flags,
      inventory,
      identity,
      list,
      unenumerable,
      neverRead,
      async () => {
        onRemoveFile(h); // the window between the accepted review and the bundle removal
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
  };
  return h;
}

const REVIEW: DeleteCommandFlags = { jsonMode: true, dryRun: false, yes: false };
const confirming = (digest: string): DeleteCommandFlags => ({ jsonMode: true, dryRun: false, yes: true, expectedPlanDigest: digest });
function planDigestOf(outcome: DeleteOutcome): string {
  if (outcome.ok || outcome.code !== 'CONFIRMATION_REQUIRED') throw new Error(`not a review: ${JSON.stringify(outcome)}`);
  return (outcome.details as { planDigest: string }).planDigest;
}

describe('delete captures the AI bundle review once, at the accepted digest check', () => {
  it('--json --yes: an edit to the bundle after the accepted check is refused by the removal, not re-armed by a second review', async () => {
    const h = harness((hh) => {
      hh.bundle.guide = 'edited in the window'; // happens while the target files are being deleted
    });
    const digest = planDigestOf(await h.call(REVIEW));
    const done = await h.call(confirming(digest));

    expect(done).toMatchObject({ ok: true, outcome: 'deleted', wasLastTarget: true });
    // the removal ran against the reviewed reference and refused the drifted bundle
    expect(h.removeAiBundle).toHaveBeenCalledTimes(1);
    expect(done).toMatchObject({ aiBundleResidue: { manifestName: 'tpl', path: '.frontx/ai/tpl' } });
    // the envelope reports the tree that was CHECKED, never the late one
    expect(done).toMatchObject({ aiBundle: { removed: true, tree: { digest: 'original guide' } } });
    // no describe call after the accepted check (the confirming call: recompute = 1 describe)
    expect(h.describeCalls.filter((d) => d === 'edited in the window')).toEqual([]);
  });

  it('--json --yes: the confirming call describes the bundle exactly once, at the digest check', async () => {
    const h = harness();
    const digest = planDigestOf(await h.call(REVIEW));
    h.describeCalls.length = 0;
    const done = await h.call(confirming(digest));
    expect(done).toMatchObject({ ok: true, outcome: 'deleted', wasLastTarget: true });
    expect(h.describeCalls).toEqual(['original guide']);
    expect(done).not.toHaveProperty('aiBundleResidue');
  });

  it('interactive: the same single capture — the review the developer agreed to is the one executed against', async () => {
    const h = harness((hh) => {
      hh.bundle.guide = 'edited in the window';
    });
    const confirm: ConfirmDeletionFn = async () => 'confirmed';
    const done = await h.call({ jsonMode: false, dryRun: false, yes: false }, confirm);
    expect(done).toMatchObject({ ok: true, outcome: 'deleted', aiBundleResidue: { manifestName: 'tpl' }, aiBundle: { tree: { digest: 'original guide' } } });
    expect(h.describeCalls.filter((d) => d === 'edited in the window')).toEqual([]);
  });
});
