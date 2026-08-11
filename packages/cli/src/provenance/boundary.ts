// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import type { OwnershipBoundary } from '../manifest/types';

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Serializes the declared/staged `OwnershipBoundary` into the single string
 * `ProvenanceRecord.occupiedOwnershipBoundary` holds. Boundaries use canonical
 * JSON so shared-file region ownership stays durable while the provenance
 * schema remains backward-compatible with a string field. `.` remains only the
 * legacy/omitted-field sentinel filled by `provenance/write.ts`.
 */
export function formatOccupiedBoundary(boundary: OwnershipBoundary): string {
  const canonicalBoundary: OwnershipBoundary = {
    exclusiveSubtrees: [...new Set(boundary.exclusiveSubtrees)].sort(compareStrings),
    sharedFiles: boundary.sharedFiles
      .map((file) => ({
        path: file.path,
        mergeStrategy: file.mergeStrategy,
        ownedRegions: [...new Set(file.ownedRegions)].sort(compareStrings),
      }))
      .sort((a, b) => {
        const byPath = compareStrings(a.path, b.path);
        if (byPath !== 0) return byPath;
        const byMergeStrategy = compareStrings(a.mergeStrategy, b.mergeStrategy);
        if (byMergeStrategy !== 0) return byMergeStrategy;
        return compareStrings(a.ownedRegions.join('\0'), b.ownedRegions.join('\0'));
      }),
  };

  return JSON.stringify(canonicalBoundary);
}
