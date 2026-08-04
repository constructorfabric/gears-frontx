// @cpt-flow:cpt-frontx-flow-cli-scaffolding-seed-repository:p1
import { resolveComposition } from '../composition/resolve';
import { uniformApply } from '../scaffold/assembler';
import { checkAssemblyConflicts } from '../scaffold/conflict';
import { isUserFixableMaterializeFailure, materializeAssembly } from '../scaffold/materialize';
import type { InventoryEntry } from '../inventory/types';
import type { ReadContentItemsFn, ReadProjectFileFn, WriteFileFn } from '../scaffold/types';
import type { BoundaryConflictEntry } from '../scaffold/state';
import type { ProvenanceWriteFn } from '../provenance/types';

export type SeedRepositoryResult =
  | { ok: true; message: string; appliedTemplates: string[] }
  | {
      ok: false;
      reason:
        | 'unresolved'
        | 'cycle'
        | 'manifest-unreadable'
        | 'provenance-failed'
        // review #500 (fix 2/2): mirrors AddTemplateResult's reason of the
        // same name — see the comment there for the exit-code rationale. A
        // fresh seed target is normally empty, but composeSharedFiles is
        // still invoked and can still refuse for the same reasons an `add`
        // can (a template's manifest declares a `region-union` path that
        // collides with content the caller's own writeFileFn/readProjectFileFn
        // adapter already has on disk at the target).
        | 'materialization-refused';
      message: string;
    }
  | { ok: false; reason: 'conflict'; conflicts: BoundaryConflictEntry[]; message: string };

/**
 * cpt-frontx-flow-cli-scaffolding-seed-repository — applies an installed
 * template, plus any templates its preset references, to an EMPTY target
 * directory: resolves the set through the shared F10 resolver, stages it
 * through the P14 uniform-apply path, submits the staged assembly to the P29
 * pre-flight conflict check, and on pass materializes the repository writing
 * one provenance record per applied template.
 */
export async function seedRepository(
  templateRef: string,
  targetDir: string,
  lookupFn: (name: string) => InventoryEntry | undefined,
  readContentFn: ReadContentItemsFn,
  writeFileFn: WriteFileFn,
  provenanceWriteFn: ProvenanceWriteFn,
  // Optional — defaults to "nothing already on disk", which is exactly what
  // a fresh seed target already is; a caller that has no reason to reconcile
  // with an existing file (e.g. a test fixture) can omit it.
  // TODO(#489): make required once the template-mfe-harness branch merges —
  // kept optional only because `__tests__/template-split.e2e.test.ts` (edited
  // on that branch) calls this without supplying it.
  readProjectFileFn: ReadProjectFileFn = async () => null,
): Promise<SeedRepositoryResult> {
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-invoke
  // entry: apply command invoked with a template reference and a target directory path
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-invoke

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-check-resolved
  const rootEntry = lookupFn(templateRef);
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-check-resolved

  if (!rootEntry) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-not-found
    return {
      ok: false,
      reason: 'unresolved',
      message: `Apply aborted — template "${templateRef}" not found in local inventory; no files written.`,
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-not-found
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-resolve-set
  const compositionResult = await resolveComposition(rootEntry, templateRef, new Set<string>(), 0, lookupFn);
  if (!compositionResult.ok) {
    return {
      ok: false,
      reason: compositionResult.reason === 'cycle' ? 'cycle' : 'unresolved',
      message:
        compositionResult.reason === 'cycle'
          ? `Apply aborted — cycle detected in composition graph: ${compositionResult.path.join(' → ')}; no files written.`
          : `Apply aborted — ${compositionResult.message}; no files written.`,
    };
  }
  const templateRefs = [...compositionResult.templates.keys()];
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-resolve-set

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-stage
  const applyResult = await uniformApply(templateRefs, false, lookupFn, readContentFn);
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-stage

  if (!applyResult.ok) {
    return { ok: false, reason: applyResult.reason, message: `Apply aborted — ${applyResult.message}` };
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-conflict-check
  const verdict = checkAssemblyConflicts(applyResult.assembly, []);
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-conflict-check

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-conflict
  if (!verdict.ok) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-conflict
    return {
      ok: false,
      reason: 'conflict',
      conflicts: verdict.conflicts,
      message: 'Apply aborted — the staged assembly has an intersecting ownership-boundary claim; no files written.',
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-conflict
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-conflict

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-materialize
  const materializeResult = await materializeAssembly(
    applyResult.assembly,
    targetDir,
    [],
    lookupFn,
    writeFileFn,
    provenanceWriteFn,
    readProjectFileFn,
  );
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-materialize

  if (!materializeResult.ok) {
    // review #500 (fix 2/2): see the identical branch in add-template.ts.
    const reason = isUserFixableMaterializeFailure(materializeResult) ? 'materialization-refused' : 'provenance-failed';
    // review #500 (round 5): composeSharedFiles' own 'unrecorded-owner'
    // message tells the caller to "record this owner's applied provenance
    // and retry" — sound advice for `add`, which reads the target's real
    // provenance, but never executable for `seed`: this command hardcodes
    // an empty `existingProvenance` a few lines up (a seed target has none
    // by definition — inst-seed-materialize), so no amount of recording
    // provenance in the target directory changes what THIS command passes
    // to `materializeAssembly` on a retry. Reusing compose's message
    // verbatim would present a fixable-looking exit code (EXIT_USER_ERROR,
    // via `isUserFixableMaterializeFailure`) with advice that can never
    // actually fix it. The real fix is the one FEATURE.md's seed error
    // scenario names: this target directory is not empty, contra seed's
    // documented precondition — the developer wants `frontx add`, not a
    // retry of `seed`.
    const message =
      materializeResult.composeReason === 'unrecorded-owner' && materializeResult.unrecordedOwner
        ? `Apply aborted — path "${materializeResult.unrecordedOwner.path}" in "${targetDir}" carries a block ` +
          `owned by "${materializeResult.unrecordedOwner.templateIdentity}" ` +
          `(region "${materializeResult.unrecordedOwner.regionKey}") that this seed does not apply. A seed target ` +
          'must be an empty directory: this one already holds applied-template content, and "frontx apply" (seed) ' +
          "never reads a target's existing provenance, so no owner can ever be recorded here to clear this " +
          'refusal on a retry. To add a template to a repository that already holds applied templates, use ' +
          '"frontx add" instead. No file was written.'
        : materializeResult.message;
    return { ok: false, reason, message };
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-done
  return {
    ok: true,
    message: `Apply complete — repository seeded at "${targetDir}"; one provenance record written per applied template.`,
    appliedTemplates: templateRefs,
  };
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-return-done
}
