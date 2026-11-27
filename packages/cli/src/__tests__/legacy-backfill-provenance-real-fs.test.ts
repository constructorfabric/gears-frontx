import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-algo:cpt-frontx-algo-composed-provenance-register:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
//
// A legacy entry (no recorded `excludedSubtrees`) that already has applied
// targets must not turn into proof of what it declared when it wrote them just
// because the CLI's own no-op repair copied the CURRENT manifest's declaration
// in. Real filesystem, end to end: legacy entry -> no-op backfill (`upgrade`
// and `register`) -> `delete` of another template whose aliased target sits
// inside the legacy owner's ground. The owner's file must survive.
import path from 'node:path';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteTarget } from '../commands/delete';
import type { DeleteCommandFlags } from '../commands/delete';
import { registerTemplate } from '../commands/register';
import type { RegisterInventoryPort } from '../commands/register';
import { upgradeToOrigin } from '../upgrade/flow';
import type { UpgradeEngineDeps } from '../upgrade/flow';
import { createResolvePayloadFn } from '../upgrade/payload';
import type { ProjectStateDocument } from '../project-state/types';
import type { DeletePlanInventoryPort } from '../scaffold/delete-plan';
import {
  createFsAssertPathWithinRootFn,
  createFsCanonicalizeTargetFn,
  createFsListTargetFilesFn,
  createFsListUnenumerableTargetEntriesFn,
  createFsPathExistsFn,
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

const noInventory: RegisterInventoryPort & DeletePlanInventoryPort = {
  lookup: () => undefined,
  install: vi.fn(async () => ({
    ok: false as const,
    error: { code: 'ORIGIN_UNAVAILABLE' as const, message: 'install not stubbed' },
  })),
};

// @x/b owns `real` and wrote `real/sub/b2.txt` back when it declared nothing.
// Its manifest was edited afterwards to declare `sub/`. @x/a's recorded `dst`
// is a link to `real/sub`. `legacy` removes the recorded field from @x/b.
async function makeProject(bTargets: string[]): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-backfill-provenance-'));
  const project = path.join(sandbox, 'project');
  await mkdir(path.join(project, '.frontx'), { recursive: true });
  await mkdir(path.join(project, 'vendor-b'), { recursive: true });
  await writeFile(
    path.join(project, 'vendor-b', 'frontx-template.json'),
    JSON.stringify({ name: '@x/b', version: '1.0.0', excludedSubtrees: ['sub/'], description: 'f' }),
    'utf-8',
  );
  await mkdir(path.join(project, 'real', 'sub'), { recursive: true });
  await writeFile(path.join(project, 'real', 'b.txt'), 'B', 'utf-8');
  await writeFile(path.join(project, 'real', 'sub', 'b2.txt'), 'B2', 'utf-8');
  await symlink(path.join(project, 'real', 'sub'), path.join(project, 'dst'));
  const document: ProjectStateDocument = {
    formatVersion: 1,
    templates: {
      '@x/a': { origin: 'origin-a', version: '1.0.0', targets: ['dst'], excludedSubtrees: [] },
      '@x/b': { origin: 'path:vendor-b', version: '1.0.0', targets: bTargets },
    },
    projectOwnedRoots: [],
  };
  await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify(document), 'utf-8');
  return project;
}

const readState = async (project: string) =>
  JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;

function upgradeDeps(repoRoot: string): UpgradeEngineDeps {
  return {
    repoRoot,
    readProjectStateFn: createFsReadProjectStateFn(),
    writeProjectStateFn: createFsWriteProjectStateFn(),
    resolvePayload: createResolvePayloadFn({
      repoRoot,
      fetchFn: vi.fn(async () => ''),
      readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
      readFileFn: createFsReadFileFn(),
      listDiskFiles: createFsListDiskFilesFn(),
      existsFn: createFsPathExistsFn(),
      canonicalizeFn: createFsCanonicalizeTargetFn(repoRoot),
    }),
    resolveRegisteredExclusions: async () => [],
    readDiskEntry: createFsReadDiskEntryFn(repoRoot),
    writeDiskFile: createFsWriteDiskFileFn(repoRoot),
    renameDiskFile: createFsRenameDiskFileFn(repoRoot),
    unlinkDiskFile: createFsUnlinkDiskFileFn(repoRoot),
    listDiskFiles: createFsListDiskFilesFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(repoRoot),
    presentPlan: async () => {
      throw new Error('presentPlan must not be called for an idempotent no-op');
    },
    promoteInventory: async () => {},
    refreshAiBundle: async () => {},
  };
}

function registerSame(project: string) {
  return registerTemplate(
    'path:vendor-b',
    false,
    project,
    noInventory,
    vi.fn(async () => ''),
    createFsReadFolderFileBinaryFn(),
    createFsCanonicalizeTargetFn(project),
    createFsReadProjectStateFn(),
    createFsWriteProjectStateFn(),
    createFsPathExistsFn(),
    createFsListDiskFilesFn(),
  );
}

async function runDelete(project: string, target: string, dryRun: boolean) {
  const invoke = (flags: DeleteCommandFlags) =>
    deleteTarget(
      target,
      project,
      flags,
      noInventory,
      createFsCanonicalizeTargetFn(project),
      createFsListTargetFilesFn(),
      createFsListUnenumerableTargetEntriesFn(),
      createFsReadFileFn(),
      createFsRemoveProjectFileFn(),
      createFsAssertPathWithinRootFn(project),
      createFsReadProjectStateFn(),
      createFsWriteProjectStateFn(),
      async () => 'confirmed',
    );
  if (dryRun) return invoke({ jsonMode: true, dryRun: true, yes: false });
  // The confirming call is bound to the reviewed plan: review first, then state its digest.
  const review = await invoke({ jsonMode: true, dryRun: false, yes: false });
  if (review.ok || review.code !== 'CONFIRMATION_REQUIRED') return review;
  return invoke({ jsonMode: true, dryRun: false, yes: true, expectedPlanDigest: String(review.details?.planDigest) });
}

async function expectGuestDeleteSparesOwner(project: string) {
  const dry = await runDelete(project, 'dst', true);
  expect(dry).toMatchObject({ ok: true });
  expect((dry as unknown as { toDelete: string[] }).toDelete).toEqual([]);
  await runDelete(project, 'dst', false);
  expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  expect(await readFile(path.join(project, 'real', 'b.txt'), 'utf-8')).toBe('B');
}

describe('a backfilled legacy exclusion is not evidence of what the owner wrote (real filesystem)', () => {
  it('upgrade no-op backfill, then delete of the aliased inner target: the owner\'s file survives', async () => {
    const project = await makeProject(['real']);

    const upgraded = await upgradeToOrigin('@x/b', 'path:vendor-b', upgradeDeps(project));
    expect(upgraded).toMatchObject({ ok: true, outcome: 'noop' });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ excludedSubtrees: ['sub/'], exclusionsBackfilled: true });

    await expectGuestDeleteSparesOwner(project);
  });

  it('register no-op backfill, then delete of the aliased inner target: the owner\'s file survives', async () => {
    const project = await makeProject(['real']);

    const registered = await registerSame(project);
    expect(registered).toMatchObject({ ok: true, outcome: 'recorded' });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ excludedSubtrees: ['sub/'], exclusionsBackfilled: true });

    await expectGuestDeleteSparesOwner(project);
  });

  it('an entry that never had applied targets records an authentic value, unmarked, and nothing is held back', async () => {
    const project = await makeProject([]);

    expect(await registerSame(project)).toMatchObject({ ok: true, outcome: 'recorded' });

    const entry = (await readState(project)).templates['@x/b'];
    expect(entry.excludedSubtrees).toEqual(['sub/']);
    expect(entry.exclusionsBackfilled).toBeUndefined();
  });

  it('an entry that carries an authentic recorded declaration is untouched by a same-origin register or upgrade', async () => {
    const project = await makeProject(['real']);
    const state = await readState(project);
    state.templates['@x/b'] = { ...state.templates['@x/b'], excludedSubtrees: [] };
    await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify(state), 'utf-8');
    const before = await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8');

    expect(await registerSame(project)).toMatchObject({ ok: true, outcome: 'noop' });
    expect(await upgradeToOrigin('@x/b', 'path:vendor-b', upgradeDeps(project))).toMatchObject({ ok: true, outcome: 'noop' });

    expect(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')).toBe(before);
    await expectGuestDeleteSparesOwner(project);
  });

  it('a recorded and current declaration that both exist from the start still carve the ground out for the guest', async () => {
    const project = await makeProject(['real']);
    const state = await readState(project);
    state.templates['@x/b'] = { ...state.templates['@x/b'], excludedSubtrees: ['sub/'] };
    await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify(state), 'utf-8');

    const dry = await runDelete(project, 'dst', true);

    expect((dry as unknown as { toDelete: string[] }).toDelete).toEqual(['dst/b2.txt']);
    await runDelete(project, 'dst', false);
    await expect(lstat(path.join(project, 'real', 'sub', 'b2.txt'))).rejects.toThrow();
    expect(await readFile(path.join(project, 'real', 'b.txt'), 'utf-8')).toBe('B');
  });

  it('a non-true marker makes the document PROJECT_INVALID instead of being coerced', async () => {
    const project = await makeProject(['real']);
    const state = await readState(project);
    (state.templates['@x/b'] as unknown as Record<string, unknown>).exclusionsBackfilled = 'yes';
    await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify(state), 'utf-8');

    const result = await runDelete(project, 'dst', true);

    expect(result).toMatchObject({ ok: false, code: 'PROJECT_INVALID' });
  });
});
