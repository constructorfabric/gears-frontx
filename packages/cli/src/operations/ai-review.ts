import { createHash } from 'node:crypto';
import { canonicalJson } from '../canonical-json';
import { unsafeRelativePathReason } from '../paths/relative-path';

/** Byte-exact, non-mutating AI bundle review material. Bytes remain local; only hashes and sizes are reviewable. */
export interface AiReviewFile {
  path: string;
  bytes: Uint8Array;
  linkTarget?: string;
}

export interface AiDestinationIdentity {
  /** Absolute destination spelling shown to the reviewer. */
  path: string;
  /** Caller supplied physical identity/access-chain verdict; unknown is explicit. */
  identity: unknown;
}

export interface AiReview {
  destination: AiDestinationIdentity;
  files: { path: string; length: number; sha256: string; linkTarget?: string }[];
  existing: { path: string; length: number; sha256: string; linkTarget?: string }[];
  directories: string[];
  existingDirectories: string[];
  changes: { path: string; kind: 'add' | 'replace' | 'unchanged' | 'local-only' | 'add-directory' | 'local-only-directory' }[];
  digest: string;
}

export interface AiReviewSnapshot extends AiReview {
  /** Returns fresh copies; mutating them cannot change the reviewed bytes. */
  candidateSnapshot: readonly AiReviewFile[];
}

export class AiReviewConflictError extends Error {}

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function foldAiPathIdentity(path: string): string {
  return path.normalize('NFC').toLowerCase().toUpperCase().toLowerCase();
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

/** Snapshot metadata for a candidate and destination. This function performs no IO or writes. */
// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
export function createAiReview(destination: AiDestinationIdentity, candidate: readonly AiReviewFile[], existing: readonly AiReviewFile[] = [], directories: readonly string[] = [], existingDirectories: readonly string[] = []): AiReviewSnapshot {
  if (!destination.path || destination.identity === undefined || destination.identity === null) {
    throw new TypeError('AI review requires a destination path and known identity');
  }
  // Identity must be complete JSON data; canonicalJson intentionally omits undefined members.
  assertCanonicalValue(destination.identity);
  const validatePaths = (input: readonly AiReviewFile[]) => {
    const identities = new Map<string, string>();
    for (const { path } of input) {
    const reason = unsafeRelativePathReason(path);
    if (reason) throw new AiReviewConflictError(`Invalid AI bundle path ${JSON.stringify(path)}: ${reason}`);
    const identity = foldAiPathIdentity(path);
    const earlier = identities.get(identity);
    if (earlier !== undefined) throw new AiReviewConflictError(`AI bundle paths collide: ${JSON.stringify(earlier)} and ${JSON.stringify(path)}`);
    identities.set(identity, path);
    }
    for (const { path } of input) {
    const parts = foldAiPathIdentity(path).split('/');
    for (let i = 1; i < parts.length; i++) {
      const parent = identities.get(parts.slice(0, i).join('/'));
      if (parent !== undefined) throw new AiReviewConflictError(`AI bundle path ${JSON.stringify(parent)} conflicts with ${JSON.stringify(path)}`);
    }
    }
  };
  validatePaths(candidate);
  validatePaths(existing);
  const validateDirectories = (dirs: readonly string[], files: readonly AiReviewFile[]) => {
    const identities = new Map<string, string>();
    for (const dir of dirs) {
      const reason = unsafeRelativePathReason(dir);
      if (reason) throw new AiReviewConflictError(`Invalid AI bundle directory ${JSON.stringify(dir)}: ${reason}`);
      const key = foldAiPathIdentity(dir);
      const earlier = identities.get(key);
      if (earlier !== undefined) throw new AiReviewConflictError(`AI bundle directories collide: ${JSON.stringify(earlier)} and ${JSON.stringify(dir)}`);
      if (files.some(file => {
        const fileKey = foldAiPathIdentity(file.path);
        return fileKey === key || key.startsWith(`${fileKey}/`);
      })) throw new AiReviewConflictError(`AI bundle directory conflicts: ${JSON.stringify(dir)}`);
      identities.set(key, dir);
    }
  };
  validateDirectories(directories, candidate);
  validateDirectories(existingDirectories, existing);
  const crossTreeConflict = (files: readonly AiReviewFile[], dirs: readonly string[], otherFiles: readonly AiReviewFile[], otherDirs: readonly string[]) => {
    const filePaths = files.map(file => file.path);
    const otherFilePaths = otherFiles.map(file => file.path);
    for (const file of filePaths) for (const other of otherFilePaths) {
      const a = foldAiPathIdentity(file), b = foldAiPathIdentity(other);
      if (a !== b && (a.startsWith(`${b}/`) || b.startsWith(`${a}/`))) throw new AiReviewConflictError(`AI bundle path ${JSON.stringify(file)} conflicts with ${JSON.stringify(other)}`);
    }
    for (const file of filePaths) for (const dir of otherDirs) if (foldAiPathIdentity(file) === foldAiPathIdentity(dir)) throw new AiReviewConflictError(`AI bundle path ${JSON.stringify(file)} conflicts with ${JSON.stringify(dir)}`);
    for (const dir of dirs) for (const other of otherFilePaths) {
      const a = foldAiPathIdentity(dir), b = foldAiPathIdentity(other);
      if (a === b || a.startsWith(`${b}/`)) throw new AiReviewConflictError(`AI bundle directory ${JSON.stringify(dir)} conflicts with ${JSON.stringify(other)}`);
    }
  };
  crossTreeConflict(candidate, directories, existing, existingDirectories);
  crossTreeConflict(existing, existingDirectories, candidate, directories);
  const candidateIdentities = new Map(candidate.map(({ path }) => [foldAiPathIdentity(path), path]));
  const existingIdentities = new Map(existing.map(({ path }) => [foldAiPathIdentity(path), path]));
  for (const [identity, path] of candidateIdentities) {
    for (const [otherIdentity, otherPath] of existingIdentities) {
      if (identity !== otherIdentity && (identity.startsWith(`${otherIdentity}/`) || otherIdentity.startsWith(`${identity}/`))) {
        throw new AiReviewConflictError(`AI bundle path ${JSON.stringify(path)} conflicts with ${JSON.stringify(otherPath)}`);
      }
    }
  }
  const snapshot = candidate.map(({ path, bytes, linkTarget }) => ({ path, bytes: Uint8Array.from(bytes), ...(linkTarget === undefined ? {} : { linkTarget }) }));
  const existingSnapshot = existing.map(({ path, bytes, linkTarget }) => ({ path, bytes: Uint8Array.from(bytes), ...(linkTarget === undefined ? {} : { linkTarget }) }));
  const files = snapshot.map(({ path, bytes, linkTarget }) => ({
    path,
    length: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...(linkTarget === undefined ? {} : { linkTarget }),
  })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const existingFiles = existingSnapshot.map(({ path, bytes, linkTarget }) => ({ path, length: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), ...(linkTarget === undefined ? {} : { linkTarget }) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const prior = new Map(existingFiles.map(file => [foldAiPathIdentity(file.path), file.sha256]));
  const next = new Set(files.map(file => foldAiPathIdentity(file.path)));
  const changes = [
    ...files.map(file => { const oldHash = prior.get(foldAiPathIdentity(file.path)); return { path: file.path, kind: oldHash === undefined ? 'add' as const : oldHash === file.sha256 ? 'unchanged' as const : 'replace' as const }; }),
    ...existingFiles.filter(file => !next.has(foldAiPathIdentity(file.path))).map(file => ({ path: file.path, kind: 'local-only' as const })),
    ...directories.filter(dir => !existingDirectories.some(old => foldAiPathIdentity(old) === foldAiPathIdentity(dir))).map(path => ({ path, kind: 'add-directory' as const })),
    ...existingDirectories.filter(dir => !directories.some(nextDir => foldAiPathIdentity(nextDir) === foldAiPathIdentity(dir))).map(path => ({ path, kind: 'local-only-directory' as const })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const review = { destination: JSON.parse(canonicalJson(destination)) as AiDestinationIdentity, files, existing: existingFiles,
    directories: [...directories].sort(), existingDirectories: [...existingDirectories].sort(), changes };
  const result = { ...review, digest: createHash('sha256').update(canonicalJson(review)).digest('hex') } as AiReviewSnapshot;
  Object.defineProperty(result, 'candidateSnapshot', { get: () => snapshot.map(({ path, bytes }) => Object.freeze({ path, bytes: Uint8Array.from(bytes) })) });
  return freezeReview(result);
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function assertCanonicalValue(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(assertCanonicalValue); return; }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const member of Object.values(value)) assertCanonicalValue(member);
    return;
  }
  throw new TypeError('AI destination identity must be complete canonical JSON data');
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy


// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function freezeReview<T extends AiReviewSnapshot>(review: T): T {
  freezeIdentity(review.destination.identity);
  Object.freeze(review.destination);
  for (const collection of [review.files, review.existing, review.directories, review.existingDirectories, review.changes]) {
    for (const item of collection) if (typeof item === 'object') Object.freeze(item);
    Object.freeze(collection);
  }
  return Object.freeze(review);
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
function freezeIdentity(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const member of Object.values(value)) freezeIdentity(member);
  Object.freeze(value);
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-ai-bundle:p1:inst-aib-copy
