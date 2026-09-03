// @cpt-FEATURE:cpt-frontx-feature-cli-scaffolding:p1
// @cpt-algo:cpt-frontx-algo-cli-scaffolding-existing-content:p1
//
// Pure reconciliation logic behind injected seams — no direct filesystem
// access here, matching every other scaffold/manifest module's convention
// (`manifest/validate-content-self-containment.ts`'s `ListPayloadFilesFn`/
// `ResolveDeclaredExclusionFn`, `scaffold/conflict-check.ts`'s
// `CanonicalizeTargetFn`). The real fs-backed implementations of the two
// seams below are someone else's wiring, not this module's concern.
//
// This algorithm runs ONLY for a target already cleared by the pre-flight
// conflict check and NOT already recorded under its template's own
// `targets[]` entry (`cpt-frontx-dod-cli-scaffolding-existing-content-
// protocol`) — a recorded target is an idempotent no-op by that record
// alone and never reaches here. That precondition is the caller's to
// enforce; this module only reconciles whatever payload and on-disk content
// it is handed.
import { isWithinEffectiveOwnership } from './effective-ownership';
import { isTemplatePayloadPath } from '../manifest/types';
import { joinUnderTarget } from '../paths/relative-path';
import type { ContentItem } from './types';

// Injected reader for a template's installed content — every file reachable
// under the template's installed content path, template-relative (never
// project-relative), unfiltered by any target's effective ownership. Reuses
// `ContentItem` (`scaffold/types.ts`) rather than inventing a second "path
// plus content" shape — the same shape `ReadContentItemsFn` already reads
// for materialization. This module itself narrows the result down to one
// target's effective ownership area (`joinUnderTarget` +
// `isWithinEffectiveOwnership` below), so the seam only has to enumerate,
// never judge scope.
export type ReadInstalledContentFn = (installedContentPath: string) => Promise<ContentItem[]>;

// Injected reader for what already exists on disk, project-relative, under
// `target` — empty when nothing has been written there yet (a brand-new
// target). Like the payload seam above, this is expected to enumerate
// everything reachable under `target` without itself deciding effective
// ownership; this module applies the identical `isWithinEffectiveOwnership`
// filter to both sides so a stray file the seam over-reports (e.g. one that
// actually sits inside an excluded subtree) can never leak into a partition
// on either side of the comparison.
export type ReadExistingContentFn = (target: string) => Promise<ContentItem[]>;

export interface ExistingContentReconciliationInput {
  target: string;
  // The same exclusion-root list `computeExclusionRoots` (`./effective-
  // ownership.ts`) produces for this target — passed in already computed,
  // exactly as `checkTargetConflicts` accepts `localOriginFolders` already
  // resolved rather than re-deriving it, so the six-term subtraction is
  // computed in the one place the codebase already agreed it lives.
  exclusionRoots: string[];
  installedContentPath: string;
  readInstalledContent: ReadInstalledContentFn;
  readExistingContent: ReadExistingContentFn;
}

export interface ExistingContentPartitions {
  identicalFiles: string[];
  contentConflicts: string[];
  additionalPaths: string[];
}

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-compute-payload
function computePayloadSet(
  target: string,
  exclusionRoots: string[],
  rawContent: ContentItem[],
): Map<string, string> {
  const payload = new Map<string, string>();
  for (const item of rawContent) {
    // `item.path` is still template-relative here — `isTemplatePayloadPath`
    // (`../manifest/types.ts`, the ONE shared formulation of the payload
    // definition FEATURE §1.2 owns) must see it BEFORE `joinUnderTarget`
    // (`../paths/relative-path.ts`) re-roots it under `target`: a non-`.`
    // target would otherwise re-root the manifest as
    // `<target>/frontx-template.json`, which a check against the bare
    // `MANIFEST_FILENAME` would never recognize.
    if (!isTemplatePayloadPath(item.path)) continue;
    const projectPath = joinUnderTarget(target, item.path);
    if (!isWithinEffectiveOwnership(projectPath, target, exclusionRoots)) continue;
    payload.set(projectPath, item.content);
  }
  return payload;
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-compute-payload

// @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-read-existing
function filterExistingWithinOwnership(
  target: string,
  exclusionRoots: string[],
  rawExisting: ContentItem[],
): Map<string, string> {
  const existing = new Map<string, string>();
  for (const item of rawExisting) {
    if (!isWithinEffectiveOwnership(item.path, target, exclusionRoots)) continue;
    existing.set(item.path, item.content);
  }
  return existing;
}
// @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-read-existing

/**
 * Reconciles one target's payload — the files the template's effective
 * ownership at `target` would write, read from its installed content —
 * against whatever already exists on disk within that same effective-
 * ownership area, into the three partitions
 * `cpt-frontx-dod-cli-scaffolding-existing-content-protocol` reports
 * separately: `identicalFiles` (on disk, matching the payload exactly),
 * `contentConflicts` (on disk, differing from the payload), and
 * `additionalPaths` (on disk, at a path the payload does not write). All
 * three are empty when nothing pre-exists.
 */
export async function reconcileExistingContent(
  input: ExistingContentReconciliationInput,
): Promise<ExistingContentPartitions> {
  const rawPayload = await input.readInstalledContent(input.installedContentPath);
  const payload = computePayloadSet(input.target, input.exclusionRoots, rawPayload);

  const rawExisting = await input.readExistingContent(input.target);
  const existing = filterExistingWithinOwnership(input.target, input.exclusionRoots, rawExisting);

  const identicalFiles: string[] = [];
  const contentConflicts: string[] = [];

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-foreach-payload-path
  for (const [payloadPath, payloadContent] of payload) {
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-if-exists
    const existingContent = existing.get(payloadPath);
    if (existingContent === undefined) continue; // nothing on disk at this payload path
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-if-exists

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-if-match
    if (existingContent === payloadContent) {
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-if-match
      // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-add-identical
      identicalFiles.push(payloadPath);
      // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-add-identical
      continue;
    }

    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-else-differs
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-add-conflict
    contentConflicts.push(payloadPath);
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-add-conflict
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-else-differs
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-foreach-payload-path

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-foreach-extra
  const additionalPaths: string[] = [];
  for (const existingPath of existing.keys()) {
    if (payload.has(existingPath)) continue;
    // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-add-additional
    additionalPaths.push(existingPath);
    // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-add-additional
  }
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-foreach-extra

  // @cpt-begin:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-return-partitions
  return { identicalFiles, contentConflicts, additionalPaths };
  // @cpt-end:cpt-frontx-algo-cli-scaffolding-existing-content:p1:inst-ec-return-partitions
}
