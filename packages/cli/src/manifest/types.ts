// @cpt-algo:cpt-frontx-algo-template-manifest-validate-contract:p1
// @cpt-state:cpt-frontx-state-template-manifest-validation-lifecycle:p1
// @cpt-dod:cpt-frontx-dod-template-manifest-single-description:p1

export const MANIFEST_FILENAME = 'frontx-template.json';
export const MANIFEST_SCHEMA_VERSION = '1.0';

export type TemplateKind = 'project-template' | 'mfe-template';
export const RECOGNIZED_KINDS: TemplateKind[] = ['project-template', 'mfe-template'];

export interface CompositionRef {
  ref: string; // source-spec ("github:acme/mfe@v1.0.0") or registered name
}

// Single authoritative contract — cpt-frontx-contract-template-manifest
// Same shape used at pre-publish validation, install time, and scaffold time.
export interface TemplateManifest {
  schemaVersion?: string;           // optional; absent = '1.0'; enables forward-reading
  name: string;                     // identity field
  version: string;                  // template version string
  kind: TemplateKind;               // 'project-template' | 'mfe-template'
  compositions?: CompositionRef[];  // project-template only
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
export type ManifestValidationState = 'DRAFT' | 'VALIDATED' | 'REJECTED' | 'PUBLISHED';
// @cpt-end:cpt-frontx-state-template-manifest-validation-lifecycle:p1:inst-draft-to-validated

// ReadFileFn — injected for testability (no fs calls in core logic)
export type ReadFileFn = (path: string) => Promise<string>;
