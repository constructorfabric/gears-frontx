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

/** Real `BundleExistsFn` — true when the bundle folder exists (a plain
 * directory presence check; the bundle is never a file at that path). */
export function createFsBundleExistsFn(): BundleExistsFn {
  return async function bundleExists(root: string, manifestName: string): Promise<boolean> {
    return fs.existsSync(bundlePath(root, manifestName));
  };
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
