// @cpt-flow:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1
// @cpt-state:cpt-frontx-state-composed-provenance-composition-resolution:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-composition-delivered:p1
// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1
import type { InventoryEntry } from '../inventory/types';
import { readManifestFromContent } from '../manifest/validate-contract';
import { resolveComposition } from '../composition/resolve';
import { CompositionResolutionState } from '../composition/state';
import { uniformApply } from './assembler';
import { checkAssemblyConflicts } from './conflict';
import { isUserFixableMaterializeFailure, materializeAssembly } from './materialize';
import { provenancePath } from '../provenance/contract';
import type { BoundaryConflictEntry } from './state';
import type { ProvenanceWriteFn } from '../provenance/types';
import type { ReadContentItemsFn, ReadProjectFileFn, WriteFileFn } from './types';

export type ComposedScaffoldResult =
  | { ok: true; message: string; provenanceLocation: string }
  | {
      ok: false;
      reason:
        | 'registry-unreachable'
        | 'cycle'
        | 'resolve-error'
        | 'provenance-failed'
        // review #500 round 2 (P2-3): mirrors SeedRepositoryResult/AddTemplateResult's
        // reason of the same name — a materialization refusal the target
        // repository's owner can act on and retry (composeSharedFiles'
        // `unrecorded-owner`, `span-overlap`, or `carried-block-conflict`;
        // see `isUserFixableMaterializeFailure`), kept distinct from
        // `provenance-failed` because, unlike a real provenance-write
        // failure, NO file was written when this reason is returned.
        | 'materialization-refused';
      message: string;
    }
  | { ok: false; reason: 'conflict'; conflicts: BoundaryConflictEntry[]; message: string };

// @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-issue-scaffold
/**
 * Scaffold a composed project template: resolves the full composition tree
 * (Option-C ordering) — stage → conflict-check → branch → abort-on-conflict
 * (no writes) → materialize → full per-applied-template provenance set — so
 * the project can be updated or audited later. Mirrors the same Option-C
 * ordering already proven by the sibling F12 entry flow
 * (`cpt-frontx-flow-cli-scaffolding-seed-repository`,
 * `../commands/seed-repository.ts`): resolve → stage via the uniform apply
 * path → pre-flight conflict check → materialize. This flow keeps its own
 * distinct flow/state identity (`cpt-frontx-flow-composed-provenance-scaffold-composed-project`,
 * `cpt-frontx-state-composed-provenance-composition-resolution`) because it
 * is owned by `cpt-frontx-feature-composed-provenance`, not F12.
 */
export async function scaffoldComposedProject(
  templateRef: string,
  targetDir: string,
  lookupFn: (name: string) => InventoryEntry | undefined,
  writeFileFn: WriteFileFn,
  provenanceWriteFn: ProvenanceWriteFn,
  readContentFn: ReadContentItemsFn,
  // Optional — a composed scaffold always targets a fresh directory, so
  // "nothing already on disk" (the default) is the correct value; kept
  // overridable for callers that want to reconcile against a real path.
  readProjectFileFn: ReadProjectFileFn = async () => null,
): Promise<ComposedScaffoldResult> {
// @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-issue-scaffold

  // State: DECLARED → tracks composition resolution lifecycle for traceability
  const stateTrace: CompositionResolutionState[] = [CompositionResolutionState.DECLARED];

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-resolve-root-template
  const rootEntry = lookupFn(templateRef);
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-resolve-root-template

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-registry-reach
  if (!rootEntry) {
    // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-abort-registry
    return {
      ok: false,
      reason: 'registry-unreachable',
      message: `Scaffold aborted — template "${templateRef}" not found in local inventory.`,
    };
    // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-abort-registry
  }
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-registry-reach

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-read-manifest
  const manifestResult = readManifestFromContent(rootEntry.content);
  if (!manifestResult.ok) {
    return {
      ok: false,
      reason: 'registry-unreachable',
      message: `Cannot read manifest for "${templateRef}": ${manifestResult.message}`,
    };
  }
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-read-manifest

  // Transition: DECLARED → RESOLVING
  // @cpt-begin:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-declared-resolving
  stateTrace.push(CompositionResolutionState.RESOLVING);
  // @cpt-end:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-declared-resolving

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-invoke-resolution
  const compositionResult = await resolveComposition(
    rootEntry,
    templateRef,
    new Set<string>(),
    0,
    lookupFn,
  );
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-invoke-resolution

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-resolution-error
  if (!compositionResult.ok) {
    // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-abort-resolution-error
    // Transition: RESOLVING → ABORTED (unresolvable reference or reference cycle)
    // @cpt-begin:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolving-aborted
    stateTrace.push(CompositionResolutionState.ABORTED);
    // @cpt-end:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolving-aborted
    return {
      ok: false,
      reason: compositionResult.reason,
      message:
        compositionResult.reason === 'cycle'
          ? `Scaffold aborted — cycle detected in composition graph: ${compositionResult.path.join(' → ')}`
          : `Scaffold aborted — ${compositionResult.message}`,
    };
    // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-abort-resolution-error
  }
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-resolution-error

  // Transition: RESOLVING → RESOLVED
  // @cpt-begin:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolving-resolved
  stateTrace.push(CompositionResolutionState.RESOLVED);
  // @cpt-end:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolving-resolved

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-stage-composition
  // Stage the resolved per-template composition set as a staged assembly
  // through the uniform apply path — the SAME P14 path the sibling F12 entry
  // flows invoke (`cpt-frontx-algo-cli-scaffolding-uniform-apply`). This
  // reads each applied template's content items directly from its installed
  // content path, scoped to its declared ownership boundaries.
  const templateIdentities = [...compositionResult.templates.keys()];
  const applyResult = await uniformApply(templateIdentities, false, lookupFn, readContentFn);
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-stage-composition

  if (!applyResult.ok) {
    // Defensive — every identity here was already resolved and manifest-read
    // by resolveComposition above via the same lookupFn, so this path is not
    // expected to be reachable in practice.
    return {
      ok: false,
      reason: 'resolve-error',
      message: `Scaffold aborted — ${applyResult.message}`,
    };
  }

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-boundary-conflict
  // Submit the staged assembly to the pre-flight ownership-boundary conflict
  // check — the sole authority for boundary-collision arbitration. A fresh
  // scaffold has no already-occupied boundaries to compare against.
  const verdict = checkAssemblyConflicts(applyResult.assembly, []);
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-boundary-conflict

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-conflict-result
  if (!verdict.ok) {
    // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-abort-boundary-conflict
    // Transition: RESOLVED → ABORTED (same-target-path boundary conflict)
    // @cpt-begin:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolved-aborted-conflict
    stateTrace.push(CompositionResolutionState.ABORTED);
    // @cpt-end:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolved-aborted-conflict
    const contested = verdict.conflicts
      .map((conflict) => `"${conflict.ground}" (${conflict.contestants.join(', ')})`)
      .join('; ');
    return {
      ok: false,
      reason: 'conflict',
      conflicts: verdict.conflicts,
      message: `Scaffold aborted — ownership-boundary conflict at ${contested}; no files written.`,
    };
    // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-abort-boundary-conflict
  }
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-conflict-result

  // Transition: RESOLVED → CONFLICT_CHECKED (no intersecting boundary claim)
  // @cpt-begin:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolved-conflict-checked
  stateTrace.push(CompositionResolutionState.CONFLICT_CHECKED);
  // @cpt-end:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-resolved-conflict-checked

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-scaffold-composition
  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-invoke-provenance-write
  // Materialize the cleared staged assembly, writing all files in one
  // operation — including each applied template's `.frontx/ai/<template-identity>/`
  // bundle as ordinary owned content — then invoke the provenance write
  // algorithm with the FULL set of applied templates, so one record per
  // applied template is written into `.frontx/provenance.json`
  // (`cpt-frontx-algo-composed-provenance-provenance-write`). Delegates to
  // the shared `materializeAssembly`, which invokes `composeSharedFiles` for
  // the write and `writeProvenance` for the provenance set — neither
  // algorithm is re-implemented here.
  const materializeResult = await materializeAssembly(
    applyResult.assembly,
    targetDir,
    [],
    lookupFn,
    writeFileFn,
    provenanceWriteFn,
    readProjectFileFn,
  );
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-invoke-provenance-write
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-scaffold-composition

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-provenance-write-fail
  if (!materializeResult.ok) {
    // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-report-provenance-fail
    // review #500 round 2 (P2-3): `materializeAssembly` reports TWO distinct
    // failure modes under one `{ok:false}` shape — a `composeSharedFiles`
    // materialization refusal (reachable now that a real `readProjectFileFn`
    // is plumbed through this flow, not the always-null default) and a real
    // `writeProvenance` failure. They are not the same event: a refusal
    // writes ZERO files (composeSharedFiles defers every write until every
    // path is refusal-free), so "Scaffold completed" is a direct falsehood
    // for it, and it is user-fixable (e.g. register the occupying template's
    // provenance and retry) — exactly the distinction `seedRepository` and
    // `addTemplate` already surface via `isUserFixableMaterializeFailure`.
    // Only a genuine provenance-write failure — files already written,
    // provenance the only thing that failed — keeps the "completed" wording.
    const reason = isUserFixableMaterializeFailure(materializeResult) ? 'materialization-refused' : 'provenance-failed';
    return {
      ok: false,
      reason,
      message:
        reason === 'materialization-refused'
          ? `Scaffold aborted — ${materializeResult.message}`
          : `Scaffold completed but provenance write failed: ${materializeResult.message}`,
    };
    // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-report-provenance-fail
  }
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-check-provenance-write-fail

  // Transition: CONFLICT_CHECKED → SCAFFOLDED (files + full provenance set written)
  // @cpt-begin:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-checked-scaffolded
  stateTrace.push(CompositionResolutionState.SCAFFOLDED);
  // @cpt-end:cpt-frontx-state-composed-provenance-composition-resolution:p1:inst-transition-checked-scaffolded

  // @cpt-begin:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-return-success
  // The AI Tooling Framework discovers and activates each applied template's
  // `.frontx/ai/<template-identity>/` bundle on its own next invocation by
  // scanning the repository — no CLI-to-Kit signal is sent here.
  return {
    ok: true,
    message: `Scaffold complete — composed project written to "${targetDir}".`,
    provenanceLocation: provenancePath(targetDir),
  };
  // @cpt-end:cpt-frontx-flow-composed-provenance-scaffold-composed-project:p1:inst-return-success
}
