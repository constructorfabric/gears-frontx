// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
//
// Real-filesystem coverage for the upgrade engine's path-spelling judgement
// (`inst-cls-judge-spelling`): the whole engine (`upgradeToOrigin`) over real
// adapters, with the payload resolver replaced by a stub so a crafted file map
// reaches the engine without passing the resolver's bundle-key guard, and with a
// recorded target edited into `.frontx/project.json` by hand — the two inputs
// the resolver's guard cannot see.
//
// Each case snapshots the whole sandbox (project, a sibling directory) before
// and after and requires the two to be identical, and requires that the plan was
// never presented: a refusal that still wrote, or that still asked a developer
// to approve a plan, is not one.
import fs from 'node:fs';
import path from 'node:path';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { upgradeToOrigin } from '../upgrade/flow';
import type { UpgradeEngineDeps } from '../upgrade/flow';
import type { ResolvedPayload, ResolvePayloadFn } from '../upgrade/types';
import type { ProjectStateDocument } from '../project-state/types';
import {
  createFsCanonicalizeTargetFn,
  createFsReadProjectStateFn,
  createFsWriteProjectStateFn,
} from '../adapters/fs-project-io';
import {
  createFsListDiskFilesFn,
  createFsReadDiskEntryFn,
  createFsRenameDiskFileFn,
  createFsUnlinkDiskFileFn,
  createFsWriteDiskFileFn,
} from '../adapters/fs-upgrade-io';

let sandbox: string | undefined;

afterEach(async () => {
  if (sandbox !== undefined) {
    await rm(sandbox, { recursive: true, force: true });
    sandbox = undefined;
  }
});

async function snapshot(dir: string, relative = ''): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const name of (await readdir(path.join(dir, relative))).sort()) {
    const entryRelative = relative === '' ? name : `${relative}/${name}`;
    const stat = await lstat(path.join(dir, entryRelative));
    if (stat.isDirectory()) {
      entries[`${entryRelative}/`] = '<dir>';
      Object.assign(entries, await snapshot(dir, entryRelative));
    } else {
      entries[entryRelative] = await readFile(path.join(dir, entryRelative), 'utf-8');
    }
  }
  return entries;
}

function payload(origin: string, version: string, files: Record<string, string>): ResolvedPayload {
  return { name: '@x/a', version, origin, files: new Map(Object.entries(files)), excludedSubtrees: [] };
}

function deps(repoRoot: string, resolvePayload: ResolvePayloadFn): UpgradeEngineDeps & { presentPlan: ReturnType<typeof vi.fn> } {
  const presentPlan = vi.fn(async () => 'approved' as const);
  return {
    repoRoot,
    readProjectStateFn: createFsReadProjectStateFn(),
    writeProjectStateFn: createFsWriteProjectStateFn(),
    resolvePayload,
    resolveRegisteredExclusions: async () => [],
    readDiskEntry: createFsReadDiskEntryFn(repoRoot),
    writeDiskFile: createFsWriteDiskFileFn(repoRoot),
    renameDiskFile: createFsRenameDiskFileFn(repoRoot),
    unlinkDiskFile: createFsUnlinkDiskFileFn(repoRoot),
    listDiskFiles: createFsListDiskFilesFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(repoRoot),
    presentPlan,
    promoteInventory: async () => {},
    refreshAiBundle: async () => {},
  };
}

// A project with a template recorded at `target`, a user file beside it, a file
// `other/src/index.ts` and `.frontx/src/index.ts` that equal the BASELINE's (so a
// REPLACE of either would be classified, were the spelling taken at face value),
// and a sibling directory outside the project whose file does the same.
async function makeSandbox(
  target: string,
  recorded: { projectOwnedRoots?: string[]; otherTargets?: string[] } = {},
): Promise<{ project: string; outside: string }> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-spelling-'));
  const project = path.join(sandbox, 'project');
  const outside = path.join(sandbox, 'outside');
  for (const dir of ['app/src', 'other/src', '.frontx/src']) await mkdir(path.join(project, dir), { recursive: true });
  await mkdir(path.join(outside, 'src'), { recursive: true });
  for (const file of ['app/src/index.ts', 'other/src/index.ts', '.frontx/src/index.ts']) {
    await writeFile(path.join(project, file), 'v1', 'utf-8');
  }
  await writeFile(path.join(outside, 'src', 'index.ts'), 'v1', 'utf-8');
  await writeFile(path.join(project, 'other', 'user.txt'), 'USER FILE', 'utf-8');
  const document: ProjectStateDocument = {
    formatVersion: 1,
    templates: {
      '@x/a': { origin: 'origin-a', version: '1.0.0', targets: [target], excludedSubtrees: [] },
      ...(recorded.otherTargets === undefined
        ? {}
        : { '@x/b': { origin: 'origin-b2', version: '1.0.0', targets: recorded.otherTargets, excludedSubtrees: [] } }),
    },
    projectOwnedRoots: recorded.projectOwnedRoots ?? [],
  };
  await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify(document), 'utf-8');
  return { project, outside };
}

const baseline = payload('origin-a', '1.0.0', { 'src/index.ts': 'v1' });

describe('the upgrade engine refuses a location that is not spelled as the one it names, over a real filesystem', () => {
  it.each([
    { label: 'a key that climbs into a sibling of the target', target: 'app', key: '../other/x.txt' },
    { label: 'a key that replaces a user file beside the target', target: 'app', key: '../other/user.txt' },
    { label: 'a key that climbs and comes back into the CLI namespace', target: '.', key: 'src/../.frontx/injected.json' },
    { label: 'a key that climbs out of the project', target: 'app', key: '../../outside/src/index.ts' },
  ])('refuses $label, writing nothing and never presenting a plan', async ({ target, key }) => {
    const { project } = await makeSandbox(target);
    const before = await snapshot(sandbox!);
    const candidate = payload('origin-b', '2.0.0', { 'src/index.ts': 'v2', [key]: 'PWNED-BY-KEY' });
    const engine = deps(project, async (origin) => ({ ok: true, payload: origin === 'origin-a' ? baseline : candidate }));

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PATH' });
    expect(engine.presentPlan).not.toHaveBeenCalled();
    expect(await snapshot(sandbox!)).toEqual(before);
  });

  // A recorded path is judged ONCE, when the state document is loaded, for every
  // engine (`inst-psio-if-noncanonical`): the upgrade never reaches its own
  // classification for a document carrying one, so these are PROJECT_INVALID.
  it.each([
    { label: 'a target that climbs and comes back into the CLI namespace', target: 'app/../.frontx', replaced: '.frontx/src/index.ts' },
    { label: 'a target that climbs into a sibling', target: 'app/../other', replaced: 'other/src/index.ts' },
    { label: 'a target that climbs out of the project, onto a file that matches the baseline', target: '../outside', replaced: '../outside/src/index.ts' },
  ])('refuses $label at state load, so the file it would have replaced is untouched', async ({ target, replaced }) => {
    const { project } = await makeSandbox(target);
    const before = await snapshot(sandbox!);
    const candidate = payload('origin-b', '2.0.0', { 'src/index.ts': 'v2' });
    const engine = deps(project, async (origin) => ({ ok: true, payload: origin === 'origin-a' ? baseline : candidate }));

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    expect(result).toMatchObject({ ok: false, code: 'PROJECT_INVALID' });
    expect(engine.presentPlan).not.toHaveBeenCalled();
    expect(await readFile(path.join(project, replaced), 'utf-8')).toBe('v1');
    expect(await snapshot(sandbox!)).toEqual(before);
  });

  // 2b review H1: the recorded `projectOwnedRoots` entry `x/../app/src` read, as
  // a string, as ground outside `app/src`, so the upgrade REPLACED the project-
  // owned `app/src/index.ts`. Judged at load now, for every engine.
  it.each([
    { label: 'a project-owned root that climbs and comes back', recorded: { projectOwnedRoots: ['x/../app/src'] } },
    { label: 'a project-owned root with a trailing separator', recorded: { projectOwnedRoots: ['app/src/'] } },
    { label: 'another template\'s target that climbs and comes back', recorded: { otherTargets: ['app/../other'] } },
  ])('refuses $label at state load and leaves the project-owned file alone', async ({ recorded }) => {
    const { project } = await makeSandbox('app', recorded);
    const before = await snapshot(sandbox!);
    const candidate = payload('origin-b', '2.0.0', { 'src/index.ts': 'v2' });
    const engine = deps(project, async (origin) => ({ ok: true, payload: origin === 'origin-a' ? baseline : candidate }));

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    expect(result).toMatchObject({ ok: false, code: 'PROJECT_INVALID' });
    expect(engine.presentPlan).not.toHaveBeenCalled();
    expect(await readFile(path.join(project, 'app', 'src', 'index.ts'), 'utf-8')).toBe('v1');
    expect(await snapshot(sandbox!)).toEqual(before);
  });

  it('never touches the filesystem outside the project for a target that climbs out of it, and the spy sees an inside read (control)', async () => {
    const lstat = vi.spyOn(fs, 'lstatSync');
    const readdirSpy = vi.spyOn(fs, 'readdirSync');
    const readFileSpy = vi.spyOn(fs, 'readFileSync');
    const outsideCalls = (outside: string) =>
      [lstat, readdirSpy, readFileSpy].flatMap((spy) => spy.mock.calls.map((call) => String(call[0]))).filter((p) => p.startsWith(outside));
    try {
      const refused = await makeSandbox('../outside');
      const outsideDir = path.join(sandbox!, 'outside');
      const candidate = payload('origin-b', '2.0.0', { 'src/index.ts': 'v2' });
      const engine = deps(refused.project, async (origin) => ({ ok: true, payload: origin === 'origin-a' ? baseline : candidate }));
      lstat.mockClear();
      readdirSpy.mockClear();
      readFileSpy.mockClear();

      const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

      expect(result).toMatchObject({ ok: false });
      expect(outsideCalls(outsideDir)).toEqual([]);

      // Control: a canonical upgrade DOES reach the same spies for a path inside the project.
      await rm(sandbox!, { recursive: true, force: true });
      const accepted = await makeSandbox('app');
      const acceptedEngine = deps(accepted.project, async (origin) => ({ ok: true, payload: origin === 'origin-a' ? baseline : candidate }));
      lstat.mockClear();
      await upgradeToOrigin('@x/a', 'origin-b', acceptedEngine);
      expect(lstat.mock.calls.some((call) => String(call[0]).startsWith(path.join(accepted.project, 'app')))).toBe(true);
    } finally {
      lstat.mockRestore();
      readdirSpy.mockRestore();
      readFileSpy.mockRestore();
    }
  });

  it('still upgrades a canonical target with a canonical payload (control)', async () => {
    const { project } = await makeSandbox('app');
    const candidate = payload('origin-b', '2.0.0', { 'src/index.ts': 'v2' });
    const engine = deps(project, async (origin) => ({ ok: true, payload: origin === 'origin-a' ? baseline : candidate }));

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    expect(result).toMatchObject({ ok: true, outcome: 'success' });
    expect(await readFile(path.join(project, 'app', 'src', 'index.ts'), 'utf-8')).toBe('v2');
  });
});
