import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
//
// The `excludedSubtrees` a name records at `register` is the declaration of that
// moment, not the one its files were written under: the manifest of a `path:`
// origin can change between `register` and `apply`, and change back afterwards.
// `apply` is where files materialize, so it must leave recorded evidence that
// matches each applied target, or say it cannot (the marker). Real filesystem,
// end to end: register -> manifest drift -> apply -> drift back -> a nested
// template's delete and an upgrade, both of which treat the recorded value as
// the declaration the owner wrote under. The owner's files must survive.
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

describe('apply records the declaration its files were written under (real filesystem)', () => {
  it('register -> drift -> apply -> drift back: the owner is recorded as it applied, and a nested delete spares its file', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b'].excludedSubtrees).toEqual(['sub/']);

    await writeManifest(project, 'vendor-b', '1.0.0', []);
    expect(await applyB(project, 'real')).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
    await writeManifest(project, 'vendor-b', '1.0.0', ['sub/']);

    const entry = (await readState(project)).templates['@x/b'];
    expect(entry.excludedSubtrees).toEqual([]);
    expect(entry.exclusionsBackfilled).toBeUndefined();

    await addAliasedGuest(project, 'real/sub');
    await expectGuestDeleteSparesOwner(project, 'real/sub/b2.txt');
  });

  it('the alias upgrade judgement reads the apply-time declaration, so it refuses', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', []);
    expect(await applyB(project, 'real')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', ['sub/']);
    await addAliasedGuest(project, 'real/sub');

    const result = await upgradeToOrigin('@x/b', 'path:vendor-b2', upgradeDeps(project));
    expect(result).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  });

  it('a second target applied under a different declaration marks the entry unproven, so neither target is trusted', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real1')).toMatchObject({ ok: true });
    const first = (await readState(project)).templates['@x/b'];
    expect(first.excludedSubtrees).toEqual(['sub/']);
    expect(first.exclusionsBackfilled).toBeUndefined();

    await writeManifest(project, 'vendor-b', '1.0.0', []);
    expect(await applyB(project, 'real2')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', ['sub/']);
    expect((await readState(project)).templates['@x/b']).toMatchObject({ targets: ['real1', 'real2'], exclusionsBackfilled: true });

    // real2/sub/b2.txt was written under `[]`; real1/sub holds nothing of B's.
    await addAliasedGuest(project, 'real2/sub');
    await expectGuestDeleteSparesOwner(project, 'real2/sub/b2.txt');
  });

  it('a later target applied under the SAME declaration keeps the record authentic (control)', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real1')).toMatchObject({ ok: true });
    expect(await applyB(project, 'real2')).toMatchObject({ ok: true });
    const entry = (await readState(project)).templates['@x/b'];
    expect(entry).toMatchObject({ targets: ['real1', 'real2'], excludedSubtrees: ['sub/'] });
    expect(entry.exclusionsBackfilled).toBeUndefined();
  });

  it('an unproven entry stays unproven when a later target applies under the recorded declaration', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real1')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', []);
    expect(await applyB(project, 'real2')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', ['sub/']);
    expect(await applyB(project, 'real3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
  });

  it('the alias upgrade refuses on a multi-target entry whose history is unproven', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real1')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', []);
    expect(await applyB(project, 'real2')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', ['sub/']);
    await addAliasedGuest(project, 'real2/sub');

    const result = await upgradeToOrigin('@x/b', 'path:vendor-b2', upgradeDeps(project));
    expect(result).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
    expect(await readFile(path.join(project, 'real2', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  });

  it('after every target is deleted, a fresh apply records its own declaration and clears the mark', async () => {
    const project = await makeProject(['sub/']);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real1')).toMatchObject({ ok: true });
    await writeManifest(project, 'vendor-b', '1.0.0', []);
    expect(await applyB(project, 'real2')).toMatchObject({ ok: true });
    await runDelete(project, 'real1', false);
    await runDelete(project, 'real2', false);
    expect((await readState(project)).templates['@x/b'].targets).toEqual([]);

    expect(await applyB(project, 'real3')).toMatchObject({ ok: true });
    const entry = (await readState(project)).templates['@x/b'];
    expect(entry.excludedSubtrees).toEqual([]);
    expect(entry.exclusionsBackfilled).toBeUndefined();
  });
});

describe('an upgrade that leaves the owner\'s file outside its new boundary does not vouch for it (real filesystem)', () => {
  it('upgrade to a candidate excluding ground the owner wrote, then a nested delete: the owner\'s file survives', async () => {
    const project = await makeProject([]);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real')).toMatchObject({ ok: true });

    const deps = { ...upgradeDeps(project), presentPlan: async () => 'approved' as never };
    const upgraded = await upgradeToOrigin('@x/b', 'path:vendor-b2', deps);
    expect(upgraded).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real', 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
    expect((await readState(project)).templates['@x/b']).toMatchObject({ excludedSubtrees: ['sub/'], exclusionsBackfilled: true });

    await addAliasedGuest(project, 'real/sub');
    await expectGuestDeleteSparesOwner(project, 'real/sub/b2.txt');
  });
});

// An `OUTSIDE_BOUNDARY` skip is not, by itself, evidence that the template wrote
// a file under a declaration other than the recorded one. Ground the template
// never wrote - a project-owned root inside its target, a path inside its own
// declared exclusion - is skipped for an independent reason that every upgrade
// of the same declaration repeats, so marking on it would make every later nested
// delete orphan a legitimate guest. Only a file the BASELINE boundary contained
// and the candidate boundary relinquishes marks the entry.
describe('an upgrade that skips ground the template never wrote leaves the entry authentic (real filesystem)', () => {
  const NESTED_GUEST_FILE = 'app/src/plugins/g.txt';

  async function makeNestedHostProject(options: { shipsInsideOwnExclusion: boolean; ownedRoot?: string }): Promise<string> {
    sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-apply-history-nest-'));
    const project = path.join(sandbox, 'project');
    await mkdir(path.join(project, '.frontx'), { recursive: true });
    for (const [folder, version] of [['vendor-b', '1.0.0'], ['vendor-b2', '2.0.0']] as const) {
      await mkdir(path.join(project, folder, 'config'), { recursive: true });
      await mkdir(path.join(project, folder, 'src', 'plugins'), { recursive: true });
      await writeFile(path.join(project, folder, 'index.txt'), `index ${version}`, 'utf-8');
      await writeFile(path.join(project, folder, 'config', 'x.json'), `{"v":"${version}"}`, 'utf-8');
      if (options.shipsInsideOwnExclusion) {
        await writeFile(path.join(project, folder, 'src', 'plugins', '.keep'), '', 'utf-8');
      }
      await writeManifest(project, folder, version, ['src/plugins/']);
    }
    await writeFile(
      path.join(project, '.frontx', 'project.json'),
      JSON.stringify({
        formatVersion: 1,
        templates: {},
        projectOwnedRoots: options.ownedRoot === undefined ? [] : [options.ownedRoot],
      } satisfies ProjectStateDocument),
      'utf-8',
    );
    return project;
  }

  async function addNestedGuest(project: string): Promise<void> {
    await mkdir(path.join(project, 'app', 'src', 'plugins'), { recursive: true });
    await writeFile(path.join(project, NESTED_GUEST_FILE), 'G', 'utf-8');
    const document = await readState(project);
    document.templates['@x/a'] = { origin: 'origin-a', version: '1.0.0', targets: ['app/src/plugins'], excludedSubtrees: [] };
    await writeState(project, document);
  }

  async function upgradeHostKeepingDeclaration(project: string) {
    const deps = { ...upgradeDeps(project), presentPlan: async () => 'approved' as never };
    return upgradeToOrigin('@x/b', 'path:vendor-b2', deps);
  }

  async function expectNestedGuestDeleteRemovesItsFile(project: string) {
    const dry = await runDelete(project, 'app/src/plugins', true);
    expect(dry).toMatchObject({ ok: true });
    expect((dry as unknown as { toDelete: string[] }).toDelete).toContain(NESTED_GUEST_FILE);
    expect(await runDelete(project, 'app/src/plugins', false)).toMatchObject({ ok: true });
    await expect(readFile(path.join(project, NESTED_GUEST_FILE), 'utf-8')).rejects.toThrow();
    expect((await readState(project)).templates['@x/a']?.targets ?? []).toEqual([]);
  }

  it('N5: a project-owned root inside the host target is skipped on every upgrade without marking the host', async () => {
    const project = await makeNestedHostProject({ shipsInsideOwnExclusion: false, ownedRoot: 'app/config' });
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'app')).toMatchObject({ ok: true });
    await addNestedGuest(project);

    const upgraded = await upgradeHostKeepingDeclaration(project);
    expect(upgraded).toMatchObject({ ok: true });
    // The owner's root is never written: the skip is the project-owned one.
    await expect(readFile(path.join(project, 'app', 'config', 'x.json'), 'utf-8')).rejects.toThrow();
    expect(await readFile(path.join(project, 'app', 'index.txt'), 'utf-8')).toBe('index 2.0.0');
    const host = (await readState(project)).templates['@x/b'];
    expect(host).toMatchObject({ version: '2.0.0', excludedSubtrees: ['src/plugins/'] });
    expect(host.exclusionsBackfilled).toBeUndefined();

    await expectNestedGuestDeleteRemovesItsFile(project);
  });

  it('N4: a payload file inside the template\'s own excluded subtree is skipped without marking the host', async () => {
    const project = await makeNestedHostProject({ shipsInsideOwnExclusion: true });
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'app')).toMatchObject({ ok: true });
    await addNestedGuest(project);

    expect(await upgradeHostKeepingDeclaration(project)).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host).toMatchObject({ version: '2.0.0', excludedSubtrees: ['src/plugins/'] });
    expect(host.exclusionsBackfilled).toBeUndefined();

    await expectNestedGuestDeleteRemovesItsFile(project);
  });

  it('control: ground the baseline wrote and the candidate declares excluded still marks the entry', async () => {
    const project = await makeProject([]);
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, 'real')).toMatchObject({ ok: true });
    expect(await upgradeHostKeepingDeclaration2(project)).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
  });
});

async function upgradeHostKeepingDeclaration2(project: string) {
  return upgradeToOrigin('@x/b', 'path:vendor-b2', { ...upgradeDeps(project), presentPlan: async () => 'approved' as never });
}
