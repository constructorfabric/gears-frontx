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
 * ground is the answer that refuses. A DANGLING symlink is the one case this
 * probe calls absent while something is on disk: nothing exists at the path it
 * names, and a write would create that file rather than overwrite anything.
 *
 * @packageDocumentation
 */
import { stat } from 'node:fs/promises';

import { isErrnoCode } from './is-errno-code';
import type { ReadTargetPathStateFn, TargetPathState } from '../commands/add-template';

/** Builds the real `stat`-backed target-path probe the `frontx` executable uses. */
export function createFsReadTargetPathStateFn(): ReadTargetPathStateFn {
  return async function readTargetPathState(absolutePath: string): Promise<TargetPathState> {
    try {
      const stats = await stat(absolutePath);
      return stats.isDirectory() ? 'directory' : 'file';
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) return 'absent';
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
