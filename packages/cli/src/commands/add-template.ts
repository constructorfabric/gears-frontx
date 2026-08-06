// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-add-undeclared-content:p1
import { resolveComposition } from '../composition/resolve';
import { uniformApply } from '../scaffold/assembler';
import { groupContributionsByPath } from '../scaffold/compose-shared-files';
import { checkAssemblyConflicts } from '../scaffold/conflict';
import { isUserFixableMaterializeFailure, materializeAssembly, occupiedBoundariesFromProvenance } from '../scaffold/materialize';
import { summarizeEntries } from './summarize-entries';
import type { ReadProvenanceRecordsFn } from '../scaffold/materialize';
import type { InventoryEntry } from '../inventory/types';
import type { ReadContentItemsFn, ReadProjectFileFn, StagedAssembly, WriteFileFn } from '../scaffold/types';
import type { BoundaryConflictEntry, OccupiedBoundaryEntry } from '../scaffold/state';
import type { ProvenanceWriteFn } from '../provenance/types';

export type AddTemplateResult =
  | { ok: true; message: string; appliedTemplates: string[] }
  | {
      ok: false;
      reason:
        | 'unresolved'
        | 'cycle'
        | 'manifest-unreadable'
        | 'provenance-failed'
        // review #500 (fix 2/2): a materialization refusal the repository's
        // owner can act on and retry — composeSharedFiles' 'unrecorded-owner',
        // 'span-overlap', or 'carried-block-conflict' (see
        // isUserFixableMaterializeFailure). Kept distinct from
        // 'provenance-failed' so cli.ts's exit-code mapping (anything but
        // 'manifest-unreadable'/'provenance-failed' is EXIT_USER_ERROR) sends
        // the user a fixable-error code instead of an internal-error one.
        | 'materialization-refused'
        | 'occupied-not-installed'
        | 'occupied-manifest-unreadable'
        | 'occupied-source-ambiguous';
      message: string;
    }
  | { ok: false; reason: 'conflict'; conflicts: BoundaryConflictEntry[]; message: string }
  | { ok: false; reason: 'target-holds-undeclared-content'; paths: string[]; message: string }
  | { ok: false; reason: 'target-not-directory'; message: string };

/**
 * What stands at one absolute path in the target repository: a directory, any
 * other kind of on-disk entry, or nothing at all.
 *
 * The three are distinguished because the add flow answers each differently: an
 * absent path is free ground materialization writes into, a directory or a file
 * standing where the incoming template owns ground is content the write would
 * destroy, and a target path that is a file at all is refused outright. Injected
 * so this flow touches no filesystem itself; the concrete implementation is
 * `createFsReadTargetPathStateFn` in `adapters/fs-target-path.ts`.
 */
export type TargetPathState = 'directory' | 'file' | 'absent';

export type ReadTargetPathStateFn = (absolutePath: string) => Promise<TargetPathState>;

/**
 * cpt-frontx-flow-cli-scaffolding-add-template — applies an installed
 * template, plus any templates its preset references, into an EXISTING
 * repository that already holds applied templates: resolves the set through
 * the shared F10 resolver, stages it through the SAME P14 uniform-apply path
 * used to seed a repository, and submits the staged assembly TOGETHER WITH
 * the boundaries already occupied by the repository's applied templates
 * (derived from its existing provenance records) to the P29 pre-flight
 * conflict check. On pass, materializes ONLY the newly applied templates'
 * contribution and adds one provenance record per newly applied template.
 *
 * Refuses, before any write, a target that holds content at a path the incoming
 * assembly owns and that no applied template's recorded provenance accounts for:
 * the conflict check above arbitrates DECLARED boundaries only, so content that
 * arrived by any other route is declared by nobody and every claim over it looks
 * free (cpt-frontx-dod-cli-scaffolding-add-undeclared-content).
 *
 * @param targetDir - the repository to extend; pass it already resolved for
 * display, since it is quoted verbatim in every refusal message
 */
export async function addTemplate(
  templateRef: string,
  targetDir: string,
  lookupFn: (name: string) => InventoryEntry | undefined,
  // The whole installed set, needed to resolve a provenance record whose
  // identity predates the manifest-declared scheme by its source address.
  listInstalledFn: () => Promise<InventoryEntry[]>,
  readContentFn: ReadContentItemsFn,
  writeFileFn: WriteFileFn,
  readProvenanceFn: ReadProvenanceRecordsFn,
  provenanceWriteFn: ProvenanceWriteFn,
  // Required, and ahead of the optional parameter below: a call site that
  // omitted it would silently skip the occupied-ground guard, which is the hole
  // that guard exists to close.
  readTargetPathStateFn: ReadTargetPathStateFn,
  // Optional — defaults to "nothing already on disk". A real `add` against a
  // repository that already holds applied templates should always supply the
  // real adapter, or a recorded region-union block from an earlier apply
  // will not be found and carried forward.
  // TODO(#489): make required once the template-mfe-harness branch merges —
  // kept optional only because `__tests__/template-split.e2e.test.ts` (edited
  // on that branch) calls this without supplying it.
  readProjectFileFn: ReadProjectFileFn = async () => null,
): Promise<AddTemplateResult> {
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-invoke
  // entry: apply command invoked with a template reference and the path of a
  // repository that already holds applied templates
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-invoke

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-check-resolved
  const rootEntry = lookupFn(templateRef);
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-check-resolved

  if (!rootEntry) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-not-found
    return {
      ok: false,
      reason: 'unresolved',
      message: `Apply aborted — template "${templateRef}" not found in local inventory; no files written.`,
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-not-found
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-resolve-set
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
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-resolve-set

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-stage
  const applyResult = await uniformApply(templateRefs, true, lookupFn, readContentFn);
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-stage

  if (!applyResult.ok) {
    return { ok: false, reason: applyResult.reason, message: `Apply aborted — ${applyResult.message}` };
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-resolve-occupied
  const existingProvenance = await readProvenanceFn(targetDir);
  const alreadyOccupied = occupiedBoundariesFromProvenance(
    existingProvenance,
    lookupFn,
    await listInstalledFn(),
  );
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-resolve-occupied

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-check-occupied
  if (!alreadyOccupied.ok) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-occupied-unknown
    return {
      ok: false,
      reason: alreadyOccupied.reason,
      message: `Apply aborted — ${alreadyOccupied.message} No files written.`,
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-occupied-unknown
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-check-occupied

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-check-ground-free
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-target-not-directory
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-target-not-directory
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-ground-occupied
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-ground-occupied
  // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-resolved-aborted-target-not-directory
  // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-resolved-aborted-ground-occupied
  // Runs as soon as both inputs exist — the staged assembly's own paths and the
  // ground the target's provenance accounts for — so a repository holding
  // undeclared content is refused without the pairwise conflict check below
  // having to run at all.
  const preflight = await refuseUnlessGroundFree(applyResult.assembly, alreadyOccupied.occupied, targetDir, readTargetPathStateFn);
  if (preflight) return preflight;
  // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-resolved-aborted-ground-occupied
  // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p2:inst-as-resolved-aborted-target-not-directory
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-ground-occupied
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-ground-occupied
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-target-not-directory
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-target-not-directory
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-check-ground-free

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-conflict-check
  const verdict = checkAssemblyConflicts(applyResult.assembly, alreadyOccupied.occupied);
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-conflict-check

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-conflict
  if (!verdict.ok) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-conflict
    return {
      ok: false,
      reason: 'conflict',
      conflicts: verdict.conflicts,
      message:
        'Apply aborted — the staged assembly claims ground already occupied by an applied template; no files written.',
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-abort-conflict
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-conflict

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-recheck-ground
  // The conflict check above takes time, and the target can change during it.
  // Re-probing at the last moment before the first write refuses a repository
  // that gained content at one of these paths meanwhile, rather than writing
  // over it.
  //
  // This NARROWS the check-to-write window; it does not close it atomically.
  // Closing it would need an exclusive-create protocol across every write path,
  // out of proportion to what it removes — the guard exists to catch a developer
  // adding into a directory whose content no template recorded, which is not a
  // race.
  const recheck = await refuseUnlessGroundFree(applyResult.assembly, alreadyOccupied.occupied, targetDir, readTargetPathStateFn);
  if (recheck) return recheck;
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-recheck-ground

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-materialize
  const materializeResult = await materializeAssembly(
    applyResult.assembly,
    targetDir,
    existingProvenance,
    lookupFn,
    writeFileFn,
    provenanceWriteFn,
    readProjectFileFn,
  );
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-materialize

  if (!materializeResult.ok) {
    // review #500 (fix 2/2): only a user-fixable compose refusal gets its own
    // reason here — an invariant-violation compose reason, or a real
    // provenance-write failure (no composeReason at all), stays
    // 'provenance-failed' exactly as before.
    const reason = isUserFixableMaterializeFailure(materializeResult) ? 'materialization-refused' : 'provenance-failed';
    return { ok: false, reason, message: materializeResult.message };
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-done
  return {
    ok: true,
    message: `Apply complete — "${targetDir}" extended; one provenance record added per newly applied template.`,
    appliedTemplates: templateRefs,
  };
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-done
}

// Refuses when the target is not a directory, or holds content at a path the
// staged assembly owns that no applied template's provenance accounts for;
// returns `undefined` when the ground the assembly claims is free.
//
// Extracted because the flow asks this question twice: once as soon as both its
// inputs exist, and again immediately before the first write
// (inst-add-recheck-ground), where the answer can have changed. One function
// keeps the two answers identical — a second copy of the exemption rule or of
// either message would let the pre-flight refusal and the last-moment refusal
// drift apart, and a developer would see the same situation described two ways
// depending on timing.
async function refuseUnlessGroundFree(
  assembly: StagedAssembly,
  occupied: OccupiedBoundaryEntry[],
  targetDir: string,
  readTargetPathStateFn: ReadTargetPathStateFn,
): Promise<AddTemplateResult | undefined> {
  // The P29 pre-flight conflict check cannot stand in for this. It arbitrates
  // between templates' DECLARED boundaries, and content that arrived by any
  // other route — a hand-written file, a project the developer started before
  // installing any template, a template applied without recording provenance —
  // is declared by nobody, so no claim over it is ever contested and
  // materialization's whole-file write truncates whatever was there.
  const targetState = await readTargetPathStateFn(targetDir);

  if (targetState === 'file') {
    // No seed remedy here, deliberately: `frontx seed` needs a directory too and
    // refuses this same path, so naming it would send the developer to a second
    // failure rather than to a fix.
    return {
      ok: false,
      reason: 'target-not-directory',
      message:
        `Apply refused — target path "${targetDir}" exists and is not a directory, ` +
        'so no files were written. Adding materializes a template into a repository directory; ' +
        'point it at a directory path, or remove the file occupying this one.',
    };
  }

  // A target that does not exist holds nothing any write could destroy, and
  // materialization creates it — so no path beneath it needs probing.
  if (targetState === 'absent') return undefined;

  const occupiedPaths: string[] = [];
  // The paths this assembly would write, taken from the SAME grouping
  // materialization composes from (`groupContributionsByPath`), so the guard
  // cannot check a set the writes then differ from.
  for (const path of groupContributionsByPath(assembly).keys()) {
    // What licenses the skip is the record itself: ground an applied template's
    // provenance accounts for holds what this tool wrote through that template's
    // declared boundary. The pre-flight conflict check is NOT the license — it
    // compares declared claims for string equality (`subtreeA !== subtreeB`,
    // `sharedA.path !== sharedB.path`), so a shared file nested inside a
    // recorded subtree is never arbitrated there at all. Refusing here would
    // make `add` into a repository this tool itself seeded impossible —
    // including the region-union shared file whose earlier contributors
    // materialization carries forward verbatim.
    if (isRecordedGround(path, occupied)) continue;
    if ((await readTargetPathStateFn(`${targetDir}/${path}`)) === 'absent') continue;
    occupiedPaths.push(path);
  }

  // The whole point of the exemption above: a populated directory whose content
  // the incoming template does not claim stays a supported add target.
  if (occupiedPaths.length === 0) return undefined;

  const noun = occupiedPaths.length === 1 ? 'path' : 'paths';
  const pronoun = occupiedPaths.length === 1 ? 'it' : 'them';
  return {
    ok: false,
    reason: 'target-holds-undeclared-content',
    paths: occupiedPaths,
    message:
      `Apply refused — target directory "${targetDir}" already holds content at ${occupiedPaths.length} ` +
      `${noun} this template owns (${summarizeEntries(occupiedPaths)}), and no applied template's recorded ` +
      `provenance accounts for ${pronoun}. Materializing writes each owned path whole and would overwrite ` +
      `${pronoun}, so no files were written. Move or delete the named ${noun}, or record the applied provenance ` +
      `of the template that wrote ${pronoun}, and retry.`,
  };
}

// Whether a repository-relative path falls inside ground an already-applied
// template declared: a shared file it claims by path, or anything at or beneath
// an exclusive subtree it claims. A subtree is compared with a trailing
// separator so that "srcx.ts" does not read as being inside "src".
function isRecordedGround(path: string, occupied: OccupiedBoundaryEntry[]): boolean {
  return occupied.some(
    ({ boundary }) =>
      boundary.sharedFiles.some((entry) => entry.path === path) ||
      boundary.exclusiveSubtrees.some((subtree) => path === subtree || path.startsWith(subtree.endsWith('/') ? subtree : `${subtree}/`)),
  );
}
