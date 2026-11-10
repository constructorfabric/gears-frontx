// @cpt-algo:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-delete-plan:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-conflict-check:p1
//
// Exact-spelling protection of environment-owned entries (`.git`, `.DS_Store`,
// `Thumbs.db`) at ANY depth within a target (DESIGN: "at any depth within the
// target"). Human ruling 2026-11-09: every ASCII case variant (`.GIT`,
// `.ds_store`, `THUMBS.DB`) is protected on every volume, including
// case-sensitive ones; over-protecting a distinct `.GIT` there is accepted.
// No Unicode folding or normalisation is applied (a Unicode-equivalent
// spelling is NOT matched), and no claim is made about physical volume
// identity, mixed volumes or concurrent changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeExclusionRoots,
  isWithinEffectiveOwnership,
  reservedEnvironmentPrefix,
} from '../scaffold/effective-ownership';
import { checkTargetConflicts } from '../scaffold/conflict-check';
import { createFsListTargetFilesFn, createFsListUnenumerableTargetEntriesFn } from '../adapters/fs-project-io';

describe('reservedEnvironmentPrefix (exact, case-sensitive)', () => {
  it('U1: returns the prefix up to the first reserved segment, at any depth', () => {
    expect(reservedEnvironmentPrefix('.git')).toBe('.git');
    expect(reservedEnvironmentPrefix('app/.git/config')).toBe('app/.git');
    expect(reservedEnvironmentPrefix('a/b/.DS_Store')).toBe('a/b/.DS_Store');
    expect(reservedEnvironmentPrefix('a/Thumbs.db/x/y')).toBe('a/Thumbs.db');
    expect(reservedEnvironmentPrefix('app/.git/')).toBe('app/.git');
  });
  it('U2: near misses are not matches', () => {
    for (const p of ['.gitignore', '.github/workflows/x.yml', 'x.git/config', '.DS_Store.bak', 'Thumbs.dbx', 'app/src/a.ts']) {
      expect(reservedEnvironmentPrefix(p), p).toBeUndefined();
    }
  });
  it('U3 (ruling): every ASCII case variant is matched, at any depth, on every volume', () => {
    expect(reservedEnvironmentPrefix('app/.GIT/config')).toBe('app/.GIT');
    expect(reservedEnvironmentPrefix('app/.Git')).toBe('app/.Git');
    expect(reservedEnvironmentPrefix('app/.ds_store')).toBe('app/.ds_store');
    expect(reservedEnvironmentPrefix('a/THUMBS.DB/x')).toBe('a/THUMBS.DB');
    expect(reservedEnvironmentPrefix('.GIT/hooks')).toBe('.GIT');
    expect(reservedEnvironmentPrefix('.gIt')).toBe('.gIt');
  });
  it('U3b: no Unicode folding — look-alikes and normalised forms are NOT matched', () => {
    // dotless i, fullwidth letters, Turkish capital dotted I: not ASCII case variants
    for (const p of ['app/.g\u0131t/x', 'app/\uFF0Egit', 'app/.G\u0130T/x', 'app/.\uFF47it']) {
      expect(reservedEnvironmentPrefix(p), JSON.stringify(p)).toBeUndefined();
    }
  });
  it('U4: .frontx keeps its root-only semantics', () => {
    expect(reservedEnvironmentPrefix('.frontx/project.json')).toBeUndefined();
    const roots = computeExclusionRoots({ target: 'app', excludedSubtrees: [], projectOwnedRoots: [] });
    expect(isWithinEffectiveOwnership('.frontx/project.json', '.', roots)).toBe(false); // root exclusion, unchanged
    expect(isWithinEffectiveOwnership('app/.frontx/x', 'app', roots)).toBe(true); // nested .frontx is ordinary ground
  });
  it('isWithinEffectiveOwnership excludes nested reserved entries and keeps ordinary neighbours', () => {
    const roots = computeExclusionRoots({ target: 'app', excludedSubtrees: [], projectOwnedRoots: [] });
    for (const p of ['app/.git', 'app/.git/config', 'app/.DS_Store', 'app/sub/Thumbs.db', 'app/sub/.git/objects/x', 'app/.GIT/config', 'app/sub/thumbs.DB', 'app/.ds_STORE']) {
      expect(isWithinEffectiveOwnership(p, 'app', roots), p).toBe(false);
    }
    for (const p of ['app/a.txt', 'app/.gitignore', 'app/.github/x', 'app/sub/b.txt']) {
      expect(isWithinEffectiveOwnership(p, 'app', roots), p).toBe(true);
    }
  });
});

describe('conflict check: a claim at or inside a nested reserved entry', () => {
  const run = (target: string) =>
    checkTargetConflicts({
      targetsUnderCheck: [{ target, templateName: '@x/t', excludedSubtrees: [] }],
      recordedTargets: [],
      projectOwnedRoots: [],
      canonicalizeFn: (t) => t,
    });
  it('C1: refuses, one entry per claim, with the reserved prefix as the contested ground', () => {
    expect(run('app/.git/hooks')).toEqual({
      ok: false,
      kind: 'TARGET_CONFLICT',
      conflicts: [{ ground: 'app/.git', contestants: [{ target: 'app/.git/hooks', templateName: '@x/t' }] }],
    });
    expect(run('a/.DS_Store')).toMatchObject({ ok: false, conflicts: [{ ground: 'a/.DS_Store' }] });
    expect(run('a/Thumbs.db/x')).toMatchObject({ ok: false, conflicts: [{ ground: 'a/Thumbs.db' }] });
  });
  it('C1 (ruling): case variants are refused too, one entry per claim', () => {
    expect(run('app/.GIT/hooks')).toEqual({
      ok: false,
      kind: 'TARGET_CONFLICT',
      conflicts: [{ ground: 'app/.GIT', contestants: [{ target: 'app/.GIT/hooks', templateName: '@x/t' }] }],
    });
    expect(run('a/.ds_store')).toMatchObject({ ok: false, conflicts: [{ ground: 'a/.ds_store' }] });
    expect(run('a/THUMBS.DB/x')).toMatchObject({ ok: false, conflicts: [{ ground: 'a/THUMBS.DB' }] });
    // a root-level variant is reported once, not once per detector
    const root = run('.GIT/hooks');
    expect(root.ok).toBe(false);
    if (!root.ok && root.kind === 'TARGET_CONFLICT') expect(root.conflicts).toHaveLength(1);
  });
  it('C3: root controls keep their single entry; a target merely CONTAINING a nested .git is accepted', () => {
    expect(run('.git/hooks')).toEqual({
      ok: false,
      kind: 'TARGET_CONFLICT',
      conflicts: [{ ground: '.git', contestants: [{ target: '.git/hooks', templateName: '@x/t' }] }],
    });
    expect(run('app')).toEqual({ ok: true });
    expect(run('app/.github')).toEqual({ ok: true });
  });
});

describe('delete walks prune exact reserved names (no third scan, no reads inside)', () => {
  let sandbox: string;
  beforeEach(() => {
    sandbox = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'frontx-env-prune-')));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.chmodSync(path.join(sandbox, 'app', '.git'), 0o755);
    } catch {
      /* not created in every test */
    }
    fs.rmSync(sandbox, { recursive: true, force: true });
    expect(fs.existsSync(sandbox)).toBe(false);
  });

  function build(): void {
    fs.mkdirSync(path.join(sandbox, 'app', '.git', 'objects'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'app', '.git', 'HEAD'), 'ref\n');
    fs.mkdirSync(path.join(sandbox, 'app', 'x'), { recursive: true });
    fs.symlinkSync('nowhere', path.join(sandbox, 'app', 'x', '.git')); // dangling
    fs.writeFileSync(path.join(sandbox, 'app', '.DS_Store'), 'ds');
    fs.mkdirSync(path.join(sandbox, 'app', 'sub'));
    fs.writeFileSync(path.join(sandbox, 'app', 'sub', 'Thumbs.db'), 'th');
    fs.writeFileSync(path.join(sandbox, 'app', 'ok.txt'), 'ok');
  }

  it('U5: files exclude reserved entries; the sink reports each exactly once; no reserved directory is read', async () => {
    build();
    const readdir = vi.spyOn(fs, 'readdirSync');
    const files = await createFsListTargetFilesFn()(path.join(sandbox, 'app'));
    const sink = await createFsListUnenumerableTargetEntriesFn()(path.join(sandbox, 'app'));
    expect(files.sort()).toEqual(['ok.txt']);
    expect(sink.sort()).toEqual(['.DS_Store', '.git', 'sub/Thumbs.db', 'x/.git']);
    const readDirs = readdir.mock.calls.map((c) => String(c[0]));
    expect(readDirs.some((d) => d.endsWith(`${path.sep}.git`) || d.includes(`${path.sep}.git${path.sep}`))).toBe(false);
  });

  it('U5 (ruling): ASCII case-variant spellings are pruned too, and never read', async () => {
    fs.mkdirSync(path.join(sandbox, 'app', '.GIT', 'objects'), { recursive: true });
    fs.writeFileSync(path.join(sandbox, 'app', '.GIT', 'HEAD'), 'ref\n');
    fs.writeFileSync(path.join(sandbox, 'app', '.Ds_Store'), 'ds');
    fs.mkdirSync(path.join(sandbox, 'app', 'sub'));
    fs.writeFileSync(path.join(sandbox, 'app', 'sub', 'THUMBS.DB'), 'th');
    fs.writeFileSync(path.join(sandbox, 'app', 'ok.txt'), 'ok');
    const readdir = vi.spyOn(fs, 'readdirSync');
    const files = await createFsListTargetFilesFn()(path.join(sandbox, 'app'));
    const sink = await createFsListUnenumerableTargetEntriesFn()(path.join(sandbox, 'app'));
    expect(files).toEqual(['ok.txt']);
    expect(sink.sort()).toEqual(['.Ds_Store', '.GIT', 'sub/THUMBS.DB']);
    expect(readdir.mock.calls.some((c) => /[/\\]\.GIT([/\\]|$)/.test(String(c[0])))).toBe(false);
  });

  it.skipIf(process.getuid?.() === 0)('D8: an unreadable (chmod 000) directly named .git does not fail either walk', async () => {
    build();
    fs.chmodSync(path.join(sandbox, 'app', '.git'), 0o000);
    await expect(createFsListTargetFilesFn()(path.join(sandbox, 'app'))).resolves.toEqual(['ok.txt']);
    await expect(createFsListUnenumerableTargetEntriesFn()(path.join(sandbox, 'app'))).resolves.toContain('.git');
  });

  it.skipIf(process.getuid?.() === 0)('an unreadable NON-reserved directory still throws (existing contract)', async () => {
    build();
    fs.mkdirSync(path.join(sandbox, 'app', 'locked'));
    fs.chmodSync(path.join(sandbox, 'app', 'locked'), 0o000);
    try {
      await expect(createFsListTargetFilesFn()(path.join(sandbox, 'app'))).rejects.toThrow(/could not enumerate target directory/);
    } finally {
      fs.chmodSync(path.join(sandbox, 'app', 'locked'), 0o755);
    }
  });
});
