import type { InventoryEntry } from '../inventory/types';
import { readManifestFromContent } from '../manifest/validate-contract';
import type { OwnershipBoundary, TemplateManifest } from '../manifest/types';
import type { ContentItem, ContributionEntry, ReadContentItemsFn, StagedAssembly } from './types';

export type UniformApplyResult =
  | { ok: true; assembly: StagedAssembly }
  | { ok: false; reason: 'unresolved'; templateRef: string; message: string }
  | { ok: false; reason: 'manifest-unreadable'; templateRef: string; message: string };

// A content item is within a template's declared ownership if it lives under
// one of its exclusive subtrees or is one of its declared shared files —
// scopes the content read from the installed content path per
// inst-ua-compute-contribution.
function isWithinDeclaredBoundaries(item: ContentItem, boundaries: OwnershipBoundary): boolean {
  const inExclusiveSubtree = boundaries.exclusiveSubtrees.some((subtree) => {
    const prefix = subtree.endsWith('/') ? subtree : `${subtree}/`;
    return item.path === subtree || item.path.startsWith(prefix);
  });
  const inSharedFile = boundaries.sharedFiles.some((sharedFile) => sharedFile.path === item.path);
  return inExclusiveSubtree || inSharedFile;
}

// @cpt-dod:cpt-frontx-dod-cli-scaffolding-uniform-apply:p1
// The system MUST apply any installed template through this one uniform path.
// Seeding a new repository and adding a template into a repository that
// already holds applied templates both call `uniformApply` — they differ
// ONLY in `targetHoldsAppliedTemplates`. There is no per-template-category
// dispatch (no `scaffoldProject` / `scaffoldMfe` split — that old-model
// surface was swept in an earlier phase) and no second apply path: template
// resolution routes exclusively through the injected `lookupFn`, the single
// shared resolver produced by P12 (`TemplateInventory.lookup`).
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1
/**
 * The ONE apply path both `seed a repository` and `add a template into an
 * existing repository` invoke (cpt-frontx-flow-cli-scaffolding-seed-repository,
 * cpt-frontx-flow-cli-scaffolding-add-template — implemented in P30). Resolves
 * every reference through the shared resolver, reads each resolved template's
 * manifest (identity, version, ownership boundaries, referenced templates —
 * NO content), reads its content items directly from its resolved on-disk
 * installed content path, and stages every template's contribution + declared
 * ownership boundaries into one assembly for the pre-flight conflict check
 * (P29) to evaluate before any file is written.
 */
export async function uniformApply(
  templateRefs: string[],
  targetHoldsAppliedTemplates: boolean,
  lookupFn: (name: string) => InventoryEntry | undefined,
  readContentFn: ReadContentItemsFn,
): Promise<UniformApplyResult> {
  // Seed vs add differ ONLY in this flag — it plays no role in staging the
  // assembly itself; the pre-flight conflict check (P29) uses it to decide
  // which already-occupied boundaries to compare against.
  void targetHoldsAppliedTemplates;

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-receive
  const resolvedEntries: InventoryEntry[] = [];
  for (const templateRef of templateRefs) {
    const entry = lookupFn(templateRef);
    if (!entry) {
      return {
        ok: false,
        reason: 'unresolved',
        templateRef,
        message: `Apply aborted — template "${templateRef}" not found in local inventory.`,
      };
    }
    resolvedEntries.push(entry);
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-receive

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-read-manifests
  // Reads ONLY the four declared manifest categories — identity, version,
  // ownership boundaries, referenced templates. The manifest declares no
  // content and carries no file bodies (TemplateManifest has no `files`
  // field); content items are obtained separately below via inst-ua-read-content.
  const resolvedManifests: Array<{ entry: InventoryEntry; manifest: TemplateManifest }> = [];
  for (const entry of resolvedEntries) {
    const manifestResult = readManifestFromContent(entry.content);
    if (!manifestResult.ok) {
      return {
        ok: false,
        reason: 'manifest-unreadable',
        templateRef: entry.name,
        message: `Cannot read manifest for "${entry.name}": ${manifestResult.message}`,
      };
    }
    resolvedManifests.push({ entry, manifest: manifestResult.manifest });
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-read-manifests

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-read-content
  // Reads each template's content items DIRECTLY from its resolved on-disk
  // installed content path (via the injected `readContentFn` seam) — never
  // from the manifest.
  const resolvedContent: Array<{ entry: InventoryEntry; manifest: TemplateManifest; items: ContentItem[] }> = [];
  for (const { entry, manifest } of resolvedManifests) {
    const items = await readContentFn(entry);
    resolvedContent.push({ entry, manifest, items });
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-read-content

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-foreach-template
  const contributions: ContributionEntry[] = [];
  for (const { entry, manifest, items } of resolvedContent) {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-compute-contribution
    // Scopes the content read from the installed content path to the
    // declared exclusive subtrees + shared-file regions.
    const contribution: ContributionEntry = {
      templateName: entry.name,
      files: items.filter((item) => isWithinDeclaredBoundaries(item, manifest.ownershipBoundaries)),
      ownershipBoundaries: manifest.ownershipBoundaries,
    };
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-compute-contribution

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-stage-contribution
    contributions.push(contribution);
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-stage-contribution
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-foreach-template

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-return-staged
  return { ok: true, assembly: { contributions } };
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-uniform-apply:p1:inst-ua-return-staged
}
