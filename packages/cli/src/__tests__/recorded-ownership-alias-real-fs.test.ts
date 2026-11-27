// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// Live, real-filesystem coverage for the SYMLINK half of the recorded-path
// judgement. The state store judges a recorded path's spelling; it cannot know
// that `link/src` is, on this disk, `app/src`. Every ownership predicate
// compares segments of the string it is handed, so without a disk-aware
// judgement a project-owned file reached through a symlink alias is overwritten
// by `upgrade` and removed by `delete` under `ok:true`.
//
// Each case snapshots the sandbox (including symlinks) before and after and
// requires them identical wherever the engine refuses or preserves: no partial
// write is a refusal that still wrote.
import path from 'node:path';
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteTarget } from '../commands/delete';
import type { DeleteCommandFlags } from '../commands/delete';
import { ownershipRemove } from '../commands/ownership';
import { validateProject } from '../commands/validate-project';
import { upgradeToOrigin } from '../upgrade/flow';
import type { UpgradeEngineDeps } from '../upgrade/flow';
import type { ResolvedPayload, ResolvePayloadFn } from '../upgrade/types';
import type { ProjectStateDocument } from '../project-state/types';
import type { DeletePlanInventoryPort } from '../scaffold/delete-plan';
import {
  createFsAssertPathWithinRootFn,
  createFsCanonicalizeTargetFn,
  createFsListTargetFilesFn,
  createFsListUnenumerableTargetEntriesFn,
  createFsReadFileFn,
  createFsReadProjectStateFn,
  createFsRemoveProjectFileFn,
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
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

async function snapshot(dir: string, relative = ''): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const name of (await readdir(path.join(dir, relative))).sort()) {
    const entryRelative = relative === '' ? name : `${relative}/${name}`;
    const stat = await lstat(path.join(dir, entryRelative));
    if (stat.isSymbolicLink()) {
      entries[entryRelative] = `-> ${await readlink(path.join(dir, entryRelative))}`;
    } else if (stat.isDirectory()) {
      entries[`${entryRelative}/`] = '<dir>';
      Object.assign(entries, await snapshot(dir, entryRelative));
    } else {
      entries[entryRelative] = await readFile(path.join(dir, entryRelative), 'utf-8');
    }
  }
  return entries;
}

// `app/` is template ground with a PROJECT-OWNED file `app/src/own.ts` the
// developer declared owned (`projectOwnedRoots`); `link` is a symlink to `app`.
async function makeProject(document: Omit<ProjectStateDocument, 'formatVersion'>): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-ownership-alias-'));
  const project = path.join(sandbox, 'project');
  await mkdir(path.join(project, 'app', 'src'), { recursive: true });
  await mkdir(path.join(project, '.frontx'), { recursive: true });
  await writeFile(path.join(project, 'app', 'src', 'index.ts'), 'v1', 'utf-8');
  await writeFile(path.join(project, 'app', 'src', 'own.ts'), 'PROJECT OWNED', 'utf-8');
  await symlink(path.join(project, 'app'), path.join(project, 'link'));
  await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify({ formatVersion: 1, ...document }), 'utf-8');
  return project;
}

const entryA = {
  origin: 'origin-a',
  version: '1.0.0',
  targets: ['app'],
  excludedSubtrees: [] as string[],
};
const baseline: ResolvedPayload = {
  name: '@x/a',
  version: '1.0.0',
  origin: 'origin-a',
  files: new Map([['src/index.ts', 'v1']]),
  excludedSubtrees: [],
};
const candidate: ResolvedPayload = {
  ...baseline,
  version: '2.0.0',
  origin: 'origin-b',
  files: new Map([['src/index.ts', 'v2']]),
};

function upgradeDeps(repoRoot: string): UpgradeEngineDeps & { presentPlan: ReturnType<typeof vi.fn> } {
  const resolvePayload: ResolvePayloadFn = async (origin) => ({
    ok: true,
    payload: origin === 'origin-a' ? baseline : candidate,
  });
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

const noInventory: DeletePlanInventoryPort = { lookup: () => undefined };

async function runDelete(project: string, target: string, flags: { dryRun: boolean }) {
  const canonicalizeFn = createFsCanonicalizeTargetFn(project);
  const invoke = (callFlags: DeleteCommandFlags) =>
    deleteTarget(
      target,
      project,
      callFlags,
      noInventory,
      canonicalizeFn,
      createFsListTargetFilesFn(),
      createFsListUnenumerableTargetEntriesFn(),
      createFsReadFileFn(),
      createFsRemoveProjectFileFn(),
      createFsAssertPathWithinRootFn(project),
      createFsReadProjectStateFn(),
      createFsWriteProjectStateFn(),
      async () => 'confirmed',
    );
  if (flags.dryRun) return invoke({ jsonMode: true, dryRun: true, yes: false });
  // The confirming call is bound to the reviewed plan: review first, then state its digest.
  const review = await invoke({ jsonMode: true, dryRun: false, yes: false });
  if (review.ok || review.code !== 'CONFIRMATION_REQUIRED') return review;
  return invoke({ jsonMode: true, dryRun: false, yes: true, expectedPlanDigest: String(review.details?.planDigest) });
}

describe('a recorded owned root that is a symlink alias (real filesystem)', () => {
  const aliasedRoots = {
    templates: { '@x/a': entryA },
    projectOwnedRoots: ['link/src'],
  };

  it('upgrade refuses PROJECT_INVALID naming the root, never presenting a plan and writing nothing', async () => {
    const project = await makeProject(aliasedRoots);
    const before = await snapshot(sandbox!);
    const engine = upgradeDeps(project);

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    expect(result).toMatchObject({ ok: false, code: 'PROJECT_INVALID' });
    if (result.ok) return;
    expect(result.message).toContain('link/src');
    expect(result.message).toContain('app/src');
    expect(engine.presentPlan).not.toHaveBeenCalled();
    expect(await snapshot(sandbox!)).toEqual(before);
  });

  it.each([{ dryRun: true }, { dryRun: false }])(
    'delete (dryRun=$dryRun) refuses PROJECT_INVALID and removes nothing',
    async ({ dryRun }) => {
      const project = await makeProject(aliasedRoots);
      const before = await snapshot(sandbox!);

      const result = await runDelete(project, 'app', { dryRun });

      expect(result).toMatchObject({ ok: false, code: 'PROJECT_INVALID' });
      expect(await snapshot(sandbox!)).toEqual(before);
    },
  );

  it('validate --project refuses it, naming the entry', async () => {
    const project = await makeProject(aliasedRoots);

    const result = await validateProject(project, {
      readProjectStateFn: createFsReadProjectStateFn(),
      canonicalizeFn: createFsCanonicalizeTargetFn(project),
      inventory: { lookup: () => undefined },
      readFileFn: createFsReadFileFn(),
    } as never);

    expect(result).toMatchObject({
      ok: false,
      code: 'PROJECT_INVALID',
      details: { path: 'link/src' },
    });
  });

  it('a root that IS its own canonical location is accepted: upgrade preserves the owned file and replaces the rest', async () => {
    const project = await makeProject({
      templates: { '@x/a': entryA },
      projectOwnedRoots: ['app/src/own.ts'],
    });
    const engine = upgradeDeps(project);

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    expect(result).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'app', 'src', 'own.ts'), 'utf-8')).toBe('PROJECT OWNED');
    expect(await readFile(path.join(project, 'app', 'src', 'index.ts'), 'utf-8')).toBe('v2');
  });
});

describe('a recorded TARGET that is a symlink to project-owned ground (real filesystem)', () => {
  // The designed recovery path stays: a target replaced by a symlink after
  // `apply` is still deletable through the only command that can remove it —
  // but never through ground the project owns.
  const aliasedTarget = {
    templates: { '@x/a': { ...entryA, targets: ['link'] } },
    projectOwnedRoots: ['app/src/own.ts'],
  };

  it('delete preserves the project-owned file reached through the link, reports it, and deletes the rest', async () => {
    const project = await makeProject(aliasedTarget);

    const dry = await runDelete(project, 'link', { dryRun: true });
    expect(dry).toMatchObject({ ok: true });
    if (!dry.ok) return;
    const plan = JSON.stringify(dry);
    expect(plan).toContain('link/src/index.ts');
    expect(plan).toContain('link/src/own.ts');

    const result = await runDelete(project, 'link', { dryRun: false });

    expect(result).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'app', 'src', 'own.ts'), 'utf-8')).toBe('PROJECT OWNED');
    await expect(lstat(path.join(project, 'app', 'src', 'index.ts'))).rejects.toThrow();
  });

  it('delete of a target whose interior symlink leads into owned ground preserves that file', async () => {
    const project = await makeProject({
      templates: { '@x/a': { ...entryA, targets: ['pkg'] } },
      projectOwnedRoots: ['app/src'],
    });
    await mkdir(path.join(project, 'pkg'), { recursive: true });
    await writeFile(path.join(project, 'pkg', 'mine.ts'), 'template', 'utf-8');
    await symlink(path.join(project, 'app', 'src'), path.join(project, 'pkg', 'inner'));

    const result = await runDelete(project, 'pkg', { dryRun: false });

    expect(result).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'app', 'src', 'own.ts'), 'utf-8')).toBe('PROJECT OWNED');
    expect(await readFile(path.join(project, 'app', 'src', 'index.ts'), 'utf-8')).toBe('v1');
    await expect(lstat(path.join(project, 'pkg', 'mine.ts'))).rejects.toThrow();
  });

  it('upgrade fails closed on a symlinked target without writing', async () => {
    const project = await makeProject(aliasedTarget);
    const before = await snapshot(sandbox!);
    const engine = upgradeDeps(project);

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    expect(result.ok).toBe(false);
    expect(await snapshot(sandbox!)).toEqual(before);
  });
});

describe("another template's recorded target that is a symlink alias (real filesystem)", () => {
  it('upgrade of a template at the project root does not overwrite the other template through its alias', async () => {
    const project = await makeProject({
      templates: {
        '@x/a': { ...entryA, targets: ['.'] },
        '@x/b': {
          origin: 'origin-b2',
          version: '1.0.0',
          targets: ['link'],
          excludedSubtrees: [],
        },
      },
      projectOwnedRoots: [],
    });
    const rootBaseline: ResolvedPayload = {
      ...baseline,
      files: new Map([['app/src/index.ts', 'v1']]),
    };
    const rootCandidate: ResolvedPayload = {
      ...candidate,
      files: new Map([['app/src/index.ts', 'v2']]),
    };
    const engine = {
      ...upgradeDeps(project),
      resolvePayload: (async (origin: string) => ({
        ok: true,
        payload: origin === 'origin-a' ? rootBaseline : rootCandidate,
      })) as ResolvePayloadFn,
    };

    const result = await upgradeToOrigin('@x/a', 'origin-b', engine);

    // Judged by the recorded spelling alone, `app/src/index.ts` is not under
    // `link` and the other template's file would be REPLACEd.
    expect(JSON.stringify(result)).not.toContain('"op":"REPLACE"');
    expect(await readFile(path.join(project, 'app', 'src', 'index.ts'), 'utf-8')).toBe('v1');
  });
});

describe("another template's alias that coincides with this template's target (real filesystem)", () => {
  it('upgrade refuses TARGET_CONFLICT and writes nothing', async () => {
    const project = await makeProject({
      templates: {
        '@x/a': entryA,
        '@x/b': { origin: 'origin-b2', version: '1.0.0', targets: ['link'], excludedSubtrees: [] },
      },
      projectOwnedRoots: [],
    });
    const before = await snapshot(sandbox!);

    const result = await upgradeToOrigin('@x/a', 'origin-b', upgradeDeps(project));

    expect(result).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
    expect(await snapshot(sandbox!)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// `delete` against ANOTHER template's ground reached through a symlink alias.
// The plan's second judgement compares resolved locations, so the other
// templates' targets and origin folders are protected at the place they RESOLVE
// to, however they are spelled — not only when their spelling sits lexically
// under the target being deleted.
// ---------------------------------------------------------------------------

function otherEntry(origin: string, targets: string[]) {
  return { origin, version: '1.0.0', targets, excludedSubtrees: [] as string[] };
}

// A template's CURRENT manifest as it sits in its local `path:` origin folder.
function currentManifest(name: string, excludedSubtrees: string[]): Record<string, string> {
  const folder = name.replace('@x/', 'vendor-');
  return {
    [`${folder}/frontx-template.json`]: JSON.stringify({ name, version: '1.0.0', excludedSubtrees, description: 'f' }),
  };
}

// A project laid out by hand: `files` maps a relative path to its content,
// `links` maps a relative symlink path to its project-relative target.
async function makeCustomProject(
  document: Omit<ProjectStateDocument, 'formatVersion'>,
  files: Record<string, string>,
  links: Record<string, string>,
): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-other-ground-'));
  const project = path.join(sandbox, 'project');
  await mkdir(path.join(project, '.frontx'), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(project, relative)), { recursive: true });
    await writeFile(path.join(project, relative), content, 'utf-8');
  }
  for (const [relative, to] of Object.entries(links)) {
    await mkdir(path.dirname(path.join(project, relative)), { recursive: true });
    await symlink(path.join(project, to), path.join(project, relative));
  }
  await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify({ formatVersion: 1, ...document }), 'utf-8');
  return project;
}

describe("delete never removes another template's ground reached through an alias (real filesystem)", () => {
  it("P1: another template's target nested under this target's RESOLVED location is preserved", async () => {
    // @x/a was applied at `dst`, later moved to `real` with `dst` left as a link.
    // @x/b is recorded at `real/sub`, which is not spelled under `dst`.
    const project = await makeCustomProject(
      {
        templates: { '@x/a': otherEntry('origin-a', ['dst']), '@x/b': otherEntry('origin-b2', ['real/sub']) },
        projectOwnedRoots: [],
      },
      { 'real/a.txt': 'A', 'real/sub/b.txt': 'B' },
      { dst: 'real' },
    );

    const result = await runDelete(project, 'dst', { dryRun: false });

    expect(result).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real', 'sub', 'b.txt'), 'utf-8')).toBe('B');
    await expect(lstat(path.join(project, 'real', 'a.txt'))).rejects.toThrow();
    if (result.ok) expect(JSON.stringify(result)).toContain('dst/sub');
  });

  it("P2: another template's recorded alias that resolves inside this target is preserved", async () => {
    const project = await makeCustomProject(
      {
        templates: { '@x/a': otherEntry('origin-a', ['real']), '@x/b': otherEntry('origin-b2', ['bdir']) },
        projectOwnedRoots: [],
      },
      { 'real/a.txt': 'A', 'real/sub/b.txt': 'B' },
      { bdir: 'real/sub' },
    );

    const dry = await runDelete(project, 'real', { dryRun: true });
    expect(dry).toMatchObject({ ok: true });
    if (dry.ok) expect((dry as unknown as { toDelete: string[] }).toDelete).not.toContain('real/sub/b.txt');

    await runDelete(project, 'real', { dryRun: false });
    expect(await readFile(path.join(project, 'real', 'sub', 'b.txt'), 'utf-8')).toBe('B');
    await expect(lstat(path.join(project, 'real', 'a.txt'))).rejects.toThrow();
  });

  it("P3: another template recorded at this target's resolved location (equal ground) loses nothing", async () => {
    const project = await makeCustomProject(
      {
        templates: { '@x/a': otherEntry('origin-a', ['dst']), '@x/b': otherEntry('origin-b2', ['real']) },
        projectOwnedRoots: [],
      },
      { 'real/a.txt': 'A', 'real/sub/b.txt': 'B' },
      { dst: 'real' },
    );

    await runDelete(project, 'dst', { dryRun: false });

    expect(await readFile(path.join(project, 'real', 'a.txt'), 'utf-8')).toBe('A');
    expect(await readFile(path.join(project, 'real', 'sub', 'b.txt'), 'utf-8')).toBe('B');
  });

  it("P4: another template's local `path:` origin folder under this target's resolved location is preserved", async () => {
    const project = await makeCustomProject(
      {
        templates: {
          '@x/a': otherEntry('origin-a', ['dst']),
          '@x/c': otherEntry('path:real/vendor-c', []),
        },
        projectOwnedRoots: [],
      },
      {
        'real/a.txt': 'A',
        'real/vendor-c/frontx-template.json': '{"name":"@x/c","version":"1.0.0"}',
        'real/vendor-c/c.txt': 'C',
      },
      { dst: 'real' },
    );

    const result = await runDelete(project, 'dst', { dryRun: false });

    expect(result).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real', 'vendor-c', 'c.txt'), 'utf-8')).toBe('C');
    expect(await readFile(path.join(project, 'real', 'vendor-c', 'frontx-template.json'), 'utf-8')).toContain('@x/c');
    await expect(lstat(path.join(project, 'real', 'a.txt'))).rejects.toThrow();
  });

  it('control: an outer template that DECLARES this nested ground excluded (recorded and current) does not shield this target', async () => {
    const project = await makeCustomProject(
      {
        templates: {
          '@x/a': otherEntry('origin-a', ['app/sub']),
          '@x/b': { ...otherEntry('path:vendor-b', ['app']), excludedSubtrees: ['sub/'] },
        },
        projectOwnedRoots: [],
      },
      { 'app/sub/a.txt': 'A', 'app/b.txt': 'B', ...currentManifest('@x/b', ['sub/']) },
      {},
    );

    await runDelete(project, 'app/sub', { dryRun: false });

    await expect(lstat(path.join(project, 'app', 'sub', 'a.txt'))).rejects.toThrow();
    expect(await readFile(path.join(project, 'app', 'b.txt'), 'utf-8')).toBe('B');
  });

  it('control: the same nesting through symlinked host and guest directories still deletes only the guest', async () => {
    const project = await makeCustomProject(
      {
        templates: {
          '@x/a': { ...otherEntry('path:vendor-a', ['app']), excludedSubtrees: ['src/plugins/'] },
          '@x/b': otherEntry('origin-b2', ['app/src/plugins']),
        },
        projectOwnedRoots: [],
      },
      { 'realapp/a.txt': 'A', 'realapp/src/plugins/b.txt': 'B', ...currentManifest('@x/a', ['src/plugins/']) },
      { app: 'realapp' },
    );

    const guest = await runDelete(project, 'app/src/plugins', { dryRun: false });
    expect(guest).toMatchObject({ ok: true });
    await expect(lstat(path.join(project, 'realapp', 'src', 'plugins', 'b.txt'))).rejects.toThrow();
    expect(await readFile(path.join(project, 'realapp', 'a.txt'), 'utf-8')).toBe('A');
  });

  it("P5: this target's alias landing inside another template's UNDECLARED payload deletes none of it", async () => {
    // @x/b owns `real` (including `real/sub/b2.txt`) with no exclusion; @x/a's
    // recorded `dst` was later turned into a link to `real/sub`.
    const project = await makeCustomProject(
      {
        templates: { '@x/a': otherEntry('origin-a', ['dst']), '@x/b': otherEntry('origin-b2', ['real']) },
        projectOwnedRoots: [],
      },
      { 'real/b.txt': 'B', 'real/sub/b2.txt': 'B2' },
      { dst: 'real/sub' },
    );
    const before = await snapshot(sandbox!);

    const dry = await runDelete(project, 'dst', { dryRun: true });
    expect(dry).toMatchObject({ ok: true });
    if (dry.ok) expect((dry as unknown as { toDelete: string[] }).toDelete).toEqual([]);

    await runDelete(project, 'dst', { dryRun: false });
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
    expect(await readFile(path.join(project, 'real', 'b.txt'), 'utf-8')).toBe('B');
    expect({ ...(await snapshot(sandbox!)), 'project/.frontx/project.json': '' }).toEqual({
      ...before,
      'project/.frontx/project.json': '',
    });
  });

  it('P5c: the same overlap recorded lexically (b at `real`, a at `real/sub`) deletes none of b\'s payload', async () => {
    const project = await makeCustomProject(
      {
        templates: { '@x/a': otherEntry('origin-a', ['real/sub']), '@x/b': otherEntry('origin-b2', ['real']) },
        projectOwnedRoots: [],
      },
      { 'real/b.txt': 'B', 'real/sub/b2.txt': 'B2' },
      {},
    );

    await runDelete(project, 'real/sub', { dryRun: false });

    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  });

  it("S1b: another template's local `path:` origin folder that CONTAINS this target's resolved location is preserved", async () => {
    // @x/a was applied at `dst`, which now links into `vendor-b/sub`; @x/b's
    // source folder is `vendor-b`.
    const project = await makeCustomProject(
      {
        templates: { '@x/a': otherEntry('origin-a', ['dst']), '@x/b': otherEntry('path:vendor-b', []) },
        projectOwnedRoots: [],
      },
      {
        'vendor-b/frontx-template.json': '{"name":"@x/b","version":"1.0.0"}',
        'vendor-b/sub/b-source.txt': 'keep-b',
      },
      { dst: 'vendor-b/sub' },
    );

    const dry = await runDelete(project, 'dst', { dryRun: true });
    expect(dry).toMatchObject({ ok: true });
    if (dry.ok) expect((dry as unknown as { toDelete: string[] }).toDelete).toEqual([]);

    await runDelete(project, 'dst', { dryRun: false });
    expect(await readFile(path.join(project, 'vendor-b', 'sub', 'b-source.txt'), 'utf-8')).toBe('keep-b');
  });

  it('the OWN origin folder in the same geometry is preserved too', async () => {
    const project = await makeCustomProject(
      { templates: { '@x/a': otherEntry('path:vendor-a', ['dst']) }, projectOwnedRoots: [] },
      { 'vendor-a/frontx-template.json': '{"name":"@x/a","version":"1.0.0"}', 'vendor-a/sub/a-source.txt': 'keep-a' },
      { dst: 'vendor-a/sub' },
    );

    await runDelete(project, 'dst', { dryRun: false });

    expect(await readFile(path.join(project, 'vendor-a', 'sub', 'a-source.txt'), 'utf-8')).toBe('keep-a');
  });
});

describe("delete's ancestor exemption needs the exclusion in BOTH the recorded and the readable current declaration (real filesystem)", () => {
  // @x/b owns `real` and has written `real/sub/b2.txt`; @x/a's recorded `dst`
  // is a link to `real/sub`. Only when @x/b declares `sub/` excluded in what it
  // RECORDED and in what its manifest says NOW is that ground carved out for a
  // nested owner; any other combination is @x/b's payload and must survive.
  const layout = (recorded: string[], current: string[] | 'unreadable') =>
    makeCustomProject(
      {
        templates: {
          '@x/a': otherEntry('origin-a', ['dst']),
          '@x/b': { ...otherEntry('path:vendor-b', ['real']), excludedSubtrees: recorded },
        },
        projectOwnedRoots: [],
      },
      {
        'real/b.txt': 'B',
        'real/sub/b2.txt': 'B2',
        ...(current === 'unreadable' ? {} : currentManifest('@x/b', current)),
      },
      { dst: 'real/sub' },
    );

  async function deleteAndReport(project: string) {
    const before = await snapshot(sandbox!);
    const dry = await runDelete(project, 'dst', { dryRun: true });
    expect(dry).toMatchObject({ ok: true });
    expect(await snapshot(sandbox!)).toEqual(before);
    await runDelete(project, 'dst', { dryRun: false });
    return dry as unknown as { toDelete: string[]; toPreserve: string[] };
  }

  it('current-only declaration (U1): B\'s payload survives', async () => {
    const project = await layout([], ['sub/']);
    const dry = await deleteAndReport(project);
    expect(dry.toDelete).toEqual([]);
    expect(dry.toPreserve).toContain('dst/b2.txt');
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  });

  it('recorded-only declaration (current manifest dropped it): B\'s payload survives', async () => {
    const project = await layout(['sub/'], []);
    const dry = await deleteAndReport(project);
    expect(dry.toDelete).toEqual([]);
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  });

  it('neither declares it: B\'s payload survives', async () => {
    const project = await layout([], []);
    const dry = await deleteAndReport(project);
    expect(dry.toDelete).toEqual([]);
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  });

  it('current manifest unreadable (recorded declares it): fails closed, B\'s payload survives', async () => {
    const project = await layout(['sub/'], 'unreadable');
    const dry = await deleteAndReport(project);
    expect(dry.toDelete).toEqual([]);
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  });

  it('both declare it: the ground is carved out for the nested owner and is deleted', async () => {
    const project = await layout(['sub/'], ['sub/']);
    const dry = await deleteAndReport(project);
    expect(dry.toDelete).toEqual(['dst/b2.txt']);
    await expect(lstat(path.join(project, 'real', 'sub', 'b2.txt'))).rejects.toThrow();
    expect(await readFile(path.join(project, 'real', 'b.txt'), 'utf-8')).toBe('B');
  });

  it('symlink nesting: a host directory reached through a link, current-only declaration, preserves the guest ground', async () => {
    // @x/a (guest) at `app/src/plugins`; @x/b (host) at `app` where `app -> realapp`.
    const project = await makeCustomProject(
      {
        templates: {
          '@x/a': otherEntry('origin-a', ['app/src/plugins']),
          '@x/b': otherEntry('path:vendor-b', ['app']),
        },
        projectOwnedRoots: [],
      },
      { 'realapp/h.txt': 'H', 'realapp/src/plugins/b2.txt': 'B2', ...currentManifest('@x/b', ['src/plugins/']) },
      { app: 'realapp' },
    );

    await runDelete(project, 'app/src/plugins', { dryRun: false });

    expect(await readFile(path.join(project, 'realapp', 'src', 'plugins', 'b2.txt'), 'utf-8')).toBe('B2');
  });
});

describe("upgrade never hands an undeclared part of this template's payload to another template's alias (real filesystem)", () => {
  // @x/a is applied at `real` (payload `src/index.ts` and `sub/x.txt`); @x/b's
  // recorded `dst` is a link to `real/sub`.
  const payloadV1: ResolvedPayload = { ...baseline, files: new Map([['src/index.ts', 'v1'], ['sub/x.txt', 'x1']]) };
  const payloadV2: ResolvedPayload = { ...candidate, files: new Map([['src/index.ts', 'v2'], ['sub/x.txt', 'x2']]) };
  const depsFor = (project: string, declared: string[]) => {
    const deps = upgradeDeps(project);
    return {
      ...deps,
      resolvePayload: (async (origin: string) => ({
        ok: true,
        payload: origin === 'origin-a' ? { ...payloadV1, excludedSubtrees: declared } : { ...payloadV2, excludedSubtrees: declared },
      })) as ResolvePayloadFn,
    };
  };
  const layout = (declared: string[]) =>
    makeCustomProject(
      {
        templates: {
          '@x/a': { ...otherEntry('origin-a', ['real']), excludedSubtrees: declared },
          '@x/b': otherEntry('origin-b2', ['dst']),
        },
        projectOwnedRoots: [],
      },
      { 'real/src/index.ts': 'v1', 'real/sub/x.txt': 'x1' },
      { dst: 'real/sub' },
    );

  it('refuses TARGET_CONFLICT when the ground is not declared excluded, and writes nothing', async () => {
    const project = await layout([]);
    const before = await snapshot(sandbox!);

    const result = await upgradeToOrigin('@x/a', 'origin-b', depsFor(project, []));

    expect(result).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
    expect(await snapshot(sandbox!)).toEqual(before);
  });

  it('still reserves the ground, and upgrades the rest, when the template declares it excluded', async () => {
    const project = await layout(['sub/']);

    const result = await upgradeToOrigin('@x/a', 'origin-b', depsFor(project, ['sub/']));

    expect(result).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real', 'src', 'index.ts'), 'utf-8')).toBe('v2');
    expect(await readFile(path.join(project, 'real', 'sub', 'x.txt'), 'utf-8')).toBe('x1');
  });
});

describe('upgrade does not skip its own applied file under success when only the current manifest declares the ground (real filesystem)', () => {
  // L1: @x/a recorded no exclusion and wrote `real/sub/x.txt`; its manifest now
  // (and the candidate) declare `sub/`, and @x/b's `dst` links to `real/sub`.
  const payloadV1: ResolvedPayload = { ...baseline, files: new Map([['src/index.ts', 'v1'], ['sub/x.txt', 'x1']]) };
  const payloadV2: ResolvedPayload = { ...candidate, files: new Map([['src/index.ts', 'v2'], ['sub/x.txt', 'x2']]) };

  it('refuses TARGET_CONFLICT and writes nothing, instead of skipping real/sub/x.txt', async () => {
    const project = await makeCustomProject(
      {
        templates: {
          '@x/a': { ...otherEntry('origin-a', ['real']), excludedSubtrees: [] },
          '@x/b': otherEntry('origin-b2', ['dst']),
        },
        projectOwnedRoots: [],
      },
      { 'real/src/index.ts': 'v1', 'real/sub/x.txt': 'x1' },
      { dst: 'real/sub' },
    );
    const deps = {
      ...upgradeDeps(project),
      resolvePayload: (async (origin: string) => ({
        ok: true,
        payload: origin === 'origin-a' ? { ...payloadV1, excludedSubtrees: ['sub/'] } : { ...payloadV2, excludedSubtrees: ['sub/'] },
      })) as ResolvePayloadFn,
    };
    const before = await snapshot(sandbox!);

    const result = await upgradeToOrigin('@x/a', 'origin-b', deps);

    expect(result).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
    expect(await snapshot(sandbox!)).toEqual(before);
  });
});

describe('ownership remove repairs a recorded alias (real filesystem)', () => {
  const run = (project: string, raw: string) =>
    ownershipRemove(
      raw,
      project,
      createFsCanonicalizeTargetFn(project),
      createFsReadProjectStateFn(),
      createFsWriteProjectStateFn(),
    );

  it('removes the entry recorded verbatim as the alias, and reports what it removed', async () => {
    const project = await makeProject({ templates: { '@x/a': entryA }, projectOwnedRoots: ['link/src'] });

    const result = await run(project, 'link/src');

    expect(result).toMatchObject({ ok: true, path: 'link/src', projectOwnedRoots: [] });
    const upgraded = await upgradeToOrigin('@x/a', 'origin-b', upgradeDeps(project));
    expect(upgraded).toMatchObject({ ok: true });
  });

  it('removes only the alias spelling and leaves the canonical entry beside it', async () => {
    const project = await makeProject({
      templates: { '@x/a': entryA },
      projectOwnedRoots: ['link/src', 'app/src'],
    });

    const result = await run(project, 'link/src');

    expect(result).toMatchObject({ ok: true, projectOwnedRoots: ['app/src'] });
  });

  it('still removes by the canonical spelling when no entry is recorded verbatim', async () => {
    const project = await makeProject({ templates: { '@x/a': entryA }, projectOwnedRoots: ['app/src'] });

    const result = await run(project, './app/src');

    expect(result).toMatchObject({ ok: true, path: 'app/src', projectOwnedRoots: [] });
  });

  it('the refusal quotes a root that carries a space so the printed command can be pasted', async () => {
    const project = await makeProject({ templates: { '@x/a': entryA }, projectOwnedRoots: [] });
    await symlink(path.join(project, 'app'), path.join(project, 'my link'));
    await writeFile(
      path.join(project, '.frontx', 'project.json'),
      JSON.stringify({ formatVersion: 1, templates: { '@x/a': entryA }, projectOwnedRoots: ['my link/src'] }),
      'utf-8',
    );

    const result = await upgradeToOrigin('@x/a', 'origin-b', upgradeDeps(project));

    expect(result).toMatchObject({ ok: false, code: 'PROJECT_INVALID' });
    if (!result.ok) expect(result.message).toContain(`frontx ownership remove 'my link/src'`);
  });

  it('validate --project spells the refusal with the document location like the other engines', async () => {
    const project = await makeProject({ templates: { '@x/a': entryA }, projectOwnedRoots: ['link/src'] });

    const result = await validateProject(project, {
      readProjectStateFn: createFsReadProjectStateFn(),
      canonicalizeFn: createFsCanonicalizeTargetFn(project),
      inventory: { lookup: () => undefined },
      readFileFn: createFsReadFileFn(),
    } as never);

    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain('.frontx/project.json');
  });
});
