// @cpt-FEATURE:cpt-frontx-feature-cli-scaffolding:p1
//
// Resolves an ALREADY-REGISTERED template name's CURRENT manifest content —
// correctly for BOTH a remote/inventory-installed origin (via
// `TemplateInventory.lookup`) and a local `path:` origin (read directly from
// disk, mirroring `commands/register.ts`'s own `resolveOrigin` local-origin
// branch exactly: a local origin is never installed into the inventory at
// register time either, so `inventory.lookup` alone can never find it).
//
// Before this module existed, three independent sites each re-derived an
// already-registered name's declared `excludedSubtrees` via
// `inventory.lookup(name)` ALONE — `commands/apply.ts`'s
// `buildRecordedTargetClaims`, `commands/ownership.ts`'s
// `buildRecordedTargets`, and `scaffold/delete-plan.ts`'s own inline lookup.
// All three silently defaulted to `[]` for a `path:`-registered template,
// defeating the nested-target permission check `inst-cc-if-excluded-nest`
// grants for exactly that template. Confirmed live: applying a second
// template into a target a first, locally-registered template's
// `excludedSubtrees` explicitly permitted was wrongly refused as
// `TARGET_CONFLICT`. This function is the ONE shared re-derivation every one
// of those three sites now calls instead — the same "no second/third/fourth
// formulation" discipline `effective-ownership.ts`'s own header states for
// the six-term subtraction.
import path from 'node:path';
import { readManifestFromContent } from '../manifest/validate-contract';
import { MANIFEST_FILENAME } from '../manifest/types';
import type { ReadFileFn } from '../manifest/types';
import type { CanonicalizeTargetFn } from './conflict-check';
import type { InventoryEntry } from '../inventory/types';

const LOCAL_ORIGIN_PREFIX = 'path:';

// Narrow port over `TemplateInventory` — only `lookup` is needed here, the
// same one-method shape every prior call site already injected.
export interface RegisteredManifestInventoryPort {
  lookup(name: string): InventoryEntry | undefined;
}

export interface ResolveRegisteredManifestDeps {
  repoRoot: string;
  inventory: RegisteredManifestInventoryPort;
  readFileFn: ReadFileFn;
  canonicalizeFn: CanonicalizeTargetFn;
}

// Returns a registered name's declared `excludedSubtrees`, or `[]` when its
// manifest genuinely cannot be read (content absent from the inventory,
// drifted out of contract, or — for a local origin — its folder no longer
// provable to stay inside the project root). This function only fixes HOW a
// present manifest is found; a genuinely absent one still fails closed to
// `[]`, exactly as every prior call site already did.
export async function resolveRegisteredExcludedSubtrees(
  name: string,
  origin: string,
  deps: ResolveRegisteredManifestDeps,
): Promise<string[]> {
  const content = await resolveRegisteredManifestContent(name, origin, deps);
  if (content === undefined) return [];
  const manifestResult = readManifestFromContent(content);
  return manifestResult.ok ? manifestResult.manifest.excludedSubtrees : [];
}

async function resolveRegisteredManifestContent(
  name: string,
  origin: string,
  deps: ResolveRegisteredManifestDeps,
): Promise<string | undefined> {
  if (origin.startsWith(LOCAL_ORIGIN_PREFIX)) {
    const relativePath = origin.slice(LOCAL_ORIGIN_PREFIX.length);
    const canonical = deps.canonicalizeFn(relativePath);
    if (canonical === null) return undefined;
    try {
      return await deps.readFileFn(path.join(deps.repoRoot, canonical, MANIFEST_FILENAME));
    } catch {
      return undefined;
    }
  }
  const installed = deps.inventory.lookup(name);
  return installed?.content;
}
