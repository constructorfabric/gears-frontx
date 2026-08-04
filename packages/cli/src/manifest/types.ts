// @cpt-algo:cpt-frontx-algo-template-manifest-validate-contract:p1
// @cpt-state:cpt-frontx-state-template-manifest-validation-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-template-manifest-single-description:p1

export const MANIFEST_FILENAME = 'frontx-template.json';
export const MANIFEST_SCHEMA_VERSION = '1.0';

// Closed set of exactly two merge-strategy values (cpt-frontx-algo-template-manifest-validate-contract:p1:inst-if-merge-strategy-invalid).
// `exclusive` — the template owns the shared file in whole; `region-union` —
// the template owns one or more named, marker-delimited regions within it.
export type MergeStrategy = 'exclusive' | 'region-union';

// Ownership category (3b): per shared file, the regions this template owns and
// the merge strategy applied when another template also writes it.
export interface SharedFileEntry {
  path: string;           // repository-relative path of the shared file
  mergeStrategy: string;  // declared merge strategy for this shared file — closed set: MergeStrategy
  ownedRegions: string[]; // the keys/regions this template owns within the file
}

// Ownership category (3): the ground a template owns — the exclusive subtrees it
// alone writes and, per shared file, the regions it owns with a declared merge.
export interface OwnershipBoundary {
  exclusiveSubtrees: string[];    // subtrees the template alone writes (repo-relative paths)
  sharedFiles: SharedFileEntry[]; // per-shared-file ownership declarations
}

// Referenced-templates category (4): a template a preset applies together, each
// with the target location it is applied at.
export interface ReferencedTemplate {
  ref: string;       // well-formed template reference (source-spec or registered name)
  appliedAt: string; // the target location the referenced template is applied at
}

// Single authoritative contract — cpt-frontx-contract-template-manifest.
// EXACTLY five declared categories: identity, version, ownership boundaries,
// referenced templates, description. The manifest declares NO content and
// carries NO file bodies — every consumer reads content items from the
// resolved on-disk installed content path (cpt-frontx-algo-cli-scaffolding-
// uniform-apply inst-ua-read-content), never from this shape. The same shape
// is checked at pre-publish validation and consumed at install, apply,
// assembly, and selection time — no per-command divergence.
export interface TemplateManifest {
  schemaVersion?: string;                     // optional; absent = '1.0'; enables forward-reading
  name: string;                               // (1) identity
  version: string;                            // (2) version — versioned shape
  ownershipBoundaries: OwnershipBoundary;     // (3) ownership boundaries
  referencedTemplates?: ReferencedTemplate[]; // (4) referenced templates (a preset applies together)
  // (5) description — the template's own prose statement of what it establishes
  // and contributes, which selection matches a stated intent against. Optional
  // so manifests published before the category was declared stay conforming and
  // installable; the cost a template accepts by omitting it is that it is not
  // selectable from an intent and is reachable only by its exact reference.
  // Prose only, drawn from no closed set, so it reintroduces none of the
  // template classification cpt-frontx-adr-uniform-template-mechanism removed.
  description?: string;
}

export interface ManifestViolation {
  field: string;
  message: string;
}

export type ManifestValidationResult =
  | { status: 'VALIDATED'; violations: [] }
  | { status: 'REJECTED'; violations: ManifestViolation[] };

// State machine states — cpt-frontx-state-template-manifest-validation-lifecycle
// @cpt-begin:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-draft-to-validated
// @cpt-begin:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-draft-to-rejected
// @cpt-begin:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-rejected-to-draft
// @cpt-begin:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-validated-to-published
export type ManifestValidationState = 'DRAFT' | 'VALIDATED' | 'REJECTED' | 'PUBLISHED';
// @cpt-end:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-validated-to-published
// @cpt-end:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-rejected-to-draft
// @cpt-end:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-draft-to-rejected
// @cpt-end:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-draft-to-validated

// ReadFileFn — injected for testability (no fs calls in core logic)
export type ReadFileFn = (path: string) => Promise<string>;

// ListContentOwnedFilesFn - enumerates every regular file reachable under one
// declared content-owning path (an exclusive subtree OR a shared-file path -
// a bare directory or a single file either way), POSIX-relative to
// `templateDir` (cpt-frontx-algo-template-manifest-validate-content-self-
// containment:p2:inst-csc-enumerate-files). Named for what it actually
// enumerates since the A3 review round widened enumeration to both
// ownership-boundary kinds (CodeRabbit review finding on #493 - the prior
// `ListSubtreeFilesFn` name undersold what the function already did).
// Injected so the content self-containment algorithm never touches a real
// filesystem itself.
export type ListContentOwnedFilesFn = (templateDir: string, contentOwnedPath: string) => Promise<string[]>;
