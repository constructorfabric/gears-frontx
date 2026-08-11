// @cpt-algo:cpt-frontx-algo-upgrade-changeset-compute:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-computation:p1
import { readManifestFromContent } from '../manifest/validate-contract';
import { formatOccupiedBoundary } from '../provenance/boundary';
import { extractOwnedRegion } from '../scaffold/compose-shared-files';
import { resolveTemplateAtVersion } from './resolve-template';
import type { ReadContentItemsFn } from '../scaffold/types';
import type { OwnershipBoundary } from '../manifest/types';
import type {
  ChangeSet,
  CleanEntry,
  ConflictEntry,
  ProvenanceRecord,
  ReadProvenanceFn,
  ReadProjectFileFn,
  FetchFn,
} from './types';

export type ComputeResult =
  | { ok: true; changeSet: ChangeSet; provenance: ProvenanceRecord }
  | {
      ok: false;
      reason: 'no-provenance' | 'baseline-not-found' | 'target-not-found' | 'manifest-error';
      message: string;
    };

// Resolves ONE path's declared ownership from the manifest's ownership
// boundaries — mirrors the same resolution scaffold/compose-shared-files.ts
// applies at compose time (`resolvePathContribution`): a whole-file
// `exclusive` claim when no shared-file entry declares the path, otherwise
// the declared merge strategy and owned region keys.
function ownershipForPath(
  path: string,
  boundary: OwnershipBoundary,
): { mergeStrategy: string; ownedRegions: string[] } {
  const sharedEntry = boundary.sharedFiles.find((entry) => entry.path === path);
  if (!sharedEntry) {
    return { mergeStrategy: 'exclusive', ownedRegions: [] };
  }
  return { mergeStrategy: sharedEntry.mergeStrategy, ownedRegions: sharedEntry.ownedRegions };
}

// @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-read-provenance
export async function computeChangeSet(
  projectRoot: string,
  targetVersion: string,
  deps: {
    readProvenance: ReadProvenanceFn;
    fetchFn: FetchFn;
    readProjectFile: ReadProjectFileFn;
    readContentItems: ReadContentItemsFn;
  },
): Promise<ComputeResult> {
  const provenance = await deps.readProvenance(projectRoot);
  if (!provenance) {
    return {
      ok: false,
      reason: 'no-provenance',
      message: 'No provenance record found in project — cannot compute upgrade.',
    };
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-read-provenance

  const { templateIdentity, scaffoldedFromVersion, sourceSpec } = provenance;

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-resolve-baseline
  // Re-resolve the BASELINE version's content through the shared resolver using
  // the provenance record's source-spec — NEVER from the single-entry local
  // inventory, which retains only one version per entry and cannot supply an
  // older baseline once a newer version has replaced it there.
  const baselineResolved = await resolveTemplateAtVersion(sourceSpec, scaffoldedFromVersion, deps.fetchFn);
  if (!baselineResolved.ok) {
    return {
      ok: false,
      reason: 'baseline-not-found',
      message:
        `Baseline template "${templateIdentity}@${scaffoldedFromVersion}" could not be re-resolved ` +
        `via the shared resolver from source-spec "${sourceSpec}": ${baselineResolved.message}`,
    };
  }
  const baselineEntry = baselineResolved.entry;
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-resolve-baseline

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-resolve-target
  // Resolve the TARGET version through the SAME shared resolver / same
  // source-spec, only the requested version differs.
  const targetResolved = await resolveTemplateAtVersion(sourceSpec, targetVersion, deps.fetchFn);
  if (!targetResolved.ok) {
    return {
      ok: false,
      reason: 'target-not-found',
      message:
        `Target template "${templateIdentity}@${targetVersion}" could not be resolved ` +
        `via the shared resolver from source-spec "${sourceSpec}": ${targetResolved.message}`,
    };
  }
  const targetEntry = targetResolved.entry;
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-resolve-target

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-diff-files
  // Manifests are still read to confirm each is well-formed and to obtain the
  // declared ownership boundary before diffing; they carry no content —
  // content items are read directly from each entry's resolved on-disk
  // installed content path (never from the manifest).
  const baselineResult = readManifestFromContent(baselineEntry.content);
  const targetResult = readManifestFromContent(targetEntry.content);

  if (!baselineResult.ok || !targetResult.ok) {
    return { ok: false, reason: 'manifest-error', message: 'Failed to parse template manifest.' };
  }

  const baselineItems = await deps.readContentItems(baselineEntry);
  const targetItems = await deps.readContentItems(targetEntry);

  const baselineFiles = new Map<string, string>(baselineItems.map((f) => [f.path, f.content]));
  const targetFiles = new Map<string, string>(targetItems.map((f) => [f.path, f.content]));

  // Ownership boundary the diff is scoped to — the target manifest's declared
  // boundary (the version the project is moving TO governs what this template
  // owns going forward).
  const ownershipBoundary = targetResult.manifest.ownershipBoundaries;
  const allPaths = new Set<string>([...baselineFiles.keys(), ...targetFiles.keys()]);
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-diff-files

  const clean: CleanEntry[] = [];
  const conflicts: ConflictEntry[] = [];

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-for-each-file
  for (const filePath of allPaths) {
    const { mergeStrategy, ownedRegions } = ownershipForPath(filePath, ownershipBoundary);
    const baselineContent = baselineFiles.get(filePath);
    const targetContent = targetFiles.get(filePath);
    const absolutePath = `${projectRoot}/${filePath}`;

    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-diff-files
    if (mergeStrategy === 'region-union') {
      // `region-union` shared file — diff ONLY within this template's owned
      // marker-delimited region(s); co-owning templates' regions are never
      // compared or touched.
      for (const regionKey of ownedRegions) {
        const baselineRegion =
          baselineContent !== undefined ? extractOwnedRegion(baselineContent, templateIdentity, regionKey) : undefined;
        const targetRegion =
          targetContent !== undefined ? extractOwnedRegion(targetContent, templateIdentity, regionKey) : undefined;

        if (baselineRegion === targetRegion) continue; // this template's region did not change

        const regionChangeKind = targetRegion === undefined ? 'remove' : baselineRegion === undefined ? 'add' : 'modify';

        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod
        const localFileContent = await deps.readProjectFile(absolutePath);
        const localRegion =
          localFileContent !== null ? extractOwnedRegion(localFileContent, templateIdentity, regionKey) : undefined;
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod

        if (localFileContent !== null && localRegion !== baselineRegion) {
          // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
          // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
          conflicts.push({
            path: filePath,
            templateKind: regionChangeKind,
            templateContent: targetRegion,
            localContent: localFileContent,
            regionKey,
          });
          // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
          // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
        } else {
          // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
          // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
          clean.push({ kind: regionChangeKind, path: filePath, content: targetRegion, regionKey });
          // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
          // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
        }
      }
      continue;
    }
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-diff-files

    // Exclusive subtree — diff the whole file.
    if (baselineContent === undefined && targetContent !== undefined) {
      // File added in target — check if project already has it (would be a conflict)
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod
      const localContent = await deps.readProjectFile(absolutePath);
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod
      if (localContent !== null) {
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
        conflicts.push({ path: filePath, templateKind: 'add', templateContent: targetContent, localContent });
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
      } else {
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
        clean.push({ kind: 'add', path: filePath, content: targetContent });
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
      }
    } else if (
      baselineContent !== undefined &&
      targetContent !== undefined &&
      baselineContent !== targetContent
    ) {
      // File content changed in target — check for local developer modification
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod
      const localContent = await deps.readProjectFile(absolutePath);
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod
      if (localContent !== null && localContent !== baselineContent) {
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
        conflicts.push({ path: filePath, templateKind: 'modify', templateContent: targetContent, localContent });
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
      } else {
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
        clean.push({ kind: 'modify', path: filePath, content: targetContent });
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
      }
    } else if (baselineContent !== undefined && targetContent === undefined) {
      // File removed in target version
      // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod
      const localContent = await deps.readProjectFile(absolutePath);
      // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-check-local-mod
      if (localContent !== null && localContent !== baselineContent) {
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
        conflicts.push({ path: filePath, templateKind: 'remove', localContent });
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-flag-conflict
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-if-conflict
      } else {
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
        // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
        clean.push({ kind: 'remove', path: filePath });
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-add-clean-entry
        // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-else-clean
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-for-each-file

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-return-changeset
  return {
    ok: true,
    provenance,
    changeSet: {
      templateIdentity,
      baselineVersion: scaffoldedFromVersion,
      targetVersion,
      targetOccupiedOwnershipBoundary: formatOccupiedBoundary(ownershipBoundary),
      clean,
      conflicts,
    },
  };
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-compute:p1:inst-cmp-return-changeset
}
