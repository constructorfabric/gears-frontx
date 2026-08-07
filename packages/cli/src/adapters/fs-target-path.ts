/**
 * Filesystem-backed `ReadTargetPathStateFn` for the add flow's occupied-ground
 * guard (cpt-frontx-dod-cli-scaffolding-add-undeclared-content).
 *
 * A pure probe: it reports what stands at one absolute path and judges none of
 * it. Which paths are asked about — and which of them the target's recorded
 * provenance already accounts for — is a rule of the add flow, and lives in
 * `commands/add-template.ts` with the refusal it governs.
 *
 * `stat` RESOLVES symlinks, as the seed guard's `readdir` probe does: a symlink
 * standing at a path the incoming template owns reports what it points at, and a
 * write through it would land on that target, so reporting the link as occupied
 * ground is the answer that refuses. A DANGLING symlink resolves to nothing and
 * would therefore read as free ground, which is the worst answer available: the
 * link is an entry no provenance accounts for, and a write through
 * `claimed.txt -> ../escaped.txt` creates the target OUTSIDE the directory the
 * guard is protecting. `lstat` is consulted for exactly that case, so a link
 * whose target is missing is reported as occupied.
 *
 * @packageDocumentation
 */
import { lstat, stat } from 'node:fs/promises';

import { isErrnoCode } from './is-errno-code';
import type { ReadTargetPathStateFn, TargetPathState } from '../commands/add-template';

/** Builds the real `stat`-backed target-path probe the `frontx` executable uses. */
export function createFsReadTargetPathStateFn(): ReadTargetPathStateFn {
  return async function readTargetPathState(absolutePath: string): Promise<TargetPathState> {
    try {
      const stats = await stat(absolutePath);
      return stats.isDirectory() ? 'directory' : 'file';
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) return (await standsAsDanglingLink(absolutePath)) ? 'file' : 'absent';
      // ENOTDIR: a regular file stands on the way to this path — at the path
      // itself for the target directory, at one of its ancestors for a path
      // beneath it. Nothing can be written here without destroying that file,
      // which is what 'file' reports; calling it absent would wave the assembly
      // through to a write that cannot succeed.
      if (isErrnoCode(error, 'ENOTDIR')) return 'file';
      // Anything else (EACCES, EPERM, EMFILE) is not a statement about what
      // stands here. Rethrowing lets the CLI's top-level handler map it to the
      // internal-error exit code instead of this guard reading an unreadable
      // path as free ground and waving the assembly through.
      throw error;
    }
  };
}

// Whether an entry the resolving `stat` could not find nevertheless exists as a
// link. Only reached on ENOENT, where the two possible worlds are "nothing is
// here" and "a symlink is here whose target is gone" — `lstat` answers for the
// link itself and separates them. A non-ENOENT rejection propagates for the same
// reason it does above: a path this probe cannot read must never be reported as
// free ground.
async function standsAsDanglingLink(absolutePath: string): Promise<boolean> {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return false;
    throw error;
  }
}
