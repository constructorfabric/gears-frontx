import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-apply:p1
//
// R11-1 (human ruling V2): the LOCATION of an old file left in ground a template
// relinquished must outlive the declaration that named it. The marker alone does
// not carry it: an upgrade that narrows the declaration back to `[]` overwrites
// the only record of `sub/`, and a host deleted afterwards (or a guest deleted
// after that) would remove the file. The marked entry therefore records the roots
// at the moment it is marked (`TemplateEntry.relinquishedGround`), and the host's
// own delete honours them. Every row is the real command functions on a real
// filesystem; the guest is admitted by the real `apply`, not written into state.
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
import { unregisterTemplate } from '../commands/unregister';
import { ownershipAdd, ownershipRemove } from '../commands/ownership';
import { createFsReadTargetPathStateFn } from '../adapters/fs-target-path';
import { createFsReadExistingContentFn } from '../adapters/fs-existing-content';
import { restorePreceding, upgradeToOrigin } from '../upgrade/flow';
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

const OWNER_FILE = 'real/sub/b2.txt';

const manifest = (name: string, version: string, excludedSubtrees: string[]) =>
  JSON.stringify({ name, version, excludedSubtrees, description: 'f' });

// `vendor-b` ships `b.txt` + `sub/b2.txt`; the optional extra versions never ship b2.
async function makeBOrigin(project: string, folder: string, version: string, declared: string[], shipsSubFile: boolean) {
  await mkdir(path.join(project, folder, 'sub'), { recursive: true });
  await writeFile(path.join(project, folder, 'b.txt'), `B ${version}`, 'utf-8');
  if (shipsSubFile) await writeFile(path.join(project, folder, 'sub', 'b2.txt'), 'B2', 'utf-8');
  await writeFile(path.join(project, folder, 'frontx-template.json'), manifest('@x/b', version, declared), 'utf-8');
}

async function makeProject(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-narrowing-'));
  const project = path.join(sandbox, 'project');
  await mkdir(path.join(project, '.frontx'), { recursive: true });
  await makeBOrigin(project, 'vendor-b', '1.0.0', [], true);
  await mkdir(path.join(project, 'vendor-a'), { recursive: true });
  await writeFile(path.join(project, 'vendor-a', 'a.txt'), 'A', 'utf-8');
  await writeFile(path.join(project, 'vendor-a', 'frontx-template.json'), manifest('@x/a', '1.0.0', []), 'utf-8');
  await writeFile(
    path.join(project, '.frontx', 'project.json'),
    JSON.stringify({ formatVersion: 1, templates: {}, projectOwnedRoots: [] } satisfies ProjectStateDocument),
    'utf-8',
  );
  return project;
}

const readState = async (project: string) =>
  JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;

const exists = (file: string) =>
  readFile(file, 'utf-8').then(
    () => true,
    () => false,
  );

function register(project: string, folder: string) {
  return registerTemplate(
    `path:${folder}`,
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

function applyTemplate(project: string, name: string, targets: string[], adoptExisting = false) {
  const deps: ApplyPipelineDeps = {
    inventory: noInventory as unknown as ApplyPipelineDeps['inventory'],
    fetchFn: vi.fn(async () => ''),
    readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
    readFileFn: createFsReadFileFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(project),
    existsFn: createFsPathExistsFn(),
    listFolderFilesFn: createFsListDiskFilesFn(),
    resolveInstalledContentPathFn: (installed: string) => installed,
    readInstalledContentFn: createFsReadInstalledContentFn(project),
    readExistingContentFn: createFsReadExistingContentFn(project),
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
  return runApplyPipeline({ templates: { [name]: targets } }, project, adoptExisting, deps);
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

const upgradeB = (project: string, folder: string) => upgradeToOrigin('@x/b', `path:${folder}`, upgradeDeps(project));

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

const planned = (result: unknown) => result as { toDelete: string[]; toPreserve: string[] };

const addOwnedRoot = (project: string, target: string) =>
  ownershipAdd(
    target,
    project,
    noInventory as never,
    createFsReadTargetPathStateFn(),
    createFsCanonicalizeTargetFn(project),
    createFsReadProjectStateFn(),
    createFsWriteProjectStateFn(),
    createFsReadFileFn(),
  );

const removeOwnedRoot = (project: string, target: string) =>
  ownershipRemove(
    target,
    project,
    createFsCanonicalizeTargetFn(project),
    createFsReadProjectStateFn(),
    createFsWriteProjectStateFn(),
  );

// v1 `[]` applied at `targets`; v2 declares `sub/` and ships no b2 (marks, b2 skipped);
// v3 narrows back to `[]` (the recorded declaration no longer names `sub/`).
async function narrowedHost(targets: string[] = ['real']): Promise<string> {
  const project = await makeProject();
  expect(await register(project, 'vendor-b')).toMatchObject({ ok: true });
  expect(await applyTemplate(project, '@x/b', targets)).toMatchObject({ ok: true });
  await makeBOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
  expect(await upgradeB(project, 'vendor-b2')).toMatchObject({ ok: true });
  expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
  await makeBOrigin(project, 'vendor-b3', '3.0.0', [], false);
  expect(await upgradeB(project, 'vendor-b3')).toMatchObject({ ok: true });
  const host = (await readState(project)).templates['@x/b'];
  expect(host).toMatchObject({ version: '3.0.0', excludedSubtrees: [], exclusionsBackfilled: true });
  expect(host.relinquishedGround).toEqual(targets.map((t) => `${t}/sub`).sort());
  for (const target of targets) expect(await exists(path.join(project, target, 'sub', 'b2.txt'))).toBe(true);
  return project;
}

async function admitGuest(project: string, target: string, adoptExisting = true) {
  expect(await register(project, 'vendor-a')).toMatchObject({ ok: true });
  expect(await applyTemplate(project, '@x/a', [target], adoptExisting)).toMatchObject({ ok: true });
  expect(await exists(path.join(project, target, 'a.txt'))).toBe(true);
}

describe('R11-1: narrowing the exclusion keeps the location of the relinquished file (real filesystem)', () => {
  it('the exact live sequence: v1 -> v2 -> v3, host delete with an independent root, ownership removed, guest applied by the CLI, guest deleted', async () => {
    const project = await narrowedHost();
    expect(await addOwnedRoot(project, 'real/sub')).toMatchObject({ ok: true });
    const hostPlan = planned(await runDelete(project, 'real', true));
    expect(hostPlan.toDelete).toEqual(['real/b.txt']);
    expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host).toMatchObject({ targets: [], exclusionsBackfilled: true, relinquishedGround: ['real/sub'] });
    expect(await removeOwnedRoot(project, 'real/sub')).toMatchObject({ ok: true });
    await admitGuest(project, 'real/sub');
    const guestPlan = planned(await runDelete(project, 'real/sub', true));
    expect(guestPlan.toDelete).not.toContain(OWNER_FILE);
    expect(await runDelete(project, 'real/sub', false)).toMatchObject({ ok: true });
    expect(await exists(path.join(project, OWNER_FILE))).toBe(true);
  });

  it('no independent protection: deleting the host itself after the narrowing spares the file', async () => {
    const project = await narrowedHost();
    const plan = planned(await runDelete(project, 'real', true));
    expect(plan.toDelete).toEqual(['real/b.txt']);
    expect(plan.toPreserve).toContain('real/sub');
    expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
    expect(await exists(path.join(project, OWNER_FILE))).toBe(true);
    expect(await exists(path.join(project, 'real', 'b.txt'))).toBe(false);
  });

  it('the guest is admitted by the real apply BEFORE the host target goes (v1->v2 live guest), then both deleted', async () => {
    const project = await makeProject();
    expect(await register(project, 'vendor-b')).toMatchObject({ ok: true });
    expect(await applyTemplate(project, '@x/b', ['real'])).toMatchObject({ ok: true });
    await makeBOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeB(project, 'vendor-b2')).toMatchObject({ ok: true });
    await admitGuest(project, 'real/sub');
    expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
    expect(await runDelete(project, 'real/sub', false)).toMatchObject({ ok: true });
    expect(await exists(path.join(project, OWNER_FILE))).toBe(true);
  });

  it('a symlink alias guest after the host delete: spared', async () => {
    const project = await narrowedHost();
    expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
    await symlink(path.join(project, 'real', 'sub'), path.join(project, 'dst'));
    await admitGuest(project, 'dst');
    const plan = planned(await runDelete(project, 'dst', true));
    expect(plan.toDelete).not.toContain(OWNER_FILE);
    expect(plan.toDelete).not.toContain('dst/b2.txt');
    expect(await runDelete(project, 'dst', false)).toMatchObject({ ok: true });
    expect(await exists(path.join(project, OWNER_FILE))).toBe(true);
  });

  it('multi-target: each target keeps its own root through the narrowing, one delete does not release the other', async () => {
    const project = await narrowedHost(['real', 'real2']);
    expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b'].relinquishedGround).toEqual(['real/sub', 'real2/sub']);
    expect(planned(await runDelete(project, 'real2', true)).toDelete).toEqual(['real2/b.txt']);
    expect(await runDelete(project, 'real2', false)).toMatchObject({ ok: true });
    expect(await exists(path.join(project, 'real', 'sub', 'b2.txt'))).toBe(true);
    expect(await exists(path.join(project, 'real2', 'sub', 'b2.txt'))).toBe(true);
  });

  it('mutable origin edited in place (manifest changes to `sub/`, b2 gone) then narrowed: the location survives, a CLI-applied guest is spared', async () => {
    const project = await makeProject();
    expect(await register(project, 'vendor-b')).toMatchObject({ ok: true });
    expect(await applyTemplate(project, '@x/b', ['real'])).toMatchObject({ ok: true });
    // The SAME origin folder is edited: the baseline no longer lists b2 and the manifest now declares `sub/`.
    await rm(path.join(project, 'vendor-b', 'sub', 'b2.txt'));
    await writeFile(path.join(project, 'vendor-b', 'frontx-template.json'), manifest('@x/b', '1.0.0', ['sub/']), 'utf-8');
    await makeBOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeB(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({
      exclusionsBackfilled: true,
      relinquishedGround: ['real/sub'],
    });
    await makeBOrigin(project, 'vendor-b3', '3.0.0', [], false);
    expect(await upgradeB(project, 'vendor-b3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({
      excludedSubtrees: [],
      relinquishedGround: ['real/sub'],
    });
    expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
    await admitGuest(project, 'real/sub');
    expect(planned(await runDelete(project, 'real/sub', true)).toDelete).not.toContain(OWNER_FILE);
    expect(await runDelete(project, 'real/sub', false)).toMatchObject({ ok: true });
    expect(await exists(path.join(project, OWNER_FILE))).toBe(true);
  });
});

describe('R11-1: the roots are never erased by the other lifecycle commands (real filesystem)', () => {
  it('restore after the narrowing keeps them', async () => {
    const project = await narrowedHost();
    expect(await restorePreceding('@x/b', upgradeDeps(project))).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host).toMatchObject({ version: '2.0.0', exclusionsBackfilled: true });
    expect(host.relinquishedGround).toEqual(['real/sub']);
  });

  it('a later upgrade that narrows again, and an apply of a further target, only add to them', async () => {
    const project = await narrowedHost();
    expect(await applyTemplate(project, '@x/b', ['real2'])).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b'].relinquishedGround).toEqual(['real/sub']);
    await makeBOrigin(project, 'vendor-b4', '4.0.0', ['other/'], false);
    expect(await upgradeB(project, 'vendor-b4')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b'].relinquishedGround).toEqual([
      'real/other',
      'real/sub',
      'real2/other',
    ]);
  });

  it('unregister reconciles: the entry and its roots are gone, the guest delete then sees only its own ground', async () => {
    const project = await narrowedHost();
    expect(await runDelete(project, 'real', false)).toMatchObject({ ok: true });
    expect(
      await unregisterTemplate('@x/b', project, createFsReadProjectStateFn(), createFsWriteProjectStateFn()),
    ).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toBeUndefined();
    await admitGuest(project, 'real/sub');
    expect(planned(await runDelete(project, 'real/sub', true)).toDelete).toContain(OWNER_FILE);
  });

  it('an unmarked host never records roots', async () => {
    const project = await makeProject();
    await writeFile(path.join(project, 'vendor-b', 'frontx-template.json'), manifest('@x/b', '1.0.0', ['sub/']), 'utf-8');
    expect(await register(project, 'vendor-b')).toMatchObject({ ok: true });
    expect(await applyTemplate(project, '@x/b', ['real'])).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b'].relinquishedGround).toBeUndefined();
  });

  it('known limitation: a marked entry written before the field, whose declaration was already narrowed to `[]`, has no location to reconstruct', async () => {
    const project = await narrowedHost();
    const document = await readState(project);
    delete document.templates['@x/b'].relinquishedGround;
    await writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify(document), 'utf-8');
    // Documented limitation: with the declaration already `[]` and no root recorded, the location is unknown.
    const plan = planned(await runDelete(project, 'real', true));
    expect(plan.toDelete).toContain(OWNER_FILE);
  });
});
