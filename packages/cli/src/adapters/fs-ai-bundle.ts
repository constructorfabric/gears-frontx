// Real fs-backed seams for `../scaffold/ai-bundle.ts`
// (`cpt-frontx-algo-cli-scaffolding-ai-bundle`). Thin fs wrappers behind the
// `BundleExistsFn`/`CopyBundleFn`/`RemoveBundleFn` seams that module's pure
// logic depends on — matching `fs-project-io.ts`'s own convention of a real
// adapter per injected seam type, kept in its own file rather than added to
// that one since neither concern shares any code with the other.
//
// A directory copy/remove, unlike `fs-project-io.ts`'s project-state-store
// write, has no atomicity requirement to uphold: the bundle is a read-only
// convention folder the CLI copies verbatim or deletes outright, never a
// document a partial write could corrupt into an unparseable state. So
// `fs.cpSync`/`fs.rmSync` are used directly rather than through a
// temp-then-rename step.
import fs from 'node:fs';
import path from 'node:path';
import type { BundleExistsFn, CopyBundleFn, RemoveBundleFn } from '../scaffold/ai-bundle';
import { assertPathWithinProjectRoot } from './fs-project-io';

// The one place `.frontx/ai/<manifestName>/` is spelled, from either a
// template's installed content path (source) or the project root (dest) —
// both sides use the identical convention, so this is the single function
// both real seams below resolve their working path through, rather than
// each re-deriving the same join independently. `path.join` (not a manual
// `/`-join) because `manifestName` legitimately carries its own `/`
// (a scoped identity of the `@scope/package` shape), which `path.join` folds
// into the same platform-native segments as `root` itself.
function bundlePath(root: string, manifestName: string): string {
  return path.join(root, '.frontx', 'ai', manifestName);
}

function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Real `BundleExistsFn` — true when something stands at the bundle path,
 * decided with `lstat` semantics rather than `existsSync`'s.
 *
 * DANGLING-SYMLINK-INVISIBLE FIX (MEDIUM, reproduced against the built
 * binary): `existsSync` FOLLOWS the final path component, so a dangling
 * symlink left at `.frontx/ai/<manifestName>/` — its own target already
 * removed, the link itself still present — read as absent. That let
 * `delete` on a name's last target report success with no `aiBundleResidue`
 * while the dangling link survived on disk, which is exactly the state
 * `createFsCopyBundleFn`'s own fix below has to defend against on the next
 * `apply`. `lstat` reports the entry AT that path without dereferencing it:
 * a symlink is "there" whether or not what it points to is, matching how
 * `assertPathWithinProjectRoot`'s own dangling-symlink handling (`./
 * fs-project-io.ts`) already treats a dangling link as a real entry rather
 * than an ordinary not-yet-existing path. Only `ENOENT` — nothing at all
 * standing at the path — means absent; any other `lstat` failure (e.g. a
 * permission error) propagates rather than silently reading as "no bundle
 * here", the same asymmetry `createFsUnlinkDiskFileFn` (`./fs-upgrade-io.
 * ts`) draws between "already gone" and every other failure. */
export function createFsBundleExistsFn(): BundleExistsFn {
  return async function bundleExists(root: string, manifestName: string): Promise<boolean> {
    try {
      fs.lstatSync(bundlePath(root, manifestName));
      return true;
    } catch (error) {
      if (isEnoent(error)) return false;
      throw error;
    }
  };
}

// SYMLINK-ABORT FIX (HIGH, reproduced against the built binary): replacing
// `.frontx/ai/<manifestName>/` with a symlink to a path inside the project
// that does not exist, then applying again, used to hand `fs.cpSync` a
// destination whose final component is a symlink. `cpSync` calls
// `fs.statSync(dest)` internally to decide whether it is copying onto a
// file or a directory; `statSync` DEREFERENCES a symlink, and dereferencing
// one whose target does not exist throws libuv's own `filesystem_error` —
// not a catchable `Error` a JS `try`/`catch` around this module's own
// `copyBundle` call ever sees, an uncaught C++ exception that aborts the
// whole process (`libc++abi: terminating due to uncaught exception`). No
// envelope is emitted, and by the time it aborts the payload for the NEW
// target may already be on disk while `project.json` still says `targets:
// []` — the crash lands after materialization, before the record write.
//
// Removing whatever stands at `dest` before ever calling `cpSync` is
// therefore not merely a crash-avoidance measure but the behaviour ADR 0031
// already assigns this path: "`.frontx` is excluded from every template's
// ownership... The CLI itself materializes that bundle as a CLI-owned
// step... No template ever claims this path through `excludedSubtrees` or
// any other ownership declaration; the CLI, not the template, is the sole
// writer and remover of `.frontx/ai/<manifest-name>/`" (`architecture/ADR/
// 0031-template-ownership-boundary-declaration.md`). Since nothing else is
// ever entitled to have placed content at this exact path, replacing
// whatever is found there — dangling symlink, live symlink, or (the
// ordinary case) nothing at all — is the CLI reclaiming its own ground, not
// a destructive guess. Only the LINK ITSELF is ever removed (`fs.unlinkSync`
// on a symlink removes the directory entry, never walks into or deletes
// whatever the link points at), so a LIVE symlink's real target — reachable
// from elsewhere in the project — is left untouched; only the stale
// reference to it at this one path is cleared, exactly as the containment
// guard above already resolved it (a `dest` whose real, or dangling-lexical,
// target lands outside the project root was already refused before this
// point runs). An ordinary pre-existing directory at `dest` (e.g. a
// same-version reapply) is left exactly as it was — `cpSync`'s own
// recursive merge already handles that case correctly, and this guard fires
// on nothing but a symlink.
function removeSymlinkAt(dest: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(dest);
  } catch (error) {
    if (isEnoent(error)) return; // ordinary case: nothing there yet
    throw error;
  }
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(dest);
  }
}

/** Real `CopyBundleFn` — copies the source's bundle folder into the
 * destination verbatim, creating every parent directory the destination
 * needs. `fs.cpSync`'s own `recursive: true` walks the whole convention
 * folder (extension.json, guidelines/, workflows/, skills/ — whatever a
 * template's real bundle carries), so no bespoke walker is needed here.
 *
 * CONTAINMENT ESCAPE FIX: `dest` is proven to stay inside `destRoot`
 * (the project root every real caller passes here), symlinks resolved,
 * before anything is created or copied — `assertPathWithinProjectRoot`
 * (`./fs-project-io.ts`) is the ONE shared check every adapter that writes
 * into a project uses. `destRoot` is an ordinary argument on this seam
 * already, unlike `WriteFileFn`/`RemoveProjectFileFn`, so no factory-level
 * threading is needed here. */
export function createFsCopyBundleFn(): CopyBundleFn {
  return async function copyBundle(sourceRoot: string, destRoot: string, manifestName: string): Promise<void> {
    const source = bundlePath(sourceRoot, manifestName);
    const dest = bundlePath(destRoot, manifestName);
    assertPathWithinProjectRoot(destRoot, dest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    removeSymlinkAt(dest);
    fs.cpSync(source, dest, { recursive: true });
  };
}

/** Real `RemoveBundleFn` — removes the bundle folder recursively; a no-op
 * (never a throw) when it is already absent, matching every other adapter
 * in this codebase that treats "already gone" as success rather than an
 * error the caller has to guard against separately.
 *
 * Proven to stay inside `root`, symlinks resolved, before the removal — see
 * `createFsCopyBundleFn` above for why this check exists. */
export function createFsRemoveBundleFn(): RemoveBundleFn {
  return async function removeBundle(root: string, manifestName: string): Promise<void> {
    const dest = bundlePath(root, manifestName);
    assertPathWithinProjectRoot(root, dest);
    fs.rmSync(dest, { recursive: true, force: true });
  };
}
