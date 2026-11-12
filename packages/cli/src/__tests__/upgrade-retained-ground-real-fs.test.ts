import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-validate:p1
//
// The retained-ground ruling of 2026-11-06 through the REAL upgrade engine (real filesystem, real state
// store): an old file left in ground a template relinquished survives the
// upgrade of the guest that now occupies that ground and the host's own
// reclaim, exactly as it survives `delete` (review r16, R16-1). The state is
// written by hand in the shape the commands record (a marked host with
// `relinquishedGround`), so the upgrade engine is the only code under test.
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { upgradeToOrigin } from '../upgrade/flow';
import type { UpgradeEngineDeps } from '../upgrade/flow';
import { createResolvePayloadFn } from '../upgrade/payload';
import type { ProjectStateDocument } from '../project-state/types';
import { requiredFormatVersion } from '../project-state/io';
import {
  createFsCanonicalizeTargetFn,
  createFsPathExistsFn,
  createFsReadFileFn,
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
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true });
  sandbox = undefined;
});

async function origin(project: string, folder: string, name: string, version: string, excluded: string[], files: Record<string, string>) {
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(project, folder, relative)), { recursive: true });
    await writeFile(path.join(project, folder, relative), content, 'utf-8');
  }
  await mkdir(path.join(project, folder), { recursive: true });
  await writeFile(
    path.join(project, folder, 'frontx-template.json'),
    JSON.stringify({ name, version, excludedSubtrees: excluded, description: 'f' }),
    'utf-8',
  );
}

const writeDisk = async (project: string, files: Record<string, string>) => {
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(project, relative)), { recursive: true });
    await writeFile(path.join(project, relative), content, 'utf-8');
  }
};

const writeState = (project: string, templates: ProjectStateDocument['templates']) => {
  const document: ProjectStateDocument = { formatVersion: 1, templates, projectOwnedRoots: [] };
  // Stamped the way every supported write stamps it: from the content.
  return writeFile(
    path.join(project, '.frontx', 'project.json'),
    JSON.stringify({ ...document, formatVersion: requiredFormatVersion(document) } satisfies ProjectStateDocument),
    'utf-8',
  );
};

const readState = async (project: string) =>
  JSON.parse(await readFile(path.join(project, '.frontx', 'project.json'), 'utf-8')) as ProjectStateDocument;

const read = (project: string, relative: string) => readFile(path.join(project, relative), 'utf-8').catch(() => undefined);

function deps(repoRoot: string, plans: unknown[]): UpgradeEngineDeps {
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
    presentPlan: async (plan) => {
      plans.push(plan);
      return 'approved' as never;
    },
    promoteInventory: async () => {},
    refreshAiBundle: async () => {},
  };
}

async function project(): Promise<string> {
  sandbox = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-retained-'));
  const root = path.join(sandbox, 'project');
  await mkdir(path.join(root, '.frontx'), { recursive: true });
  return root;
}

const retainedHost = (overrides: object = {}) => ({
  origin: 'path:hb2',
  version: '2.0.0',
  targets: ['real'],
  excludedSubtrees: ['sub/'],
  exclusionsBackfilled: true as const,
  relinquishedGround: ['real/sub'],
  ...overrides,
});
const guest = { origin: 'path:g1', version: '1.0.0', targets: ['real/sub'], excludedSubtrees: [] };

describe('upgrade keeps old files in relinquished ground (V2, real filesystem)', () => {
  it('guest upgrade (G-U): the identical old file is neither removed nor replaced, and the state moves on', async () => {
    const root = await project();
    await origin(root, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1', 'b2.txt': 'OLD' });
    await origin(root, 'g2', '@x/g', '2.0.0', [], { 'g.txt': 'G2' });
    await writeDisk(root, { 'real/b.txt': 'B', 'real/sub/b2.txt': 'OLD', 'real/sub/g.txt': 'G1' });
    await writeState(root, { '@x/b': retainedHost(), '@x/g': guest });
    const plans: unknown[] = [];
    const outcome = await upgradeToOrigin('@x/g', 'path:g2', deps(root, plans));
    expect(outcome).toMatchObject({ ok: true });
    expect(await read(root, 'real/sub/b2.txt')).toBe('OLD');
    expect(await read(root, 'real/sub/g.txt')).toBe('G1');
    expect(plans[0]).toMatchObject({
      operations: [],
      skipped: expect.arrayContaining([{ target: 'real/sub', path: 'real/sub/b2.txt', reason: 'RETAINED_GROUND' }]),
    });
    const state = await readState(root);
    expect(state.templates['@x/g']).toMatchObject({ origin: 'path:g2', version: '2.0.0' });
    // The host's record is untouched and no new state field exists.
    expect(state.templates['@x/b']).toEqual(retainedHost());
    expect(Object.keys(state.templates['@x/g']).sort()).toEqual(['excludedSubtrees', 'origin', 'previous', 'targets', 'version']);
  });

  it("host reclaim: v2→v3 neither removes nor replaces the old file in the host's own retained ground", async () => {
    const root = await project();
    await origin(root, 'hb2', '@x/b', '2.0.0', ['sub/'], { 'b.txt': 'B', 'sub/b2.txt': 'OLD' });
    await origin(root, 'hb3', '@x/b', '3.0.0', [], { 'b.txt': 'B' });
    await writeDisk(root, { 'real/b.txt': 'B', 'real/sub/b2.txt': 'OLD' });
    await writeState(root, { '@x/b': retainedHost() });
    expect(await upgradeToOrigin('@x/b', 'path:hb3', deps(root, []))).toMatchObject({ ok: true });
    expect(await read(root, 'real/sub/b2.txt')).toBe('OLD');
    const state = await readState(root);
    expect(state.templates['@x/b']).toMatchObject({ version: '3.0.0', exclusionsBackfilled: true, relinquishedGround: ['real/sub'] });

  });

  it('host reclaim that would REPLACE the old file (v2 ships it, v3 ships other bytes) holds it back', async () => {
    const root = await project();
    await origin(root, 'hb2', '@x/b', '2.0.0', ['sub/'], { 'b.txt': 'B', 'sub/b2.txt': 'OLD' });
    await origin(root, 'hb3', '@x/b', '3.0.0', [], { 'b.txt': 'B', 'sub/b2.txt': 'NEW' });
    await writeDisk(root, { 'real/b.txt': 'B', 'real/sub/b2.txt': 'OLD' });
    await writeState(root, { '@x/b': retainedHost() });
    expect(await upgradeToOrigin('@x/b', 'path:hb3', deps(root, []))).toMatchObject({ ok: true });
    expect(await read(root, 'real/sub/b2.txt')).toBe('OLD');
  });

  it("host reclaim still lands a file that is not on disk (ADD) and keeps the rest of the host's work", async () => {
    const root = await project();
    await origin(root, 'hb2', '@x/b', '2.0.0', ['sub/'], { 'b.txt': 'B' });
    await origin(root, 'hb3', '@x/b', '3.0.0', [], { 'b.txt': 'B3', 'sub/new.txt': 'N' });
    await writeDisk(root, { 'real/b.txt': 'B' });
    await writeState(root, { '@x/b': retainedHost() });
    expect(await upgradeToOrigin('@x/b', 'path:hb3', deps(root, []))).toMatchObject({ ok: true });
    expect(await read(root, 'real/b.txt')).toBe('B3');
    expect(await read(root, 'real/sub/new.txt')).toBe('N');
  });

  it('a legitimate upgrade with no retained ground still removes and replaces (unprotected)', async () => {
    const root = await project();
    await origin(root, 'g1', '@x/g', '1.0.0', [], { 'g.txt': 'G1', 'b2.txt': 'OLD' });
    await origin(root, 'g2', '@x/g', '2.0.0', [], { 'g.txt': 'G2' });
    await writeDisk(root, { 'real/sub/b2.txt': 'OLD', 'real/sub/g.txt': 'G1' });
    await writeState(root, { '@x/g': guest });
    expect(await upgradeToOrigin('@x/g', 'path:g2', deps(root, []))).toMatchObject({ ok: true });
    expect(await read(root, 'real/sub/b2.txt')).toBeUndefined();
    expect(await read(root, 'real/sub/g.txt')).toBe('G2');
  });

  it('the host being upgraded does not hold back ordinary files of an UNMARKED entry', async () => {
    const root = await project();
    await origin(root, 'hb1', '@x/b', '1.0.0', [], { 'b.txt': 'B1', 'old.txt': 'O' });
    await origin(root, 'hb2', '@x/b', '2.0.0', [], { 'b.txt': 'B2' });
    await writeDisk(root, { 'real/b.txt': 'B1', 'real/old.txt': 'O' });
    await writeState(root, { '@x/b': { origin: 'path:hb1', version: '1.0.0', targets: ['real'], excludedSubtrees: [] } });
    expect(await upgradeToOrigin('@x/b', 'path:hb2', deps(root, []))).toMatchObject({ ok: true });
    expect(await read(root, 'real/b.txt')).toBe('B2');
    expect(await read(root, 'real/old.txt')).toBeUndefined();
  });
});
