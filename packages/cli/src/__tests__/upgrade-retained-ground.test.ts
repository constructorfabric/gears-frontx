// @cpt-algo:cpt-frontx-algo-upgrade-changeset-validate:p1
//
// The retained-ground ruling of 2026-11-06 across the upgrade engine: ground a registered template
// recorded as `relinquishedGround` keeps its old files through an upgrade of
// ANY template, as `delete` already keeps them. A REMOVE or REPLACE that would
// land there is reported SKIPPED (`RETAINED_GROUND`); everything else about the
// plan is unchanged. In-memory, immutable origins (a pinned origin cannot be
// edited in place, so the baseline is exactly what was applied).
import { describe, expect, it } from 'vitest';
import { validateUpgrade } from '../upgrade/validate';
import type { ValidateInput } from '../upgrade/validate';
import type { DiskEntry, ReadDiskEntryFn, ResolvedPayload, ResolvePayloadResult } from '../upgrade/types';
import type { ProjectStateDocument, TemplateEntry } from '../project-state/types';

const payload = (origin: string, version: string, files: Record<string, string>, excludedSubtrees: string[] = []): ResolvedPayload => ({
  name: origin.startsWith('v') || origin === 'cand-b' ? '@x/b' : '@x/g',
  version,
  origin,
  files: new Map(Object.entries(files)),
  excludedSubtrees,
});

const resolver = (fixtures: Record<string, ResolvedPayload>) => async (origin: string): Promise<ResolvePayloadResult> => {
  const found = fixtures[origin];
  return found === undefined ? { ok: false, code: 'ORIGIN_UNAVAILABLE', message: origin } : { ok: true, payload: found };
};

const disk = (files: Record<string, string>): ReadDiskEntryFn => async (absolute) => {
  const content = files[absolute.replace(/^\/repo\//, '')];
  return content === undefined ? ({ kind: 'absent' } as DiskEntry) : ({ kind: 'file', content } as DiskEntry);
};

const host = (overrides: Partial<TemplateEntry> = {}): TemplateEntry => ({
  origin: 'host-v2',
  version: '2.0.0',
  targets: ['real'],
  excludedSubtrees: ['sub/'],
  exclusionsBackfilled: true,
  relinquishedGround: ['real/sub'],
  ...overrides,
});

function input(name: string, entry: TemplateEntry, others: Record<string, TemplateEntry>, extra: Partial<ValidateInput>): ValidateInput {
  return {
    name,
    entry,
    candidateOrigin: 'cand',
    document: { formatVersion: 1, templates: { [name]: entry, ...others }, projectOwnedRoots: [] } satisfies ProjectStateDocument,
    repoRoot: '/repo',
    resolvePayload: resolver({}),
    resolveRegisteredExclusions: async () => [],
    readDiskEntry: disk({}),
    canonicalizeFn: (raw) => raw,
    ...extra,
  };
}

const guestEntry = (): TemplateEntry => ({ origin: 'g1', version: '1.0.0', targets: ['real/sub'], excludedSubtrees: [] });

describe('upgrade keeps ground another template relinquished (V2)', () => {
  it('a guest upgrade skips the REMOVE and the REPLACE inside retained ground and keeps its other work', async () => {
    const result = await validateUpgrade(
      input('@x/g', guestEntry(), { '@x/b': host() }, {
        resolvePayload: resolver({
          g1: payload('g1', '1.0.0', { 'b2.txt': 'OLD', 'g.txt': 'G1' }),
          cand: payload('cand', '2.0.0', { 'g.txt': 'G2' }),
        }),
        readDiskEntry: disk({ 'real/sub/b2.txt': 'OLD', 'real/sub/g.txt': 'G1' }),
      }),
    );
    expect(result).toMatchObject({ ok: true, kind: 'plan' });
    if (!result.ok || result.kind !== 'plan') return;
    expect(result.plan.operations.filter((op) => op.op === 'REMOVE' || op.op === 'REPLACE')).toEqual([]);
    expect(result.plan.skipped).toEqual(
      expect.arrayContaining([
        { target: 'real/sub', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' },
        { target: 'real/sub', path: 'real/sub/g.txt', reason: 'RETAINED_GROUND' },
      ]),
    );
  });

  it('keeps ADD and a user edit exactly as before inside retained ground', async () => {
    const result = await validateUpgrade(
      input('@x/g', guestEntry(), { '@x/b': host() }, {
        resolvePayload: resolver({
          g1: payload('g1', '1.0.0', { 'e.txt': 'E1' }),
          cand: payload('cand', '2.0.0', { 'e.txt': 'E1', 'new.txt': 'N' }),
        }),
        readDiskEntry: disk({ 'real/sub/e.txt': 'EDITED' }),
      }),
    );
    expect(result).toMatchObject({ ok: true, kind: 'plan' });
    if (!result.ok || result.kind !== 'plan') return;
    expect(result.plan.operations.map((op) => `${op.op} ${op.path}`).sort()).toEqual(['ADD real/sub/new.txt', 'KEEP_LOCAL real/sub/e.txt']);
    expect(result.plan.skipped).toEqual([]);
  });

  it('still refuses a genuine conflict inside retained ground', async () => {
    const result = await validateUpgrade(
      input('@x/g', guestEntry(), { '@x/b': host() }, {
        resolvePayload: resolver({
          g1: payload('g1', '1.0.0', { 'g.txt': 'G1' }),
          cand: payload('cand', '2.0.0', { 'g.txt': 'G2' }),
        }),
        readDiskEntry: disk({ 'real/sub/g.txt': 'USER' }),
      }),
    );
    expect(result).toMatchObject({ ok: false, code: 'CONTENT_CONFLICT' });
  });

  it('protects the ground of a deleted-target host (no live target left)', async () => {
    const result = await validateUpgrade(
      input('@x/g', guestEntry(), { '@x/b': host({ targets: [] }) }, {
        resolvePayload: resolver({
          g1: payload('g1', '1.0.0', { 'b2.txt': 'OLD' }),
          cand: payload('cand', '2.0.0', {}),
        }),
        readDiskEntry: disk({ 'real/sub/b2.txt': 'OLD' }),
      }),
    );
    expect(result).toMatchObject({ ok: true, kind: 'plan' });
    if (!result.ok || result.kind !== 'plan') return;
    expect(result.plan.operations.filter((op) => op.op === 'REMOVE')).toEqual([]);
    expect(result.plan.skipped).toContainEqual({ target: 'real/sub', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' });
  });

  it("the host's own reclaim does not REMOVE or REPLACE an old file in its retained ground", async () => {
    // v2 declares sub/ and ships sub/b2.txt inside its own exclusion (never written by apply);
    // v3 reclaims the ground and either drops the file or ships other bytes for it.
    const dropped = await validateUpgrade(
      input('@x/b', host({ origin: 'v2' }), {}, {
        candidateOrigin: 'cand-b',
        resolvePayload: resolver({
          v2: payload('v2', '2.0.0', { 'sub/b2.txt': 'OLD' }, ['sub/']),
          'cand-b': payload('cand-b', '3.0.0', {}),
        }),
        readDiskEntry: disk({ 'real/sub/b2.txt': 'OLD' }),
      }),
    );
    expect(dropped).toMatchObject({ ok: true, kind: 'plan' });
    if (dropped.ok && dropped.kind === 'plan') {
      expect(dropped.plan.operations.filter((op) => op.op === 'REMOVE')).toEqual([]);
      expect(dropped.plan.skipped).toContainEqual({ target: 'real', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' });
      expect(dropped.plan.priorRelinquishedGround).toEqual(['real/sub']);
      expect(dropped.plan.priorHistoryUnproven).toBe(true);
    }
    const replaced = await validateUpgrade(
      input('@x/b', host({ origin: 'v2' }), {}, {
        candidateOrigin: 'cand-b',
        resolvePayload: resolver({
          v2: payload('v2', '2.0.0', { 'sub/b2.txt': 'OLD' }, ['sub/']),
          'cand-b': payload('cand-b', '3.0.0', { 'sub/b2.txt': 'NEW' }),
        }),
        readDiskEntry: disk({ 'real/sub/b2.txt': 'OLD' }),
      }),
    );
    expect(replaced).toMatchObject({ ok: true, kind: 'plan' });
    if (replaced.ok && replaced.kind === 'plan') {
      expect(replaced.plan.operations.filter((op) => op.op === 'REPLACE')).toEqual([]);
      expect(replaced.plan.skipped).toContainEqual({ target: 'real', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' });
    }
  });

  it('protects ground reached through an alias of the retained root', async () => {
    const result = await validateUpgrade(
      input('@x/g', { ...guestEntry(), targets: ['alias'] }, { '@x/b': host() }, {
        resolvePayload: resolver({
          g1: payload('g1', '1.0.0', { 'b2.txt': 'OLD' }),
          cand: payload('cand', '2.0.0', {}),
        }),
        readDiskEntry: disk({ 'alias/b2.txt': 'OLD' }),
        canonicalizeFn: (raw) => (raw === 'alias' || raw.startsWith('alias/') ? `real/sub${raw.slice('alias'.length)}` : raw),
      }),
    );
    expect(result).toMatchObject({ ok: true, kind: 'plan' });
    if (!result.ok || result.kind !== 'plan') return;
    expect(result.plan.operations.filter((op) => op.op === 'REMOVE')).toEqual([]);
    expect(result.plan.skipped).toContainEqual({ target: 'alias', path: 'alias/b2.txt', reason: 'RETAINED_GROUND' });
  });

  it('a legitimate upgrade with no retained ground still REMOVEs and REPLACEs (unprotected)', async () => {
    const result = await validateUpgrade(
      input('@x/g', guestEntry(), { '@x/b': { origin: 'host-v1', version: '1.0.0', targets: ['real'], excludedSubtrees: ['sub/'] } }, {
        resolvePayload: resolver({
          g1: payload('g1', '1.0.0', { 'b2.txt': 'OLD', 'g.txt': 'G1' }),
          cand: payload('cand', '2.0.0', { 'g.txt': 'G2' }),
        }),
        readDiskEntry: disk({ 'real/sub/b2.txt': 'OLD', 'real/sub/g.txt': 'G1' }),
      }),
    );
    expect(result).toMatchObject({ ok: true, kind: 'plan' });
    if (!result.ok || result.kind !== 'plan') return;
    expect(result.plan.operations.map((op) => `${op.op} ${op.path}`).sort()).toEqual(['REMOVE real/sub/b2.txt', 'REPLACE real/sub/g.txt']);
    expect(result.plan.skipped).toEqual([]);
  });

  it('retained ground elsewhere does not hold back files outside it', async () => {
    const result = await validateUpgrade(
      input('@x/g', { ...guestEntry(), targets: ['other'] }, { '@x/b': host() }, {
        resolvePayload: resolver({
          g1: payload('g1', '1.0.0', { 'g.txt': 'G1' }),
          cand: payload('cand', '2.0.0', { 'g.txt': 'G2' }),
        }),
        readDiskEntry: disk({ 'other/g.txt': 'G1' }),
      }),
    );
    expect(result).toMatchObject({ ok: true, kind: 'plan' });
    if (!result.ok || result.kind !== 'plan') return;
    expect(result.plan.operations.map((op) => `${op.op} ${op.path}`)).toEqual(['REPLACE other/g.txt']);
  });
});
