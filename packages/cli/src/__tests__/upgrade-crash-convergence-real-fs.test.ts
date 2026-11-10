// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
//
// Real-filesystem crash evidence for ADR 0021's convergence requirement, the
// complement of `upgrade-crash-convergence.test.ts` (in-memory map, seams that
// throw). Here the engine is the REAL one over a real temporary project with
// the real adapters and the real project-state store, and:
//
//   - the "crash" is a genuine SIGKILL of a child process (no catch, no finally,
//     no exit handler) — after the k-th rename, at the n-th unlink, and between
//     the state store's temp write and its rename;
//   - every filesystem mutation the re-run performs is logged, so "an
//     already-landed path is not touched again" is COUNTED, not inferred from
//     the end state;
//   - the project has TWO targets of one name, a partial REMOVE set, and a
//     real directory (non-empty and empty) carrying the exclusion evidence that
//     the in-memory fake (every directory "absent") cannot represent;
//   - the oracle is a clean run of the same upgrade on an identical pristine
//     project: disk tree (litter included) and the whole parsed state document.
//
// Not claimed: power-loss durability. Atomic rename is not an fsync, and nothing
// here kills the machine; that guarantee is deliberately outside this suite.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import fs, { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { upgradeToOrigin } from '../upgrade/flow';
import { RESERVED_TEMP_SUFFIX } from '../paths/reserved-temp-name';
import { buildWorld, readStateDocument, realDeps, snapshotTree } from './support/upgrade-world';
import type { WorldSpec } from './support/upgrade-world';

const here = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(here, '../..');
const childProcessCommand = process.execPath;
// Each test runs up to a few children plus a clean oracle; the per-test timeout must exceed the
// worst case of several watchdogs, otherwise vitest aborts the test (and cleanup runs) while a
// child is still alive and before the watchdog can report. The watchdog is therefore SHORTER
// than the test timeout, and every live child is killed in afterEach regardless.
const CHILD_TIMEOUT_MS = 10_000;
const TEST_TIMEOUT_MS = 60_000;
const CHILD = path.resolve(here, 'support/upgrade-crash-child.ts');

// The child is bundled once with esbuild and run with plain `node`: no loader, no launcher process,
// nothing between the test and the process that is SIGKILLed (a `tsx` child was observed to finish
// its work and then never exit, which is a harness fault and not an engine one).
let childBundleDir: string;
let childBundle: string;
beforeAll(async () => {
  childBundleDir = await mkdtemp(path.join(tmpdir(), 'frontx-crash-child-'));
  childBundle = path.join(childBundleDir, 'child.cjs');
  await build({ entryPoints: [CHILD], outfile: childBundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
});
afterAll(async () => {
  await rm(childBundleDir, { recursive: true, force: true });
});

const sandboxes: string[] = [];
const liveChildren = new Set<ReturnType<typeof spawn>>();
afterEach(async () => {
  for (const child of liveChildren) child.kill('SIGKILL');
  liveChildren.clear();
  vi.restoreAllMocks();
  while (sandboxes.length > 0) await rm(sandboxes.pop()!, { recursive: true, force: true });
});

async function freshRoot(spec: WorldSpec): Promise<string> {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-crash-real-'));
  sandboxes.push(sandbox);
  const root = path.join(sandbox, 'project');
  await buildWorld(root, spec);
  return root;
}

interface ChildConfig {
  killAfterRenames?: number;
  killAtUnlink?: number;
  killAtStateRename?: boolean;
}

/**
 * Runs the real engine in a child process; resolves with its mutation log and exit signal.
 * Asynchronous on purpose: a synchronous spawn would block the worker's event loop, so neither
 * this timer nor the test timeout could ever fire for a child that stops responding.
 */
function runChild(root: string, config: ChildConfig, logName: string): Promise<{ log: string[]; signal: string | null; status: number | null }> {
  const logPath = path.join(path.dirname(root), logName);
  const readLog = () => (existsSync(logPath) ? readFileSync(logPath, 'utf-8').split('\n').filter((l) => l !== '') : []);
  return new Promise((resolve, reject) => {
    const child = spawn(childProcessCommand, [childBundle, JSON.stringify({ root, name: 'my-template', to: 'path:o2', log: logPath, ...config })], {
      cwd: PACKAGE_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    liveChildren.add(child);
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    // A child that neither died nor finished is a harness fault, reported with everything it said, never a silent pass.
    const watchdog = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`crash child did not terminate within ${CHILD_TIMEOUT_MS}ms; output=${output}; log=${readLog().join(' | ')}`));
    }, CHILD_TIMEOUT_MS);
    child.on('exit', (status, signal) => {
      liveChildren.delete(child);
      clearTimeout(watchdog);
      resolve({ log: readLog(), signal, status });
    });
    child.on('error', (error) => {
      liveChildren.delete(child);
      clearTimeout(watchdog);
      reject(error);
    });
  });
}

const touched = (log: string[], kinds: string[]) =>
  log.filter((l) => kinds.includes(l.split(' ')[0])).map((l) => l.slice(l.indexOf(' ') + 1));

const isTemp = (p: string) => p.endsWith(RESERVED_TEMP_SUFFIX);

const baselineFiles = { 'a.ts': 'a1', 'b.ts': 'b1', 'gone1.ts': 'g1', 'gone2.ts': 'g2' };
const candidateFiles = { 'a.ts': 'a2', 'b.ts': 'b2', 'new.ts': 'n2' };

/** Two targets of one name: 3 renames + 2 unlinks each => 6 renames, 4 unlinks. */
const twoTargets: WorldSpec = {
  origins: {
    o1: { name: 'my-template', version: '1.0.0', files: baselineFiles },
    o2: { name: 'my-template', version: '2.0.0', files: candidateFiles },
  },
  disk: Object.fromEntries(
    ['app', 'lib'].flatMap((t) => Object.entries(baselineFiles).map(([f, c]) => [`${t}/${f}`, c] as const)),
  ),
  templates: {
    'my-template': { origin: 'path:o1', version: '1.0.0', targets: ['app', 'lib'], excludedSubtrees: [] },
  },
};
const TOTAL_RENAMES = 6;
const TOTAL_UNLINKS = 4;

const withoutOrigins = (tree: Record<string, string>) =>
  Object.fromEntries(Object.entries(tree).filter(([k]) => !k.startsWith('o1/') && !k.startsWith('o2/')));

async function cleanOracle(spec: WorldSpec) {
  const root = await freshRoot(spec);
  const outcome = await upgradeToOrigin('my-template', 'path:o2', realDeps(root));
  expect(outcome, JSON.stringify(outcome)).toMatchObject({ ok: true, outcome: 'success' });
  return { tree: withoutOrigins(await snapshotTree(root)), document: await readStateDocument(root) };
}

describe('real SIGKILL mid-upgrade, then the identical re-run (ADR 0021 convergence)', { timeout: TEST_TIMEOUT_MS }, () => {
  for (let k = 1; k < TOTAL_RENAMES; k += 1) {
    it(`two targets, killed after rename ${k}/${TOTAL_RENAMES}: state names the baseline, the re-run converges and never touches an already-landed path`, async () => {
      const oracle = await cleanOracle(twoTargets);
      const root = await freshRoot(twoTargets);
      const baselineState = await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8');

      const killed = await runChild(root, { killAfterRenames: k }, 'kill.log');
      expect(killed.signal).toBe('SIGKILL');
      expect(touched(killed.log, ['rename'])).toHaveLength(k);
      // Nothing ran after the kill: no state write, no recovery write or unlink.
      expect(touched(killed.log, ['state', 'unlink', 'done'])).toEqual([]);
      expect(touched(killed.log, ['write']).filter((p) => !isTemp(p))).toEqual([]);
      expect(await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8')).toBe(baselineState);

      const landed = Object.entries(await snapshotTree(root))
        .filter(([p, c]) => /^(app|lib)\//.test(p) && !p.includes(RESERVED_TEMP_SUFFIX) && c === candidateFiles[path.basename(p) as keyof typeof candidateFiles] && p.split('/')[1] in candidateFiles)
        .map(([p]) => path.join(root, p));
      expect(landed).toHaveLength(k);
      // The killed run left its own litter: one temp per not-yet-landed ADD/REPLACE.
      expect(Object.keys(await snapshotTree(root)).filter((p) => p.includes(RESERVED_TEMP_SUFFIX))).toHaveLength(TOTAL_RENAMES - k);

      const rerun = await runChild(root, {}, 'rerun.log');
      expect(rerun.status).toBe(0);
      expect(rerun.log.at(-1)).toBe('done {"ok":true}');
      // Counted, not inferred: nothing the killed run already landed is renamed, written or unlinked again.
      const mutated = touched(rerun.log, ['rename', 'write', 'unlink']);
      for (const p of landed) {
        expect(mutated, `re-run touched already-landed ${p}`).not.toContain(p);
        expect(mutated, `re-run re-staged already-landed ${p}`).not.toContain(`${p}${RESERVED_TEMP_SUFFIX}`);
      }
      expect(touched(rerun.log, ['rename'])).toHaveLength(TOTAL_RENAMES - k);
      expect(touched(rerun.log, ['state'])).toHaveLength(1);

      expect(withoutOrigins(await snapshotTree(root))).toEqual(oracle.tree);
      expect(await readStateDocument(root)).toEqual(oracle.document);
    });
  }

  for (let n = 1; n <= TOTAL_UNLINKS; n += 1) {
    it(`partial REMOVE, killed at unlink ${n}/${TOTAL_UNLINKS}: the removes that landed are not repeated, the remaining ones are, and the result equals the clean run`, async () => {
      const oracle = await cleanOracle(twoTargets);
      const root = await freshRoot(twoTargets);
      const baselineState = await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8');

      const killed = await runChild(root, { killAtUnlink: n }, 'kill.log');
      expect(killed.signal).toBe('SIGKILL');
      const removedBefore = touched(killed.log, ['unlink']);
      expect(removedBefore).toHaveLength(n - 1);
      // Every rename landed before the first unlink; the state write never ran.
      expect(touched(killed.log, ['rename'])).toHaveLength(TOTAL_RENAMES);
      expect(touched(killed.log, ['state'])).toEqual([]);
      expect(touched(killed.log, ['write']).filter((p) => !isTemp(p))).toEqual([]);
      expect(await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8')).toBe(baselineState);
      for (const p of removedBefore) expect(existsSync(p)).toBe(false);

      const rerun = await runChild(root, {}, 'rerun.log');
      expect(rerun.status).toBe(0);
      const mutated = touched(rerun.log, ['rename', 'write', 'unlink']);
      for (const p of removedBefore) expect(mutated, `re-run touched already-removed ${p}`).not.toContain(p);
      expect(touched(rerun.log, ['unlink'])).toHaveLength(TOTAL_UNLINKS - (n - 1));
      // Every destination the killed run had landed (all renames) is untouched by the re-run.
      expect(touched(rerun.log, ['rename'])).toEqual([]);

      expect(withoutOrigins(await snapshotTree(root))).toEqual(oracle.tree);
      expect(await readStateDocument(root)).toEqual(oracle.document);
    });
  }

  it('killed between the state store\'s temp write and its rename: project.json is byte-identical to the baseline and the re-run converges', async () => {
    const oracle = await cleanOracle(twoTargets);
    const root = await freshRoot(twoTargets);
    const baselineState = await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8');

    const killed = await runChild(root, { killAtStateRename: true }, 'kill.log');
    expect(killed.signal).toBe('SIGKILL');
    expect(touched(killed.log, ['rename'])).toHaveLength(TOTAL_RENAMES);
    expect(touched(killed.log, ['unlink'])).toHaveLength(TOTAL_UNLINKS);
    expect(touched(killed.log, ['state'])).toHaveLength(1);
    // The document was never replaced: a reader sees the baseline, whole, never a torn file.
    expect(await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8')).toBe(baselineState);
    // Every destination had landed already; the only residue of the state write is its own temp file.
    const orphanStateTemps = (await readdir(path.join(root, '.frontx'))).filter((f) => f !== 'project.json');
    expect(orphanStateTemps).toHaveLength(1);

    const rerun = await runChild(root, {}, 'rerun.log');
    expect(rerun.status).toBe(0);
    expect(touched(rerun.log, ['rename', 'write', 'unlink'])).toEqual([]);
    expect(touched(rerun.log, ['state'])).toHaveLength(1);

    // SIGKILL orphan (documented in the upgrade-changeset FEATURE): no catch runs on a hard kill, so the
    // store cannot remove its temp; a CAUGHT failure does (see the real rename-failure test above).
    // Pinned residue, not hidden: the engine reclaims stale temp files inside a target's ownership
    // (reserved suffix), but never the STATE STORE's own `.project.json.<uuid>.tmp`; it survives the
    // converged re-run. It does not affect convergence (disk and document equal the clean run).
    expect(withoutOrigins(await snapshotTree(root))).toEqual({
      ...oracle.tree,
      [`.frontx/${orphanStateTemps[0]}`]: expect.any(String),
    });
    expect(await readStateDocument(root)).toEqual(oracle.document);
  });
});

describe('caught failures on the real filesystem: recovery success, recovery failure, commit-point failure', { timeout: TEST_TIMEOUT_MS }, () => {
  const failOnNthRename = (n: number) => {
    let seen = 0;
    return (): void => {
      seen += 1;
      if (seen === n) throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };
  };

  it('failure after 3 of 6 renames with successful recovery: every path is back at baseline byte-for-byte, no litter, state bytes untouched', async () => {
    const root = await freshRoot(twoTargets);
    const before = await snapshotTree(root);
    const baselineState = await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8');

    const outcome = await upgradeToOrigin('my-template', 'path:o2', realDeps(root, { onRename: failOnNthRename(4) }));
    expect(outcome).toMatchObject({ ok: false, code: 'INTERNAL' });
    expect(JSON.stringify(outcome)).not.toContain('unrecovered');

    expect(await snapshotTree(root)).toEqual(before);
    expect(await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8')).toBe(baselineState);
  });

  it('failure with recovery failing for one path: the report names exactly the path it could not restore, the state is untouched, and the re-run still converges', async () => {
    const oracle = await cleanOracle(twoTargets);
    const root = await freshRoot(twoTargets);
    const baselineState = await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8');
    const stuck = path.join(root, 'app', 'a.ts');
    let armed = false;

    const outcome = await upgradeToOrigin(
      'my-template',
      'path:o2',
      realDeps(root, {
        onRename: (_from, to) => {
          if (to.endsWith('lib/b.ts')) {
            armed = true;
            throw new Error('EIO: i/o error');
          }
        },
        // Recovery returns a landed REPLACE by writing the baseline content back.
        onWriteDisk: (p) => {
          if (armed && p === stuck) throw new Error('EROFS: read-only file system');
        },
      }),
    );
    expect(outcome).toMatchObject({ ok: false, code: 'INTERNAL' });
    const unrecovered = (outcome as { details?: { unrecovered?: { path: string }[] } }).details?.unrecovered ?? [];
    expect(unrecovered.map((u) => u.path)).toEqual(['app/a.ts']);
    // The one path recovery could not restore really is still at the candidate content...
    expect(await readFile(stuck, 'utf-8')).toBe('a2');
    // ...every other landed path was returned, and the document was never written.
    expect(await readFile(path.join(root, 'lib', 'a.ts'), 'utf-8')).toBe('a1');
    expect(await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8')).toBe(baselineState);

    const rerun = await upgradeToOrigin('my-template', 'path:o2', realDeps(root));
    expect(rerun).toMatchObject({ ok: true, outcome: 'success' });
    expect(withoutOrigins(await snapshotTree(root))).toEqual(oracle.tree);
    expect(await readStateDocument(root)).toEqual(oracle.document);
  });

  it('a state write that fails BEFORE the store begins (hook throws ahead of the real adapter; the store itself is not reached): files stay landed, project.json is byte-identical, and the re-run converges without re-landing', async () => {
    const oracle = await cleanOracle(twoTargets);
    const root = await freshRoot(twoTargets);
    const baselineState = await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8');

    const outcome = await upgradeToOrigin(
      'my-template',
      'path:o2',
      realDeps(root, {
        onStateWrite: () => {
          throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
        },
      }),
    );
    expect(outcome).toMatchObject({ ok: false, code: 'INTERNAL' });
    expect(JSON.stringify(outcome)).not.toContain('unrecovered');
    expect(await readFile(path.join(root, 'app', 'a.ts'), 'utf-8')).toBe('a2');
    expect(await readFile(path.join(root, '.frontx', 'project.json'), 'utf-8')).toBe(baselineState);
    expect(await readdir(path.join(root, '.frontx'))).toEqual(['project.json']);

    const mutations: string[] = [];
    const rerun = await upgradeToOrigin(
      'my-template',
      'path:o2',
      realDeps(root, {
        onRename: (_f, to) => void mutations.push(to),
        onWriteDisk: (p) => void mutations.push(p),
        onUnlink: (p) => void mutations.push(p),
      }),
    );
    expect(rerun).toMatchObject({ ok: true, outcome: 'success' });
    expect(mutations).toEqual([]);
    expect(withoutOrigins(await snapshotTree(root))).toEqual(oracle.tree);
    expect(await readStateDocument(root)).toEqual(oracle.document);
  });

  it('a REAL state-store rename failure after the temp was written: the store removes only its own temp, reports the original error, files stay landed, and the re-run converges', async () => {
    const oracle = await cleanOracle(twoTargets);
    const root = await freshRoot(twoTargets);
    const stateDir = path.join(root, '.frontx');
    const baselineState = await readFile(path.join(stateDir, 'project.json'), 'utf-8');
    // A stranger's temp-shaped file in the same directory: cleanup must never touch it.
    const strangerTemp = path.join(stateDir, '.project.json.other-process.tmp');
    writeFileSync(strangerTemp, 'not ours', 'utf-8');

    const realRename = fs.renameSync.bind(fs);
    let tempExistedAtFailure = false;
    vi.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (String(to).endsWith(path.join('.frontx', 'project.json'))) {
        // The real store has already written its candidate temp by now.
        tempExistedAtFailure = existsSync(String(from)) && readFileSync(String(from), 'utf-8') !== baselineState;
        throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);

    const outcome = await upgradeToOrigin('my-template', 'path:o2', realDeps(root));
    vi.restoreAllMocks();
    expect(tempExistedAtFailure).toBe(true);
    expect(outcome).toMatchObject({ ok: false, code: 'INTERNAL' });
    expect(JSON.stringify(outcome)).toContain('EXDEV');
    expect(JSON.stringify(outcome)).not.toContain('unrecovered');
    expect(await readFile(path.join(root, 'app', 'a.ts'), 'utf-8')).toBe('a2');
    expect(await readFile(path.join(stateDir, 'project.json'), 'utf-8')).toBe(baselineState);
    // Own temp gone; the other process's file is untouched.
    expect((await readdir(stateDir)).sort()).toEqual(['.project.json.other-process.tmp', 'project.json']);
    expect(await readFile(strangerTemp, 'utf-8')).toBe('not ours');

    const rerun = await upgradeToOrigin('my-template', 'path:o2', realDeps(root));
    expect(rerun).toMatchObject({ ok: true, outcome: 'success' });
    expect(withoutOrigins(await snapshotTree(root))).toEqual({ ...oracle.tree, '.frontx/.project.json.other-process.tmp': 'not ours' });
    expect(await readStateDocument(root)).toEqual(oracle.document);
  });

  it('a REAL state-store rename failure whose own temp cleanup ALSO fails: the original error is still reported, and the residue is exactly the store\'s own complete temp', async () => {
    const oracle = await cleanOracle(twoTargets);
    const root = await freshRoot(twoTargets);
    const stateDir = path.join(root, '.frontx');
    const baselineState = await readFile(path.join(stateDir, 'project.json'), 'utf-8');
    const strangerTemp = path.join(stateDir, '.project.json.other-process.tmp');
    writeFileSync(strangerTemp, 'not ours', 'utf-8');

    const realRename = fs.renameSync.bind(fs);
    const realRm = fs.rmSync.bind(fs);
    const isStateTemp = (p: fs.PathLike): boolean => /\.project\.json\.[0-9a-f-]{36}\.tmp$/.test(String(p));
    vi.spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
      if (String(to).endsWith(path.join('.frontx', 'project.json'))) {
        throw Object.assign(new Error('EXDEV: cross-device link not permitted'), { code: 'EXDEV' });
      }
      return realRename(from, to);
    }) as typeof fs.renameSync);
    let cleanupAttempted = false;
    vi.spyOn(fs, 'rmSync').mockImplementation(((p: fs.PathLike, opts?: fs.RmOptions) => {
      if (isStateTemp(p)) {
        cleanupAttempted = true;
        throw Object.assign(new Error('EBUSY: cleanup refused'), { code: 'EBUSY' });
      }
      return realRm(p, opts);
    }) as typeof fs.rmSync);

    const outcome = await upgradeToOrigin('my-template', 'path:o2', realDeps(root));
    vi.restoreAllMocks();
    expect(cleanupAttempted).toBe(true);
    // The original failure is reported; the cleanup failure never replaces it.
    expect(outcome).toMatchObject({ ok: false, code: 'INTERNAL' });
    expect(JSON.stringify(outcome)).toContain('EXDEV');
    expect(JSON.stringify(outcome)).not.toContain('EBUSY');
    expect(JSON.stringify(outcome)).not.toContain('unrecovered');
    expect(await readFile(path.join(root, 'app', 'a.ts'), 'utf-8')).toBe('a2');
    expect(await readFile(path.join(stateDir, 'project.json'), 'utf-8')).toBe(baselineState);
    // Documented residue: exactly one leftover temp of the store's own, holding the complete candidate.
    const leftovers = (await readdir(stateDir)).filter((n) => n !== 'project.json' && n !== '.project.json.other-process.tmp');
    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]).toMatch(/^\.project\.json\.[0-9a-f-]{36}\.tmp$/);
    expect(JSON.parse(await readFile(path.join(stateDir, leftovers[0]!), 'utf-8'))).toEqual(oracle.document);
    expect(await readFile(strangerTemp, 'utf-8')).toBe('not ours');

    // The residue never blocks a retry: authoritative document and managed files converge.
    const rerun = await upgradeToOrigin('my-template', 'path:o2', realDeps(root));
    expect(rerun).toMatchObject({ ok: true, outcome: 'success' });
    expect(await readStateDocument(root)).toEqual(oracle.document);
    expect(await readFile(path.join(stateDir, leftovers[0]!), 'utf-8')).not.toBe('');
  });
});

describe('real-directory exclusion evidence survives a hard kill (the in-memory fake cannot represent it)', { timeout: TEST_TIMEOUT_MS }, () => {
  const exclusionWorld = (dirs: string[], disk: Record<string, string> = {}): WorldSpec => ({
    origins: {
      o1: { name: 'my-template', version: '1.0.0', files: { 'a.ts': 'a1' } },
      // The candidate newly declares `plugins/`; the baseline payload never listed anything there.
      o2: { name: 'my-template', version: '2.0.0', excluded: ['plugins/'], files: { 'a.ts': 'a2', 'b.ts': 'b2' } },
    },
    disk: { 'app/a.ts': 'a1', ...disk },
    dirs,
    templates: { 'my-template': { origin: 'path:o1', version: '1.0.0', targets: ['app'], excludedSubtrees: [] } },
  });

  const marked = (doc: Awaited<ReturnType<typeof readStateDocument>>) => doc.templates['my-template'];

  it('control: with no entry at the newly excluded location nothing is marked', async () => {
    const root = await freshRoot(exclusionWorld([]));
    expect(await upgradeToOrigin('my-template', 'path:o2', realDeps(root))).toMatchObject({ ok: true });
    expect(marked(await readStateDocument(root))).not.toHaveProperty('exclusionsBackfilled');
  });

  for (const [label, dirs, disk] of [
    ['a real non-empty directory', ['app/plugins'], { 'app/plugins/local.ts': 'mine' }],
    ['a real EMPTY directory', ['app/plugins'], {}],
  ] as const) {
    it(`${label} at the newly excluded location marks the entry, equals the clean run after a real kill, and is never written into`, async () => {
      const spec = exclusionWorld([...dirs], { ...disk });
      const oracleRoot = await freshRoot(spec);
      expect(await upgradeToOrigin('my-template', 'path:o2', realDeps(oracleRoot))).toMatchObject({ ok: true });
      const oracleDoc = await readStateDocument(oracleRoot);
      // The evidence is the directory itself: the mark exists only because it was there.
      expect(marked(oracleDoc)).toMatchObject({ exclusionsBackfilled: true });

      const root = await freshRoot(spec);
      const killed = await runChild(root, { killAfterRenames: 1 }, 'kill.log');
      expect(killed.signal).toBe('SIGKILL');
      const rerun = await runChild(root, {}, 'rerun.log');
      expect(rerun.status).toBe(0);

      expect(await readStateDocument(root)).toEqual(oracleDoc);
      expect(withoutOrigins(await snapshotTree(root))).toEqual(withoutOrigins(await snapshotTree(oracleRoot)));
      for (const p of touched(rerun.log, ['rename', 'write', 'unlink'])) expect(p).not.toContain(`${path.sep}plugins`);
      for (const [relative, content] of Object.entries(disk)) expect(await readFile(path.join(root, relative), 'utf-8')).toBe(content);
      expect(existsSync(path.join(root, 'app', 'plugins'))).toBe(true);
    });
  }
});
