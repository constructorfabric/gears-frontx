// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import type { OwnershipBoundary } from '../manifest/types';

/**
 * Collapses a declared/staged `OwnershipBoundary` into the single string
 * `ProvenanceRecord.occupiedOwnershipBoundary` holds — the paths (exclusive
 * subtrees, then owned shared-file paths) the template actually occupies,
 * deduplicated and sorted for a deterministic record, joined with ','. A
 * boundary with neither is legitimately root-owning (issue #530) and
 * collapses to '.', the same sentinel `provenance/write.ts` fills in when a
 * caller omits the field entirely.
 */
export function formatOccupiedBoundary(boundary: OwnershipBoundary): string {
  const paths = new Set<string>([...boundary.exclusiveSubtrees, ...boundary.sharedFiles.map((file) => file.path)]);
  if (paths.size === 0) return '.';
  return [...paths].sort().join(',');
}
