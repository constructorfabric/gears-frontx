// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import type { OwnershipBoundary } from '../manifest/types';

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Serializes the declared/staged `OwnershipBoundary` into the single string
 * `ProvenanceRecord.occupiedOwnershipBoundary` holds. Non-empty boundaries use
 * canonical JSON so shared-file region ownership stays durable while the
 * provenance schema remains backward-compatible with a string field.
 *
 * A boundary with neither exclusive nor shared ownership is legitimately
 * root-owning (issue #530) and collapses to '.', the same sentinel
 * `provenance/write.ts` fills in when a caller omits the field entirely.
 */
export function formatOccupiedBoundary(boundary: OwnershipBoundary): string {
  if (boundary.exclusiveSubtrees.length === 0 && boundary.sharedFiles.length === 0) return '.';

  const canonicalBoundary: OwnershipBoundary = {
    exclusiveSubtrees: [...boundary.exclusiveSubtrees].sort(compareStrings),
    sharedFiles: boundary.sharedFiles
      .map((file) => ({
        path: file.path,
        mergeStrategy: file.mergeStrategy,
        ownedRegions: [...file.ownedRegions].sort(compareStrings),
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
