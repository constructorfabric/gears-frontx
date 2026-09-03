// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
//
// In-memory-harness suite for `commitUpgrade` (`../upgrade/commit.ts`),
// modeled on `delete.test.ts`'s plain-fake style and `entry-flows.test.ts`'s
// `makeHarness()` shape: one isolated in-memory "disk" (`Map<string,
// string>`) per test, seams that can be made to throw on demand, and a
// `callLog` for the ordering assertions the FEATURE's staged write is built
// around - no real filesystem or network access anywhere in this suite.
import { describe, expect, it, vi } from 'vitest';
import { commitUpgrade } from '../upgrade/commit';
import type { CommitDeps } from '../upgrade/commit';
import type { DiskEntry, UpgradeOperation, UpgradePlan } from '../upgrade/types';
import type { ProjectStateDocument, ReadProjectStateFn, WriteProjectStateFn } from '../project-state/types';
import { RESERVED_TEMP_SUFFIX } from '../paths/reserved-temp-name';

const REPO_ROOT = '/repo';

type CallLogEntry =
  | { kind: 'read'; path: string }
  | { kind: 'write'; path: string }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'unlink'; path: string }
  | { kind: 'list'; dir: string };

/**
 * One isolated fake "repository" per test. `disk` is keyed by absolute
 * path exactly as `commitUpgrade` constructs it (`path.join(repoRoot,
 * op.path)`), mirroring `entry-flows.test.ts`'s own `files` map convention.
 * `throwOn` lets a single test make exactly one seam call fail, by absolute
 * path, to exercise the staged write's failure-recovery branches without
 * needing a real filesystem.
 */
function makeHarness(initialDisk: Record<string, string> = {}) {
  const disk = new Map<string, string>(Object.entries(initialDisk));
  const callLog: CallLogEntry[] = [];
  let throwOn: { op: 'read' | 'write' | 'rename' | 'unlink' | 'list'; path: string } | null = null;

  function maybeThrow(op: CallLogEntry['kind'], path: string): void {
    if (throwOn && throwOn.op === op && throwOn.path === path) {
      throw new Error(`simulated ${op} failure for "${path}"`);
    }
  }

  const readDiskEntry: CommitDeps['readDiskEntry'] = async (absolutePath: string): Promise<DiskEntry> => {
    callLog.push({ kind: 'read', path: absolutePath });
    maybeThrow('read', absolutePath);
    return disk.has(absolutePath) ? { kind: 'file', content: disk.get(absolutePath)! } : { kind: 'absent' };
  };

  const writeDiskFile: CommitDeps['writeDiskFile'] = async (absolutePath: string, content: string) => {
    callLog.push({ kind: 'write', path: absolutePath });
    maybeThrow('write', absolutePath);
    disk.set(absolutePath, content);
  };

  const renameDiskFile: CommitDeps['renameDiskFile'] = async (from: string, to: string) => {
    callLog.push({ kind: 'rename', from, to });
    maybeThrow('rename', to);
    if (!disk.has(from)) throw new Error(`rename source "${from}" does not exist`);
    disk.set(to, disk.get(from)!);
    disk.delete(from);
  };

  const unlinkDiskFile: CommitDeps['unlinkDiskFile'] = async (absolutePath: string) => {
    callLog.push({ kind: 'unlink', path: absolutePath });
    maybeThrow('unlink', absolutePath);
    disk.delete(absolutePath);
  };

  // Enumerates every disk key nested under `absoluteDir`, POSIX-relative to
  // it - a flat-map stand-in for `ListDiskFilesFn`'s real recursive
  // directory walk (no real directories exist in this fake, so prefix
  // matching is the whole implementation).
  const listDiskFiles: CommitDeps['listDiskFiles'] = async (absoluteDir: string) => {
    callLog.push({ kind: 'list', dir: absoluteDir });
    const prefix = absoluteDir.endsWith('/') ? absoluteDir : `${absoluteDir}/`;
    const results: string[] = [];
    for (const key of disk.keys()) {
      if (key.startsWith(prefix)) results.push(key.slice(prefix.length));
    }
    return results;
  };

  let projectStateContent: string | null = null;
  // Tracked separately from `projectStateContent === null`: a test may seed
  // an initial document with `seedProjectState` (so `commitUpgrade` has a
  // baseline to read) and then need to assert that `commitUpgrade` itself
  // never WROTE to the store - which a mere non-null check on the seeded
  // content could never distinguish from an actual write.
  let projectStateWriteCount = 0;
  const readProjectStateFn: ReadProjectStateFn = async () => projectStateContent;
  const writeProjectStateFn: WriteProjectStateFn = async (_absolutePath, content) => {
    projectStateContent = content;
    projectStateWriteCount += 1;
  };

  const promoteInventory = vi.fn(async (_name: string) => {});
  const refreshAiBundle = vi.fn(async (_name: string) => {});

  const deps: CommitDeps = {
    repoRoot: REPO_ROOT,
    readDiskEntry,
    writeDiskFile,
    renameDiskFile,
    unlinkDiskFile,
    listDiskFiles,
    readProjectStateFn,
    writeProjectStateFn,
    promoteInventory,
    refreshAiBundle,
  };

  function seedProjectState(document: ProjectStateDocument): void {
    projectStateContent = JSON.stringify(document);
  }

  function readProjectStateDocument(): ProjectStateDocument {
    if (projectStateContent === null) throw new Error('project state was never written');
    return JSON.parse(projectStateContent) as ProjectStateDocument;
  }

  return {
    deps,
    disk,
    callLog,
    promoteInventory,
    refreshAiBundle,
    seedProjectState,
    readProjectStateDocument,
    wasProjectStateWritten: () => projectStateWriteCount > 0,
    failNextCall: (op: 'read' | 'write' | 'rename' | 'unlink' | 'list', path: string) => {
      throwOn = { op, path };
    },
  };
}

function op(overrides: Partial<UpgradeOperation> & Pick<UpgradeOperation, 'target' | 'path' | 'op'>): UpgradeOperation {
  return {
    expectedDisk: null,
    baselineContent: null,
    ...overrides,
  };
}

function makePlan(overrides: Partial<UpgradePlan> = {}): UpgradePlan {
  return {
    name: 'acme-tool',
    from: { origin: 'github:acme/tool@v1', version: '1.0.0' },
    to: { origin: 'github:acme/tool@v2', version: '2.0.0' },
    targets: ['app'],
    // No exclusions by default: the reclaim step's boundary filter admits
    // everything under the target unless a test narrows it deliberately.
    exclusionRootsByTarget: { app: [] },
    operations: [],
    skipped: [],
    ...overrides,
  };
}

describe('commitUpgrade (cpt-frontx-algo-upgrade-changeset-commit)', () => {
  it('lands ADD + REPLACE + REMOVE, commits state with previous set to from, and promotes/refreshes', async () => {
    const harness = makeHarness({
      '/repo/app/keep-replace.ts': 'old content',
      '/repo/app/remove-me.ts': 'to be removed',
    });
    harness.seedProjectState({
      formatVersion: 1,
      templates: { 'acme-tool': { origin: 'github:acme/tool@v1', version: '1.0.0', targets: ['app'] } },
      projectOwnedRoots: [],
    });

    const plan = makePlan({
      operations: [
        op({ target: 'app', path: 'app/new-file.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'new content' }),
        op({
          target: 'app',
          path: 'app/keep-replace.ts',
          op: 'REPLACE',
          expectedDisk: 'old content',
          baselineContent: 'old content',
          newContent: 'replaced content',
        }),
        op({ target: 'app', path: 'app/remove-me.ts', op: 'REMOVE', expectedDisk: 'to be removed', baselineContent: 'to be removed' }),
      ],
    });

    const result = await commitUpgrade(plan, harness.deps);

    expect(result).toEqual({ ok: true, plan });
    expect(harness.disk.get('/repo/app/new-file.ts')).toBe('new content');
    expect(harness.disk.get('/repo/app/keep-replace.ts')).toBe('replaced content');
    expect(harness.disk.has('/repo/app/remove-me.ts')).toBe(false);

    const document = harness.readProjectStateDocument();
    expect(document.templates['acme-tool']).toEqual({
      origin: 'github:acme/tool@v2',
      version: '2.0.0',
      targets: ['app'],
      previous: { origin: 'github:acme/tool@v1', version: '1.0.0' },
    });

    expect(harness.promoteInventory).toHaveBeenCalledWith('acme-tool');
    expect(harness.refreshAiBundle).toHaveBeenCalledWith('acme-tool');
  });

  it('touches no destination before the verify step: a drift refusal leaves every destination byte-identical', async () => {
    const harness = makeHarness({
      '/repo/app/file.ts': 'DRIFTED content, not what classification saw',
    });

    const plan = makePlan({
      operations: [
        op({
          target: 'app',
          path: 'app/file.ts',
          op: 'REPLACE',
          expectedDisk: 'original baseline content',
          baselineContent: 'original baseline content',
          newContent: 'candidate content',
        }),
      ],
    });

    const before = new Map(harness.disk);
    const result = await commitUpgrade(plan, harness.deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONTENT_CONFLICT');

    // Every path that existed before the attempt still holds exactly the
    // same content - `commitUpgrade` may have created a temp file (scratch
    // space beside the destination, not a destination itself), but it must
    // never have touched `app/file.ts` itself.
    for (const [key, value] of before) {
      expect(harness.disk.get(key)).toBe(value);
    }
    expect(harness.disk.get('/repo/app/file.ts')).toBe('DRIFTED content, not what classification saw');
  });

  it('refuses CONTENT_CONFLICT naming every drifted destination, without writing project state', async () => {
    const harness = makeHarness({
      '/repo/app/a.ts': 'drifted-a',
      '/repo/app/b.ts': 'baseline-b',
    });

    const plan = makePlan({
      operations: [
        op({ target: 'app', path: 'app/a.ts', op: 'REPLACE', expectedDisk: 'baseline-a', baselineContent: 'baseline-a', newContent: 'candidate-a' }),
        op({ target: 'app', path: 'app/b.ts', op: 'REPLACE', expectedDisk: 'baseline-b', baselineContent: 'baseline-b', newContent: 'candidate-b' }),
      ],
    });

    const result = await commitUpgrade(plan, harness.deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('CONTENT_CONFLICT');
    if (result.code !== 'CONTENT_CONFLICT') throw new Error('unreachable');
    expect(result.details.drifted).toEqual([{ target: 'app', path: 'app/a.ts' }]);
    expect(harness.wasProjectStateWritten()).toBe(false);
    expect(harness.promoteInventory).not.toHaveBeenCalled();
    expect(harness.refreshAiBundle).not.toHaveBeenCalled();
  });

  it('never writes, renames, or unlinks a KEEP_LOCAL or UNCHANGED path', async () => {
    const harness = makeHarness({
      '/repo/app/keep-local.ts': "developer's own edit",
      '/repo/app/unchanged.ts': 'same everywhere',
      '/repo/app/added.ts.placeholder': 'irrelevant',
    });

    const plan = makePlan({
      operations: [
        op({ target: 'app', path: 'app/keep-local.ts', op: 'KEEP_LOCAL', expectedDisk: "developer's own edit", baselineContent: 'original' }),
        op({ target: 'app', path: 'app/unchanged.ts', op: 'UNCHANGED', expectedDisk: 'same everywhere', baselineContent: 'same everywhere' }),
        op({ target: 'app', path: 'app/new.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'new content' }),
      ],
    });

    const result = await commitUpgrade(plan, harness.deps);
    expect(result.ok).toBe(true);

    const touchedPaths = new Set(
      harness.callLog
        .filter((entry): entry is Extract<CallLogEntry, { kind: 'read' | 'write' | 'unlink' }> | Extract<CallLogEntry, { kind: 'rename' }> =>
          entry.kind === 'read' || entry.kind === 'write' || entry.kind === 'unlink' || entry.kind === 'rename',
        )
        .flatMap((entry) => ('path' in entry ? [entry.path] : [entry.from, entry.to])),
    );

    expect(touchedPaths.has('/repo/app/keep-local.ts')).toBe(false);
    expect(touchedPaths.has('/repo/app/unchanged.ts')).toBe(false);
    expect(harness.disk.get('/repo/app/keep-local.ts')).toBe("developer's own edit");
    expect(harness.disk.get('/repo/app/unchanged.ts')).toBe('same everywhere');
  });

  it('creates every temp file beside its destination with the reserved suffix before the first rename', async () => {
    const harness = makeHarness();

    const plan = makePlan({
      operations: [
        op({ target: 'app', path: 'app/one.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'one' }),
        op({ target: 'app', path: 'app/two.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'two' }),
      ],
    });

    const result = await commitUpgrade(plan, harness.deps);
    expect(result.ok).toBe(true);

    const writes = harness.callLog.filter((entry): entry is Extract<CallLogEntry, { kind: 'write' }> => entry.kind === 'write');
    const renames = harness.callLog.filter((entry): entry is Extract<CallLogEntry, { kind: 'rename' }> => entry.kind === 'rename');

    expect(writes).toEqual([
      { kind: 'write', path: `/repo/app/one.ts${RESERVED_TEMP_SUFFIX}` },
      { kind: 'write', path: `/repo/app/two.ts${RESERVED_TEMP_SUFFIX}` },
    ]);
    expect(renames).toEqual([
      { kind: 'rename', from: `/repo/app/one.ts${RESERVED_TEMP_SUFFIX}`, to: '/repo/app/one.ts' },
      { kind: 'rename', from: `/repo/app/two.ts${RESERVED_TEMP_SUFFIX}`, to: '/repo/app/two.ts' },
    ]);

    // Order assertion: no rename's call-log index precedes the LAST write's
    // index - i.e. every temp file exists before the first rename happens.
    const lastWriteIndex = harness.callLog.reduce(
      (last, entry, index) => (entry.kind === 'write' ? index : last),
      -1,
    );
    const firstRenameIndex = harness.callLog.findIndex((entry) => entry.kind === 'rename');
    expect(firstRenameIndex).toBeGreaterThan(lastWriteIndex);
  });

  it('reclaims a stale temp file before staging new ones', async () => {
    const stalePath = `/repo/app/leftover.ts${RESERVED_TEMP_SUFFIX}`;
    const harness = makeHarness({ [stalePath]: 'stale litter from a crashed attempt' });

    const plan = makePlan({
      operations: [op({ target: 'app', path: 'app/new.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'fresh' })],
    });

    const result = await commitUpgrade(plan, harness.deps);
    expect(result.ok).toBe(true);
    expect(harness.disk.has(stalePath)).toBe(false);

    const unlinkOfStale = harness.callLog.findIndex((entry) => entry.kind === 'unlink' && entry.path === stalePath);
    const firstWrite = harness.callLog.findIndex((entry) => entry.kind === 'write');
    expect(unlinkOfStale).toBeGreaterThanOrEqual(0);
    expect(unlinkOfStale).toBeLessThan(firstWrite);
  });

  it('recovers a landed destination to baseline when an I/O failure hits mid-rename, and reports INTERNAL', async () => {
    const harness = makeHarness({ '/repo/app/replace-me.ts': 'baseline content' });
    harness.seedProjectState({
      formatVersion: 1,
      templates: { 'acme-tool': { origin: 'github:acme/tool@v1', version: '1.0.0', targets: ['app'] } },
      projectOwnedRoots: [],
    });

    const plan = makePlan({
      operations: [
        // Lands first (REPLACE) - then the ADD's rename is made to fail.
        op({
          target: 'app',
          path: 'app/replace-me.ts',
          op: 'REPLACE',
          expectedDisk: 'baseline content',
          baselineContent: 'baseline content',
          newContent: 'replaced content',
        }),
        op({ target: 'app', path: 'app/added.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'added content' }),
      ],
    });

    harness.failNextCall('rename', '/repo/app/added.ts');

    const result = await commitUpgrade(plan, harness.deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('INTERNAL');

    // The landed REPLACE was reversed by writing baseline content back...
    expect(harness.disk.get('/repo/app/replace-me.ts')).toBe('baseline content');
    // ...and the ADD never landed in the first place (its rename threw).
    expect(harness.disk.has('/repo/app/added.ts')).toBe(false);
    expect(harness.disk.has(`/repo/app/added.ts${RESERVED_TEMP_SUFFIX}`)).toBe(true);

    expect(harness.wasProjectStateWritten()).toBe(false);
    expect(harness.promoteInventory).not.toHaveBeenCalled();
    expect(harness.refreshAiBundle).not.toHaveBeenCalled();
  });

  it('recovers vacuously when the I/O failure is caught before the first rename (during materialization)', async () => {
    const harness = makeHarness();

    const plan = makePlan({
      operations: [op({ target: 'app', path: 'app/new.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'content' })],
    });

    harness.failNextCall('write', `/repo/app/new.ts${RESERVED_TEMP_SUFFIX}`);

    const result = await commitUpgrade(plan, harness.deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('INTERNAL');
    expect(harness.disk.size).toBe(0);
    expect(harness.wasProjectStateWritten()).toBe(false);

    const renames = harness.callLog.filter((entry) => entry.kind === 'rename');
    expect(renames).toEqual([]);
  });

  it('reports INTERNAL naming both the original failure and every path recovery could not return', async () => {
    const harness = makeHarness({ '/repo/app/replace-me.ts': 'baseline content' });

    const plan = makePlan({
      operations: [
        op({
          target: 'app',
          path: 'app/replace-me.ts',
          op: 'REPLACE',
          expectedDisk: 'baseline content',
          baselineContent: 'baseline content',
          newContent: 'replaced content',
        }),
        op({ target: 'app', path: 'app/added.ts', op: 'ADD', expectedDisk: null, baselineContent: null, newContent: 'added content' }),
      ],
    });

    // The ADD's rename fails (triggering recovery), and recovery's own
    // attempt to write the landed REPLACE back to its baseline content ALSO
    // fails.
    harness.failNextCall('rename', '/repo/app/added.ts');
    const originalWrite = harness.deps.writeDiskFile;
    harness.deps.writeDiskFile = async (absolutePath: string, content: string) => {
      if (absolutePath === '/repo/app/replace-me.ts') {
        throw new Error('simulated recovery failure');
      }
      return originalWrite(absolutePath, content);
    };

    const result = await commitUpgrade(plan, harness.deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('INTERNAL');
    expect(result.details).toMatchObject({
      unrecovered: [{ target: 'app', path: 'app/replace-me.ts' }],
    });
    expect(harness.wasProjectStateWritten()).toBe(false);
  });

  it('leaves the transition standing when promotion fails after the commit point', async () => {
    const harness = makeHarness();
    harness.seedProjectState({
      formatVersion: 1,
      templates: { 'acme-tool': { origin: 'github:acme/tool@v1', version: '1.0.0', targets: ['app'] } },
      projectOwnedRoots: [],
    });
    harness.promoteInventory.mockRejectedValueOnce(new Error('inventory slot busy'));

    const plan = makePlan({ operations: [] });

    const result = await commitUpgrade(plan, harness.deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('INTERNAL');
    expect(result.details).toMatchObject({ slot: 'acme-tool' });

    const document = harness.readProjectStateDocument();
    expect(document.templates['acme-tool']).toEqual({
      origin: 'github:acme/tool@v2',
      version: '2.0.0',
      targets: ['app'],
      previous: { origin: 'github:acme/tool@v1', version: '1.0.0' },
    });
    expect(harness.refreshAiBundle).not.toHaveBeenCalled();
  });

  it('leaves the transition and promotion standing when the bundle refresh fails', async () => {
    const harness = makeHarness();
    harness.seedProjectState({
      formatVersion: 1,
      templates: { 'acme-tool': { origin: 'github:acme/tool@v1', version: '1.0.0', targets: ['app'] } },
      projectOwnedRoots: [],
    });
    harness.refreshAiBundle.mockRejectedValueOnce(new Error('bundle copy failed'));

    const plan = makePlan({ operations: [] });

    const result = await commitUpgrade(plan, harness.deps);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('INTERNAL');
    expect(result.details).toMatchObject({ bundle: 'acme-tool' });

    expect(harness.promoteInventory).toHaveBeenCalledWith('acme-tool');
    const document = harness.readProjectStateDocument();
    expect(document.templates['acme-tool'].origin).toBe('github:acme/tool@v2');
  });

  it('unlinks a REMOVE path without removing the directory it leaves empty', async () => {
    const harness = makeHarness({
      '/repo/app/dir/only-file.ts': 'to remove',
      '/repo/app/dir/sibling-dir-marker.ts': 'unrelated content elsewhere',
    });

    const plan = makePlan({
      operations: [
        op({ target: 'app', path: 'app/dir/only-file.ts', op: 'REMOVE', expectedDisk: 'to remove', baselineContent: 'to remove' }),
      ],
    });

    const result = await commitUpgrade(plan, harness.deps);
    expect(result.ok).toBe(true);

    expect(harness.disk.has('/repo/app/dir/only-file.ts')).toBe(false);
    // Nothing beyond the one REMOVE's own unlink call touched the
    // directory's other resident - there is no seam this module could even
    // call to remove a directory (`unlinkDiskFile` takes one file path),
    // so the empty directory it leaves behind is never addressed at all.
    expect(harness.disk.has('/repo/app/dir/sibling-dir-marker.ts')).toBe(true);
    const unlinks = harness.callLog.filter((entry) => entry.kind === 'unlink');
    expect(unlinks).toEqual([{ kind: 'unlink', path: '/repo/app/dir/only-file.ts' }]);
  });
  // Regression: reclaim used to walk each target's WHOLE directory tree with
  // no boundary filter, unlinking every reserved-suffix match it found. The
  // step's own text scopes it to "inside any target's effective ownership",
  // and the difference is not academic: a developer's own file that merely
  // ends in the reserved suffix, sitting in EXCLUDED ground (a
  // projectOwnedRoots entry, an excludedSubtrees subtree, another template's
  // origin folder, or — for a root target — `.git`/`node_modules`, which the
  // enumeration adapter deliberately does not skip), was deleted before the
  // developer's approval had even been executed against.
  it('reclaims a stale temp file inside the boundary but never one in excluded ground', async () => {
    const h = makeHarness();
    const insideBoundary = '/repo/app/src/leftover.ts' + RESERVED_TEMP_SUFFIX;
    const inExcludedGround = '/repo/app/vendor/mine.ts' + RESERVED_TEMP_SUFFIX;
    h.disk.set(insideBoundary, 'stale engine temp');
    h.disk.set(inExcludedGround, "developer's own file");

    const plan = makePlan({
      operations: [op({ target: 'app', path: 'app/src/a.ts', op: 'ADD', newContent: 'x' })],
      exclusionRootsByTarget: { app: ['app/vendor'] },
    });

    const outcome = await commitUpgrade(plan, h.deps);

    expect(outcome.ok).toBe(true);
    expect(h.disk.has(insideBoundary)).toBe(false);
    expect(h.disk.get(inExcludedGround)).toBe("developer's own file");
  });
});
