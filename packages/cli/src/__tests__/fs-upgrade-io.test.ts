// @cpt-algo:cpt-frontx-algo-upgrade-changeset-classify:p1
//
// Real-filesystem coverage for `createFsReadDiskEntryFn`/`createFsListDiskFilesFn`
// (`../adapters/fs-upgrade-io.ts`) against a genuine special file (a FIFO) —
// the one disk shape no fake `ReadDiskEntryFn`/`ListDiskFilesFn` can honestly
// stand in for, since the defect this suite pins was in the REAL adapter's
// own `stat`-based classification, not in anything a test double could get
// wrong on its own. `mkfifo` (a POSIX utility on every platform this suite
// runs on) creates the node without ever opening it — this suite never opens
// it either, matching the seam's own contract that a special file's content
// is never read.
import path from 'node:path';
import { chmod, mkdtemp, mkdir, rm, writeFile, readFile, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFsReadDiskEntryFn,
  createFsListDiskFilesFn,
  createFsWriteDiskFileFn,
  ReservedTempPathOccupiedError,
} from '../adapters/fs-upgrade-io';
import { RESERVED_TEMP_SUFFIX } from '../paths/reserved-temp-name';
import { makeFifo, fifosAvailable } from './support/fifo';

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) {
    await rm(root, { recursive: true, force: true });
    root = undefined;
  }
});


describe('createFsReadDiskEntryFn — a real special file (FIFO)', () => {
  it.skipIf(!fifosAvailable())('reports a FIFO as {kind: "special"}, never as "directory", without ever opening it', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-special-'));
    const fifoPath = path.join(root, 'pipe');
    makeFifo(fifoPath);

    const readDiskEntry = createFsReadDiskEntryFn(root);
    // If this call ever opened the FIFO for reading, it would hang forever
    // (no writer exists) and this test would time out rather than fail
    // cleanly — the strongest proof this seam has that it never does.
    const entry = await readDiskEntry(fifoPath);

    expect(entry).toEqual({ kind: 'special' });
  });

  it.skipIf(!fifosAvailable())('reports a FIFO standing in for an ancestor directory as "special", never as "directory"', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-special-'));
    const fifoPath = path.join(root, 'pipe');
    makeFifo(fifoPath);

    const readDiskEntry = createFsReadDiskEntryFn(root);
    const entry = await readDiskEntry(fifoPath);

    // The defect this pins: an earlier version of this function returned
    // `{ kind: 'directory' }` here, which `classify.ts`'s ancestor probe
    // treats as ordinary, permitted structure — never flagging a FIFO
    // standing where a directory is required.
    expect(entry.kind).not.toBe('directory');
    expect(entry).toEqual({ kind: 'special' });
  });

  it('reports a real directory as "directory" and a real regular file as "file", unaffected by the special-file change', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-special-'));
    await mkdir(path.join(root, 'dir'));
    await writeFile(path.join(root, 'file.txt'), 'content', 'utf-8');

    const readDiskEntry = createFsReadDiskEntryFn(root);
    expect(await readDiskEntry(path.join(root, 'dir'))).toEqual({ kind: 'directory' });
    const fileEntry = await readDiskEntry(path.join(root, 'file.txt'));
    expect(fileEntry.kind).toBe('file');
    if (fileEntry.kind === 'file') expect(Buffer.isBuffer(fileEntry.content) ? fileEntry.content.toString('utf-8') : fileEntry.content).toBe('content');
    expect(await readDiskEntry(path.join(root, 'does-not-exist.txt'))).toEqual({ kind: 'absent' });
  });
});

describe('createFsWriteDiskFileFn — exclusive-create backstop on a reserved temp path', () => {
  it('creates a reserved temp path that does not yet exist, writing exactly the given content', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-write-'));
    const temp = path.join(root, `new.txt${RESERVED_TEMP_SUFFIX}`);

    const writeDiskFile = createFsWriteDiskFileFn(root);
    await writeDiskFile(temp, 'v2');

    expect(await readFile(temp, 'utf-8')).toBe('v2');
  });

  it('refuses with ReservedTempPathOccupiedError, never following it or writing through it, when a symlink already occupies the reserved temp path', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-write-'));
    const temp = path.join(root, `new.txt${RESERVED_TEMP_SUFFIX}`);
    const victim = path.join(root, 'victim.txt');
    await writeFile(victim, 'PRECIOUS', 'utf-8');
    await symlink(victim, temp);

    const writeDiskFile = createFsWriteDiskFileFn(root);

    await expect(writeDiskFile(temp, 'v2')).rejects.toBeInstanceOf(ReservedTempPathOccupiedError);
    // Never followed the symlink to write through it...
    expect(await readFile(victim, 'utf-8')).toBe('PRECIOUS');
    // ...and never replaced the symlink itself with a regular file either.
    expect((await lstat(temp)).isSymbolicLink()).toBe(true);
  });

  it('still overwrites an ordinary (non-reserved) destination unconditionally, as a REPLACE requires', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-write-'));
    const dest = path.join(root, 'existing.txt');
    await writeFile(dest, 'BASELINE', 'utf-8');

    const writeDiskFile = createFsWriteDiskFileFn(root);
    await writeDiskFile(dest, 'REPLACED');

    expect(await readFile(dest, 'utf-8')).toBe('REPLACED');
  });
});

describe('createFsListDiskFilesFn — a FIFO inside the walked directory', () => {
  it.skipIf(!fifosAvailable())('silently omits a FIFO from the enumerated regular files, without recursing into it or throwing', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-special-list-'));
    await writeFile(path.join(root, 'a.txt'), 'A', 'utf-8');
    makeFifo(path.join(root, 'pipe'));
    await mkdir(path.join(root, 'sub'));
    await writeFile(path.join(root, 'sub', 'b.txt'), 'B', 'utf-8');

    const listDiskFiles = createFsListDiskFilesFn();
    const files = await listDiskFiles(root);

    expect(files.sort()).toEqual(['a.txt', 'sub/b.txt']);
    expect(files).not.toContain('pipe');
  });
});

// A directory the walk cannot read is a refusal, never an empty subtree: a
// `path:` template with an unreadable subdirectory used to install WITHOUT
// that subtree and report success, while the manifest read beside it failed
// closed. Same typed refusal `fs-project-io.ts`'s own walk raises
// (`PathUnreadableError`), which `cli.ts` already reports as
// `CONTENT_CONFLICT` naming the path. Root reads a mode-000 directory anyway.
describe('createFsListDiskFilesFn — an unreadable subdirectory', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('refuses with PathUnreadableError naming the directory, instead of listing the tree without it', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-unreadable-'));
    await writeFile(path.join(root, 'a.txt'), 'A', 'utf-8');
    const locked = path.join(root, 'locked');
    await mkdir(locked);
    await writeFile(path.join(locked, 'hidden.txt'), 'H', 'utf-8');
    await chmod(locked, 0o000);
    try {
      await expect(createFsListDiskFilesFn()(root)).rejects.toMatchObject({ name: 'PathUnreadableError', filePath: locked, errnoCode: 'EACCES' });
    } finally {
      await chmod(locked, 0o700);
    }
  });

  it('still resolves to [] for a directory that does not exist at all', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-absent-'));
    expect(await createFsListDiskFilesFn()(path.join(root, 'never-created'))).toEqual([]);
  });
});

// A symbolic link inside a TEMPLATE's AI bundle is refused explicitly — the
// same rule the resolver applies to a remote archive — instead of being
// skipped (reviewed paths) or copied with a rewritten target (first copy).
// Only a folder carrying the manifest is a template: a project's own
// `.frontx/ai/` (a root target the engine walks) keeps a developer's deployed
// links, which are previewed and unlinked elsewhere, never refused here.
describe('createFsListDiskFilesFn — a symlink inside a template AI bundle', () => {
  it('refuses with AiBundleSymlinkError naming the link when the folder carries the manifest', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-bundle-link-'));
    await writeFile(path.join(root, 'frontx-template.json'), '{}', 'utf-8');
    await mkdir(path.join(root, '.frontx', 'ai', '@x', 'a'), { recursive: true });
    await writeFile(path.join(root, '.frontx', 'ai', '@x', 'a', 'guide.md'), 'g', 'utf-8');
    await symlink('guide.md', path.join(root, '.frontx', 'ai', '@x', 'a', 'alias.md'));

    await expect(createFsListDiskFilesFn()(root)).rejects.toMatchObject({
      name: 'AiBundleSymlinkError',
      templateDir: root,
      linkPath: '.frontx/ai/@x/a/alias.md',
    });
  });

  it('still skips a symlink elsewhere in a template, and any symlink in a folder without a manifest (a project)', async () => {
    root = await mkdtemp(path.join(tmpdir(), 'frontx-upgrade-bundle-link-ok-'));
    await writeFile(path.join(root, 'frontx-template.json'), '{}', 'utf-8');
    await writeFile(path.join(root, 'a.txt'), 'A', 'utf-8');
    await symlink('a.txt', path.join(root, 'elsewhere.txt'));
    expect((await createFsListDiskFilesFn()(root)).sort()).toEqual(['a.txt', 'frontx-template.json']);

    const project = path.join(root, 'project');
    await mkdir(path.join(project, '.frontx', 'ai', '@x', 'a'), { recursive: true });
    await writeFile(path.join(project, 'index.ts'), 'x', 'utf-8');
    await symlink('../../../index.ts', path.join(project, '.frontx', 'ai', '@x', 'a', 'deployed-link.md'));
    expect(await createFsListDiskFilesFn()(project)).toEqual(['index.ts']);
  });
});
