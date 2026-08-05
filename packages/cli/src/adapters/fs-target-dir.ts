/**
 * Filesystem-backed `ReadTargetDirFn` for the seed flow's empty-target guard
 * (cpt-frontx-dod-cli-scaffolding-seed-empty-target).
 *
 * Lives in `adapters/` because it is the only place that touches the platform;
 * `commands/seed-repository.ts` takes the seam as a parameter and stays free of
 * `node:fs`.
 *
 * @packageDocumentation
 */
import { readdir } from 'node:fs/promises';

import type { ReadTargetDirFn } from '../commands/seed-repository';

/** Builds the real `readdir`-backed target-directory probe the `frontx` executable uses. */
export function createFsReadTargetDirFn(): ReadTargetDirFn {
  return async function readTargetDir(path: string): Promise<string[] | undefined> {
    try {
      return await readdir(path);
    } catch (error) {
      // ENOENT means the target does not exist, which the seed flow treats as a
      // directory materialization will create — reported as `undefined` rather
      // than as an empty listing so the caller can tell the two apart.
      if (isErrnoCode(error, 'ENOENT')) return undefined;
      // ENOTDIR: the path exists as a FILE. Reported as an occupied target
      // rather than rethrown, because refusing is what the flow would do with
      // it anyway and the developer's mistake is the same one — aiming seed at
      // something that already exists. Its own name is the evidence.
      if (isErrnoCode(error, 'ENOTDIR')) return [path];
      // Anything else (EACCES, EPERM, EMFILE) is not a statement about
      // emptiness. Rethrowing lets the CLI's top-level handler map it to the
      // internal-error exit code instead of this guard reading an unreadable
      // directory as empty and waving the assembly through.
      throw error;
    }
  };
}

// Node's fs rejections carry a `code`; narrowing through a predicate keeps the
// checks above off `any` and off a cast.
function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
