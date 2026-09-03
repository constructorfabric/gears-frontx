// Real-fs coverage for the containment-escape fix: a symlink somewhere
// under an already-canonicalized project root, or an already-computed
// deletion/upgrade plan, that resolves OUTSIDE the project entirely.
//
// The defect (found in PR review, reproduced against the built binary):
// registering a local template, then `mkdir -p app && ln -s /somewhere/
// OUTSIDE app/src`, then `apply`ing the template to target `app`, wrote the
// template's payload straight into `/somewhere/OUTSIDE` — the target itself
// (`app`) had been canonicalized and proven to stay inside the project
// root, but the individual PAYLOAD PATH under it (`app/src/index.ts`) never
// was, and `fs.writeFileSync`/`fs.mkdirSync`/`fs.cpSync`/`fs.rmSync` all
// follow a symlink on the way to the final path component regardless of
// what the caller believes the destination to be.
//
// `assertPathWithinProjectRoot` (`../adapters/fs-project-io.ts`) is the ONE
// shared "is this absolute path inside the root, symlinks resolved" check
// every real adapter that writes into, or removes from, a project now uses.
// This suite proves it directly against a real filesystem — a fake
// `CanonicalizeTargetFn`/`WriteFileFn` seam cannot honestly exercise an
// ACTUAL escaping symlink — modeled on `fs-canonicalize-target.test.ts`'s
// own real-temp-directory convention.
import path from 'node:path';
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertPathWithinProjectRoot,
  createFsAssertPathWithinRootFn,
  createFsWriteFileFn,
  createFsWriteProjectStateFn,
} from '../adapters/fs-project-io';
import {
  createFsWriteDiskFileFn,
  createFsRenameDiskFileFn,
  createFsUnlinkDiskFileFn,
} from '../adapters/fs-upgrade-io';
import { createFsCopyBundleFn, createFsRemoveBundleFn } from '../adapters/fs-ai-bundle';
import { runApplyPipeline } from '../commands/apply';
import type { ApplyPipelineDeps } from '../commands/apply';
import type { UniformApplyInventoryPort } from '../scaffold/assembler';
import type { CanonicalizeTargetFn } from '../scaffold/conflict-check';
import type { BundleExistsFn, CopyBundleFn, RemoveBundleFn } from '../scaffold/ai-bundle';
import type { ReadExistingContentFn, ReadInstalledContentFn } from '../scaffold/existing-content';
import type { ContentItem, WriteFileFn } from '../scaffold/types';
import type { ProjectStateDocument, ReadProjectStateFn, WriteProjectStateFn } from '../project-state/types';
import type { ReadFileFn } from '../manifest/types';
import type { InventoryEntry } from '../inventory/types';
import { InventoryState } from '../inventory/types';

describe('assertPathWithinProjectRoot', () => {
  let root: string;
  let outsideDir: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
    root = '';
    outsideDir = '';
  });

  async function makeRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'frontx-containment-root-'));
    root = dir;
    return dir;
  }

  it('does not throw for an ordinary path inside the root that does not exist yet', async () => {
    const dir = await makeRoot();

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'src', 'index.ts'))).not.toThrow();
  });

  it('does not throw for an ordinary, already-existing path inside the root', async () => {
    const dir = await makeRoot();
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await writeFile(path.join(dir, 'app', 'file.txt'), 'content', 'utf-8');

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'file.txt'))).not.toThrow();
  });

  // A project may legitimately contain its own symlinks — only an escape
  // past the root is refused, never an internal one.
  it('does not throw when a symlink on the path resolves to somewhere still inside the root', async () => {
    const dir = await makeRoot();
    await mkdir(path.join(dir, 'app', 'real-src'), { recursive: true });
    await symlink(path.join(dir, 'app', 'real-src'), path.join(dir, 'app', 'src'));

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'src', 'index.ts'))).not.toThrow();
  });

  // The escape this whole check exists to catch, exactly as reproduced
  // against the built binary: `app/src` replaced with a symlink to
  // somewhere outside the project, the destination path itself not created
  // yet.
  it('throws when a symlinked ancestor directory resolves outside the root, for a path that does not exist yet', async () => {
    const dir = await makeRoot();
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-containment-outside-'));
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink(outsideDir, path.join(dir, 'app', 'src'));

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'src', 'index.ts'))).toThrow(
      /outside the project root/,
    );
  });

  // The removal-side mirror: the full path already exists (via the escaping
  // symlink), so real path resolution succeeds outright rather than via the
  // nearest-existing-ancestor walk.
  it('throws when the full path already exists only by resolving through an escaping symlink', async () => {
    const dir = await makeRoot();
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-containment-outside-'));
    await writeFile(path.join(outsideDir, 'index.ts'), 'leaked', 'utf-8');
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink(outsideDir, path.join(dir, 'app', 'src'));

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'src', 'index.ts'))).toThrow(
      /outside the project root/,
    );
  });

  it('throws, naming the root, when the project root itself cannot be resolved', () => {
    expect(() =>
      assertPathWithinProjectRoot('/definitely/does/not/exist/frontx-fixture-root', '/definitely/does/not/exist/frontx-fixture-root/x'),
    ).toThrow('/definitely/does/not/exist/frontx-fixture-root');
  });

  // ESCAPE 1 (found in PR review, reproduced against the built binary): a
  // DANGLING symlink — one that exists but whose own target does not — used
  // to be treated as an ordinary not-yet-existing path component, because
  // `fs.realpathSync` fails identically for "never existed" and "exists but
  // its target doesn't", and the old walk could not tell those apart. The OS
  // still follows a dangling link on write, so this must refuse exactly like
  // an escaping REAL symlink does.
  it('throws when the final path component is a dangling symlink pointing outside the root', async () => {
    const dir = await makeRoot();
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink('/definitely/does/not/exist/frontx-dangling-outside-target.txt', path.join(dir, 'app', 'README.md'));

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'README.md'))).toThrow(
      /outside the project root/,
    );
  });

  // The legitimate mirror of the above: a project may contain its own
  // dangling symlink (e.g. a not-yet-materialized generated file) as long as
  // its target still lands inside the root — only an escape past the root is
  // refused.
  it('does not throw when the final path component is a dangling symlink pointing inside the root', async () => {
    const dir = await makeRoot();
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink(path.join(dir, 'app', 'generated.txt'), path.join(dir, 'app', 'README.md'));

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'README.md'))).not.toThrow();
  });

  // The same shape, one level up: a dangling symlink in an INTERMEDIATE
  // position (not the final component being written) has to be caught too —
  // the old walk-up-to-nearest-existing-ancestor algorithm could climb
  // straight past it as just another unresolved segment.
  it('throws when an INTERMEDIATE path component is a dangling symlink pointing outside the root', async () => {
    const dir = await makeRoot();
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink('/definitely/does/not/exist/frontx-dangling-outside-dir', path.join(dir, 'app', 'src'));

    expect(() => assertPathWithinProjectRoot(dir, path.join(dir, 'app', 'src', 'index.ts'))).toThrow(
      /outside the project root/,
    );
  });
});

describe('createFsWriteProjectStateFn containment (escape 2 — the project-state writer)', () => {
  let root: string;
  let outsideDir: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
    root = '';
    outsideDir = '';
  });

  async function makeRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'frontx-pstate-containment-root-'));
    root = dir;
    return dir;
  }

  // ESCAPE 2 (found in PR review, reproduced against the built binary):
  // `createFsWriteProjectStateFn` performed no containment check at all — a
  // `.frontx` symlink escaping the project root let `register`/`unregister`/
  // `ownership add|remove` write `project.json` anywhere on disk.
  it('refuses to write project.json when .frontx is a symlink leaving the root, writing nothing outside', async () => {
    const dir = await makeRoot();
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-pstate-outside-'));
    await symlink(outsideDir, path.join(dir, '.frontx'));
    const writeProjectState = createFsWriteProjectStateFn();

    await expect(writeProjectState(path.join(dir, '.frontx', 'project.json'), '{}')).rejects.toThrow(
      /outside the project root/,
    );
    expect(existsSync(path.join(outsideDir, 'project.json'))).toBe(false);
  });

  it('writes project.json normally when .frontx is an ordinary directory inside the root', async () => {
    const dir = await makeRoot();
    const writeProjectState = createFsWriteProjectStateFn();

    await writeProjectState(path.join(dir, '.frontx', 'project.json'), '{"ok":true}');

    expect(await readFile(path.join(dir, '.frontx', 'project.json'), 'utf-8')).toBe('{"ok":true}');
  });
});

describe('fs-upgrade-io containment (createFsWriteDiskFileFn / createFsRenameDiskFileFn / createFsUnlinkDiskFileFn)', () => {
  let root: string;
  let outsideDir: string;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
    root = '';
    outsideDir = '';
  });

  async function makeRoot(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-containment-'));
    root = dir;
    return dir;
  }

  it('createFsWriteDiskFileFn refuses a write whose ancestor is a symlink escaping the root, writing nothing outside', async () => {
    const dir = await makeRoot();
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-outside-'));
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink(outsideDir, path.join(dir, 'app', 'src'));
    const writeDiskFile = createFsWriteDiskFileFn(dir);

    await expect(writeDiskFile(path.join(dir, 'app', 'src', 'index.ts'), 'payload')).rejects.toThrow(
      /outside the project root/,
    );
    expect(existsSync(path.join(outsideDir, 'index.ts'))).toBe(false);
  });

  it('createFsRenameDiskFileFn refuses a rename whose destination escapes the root via a symlinked ancestor', async () => {
    const dir = await makeRoot();
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-outside-'));
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink(outsideDir, path.join(dir, 'app', 'src'));
    const from = path.join(dir, 'staged.tmp');
    await writeFile(from, 'payload', 'utf-8');
    const renameDiskFile = createFsRenameDiskFileFn(dir);

    await expect(renameDiskFile(from, path.join(dir, 'app', 'src', 'index.ts'))).rejects.toThrow(
      /outside the project root/,
    );
    expect(existsSync(path.join(outsideDir, 'index.ts'))).toBe(false);
  });

  it('createFsUnlinkDiskFileFn refuses a removal whose path escapes the root via a symlinked ancestor', async () => {
    const dir = await makeRoot();
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-outside-'));
    await writeFile(path.join(outsideDir, 'keep.txt'), 'do not delete me', 'utf-8');
    await mkdir(path.join(dir, 'app'), { recursive: true });
    await symlink(outsideDir, path.join(dir, 'app', 'src'));
    const unlinkDiskFile = createFsUnlinkDiskFileFn(dir);

    await expect(unlinkDiskFile(path.join(dir, 'app', 'src', 'keep.txt'))).rejects.toThrow(/outside the project root/);
    expect(existsSync(path.join(outsideDir, 'keep.txt'))).toBe(true);
  });

  it('createFsWriteDiskFileFn allows a symlink that stays inside the root, and writes the real target', async () => {
    const dir = await makeRoot();
    await mkdir(path.join(dir, 'app', 'real-src'), { recursive: true });
    await symlink(path.join(dir, 'app', 'real-src'), path.join(dir, 'app', 'src'));
    const writeDiskFile = createFsWriteDiskFileFn(dir);

    await writeDiskFile(path.join(dir, 'app', 'src', 'index.ts'), 'payload');

    expect(await readFile(path.join(dir, 'app', 'real-src', 'index.ts'), 'utf-8')).toBe('payload');
  });

  it('createFsWriteDiskFileFn is unaffected for an ordinary write inside the root, no symlinks involved', async () => {
    const dir = await makeRoot();
    const writeDiskFile = createFsWriteDiskFileFn(dir);

    await writeDiskFile(path.join(dir, 'app', 'src', 'index.ts'), 'payload');

    expect(await readFile(path.join(dir, 'app', 'src', 'index.ts'), 'utf-8')).toBe('payload');
  });
});

describe('fs-ai-bundle containment (createFsCopyBundleFn / createFsRemoveBundleFn)', () => {
  let sourceRoot: string;
  let destRoot: string;
  let outsideDir: string;
  const MANIFEST_NAME = 'acme/fixture-template';

  afterEach(async () => {
    if (sourceRoot) await rm(sourceRoot, { recursive: true, force: true });
    if (destRoot) await rm(destRoot, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
    sourceRoot = '';
    destRoot = '';
    outsideDir = '';
  });

  async function writeSourceBundle(root: string): Promise<void> {
    const bundleDir = path.join(root, '.frontx', 'ai', MANIFEST_NAME);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(path.join(bundleDir, 'extension.json'), JSON.stringify({ name: MANIFEST_NAME }));
  }

  it('createFsCopyBundleFn refuses when the destination project root resolves outside via a symlinked ancestor', async () => {
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-source-'));
    await writeSourceBundle(sourceRoot);
    destRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-dest-'));
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-outside-'));
    // `.frontx` itself is the escaping symlink here — the whole bundle
    // convention folder lives under it.
    await symlink(outsideDir, path.join(destRoot, '.frontx'));
    const copyBundle: CopyBundleFn = createFsCopyBundleFn();

    await expect(copyBundle(sourceRoot, destRoot, MANIFEST_NAME)).rejects.toThrow(/outside the project root/);
    expect(existsSync(path.join(outsideDir, 'ai', MANIFEST_NAME))).toBe(false);
  });

  it('createFsRemoveBundleFn refuses when the target project root resolves outside via a symlinked ancestor', async () => {
    destRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-dest-'));
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-outside-'));
    await mkdir(path.join(outsideDir, 'ai', MANIFEST_NAME), { recursive: true });
    await writeFile(path.join(outsideDir, 'ai', MANIFEST_NAME, 'keep.txt'), 'do not delete me', 'utf-8');
    await symlink(outsideDir, path.join(destRoot, '.frontx'));
    const removeBundle: RemoveBundleFn = createFsRemoveBundleFn();

    await expect(removeBundle(destRoot, MANIFEST_NAME)).rejects.toThrow(/outside the project root/);
    expect(existsSync(path.join(outsideDir, 'ai', MANIFEST_NAME, 'keep.txt'))).toBe(true);
  });

  it('createFsCopyBundleFn is unaffected for an ordinary destination, no symlinks involved', async () => {
    sourceRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-source-'));
    await writeSourceBundle(sourceRoot);
    destRoot = await mkdtemp(path.join(tmpdir(), 'frontx-ai-bundle-dest-'));
    const copyBundle: CopyBundleFn = createFsCopyBundleFn();

    await copyBundle(sourceRoot, destRoot, MANIFEST_NAME);

    expect(existsSync(path.join(destRoot, '.frontx', 'ai', MANIFEST_NAME, 'extension.json'))).toBe(true);
  });
});

// The one required end-to-end regression: `apply` itself refuses, through
// the REAL project-file writer (`createFsWriteFileFn`, unchanged — the
// guard for this seam lives in `commands/apply.ts`'s own pre-flight pass,
// since `WriteFileFn` is a `CliDeps`-injected value shared by `apply` and
// `seed` with a DIFFERENT applicable root each, whose exact call arity this
// package's `cli.test.ts` dispatch suite already asserts — see `commands/
// apply.ts`'s own containment-fix comment for the full reasoning). This
// suite's harness cannot be `__tests__/entry-flows.test.ts`'s: that suite's
// `writeFileFn`/`canonicalizeFn` are pure in-memory fakes with no real
// filesystem access at all, so it cannot honestly model an actual escaping
// symlink the way this file's real-temp-directory harness can.
describe('apply end-to-end containment (runApplyPipeline with the real project-file writer)', () => {
  let repoRoot: string;
  let outsideDir: string;

  afterEach(async () => {
    if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
    repoRoot = '';
    outsideDir = '';
  });

  function manifest(name: string): Record<string, unknown> {
    return { name, version: '1.0.0', excludedSubtrees: [], description: `Fixture template "${name}"` };
  }

  it('refuses INVALID_PATH, writing nothing outside the project, when a payload path resolves through an escaping symlink', async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), 'frontx-apply-containment-repo-'));
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-apply-containment-outside-'));
    // The exact reproduction from the PR-review defect: the target directory
    // exists, and the path segment BELOW it has been replaced with a
    // symlink to somewhere outside the project.
    await mkdir(path.join(repoRoot, 'app'), { recursive: true });
    await symlink(outsideDir, path.join(repoRoot, 'app', 'src'));

    const templateName = '@acme/t';
    const installedEntries = new Map<string, InventoryEntry>();
    installedEntries.set(templateName, {
      name: templateName,
      source: `github:acme/t@v1`,
      ref: 'v1',
      status: InventoryState.INSTALLED,
      content: JSON.stringify(manifest(templateName)),
    });
    const templateContent = new Map<string, ContentItem[]>([
      [templateName, [{ path: 'src/index.ts', content: 'hello' }]],
    ]);

    let projectStateContent: string | null = JSON.stringify({
      formatVersion: 1,
      templates: { [templateName]: { origin: `github:acme/t@v1`, version: '1.0.0', targets: [] } },
      projectOwnedRoots: [],
    } satisfies ProjectStateDocument);

    const inventory: UniformApplyInventoryPort = {
      lookup: (name) => installedEntries.get(name),
      install: vi.fn(async () => ({ ok: false as const, error: { message: 'install not stubbed for this test' } })),
    };
    const readInstalledContentFn: ReadInstalledContentFn = async (installedContentPath) =>
      templateContent.get(installedContentPath) ?? [];
    // Nothing pre-exists at the target from this reconciliation's point of
    // view — this test's own escaping symlink is a REAL on-disk fixture
    // proven by the write-time guard, not by existing-content reconciliation.
    const readExistingContentFn: ReadExistingContentFn = async () => [];
    const canonicalizeFn: CanonicalizeTargetFn = (rawTarget) => rawTarget;
    const readProjectStateFn: ReadProjectStateFn = async () => projectStateContent;
    const writeProjectStateFn: WriteProjectStateFn = async (_absolutePath, content) => {
      projectStateContent = content;
    };
    const readFileFn: ReadFileFn = vi.fn(async () => {
      throw new Error('readFileFn not stubbed for this test');
    });
    const bundleExistsFn: BundleExistsFn = vi.fn(async () => false);
    const copyBundleFn: CopyBundleFn = vi.fn(async () => undefined);
    const removeBundleFn: RemoveBundleFn = vi.fn(async () => undefined);

    const deps: ApplyPipelineDeps = {
      inventory,
      fetchFn: vi.fn(async () => ''),
      readFileFn,
      canonicalizeFn,
      existsFn: vi.fn(async () => true),
      listFolderFilesFn: vi.fn(async () => []),
      resolveInstalledContentPathFn: (name: string) => name,
      readInstalledContentFn,
      readExistingContentFn,
      // The REAL adapter — this is the exact seam the reported defect wrote
      // through.
      writeFileFn: createFsWriteFileFn() as WriteFileFn,
      readProjectStateFn,
      writeProjectStateFn,
      bundleExistsFn,
      copyBundleFn,
      removeBundleFn,
      // The REAL containment guard, curried over the REAL repository root —
      // this is what actually refuses the escape below.
      assertPathWithinRootFn: createFsAssertPathWithinRootFn(repoRoot),
    };

    const result = await runApplyPipeline({ templates: { [templateName]: ['app'] } }, repoRoot, false, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_PATH');
    // The heart of the regression: nothing was written outside the project,
    // and the project state document was never mutated to record the
    // target as applied.
    expect(existsSync(path.join(outsideDir, 'index.ts'))).toBe(false);
    expect(JSON.parse(projectStateContent ?? 'null').templates[templateName].targets).toEqual([]);
  });

  // ESCAPE 1's exact end-to-end reproduction: `mkdir -p app && ln -s
  // /outside/nonexistent.txt app/README.md`, then `apply` a template whose
  // payload lands on `app/README.md`. The dangling link's own target does
  // not exist, so the old containment walk treated it as an ordinary
  // not-yet-existing path and let the write through.
  it('refuses INVALID_PATH, writing nothing outside the project, when a payload path resolves through a dangling symlink pointing outside', async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), 'frontx-apply-dangling-repo-'));
    outsideDir = await mkdtemp(path.join(tmpdir(), 'frontx-apply-dangling-outside-'));
    const outsideTarget = path.join(outsideDir, 'nonexistent.txt');
    await mkdir(path.join(repoRoot, 'app'), { recursive: true });
    await symlink(outsideTarget, path.join(repoRoot, 'app', 'README.md'));

    const templateName = '@acme/t';
    const installedEntries = new Map<string, InventoryEntry>();
    installedEntries.set(templateName, {
      name: templateName,
      source: `github:acme/t@v1`,
      ref: 'v1',
      status: InventoryState.INSTALLED,
      content: JSON.stringify(manifest(templateName)),
    });
    const templateContent = new Map<string, ContentItem[]>([
      [templateName, [{ path: 'README.md', content: 'hello' }]],
    ]);

    let projectStateContent: string | null = JSON.stringify({
      formatVersion: 1,
      templates: { [templateName]: { origin: `github:acme/t@v1`, version: '1.0.0', targets: [] } },
      projectOwnedRoots: [],
    } satisfies ProjectStateDocument);

    const inventory: UniformApplyInventoryPort = {
      lookup: (name) => installedEntries.get(name),
      install: vi.fn(async () => ({ ok: false as const, error: { message: 'install not stubbed for this test' } })),
    };
    const readInstalledContentFn: ReadInstalledContentFn = async (installedContentPath) =>
      templateContent.get(installedContentPath) ?? [];
    const readExistingContentFn: ReadExistingContentFn = async () => [];
    const canonicalizeFn: CanonicalizeTargetFn = (rawTarget) => rawTarget;
    const readProjectStateFn: ReadProjectStateFn = async () => projectStateContent;
    const writeProjectStateFn: WriteProjectStateFn = async (_absolutePath, content) => {
      projectStateContent = content;
    };
    const readFileFn: ReadFileFn = vi.fn(async () => {
      throw new Error('readFileFn not stubbed for this test');
    });
    const bundleExistsFn: BundleExistsFn = vi.fn(async () => false);
    const copyBundleFn: CopyBundleFn = vi.fn(async () => undefined);
    const removeBundleFn: RemoveBundleFn = vi.fn(async () => undefined);

    const deps: ApplyPipelineDeps = {
      inventory,
      fetchFn: vi.fn(async () => ''),
      readFileFn,
      canonicalizeFn,
      existsFn: vi.fn(async () => true),
      listFolderFilesFn: vi.fn(async () => []),
      resolveInstalledContentPathFn: (name: string) => name,
      readInstalledContentFn,
      readExistingContentFn,
      writeFileFn: createFsWriteFileFn() as WriteFileFn,
      readProjectStateFn,
      writeProjectStateFn,
      bundleExistsFn,
      copyBundleFn,
      removeBundleFn,
      assertPathWithinRootFn: createFsAssertPathWithinRootFn(repoRoot),
    };

    const result = await runApplyPipeline({ templates: { [templateName]: ['app'] } }, repoRoot, false, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_PATH');
    expect(existsSync(outsideTarget)).toBe(false);
    expect(JSON.parse(projectStateContent ?? 'null').templates[templateName].targets).toEqual([]);
  });
});
