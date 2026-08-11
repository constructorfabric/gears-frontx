// @cpt-dod:cpt-frontx-dod-upgrade-changeset-computation:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-apply:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-rollback:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-single-engine:p1
import type { ProvenanceRecord } from '../provenance/types';
import type { FetchFn } from '../resolver/types';

export type { ProvenanceRecord };
export type { FetchFn };

export type ChangeKind = 'add' | 'modify' | 'remove';

// @cpt-begin:cpt-frontx-dod-upgrade-changeset-computation:p1:inst-change-set-types
export interface CleanEntry {
  kind: ChangeKind;
  path: string;
  content?: string; // undefined for 'remove'; for a region-scoped entry, the NEW
                     // marker-delimited block only (not the whole file)
  // Present ONLY when this entry is scoped to one owned region within a
  // `region-union` shared file (inst-cmp-diff-files / inst-app-apply-entry).
  // Absent entries are whole-file (exclusive subtree).
  regionKey?: string;
}

export interface ConflictEntry {
  path: string;
  templateKind: ChangeKind;
  templateContent?: string;
  localContent: string; // current developer-modified content
  // Present ONLY when the conflict was detected within one owned region of a
  // `region-union` shared file rather than the whole file.
  regionKey?: string;
}

export interface ChangeSet {
  templateIdentity: string;
  baselineVersion: string;
  targetVersion: string;
  // Canonical `ProvenanceRecord.occupiedOwnershipBoundary` for the target
  // version's ownership boundary. Apply persists it with the version bump so
  // the next upgrade starts from the ground this template now occupies.
  targetOccupiedOwnershipBoundary: string;
  clean: CleanEntry[];
  conflicts: ConflictEntry[];
}
// @cpt-end:cpt-frontx-dod-upgrade-changeset-computation:p1:inst-change-set-types

// @cpt-begin:cpt-frontx-dod-upgrade-changeset-rollback:p1:inst-snapshot-type
// Absolute file path → original content (null = file did not exist pre-upgrade)
export interface ProjectSnapshot {
  files: Map<string, string | null>;
}
// @cpt-end:cpt-frontx-dod-upgrade-changeset-rollback:p1:inst-snapshot-type

// Injected dependency types — no direct filesystem access in core logic
export type ReadProvenanceFn = (projectRoot: string) => Promise<ProvenanceRecord | null>;
export type ReadProjectFileFn = (absolutePath: string) => Promise<string | null>;
export type WriteProjectFileFn = (absolutePath: string, content: string) => Promise<void>;
export type RemoveProjectFileFn = (absolutePath: string) => Promise<void>;
export type WriteProvenanceFn = (absolutePath: string, content: string) => Promise<void>;
export type PresentAndGetApprovalFn = (changeSet: ChangeSet) => Promise<'approved' | 'declined'>;
