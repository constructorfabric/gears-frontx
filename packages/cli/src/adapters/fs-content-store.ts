// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-algo:cpt-frontx-algo-template-resolution-bounded-update:p1
import { COORDINATION_DIRECTORY, isReservedSlotName } from '../operations/coordination';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUNDLE_MARKER,
  BinaryBundleValue,
  findInvalidBundleKey,
  InvalidBundleKeyError,
  isBinaryBundleValue,
  decodeBundleValue,
  encodeBundleValue,
  readBundleFiles,
} from '../bundle/envelope';
import { MANIFEST_FILENAME } from '../manifest/types';
import type { ContentStorePort } from '../inventory/types';
import { assertWithinRoot, resolveInstalledContentPath } from './fs-installed-content-path';
import { firstNonDirectoryComponentOf, UnreachablePathError } from './fs-project-io';
import { setOwn } from '../own-record';

// Real filesystem CONTENT store — satisfies the `ContentStorePort` seam the
// in-memory `InventoryStore` also satisfies (packages/cli/src/inventory/InventoryStore.ts),
// so `TemplateInventory`'s flow orchestration is unchanged when this adapter
// is injected in its place. Materializes the fetched template content as the
// template's ACTUAL on-disk files under the installed content path — never
// as a single opaque manifest blob held only in memory.
//
// Content shape: the resolver seam (`FetchFn`) returns one opaque string per
// the FEATURE's current resolver contract (network fetch is Phase 10's
// concern, out of scope here). Two shapes are supported so this adapter is
// forward-compatible with a real multi-file fetch without any further change
// to its write contract:
//   - a JSON object mapping relative file path -> file text ("bundle" shape)
//     is materialized as that many real files under the installed content
//     path (the template's actual files together with its manifest);
//   - any other string is materialized as the template's manifest file
//     (`MANIFEST_FILENAME`) at the installed content path root — the one
//     real on-disk file the CLI can derive from today's resolver output.
// The inventory root's coordination directory holds shared reservations
// (`operations/coordination.ts`); a slot there would overwrite or remove them.
function assertNotCoordinationSlot(name: string): void {
  if (isReservedSlotName(name)) {
    throw new Error(`"${name}" names the inventory's reserved "${COORDINATION_DIRECTORY}" directory and cannot be installed.`);
  }
}

export class FsContentStore implements ContentStorePort {
  constructor(private readonly root: string) {}

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write
  write(name: string, content: string): void {
    assertNotCoordinationSlot(name);
    const bundle = readWritableBundle(content);
    const installedPath = resolveInstalledContentPath(this.root, name);
    assertWithinRoot(this.root, installedPath);
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write-guard
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write-guard-fail
    assertPathReachableAsDirectory(installedPath);
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write-guard-fail
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write-guard
    // A FIRST install only ever creates its slot. Anything already standing at an
    // unindexed slot path (typically residue of an install interrupted between
    // content and index writes) is refused, never overlaid: overlaying would make
    // stale bytes part of a later indexed slot. It is left for a person to inspect.
    assertSlotPathAbsent(installedPath);
    fs.mkdirSync(installedPath, { recursive: true });
    writeBundle(this.root, installedPath, content, bundle);
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write

  // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace
  replace(name: string, content: string): void {
    assertNotCoordinationSlot(name);
    const bundle = readWritableBundle(content);
    const installedPath = resolveInstalledContentPath(this.root, name);
    assertWithinRoot(this.root, installedPath);
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace-guard
    // @cpt-begin:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace-guard-fail
    assertPathReachableAsDirectory(installedPath);
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace-guard-fail
    // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace-guard
    // Replace is a full materialization: remove any previously materialized
    // files for this template before writing the newly fetched content, so
    // a file dropped from the new content does not linger on disk.
    //
    // `installedPath` has already been proven, by `assertWithinRoot` above,
    // to resolve inside `this.root` even when it is itself a symlink — so
    // when it IS a symlink, `fs.rmSync` here removes only that symlink's own
    // directory entry (`rm -rf` semantics: a symlink is never dereferenced
    // for removal, only `unlink`ed), never the directory it points at. The
    // outside-the-root case that would matter is exactly what `assertWithinRoot`
    // already refused above, before this line is ever reached.
    if (fs.existsSync(installedPath)) {
      fs.rmSync(installedPath, { recursive: true, force: true });
    }
    fs.mkdirSync(installedPath, { recursive: true });
    writeBundle(this.root, installedPath, content, bundle);
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-bounded-update:p1:inst-bupd-replace

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard
  read(name: string): string | undefined {
    const installedPath = resolveInstalledContentPath(this.root, name);
    // The write side (`write`/`replace` above) has proven, since the
    // previous round, that `installedPath` stays inside `this.root` before
    // ever writing to it. This read side used to trust whatever stood there
    // by the time a caller asked to read it back — including a payload
    // materialized by replacing the installed content path with a symlink to
    // a directory OUTSIDE the store after it was written. `assertWithinRoot`
    // is the SAME containment `write`/`replace` already prove, called here
    // with `'read'` so a refusal names what was actually refused.
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-check
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-fail
    assertWithinRoot(this.root, installedPath, 'read');
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-fail
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-check
    if (!fs.existsSync(installedPath)) return undefined;
    return readBundle(installedPath);
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard
  has(name: string): boolean {
    const installedPath = resolveInstalledContentPath(this.root, name);
    // Same containment as `read` above, proven before this existence probe
    // ever inspects what stands at `installedPath` — see that method's own
    // comment for the fix this closes.
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-check
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-fail
    assertWithinRoot(this.root, installedPath, 'read');
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-fail
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard-check
    return fs.existsSync(installedPath) && fs.readdirSync(installedPath).length > 0;
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-read-guard
}

// A regular file (or any other non-directory entry) standing where an
// installed content path's own ancestor directory belongs — e.g. a scoped
// name `@x/inv` whose `@x` segment is a plain file rather than a directory —
// used to reach `fs.mkdirSync(installedPath, { recursive: true })` unguarded,
// which fails with a bare `ENOTDIR` no caller here catches: the CLI's
// top-level catch has nothing typed to match, so it falls through to a raw
// internal-error exit with no `--json` envelope at all. `firstNonDirectoryComponentOf`
// (`./fs-project-io.ts`) is the SAME primitive `createFsListTargetFilesFn`
// already uses to name this exact shape for an applied project target,
// reused here rather than a second, independently written ancestor walk.
// `UnreachablePathError` is likewise reused — it is already mapped to
// `CONTENT_CONFLICT` at the CLI's top-level catch — rather than inventing a
// bespoke type for a fact that is, from a caller's vantage, identical: a
// path could not be reached because something other than a directory blocks
// the way.
/** Thrown when a first install finds something already at its unindexed slot path. */
export class UnindexedSlotResidueError extends Error {
  constructor(readonly installedPath: string) {
    super(
      `Something already exists at "${installedPath}" although the inventory index records no template there ` +
        '(likely left by an interrupted install); it was not overwritten. Inspect it and move it aside, then retry.',
    );
    this.name = 'UnindexedSlotResidueError';
  }
}

function assertSlotPathAbsent(installedPath: string): void {
  try {
    fs.lstatSync(installedPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new UnindexedSlotResidueError(installedPath);
}

function assertPathReachableAsDirectory(installedPath: string): void {
  const blocking = firstNonDirectoryComponentOf(installedPath);
  if (blocking !== null) {
    throw new UnreachablePathError(installedPath, blocking);
  }
}

// Thrown when the bundle marker is present in the content but the envelope is
// invalid (empty map, non-canonical base64, unrecognised entry type). This is
// distinct from the absent-marker case, which falls through to manifest-only
// mode, and from `InvalidBundleKeyError`, which names a specific unsafe key.
// Exported so tests can distinguish this rejection from other errors.
export class InvalidBundleError extends Error {
  constructor(reason: string) {
    super(`Invalid bundle envelope: ${reason}`);
    this.name = 'InvalidBundleError';
  }
}

// The shared decoder accepts the envelope's wire shape. The content store
// requires a non-empty map of string or BinaryBundleValue entries; any other
// value type (or an empty map) is rejected — a present-but-invalid envelope
// must never fall through to the manifest-only write path. Key validity is
// checked here as an executable last line of defence before `write()` creates
// a directory or `replace()` removes the installed version.
function readWritableBundle(content: string): Record<string, string | Buffer> | undefined {
  const files = readBundleFiles(content);
  if (files === undefined) return undefined; // marker absent → manifest-only fallback
  if (files === null) throw new InvalidBundleError('bundle marker is present but its value is not a plain object map (must not be null, array, or primitive)');
  const invalidKey = findInvalidBundleKey(Object.keys(files));
  if (invalidKey !== undefined) {
    throw new InvalidBundleKeyError(invalidKey.key, invalidKey.reason);
  }
  const entries = Object.entries(files);
  if (entries.length === 0) throw new InvalidBundleError('bundle marker is present but the file map is empty');
  const decoded: Record<string, string | Buffer> = {};
  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      setOwn(decoded, key, value);
    } else if (isBinaryBundleValue(value)) {
      const buf = decodeBundleValue(value);
      if (buf === null) throw new InvalidBundleError(`entry "${key}" has non-canonical base64`);
      setOwn(decoded, key, buf);
    } else {
      throw new InvalidBundleError(`entry "${key}" has unrecognised value type`);
    }
  }
  return decoded;
}

function writeBundle(
  root: string,
  installedPath: string,
  content: string,
  bundle: Record<string, string | Buffer> | undefined,
): void {
  if (!bundle) {
    // Fallback: the only known real file is the manifest itself.
    const manifestPath = path.join(installedPath, MANIFEST_FILENAME);
    assertWithinRoot(root, manifestPath);
    fs.writeFileSync(manifestPath, content, 'utf-8');
    return;
  }
  for (const [relativePath, fileContent] of Object.entries(bundle)) {
    const filePath = path.join(installedPath, relativePath);
    assertWithinRoot(root, filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // Buffer writes exact bytes; string writes UTF-8 (backward compat).
    if (Buffer.isBuffer(fileContent)) {
      fs.writeFileSync(filePath, fileContent);
    } else {
      fs.writeFileSync(filePath, fileContent, 'utf-8');
    }
  }
}

// Reconstructs the canonical content string for a materialized template.
// All files are read as bytes and encoded as BinaryBundleValue so the bundle
// round-trips without loss through any downstream UTF-8 decoding step.
// A single manifest-only install is re-encoded the same way for consistency.
function readBundle(installedPath: string): string {
  const files = listFilesRecursive(installedPath);
  const bundle: Record<string, BinaryBundleValue> = {};
  for (const relativePath of files.sort()) {
    const bytes = fs.readFileSync(path.join(installedPath, relativePath));
    setOwn(bundle, relativePath, encodeBundleValue(bytes));
  }
  return JSON.stringify({ [BUNDLE_MARKER]: bundle });
}

function listFilesRecursive(root: string, relativeDir = ''): string[] {
  const absoluteDir = path.join(root, relativeDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    // POSIX separator, per the envelope's key contract (bundle/envelope.ts):
    // `path.join` would make the round trip promised above lossy on Windows,
    // handing back `src\index.ts` for a key written as `src/index.ts`.
    const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(root, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}
