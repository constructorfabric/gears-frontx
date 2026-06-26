// @cpt-algo:cpt-frontx-algo-template-resolution-parse-spec:p1
import type { ParseResult } from './types.js';

export function parseSourceSpec(raw: string): ParseResult {
  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-prefix-check
  const colonIdx = raw.indexOf(':');
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
  const atIdx = remainder.indexOf('@');
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
  const ownerRepo = remainder.slice(0, atIdx);
  const slashIdx = ownerRepo.indexOf('/');
  const owner = slashIdx !== -1 ? ownerRepo.slice(0, slashIdx) : ownerRepo;
  const repo = slashIdx !== -1 ? ownerRepo.slice(slashIdx + 1) : '';
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-repo

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-ref
  const ref = remainder.slice(atIdx + 1);
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-extract-ref

  // @cpt-begin:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-return
  return { ok: true, value: { host, owner, repo, ref } };
  // @cpt-end:cpt-frontx-algo-template-resolution-parse-spec:p1:inst-parse-return
}
