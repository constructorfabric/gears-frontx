import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
//
// Human ruling V2: an old file left in a subtree its original template later
// relinquished stays protected through successive upgrades and through the
// deletion of a different template that occupies that subtree. The
// `exclusionsBackfilled` mark an upgrade sets is STICKY, and only a file the
// BASELINE payload itself wrote can set it (never a path only the candidate
// ships). Real filesystem, consecutive real upgrades, then a nested/alias delete.
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

describe('the mark an upgrade sets survives every later upgrade (human ruling V2, real filesystem)', () => {
  // v1 `[]` writes real/sub/b2.txt; v2..v4 declare sub/ and never ship that file,
  // so from v3 on neither payload lists it and the skip list is empty.
  async function chain(upTo: number): Promise<string> {
    const project = await makeProject([]);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real')).toMatchObject({ ok: true });
    for (let version = 2; version <= upTo; version += 1) {
      await makeOrigin(project, `vendor-b${version}`, `${version}.0.0`, ['sub/'], false);
      expect(await upgradeTo(project, `vendor-b${version}`)).toMatchObject({ ok: true });
      expect((await readState(project)).templates['@x/b']).toMatchObject({
        version: `${version}.0.0`,
        exclusionsBackfilled: true,
      });
    }
    return project;
  }

  it('three consecutive upgrades keep the mark; an alias guest delete spares the relinquished file', async () => {
    const project = await chain(4);
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
    await addAliasedGuest(project, 'real/sub');
    await expectGuestDeleteSparesOwner(project, 'real/sub/b2.txt');
  });

  it('three consecutive upgrades keep the mark; a lexical guest delete spares the relinquished file', async () => {
    const project = await chain(4);
    await addLexicalGuest(project, 'real/sub');
    await expectLexicalGuestDeleteSparesOwner(project, 'real/sub', 'real/sub/b2.txt');
  });

  it('after the file left both payloads the alias upgrade is still refused, tree unchanged', async () => {
    const project = await chain(3);
    await addAliasedGuest(project, 'real/sub');
    await makeOrigin(project, 'vendor-b4', '4.0.0', ['sub/'], false);
    const before = await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8');
    expect(await upgradeTo(project, 'vendor-b4')).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe(before);
    expect((await readState(project)).templates['@x/b']?.version).toBe('3.0.0');
  });

  it('a mark set at apply on a multi-target history survives an upgrade whose skip list is empty', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real1')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', []);
    expect(await applyB(project, 'real2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
    // The origin is then edited in place: the file is gone from the baseline and
    // the manifest declares sub/, so the upgrade has nothing to skip.
    await rm(path.join(project, 'vendor-b', 'sub', 'b2.txt'));
    await writeManifest(project, 'vendor-b', '1.0.0', ['sub/']);
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });

    expect((await readState(project)).templates['@x/b']).toMatchObject({ version: '2.0.0', exclusionsBackfilled: true });
    expect(await readFile(path.join(project, 'real2', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
    await addAliasedGuest(project, 'real2/sub');
    await expectGuestDeleteSparesOwner(project, 'real2/sub/b2.txt');
  });

  it('the mark is cleared only by reconciling the entry: every target deleted, then a fresh apply', async () => {
    const project = await chain(3);
    await runDelete(project, 'real', false);
    expect((await readState(project)).templates['@x/b'].targets).toEqual([]);
    expect(await applyB(project, 'real3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b'].exclusionsBackfilled).toBeUndefined();
  });
});

describe('valid nesting is not marked, however many upgrades follow (real filesystem)', () => {
  const GUEST_FILE = 'app/src/plugins/g.txt';

  async function nestedHost(): Promise<string> {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-sticky-nest-'));
    const project = path.join(sandbox, 'project');
    await mkdir(path.join(project, '.frontx'), { recursive: true });
    await mkdir(path.join(project, 'vendor-b', 'src', 'plugins'), { recursive: true });
    await writeFile(path.join(project, 'vendor-b', 'index.txt'), 'index 1.0.0', 'utf-8');
    await writeManifest(project, 'vendor-b', '1.0.0', ['src/plugins/']);
    await writeFile(
      path.join(project, '.frontx', 'project.json'),
      JSON.stringify({ formatVersion: 1, templates: {}, projectOwnedRoots: [] } satisfies ProjectStateDocument),
      'utf-8',
    );
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'app')).toMatchObject({ ok: true });
    await mkdir(path.join(project, 'app', 'src', 'plugins'), { recursive: true });
    await writeFile(path.join(project, GUEST_FILE), 'G', 'utf-8');
    const document = await readState(project);
    document.templates['@x/a'] = { origin: 'origin-a', version: '1.0.0', targets: ['app/src/plugins'], excludedSubtrees: [] };
    await writeState(project, document);
    return project;
  }

  async function makeNestedOrigin(project: string, folder: string, version: string, declared: string[], extra: string[]) {
    await mkdir(path.join(project, folder, 'src', 'plugins'), { recursive: true });
    await writeFile(path.join(project, folder, 'index.txt'), `index ${version}`, 'utf-8');
    for (const relative of extra) {
      await mkdir(path.dirname(path.join(project, folder, relative)), { recursive: true });
      await writeFile(path.join(project, folder, relative), 'x', 'utf-8');
    }
    await writeManifest(project, folder, version, declared);
  }

  async function expectGuestDeleteRemovesItsFile(project: string) {
    const dry = await runDelete(project, 'app/src/plugins', true);
    expect((dry as unknown as { toDelete: string[] }).toDelete).toContain(GUEST_FILE);
    expect(await runDelete(project, 'app/src/plugins', false)).toMatchObject({ ok: true });
    await expect(readFile(path.join(project, GUEST_FILE), 'utf-8')).rejects.toThrow();
  }

  it('a file only the candidate ships under a newly declared exclusion does not mark the host (r9 V1)', async () => {
    const project = await nestedHost();
    await makeNestedOrigin(project, 'vendor-b2', '2.0.0', ['src/plugins/', 'new-exclusion/'], ['new-exclusion/new.txt']);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host).toMatchObject({ version: '2.0.0', excludedSubtrees: ['src/plugins/', 'new-exclusion/'] });
    expect(host.exclusionsBackfilled).toBeUndefined();
    // The candidate's file was skipped, never written.
    await expect(readFile(path.join(project, 'app', 'new-exclusion', 'new.txt'), 'utf-8')).rejects.toThrow();
    await expectGuestDeleteRemovesItsFile(project);
  });

  it('candidate-only skips across consecutive upgrades never mark', async () => {
    const project = await nestedHost();
    await makeNestedOrigin(project, 'vendor-b2', '2.0.0', ['src/plugins/', 'new-exclusion/'], ['new-exclusion/new.txt']);
    await makeNestedOrigin(project, 'vendor-b3', '3.0.0', ['src/plugins/', 'new-exclusion/'], ['new-exclusion/new.txt']);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect(await upgradeTo(project, 'vendor-b3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b'].exclusionsBackfilled).toBeUndefined();
    await expectGuestDeleteRemovesItsFile(project);
  });

  it('a baseline file already on disk that the candidate excludes marks, and the guest delete then spares it', async () => {
    const project = await nestedHost();
    await makeNestedOrigin(project, 'vendor-b2', '2.0.0', ['src/plugins/', 'docs/'], []);
    // The baseline wrote `docs/guide.txt` under the recorded declaration; v2 relinquishes `docs/`.
    await makeNestedOrigin(project, 'vendor-b0', '1.0.0', ['src/plugins/'], ['docs/guide.txt']);
    const document = await readState(project);
    document.templates['@x/b'].origin = 'path:vendor-b0';
    await writeState(project, document);
    await mkdir(path.join(project, 'app', 'docs'), { recursive: true });
    await writeFile(path.join(project, 'app', 'docs', 'guide.txt'), 'x', 'utf-8');
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
    expect(await readFile(path.join(project, 'app', 'docs', 'guide.txt'), 'utf-8')).toBe('x');
  });
});
