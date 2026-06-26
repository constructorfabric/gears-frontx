// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
import type { StructuredRef } from '../spec-parser/types.js';
import type { FetchFn, ResolveResult } from './types.js';

export async function resolveToInventory(
  ref: StructuredRef,
  fetchFn: FetchFn,
): Promise<ResolveResult> {
  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-name
  const name = ref.repo;
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-name

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-addr
  const source = `${ref.host}:${ref.owner}/${ref.repo}@${ref.ref}`;
  const url = buildFetchUrl(ref);
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-addr

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch
  let content: string;
  try {
    content = await fetchFn(url);
  } catch (err) {
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch-fail-check
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch-fail
    const message =
      err instanceof Error
        ? `Failed to fetch template from registry: ${err.message}`
        : 'Failed to fetch template from registry: unreachable';
    return { ok: false, error: { message } };
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch-fail
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch-fail-check
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-fetch

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write
  // Content will be written by caller (TemplateInventory) — resolver returns the record
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-index
  // Index update is handled by caller after store write
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-index

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-return
  return { ok: true, value: { name, content, ref: ref.ref, source } };
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-return
}

function buildFetchUrl(ref: StructuredRef): string {
  // Build a canonical fetch URL from the structured reference
  if (ref.host === 'github') {
    return `https://api.github.com/repos/${ref.owner}/${ref.repo}/tarball/${ref.ref}`;
  }
  return `https://${ref.host}/${ref.owner}/${ref.repo}@${ref.ref}`;
}
