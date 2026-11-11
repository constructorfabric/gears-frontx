// @cpt-algo:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-recover:p1
import { createHash } from 'node:crypto';
import path from 'node:path';
import { canonicalJson } from '../canonical-json';
import type { TransitionIntent } from '../operations/coordination';
import type { FetchFn } from '../resolver/types';
import type { ReadDiskEntryFn, ResolvedPayload, ResolvePayloadFn, UpgradePlan } from '../upgrade/types';
import { getOwn } from '../own-record';
import { mutateProjectState, readProjectState } from '../project-state/io';
import type { PendingPostCommit, ReadProjectStateFn, TemplateEntry, WriteProjectStateFn } from '../project-state/types';

/**
 * Helpers that bind an upgrade/restore transition to what was reviewed
 * (plan-ai-recovery r9 §2, §5–§7): candidate identity, the project payload
 * footprint's pre-commit content, and one acquisition of the candidate per
 * command, reused by inventory promotion so it adopts the reviewed bytes.
 */

const sha = (bytes: Buffer | string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-begin-transition
/** Identity of the full candidate: version, origin, every payload and AI byte. */
export function candidateHash(payload: ResolvedPayload): string {
  const entries = (map: ReadonlyMap<string, Buffer | string | Uint8Array> | undefined) =>
    [...(map ?? new Map())].map(([file, bytes]) => [file, sha(bytes)]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha(canonicalJson({ origin: payload.origin, version: payload.version, files: entries(payload.files), ai: entries(payload.aiFiles) }));
}

/**
 * Every project path the commit may touch, with the content it had when
 * classified and the content the approved plan lands there (`ADD`/`REPLACE`
 * write `newContent`, `REMOVE` leaves an absence, the rest are never written).
 */
export function footprintOf(plan: UpgradePlan): TransitionIntent['footprint'] {
  return plan.operations.map((op) => {
    const before = op.expectedDisk === null ? null : sha(op.expectedDisk);
    const after = op.op === 'ADD' || op.op === 'REPLACE' ? sha(op.newContent!) : op.op === 'REMOVE' ? null : before;
    return { path: op.path, before, after };
  });
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-begin-transition

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-no-effect
// @cpt-begin:cpt-frontx-algo-upgrade-changeset-recover:p1:inst-rcv-release-uncommitted
/**
 * Footprint paths whose current content differs from their pre-commit content
 * (`changed`), and among them those holding something OTHER than what the
 * approved plan lands there (`foreign`): an outside edit, or a receipt written
 * before `after` was recorded. `changed` without `foreign` is provably the
 * approved plan's own partial result.
 */
export async function changedFootprint(
  repoRoot: string,
  footprint: TransitionIntent['footprint'],
  readDiskEntry: ReadDiskEntryFn,
): Promise<{ changed: string[]; foreign: string[] }> {
  const changed: string[] = [];
  const foreign: string[] = [];
  for (const { path: relative, before, after } of footprint) {
    const entry = await readDiskEntry(path.join(repoRoot, relative));
    const now = entry.kind === 'absent' ? null : entry.kind === 'file' ? sha(entry.content) : `kind:${entry.kind}`;
    if (now === before) continue;
    changed.push(relative);
    if (after === undefined || now !== after) foreign.push(relative);
  }
  return { changed, foreign };
}
// @cpt-end:cpt-frontx-algo-upgrade-changeset-recover:p1:inst-rcv-release-uncommitted
// @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-if-no-effect

/**
 * One acquisition per candidate per command. `resolve` remembers the fetch
 * results each resolution made; `adoptFetch(origin)` replays exactly those to
 * the inventory promotion, so it materializes the reviewed bytes rather than
 * fetching again (and refuses if the resolution was not a single fetch).
 */
export function createCandidateAcquisition(fetchFn: FetchFn, makeResolve: (fetchFn: FetchFn) => ResolvePayloadFn) {
  let recording: Awaited<ReturnType<FetchFn>>[] | undefined;
  const recordingFetch: FetchFn = async (url) => {
    const result = await fetchFn(url);
    recording?.push(result);
    return result;
  };
  const base = makeResolve(recordingFetch);
  const payloads = new Map<string, ResolvedPayload>();
  const fetches = new Map<string, Awaited<ReturnType<FetchFn>>[]>();
  const resolve: ResolvePayloadFn = async (origin) => {
    recording = [];
    try {
      const result = await base(origin);
      if (result.ok) {
        for (const key of [origin, result.payload.origin]) {
          payloads.set(key, result.payload);
          fetches.set(key, recording);
        }
      }
      return result;
    } finally {
      recording = undefined;
    }
  };
  const adoptFetch = (origin: string): FetchFn => {
    const recorded = fetches.get(origin);
    if (recorded === undefined || recorded.length !== 1) {
      throw new Error(`The reviewed candidate "${origin}" was not acquired by exactly one fetch; refusing to fetch it again for promotion.`);
    }
    const [only] = recorded;
    return async () => only;
  };
  return { resolve, payload: (origin: string) => payloads.get(origin), adoptFetch };
}

/** The entry as it stands once its post-commit record is gone (the verified terminal entry). */
export function withoutPending(entry: TemplateEntry): TemplateEntry {
  const { pendingPostCommit: _pending, ...rest } = entry;
  return rest;
}

/**
 * Project-state side of the post-commit record (r9 §2.3, §6.4–§6.6): reads,
 * advances (`done` with its verified effect hash) and finally clears the
 * entry's `pendingPostCommit` of exactly one transition, each as one atomic
 * document write authorized for that transition only.
 */
export function createPendingPostCommitStore(
  repoRoot: string,
  name: string,
  readProjectStateFn: ReadProjectStateFn,
  writeProjectStateFn: WriteProjectStateFn,
) {
  const read = async (): Promise<TemplateEntry | undefined> => {
    const state = await readProjectState(repoRoot, readProjectStateFn);
    if (!state.ok) throw new Error(`The project state store could not be read: ${state.message}`);
    return getOwn(state.document.templates, name);
  };
  const update = async (intentId: string, next: (pending: PendingPostCommit) => PendingPostCommit | undefined): Promise<void> => {
    const entry = await read();
    if (entry?.pendingPostCommit === undefined || entry.pendingPostCommit.intentId !== intentId) {
      throw new Error(`"${name}" carries no pending post-commit record of transition ${intentId}.`);
    }
    const advanced = next(entry.pendingPostCommit);
    const written = await mutateProjectState(
      repoRoot,
      { kind: 'set-template', name, entry: advanced === undefined ? withoutPending(entry) : { ...entry, pendingPostCommit: advanced } },
      readProjectStateFn,
      writeProjectStateFn,
      { transitionIntentId: intentId },
    );
    if (!written.ok) throw new Error(`"${name}"'s post-commit record could not be updated: ${written.message}`);
  };
  return {
    read,
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-recover:p1:inst-rcv-run-tasks
    markDone: (intentId: string, task: 'inventory' | 'ai', effectHash: string) =>
      update(intentId, (pending) => {
        if (pending[task] !== 'pending') throw new Error(`"${name}"'s ${task} task is ${pending[task]}, not pending.`);
        return { ...pending, [task]: 'done', effects: { ...pending.effects, [task]: effectHash } };
      }),
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-recover:p1:inst-rcv-run-tasks
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-release-committed
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-recover:p1:inst-rcv-return-recovered
    clear: (intentId: string) =>
      update(intentId, (pending) => {
        if (pending.inventory === 'pending' || pending.ai === 'pending') {
          throw new Error(`"${name}"'s post-commit record still has pending work; it is not cleared.`);
        }
        return undefined;
      }),
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-recover:p1:inst-rcv-return-recovered
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-mutation-boundary:p1:inst-mb-release-committed
  };
}
