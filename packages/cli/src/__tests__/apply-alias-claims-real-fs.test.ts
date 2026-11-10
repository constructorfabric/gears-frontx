import { createFsReadFolderFileBinaryFn } from '../adapters/fs-project-io';
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-conflict-check:p1
//
// `apply` must see another template's recorded target at the place it RESOLVES
// to. A recorded target that has become a symlink alias (`dst -> real`) is
// ground nobody else may claim; judged by spelling alone a batch target
// `real/sub` — or `real` itself — was admitted, leaving two recorded owners of
// one directory. The grammar refusals also name their real reason.
import path from 'node:path';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAndCheckBatch } from '../commands/apply';
import type { ResolveAndCheckDeps } from '../commands/apply';
import { ownershipAdd } from '../commands/ownership';
import type { UniformApplyInventoryPort } from '../scaffold/assembler';
import type { ProjectStateDocument } from '../project-state/types';
import {
  createFsCanonicalizeTargetFn,
  createFsPathExistsFn,
  createFsReadFileFn,
  createFsReadProjectStateFn,
  createFsWriteProjectStateFn,
} from '../adapters/fs-project-io';
import { createFsListDiskFilesFn } from '../adapters/fs-upgrade-io';

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

const noInventory: UniformApplyInventoryPort = {
  lookup: () => undefined,
  install: vi.fn(async () => ({ ok: false as const, error: { message: 'not stubbed' } })),
};

async function makeProject(aTargets: string[], links: Record<string, string>): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), 'frontx-apply-alias-'));
  for (const name of ['a', 'b']) {
    await mkdir(path.join(root, `vendor-${name}`), { recursive: true });
    await writeFile(
      path.join(root, `vendor-${name}`, 'frontx-template.json'),
      JSON.stringify({ name: `@x/${name}`, version: '1.0.0', excludedSubtrees: [], description: 'fixture' }),
      'utf-8',
    );
  }
  await mkdir(path.join(root, 'real', 'sub'), { recursive: true });
  await writeFile(path.join(root, 'real', 'a.txt'), 'A', 'utf-8');
  for (const [link, to] of Object.entries(links)) await symlink(path.join(root, to), path.join(root, link));
  const document: ProjectStateDocument = {
    formatVersion: 1,
    templates: {
      '@x/a': { origin: 'path:vendor-a', version: '1.0.0', targets: aTargets },
      '@x/b': { origin: 'path:vendor-b', version: '1.0.0', targets: [] },
    },
    projectOwnedRoots: [],
  };
  await mkdir(path.join(root, '.frontx'), { recursive: true });
  await writeFile(path.join(root, '.frontx', 'project.json'), JSON.stringify(document), 'utf-8');
  return root;
}

function deps(project: string): ResolveAndCheckDeps {
  return {
    inventory: noInventory,
    fetchFn: vi.fn(async () => ''),
    readFolderFileBinaryFn: createFsReadFolderFileBinaryFn(),
    readFileFn: createFsReadFileFn(),
    canonicalizeFn: createFsCanonicalizeTargetFn(project),
    existsFn: createFsPathExistsFn(),
    listFolderFilesFn: createFsListDiskFilesFn(),
    resolveInstalledContentPathFn: (name: string) => name,
  };
}

const check = (project: string, target: string) =>
  resolveAndCheckBatch({ templates: { '@x/b': [target] } }, project, deps(project), createFsReadProjectStateFn());

describe("apply refuses a target that overlaps another template's recorded alias (real filesystem)", () => {
  it('a target nested under the alias resolved location is refused', async () => {
    const project = await makeProject(['dst'], { dst: 'real' });
    expect(await check(project, 'real/sub')).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
  });

  it('a target at the alias resolved location is refused', async () => {
    const project = await makeProject(['dst'], { dst: 'real' });
    expect(await check(project, 'real')).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
  });

  it('a target that contains the alias resolved location is refused', async () => {
    const project = await makeProject(['dst'], { dst: 'real/sub' });
    expect(await check(project, 'real')).toMatchObject({ ok: false, code: 'TARGET_CONFLICT' });
  });

  it('control: a disjoint target is still admitted', async () => {
    const project = await makeProject(['dst'], { dst: 'real' });
    expect(await check(project, 'elsewhere')).toMatchObject({ ok: true });
  });
});

describe('grammar refusals name their real reason (real filesystem)', () => {
  it.each([
    { raw: 'app ', reason: 'whitespace' },
    { raw: ' app', reason: 'whitespace' },
    { raw: 'app\u0001', reason: 'control character' },
    { raw: 'nl\n', reason: 'control character' },
    { raw: './~', reason: '~' },
  ])('apply refuses $raw citing $reason', async ({ raw, reason }) => {
    const project = await makeProject([], {});
    const result = await check(project, raw);
    expect(result).toMatchObject({ ok: false, code: 'INVALID_PATH' });
    if (!result.ok) {
      expect(result.message).toContain(reason);
      expect(result.message).not.toContain('could not be proven to stay inside');
    }
  });

  it('ownership add names the reason for a whitespace path', async () => {
    const project = await makeProject([], {});
    const result = await ownershipAdd(
      'app ',
      project,
      { lookup: () => undefined },
      (async () => 'directory') as never,
      createFsCanonicalizeTargetFn(project),
      createFsReadProjectStateFn(),
      createFsWriteProjectStateFn(),
      createFsReadFileFn(),
    );
    expect(result).toMatchObject({ ok: false, code: 'INVALID_PATH' });
    if (!result.ok) expect(result.message).toContain('whitespace');
  });

  it('a path that really escapes the project keeps the containment message', async () => {
    const project = await makeProject([], {});
    const result = await check(project, '../outside');
    expect(result).toMatchObject({ ok: false, code: 'INVALID_PATH' });
    if (!result.ok) expect(result.message).toContain('could not be proven to stay inside');
  });
});
