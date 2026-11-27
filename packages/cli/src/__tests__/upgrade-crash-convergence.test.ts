// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
//
// ADR 0021 requires that a hard crash during the write phase leaves the
// recorded entry at the baseline and that re-running the identical upgrade
// converges on the intended state; this suite is that simulated-crash test,
// driven through the real `upgradeToOrigin` flow (validate -> commit) on an
// in-memory disk.
//
// A "crash" is a process that dies without running its catch handler: after a
// chosen number of renames every disk seam throws, so neither the engine's
// recovery nor anything else runs, and the disk is left exactly as the dying
// process left it (landed destinations, orphaned temp files, project state
// untouched). "Restart" revives the seams on the SAME disk and project-state
// store and runs the identical upgrade again. The oracle is a clean run of the
// same upgrade on a pristine copy: disk and state document must be equal.
//
// Supported cases: crash between renames, crash after the last rename but
// before the state write, a caught commit-point state-write failure, and
// retained-protection metadata (`exclusionsBackfilled`, `relinquishedGround`,
// `provenExcludedSubtrees`, `excludedSubtrees`, `previous`) carried across a
// crashed-then-converged upgrade.
import { describe, expect, it } from 'vitest';
import { upgradeToOrigin } from '../upgrade/flow';
import type { UpgradeEngineDeps } from '../upgrade/flow';
import type { DiskEntry, ResolvedPayload, ResolvePayloadResult } from '../upgrade/types';
import type { ProjectStateDocument, TemplateEntry } from '../project-state/types';
import { RESERVED_TEMP_SUFFIX } from '../paths/reserved-temp-name';

const REPO_ROOT = '/repo';

function payload(origin: string, version: string, files: Record<string, string>, excludedSubtrees: string[] = []): ResolvedPayload {
  return { name: 'my-template', version, origin, files: new Map(Object.entries(files)), excludedSubtrees };
}

interface Scenario {
  baseline: ResolvedPayload;
  candidate: ResolvedPayload;
  disk: Record<string, string>;
  entry: TemplateEntry;
}

function makeWorld(scenario: Scenario) {
  const disk = new Map<string, Buffer | string>(Object.entries(scenario.disk));
  const carriesProtection =
    scenario.entry.exclusionsBackfilled === true ||
    scenario.entry.relinquishedGround !== undefined ||
    scenario.entry.provenExcludedSubtrees !== undefined;
  let state: string = JSON.stringify({
    formatVersion: carriesProtection ? 2 : 1,
    templates: { 'my-template': scenario.entry },
    projectOwnedRoots: [],
  } satisfies ProjectStateDocument);
  let renames = 0;
  let crashAfterRenames: number | null = null;
  let dead = false;
  let failStateWrite = false;
  let crashOnUnlink = false;

  const die = (what: string): never => {
    throw new Error(`process is gone (${what})`);
  };
  const guard = (what: string): void => {
    if (dead) die(what);
  };

  const fixtures: Record<string, ResolvedPayload> = {
    [scenario.baseline.origin]: scenario.baseline,
    [scenario.candidate.origin]: scenario.candidate,
  };

  const deps: UpgradeEngineDeps = {
    repoRoot: REPO_ROOT,
    readProjectStateFn: async () => state,
    writeProjectStateFn: async (_p, content) => {
      guard('state write');
      if (failStateWrite) throw new Error('ENOSPC: no space left on device');
      state = content;
    },
    resolvePayload: async (origin): Promise<ResolvePayloadResult> => {
      const found = fixtures[origin];
      return found === undefined ? { ok: false, code: 'ORIGIN_UNAVAILABLE', message: origin } : { ok: true, payload: found };
    },
    resolveRegisteredExclusions: async () => [],
    readDiskEntry: async (p): Promise<DiskEntry> =>
      disk.has(p) ? { kind: 'file', content: disk.get(p)! } : { kind: 'absent' },
    writeDiskFile: async (p, content) => {
      guard('write');
      disk.set(p, content);
    },
    renameDiskFile: async (from, to) => {
      guard('rename');
      if (crashAfterRenames !== null && renames >= crashAfterRenames) {
        dead = true;
        die('rename');
      }
      if (!disk.has(from)) throw new Error(`rename source "${from}" does not exist`);
      disk.set(to, disk.get(from)!);
      disk.delete(from);
      renames += 1;
    },
    unlinkDiskFile: async (p) => {
      guard('unlink');
      if (crashOnUnlink) {
        dead = true;
        die('unlink');
      }
      disk.delete(p);
    },
    listDiskFiles: async (dir) => {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      return [...disk.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    },
    canonicalizeFn: (raw) => raw,
    presentPlan: async () => 'approved',
    promoteInventory: async () => {},
    refreshAiBundle: async () => {},
  };

  return {
    deps,
    disk,
    document: (): ProjectStateDocument => JSON.parse(state) as ProjectStateDocument,
    rawState: () => state,
    crashAfter: (n: number) => {
      renames = 0;
      crashAfterRenames = n;
    },
    crashAtFirstUnlink: () => {
      crashOnUnlink = true;
    },
    restart: () => {
      dead = false;
      crashOnUnlink = false;
      crashAfterRenames = null;
      failStateWrite = false;
    },
    failStateWrite: () => {
      failStateWrite = true;
    },
    litter: () => [...disk.keys()].filter((k) => k.includes(RESERVED_TEMP_SUFFIX)),
  };
}

const sortedDisk = (disk: Map<string, Buffer | string>) => [...disk.entries()].sort(([a], [b]) => a.localeCompare(b));

async function crashThenRerunMatchesClean(scenario: Scenario, crashAfter: number | 'unlink'): Promise<void> {
  const clean = makeWorld(scenario);
  const cleanResult = await upgradeToOrigin('my-template', scenario.candidate.origin, clean.deps);
  expect(cleanResult, JSON.stringify(cleanResult)).toMatchObject({ ok: true, outcome: 'success' });

  const crashed = makeWorld(scenario);
  if (crashAfter === 'unlink') crashed.crashAtFirstUnlink();
  else crashed.crashAfter(crashAfter);
  const crashResult = await upgradeToOrigin('my-template', scenario.candidate.origin, crashed.deps).catch((e: unknown) => e);
  // The dying process never returns a typed outcome, or returns the
  // recovery-failed one; either way nothing was committed.
  if (crashResult instanceof Error) expect(crashResult.message).toContain('process is gone');
  else expect(crashResult).toMatchObject({ ok: false, code: 'INTERNAL' });
  expect(crashed.document().templates['my-template']).toEqual(scenario.entry);
  // A genuinely half-written tree: at least one destination already landed.
  expect([...crashed.disk.values()].some((v) => [...scenario.candidate.files.values()].includes(v))).toBe(true);

  crashed.restart();
  const rerun = await upgradeToOrigin('my-template', scenario.candidate.origin, crashed.deps);
  expect(rerun).toMatchObject({ ok: true, outcome: 'success' });

  expect(sortedDisk(crashed.disk)).toEqual(sortedDisk(clean.disk));
  expect(crashed.litter()).toEqual([]);
  expect(crashed.document()).toEqual(clean.document());
}

const twoFiles: Scenario = {
  baseline: payload('origin-a', '1.0.0', { 'a.ts': 'a1', 'b.ts': 'b1', 'gone.ts': 'g1' }),
  candidate: payload('origin-b', '2.0.0', { 'a.ts': 'a2', 'b.ts': 'b2', 'new.ts': 'n2' }),
  disk: { '/repo/app/a.ts': 'a1', '/repo/app/b.ts': 'b1', '/repo/app/gone.ts': 'g1' },
  entry: { origin: 'origin-a', version: '1.0.0', targets: ['app'], excludedSubtrees: [] },
};

describe('upgrade convergence after a simulated hard crash (ADR 0021)', () => {
  it('crash between renames: project.json still names the baseline and the identical re-run converges to the clean-run result', async () => {
    await crashThenRerunMatchesClean(twoFiles, 1);
  });

  it('crash after every rename but before the REMOVE and the state write converges', async () => {
    // Every add/replace rename lands, then the process dies at the REMOVE, before the state write.
    await crashThenRerunMatchesClean(twoFiles, 'unlink');
  });

  it('a caught commit-point state-write failure leaves destinations landed, names the baseline, and the identical re-run converges', async () => {
    const clean = makeWorld(twoFiles);
    await upgradeToOrigin('my-template', 'origin-b', clean.deps);

    const world = makeWorld(twoFiles);
    world.failStateWrite();
    const failed = await upgradeToOrigin('my-template', 'origin-b', world.deps);
    expect(failed).toMatchObject({ ok: false, code: 'INTERNAL' });
    expect(world.document().templates['my-template']).toEqual(twoFiles.entry);
    expect(world.disk.get('/repo/app/a.ts')).toBe('a2');

    world.restart();
    expect(await upgradeToOrigin('my-template', 'origin-b', world.deps)).toMatchObject({ ok: true, outcome: 'success' });
    expect(sortedDisk(world.disk)).toEqual(sortedDisk(clean.disk));
    expect(world.document()).toEqual(clean.document());
  });

  describe('retained-protection metadata survives a crashed-then-converged upgrade', () => {
    const protectedScenario: Scenario = {
      baseline: payload('origin-a', '1.0.0', { 'a.ts': 'a1', 'plugins/p.ts': 'p1' }, ['plugins/']),
      candidate: payload('origin-b', '2.0.0', { 'a.ts': 'a2', 'b.ts': 'b2' }, ['plugins/']),
      disk: { '/repo/app/a.ts': 'a1', '/repo/app/plugins/p.ts': 'local edit' },
      entry: {
        origin: 'origin-a',
        version: '1.0.0',
        targets: ['app'],
        excludedSubtrees: ['plugins/'],
        exclusionsBackfilled: true,
        relinquishedGround: ['app/extra'],
        provenExcludedSubtrees: ['plugins/'],
      },
    };

    it('the entry written after crash + re-run carries the same protection fields as a clean run', async () => {
      await crashThenRerunMatchesClean(protectedScenario, 1);
      const world = makeWorld(protectedScenario);
      await upgradeToOrigin('my-template', 'origin-b', world.deps);
      expect(world.document().templates['my-template']).toMatchObject({
        exclusionsBackfilled: true,
        relinquishedGround: ['app/extra'],
        provenExcludedSubtrees: ['plugins/'],
        excludedSubtrees: ['plugins/'],
        previous: { origin: 'origin-a', version: '1.0.0' },
      });
    });

    it('a candidate that relinquishes written ground marks the entry identically after crash + re-run', async () => {
      const relinquishing: Scenario = {
        baseline: payload('origin-a', '1.0.0', { 'a.ts': 'a1', 'plugins/p.ts': 'p1', 'gone.ts': 'g1' }),
        candidate: payload('origin-b', '2.0.0', { 'a.ts': 'a2', 'b.ts': 'b2' }, ['plugins/']),
        disk: { '/repo/app/a.ts': 'a1', '/repo/app/plugins/p.ts': 'p1', '/repo/app/gone.ts': 'g1' },
        entry: { origin: 'origin-a', version: '1.0.0', targets: ['app'], excludedSubtrees: [] },
      };
      await crashThenRerunMatchesClean(relinquishing, 1);
      await crashThenRerunMatchesClean(relinquishing, 'unlink');
      const world = makeWorld(relinquishing);
      await upgradeToOrigin('my-template', 'origin-b', world.deps);
      expect(world.document().templates['my-template']).toMatchObject({
        exclusionsBackfilled: true,
        excludedSubtrees: ['plugins/'],
      });
      expect(world.disk.get('/repo/app/plugins/p.ts')).toBe('p1');
    });

    it('a crash never writes protection fields early: the baseline document is byte-identical until the commit point', async () => {
      const world = makeWorld(protectedScenario);
      const before = world.rawState();
      world.crashAfter(1);
      await upgradeToOrigin('my-template', 'origin-b', world.deps).catch(() => undefined);
      expect(world.rawState()).toBe(before);
    });
  });
});
