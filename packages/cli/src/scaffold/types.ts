import type { OwnershipBoundary } from '../manifest/types';
import type { InventoryEntry } from '../inventory/types';

// Injected write function — caller supplies; no direct filesystem access in core logic.
export type WriteFileFn = (destPath: string, content: string) => Promise<void>;

// Injected reader for a file already on disk at a target repository path —
// `null` when absent. Symmetric to upgrade's `ReadProjectFileFn`
// (`../upgrade/types.ts`), redeclared here (rather than imported) so
// scaffold does not take a cross-feature dependency on upgrade for a shape
// this simple; both seams share the SAME real implementation
// (`createFsReadProjectFileFn`, `../adapters/fs-project-io.ts`). Needed by
// `composeSharedFiles` (cpt-frontx-algo-cli-scaffolding-compose-shared-files
// inst-cs-read-existing-blocks) to read a `region-union` shared file already
// on disk before composing over it.
export type ReadProjectFileFn = (absolutePath: string) => Promise<string | null>;

// Injected conflict check — returns true when the target directory has conflicting content.
// Used by the composed-provenance (F13) scaffolder; unrelated to the kindless
// assembly-op's boundary-intersection conflict verdict (cpt-frontx-state-cli-scaffolding-assembly-op).
export type ConflictCheckFn = (targetDir: string) => Promise<boolean>;

// A single content item — a path within the template and the content to write
// at that destination. Read directly from a template's resolved on-disk
// installed content path — never carried by the manifest
// (cpt-frontx-algo-cli-scaffolding-uniform-apply inst-ua-read-content).
export interface ContentItem {
  path: string;    // relative path within the template
  content: string; // file content to write at destination
}

// Injected content reader — reads a resolved template's content items
// directly from its installed content path (never from the manifest).
// No filesystem access in core logic; the caller supplies the real
// implementation once the installed content path is materialized to disk.
export type ReadContentItemsFn = (entry: InventoryEntry) => Promise<ContentItem[]>;

// A single applied template's contribution to a staged assembly — the content
// items it delivers plus the ownership boundaries it declares, tagged with its
// identity (cpt-frontx-algo-cli-scaffolding-uniform-apply inst-ua-stage-contribution).
export interface ContributionEntry {
  templateName: string;
  files: ContentItem[];
  ownershipBoundaries: OwnershipBoundary;
}

// The staged assembly produced by the uniform apply path — carries every
// applied template's contribution and declared boundaries, ready for the
// pre-flight conflict check (P29) to evaluate.
export interface StagedAssembly {
  contributions: ContributionEntry[];
}
