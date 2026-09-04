// @cpt-algo:cpt-frontx-algo-upgrade-changeset-classify:p1
//
// Real-filesystem coverage for the symlinked-ANCESTOR defect (PR review
// round five, reproduced against the built binary): `classifyTarget`
// (`../upgrade/classify.ts`) refused fail-closed on a symlinked LEAF, but an
// ancestor directory component between `target` and the leaf that was
// itself a symlink was simply followed by the OS on every read — so a plan
// naming `workspace/dir/sub/b.txt` actually compared, and would have let the
// commit algorithm land, content at wherever `workspace/dir` really pointed.
//
// `fakeReadDiskEntry` (`./upgrade-classify.test.ts`) cannot honestly exercise
// this: a fake keyed by absolute path string can trivially "get it right"
// for whichever path a test happens to look up, but it can never reproduce
// what the REAL `lstat`-based seam does when an intermediate path segment is
// a symlink — the OS resolves it transparently on the way to the leaf,
// which is exactly the behavior this fix has to defend against. This suite
// uses the real `createFsReadDiskEntryFn` (`../adapters/fs-upgrade-io.ts`)
// against a real temporary directory with real symlinks, mirroring
// `fs-containment.test.ts`'s own real-temp-directory convention for the
// identical reason that file states for the apply-side containment escape.
import path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, rename, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyTarget } from '../upgrade/classify';
import type { ClassifyInput } from '../upgrade/classify';
import { createFsReadDiskEntryFn } from '../adapters/fs-upgrade-io';
import type { ResolvedPayload } from '../upgrade/types';

function payload(files: Record<string, string>): ResolvedPayload {
  return {
    name: 'my-template',
    version: '1.0.0',
    origin: 'path:tpl',
    files: new Map(Object.entries(files)),
    excludedSubtrees: [],
  };
}

const identityCanonicalize = (raw: string): string | null => raw;

let repoRoot: string | undefined;

afterEach(async () => {
  if (repoRoot !== undefined) {
    await rm(repoRoot, { recursive: true, force: true });
    repoRoot = undefined;
  }
});

function baseInput(overrides: Partial<ClassifyInput>): ClassifyInput {
  return {
    target: 'workspace',
    repoRoot: repoRoot!,
    baseline: payload({}),
    candidate: payload({}),
    projectOwnedRoots: [],
    otherTemplateTargets: [],
    additionalExclusionRoots: [],
    readDiskEntry: createFsReadDiskEntryFn(),
    canonicalizeFn: identityCanonicalize,
    ...overrides,
  };
}

describe('classifyTarget against a real filesystem — symlinked ancestor directory component', () => {
  it('refuses fail-closed, and never lands content through, an ancestor directory replaced by a symlink pointing elsewhere in the project', async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-ancestor-'));
    const ws = path.join(repoRoot, 'workspace');
    await mkdir(path.join(ws, 'dir', 'sub'), { recursive: true });
    await writeFile(path.join(ws, 'dir', 'sub', 'b.txt'), 'V1', 'utf-8');

    // The exact reproduction shape: move the real directory aside, then
    // symlink its former location to the stash — the classic "swap a
    // directory for a link to somewhere else" attack this fix closes.
    await mkdir(path.join(repoRoot, 'stash'), { recursive: true });
    await rename(path.join(ws, 'dir'), path.join(repoRoot, 'stash', 'dir'));
    await symlink(path.join('..', 'stash', 'dir'), path.join(ws, 'dir'));

    const result = await classifyTarget(
      baseInput({
        baseline: payload({ 'dir/sub/b.txt': 'V1' }),
        candidate: payload({ 'dir/sub/b.txt': 'V2' }),
      }),
    );

    expect(result.conflictPaths).toEqual(['workspace/dir/sub/b.txt']);
    expect(result.operations).toEqual([]);

    // Nothing was compared or landed at the resolved location either — the
    // stash keeps its original content, exactly as classification (which
    // never writes anything) leaves everything it touches.
    const stashed = await readFile(path.join(repoRoot, 'stash', 'dir', 'sub', 'b.txt'), 'utf-8');
    expect(stashed).toBe('V1');
  });

  it('refuses fail-closed for ADD and REMOVE through the same symlinked ancestor, not only REPLACE', async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-ancestor-'));
    const ws = path.join(repoRoot, 'workspace');
    await mkdir(path.join(ws, 'dir'), { recursive: true });
    await writeFile(path.join(ws, 'dir', 'remove.txt'), 'gone-baseline', 'utf-8');
    // `add.txt` is deliberately never created: the ADD case's baseline AND
    // disk are both absent before the ancestor is compromised.

    await mkdir(path.join(repoRoot, 'stash'), { recursive: true });
    await rename(path.join(ws, 'dir'), path.join(repoRoot, 'stash', 'dir'));
    await symlink(path.join('..', 'stash', 'dir'), path.join(ws, 'dir'));

    const result = await classifyTarget(
      baseInput({
        baseline: payload({ 'dir/remove.txt': 'gone-baseline' }),
        candidate: payload({ 'dir/add.txt': 'brand-new' }),
      }),
    );

    expect(result.conflictPaths.sort()).toEqual(['workspace/dir/add.txt', 'workspace/dir/remove.txt']);
    expect(result.operations).toEqual([]);
  });

  it('does not flag an ordinary real ancestor directory, and classifies ADD/REPLACE/REMOVE normally through it', async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-ancestor-'));
    const ws = path.join(repoRoot, 'workspace');
    await mkdir(path.join(ws, 'dir', 'sub'), { recursive: true });
    await writeFile(path.join(ws, 'dir', 'sub', 'replace.txt'), 'old', 'utf-8');
    await writeFile(path.join(ws, 'dir', 'sub', 'remove.txt'), 'gone-baseline', 'utf-8');

    const result = await classifyTarget(
      baseInput({
        baseline: payload({ 'dir/sub/replace.txt': 'old', 'dir/sub/remove.txt': 'gone-baseline' }),
        candidate: payload({ 'dir/sub/replace.txt': 'new', 'dir/sub/add.txt': 'brand-new' }),
      }),
    );

    expect(result.conflictPaths).toEqual([]);
    const opsByPath = Object.fromEntries(result.operations.map((op) => [op.path, op.op]));
    expect(opsByPath).toEqual({
      'workspace/dir/sub/replace.txt': 'REPLACE',
      'workspace/dir/sub/remove.txt': 'REMOVE',
      'workspace/dir/sub/add.txt': 'ADD',
    });
  });

  it('leaves an unrelated real symlinked directory elsewhere in the target — never an ancestor of any enumerated payload path — entirely untouched', async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-ancestor-'));
    const ws = path.join(repoRoot, 'workspace');
    await mkdir(path.join(ws, 'src'), { recursive: true });
    await writeFile(path.join(ws, 'src', 'a.ts'), 'v1', 'utf-8');

    // An ordinary internal symlink — e.g. a workspace-linked node_modules
    // dependency — that no payload path ever passes through. Regression for
    // "run the fix backwards": the ancestor probe must never even reach it.
    await mkdir(path.join(ws, 'real_vendor'), { recursive: true });
    await writeFile(path.join(ws, 'real_vendor', 'marker.txt'), 'UNTOUCHED', 'utf-8');
    await symlink('real_vendor', path.join(ws, 'vendor'));

    const result = await classifyTarget(
      baseInput({
        baseline: payload({ 'src/a.ts': 'v1' }),
        candidate: payload({ 'src/a.ts': 'v1' }),
      }),
    );

    expect(result.conflictPaths).toEqual([]);
    expect(result.operations).toEqual([expect.objectContaining({ path: 'workspace/src/a.ts', op: 'UNCHANGED' })]);
    const marker = await readFile(path.join(ws, 'real_vendor', 'marker.txt'), 'utf-8');
    expect(marker).toBe('UNTOUCHED');
  });
});
