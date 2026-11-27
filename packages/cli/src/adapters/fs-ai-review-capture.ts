import fs from 'node:fs';
import path from 'node:path';
import { createAiReview, type AiReviewSnapshot, type AiReviewFile } from '../operations/ai-review';

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function readTree(root: string): { files: AiReviewFile[]; directories: string[] } {
  const files: AiReviewFile[] = [];
  const directories: string[] = [];
  const visit = (dir: string, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        directories.push(relative);
        visit(absolute, relative);
      }
      else if (entry.isFile()) files.push({ path: relative, bytes: fs.readFileSync(absolute) });
      // Treat links as reviewable leaf entries using their link text; never
      // follow them (including dangling links or links to directories).
      else if (entry.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(absolute);
        files.push({ path: relative, bytes: Buffer.from(`symlink:${linkTarget}`), linkTarget });
      }
      else throw new Error(`AI review capture rejects unsupported filesystem entry: ${absolute}`);
    }
  };
  visit(root);
  return { files, directories };
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function treeState(root: string): 'present' | 'absent' | 'symlink' {
  try {
    const stat = fs.lstatSync(root);
    if (stat.isSymbolicLink()) return 'symlink';
    if (!stat.isDirectory()) throw new Error(`AI review capture requires a directory: ${root}`);
    return 'present';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw error;
  }
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function identity(destination: string, sourceState: 'present' | 'absent'): object {
  const chain: { path: string; dev: number; ino: number }[] = [];
  let current = destination;
  let state = 'absent';
  for (;;) {
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!stat) { current = path.dirname(current); continue; }
    if (current === destination && stat.isSymbolicLink()) {
      chain.push({ path: current, dev: stat.dev, ino: stat.ino, type: 'symlink', target: fs.readlinkSync(current) } as never);
      const parent = path.dirname(current);
      current = parent;
      continue;
    }
    if (!stat.isDirectory()) throw new Error(`AI review capture cannot verify destination ancestor: ${current}`);
    if (current === destination) state = 'present';
    chain.push({ path: current, dev: stat.dev, ino: stat.ino });
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return { state, sourceState, ancestors: chain };
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

/** Each existing component from `directory` up to (excluding) `root` must be a real directory, not a link. */
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function assertPlainChain(directory: string, root: string): void {
  for (let current = directory; current !== root && current !== path.dirname(current); current = path.dirname(current)) {
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isDirectory()) throw new Error(`AI review capture cannot verify source ancestor: ${current}`);
  }
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

/** Read-only filesystem capture; does not authorize or perform materialization. */
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
export function captureFsAiReview(sourceRoot: string, projectRoot: string, manifestName: string): AiReviewSnapshot {
  const realSourceRoot = fs.realpathSync(sourceRoot);
  const source = path.join(realSourceRoot, '.frontx', 'ai', manifestName);
  const destination = path.join(fs.realpathSync(projectRoot), '.frontx', 'ai', manifestName);
  // Every ancestor is proven a plain directory BEFORE either tree is read, so a
  // symlinked `.frontx`/`ai` component can never redirect the reads outside.
  assertPlainChain(path.dirname(source), realSourceRoot);
  const sourceState = treeState(source);
  const destinationIdentity = identity(destination, sourceState === 'present' ? 'present' : 'absent');
  const destinationState = treeState(destination);
  const candidate = sourceState === 'present' ? readTree(source) : { files: [], directories: [] };
  const existing = destinationState === 'present' ? readTree(destination) : { files: [], directories: [] };
  return createAiReview({ path: destination, identity: destinationIdentity }, candidate.files, existing.files, candidate.directories, existing.directories);
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

/** Every directory implied by a set of relative file paths. */
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function impliedDirectories(paths: Iterable<string>): string[] {
  const dirs = new Set<string>();
  for (const file of paths) {
    const parts = file.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  return [...dirs].sort();
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

/**
 * Read-only review of replacing `<project>/.frontx/ai/<name>/` with exactly the
 * given candidate bytes (`undefined`/empty = the candidate ships no bundle, so the
 * destination is to be absent). The destination's ancestor identity is proven
 * before its tree is read; the candidate bytes are copied into the snapshot.
 */
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
export function reviewFsAiCandidate(
  projectRoot: string,
  manifestName: string,
  candidate: ReadonlyMap<string, Uint8Array> | undefined,
): AiReviewSnapshot {
  const destination = path.join(fs.realpathSync(projectRoot), '.frontx', 'ai', manifestName);
  const files = [...(candidate ?? new Map<string, Uint8Array>())].map(([file, bytes]) => ({ path: file, bytes }));
  const sourceState = files.length > 0 ? 'present' : 'absent';
  const destinationIdentity = identity(destination, sourceState);
  const existing = treeState(destination) === 'present' ? readTree(destination) : { files: [], directories: [] };
  return createAiReview(
    { path: destination, identity: destinationIdentity },
    files,
    existing.files,
    impliedDirectories(files.map((f) => f.path)),
    existing.directories,
  );
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
