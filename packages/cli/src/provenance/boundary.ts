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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Parses the structured `occupiedOwnershipBoundary` value written by
 * `formatOccupiedBoundary`. Legacy sentinels such as `.` and historical
 * path-only strings are intentionally not expanded into region ownership:
 * they do not carry enough information to prove a shared-file marker block's
 * path/key claim.
 */
export function parseOccupiedBoundary(value: string | undefined): OwnershipBoundary | undefined {
  if (value === undefined || value === '.') return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  const exclusiveSubtrees = record['exclusiveSubtrees'];
  const sharedFiles = record['sharedFiles'];
  if (!isStringArray(exclusiveSubtrees) || !Array.isArray(sharedFiles)) return undefined;

  const parsedSharedFiles = [];
  for (const entry of sharedFiles) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
    const shared = entry as Record<string, unknown>;
    const path = shared['path'];
    const mergeStrategy = shared['mergeStrategy'];
    const ownedRegions = shared['ownedRegions'];
    if (typeof path !== 'string' || typeof mergeStrategy !== 'string' || !isStringArray(ownedRegions)) {
      return undefined;
    }
    parsedSharedFiles.push({ path, mergeStrategy, ownedRegions });
  }

  return { exclusiveSubtrees, sharedFiles: parsedSharedFiles };
}
