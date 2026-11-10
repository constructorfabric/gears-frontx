import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-classify:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// U5 (human ruling V2): a `path:` origin edited in place forgets what it once
// wrote, so the re-resolved BASELINE payload cannot be the witness that an
// upgrade relinquishes written ground. A declaration the candidate adds beyond
// what the entry RECORDED at apply, over a location where the disk holds
// something, marks the entry exactly as a baseline-listed skip does, and the
// mark then spares the old file through later upgrades, a restore, and the
// deletion of a different template nested there. Real filesystem throughout.
//
//
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

const writeManifest = (project: string, folder: string, version: string, excludedSubtrees: string[]) =>
  writeFile(
    path.join(project, folder, 'frontx-template.json'),
    JSON.stringify({ name: '@x/b', version, excludedSubtrees, description: 'f' }),
    'utf-8',
  );

async function makeProject(declared: string[]): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-apply-history-'));
  const project = path.join(sandbox, 'project');
  await mkdir(path.join(project, '.frontx'), { recursive: true });
  for (const folder of ['vendor-b', 'vendor-b2']) await mkdir(path.join(project, folder, 'sub'), { recursive: true });
  for (const folder of ['vendor-b', 'vendor-b2']) {
    await writeFile(path.join(project, folder, 'b.txt'), 'B', 'utf-8');
    await writeFile(path.join(project, folder, 'sub', 'b2.txt'), 'B2', 'utf-8');
  }
  await writeManifest(project, 'vendor-b', '1.0.0', declared);
  await writeManifest(project, 'vendor-b2', '2.0.0', ['sub/']);
  await writeFile(
    path.join(project, '.frontx', 'project.json'),
    JSON.stringify({ formatVersion: 1, templates: {}, projectOwnedRoots: [] } satisfies ProjectStateDocument),
    'utf-8',
  );
  return project;
}

const readState = async (project: string) =>
  JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;

const writeState = (project: string, document: ProjectStateDocument) =>
  writeFile(path.join(project, '.frontx', 'project.json'), JSON.stringify(document), 'utf-8');

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

function applyB(project: string, target: string) {
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
  return runApplyPipeline({ templates: { '@x/b': [target] } }, project, false, deps);
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
    presentPlan: async () => {
      throw new Error('presentPlan must not be reached: the upgrade is refused first');
    },
    promoteInventory: async () => {},
    refreshAiBundle: async () => {},
  };
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

// @x/a is a nested template recorded at `dst`, a link to `<ground>`. It is added
// by hand: the history under test is @x/b's, which only the real commands write.
async function addAliasedGuest(project: string, ground: string): Promise<void> {
  await symlink(path.join(project, ground), path.join(project, 'dst'));
  const document = await readState(project);
  document.templates['@x/a'] = { origin: 'origin-a', version: '1.0.0', targets: ['dst'], excludedSubtrees: [] };
  await writeState(project, document);
}

async function expectGuestDeleteSparesOwner(project: string, ownerFile: string) {
  const dry = await runDelete(project, 'dst', true);
  expect(dry).toMatchObject({ ok: true });
  expect((dry as unknown as { toDelete: string[] }).toDelete).toEqual([]);
  await runDelete(project, 'dst', false);
  expect(await readFile(path.join(project, ownerFile), 'utf-8')).toBe('B2');
}


// A chain of immutable origins: `vendor-b<n>` carries version `<n>.0.0`.
async function makeOrigin(project: string, folder: string, version: string, declared: string[], shipsSubFile: boolean) {
  await mkdir(path.join(project, folder, 'sub'), { recursive: true });
  await writeFile(path.join(project, folder, 'b.txt'), `B ${version}`, 'utf-8');
  if (shipsSubFile) await writeFile(path.join(project, folder, 'sub', 'b2.txt'), 'B2', 'utf-8');
  await writeManifest(project, folder, version, declared);
}

const approve = (project: string) => ({ ...upgradeDeps(project), presentPlan: async () => 'approved' as never });

async function upgradeTo(project: string, folder: string) {
  return upgradeToOrigin('@x/b', `path:${folder}`, approve(project));
}

// A hand-recorded guest owning `real/sub` itself, the lexical form of the delete.
async function addLexicalGuest(project: string, target: string): Promise<void> {
  const document = await readState(project);
  document.templates['@x/a'] = { origin: 'origin-a', version: '1.0.0', targets: [target], excludedSubtrees: [] };
  await writeState(project, document);
}


async function expectLexicalGuestDeleteSparesOwner(project: string, target: string, ownerFile: string) {
  const dry = await runDelete(project, target, true);
  expect(dry).toMatchObject({ ok: true });
  expect((dry as unknown as { toDelete: string[] }).toDelete).not.toContain(ownerFile);
  await runDelete(project, target, false);
  expect(await readFile(path.join(project, ownerFile), 'utf-8')).toBe('B2');
}

// vendor-b is edited IN PLACE after apply: the file it wrote is gone from the
// folder (and the manifest optionally changes), the version string unchanged,
// so `VERSION_MISMATCH` does not fire and the baseline no longer lists the file.
async function editOriginInPlace(project: string, declared: string[]) {
  await rm(path.join(project, 'vendor-b', 'sub', 'b2.txt'));
  await writeManifest(project, 'vendor-b', '1.0.0', declared);
}

async function appliedHost(declared: string[] = []): Promise<string> {
  const project = await makeProject(declared);
  expect(await register(project)).toMatchObject({ ok: true });
  expect(await applyB(project, 'real')).toMatchObject({ ok: true });
  expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  return project;
}

describe('U5: an origin edited in place no longer vouches for what it wrote (real filesystem)', () => {
  it('file removed from the origin, candidate excludes its folder: marked, and alias + lexical guest deletes spare it', async () => {
    const project = await appliedHost();
    await editOriginInPlace(project, []);
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ version: '2.0.0', exclusionsBackfilled: true });
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
    await addAliasedGuest(project, 'real/sub');
    await expectGuestDeleteSparesOwner(project, 'real/sub/b2.txt');
  });

  it('the lexical form of the guest delete spares it too', async () => {
    const project = await appliedHost();
    await editOriginInPlace(project, []);
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    await addLexicalGuest(project, 'real/sub');
    await expectLexicalGuestDeleteSparesOwner(project, 'real/sub', 'real/sub/b2.txt');
  });

  it('the edit also moved the BASELINE manifest to declare the folder: recorded-at-apply still wins, marked', async () => {
    const project = await appliedHost();
    await editOriginInPlace(project, ['sub/']);
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
    await addAliasedGuest(project, 'real/sub');
    await expectGuestDeleteSparesOwner(project, 'real/sub/b2.txt');
  });

  it('the protection survives the NEXT upgrades (whose own skip lists are empty) and a restore', async () => {
    const project = await appliedHost();
    await editOriginInPlace(project, []);
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    await makeOrigin(project, 'vendor-b3', '3.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect(await upgradeTo(project, 'vendor-b3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ version: '3.0.0', exclusionsBackfilled: true });
    expect(await restorePreceding('@x/b', approve(project))).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ version: '2.0.0', exclusionsBackfilled: true });
    await addAliasedGuest(project, 'real/sub');
    await expectGuestDeleteSparesOwner(project, 'real/sub/b2.txt');
  });

  it('after the edit-and-upgrade, an upgrade into an aliased guest folder is still refused with the tree unchanged', async () => {
    const project = await appliedHost();
    await editOriginInPlace(project, []);
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    await addAliasedGuest(project, 'real/sub');
    await makeOrigin(project, 'vendor-b3', '3.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b3')).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
    expect((await readState(project)).templates['@x/b']?.version).toBe('2.0.0');
  });

  it('the user already removed the file: nothing on disk under the folder, so nothing is marked and nesting stays normal', async () => {
    const project = await appliedHost();
    await editOriginInPlace(project, []);
    await rm(path.join(project, 'real', 'sub'), { recursive: true });
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host.exclusionsBackfilled).toBeUndefined();
    expect(host.excludedSubtrees).toEqual(['sub/']);
    // A guest that later nests there owns its files and deletes them normally.
    await mkdir(path.join(project, 'real', 'sub'), { recursive: true });
    await writeFile(path.join(project, 'real', 'sub', 'g.txt'), 'G', 'utf-8');
    await addLexicalGuest(project, 'real/sub');
    const dry = await runDelete(project, 'real/sub', true);
    expect((dry as unknown as { toDelete: string[] }).toDelete).toContain('real/sub/g.txt');
    await runDelete(project, 'real/sub', false);
    await expect(readFile(path.join(project, 'real', 'sub', 'g.txt'), 'utf-8')).rejects.toThrow();
  });
});

describe('pre-existing states and clean evolutions stay unmarked (real filesystem)', () => {
  it('an entry that recorded the folder as excluded at apply never gains a mark through later upgrades', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real')).toMatchObject({ ok: true });
    await mkdir(path.join(project, 'real', 'sub'), { recursive: true });
    await writeFile(path.join(project, 'real', 'sub', 'g.txt'), 'G', 'utf-8');
    for (const version of [2, 3]) {
      await makeOrigin(project, `vendor-b${version}`, `${version}.0.0`, ['sub/'], false);
      expect(await upgradeTo(project, `vendor-b${version}`)).toMatchObject({ ok: true });
    }
    expect((await readState(project)).templates['@x/b'].exclusionsBackfilled).toBeUndefined();
    await addLexicalGuest(project, 'real/sub');
    const dry = await runDelete(project, 'real/sub', true);
    expect((dry as unknown as { toDelete: string[] }).toDelete).toContain('real/sub/g.txt');
  });

  it('a newly declared exclusion over ground the disk does not hold is not marked, across upgrades', async () => {
    const project = await appliedHost();
    await editOriginInPlace(project, []);
    await rm(path.join(project, 'real', 'sub'), { recursive: true });
    for (const version of [2, 3]) {
      await makeOrigin(project, `vendor-b${version}`, `${version}.0.0`, ['sub/'], false);
      expect(await upgradeTo(project, `vendor-b${version}`)).toMatchObject({ ok: true });
    }
    expect((await readState(project)).templates['@x/b'].exclusionsBackfilled).toBeUndefined();
  });

  it('known conservative false positive: an EMPTY directory at the newly excluded location is treated as possibly written ground', async () => {
    const project = await appliedHost();
    await rm(path.join(project, 'real', 'sub', 'b2.txt'));
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
  });

  it('a symlink standing at the newly excluded location is treated as unprovable without being read through', async () => {
    const project = await appliedHost();
    await rm(path.join(project, 'real', 'sub'), { recursive: true });
    await writeFile(path.join(sandbox as string, 'outside.txt'), 'OUT', 'utf-8');
    await symlink(path.join(sandbox as string, 'outside.txt'), path.join(project, 'real', 'sub'));
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    const outcome = await upgradeTo(project, 'vendor-b2');
    expect(outcome).toMatchObject({ ok: true });
    expect(await readFile(path.join(sandbox as string, 'outside.txt'), 'utf-8')).toBe('OUT');
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
  });
});
