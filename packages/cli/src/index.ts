// @cpt-component:cpt-frontx-component-cli:p1
// @cpt-constraint:cpt-frontx-constraint-cli-template-independence:p1
// Zero template content is bundled in this package.
// All template resolution happens at runtime via source-spec.

export { parseSourceSpec } from './spec-parser/parse';
export type { StructuredRef, ParseError, ParseResult } from './spec-parser/types';

export { resolveToInventory } from './resolver/resolve';
export type { FetchFn, InventoryReadyRecord, ResolutionError, ResolveResult } from './resolver/types';

export { TemplateInventory } from './inventory/TemplateInventory';
export { InventoryIndex } from './inventory/InventoryIndex';
export { InventoryStore } from './inventory/InventoryStore';
export { InventoryState } from './inventory/types';
export type { InventoryEntry, InventoryError, InventoryResult } from './inventory/types';

export { installCommand } from './commands/install';
export type { InstallCommandResult } from './commands/install';

// F16 cross-package edge (F16 <- F10): install-time extension discovery hook
export type { DiscoveryHookContext, DiscoveryHookResult, ExtensionDiscoveryHook } from './discovery/types';
export { createFsBackedDiscoveryHook } from './discovery/fs-hook';
export type { FsExtensionDiscovery } from './discovery/fs-hook';

export { listCommand, listJsonEnvelope } from './commands/list';
export type { ListEntry, ListJsonEnvelope } from './commands/list';

export { updateLocalCommand } from './commands/update-local';
export type { UpdateLocalResult } from './commands/update-local';

export { validateManifestContract, readManifestFromContent } from './manifest/validate-contract';
export { validateContentSelfContainment } from './manifest/validate-content-self-containment';
export { validateCommand } from './commands/validate';
export type {
  TemplateManifest,
  OwnershipBoundary,
  SharedFileEntry,
  ReferencedTemplate,
  ManifestViolation,
  ManifestValidationResult,
  ManifestValidationState,
  ReadFileFn,
  ListContentOwnedFilesFn,
} from './manifest/types';
export type { ReadManifestResult } from './manifest/validate-contract';
export { createFsReadFileFn, createFsListContentOwnedFilesFn } from './adapters/fs-project-io';
export type { ValidateCommandResult } from './commands/validate';
export { MANIFEST_FILENAME, MANIFEST_SCHEMA_VERSION } from './manifest/types';

export { scaffoldComposedProject } from './scaffold/composed';
export type { ComposedScaffoldResult } from './scaffold/composed';

// F12 kindless assembler core (cpt-frontx-algo-cli-scaffolding-uniform-apply,
// cpt-frontx-state-cli-scaffolding-assembly-op) — the ONE apply path both
// seed-a-repository and add-a-template invoke. The pre-flight conflict
// checker (P29) and the entry flows (P30) build on this surface.
export { uniformApply } from './scaffold/assembler';
export type { UniformApplyResult } from './scaffold/assembler';
export { AssemblyOpState, runAssemblyOp } from './scaffold/state';
export type {
  AssemblyOpInput,
  AssemblyOpResult,
  AssemblyAbortReason,
  BoundaryConflictEntry,
  ConflictVerdict,
  ConflictVerdictFn,
  MaterializeAssemblyFn,
  OccupiedBoundaryEntry,
} from './scaffold/state.js';

// F12 pre-flight assembly conflict checker (P29) — the sole authority for
// boundary-collision arbitration (cpt-frontx-algo-cli-scaffolding-conflict-check,
// cpt-frontx-dod-cli-scaffolding-conflict-check). Fills the `conflictVerdictFn`
// seam `runAssemblyOp` (above) drives through.
export { checkAssemblyConflicts } from './scaffold/conflict';
// `ReadProjectFileFn` is intentionally NOT re-exported from here again: it is
// the same shape as upgrade's `ReadProjectFileFn` (already exported below),
// redeclared locally in `scaffold/types.ts` only to avoid a cross-feature
// import, not to mint a second public name for it.
export type {
  WriteFileFn,
  ConflictCheckFn,
  ContentItem,
  ReadContentItemsFn,
  ContributionEntry,
  StagedAssembly,
} from './scaffold/types.js';

export { resolveComposition } from './composition/resolve';
export { CompositionResolutionState } from './composition/state';
export type { CompositionEntry, CompositionSetResult } from './composition/types';

export { writeProvenance } from './provenance/write';
export type { WriteProvenanceResult } from './provenance/write';
export type { ProvenanceRecord, ProvenanceWriteFn } from './provenance/types';
export { PROVENANCE_RELATIVE_PATH, provenancePath } from './provenance/contract';

// F12 shared-file region composer (cpt-frontx-algo-cli-scaffolding-compose-shared-files,
// cpt-frontx-dod-cli-scaffolding-compose-shared-files) — the sole authority
// materializeAssembly (below) delegates to for writing every target
// repository file, so no per-contribution write can silently clobber another
// contributor's owned region.
export { composeSharedFiles, groupContributionsByPath } from './scaffold/compose-shared-files';
export type { ComposeSharedFilesResult, ExtractedRegion, MaterializedFile } from './scaffold/compose-shared-files';

// F12 entry flows (P30) — cpt-frontx-flow-cli-scaffolding-seed-repository and
// cpt-frontx-flow-cli-scaffolding-add-template. Both WIRE the P14 uniform-apply
// path and the P29 pre-flight conflict checker above; neither re-implements
// them. materializeAssembly realizes the shared boundary-declared-assembly DoD
// (cpt-frontx-dod-cli-scaffolding-boundary-declared-assembly) AND delegates to
// composeSharedFiles for the shared-file region composition DoD
// (cpt-frontx-dod-cli-scaffolding-compose-shared-files).
export {
  isUserFixableMaterializeFailure,
  materializeAssembly,
  occupiedBoundariesFromProvenance,
} from './scaffold/materialize';
export type { MaterializeResult, ReadProvenanceRecordsFn } from './scaffold/materialize';
export { seedRepository } from './commands/seed-repository';
export type { SeedRepositoryResult } from './commands/seed-repository';
export { addTemplate } from './commands/add-template';
export type { AddTemplateResult } from './commands/add-template';

// F14 Upgrade Change-Set Engine (cpt-frontx-dod-upgrade-changeset-single-engine)
// There is exactly ONE engine. Direct CLI invocation uses these canonical
// modules internally. F17 AI-driven orchestration does NOT import these
// modules or take a compile-time package dependency on this package for its
// engine access — it reaches this same engine only through the `frontx
// upgrade` command/invocation surface (`upgradeCommand`, ./commands/upgrade.js),
// per DESIGN §3.4 ("orchestrates ... through its command surface ... NOT by
// linking its engine").
export { upgradeChangeSetReviewApproval } from './upgrade/flow';
export type { UpgradeFlowResult, UpgradeFlowDeps } from './upgrade/flow';
export { computeChangeSet } from './upgrade/compute';
export type { ComputeResult } from './upgrade/compute';
export { applyChangeSet } from './upgrade/apply';
export type { ApplyResult } from './upgrade/apply';
export { rollbackChangeSet } from './upgrade/rollback';
export type { RollbackResult } from './upgrade/rollback';
export { ChangeSetLifecycleState } from './upgrade/state';
export type {
  ChangeKind,
  CleanEntry,
  ConflictEntry,
  ChangeSet,
  ProjectSnapshot,
  ReadProvenanceFn,
  ReadProjectFileFn,
  WriteProjectFileFn,
  RemoveProjectFileFn,
  WriteProvenanceFn,
  PresentAndGetApprovalFn,
} from './upgrade/types';

// F14 command/invocation surface — the ONLY integration path F17 (and any
// other external artifact) should use to drive the change-set engine.
export { upgradeCommand } from './commands/upgrade';
export type { UpgradeCommandResult } from './commands/upgrade';
