import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-commit:p1
// @cpt-algo:cpt-frontx-algo-composed-provenance-project-state-io:p1
//
// R10-1 (human ruling V2): the protection of an old file left in ground a
// template relinquished must not end when that template's TARGET is deleted
// while the entry is still marked. `delete` records the relinquished roots on
// the entry (`relinquishedGround`); every other template's delete plan then
// keeps preserving what lies beneath them, however the nested template is
// spelled (lexical, symlink alias, another case) and whenever it arrives.
// Each row is host-delete THEN guest-delete on a real filesystem.
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
import { restorePreceding, upgradeToOrigin } from '../upgrade/flow';
import type { UpgradeEngineDeps } from '../upgrade/flow';
import { createResolvePayloadFn } from '../upgrade/payload';
import { readProjectState } from '../project-state/io';
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
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-host-delete-'));
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

// @x/a is a nested template recorded by hand (the history under test is
// @x/b's, which only the real commands write). `link`, when given, is a symlink
// to the real ground and is what the guest is recorded at.
async function addGuest(project: string, target: string, link?: { name: string; to: string }): Promise<void> {
  if (link !== undefined) await symlink(path.join(project, link.to), path.join(project, link.name));
  const document = await readState(project);
  document.templates['@x/a'] = { origin: 'origin-a', version: '1.0.0', targets: [target], excludedSubtrees: [] };
  await writeState(project, document);
}

// The host @x/b applied at `targets` under `[]`, then relinquished: v2 declares
// `sub/` and ships nothing there, so the old `sub/b2.txt` stays and the entry is marked.
async function relinquishedHost(targets: string[] = ['real']): Promise<string> {
  const project = await makeProject();
  expect(await register(project)).toMatchObject({ ok: true });
  expect(await applyB(project, targets)).toMatchObject({ ok: true });
  await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
  expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
  expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
  for (const target of targets) expect(await readFile(path.join(project, target, 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
  return project;
}

async function expectGuestDeleteSpares(project: string, guestTarget: string, ownerFile = OWNER_FILE) {
  const dry = await runDelete(project, guestTarget, true);
  expect(dry).toMatchObject({ ok: true });
  expect(plannedDeletes(dry)).not.toContain(ownerFile);
  expect(await runDelete(project, guestTarget, false)).toMatchObject({ ok: true });
  expect(await readFile(path.join(project, ownerFile), 'utf-8')).toBe('B2');
}

async function deleteHostTarget(project: string, target: string) {
  const dry = await runDelete(project, target, true);
  expect(plannedDeletes(dry)).not.toContain(`${target}/sub/b2.txt`);
  expect(await runDelete(project, target, false)).toMatchObject({ ok: true });
  expect(await readFile(path.join(project, target, 'sub', 'b2.txt'), 'utf-8')).toBe('B2');
}

describe('R10-1: host target deleted, then the nested guest deleted (real filesystem)', () => {
  it('lexical guest present while the host target goes: the entry keeps the relinquished root, the guest delete spares the file', async () => {
    const project = await relinquishedHost();
    await addGuest(project, 'real/sub');
    await deleteHostTarget(project, 'real');
    expect((await readState(project)).templates['@x/b']).toMatchObject({
      targets: [],
      exclusionsBackfilled: true,
      relinquishedGround: ['real/sub'],
    });
    await expectGuestDeleteSpares(project, 'real/sub');
  });

  it('symlink-alias guest (recorded at `dst` -> real/sub): spared', async () => {
    const project = await relinquishedHost();
    await addGuest(project, 'dst', { name: 'dst', to: 'real/sub' });
    await deleteHostTarget(project, 'real');
    await expectGuestDeleteSpares(project, 'dst');
  });

  it('guest arriving AFTER the host target was deleted (entry has no target left): spared', async () => {
    const project = await relinquishedHost();
    await deleteHostTarget(project, 'real');
    await addGuest(project, 'real/sub');
    await expectGuestDeleteSpares(project, 'real/sub');
  });

  it('alias guest arriving after the host delete: spared', async () => {
    const project = await relinquishedHost();
    await deleteHostTarget(project, 'real');
    await addGuest(project, 'dst', { name: 'dst', to: 'real/sub' });
    await expectGuestDeleteSpares(project, 'dst');
  });

  it('multiple targets: deleting ONE keeps its relinquished ground protected, the other target unaffected', async () => {
    const project = await relinquishedHost(['real', 'real2']);
    await deleteHostTarget(project, 'real');
    expect((await readState(project)).templates['@x/b']).toMatchObject({
      targets: ['real2'],
      exclusionsBackfilled: true,
      // recorded for BOTH targets when the upgrade marked the entry, then carried through the delete
      relinquishedGround: ['real/sub', 'real2/sub'],
    });
    await addGuest(project, 'real/sub');
    await expectGuestDeleteSpares(project, 'real/sub');
    // The sibling target still protects its own relinquished file through the live mark.
    await addGuest(project, 'real2/sub');
    await expectGuestDeleteSpares(project, 'real2/sub', 'real2/sub/b2.txt');
  });

  it('mutable origin (edited in place, baseline no longer lists the file): host delete then alias guest delete spares it', async () => {
    const project = await makeProject();
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, ['real'])).toMatchObject({ ok: true });
    await rm(path.join(project, 'vendor-b', 'sub', 'b2.txt'));
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
    await addGuest(project, 'dst', { name: 'dst', to: 'real/sub' });
    await deleteHostTarget(project, 'real');
    await expectGuestDeleteSpares(project, 'dst');
  });

  it('a MARKED entry that holds no relinquishedGround yet (live target) records it at host delete', async () => {
    const project = await makeProject();
    await mkdir(path.join(project, 'real', 'sub'), { recursive: true });
    await writeFile(path.join(project, OWNER_FILE), 'B2', 'utf-8');
    await writeFile(path.join(project, 'real', 'b.txt'), 'B', 'utf-8');
    const document = await readState(project);
    document.templates['@x/b'] = {
      origin: 'path:vendor-b',
      version: '1.0.0',
      targets: ['real'],
      excludedSubtrees: ['sub/'],
      exclusionsBackfilled: true,
    };
    document.formatVersion = 2;
    await writeState(project, document);
    await addGuest(project, 'real/sub');
    await deleteHostTarget(project, 'real');
    expect((await readState(project)).templates['@x/b'].relinquishedGround).toEqual(['real/sub']);
    await expectGuestDeleteSpares(project, 'real/sub');
  });

  it('upgrade and restore of an entry that retained ground carry the field forward', async () => {
    const project = await relinquishedHost(['real', 'real2']);
    await deleteHostTarget(project, 'real');
    await makeOrigin(project, 'vendor-b3', '3.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({
      version: '3.0.0',
      relinquishedGround: ['real/sub', 'real2/sub'],
    });
    expect(await restorePreceding('@x/b', upgradeDeps(project))).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({
      version: '2.0.0',
      relinquishedGround: ['real/sub', 'real2/sub'],
    });
    await addGuest(project, 'real/sub');
    await expectGuestDeleteSpares(project, 'real/sub');
  });

  it('a fresh apply of the host (mark cleared) does not drop the retained ground; only unregister reconciles', async () => {
    const project = await relinquishedHost();
    await deleteHostTarget(project, 'real');
    expect(await applyB(project, ['real3'])).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host.exclusionsBackfilled).toBeUndefined();
    expect(host.relinquishedGround).toEqual(['real/sub']);
    await addGuest(project, 'real/sub');
    await expectGuestDeleteSpares(project, 'real/sub');
  });

  it('unregister of the host reconciles: the file is no longer protected', async () => {
    const project = await relinquishedHost();
    await deleteHostTarget(project, 'real');
    expect(
      await unregisterTemplate('@x/b', project, createFsReadProjectStateFn(), createFsWriteProjectStateFn()),
    ).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toBeUndefined();
    await addGuest(project, 'real/sub');
    const dry = await runDelete(project, 'real/sub', true);
    expect(plannedDeletes(dry)).toContain(OWNER_FILE);
  });
});

describe('R10-1: no false positives and persisted-state compatibility', () => {
  it('an UNMARKED host records nothing at delete, and a nested guest then deletes its own file normally', async () => {
    const project = await makeProject();
    await writeFile(
      path.join(project, 'vendor-b', 'frontx-template.json'),
      JSON.stringify({ name: '@x/b', version: '1.0.0', excludedSubtrees: ['src/plugins/'], description: 'f' }),
      'utf-8',
    );
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, ['app'])).toMatchObject({ ok: true });
    await mkdir(path.join(project, 'app', 'src', 'plugins'), { recursive: true });
    await writeFile(path.join(project, 'app', 'src', 'plugins', 'g.txt'), 'G', 'utf-8');
    await addGuest(project, 'app/src/plugins');
    expect(await runDelete(project, 'app', false)).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host.relinquishedGround).toBeUndefined();
    expect(host.exclusionsBackfilled).toBeUndefined();
    expect(plannedDeletes(await runDelete(project, 'app/src/plugins', true))).toContain('app/src/plugins/g.txt');
  });

  it('a document without the field (every earlier build) loads unchanged and is not given one by a read', async () => {
    const project = await relinquishedHost();
    const document = await readState(project);
    delete document.templates['@x/b'].relinquishedGround;
    await writeState(project, document);
    const loaded = await readProjectState(project, createFsReadProjectStateFn());
    expect(loaded.ok).toBe(true);
    expect((await readState(project)).templates['@x/b'].relinquishedGround).toBeUndefined();
  });

  it.each([
    ['a non-canonical spelling', ['x/../real/sub']],
    ['an absolute path', ['/etc']],
    ['the project root', ['.']],
    ['a non-string entry', [42]],
  ])('a hand-edited %s in relinquishedGround is refused at load, naming the entry', async (_label, bad) => {
    const project = await relinquishedHost();
    const document = await readState(project);
    (document.templates['@x/b'] as unknown as Record<string, unknown>).relinquishedGround = bad;
    await writeState(project, document);
    const loaded = await readProjectState(project, createFsReadProjectStateFn());
    expect(loaded).toMatchObject({ ok: false });
    expect(JSON.stringify(loaded)).toContain('relinquishedGround');
  });
});

// R10-2: the three marking mechanisms (the baseline-listed skip, the disk signal
// for an origin edited in place, and the sticky carry-forward) must each be
// pinned by a row the other two cannot satisfy, or removing one goes unnoticed.
describe('R10-2: each marking mechanism is pinned on its own (real filesystem)', () => {
  it('sticky carry-forward alone: a later upgrade that narrows the declaration to [] declares nothing to probe, yet the mark stays', async () => {
    const project = await relinquishedHost();
    await makeOrigin(project, 'vendor-b3', '3.0.0', [], false);
    expect(await upgradeTo(project, 'vendor-b3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ version: '3.0.0', exclusionsBackfilled: true });
    expect(await readFile(path.join(project, OWNER_FILE), 'utf-8')).toBe('B2');
  });

  it('sticky carry-forward alone: the user removed the relinquished folder, the next upgrade re-declares it over an ABSENT place, the mark stays', async () => {
    const project = await relinquishedHost();
    await rm(path.join(project, 'real', 'sub'), { recursive: true });
    await makeOrigin(project, 'vendor-b3', '3.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b3')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ version: '3.0.0', exclusionsBackfilled: true });
  });

  it('baseline-listed skip alone: the record already covers the declaration (no disk signal), yet a baseline file the candidate relinquishes marks', async () => {
    const project = await makeProject();
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, ['real'])).toMatchObject({ ok: true });
    // The record names `sub/` as declared (legacy / hand-edited), while the baseline
    // origin still declares [] and listed b2, which is on disk.
    const document = await readState(project);
    document.templates['@x/b'].excludedSubtrees = ['sub/'];
    await writeState(project, document);
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({ exclusionsBackfilled: true });
    expect(await readFile(path.join(project, OWNER_FILE), 'utf-8')).toBe('B2');
  });

  it('baseline filter: a file only the CANDIDATE ships under a new exclusion over an absent place does not mark', async () => {
    const project = await makeProject();
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, ['real'])).toMatchObject({ ok: true });
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['fresh/'], true);
    await mkdir(path.join(project, 'vendor-b2', 'fresh'), { recursive: true });
    await writeFile(path.join(project, 'vendor-b2', 'fresh', 'n.txt'), 'N', 'utf-8');
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    const host = (await readState(project)).templates['@x/b'];
    expect(host).toMatchObject({ excludedSubtrees: ['fresh/'] });
    expect(host.exclusionsBackfilled).toBeUndefined();
    await expect(readFile(path.join(project, 'real', 'fresh', 'n.txt'), 'utf-8')).rejects.toThrow();
  });
});

// R13-1: the entry's OWN retained ground is preserved when the same template is
// applied again AT a retained root, or BELOW it, not only when the root lies
// strictly beneath the deleted target.
describe('R13-1: the same template re-applied at or below its own retained root (real filesystem)', () => {
  it('re-applied AT the retained root: its delete spares the old file and lists the ground', async () => {
    const project = await relinquishedHost();
    await deleteHostTarget(project, 'real');
    expect(await applyB(project, ['real/sub'], true)).toMatchObject({ ok: true });
    expect((await readState(project)).templates['@x/b']).toMatchObject({
      targets: ['real/sub'],
      relinquishedGround: ['real/sub'],
    });
    const dry = await runDelete(project, 'real/sub', true);
    expect(dry).toMatchObject({ ok: true });
    expect(plannedDeletes(dry)).toEqual([]);
    expect((dry as { toPreserve: string[] }).toPreserve).toContain('real/sub');
    expect(await runDelete(project, 'real/sub', false)).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, OWNER_FILE), 'utf-8')).toBe('B2');
    expect((await readState(project)).templates['@x/b']).toMatchObject({ targets: [], relinquishedGround: ['real/sub'] });
  });

  it('re-applied BELOW the retained root (a deeper old file survives its delete)', async () => {
    const project = await makeProject();
    await mkdir(path.join(project, 'vendor-b', 'sub', 'deep'), { recursive: true });
    await writeFile(path.join(project, 'vendor-b', 'sub', 'deep', 'd.txt'), 'D', 'utf-8');
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, ['real'])).toMatchObject({ ok: true });
    await makeOrigin(project, 'vendor-b2', '2.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b2')).toMatchObject({ ok: true });
    await deleteHostTarget(project, 'real');
    expect(await applyB(project, ['real/sub/deep'], true)).toMatchObject({ ok: true });
    const dry = await runDelete(project, 'real/sub/deep', true);
    expect(plannedDeletes(dry)).toEqual([]);
    expect(await runDelete(project, 'real/sub/deep', false)).toMatchObject({ ok: true });
    expect(await readFile(path.join(project, 'real/sub/deep/d.txt'), 'utf-8')).toBe('D');
    expect(await readFile(path.join(project, OWNER_FILE), 'utf-8')).toBe('B2');
  });

  it('an unrelated applied target of the same template is still deleted normally (no over-preservation)', async () => {
    const project = await relinquishedHost(['real', 'other']);
    await deleteHostTarget(project, 'real');
    const dry = await runDelete(project, 'other', true);
    expect(plannedDeletes(dry)).toContain('other/b.txt');
  });

  it('an ordinary unmarked template delete is unchanged', async () => {
    const project = await makeProject();
    expect(await register(project)).toMatchObject({ ok: true });
    expect(await applyB(project, ['real'])).toMatchObject({ ok: true });
    expect(plannedDeletes(await runDelete(project, 'real', true))).toEqual(['real/b.txt', 'real/sub/b2.txt']);
  });
});

// R13-2: `register --replace` after the last target is deleted is the route
// `upgrade` names; it keeps the retained ground.
describe('R13-2: register --replace after the host target is deleted (real filesystem)', () => {
  it('keeps relinquishedGround, so a guest delete in that ground still spares the old file', async () => {
    const project = await relinquishedHost();
    await deleteHostTarget(project, 'real');
    await makeOrigin(project, 'vendor-b3', '3.0.0', ['sub/'], false);
    expect(await upgradeTo(project, 'vendor-b3')).toMatchObject({ ok: false, code: 'TARGET_NOT_APPLIED' });
    const replaced = await registerTemplate(
      'path:vendor-b3',
      true,
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
    expect(replaced).toMatchObject({ ok: true, outcome: 'replaced' });
    const entry = (await readState(project)).templates['@x/b'];
    expect(entry).toMatchObject({ version: '3.0.0', targets: [], relinquishedGround: ['real/sub'] });
    expect(entry.exclusionsBackfilled).toBeUndefined();
    expect(entry.previous).toBeUndefined();
    await addGuest(project, 'real/sub');
    await expectGuestDeleteSpares(project, 'real/sub');
  });

  it('a replace of an entry that retained nothing writes no field', async () => {
    const project = await makeProject();
    expect(await register(project)).toMatchObject({ ok: true });
    await makeOrigin(project, 'vendor-b3', '3.0.0', [], true);
    const replaced = await registerTemplate(
      'path:vendor-b3',
      true,
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
    expect(replaced).toMatchObject({ ok: true, outcome: 'replaced' });
    expect('relinquishedGround' in (await readState(project)).templates['@x/b']).toBe(false);
  });
});
