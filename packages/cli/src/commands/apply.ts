// @cpt-FEATURE:cpt-frontx-feature-cli-scaffolding:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-add-template:p1
// @cpt-state:cpt-frontx-state-composed-provenance-registration-lifecycle:p2
//
// `apply` — cpt-frontx-flow-cli-scaffolding-add-template. Replaces the OLD
// `commands/add-template.ts` (the command TOKEN is `apply`, not `add` —
// confirmed against this FEATURE's own command-surface list). Independently
// re-resolves and re-stages the batch through `uniformApply`
// (`../scaffold/assembler.ts`) — never trusting a prior `assemble` run —
// runs the shared pre-flight conflict check
// (`../scaffold/conflict-check.ts`) against the batch's own entries AND
// everything already recorded, reconciles existing on-disk content for
// every target not already recorded under its template (`../scaffold/
// existing-content.ts`), materializes every non-no-op target, materializes
// each name's CLI-owned AI-extension bundle on its first target
// (`../scaffold/ai-bundle.ts`), and records every newly-applied target into
// the single project state document (`../project-state/io.ts`).
//
// `resolveAndCheckBatch` below is the ONE shared "canonicalize, stage,
// conflict-check" formulation `commands/assemble.ts`'s stateless preview
// and this file's own `runApplyPipeline` both call — never a second,
// independently-reformulated resolve-and-check path for either flow.
// `runApplyPipeline` itself is the ONE shared apply mechanism `apply`'s own
// dispatch and `commands/seed-repository.ts` both call after seed's own
// project-state-creation/default-registration steps — per this checkpoint's
// own "no second formulation" discipline.
import path from 'node:path';
import { uniformApply } from '../scaffold/assembler';
import type {
  ResolveInstalledContentPathFn,
  UniformApplyBatch,
  UniformApplyDeps,
  UniformApplyInventoryPort,
} from '../scaffold/assembler';
import { checkTargetConflicts } from '../scaffold/conflict-check';
import type { CanonicalizeTargetFn, TargetClaim } from '../scaffold/conflict-check';
import { reconcileExistingContent } from '../scaffold/existing-content';
import type { ReadExistingContentFn, ReadInstalledContentFn } from '../scaffold/existing-content';
import { materializeOrRemoveAiBundle } from '../scaffold/ai-bundle';
import type { BundleExistsFn, CopyBundleFn, RemoveBundleFn } from '../scaffold/ai-bundle';
import { isWithinEffectiveOwnership } from '../scaffold/effective-ownership';
import type { AssertPathWithinRootFn, ContributionEntry, StagedAssembly, WriteFileFn } from '../scaffold/types';
import { readProjectState, mutateProjectState } from '../project-state/io';
import type { ProjectStateDocument, ReadProjectStateFn, TemplateEntry, WriteProjectStateFn } from '../project-state/types';
import { resolveRegisteredExcludedSubtrees } from '../scaffold/registered-manifest';
import { isTemplatePayloadPath } from '../manifest/types';
import type { ReadFileFn } from '../manifest/types';
import { parseLocalOrigin } from '../resolver/types';
import type { FetchFn, ListFolderFilesFn, PathExistsFn } from '../resolver/types';
import { joinUnderTarget } from '../paths/relative-path';
import type { ErrorCode } from '../envelope';

/**
 * Canonicalizes every target in a raw batch to a project-relative path,
 * fail-closed on the first target that cannot be proven to stay inside the
 * project root. Run BEFORE `uniformApply` stages the batch (rather than
 * left to the conflict check's own `inst-cc-canonicalize` alone) so every
 * downstream step — effective-ownership computation inside `uniformApply`,
 * existing-content reconciliation, materialization, and project-state
 * recording — all operate on the SAME canonical spelling the conflict check
 * itself will re-derive (idempotently) from an already-canonical input,
 * rather than three different steps risking three different ideas of what
 * one raw target string resolves to.
 */
function canonicalizeBatch(
  batch: UniformApplyBatch,
  canonicalizeFn: CanonicalizeTargetFn,
): { ok: true; batch: UniformApplyBatch } | { ok: false; rawTarget: string } {
  const templates: Record<string, string[]> = {};
  for (const [name, targets] of Object.entries(batch.templates)) {
    // De-duplicated AFTER canonicalization, never before: two raw spellings a
    // developer might write for one location (`pkg/a` and `./pkg/a`) are one
    // target, and only canonicalization can tell. Without this, the conflict
    // check deliberately no-ops a same-name-same-target pair
    // (`inst-cc-record-same-target`), so a duplicate reached
    // `inst-add-record` and was appended to `templates[name].targets` twice —
    // a project state document asserting a target is applied twice, which no
    // sequence of real operations could otherwise produce. Deletion happened
    // to clear both copies (`delete.ts` filters by value), so the duplicate
    // was inert rather than dangerous, but a state document that lies about
    // its own contents is a defect regardless of who currently reads it.
    const canonicalTargets: string[] = [];
    for (const rawTarget of targets) {
      const canonical = canonicalizeFn(rawTarget);
      if (canonical === null) return { ok: false, rawTarget };
      if (canonicalTargets.includes(canonical)) continue;
      canonicalTargets.push(canonical);
    }
    templates[name] = canonicalTargets;
  }
  return { ok: true, batch: { templates } };
}

/**
 * Every local `path:` origin folder currently registered across the WHOLE
 * project state document — not only the batch's own templates — since ANY
 * registered template's local origin folder is reserved ground a target
 * under check must never land on (`conflict-check.ts`'s own
 * `localOriginFolders` input). Mirrors `scaffold/delete-plan.ts`'s own
 * (unexported) `deriveLocalOriginFolder`, generalized from one owning
 * template to every registered one.
 */
function collectLocalOriginFolders(document: ProjectStateDocument, canonicalizeFn: CanonicalizeTargetFn): string[] {
  const folders: string[] = [];
  for (const entry of Object.values(document.templates)) {
    const relativePath = parseLocalOrigin(entry.origin);
    if (relativePath === undefined) continue;
    const canonical = canonicalizeFn(relativePath);
    if (canonical !== null) folders.push(canonical);
  }
  return folders;
}

/**
 * The recorded-target claim set every registered template's `targets[]`
 * joins onto its own manifest's `excludedSubtrees` — the declared list is
 * re-derived through `resolveRegisteredExcludedSubtrees`
 * (`../scaffold/registered-manifest.ts`), the ONE shared formulation that
 * correctly resolves BOTH a remote (inventory-installed) and a local
 * `path:`-registered name's current manifest, rather than `inventory.lookup`
 * alone (which silently returns `[]` for a local origin — the bug this
 * checkpoint's live check surfaced). `commands/ownership.ts`'s own
 * `buildRecordedTargets` calls the identical shared function for the
 * identical join.
 */
async function buildRecordedTargetClaims(
  templates: Record<string, TemplateEntry>,
  repoRoot: string,
  inventory: UniformApplyInventoryPort,
  readFileFn: ReadFileFn,
  canonicalizeFn: CanonicalizeTargetFn,
): Promise<TargetClaim[]> {
  const claims: TargetClaim[] = [];
  for (const [name, entry] of Object.entries(templates)) {
    if (entry.targets.length === 0) continue;
    const declaredExclusions = await resolveRegisteredExcludedSubtrees(name, entry.origin, {
      repoRoot,
      inventory,
      readFileFn,
      canonicalizeFn,
    });
    for (const target of entry.targets) {
      const excludedSubtrees = declaredExclusions.map((declared) => joinUnderTarget(target, declared));
      claims.push({ target, templateName: name, excludedSubtrees });
    }
  }
  return claims;
}

export interface ResolveAndCheckDeps {
  inventory: UniformApplyInventoryPort;
  fetchFn: FetchFn;
  readFileFn: ReadFileFn;
  canonicalizeFn: CanonicalizeTargetFn;
  // The shared resolver's own local-origin seams (`resolver/types.ts`'s
  // `LocalOriginDeps`) — threaded through to `uniformApply`'s
  // `resolveRegisteredTemplate`, which resolves a `path:`-registered name
  // through the same resolver register.ts's own resolution already uses.
  existsFn: PathExistsFn;
  listFolderFilesFn: ListFolderFilesFn;
  resolveInstalledContentPathFn: ResolveInstalledContentPathFn;
}

export type ResolveAndCheckOutcome =
  | { ok: true; document: ProjectStateDocument; assembly: StagedAssembly }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

// @cpt-dod:cpt-frontx-dod-cli-scaffolding-uniform-apply:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-conflict-check:p1
/**
 * Reads the current project state document, canonicalizes and stages the
 * batch through `uniformApply`, and runs the pre-flight conflict check
 * against the batch's own entries plus everything already recorded. The
 * ONE resolve-and-check path `assemble` (stateless preview) and `apply`
 * (via `runApplyPipeline` below) both call — realizing, for EITHER caller,
 * `inst-asm-resolve`/`inst-asm-if-resolve-fail`/`inst-asm-return-resolve-
 * fail`/`inst-asm-conflict-check`/`inst-asm-if-conflict`/`inst-asm-return-
 * conflict` (`cpt-frontx-flow-cli-scaffolding-assemble-preview`) and
 * `inst-add-resolve`/`inst-add-if-resolve-fail`/`inst-add-return-resolve-
 * fail`/`inst-add-conflict-check`/`inst-add-if-conflict`/`inst-add-return-
 * conflict` (`cpt-frontx-flow-cli-scaffolding-add-template`) at once —
 * never two independently-formulated resolve-and-check paths for the two
 * flows.
 */
// @cpt-begin:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-resolve
// @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-resolve
export async function resolveAndCheckBatch(
  rawBatch: UniformApplyBatch,
  repoRoot: string,
  deps: ResolveAndCheckDeps,
  readProjectStateFn: ReadProjectStateFn,
): Promise<ResolveAndCheckOutcome> {
  const stateResult = await readProjectState(repoRoot, readProjectStateFn);
  if (!stateResult.ok) {
    return { ok: false, code: 'PROJECT_INVALID', message: stateResult.message };
  }
  const document = stateResult.document;

  const canonicalized = canonicalizeBatch(rawBatch, deps.canonicalizeFn);
  if (!canonicalized.ok) {
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-resolve
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-resolve
    return {
      ok: false,
      code: 'INVALID_PATH',
      message: `Target "${canonicalized.rawTarget}" could not be proven to stay inside the project root.`,
      details: { target: canonicalized.rawTarget },
    };
  }

  const uniformDeps: UniformApplyDeps = {
    repoRoot,
    inventory: deps.inventory,
    fetchFn: deps.fetchFn,
    readFileFn: deps.readFileFn,
    canonicalizeFn: deps.canonicalizeFn,
    existsFn: deps.existsFn,
    listFolderFilesFn: deps.listFolderFilesFn,
    resolveInstalledContentPathFn: deps.resolveInstalledContentPathFn,
  };
  // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-req-resolved
  const staged = await uniformApply(canonicalized.batch, document, uniformDeps);
  // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-req-resolved

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-if-resolve-fail
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-resolve-fail
  if (!staged.ok) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-return-resolve-fail
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-req-aborted-unresolved
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-resolve-fail
    return {
      ok: false,
      code: staged.code,
      message: staged.message,
      details: staged.code === 'TEMPLATE_NOT_REGISTERED' ? { name: staged.name } : { name: staged.name, origin: staged.origin },
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-resolve-fail
    // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-req-aborted-unresolved
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-return-resolve-fail
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-resolve-fail
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-if-resolve-fail

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-conflict-check
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-conflict-check
  const targetsUnderCheck: TargetClaim[] = staged.assembly.entries.map((entry) => ({
    target: entry.target,
    templateName: entry.templateName,
    // `entry.excludedSubtrees` is the template's RAW, target-relative
    // declared list (`scaffold/types.ts`'s own `ContributionEntry` doc
    // comment) — joined under THIS entry's own target here, exactly as
    // `buildRecordedTargetClaims` above joins a recorded target's declared
    // list under ITS target, so both sides of the conflict check's nesting
    // comparison (`conflict-check.test.ts`'s own fixtures: a project-
    // relative `excludedSubtrees` entry such as `packages/app/admin/` for
    // target `packages/app`) are the same project-relative shape.
    excludedSubtrees: entry.excludedSubtrees.map((declared) => joinUnderTarget(entry.target, declared)),
  }));
  const recordedTargets = await buildRecordedTargetClaims(
    document.templates,
    repoRoot,
    deps.inventory,
    deps.readFileFn,
    deps.canonicalizeFn,
  );
  const localOriginFolders = collectLocalOriginFolders(document, deps.canonicalizeFn);

  // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-resolved-checked
  const verdict = checkTargetConflicts({
    targetsUnderCheck,
    recordedTargets,
    projectOwnedRoots: document.projectOwnedRoots,
    localOriginFolders,
    canonicalizeFn: deps.canonicalizeFn,
  });
  // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-resolved-checked

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-if-conflict
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-conflict
  if (!verdict.ok) {
    if (verdict.kind === 'INVALID_PATH') {
      // Defensive: every target under check was already canonicalized above
      // (`canonicalizeBatch`), so the checker's own internal
      // re-canonicalization of an already-canonical string cannot genuinely
      // disagree — kept only so this branch is exhaustive over
      // `ConflictCheckResult`'s discriminant rather than assumed away.
      return {
        ok: false,
        code: 'INVALID_PATH',
        message: `Target "${verdict.path}" could not be proven to stay inside the project root.`,
        details: { target: verdict.path },
      };
    }
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-return-conflict
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-resolved-aborted-conflict
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-conflict
    const contestingTemplates = [
      ...new Set(
        verdict.conflicts.flatMap((conflict) =>
          conflict.contestants.map((contestant) => contestant.templateName).filter((n): n is string => n !== null),
        ),
      ),
    ];
    return {
      ok: false,
      code: 'TARGET_CONFLICT',
      message:
        `Aborted — the staged batch has an intersecting claim contested by: ${contestingTemplates.join(', ') || 'unknown'}; ` +
        'nothing written.',
      details: { conflicts: verdict.conflicts },
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-conflict
    // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-resolved-aborted-conflict
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-return-conflict
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-conflict
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-if-conflict
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-conflict-check
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-assemble-preview:p1:inst-asm-conflict-check

  return { ok: true, document, assembly: staged.assembly };
}

// Mirrors `existing-content.ts`'s own (unexported) `computePayloadSet`
// exactly — restated here rather than imported (that module is finished
// this checkpoint) so materialization writes precisely the payload paths
// reconciliation itself judged, never a second, independently-recomputed
// idea of what the payload is. The one part of "what the payload is" that
// is NOT restated here is the manifest/`.frontx`-namespace exclusion:
// `isTemplatePayloadPath` (`../manifest/types.ts`) is the shared
// formulation both this function and `existing-content.ts`'s
// `computePayloadSet` call, so the two mirrored functions can never drift
// on that question independently of each other. It is applied to
// `item.path` — still template-relative — BEFORE re-rooting under
// `entry.target`, because a non-`.` target would otherwise re-root the
// manifest as `<target>/frontx-template.json`, which a check against the
// bare `MANIFEST_FILENAME` would never recognize.
async function computePayloadForTarget(
  entry: ContributionEntry,
  readInstalledContentFn: ReadInstalledContentFn,
): Promise<Map<string, string>> {
  const rawContent = await readInstalledContentFn(entry.installedContentPath);
  const payload = new Map<string, string>();
  for (const item of rawContent) {
    if (!isTemplatePayloadPath(item.path)) continue;
    const projectPath = entry.target === '.' ? item.path : `${entry.target}/${item.path}`;
    if (!isWithinEffectiveOwnership(projectPath, entry.target, entry.exclusionRoots)) continue;
    payload.set(projectPath, item.content);
  }
  return payload;
}

export interface ApplyPipelineDeps extends ResolveAndCheckDeps {
  readInstalledContentFn: ReadInstalledContentFn;
  readExistingContentFn: ReadExistingContentFn;
  writeFileFn: WriteFileFn;
  readProjectStateFn: ReadProjectStateFn;
  writeProjectStateFn: WriteProjectStateFn;
  bundleExistsFn: BundleExistsFn;
  copyBundleFn: CopyBundleFn;
  removeBundleFn: RemoveBundleFn;
  // CONTAINMENT ESCAPE FIX: proves an individual payload path stays inside
  // `repoRoot`, symlinks resolved, immediately before `writeFileFn` is
  // called for it — see this file's own containment-fix comment below for
  // why canonicalizing the batch's own TARGET is not enough. Curried over
  // the caller's own applicable root (`createFsAssertPathWithinRootFn`,
  // `../adapters/fs-project-io.ts`) at the `cli.ts` dispatch site, exactly
  // as `canonicalizeFn` already is.
  assertPathWithinRootFn: AssertPathWithinRootFn;
}

export interface ApplyBatchTargetRef {
  templateName: string;
  target: string;
}

export type ApplyBatchOutcome =
  | { ok: true; applied: ApplyBatchTargetRef[]; noop: ApplyBatchTargetRef[] }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

// @cpt-dod:cpt-frontx-dod-cli-scaffolding-existing-content-protocol:p1
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-ai-bundle:p1
/**
 * cpt-frontx-flow-cli-scaffolding-add-template's own apply mechanism — the
 * ONE shared pipeline both the `apply` command (this file's own dispatch)
 * and `seed` (`../commands/seed-repository.ts`, AFTER its own project-
 * state-creation and default-registration steps) call, rather than two
 * independently duplicated materialize/reconcile/record sequences.
 */
// @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-invoke
export async function runApplyPipeline(
  rawBatch: UniformApplyBatch,
  repoRoot: string,
  adoptExisting: boolean,
  deps: ApplyPipelineDeps,
): Promise<ApplyBatchOutcome> {
  // The batch names one or more registered templates and their targets,
  // "individually or together" — the uniform batch shape is what makes those
  // the same invocation rather than two command forms. Whether the
  // repository already has an applied target is a property of the recorded
  // state this pipeline goes on to read, never a precondition it tests: a
  // batch against a repository with none is `seed`'s own flow, and it
  // reaches this same pipeline afterwards.
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-invoke
  const resolved = await resolveAndCheckBatch(rawBatch, repoRoot, deps, deps.readProjectStateFn);
  if (!resolved.ok) return resolved;
  const { document, assembly } = resolved;

  // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-checked-reconciled
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-recorded-noop
  const noop: ApplyBatchTargetRef[] = [];
  const unrecorded: ContributionEntry[] = [];
  for (const entry of assembly.entries) {
    const existingEntry = document.templates[entry.templateName];
    if (existingEntry !== undefined && existingEntry.targets.includes(entry.target)) {
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-noop-target
      // No on-disk content is read for this target, existing-content
      // reconciliation never runs for it (it is simply excluded from
      // `unrecorded` below), and no file is written for it.
      noop.push({ templateName: entry.templateName, target: entry.target });
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-noop-target
      continue;
    }
    unrecorded.push(entry);
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-recorded-noop

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-existing-content
  const payloads = new Map<ContributionEntry, Map<string, string>>();
  const identicalByEntry = new Map<ContributionEntry, Set<string>>();
  const contentConflictPaths: string[] = [];
  const undecidedAdditionalPaths: string[] = [];
  for (const entry of unrecorded) {
    const payload = await computePayloadForTarget(entry, deps.readInstalledContentFn);
    payloads.set(entry, payload);
    const partitions = await reconcileExistingContent({
      target: entry.target,
      exclusionRoots: entry.exclusionRoots,
      installedContentPath: entry.installedContentPath,
      readInstalledContent: deps.readInstalledContentFn,
      readExistingContent: deps.readExistingContentFn,
    });
    identicalByEntry.set(entry, new Set(partitions.identicalFiles));
    contentConflictPaths.push(...partitions.contentConflicts);
    if (!adoptExisting) undecidedAdditionalPaths.push(...partitions.additionalPaths);
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-existing-content
  // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-checked-reconciled

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-existing-conflict
  if (contentConflictPaths.length > 0) {
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-checked-aborted-existing-content
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-existing-conflict
    return {
      ok: false,
      code: 'CONTENT_CONFLICT',
      message:
        `Aborted — existing content differs from the template's payload at: ${contentConflictPaths.join(', ')}; ` +
        'nothing written.',
      details: { paths: contentConflictPaths },
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-existing-conflict
    // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-checked-aborted-existing-content
  }
  if (undecidedAdditionalPaths.length > 0) {
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-checked-aborted-existing-content
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-existing-conflict
    return {
      ok: false,
      code: 'EXISTING_PATHS_REQUIRE_DECISION',
      message:
        `Aborted — existing content stands at path(s) the payload does not declare: ${undecidedAdditionalPaths.join(', ')}. ` +
        'Pass --adopt-existing to leave them untouched, or move/remove them and retry; nothing written.',
      details: { paths: undecidedAdditionalPaths },
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-existing-conflict
    // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-checked-aborted-existing-content
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-if-existing-conflict

  // CONTAINMENT ESCAPE FIX: canonicalizing the batch's own TARGET
  // (`canonicalizeBatch` above) proves the target resolves inside the
  // project root, symlinks resolved — it says nothing about a path segment
  // BELOW the target (an `app/src` a developer or attacker replaced with a
  // symlink to somewhere outside the project between registration and this
  // apply). Every individual payload path this batch is about to write is
  // proven to stay inside `repoRoot`, symlinks resolved, in its own pass
  // BEFORE anything is written — an escape anywhere in the batch aborts the
  // whole batch, nothing written, exactly as `contentConflictPaths`/
  // `undecidedAdditionalPaths` above already abort before writing anything.
  const invalidPaths: string[] = [];
  for (const entry of unrecorded) {
    const payload = payloads.get(entry) ?? new Map<string, string>();
    const identical = identicalByEntry.get(entry) ?? new Set<string>();
    for (const [projectPath] of payload) {
      if (identical.has(projectPath)) continue;
      try {
        deps.assertPathWithinRootFn(path.join(repoRoot, projectPath));
      } catch {
        invalidPaths.push(projectPath);
      }
    }
  }
  if (invalidPaths.length > 0) {
    return {
      ok: false,
      code: 'INVALID_PATH',
      message:
        `Aborted — path(s) could not be proven to stay inside the project root: ${invalidPaths.join(', ')}; ` +
        'nothing written.',
      details: { paths: invalidPaths },
    };
  }

  // @cpt-begin:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-reconciled-assembled
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-materialize
  for (const entry of unrecorded) {
    const payload = payloads.get(entry) ?? new Map<string, string>();
    const identical = identicalByEntry.get(entry) ?? new Set<string>();
    for (const [projectPath, content] of payload) {
      // Already correct on disk — writing it again would be harmless but
      // pointless; skipped so materialization writes exactly the paths that
      // are NEW or that reconciliation cleared as adopted, never a path
      // already confirmed byte-identical.
      if (identical.has(projectPath)) continue;
      await deps.writeFileFn(path.join(repoRoot, projectPath), content);
    }
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-materialize

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-materialize-bundle
  // Run ONCE per name that just gained its first target across the WHOLE
  // batch — never per target — matching `cpt-frontx-algo-cli-scaffolding-
  // ai-bundle`'s own "runs once per name transition" contract.
  const handledNames = new Set<string>();
  for (const entry of unrecorded) {
    if (handledNames.has(entry.templateName)) continue;
    handledNames.add(entry.templateName);
    const targetsBefore = document.templates[entry.templateName]?.targets.length ?? 0;
    if (targetsBefore > 0) continue; // this name already had a target before this batch
    try {
      await materializeOrRemoveAiBundle({
        manifestName: entry.templateName,
        transition: { kind: 'FIRST_TARGET_GAINED', installedContentPath: entry.installedContentPath },
        projectRoot: repoRoot,
        bundleExists: deps.bundleExistsFn,
        copyBundle: deps.copyBundleFn,
        removeBundle: deps.removeBundleFn,
      });
    } catch (error) {
      // The CLI-owned bundle copy (`adapters/fs-ai-bundle.ts`'s
      // `createFsCopyBundleFn`) refuses fail-closed, the same way, when its
      // own destination cannot be proven to stay inside the project root —
      // surfaced here as a real refusal rather than an unhandled crash.
      return {
        ok: false,
        code: 'INVALID_PATH',
        message:
          `Aborted — the AI-extension bundle for "${entry.templateName}" could not be proven to stay inside the ` +
          `project root: ${error instanceof Error ? error.message : String(error)}`,
        details: { name: entry.templateName },
      };
    }
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-materialize-bundle

  // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-applied-to-applied
  // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-applied
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-record
  const newTargetsByName = new Map<string, string[]>();
  for (const entry of unrecorded) {
    const list = newTargetsByName.get(entry.templateName) ?? [];
    list.push(entry.target);
    newTargetsByName.set(entry.templateName, list);
  }
  const applied: ApplyBatchTargetRef[] = [];
  for (const [name, newTargets] of newTargetsByName) {
    const existingEntry = document.templates[name];
    if (existingEntry === undefined) {
      // Unreachable in practice — `uniformApply` already refuses
      // `TEMPLATE_NOT_REGISTERED` for any name with no project-state entry,
      // so every name reaching here was already confirmed registered.
      // Guarded rather than asserted so a caller-supplied fake document
      // cannot turn this into a thrown TypeError.
      return { ok: false, code: 'INTERNAL', message: `Template "${name}" was staged but is no longer registered.` };
    }
    const mergedTargets = [...existingEntry.targets, ...newTargets];
    const written = await mutateProjectState(
      repoRoot,
      { kind: 'set-template', name, entry: { ...existingEntry, targets: mergedTargets } },
      deps.readProjectStateFn,
      deps.writeProjectStateFn,
    );
    if (!written.ok) return { ok: false, code: 'PROJECT_INVALID', message: written.message };
    for (const target of newTargets) applied.push({ templateName: name, target });
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-record
  // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-empty-to-applied
  // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-applied-to-applied
  // @cpt-end:cpt-frontx-state-cli-scaffolding-assembly-op:p1:inst-as-reconciled-assembled

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-done
  return { ok: true, applied, noop };
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-add-template:p1:inst-add-return-done
}
