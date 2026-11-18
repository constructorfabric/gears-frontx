// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced:p1
// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1
//
// PLAN CORRECTION (2026-07-14) — REOPENED: this module MUST NOT import from
// the CLI package. Per DESIGN §3.4 ("the only edge is @gears-frontx/mfes
// -> @gears-frontx/gts-plugin; every other artifact is standalone" /
// "The AI Tooling Framework coordinates with the CLI by orchestrating its
// public command surface, not by linking its engine") and ADR-0026 ("reaches
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
  content?: string; // Optional for custom adapters; CLI review plans carry no file bytes.
}

export interface ConflictEntry {
  path: string;
  templateKind: ChangeKind;
  templateContent?: string;
  localContent: string; // current developer-modified content
}

export interface ReviewablePlan {
  name: string;
  from: { origin: string; version: string };
  to: { origin: string; version: string };
  targets: string[];
  operations: { target: string; path: string; op: 'ADD' | 'REPLACE' | 'REMOVE' | 'KEEP_LOCAL' | 'UNCHANGED' }[];
  skipped: { target: string; path: string; reason: string }[];
  retainedGround?: { template: string; ground: string }[];
  ai?: {
    destination: string;
    changes: { path: string; kind: string }[];
    files: ReviewableFile[];
    existing: ReviewableFile[];
  };
}

interface ReviewableFile {
  path: string;
  length: number;
  sha256: string;
  linkTarget?: string;
}

// Kit-local projection for enrichment. The CLI adapter also supplies the complete review.
export interface ChangeSet {
  templateIdentity: string;
  baselineVersion: string;
  targetVersion: string;
  clean: CleanEntry[];
  conflicts: ConflictEntry[]; // Custom adapters may supply conflicts; the CLI refuses them before review.
  plan?: ReviewablePlan;
  notes?: string[];
}
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-changeset-types

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1:inst-provenance-type
// The project's SINGLE state document (`cpt-frontx-contract-project-provenance`)
// used to be mirrored here as `PreviousOrigin`/`TemplateEntry`/`ProjectStateDocument`
// plus a `selectTemplateEntry` lookup. F16's template AI-extension trust gate
// reads the SAME document, so that shape is now promoted to the neutral
// `src/project-state.ts` — this module imports it from there rather than
// re-declaring it, keeping exactly ONE mirror of it in this kit.
import type { ProjectStateDocument } from '../project-state.js';
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
// The named template this review package's enrichment reflects — its
// name, its current (pre-upgrade) `origin`/`version`, and every target
// listed under it, extracted from the SELECTED `templates[name]` entry
// (`inst-extract-provenance`). `targets` travels alongside identity/version
// so the enrichment step sees the full unit the upgrade will validate and
// move atomically, per `cpt-frontx-adr-project-upgrade-mechanism` — it is
// never dropped on the way from selection to enrichment.
export interface SelectedTemplate {
  name: string;
  origin: string;
  version: string;
  targets: string[];
}

export interface EnrichedReviewPackage {
  selectedTemplate: SelectedTemplate;
  changeSet: ChangeSet;
  /** Complete CLI plan and its consequence notes, formatted for the approval prompt. */
  reviewText?: string;
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

// Reads the project's single state document (`.frontx/project.json`,
// `cpt-frontx-contract-project-provenance`); `null` when the document is
// absent or unreadable — signaled by `null`, never a throw, matching
// `ReadProjectStateFn`'s own convention. Orchestration selects the NAMED
// template's `TemplateEntry` from the returned document's `templates` map
// (inst-read-provenance / inst-check-provenance-unreadable).
export type ReadProvenanceFn = (projectRoot: string) => Promise<ProjectStateDocument | null>;

// `selectTemplateEntry` (the NAMED-template lookup on `templates`,
// inst-check-not-registered / inst-provenance-not-registered) now lives on
// `../project-state.js` alongside the document shape it looks up — imported
// directly by callers (e.g. `orchestrate.ts`) rather than re-exported here.

export { resolveTargetOrigin } from './resolve-target-origin.js';

// @cpt-begin:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-command-surface-types
// The `frontx upgrade` command/invocation surface's outcome, mirrored
// LOCALLY (never imported from the CLI package) as this adapter's own
// `InvokeUpgradeCommandFn` return shape.
//
// This is NOT a mirror of one CLI-native envelope shape — the real surface
// (`packages/cli/src/commands/upgrade.ts` via `cli.ts`'s
// `renderUpgradeOutcome`) emits the shared `{ok:true, data}` /
// `{ok:false, error:{code, message, details}}` envelope
// (`cpt-frontx-adr-cli-machine-readable-output`), not the flat `{ok,
// status, message}` this interface used to describe as that mirror. That
// flat shape is retired on the CLI side too (`renderUpgradeOutcome`'s own
// header: "never the retired bespoke `{ok, status}` shape"). Kept here
// anyway, EXTENDED rather than replaced, because it is this adapter's own
// return contract (`InvokeUpgradeCommandFn`) that the orchestration layer
// above it (`orchestrate.ts`) already consumes by `status` literal —
// replacing it with the real envelope shape would ripple into that
// unrelated layer for no requirement this fix carries.
export interface UpgradeCommandJsonResult {
  ok: boolean;
  // `'noop'` added: the real surface's first, unconfirmed `--json` call can
  // report `{outcome:'noop'}` directly — the project is already at the
  // target version, nothing to confirm, nothing written. Distinguished from
  // `'applied'` (a write actually happened) rather than folded into it, so a
  // caller can tell "already there" from "just landed".
  status: 'applied' | 'declined' | 'resolution-failed' | 'apply-failed' | 'noop';
  message?: string;
  /**
   * The real surface's own `error.code` (the shared
   * `cpt-frontx-adr-cli-machine-readable-output` vocabulary) for a
   * `resolution-failed` or `apply-failed` result — carried verbatim rather
   * than collapsed into `message`, so a caller can distinguish e.g.
   * `TARGET_CONFLICT` from `CONTENT_CONFLICT` instead of losing which
   * refusal this was. Always absent for `applied`/`noop`, and for
   * `declined` — that result is synthesized locally by the adapter when
   * `onChangeSet` returns `'declined'`, never parsed from a CLI failure
   * envelope.
   */
  code?: string;
  transitionCommitted?: boolean;
  targetVersion?: string;
}

// Drives the SINGLE F14 engine strictly through its `frontx upgrade
// <templateName> <new-origin>` command/invocation surface (§1.1) — e.g. an
// adapter that spawns the `frontx` CLI process (or an equivalent
// process-boundary bridge) and parses its JSON output — never by importing
// engine internals or types from the CLI package
// (cpt-frontx-dod-ai-upgrade-orchestration-single-engine). `templateName` is
// the orchestration's own selected name (§1.1, `inst-invoke-engine`): the
// engine reads its baseline from that SAME name, so neither layer can name a
// template the other did not. `onChangeSet` is invoked by the command
// surface with the raw, un-enriched change set it computed; this
// orchestration layer enriches it and returns the developer's review
// decision, which the command surface then uses to decide whether to
// trigger the engine's apply step.
export type InvokeUpgradeCommandFn = (
  projectRoot: string,
  templateName: string,
  // The RESOLVED origin, never the bare version — see `resolveTargetOrigin`
  // above for why the engine cannot be handed a version here.
  targetOrigin: string,
  onChangeSet: (changeSet: ChangeSet) => Promise<ReviewDecision>,
) => Promise<UpgradeCommandJsonResult>;
// @cpt-end:cpt-frontx-dod-ai-upgrade-orchestration-single-engine:p1:inst-command-surface-types
