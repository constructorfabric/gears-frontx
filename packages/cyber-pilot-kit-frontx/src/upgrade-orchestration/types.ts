// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
//
// PLAN CORRECTION (2026-07-14) — REOPENED: this module MUST NOT import from
// the CLI package. Per DESIGN §3.4 ("the only edge is @gears-frontx/mfes
// -> @gears-frontx/gts-plugin; every other artifact is standalone" /
// "The AI Tooling Framework coordinates with the CLI by orchestrating its
// public command surface, not by linking its engine") and ADR-0027 ("reaches
// the engine only through the CLI's invocation surface ... not a dependent
// of the CLI's command surface"), this kit reaches the single F14 engine
// (`cpt-frontx-feature-upgrade-changeset`) ONLY through the `frontx upgrade`
// COMMAND/INVOCATION SURFACE — never by importing the engine's exported
// functions or types. The shapes below are therefore LOCALLY defined,
// mirroring the command surface's JSON contract
// (`packages/cli/src/commands/upgrade.ts` / `packages/cli/src/upgrade/types.ts`)
// structurally rather than nominally, so this module never names
// the CLI package and this package never depends on it
// (cpt-frontx-dod-ai-upgrade-orchestration-single-engine).

export type ChangeKind = 'add' | 'modify' | 'remove';

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-changeset-types
export interface CleanEntry {
  kind: ChangeKind;
  path: string;
  content?: string; // undefined for 'remove'
}

export interface ConflictEntry {
  path: string;
  templateKind: ChangeKind;
  templateContent?: string;
  localContent: string; // current developer-modified content
}

// Structural mirror of the F14 engine's `ChangeSet` — the reviewable change
// set carried across the `frontx upgrade` command surface's JSON contract.
export interface ChangeSet {
  templateIdentity: string;
  baselineVersion: string;
  targetVersion: string;
  targetOccupiedOwnershipBoundary: string;
  clean: CleanEntry[];
  conflicts: ConflictEntry[];
}
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-changeset-types

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-provenance-type
// Structural mirror of the F14 engine's `ProvenanceRecord` — read by this
// orchestration layer itself (flow `inst-read-provenance`) before the engine
// is ever invoked. A repository holds ONE record per applied template — a
// SET of records, never a single whole-repository origin
// (`cpt-frontx-contract-project-provenance`); `ReadProvenanceFn` below reads
// that full set, and orchestration selects the NAMED applied template's
// record from it.
export interface ProvenanceRecord {
  templateIdentity: string;
  scaffoldedFromVersion: string;
  sourceSpec: string;
}
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-provenance-type

export type ReviewDecision = 'approved' | 'declined';

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-impact-types
export interface ChangeImpactEntry {
  path: string;
  kind: ChangeKind;
  requiresAttention: boolean;
}

export interface ChangeImpactAnalysis {
  entries: ChangeImpactEntry[];
}
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-impact-types

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-downstream-types
export interface DownstreamEffectAssessment {
  incompatibilities: string[];
}
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-downstream-types

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-enriched-package-type
// The named applied template this review package's enrichment reflects —
// its identity and current (pre-upgrade) version, extracted from the
// SELECTED provenance record (inst-extract-provenance).
export interface SelectedTemplate {
  templateIdentity: string;
  currentVersion: string;
}

export interface EnrichedReviewPackage {
  selectedTemplate: SelectedTemplate;
  changeSet: ChangeSet;
  impactAnalysis: ChangeImpactAnalysis;
  downstreamAssessment: DownstreamEffectAssessment;
}
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-enriched-package-type

export type EnrichmentResult = { status: 'enriched'; package: EnrichedReviewPackage } | { status: 'empty' };

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-present-review-fn-type
// The review gate is presented by this injected function; the caller (AI agent /
// developer-facing surface) decides approve/decline. No apply happens until it
// returns 'approved' (cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced).
export type PresentEnrichedReviewFn = (reviewPackage: EnrichedReviewPackage) => Promise<ReviewDecision>;
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1:inst-present-review-fn-type

// Reads the project's FULL provenance record SET (one record per applied
// template — `cpt-frontx-contract-project-provenance`); `null` when
// provenance is absent or unreadable. Orchestration selects the NAMED
// applied template's record from the returned set (inst-read-provenance /
// inst-check-provenance).
export type ReadProvenanceFn = (projectRoot: string) => Promise<ProvenanceRecord[] | null>;

// Selects the record for the NAMED applied template from the project's
// provenance record SET — `undefined` when the set holds no matching record
// (inst-check-provenance / inst-provenance-missing).
export function selectProvenanceRecord(
  provenanceSet: ProvenanceRecord[],
  appliedTemplateName: string,
): ProvenanceRecord | undefined {
  return provenanceSet.find((record) => record.templateIdentity === appliedTemplateName);
}

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-command-surface-types
// The `frontx upgrade` command/invocation surface's JSON result, mirrored
// locally (from `packages/cli/src/commands/upgrade.ts`'s `UpgradeCommandResult`)
// so this kit never imports the CLI package.
export interface UpgradeCommandJsonResult {
  ok: boolean;
  status: 'applied' | 'declined' | 'resolution-failed' | 'apply-failed';
  message?: string;
}

// Drives the SINGLE F14 engine strictly through its `frontx upgrade`
// command/invocation surface — e.g. an adapter that spawns the `frontx` CLI
// process (or an equivalent process-boundary bridge) and parses its JSON
// output — never by importing engine internals or types from
// the CLI package (cpt-frontx-dod-ai-upgrade-orchestration-single-engine).
// `onChangeSet` is invoked by the command surface with the raw, un-enriched
// change set it computed; this orchestration layer enriches it and returns
// the developer's review decision, which the command surface then uses to
// decide whether to trigger the engine's apply step.
export type InvokeUpgradeCommandFn = (
  projectRoot: string,
  targetVersion: string,
  onChangeSet: (changeSet: ChangeSet) => Promise<ReviewDecision>,
) => Promise<UpgradeCommandJsonResult>;
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-command-surface-types
