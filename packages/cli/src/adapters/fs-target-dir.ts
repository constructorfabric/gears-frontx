/**
 * Filesystem-backed `ReadTargetDirFn` for the seed flow's empty-target guard
 * (cpt-frontx-dod-cli-scaffolding-seed-empty-target).
 *
 * A pure listing: it reports what is on disk and judges none of it. Which
 * entries count as content — and which are version-control metadata or platform
 * droppings the guard ignores — is a rule of the seed flow, and lives in
 * `commands/seed-repository.ts` with the refusal it governs.
 *
 * Two properties worth knowing at the call site. The probe **resolves through
 * symlinks** (`readdir` follows the final component), so a symlink pointing at a
 * populated directory reports that directory's entries and is refused, which is
 * the intended answer. And it does **not** close the check-to-write window: a
 * directory can gain content between this read and materialization's first
 * write. Closing that would need an exclusive-create protocol across every write
 * path, out of proportion to the risk it removes — a developer racing their own
 * `frontx seed` against another process populating the same fresh directory. The
 * guard exists to catch the aimed-at-the-wrong-directory mistake, which is not a
 * race.
 *
 * @packageDocumentation
 */
import { readdir } from 'node:fs/promises';

import { isErrnoCode } from './is-errno-code';
import type { ReadTargetDirFn, TargetDirState } from '../commands/seed-repository';

/** Builds the real `readdir`-backed target-directory probe the `frontx` executable uses. */
export function createFsReadTargetDirFn(): ReadTargetDirFn {
  return async function readTargetDir(path: string): Promise<TargetDirState> {
    try {
      return await readdir(path);
    } catch (error) {
      // ENOENT means the target does not exist, which the seed flow treats as a
      // directory materialization will create — reported as `undefined` rather
      // than as an empty listing so the caller can tell the two apart.
      if (isErrnoCode(error, 'ENOENT')) return undefined;
      // ENOTDIR: the path exists as a FILE. Reported as its own state rather
      // than as a listing, so the flow refuses it truthfully instead of
      // describing a file as a directory that contains itself.
      if (isErrnoCode(error, 'ENOTDIR')) return 'not-a-directory';
      // Anything else (EACCES, EPERM, EMFILE) is not a statement about
      // emptiness. Rethrowing lets the CLI's top-level handler map it to the
      // internal-error exit code instead of this guard reading an unreadable
      // directory as empty and waving the assembly through.
      throw error;
    }
  };
}
