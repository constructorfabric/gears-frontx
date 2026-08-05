// @cpt-flow:cpt-frontx-flow-cli-scaffolding-seed-repository:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-seed-empty-target:p1
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
  | { ok: false; reason: 'conflict'; conflicts: BoundaryConflictEntry[]; message: string }
  | { ok: false; reason: 'target-not-empty'; message: string }
  | { ok: false; reason: 'target-not-directory'; message: string };

/**
 * What the target path holds: the entry names of an existing directory,
 * `'not-a-directory'` when the path exists but is not a directory, or
 * `undefined` when it does not exist.
 *
 * All three are distinguished because the seed flow answers each differently: a
 * nonexistent target is created by materialization, an existing directory is
 * partitioned into content and non-content, and a non-directory is refused
 * outright with no add remedy. Injected so this flow touches no filesystem
 * itself; the concrete implementation is `createFsReadTargetDirFn` in
 * `adapters/fs-target-dir.ts`.
 */
export type TargetDirState = string[] | 'not-a-directory' | undefined;

export type ReadTargetDirFn = (path: string) => Promise<TargetDirState>;

// How many entry names a refusal quotes before summarizing the rest. A
// developer needs enough to recognize their own directory, not an inventory of
// it — and a repository with thousands of files would otherwise produce a
// message no terminal can show.
const REFUSAL_ENTRY_SAMPLE = 5;

// Entries whose presence says nothing about whether the ground is free: no
// template may declare any of them as ownership boundary (the manifest
// validator refuses `.frontx/` reserved paths on the same principle), no
// assembly writes to them, and materialization cannot collide with them.
//
// Closed deliberately. `.git` is the load-bearing member: `git init` followed by
// `frontx seed` is the ordinary way to start, and treating VCS metadata as
// content would refuse the most common first step there is. Widening this set
// to anything a template COULD write would reopen the hole the guard closes.
const NON_CONTENT_ENTRIES: ReadonlySet<string> = new Set(['.git', '.DS_Store', 'Thumbs.db']);

/**
 * cpt-frontx-flow-cli-scaffolding-seed-repository — applies an installed
 * template, plus any templates its preset references, to a target directory
 * that does not yet exist, is empty, or holds only non-content entries:
 * refuses a target already holding content and a target path that is not a
 * directory, resolves the set through the shared F10 resolver, stages it
 * through the P14 uniform-apply path, submits the staged assembly to the P29
 * pre-flight conflict check, and on pass materializes the repository writing
 * one provenance record per applied template.
 *
 * @param targetDir - the directory to seed; pass it already resolved for
 * display, since it is quoted verbatim in every refusal message
 */
export async function seedRepository(
  templateRef: string,
  targetDir: string,
  lookupFn: (name: string) => InventoryEntry | undefined,
  readContentFn: ReadContentItemsFn,
  writeFileFn: WriteFileFn,
  provenanceWriteFn: ProvenanceWriteFn,
  // Required, and ahead of the optional parameter below: a call site that
  // omitted it would silently skip the empty-target guard, which is the hole
  // that guard exists to close.
  readTargetDirFn: ReadTargetDirFn,
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

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-check-target-empty
  // The P29 pre-flight conflict check cannot stand in for this. It arbitrates
  // between templates' DECLARED boundaries, and seeding passes it an empty
  // occupied set (`checkAssemblyConflicts(assembly, [])` below) because no
  // template has been applied here yet — so content that arrived by any other
  // route is declared by nobody and every claim looks free no matter what the
  // directory holds. Without this gate, pointing seed at a populated tree
  // overwrites it silently.
  const targetState = await readTargetDirFn(targetDir);
  // Partitioned here rather than in the adapter: which entries count as content
  // is a rule of this flow, and the adapter stays a pure listing that reports
  // what is on disk without judging it.
  const contentEntries =
    targetState === undefined || targetState === 'not-a-directory'
      ? []
      : targetState.filter((entry) => !NON_CONTENT_ENTRIES.has(entry));
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-check-target-empty

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-target-not-directory
  if (targetState === 'not-a-directory') {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-target-not-directory
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-req-aborted-target-not-empty
    // No add remedy here, deliberately: `frontx add` needs a directory too and
    // would fail on this same path, so naming it would send the developer to a
    // second failure rather than to a fix.
    return {
      ok: false,
      reason: 'target-not-directory',
      message:
        `Apply refused — target path "${targetDir}" exists and is not a directory, ` +
        'so no files were written. Seeding materializes a repository into a directory; ' +
        'point it at a directory path, or remove the file occupying this one.',
    };
    // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-req-aborted-target-not-empty
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-target-not-directory
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-target-not-directory

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-target-not-empty
  if (contentEntries.length > 0) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-target-not-empty
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-req-aborted-target-not-empty
    // REQUESTED -> ABORTED without entering RESOLVED: the refusal precedes
    // resolution, so no assembly is ever staged for this operation.
    //
    // The add remedy carries its own limit. `add` checks the new template's
    // declared boundaries against those of templates ALREADY APPLIED here, and
    // this directory has none — so it will not refuse on account of the content
    // below, and it overwrites an existing file at any path the template
    // declares as its own. Stating that is the difference between a remedy and
    // a redirection into the same loss by another route.
    return {
      ok: false,
      reason: 'target-not-empty',
      message:
        `Apply refused — target directory "${targetDir}" already holds ${contentEntries.length} ` +
        `${contentEntries.length === 1 ? 'entry' : 'entries'} (${summarizeEntries(contentEntries)}). ` +
        'Seeding materializes a whole repository and would write over content no template declared, ' +
        `so no files were written. Run "frontx add ${templateRef} ${targetDir}" instead to apply this ` +
        'template into a directory that already holds content — noting that add arbitrates declared ' +
        'template boundaries only, so it can still overwrite an existing file at a path the template declares.',
    };
    // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-req-aborted-target-not-empty
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-abort-target-not-empty
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-seed-repository:p1:inst-seed-if-target-not-empty

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

// Quotes the first few entry names and counts the rest, so the refusal carries
// enough evidence for a developer to recognize the directory they aimed at.
// Sorted first: `readdir` order is filesystem-dependent, and a refusal whose
// wording shifts between runs on one unchanged directory reads as instability
// in the tool rather than as a fixed property of the directory.
function summarizeEntries(entries: string[]): string {
  const sorted = [...entries].sort();
  const shown = sorted.slice(0, REFUSAL_ENTRY_SAMPLE).join(', ');
  // `slice` already caps at the array length, so the remainder cannot go
  // negative and needs no clamping.
  const remaining = sorted.length - REFUSAL_ENTRY_SAMPLE;
  return remaining <= 0 ? shown : `${shown}, and ${remaining} more`;
}
