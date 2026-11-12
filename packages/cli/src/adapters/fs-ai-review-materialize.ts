import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AiReviewSnapshot } from '../operations/ai-review';
import { reviewFsAiCandidate } from './fs-ai-review-capture';

/** The destination no longer matches what was reviewed; a fresh review is required. */
export class AiReviewDriftError extends Error {}

/**
 * Proves every existing component between `root` (exclusive) and `target`
 * (inclusive) is a real directory, never a symlink, creating missing ones one
 * level at a time (non-recursive) and re-proving each after creation.
 * shortcut: Node has no openat/no-follow directory handles, so a cooperating-writer
 * race between this lstat and the following syscall is not excluded; upgrade to
 * descriptor-bound operations if hostile same-user replacement must be resisted.
 */
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function ensurePlainDirectory(root: string, target: string, create: boolean): void {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new AiReviewDriftError(`AI destination escapes the project: ${target}`);
  let current = root;
  for (const part of relative === '' ? [] : relative.split(path.sep)) {
    current = path.join(current, part);
    let stat: fs.Stats | undefined;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !create) throw error;
      fs.mkdirSync(current);
      stat = fs.lstatSync(current);
    }
    if (!stat.isDirectory()) throw new AiReviewDriftError(`AI destination ancestor is not a plain directory: ${current}`);
  }
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function unlinkRegular(root: string, file: string): void {
  ensurePlainDirectory(root, path.dirname(file), false);
  const entry = fs.lstatSync(file);
  if (!entry.isFile() && !entry.isSymbolicLink()) throw new AiReviewDriftError(`AI destination entry is not a regular file or symlink: ${file}`);
  fs.unlinkSync(file);
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function writeRegular(root: string, file: string, bytes: Uint8Array): void {
  ensurePlainDirectory(root, path.dirname(file), true);
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.frontx-tmp`);
  const fd = fs.openSync(temp, 'wx', 0o644);
  try {
    fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  ensurePlainDirectory(root, path.dirname(file), false);
  fs.renameSync(temp, file);
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function removeEmptyDirectory(root: string, directory: string): void {
  ensurePlainDirectory(root, directory, false);
  fs.rmdirSync(directory);
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

/**
 * Makes `<project>/.frontx/ai/<name>/` exactly the reviewed candidate, and only
 * when the destination still is exactly what was reviewed: the current review of
 * the same candidate bytes must reproduce the approved digest (destination
 * identity chain, every existing file hash and directory). Writes come only from
 * the snapshot's bytes. The result is re-captured and verified before returning.
 */
/** Returns the digest of the verified result (the effect hash recorded as `done`). */
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
export function applyFsAiReview(snapshot: AiReviewSnapshot, projectRoot: string, manifestName: string): string {
  const candidate = new Map(snapshot.candidateSnapshot.map(({ path: file, bytes }) => [file, bytes]));
  const current = reviewFsAiCandidate(projectRoot, manifestName, candidate);
  if (current.digest !== snapshot.digest || current.destination.path !== snapshot.destination.path) {
    throw new AiReviewDriftError(`The AI bundle at ${snapshot.destination.path} changed since it was reviewed; review it again.`);
  }
  const root = fs.realpathSync(projectRoot);
  const destination = snapshot.destination.path;
  const kinds = new Map(snapshot.changes.map((c) => [c.path, c.kind]));

  // The approved root symlink is the destination entry itself. Unlink it
  // only after the fresh review above has matched its lstat/readlink identity.
  const destinationEntry = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (destinationEntry?.isSymbolicLink()) {
    ensurePlainDirectory(root, path.dirname(destination), false);
    fs.unlinkSync(destination);
  }

  for (const file of snapshot.existing) {
    if (kinds.get(file.path) === 'local-only') unlinkRegular(root, path.join(destination, file.path));
  }
  const byDepth = (a: string, b: string) => b.split('/').length - a.split('/').length || b.localeCompare(a);
  for (const directory of [...snapshot.existingDirectories].sort(byDepth)) {
    if (kinds.get(directory) === 'local-only-directory') removeEmptyDirectory(root, path.join(destination, directory));
  }
  if (candidate.size === 0) {
    try {
      removeEmptyDirectory(root, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  } else {
    ensurePlainDirectory(root, destination, true);
    for (const directory of [...snapshot.directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
      ensurePlainDirectory(root, path.join(destination, directory), true);
    }
    for (const [file, bytes] of candidate) {
      const kind = kinds.get(file);
      if (kind === 'add' || kind === 'replace') writeRegular(root, path.join(destination, file), bytes);
    }
  }

  const after = reviewFsAiCandidate(projectRoot, manifestName, candidate);
  const exact =
    after.changes.every((c) => c.kind === 'unchanged') &&
    after.existing.length === after.files.length &&
    (candidate.size > 0 || (after.destination.identity as { state?: string }).state === 'absent');
  if (!exact) throw new AiReviewDriftError(`The AI bundle at ${destination} does not match the reviewed candidate after writing.`);
  return after.digest;
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
