// @cpt-algo:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1
// @cpt-dod:cpt-frontx-dod-template-resolution-manifest-identity:p1
import { readManifestFromContent } from '../manifest/validate-contract';
import { isSafeRelativePath } from '../paths/relative-path';
import type { StructuredRef } from '../spec-parser/types';
import { formatTemplateAddress } from '../spec-parser/parse';
import { narrowBundleToSubtree } from './narrow-subtree';
import type { FetchFn, ResolveResult } from './types';

export async function resolveToInventory(
  ref: StructuredRef,
  fetchFn: FetchFn,
): Promise<ResolveResult> {
  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-addr
  const source = buildSourceSpec(ref);
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

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-subtree
  if (ref.subtree !== undefined) {
    const narrowed = narrowBundleToSubtree(content, ref.subtree);
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-subtree-empty
    if (!narrowed.ok) {
      // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-subtree-empty-fail
      // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-reject-loop
      return { ok: false, error: { message: `${narrowed.message} Source-spec: "${source}".` } };
      // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-reject-loop
      // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-subtree-empty-fail
    }
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-subtree-empty
    content = narrowed.content;
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-subtree

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-name
  // Identity is what the template's own manifest declares, not the repository
  // the reference named: one repository may publish several templates
  // (cpt-frontx-adr-template-manifest-contract).
  const manifestResult = readManifestFromContent(content);
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-name

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-identity-missing
  if (!manifestResult.ok) {
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-identity-missing-fail
    // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-reject-loop
    // The read enforces the whole manifest contract, so this branch is reached
    // by a missing `version` as much as by a missing identity.
    return {
      ok: false,
      error: {
        message: `Template resolved from "${source}" has no readable manifest, so its identity could not be established: ${manifestResult.message}.`,
      },
    };
    // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-reject-loop
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-identity-missing-fail
  }

  const identity = manifestResult.manifest.name;
  if (!isUsableIdentityPath(identity)) {
    // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-identity-missing-fail
    // @cpt-begin:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-reject-loop
    return {
      ok: false,
      error: {
        message: `Template resolved from "${source}" declares the identity "${identity}", which is not usable as an installed content path.`,
      },
    };
    // @cpt-end:cpt-frontx-state-template-resolution-inventory-lifecycle:p1:inst-state-reject-loop
    // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-identity-missing-fail
  }
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-identity-missing

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write
  // Content will be written by caller (TemplateInventory) — resolver returns the record
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-write

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-index
  // Index update is handled by caller after store write
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-index

  // @cpt-begin:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-return
  return { ok: true, value: { name: identity, content, ref: ref.ref, source } };
  // @cpt-end:cpt-frontx-algo-template-resolution-resolve-to-inventory:p1:inst-resolve-return
}

// Re-serialize the structured reference back into the source-spec that
// re-resolves it. The subtree segment MUST survive this round trip: a
// provenance record stores this string, and an upgrade re-resolves through it
// (cpt-frontx-adr-project-provenance-record). Dropping the segment here would
// silently re-resolve the repository root instead of the template.
function buildSourceSpec(ref: StructuredRef): string {
  return `${formatTemplateAddress(ref)}@${ref.ref}`;
}

function buildFetchUrl(ref: StructuredRef): string {
  // Build a canonical fetch URL from the structured reference. The subtree is
  // deliberately absent: acquisition stays whole-repository and the subtree is
  // a filter applied to the acquired content
  // (cpt-frontx-adr-source-spec-subdirectory-addressing).
  if (ref.host === 'github') {
    return `https://api.github.com/repos/${ref.owner}/${ref.repo}/tarball/${ref.ref}`;
  }
  return `https://${ref.host}/${ref.owner}/${ref.repo}@${ref.ref}`;
}

// A declared identity is usable when it addresses a location inside the
// inventory root. A scoped name such as `@scope/template` is admitted — the
// manifest contract already treats a scoped identity as a path when a template
// declares its own `.frontx/ai/<identity>/` bundle subtree.
//
// The manifest contract owns this rule and `readManifestFromContent` above
// enforces it, so reaching the refusal below means a caller resolved content
// past that gate. It is kept as the barrier closest to the filesystem, since
// this identity becomes a real path in the content store.
function isUsableIdentityPath(value: string): boolean {
  return isSafeRelativePath(value);
}
