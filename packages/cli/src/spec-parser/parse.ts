// @cpt-algo:cpt-frontx-algo-template-resolution-parse-spec:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-spec-parser-rejection:p1
import { isSafeRelativePath } from '../paths/relative-path';
import type { ParseResult, StructuredRef } from './types';

// Separator that introduces the optional subtree segment
// (cpt-frontx-adr-source-spec-subdirectory-addressing).
const SUBTREE_SEPARATOR = '//';

export function parseSourceSpec(raw: string): ParseResult {
  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-prefix-check
  // An empty host counts as no host: `cpt-frontx-adr-source-spec-subdirectory-addressing`
  // re-decides the prefix as mandatory, and `:owner/repo@ref` names no registry.
  const colonAt = raw.indexOf(':');
  const colonIdx = colonAt > 0 ? colonAt : -1;
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-prefix-check

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-prefix
  if (colonIdx === -1) {
    // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-prefix-fail
    return {
      ok: false,
      error: {
        message:
          `Missing host: prefix in source-spec "${raw}". ` +
          'Expected format: host:owner/repo@ref (e.g. github:acme/my-template@v1.0.0). ' +
          'Acquisition cannot proceed without an explicit host.',
      },
    };
    // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-prefix-fail
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-prefix

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-host
  const host = raw.slice(0, colonIdx);
  const remainder = raw.slice(colonIdx + 1);
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-host

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-at-check
  // An empty selector counts as no selector, for the same reason: the version
  // pin is mandatory, and `owner/repo@` pins nothing. Only the FIRST `@` bounds
  // the selector, so a ref that itself contains one is unaffected.
  const atAt = remainder.indexOf('@');
  const atIdx = atAt !== -1 && atAt < remainder.length - 1 ? atAt : -1;
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-at-check

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-at
  if (atIdx === -1) {
    // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-at-fail
    return {
      ok: false,
      error: {
        message:
          `Missing @ref version selector in source-spec "${raw}". ` +
          'Expected format: host:owner/repo@ref (e.g. github:acme/my-template@v1.0.0). ' +
          'Acquisition cannot proceed without an explicit version pin.',
      },
    };
    // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-at-fail
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-no-at

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-repo
  const repoPath = remainder.slice(0, atIdx);
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-repo

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-subtree
  // The repository path splits at its FIRST `//`. A well-formed `owner/repo`
  // has two non-empty segments and therefore cannot itself contain `//`, so
  // the split point is unambiguous.
  const subtreeSepIdx = repoPath.indexOf(SUBTREE_SEPARATOR);
  const ownerRepo = subtreeSepIdx === -1 ? repoPath : repoPath.slice(0, subtreeSepIdx);
  const subtree =
    subtreeSepIdx === -1 ? undefined : repoPath.slice(subtreeSepIdx + SUBTREE_SEPARATOR.length);
  const ownerRepoSegments = ownerRepo.split('/');
  const [owner = '', repo = ''] = ownerRepoSegments;
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-subtree

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-invalid-path
  const repoPathWellFormed =
    ownerRepoSegments.length === 2 && owner.length > 0 && repo.length > 0;
  if (!repoPathWellFormed || (subtree !== undefined && !isWellFormedSubtree(subtree))) {
    // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-invalid-path-fail
    return {
      ok: false,
      error: {
        message:
          `Malformed repository path or subtree segment in source-spec "${raw}". ` +
          'Expected format: host:owner/repo[//subtree]@ref (e.g. github:acme/templates//shell@v1.0.0). ' +
          'The repository path must be exactly one owner segment and one repository segment, ' +
          'and a subtree segment must be a relative path with no empty, "." or ".." segments.',
      },
    };
    // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-invalid-path-fail
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-invalid-path

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-ref
  const ref = remainder.slice(atIdx + 1);
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-ref

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-return
  // `subtree` is omitted rather than set to undefined when the reference carries
  // no subtree, so a subtree-less reference parses into the same four parts it
  // produced before the segment existed.
  return { ok: true, value: subtree === undefined ? { host, owner, repo, ref } : { host, owner, repo, subtree, ref } };
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-return
}

// The reference with its version selector removed. Two references sharing an
// address name one template at two versions, so a caller that must not read a
// version bump as a second template compares this rather than the whole
// source-spec.
export function formatTemplateAddress(ref: StructuredRef): string {
  const subtree = ref.subtree === undefined ? '' : `${SUBTREE_SEPARATOR}${ref.subtree}`;
  return `${ref.host}:${ref.owner}/${ref.repo}${subtree}`;
}

// A subtree segment is well-formed when it is a safe relative path. Refusing it
// here turns a typo into a parse error instead of the content error ("subtree
// holds no content") it would otherwise become long after the reference was at
// fault.
function isWellFormedSubtree(value: string): boolean {
  return value.length > 0 && isSafeRelativePath(value);
}
