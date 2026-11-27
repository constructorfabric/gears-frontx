import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1
//
// R14-1 (retained-ground ruling of 2026-11-06): the SAME template's retained ground must hold even
// when a later target of that template has become an in-project symlink into it
// (equal, descendant or ancestor alias). The resolved location, not the spelling
// of the target, decides; a symlink to unrelated ground stays deletable.
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { readdirSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runApplyPipeline } from '../commands/apply';
import type { ApplyPipelineDeps } from '../commands/apply';
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
  createFsWriteFileFn,
  createFsWriteProjectStateFn,
} from '../adapters/fs-project-io';
import {
  createFsListDiskFilesFn,
  createFsReadDiskEntryFn,
  createFsRenameDiskFileFn,
  createFsUnlinkDiskFileFn,
  createFsWriteDiskFileFn,
} from '../adapters/fs-upgrade-io';
import { createFsReadInstalledContentFn } from '../adapters/fs-existing-content';
import { createFsBundleExistsFn, createFsCopyBundleFn, createFsRemoveBundleFn } from '../adapters/fs-ai-bundle';

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

const writeManifest = (project: string, folder: string, version: string, excludedSubtrees: string[]) =>
  writeFile(
    path.join(project, folder, 'frontx-template.json'),
    JSON.stringify({ name: '@x/b', version, excludedSubtrees, description: 'f' }),
    'utf-8',
  );

// `vendor-b` v1.0.0 declares nothing and ships `b.txt` + `sub/b2.txt`.
async function makeOrigin(project: string, folder: string, version: string, declared: string[], shipsSubFile: boolean) {
  await mkdir(path.join(project, folder, 'sub'), { recursive: true });
  await writeFile(path.join(project, folder, 'b.txt'), `B ${version}`, 'utf-8');
  if (shipsSubFile) await writeFile(path.join(project, folder, 'sub', 'b2.txt'), 'B2', 'utf-8');
  await writeManifest(project, folder, version, declared);
}

async function makeProject(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-own-alias-'));
  const project = path.join(sandbox, 'project');
  await mkdir(path.join(project, '.frontx'), { recursive: true });
  await makeOrigin(project, 'vendor-b', '1.0.0', [], true);
  await writeFile(
    path.join(project, '.frontx', 'project.json'),
    JSON.stringify({ formatVersion: 1, templates: {}, projectOwnedRoots: [] } satisfies ProjectStateDocument),
    'utf-8',
  );
  return project;
}

const readState = async (project: string) =>
  JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;

function register(project: string) {
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

function applyB(project: string, targets: string[], adoptExisting = false) {
  const deps: ApplyPipelineDeps = {
    inventory: noInventory as unknown as ApplyPipelineDeps['inventory'],
    fetchFn: vi.fn(async () => ''),
    readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
    readFileFn: createFsReadFileFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(project),
    existsFn: createFsPathExistsFn(),
    listFolderFilesFn: createFsListDiskFilesFn(),
    resolveInstalledContentPathFn: (name: string) => name,
    readInstalledContentFn: createFsReadInstalledContentFn(project),
    readExistingContentFn: async () => [],
    writeFileFn: createFsWriteFileFn(),
    readProjectStateFn: createFsReadProjectStateFn(),
    writeProjectStateFn: createFsWriteProjectStateFn(),
    bundleExistsFn: createFsBundleExistsFn(),
    copyBundleFn: createFsCopyBundleFn(),
    removeBundleFn: createFsRemoveBundleFn(),
    assertPathWithinRootFn: createFsAssertPathWithinRootFn(project),
    removeProjectFileFn: createFsRemoveProjectFileFn(),
    removeEmptyDirFn: async (absolutePath: string) => {
      try {
        if (readdirSync(absolutePath).length === 0) rmdirSync(absolutePath);
      } catch {
        // already gone
      }
    },
  };
  return runApplyPipeline({ templates: { '@x/b': targets } }, project, adoptExisting, deps);
}

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
    presentPlan: async () => 'approved' as never,
    promoteInventory: async () => {},
    refreshAiBundle: async () => {},
  };
}

const upgradeTo = (project: string, folder: string) => upgradeToOrigin('@x/b', `path:${folder}`, upgradeDeps(project));

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

const plannedDeletes = (result: unknown) => (result as { toDelete: string[] }).toDelete;


async function retainedAfterHostDelete(): Promise<string> {
  const project = await makeProject();
  expect(await register(project)).toMatchObject({ ok: true });
  expect(await applyB(project, ['real'])).toMatchObject({ ok: true });
  await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
  expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
  await mkdir(path.join(project, 'real', 'sub', 'deep'), { recursive: true });
  await writeFile(path.join(project, 'real', 'sub', 'deep', 'd.txt'), 'DEEP', 'utf-8');
  expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
  expect((await readState(project)).templates['@x/b']).toMatchObject({ relinquishedGround: ['real/sub'] });
  // same v2 template applied at an unrelated target, then that directory is
  // replaced by a symlink to `to`
  expect(await applyB(project, ['alias'])).toMatchObject({ ok: true });
  return project;
}

async function swapForSymlink(project: string, to: string) {
  await rm(path.join(project, 'alias'), { recursive: true, force: true });
  await symlink(path.join(project, to), path.join(project, 'alias'));
}

describe('R14-1: own retained ground reached through a symlinked target (real filesystem)', () => {
  it.each([
    ['equal', 'real/sub', ['real/sub/b2.txt', 'real/sub/deep/d.txt']],
    ['descendant', 'real/sub/deep', ['real/sub/deep/d.txt']],
  ])('alias to the retained root (%s) preserves the old files', async (_label, to, files) => {
    const project = await retainedAfterHostDelete();
    await swapForSymlink(project, to);
    const dry = await runDelete(project, 'alias', true);
    expect(dry).toMatchObject({ ok: true });
    expect(plannedDeletes(dry)).toEqual([]);
    expect(await runDelete(project, 'alias', false)).toMatchObject({ ok: true });
    for (const file of files) expect(await readFile(path.join(project, file), 'utf-8')).toMatch(/B2|DEEP/);
  });

  it('alias to an ANCESTOR of the retained root preserves what lies inside it and deletes the rest', async () => {
    const project = await retainedAfterHostDelete();
    await writeFile(path.join(project, 'real', 'extra.txt'), 'X', 'utf-8');
    await swapForSymlink(project, 'real');
    const dry = await runDelete(project, 'alias', true);
    expect(plannedDeletes(dry).some((p) => p.startsWith('alias/sub/'))).toBe(false);
    expect(await runDelete(project, 'alias', false)).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real/sub/b2.txt'), 'utf-8')).toBe('B2');
    expect(await readFile(path.join(project, 'real/sub/deep/d.txt'), 'utf-8')).toBe('DEEP');
  });

  it('negative control: alias to unrelated in-project ground is still deleted normally', async () => {
    const project = await retainedAfterHostDelete();
    await mkdir(path.join(project, 'other'), { recursive: true });
    await writeFile(path.join(project, 'other', 'b.txt'), 'B 2.0.0', 'utf-8');
    await swapForSymlink(project, 'other');
    const dry = await runDelete(project, 'alias', true);
    expect(plannedDeletes(dry)).toEqual(['alias/b.txt']);
  });

  it('valid nesting: a real (non-symlink) target outside the retained root deletes normally', async () => {
    const project = await retainedAfterHostDelete();
    expect(plannedDeletes(await runDelete(project, 'alias', true))).toContain('alias/b.txt');
    expect(await runDelete(project, 'alias', false)).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real/sub/b2.txt'), 'utf-8')).toBe('B2');
  });
});
