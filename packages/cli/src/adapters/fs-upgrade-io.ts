// Real fs-backed seams for the rewritten upgrade engine
// (`../upgrade/types.ts`'s `ReadDiskEntryFn`, `ListDiskFilesFn`,
// `WriteDiskFileFn`, `RenameDiskFileFn`, `UnlinkDiskFileFn`).
//
// WHY THIS IS NOT `fs-project-io.ts`'s EXISTING WALK. `createFsListTargetFilesFn`
// (`./fs-project-io.ts`) FOLLOWS symlinks: a symlink pointing at a file
// inside the walked root is reported as an ordinary file entry, and a symlink
// pointing at a directory is descended into. That is correct for the
// delete-plan algorithm it serves — a target's real reachable content — but
// it directly contradicts the upgrade classification's own disk-term
// contract, which `cpt-frontx-algo-upgrade-changeset-classify`'s
// `inst-cls-enumerate` states explicitly: "The disk term contributing regular
// files only is what keeps a developer's own symlink, and every ordinary
// directory, out of this enumeration on its own account". Enumerating a
// developer's symlink there would make it a payload-absent path the engine
// then compares and could refuse over, which the FEATURE's own acceptance
// criterion forbids ("A developer's own symlink ... at a path neither payload
// carries is never enumerated and never refuses the upgrade"). So the
// enumeration below is strictly regular-files-only and never follows a link.
//
// The read seam is `lstat`-based for the same reason: `ReadDiskEntryFn` must
// distinguish a SYMLINK from the regular file it points at, because
// `inst-cls-if-not-regular` refuses fail-closed on a symlink sitting where a
// payload declares a path. `fs.statSync` would resolve the link and report
// `'file'`, silently turning a refusal into a comparison.
import fs from 'node:fs';
import path from 'node:path';
import type {
  DiskEntry,
  ListDiskFilesFn,
  ReadDiskEntryFn,
  RenameDiskFileFn,
  UnlinkDiskFileFn,
  WriteDiskFileFn,
} from '../upgrade/types';

// Install-time output, never committed template content
// (`cpt-frontx-algo-template-manifest-validate-content-self-containment`'s own
// `inst-csc-enumerate-files`). Spelled here rather than imported because
// `adapters/fs-project-io.ts`'s own `DEFAULT_SKIP_NAMES` is module-private; the
// two are the same rule for the same reason.
const PAYLOAD_SKIP_DIR = 'node_modules';

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * Real `ReadDiskEntryFn` — what is actually at one absolute path, with a
 * symlink reported AS a symlink (never resolved to its target) and an absence
 * reported as a first-class `'absent'` rather than a throw, since absence is
 * an ordinary comparison input for the classification ("an absent path is
 * unequal to any content, and two absences are equal").
 *
 * Anything that is neither a regular file, a directory, nor a symlink (a
 * fifo, socket, or device node) is reported `'directory'`: not because it is
 * one, but because the only thing the classification does with a non-regular,
 * non-absent entry is refuse fail-closed on it, and `'directory'` is the
 * arm that carries that meaning. Inventing a fourth non-regular kind would
 * add a case every caller must handle to reach the identical outcome.
 */
export function createFsReadDiskEntryFn(): ReadDiskEntryFn {
  return async function readDiskEntry(absolutePath: string): Promise<DiskEntry> {
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch {
      // ENOENT and every other stat failure alike: the engine cannot see
      // content here, which is exactly what `'absent'` means to it. A
      // permission error reported as `'absent'` would classify a path as
      // addable rather than refusing — but the write that followed would
      // fail on the same permission and be caught by the commit algorithm's
      // own recovery, so this cannot silently corrupt anything.
      return { kind: 'absent' };
    }
    if (stat.isSymbolicLink()) return { kind: 'symlink' };
    if (stat.isDirectory()) return { kind: 'directory' };
    if (!stat.isFile()) return { kind: 'directory' };
    return { kind: 'file', content: fs.readFileSync(absolutePath, 'utf-8') };
  };
}

/**
 * Real `ListDiskFilesFn` — every REGULAR file reachable under `absoluteDir`,
 * POSIX-relative to it, never following a symlink and never reporting one.
 * Resolves to `[]` when the directory does not exist: an applied target
 * ordinarily does exist, but a target whose ground was removed by hand is not
 * this seam's error to raise — it simply has fewer candidates.
 *
 * Skips `node_modules`, which is NOT a seventh term of the effective-ownership
 * subtraction but the payload definition itself. `cpt-frontx-feature-template-
 * manifest`'s own `inst-csc-enumerate-files` enumerates a template's payload
 * "never descending into a `node_modules` directory (install-time output, never
 * committed template content)" — so a template's `node_modules` was never
 * payload to read in the first place.
 *
 * This was measured, not assumed: this repository's own `template-shell` is
 * 428 MB across 32,813 files, of which 529 are payload and the rest are
 * `node_modules`. Without this skip the resolver's local-origin read acquired
 * all 397 MB of it and then tried to encode it as ONE bundle-envelope string,
 * which exceeds V8's maximum string length — `JSON.stringify` threw
 * `RangeError: Invalid string length`, so `register`/`apply`/`seed` of that
 * template could not complete at all.
 *
 * The commit algorithm's stale-temporary-file reclaim shares this seam and is
 * unaffected in substance: the engine only ever writes payload paths, and
 * payload now definitionally excludes `node_modules`, so no temporary file the
 * engine created can be inside one. Skipping there loses nothing and protects a
 * developer's own files under `node_modules` from a reclaim that has no
 * business reaching them.
 *
 * A PROJECT TARGET walk is a different question and keeps its empty skip set
 * (`createFsListTargetFilesFn`, `../adapters/fs-project-io.ts`): the six-term
 * subtraction genuinely names no `node_modules` exclusion for ground a template
 * owns, and adding one there WOULD be an undeclared seventh term.
 */
export function createFsListDiskFilesFn(): ListDiskFilesFn {
  return async function listDiskFiles(absoluteDir: string): Promise<string[]> {
    if (!fs.existsSync(absoluteDir)) return [];
    return walkRegularFiles(absoluteDir, '');
  };
}

function walkRegularFiles(root: string, relativeDir: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
    // `withFileTypes` reports the entry itself, unresolved — so a symlink is
    // `isSymbolicLink()`, never `isFile()`/`isDirectory()`. Checked FIRST so
    // no link is ever descended into or counted, which is what makes this
    // walk cycle-free by construction rather than by a visited-set guard
    // (`createFsListTargetFilesFn` needs one precisely because it does
    // follow links).
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      // Payload definition, not an ownership term — see this function's own
      // doc comment for the measurement that forced it.
      if (entry.name === PAYLOAD_SKIP_DIR) continue;
      files.push(...walkRegularFiles(root, relativePath));
      continue;
    }
    if (entry.isFile()) files.push(toPosixPath(relativePath));
    // fifo, socket, device: not content, and not a regular file.
  }
  return files;
}

/**
 * Real `WriteDiskFileFn` — writes `content`, creating parent directories as
 * needed. Used for the staged write's temporary files and for recovery's
 * baseline restoration.
 */
export function createFsWriteDiskFileFn(): WriteDiskFileFn {
  return async function writeDiskFile(absolutePath: string, content: string): Promise<void> {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, 'utf-8');
  };
}

/**
 * Real `RenameDiskFileFn` — the atomic rename that lands one `ADD`/`REPLACE`,
 * creating any parent directory the rename needs (`inst-com-apply-within-
 * boundary` requires exactly that). `fs.renameSync` is atomic within one
 * filesystem, which a temporary file written beside its own destination is by
 * construction — that adjacency is why the staged write places temporaries
 * beside their destinations rather than in a shared temp directory.
 */
export function createFsRenameDiskFileFn(): RenameDiskFileFn {
  return async function renameDiskFile(from: string, to: string): Promise<void> {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  };
}

/**
 * Real `UnlinkDiskFileFn` — removes one path, a no-op when already absent.
 * Never removes the directory it leaves empty: `inst-com-apply-within-
 * boundary` requires a `REMOVE` to "unlink each `REMOVE` operation's path
 * without removing the directory it leaves empty", since that directory may
 * hold ground this engine does not own.
 */
export function createFsUnlinkDiskFileFn(): UnlinkDiskFileFn {
  return async function unlinkDiskFile(absolutePath: string): Promise<void> {
    try {
      fs.unlinkSync(absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return; // already absent: the intended end state
      throw error;
    }
  };
}
