// @cpt-FEATURE:cpt-frontx-feature-cli-scaffolding:p1
// @cpt-flow:cpt-frontx-flow-cli-scaffolding-delete-target:p1
// @cpt-state:cpt-frontx-state-cli-scaffolding-delete-op:p1
// @cpt-state:cpt-frontx-state-composed-provenance-registration-lifecycle:p2
// @cpt-dod:cpt-frontx-dod-cli-scaffolding-delete:p1
//
// `delete <target>` — cpt-frontx-flow-cli-scaffolding-delete-target. Computes
// the deletion plan (`../scaffold/delete-plan.ts`), gates removal on
// explicit confirmation (interactive, defaulting to No) or the `--json`
// `CONFIRMATION_REQUIRED`/`--yes` protocol, removes the plan's `toDelete`
// ground from disk, and removes `<target>` from its owning template's
// `targets[]` entry in the single project state document
// (`../project-state/io.ts`) — through the injected `ReadProjectStateFn`/
// `WriteProjectStateFn` seams, exactly as `register`/`unregister`/`ownership`
// already do: no direct filesystem access here beyond what the injected
// `ListTargetFilesFn`/`RemoveProjectFileFn` seams already isolate.
//
// AI-extension bundle removal: this module detects the "just emptied a
// name's last remaining target" condition (`wasLastTarget` below) and calls
// the optional `removeAiBundleFn` seam when one is supplied
// (`cpt-frontx-algo-cli-scaffolding-ai-bundle`, `../scaffold/ai-bundle.ts`) —
// wired at the `cli.ts` call site, which adapts that algorithm's three-seam
// shape down to this module's own single `RemoveAiBundleFn`. Optional here
// rather than required so a caller with no bundle-removal need at all (a
// test fixture, say) is never forced to supply a no-op.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../canonical-json';
import { computeDeletionPlan } from '../scaffold/delete-plan';
import { bundleFootprintVerdict, registeredLocalOriginRaws } from '../scaffold/strict-path';
import type { ClassifyPathStrictFn, EntryKindFn } from '../scaffold/strict-path';
import type {
  DeletePlanInventoryPort,
  DeletionPlanResult,
  ListTargetFilesFn,
  ListUnenumerableTargetEntriesFn,
} from '../scaffold/delete-plan';
import { readProjectState, mutateProjectState } from '../project-state/io';
import { aliasedOwnedRootRefusal } from '../project-state/alias';
import { bundleOverlapMessage, bundleConflictsOf } from '../project-state/bundle-identity';
import type { ProjectStateDocument, ReadProjectStateFn, WriteProjectStateFn, TemplateEntry } from '../project-state/types';
import type { CanonicalizeTargetFn } from '../scaffold/conflict-check';
import type { ReadFileFn } from '../manifest/types';
import type { ErrorCode } from '../envelope';
import type { AssertPathWithinRootFn } from '../scaffold/types';
// `listTargetFilesFn`'s real implementation (`createFsListTargetFilesFn`,
// `../adapters/fs-project-io.ts`) throws this typed error, rather than
// letting a bare `ENOTDIR` propagate, when a registered, applied target's
// own on-disk location is no longer a directory. Caught inside `computePlan`
// below and converted to the same structured refusal shape every other exit
// from this function already returns — see that catch's own comment for why
// `CONTENT_CONFLICT` is the code chosen. A read failure on the owning
// template's own CURRENT manifest (a FIFO, a directory, a dangling symlink,
// ...) is a DIFFERENT concern this module no longer catches directly:
// `computeDeletionPlan` (`../scaffold/delete-plan.ts`) now catches that
// failure itself and folds it into its own recorded-value fallback, so it
// never reaches this call as a thrown error at all.
import { PathContainmentError, TargetNotDirectoryError } from '../adapters/fs-project-io';
import { getOwn } from '../own-record';

// Symmetric to `upgrade/types.ts`'s `RemoveProjectFileFn` — removes one
// absolute file path, no-op when already absent. Reused directly rather
// than a second "remove a file" seam invented for this command: the real
// implementation (`createFsRemoveProjectFileFn`, `../adapters/fs-project-
// io.ts`) already does exactly what removing one `toDelete` entry needs.
export type RemoveTargetFileFn = (absolutePath: string) => Promise<void>;

// The CLI-owned AI-extension bundle removal this flow's `inst-del-remove-
// bundle` step names (`cpt-frontx-algo-cli-scaffolding-ai-bundle`) — declared
// here as the seam this command calls, not implemented here. The real
// implementation is wired at the `cli.ts` call site (see this file's own
// header comment above): a closure there adapts `scaffold/ai-bundle.ts`'s
// three-seam `materializeOrRemoveAiBundle` algorithm down to this single
// function shape, fixed to the `LAST_TARGET_LOST` transition.
export type RemoveAiBundleFn = ((manifestName: string) => Promise<void>) & {
  // When present, the bundle's current tree is captured into the review, so the
  // plan digest binds the exact bytes the removal will delete (plan-ai-recovery
  // r9 §5); the removal then refuses if the tree is no longer what was captured.
  describe?: (manifestName: string) => AiBundleTree;
};

/** The reviewed content of an AI bundle directory: hashes and lengths only. */
export interface AiBundleTree {
  files: { path: string; length: number; sha256: string; linkTarget?: string }[];
  directories: string[];
  digest: string;
}

// The developer's or agent's confirmation decision for one computed plan —
// symmetric to `upgrade/types.ts`'s `PresentAndGetApprovalFn`, with a
// delete-shaped payload instead of a `ChangeSet`. The real interactive
// implementation prompts on stdin, defaulting to "No" on anything but an
// explicit affirmative (`cli.ts`'s own `createInteractiveApproval` precedent
// for `upgrade`); this seam is never called at all in `--json` mode
// (`inst-del-if-json-no-yes` returns `CONFIRMATION_REQUIRED` without
// reading stdin) or in `--dry-run` mode (nothing is at stake to confirm).
export type ConfirmDeletionFn = (plan: {
  target: string;
  // The owning template: part of the reviewed (hashed) projection, so every
  // prompt names it — including an updated plan whose only change is the owner.
  templateName: string;
  toDelete: string[];
  toPreserve: string[];
  // Carried through so an interactive confirmation can tell a developer
  // that the owning template's CURRENT manifest and its RECORDED
  // declaration disagree — see `scaffold/delete-plan.ts`'s own
  // `DeletionPlanResult.exclusionsDrift` doc comment for what this means
  // and when it is present. Absent whenever the plan reports no drift.
  exclusionsDrift?: { current: string[]; recorded: string[] };
  // The other parts of the reviewed projection (`DeletionReview`): the ground
  // the owning entry will record as relinquished, and whether the owner's
  // AI-extension bundle directory is removed by this deletion. Shown so that
  // everything the approval binds is on screen.
  relinquishedGround?: string[];
  aiBundle: AiBundleEffect;
  // True when a previous prompt of this same run showed a different plan and
  // this one is the updated plan, shown for a renewed decision.
  changedSinceShown?: boolean;
}) => Promise<'confirmed' | 'declined'>;

export interface DeleteCommandFlags {
  jsonMode: boolean;
  dryRun: boolean;
  yes: boolean;
  // The `planDigest` of the `CONFIRMATION_REQUIRED` review being confirmed
  // (`--plan-digest=<hex>`). Required on the confirming `--json --yes` call.
  expectedPlanDigest?: string;
}

/** Whether a deletion removes the owner's AI-extension bundle directory, and which. */
export interface AiBundleEffect {
  removed: boolean;
  path: string | null;
  // Present when the bundle is removed and its tree was captured: every file the
  // removal deletes (local edits included), bound by the plan digest.
  tree?: AiBundleTree;
}

/**
 * The part of a computed plan a reviewer is shown AND the approval is bound
 * to: exactly what is listed here, nothing more is hashed (so nothing hashed
 * is hidden from the reviewer). Sets are sorted here, whatever order the
 * plan's source produced them in.
 */
export interface DeletionReview {
  target: string;
  templateName: string;
  toDelete: string[];
  toPreserve: string[];
  exclusionsDrift?: { current: string[]; recorded: string[] };
  relinquishedGround?: string[];
  aiBundle: AiBundleEffect;
}

const sortedUnique = (items: readonly string[]): string[] => [...new Set(items)].sort();

/** `ownerName`'s targets are exactly `[target]`: deleting `target` empties it. */
function isLastTarget(document: ProjectStateDocument, ownerName: string, target: string): boolean {
  const ownerEntry = getOwn(document.templates, ownerName);
  return ownerEntry !== undefined && ownerEntry.targets.length > 0 && ownerEntry.targets.every((t) => t === target);
}

// @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-digest-plan
function reviewOf(computed: PlanOutcome & { ok: true }, removeAiBundleFn?: RemoveAiBundleFn): DeletionReview {
  const { plan } = computed;
  const removed = isLastTarget(computed.document, plan.templateName, computed.target);
  return {
    target: computed.target,
    templateName: plan.templateName,
    toDelete: sortedUnique(plan.toDelete),
    toPreserve: sortedUnique(plan.toPreserve),
    ...(plan.exclusionsDrift
      ? { exclusionsDrift: { current: sortedUnique(plan.exclusionsDrift.current), recorded: sortedUnique(plan.exclusionsDrift.recorded) } }
      : {}),
    ...(plan.relinquishedGround && plan.relinquishedGround.length > 0 ? { relinquishedGround: sortedUnique(plan.relinquishedGround) } : {}),
    aiBundle: {
      removed,
      path: removed ? `.frontx/ai/${plan.templateName}` : null,
      ...(removed && removeAiBundleFn?.describe ? { tree: removeAiBundleFn.describe(plan.templateName) } : {}),
    },
  };
}

/**
 * Identity of the reviewed deletion plan: sha256 of the canonical JSON of the
 * versioned `DeletionReview`, domain-separated (`kind`) from the `upgrade`
 * plan digest. It binds path STRINGS and flags, not file bytes, physical
 * identity (realpath) or the contents of the AI bundle directory.
 */
export function computeDeletionPlanDigest(review: DeletionReview): string {
  return createHash('sha256')
    .update(canonicalJson({ kind: 'frontx.delete-plan', v: 1, ...review }))
    .digest('hex');
}
// @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-digest-plan

// The optional fields of a review, spread onto an outcome only when present.
function optionalReviewFields(review: DeletionReview): Pick<DeletionReview, 'exclusionsDrift' | 'relinquishedGround'> | Record<string, never> {
  return {
    ...(review.exclusionsDrift ? { exclusionsDrift: review.exclusionsDrift } : {}),
    ...(review.relinquishedGround ? { relinquishedGround: review.relinquishedGround } : {}),
  };
}

export type DeleteOutcome =
  // Two SEPARATE variants (never one variant with `outcome: 'dry-run' |
  // 'declined'`) so a caller narrowing on `outcome` gets ordinary
  // discriminated-union exhaustiveness checking on this field.
  | {
      ok: true;
      outcome: 'dry-run';
      target: string;
      toDelete: string[];
      toPreserve: string[];
      exclusionsDrift?: { current: string[]; recorded: string[] };
      relinquishedGround?: string[];
      aiBundle: AiBundleEffect;
    }
  | {
      ok: true;
      outcome: 'declined';
      target: string;
      toDelete: string[];
      toPreserve: string[];
      exclusionsDrift?: { current: string[]; recorded: string[] };
      relinquishedGround?: string[];
      aiBundle: AiBundleEffect;
    }
  | {
      ok: true;
      outcome: 'deleted';
      target: string;
      toDelete: string[];
      toPreserve: string[];
      exclusionsDrift?: { current: string[]; recorded: string[] };
      relinquishedGround?: string[];
      aiBundle: AiBundleEffect;
      // Set on the `--json --yes --plan-digest` path only: the deletion that
      // ran is the plan whose digest the caller stated (which is `planDigest`).
      boundToReviewedPlan?: true;
      planDigest?: string;
      templateName: string;
      // Whether this deletion just emptied `templateName`'s `targets[]`
      // array — correctly detected regardless of whether an AI-bundle
      // removal seam was supplied to act on it (see this file's own header
      // comment).
      wasLastTarget: boolean;
      // Set only when `wasLastTarget` triggered a bundle-removal attempt
      // (`removeAiBundleFn`) that itself failed. By the time this can
      // happen, the target's files are already off disk and
      // `.frontx/project.json` already reflects the removal — both real,
      // both correct — so this is reported as success carrying one named
      // CLI-owned residue, never as `ok: false` over a completed
      // destruction a retrying or error-branching caller would otherwise
      // read as "nothing happened." `removeAiBundleFn` is an opaque seam
      // from this module's point of view (see `RemoveAiBundleFn` above), so
      // its failure can only be discovered by calling it — there is no
      // precondition this module can check up front instead.
      aiBundleResidue?: { manifestName: string; path: string; message: string };
    }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

type PlanOutcome =
  // `target` is the RECORDED spelling this plan was computed for, which is
  // not always the caller's own and not always the canonical path either —
  // see `resolveRecordedTarget`. Everything downstream keys off it, the
  // project-state mutation included, so it travels with the plan rather than
  // being recomputed from `rawTarget` at each use.
  | { ok: true; document: ProjectStateDocument; target: string; plan: DeletionPlanResult & { ok: true } }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

// `path.relative` turned POSIX with `path.sep` collapsed — the shape every
// `--json` envelope in this package already carries for a project-relative
// path (`adapters/fs-project-io.ts`'s own `toPosixPath`), never the absolute
// filesystem path an internal error object happens to carry.
function toProjectRelativePath(repoRoot: string, absolutePath: string): string {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

// @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-resolve-recorded-name
// A leading "./" and a trailing "/" stripped, never resolving ".." and never
// touching the filesystem — the ONE lexical normalization every recorded
// `targets[]` entry already satisfies as a matter of how `canonicalizeFn`
// spells its own output (`adapters/fs-project-io.ts`'s `createFsCanonicalize
// TargetFn`), so a caller's ordinary spelling of the exact name they applied
// a template under compares equal to the recorded string without needing any
// symlink resolution at all.
function normalizeRawTargetLexically(rawTarget: string): string {
  let normalized = rawTarget;
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized === '' ? '.' : normalized;
}

/**
 * Resolves which recorded `targets[]` entry, if any, `rawTarget` identifies
 * — BEFORE `canonicalizeFn` ever resolves a symlink, and using its output
 * only as a FALLBACK, never as the primary key. Canonicalization decides
 * WHERE on disk a delete acts; using its output as the key for WHICH
 * recorded target the caller means breaks the moment a target directory is
 * replaced with a symlink after `apply` (`mv dst real && ln -s real dst`):
 * the recorded string ("dst") no longer equals what `canonicalizeFn` now
 * resolves it to ("real"), and typing the resolved name ("real") does not
 * equal the recorded string either — the target becomes unreachable by any
 * name at all, the defect this function exists to close.
 *
 * Two comparisons are tried, in order:
 *   1. `rawTarget`, lexically normalized only (`normalizeRawTargetLexically`
 *      above), against every template's recorded `targets[]` verbatim — the
 *      ordinary case, needing no filesystem access, where the developer
 *      types the exact name they applied the template under, symlink or
 *      not.
 *   2. Only when (1) finds nothing: `canonicalizeFn(rawTarget)` compared
 *      against `canonicalizeFn(recordedTarget)` for every recorded target,
 *      both resolved through whatever symlinks exist RIGHT NOW. This is the
 *      REVERSE case — a developer who types the CURRENT real name ("real")
 *      for a target recorded under its PRE-symlink name ("dst") — accepted
 *      deliberately: both spellings denote the identical on-disk location
 *      today, and a target's deletability should not depend on which of two
 *      names for the same place happened to be typed.
 *
 * Either match returns the RECORDED string, never the caller's own spelling
 * and never a resolved one: `computeDeletionPlan`'s own `targets.includes
 * (target)` check, and every `toPreserve`/`toDelete` computation downstream,
 * key off that recorded spelling, and returning anything else would silently
 * reintroduce the identical bug one level down. `undefined` when neither
 * comparison finds a match — an ordinary "not applied" case, or a target
 * that has never been registered at all.
 */
function resolveRecordedTarget(
  rawTarget: string,
  document: ProjectStateDocument,
  canonicalizeFn: CanonicalizeTargetFn,
): string | undefined {
  const normalizedRaw = normalizeRawTargetLexically(rawTarget);
  for (const entry of Object.values(document.templates)) {
    if (entry.targets.includes(normalizedRaw)) return normalizedRaw;
  }
  const resolvedRaw = canonicalizeFn(rawTarget);
  if (resolvedRaw === null) return undefined;
  for (const entry of Object.values(document.templates)) {
    for (const recordedTarget of entry.targets) {
      if (recordedTarget === normalizedRaw) continue; // already tried above and did not match
      if (canonicalizeFn(recordedTarget) === resolvedRaw) return recordedTarget;
    }
  }
  return undefined;
}
// @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-resolve-recorded-name

/**
 * cpt-frontx-flow-cli-scaffolding-delete-target — deletes one already-applied
 * `<target>` under explicit confirmation (interactive, `--json`, or
 * `--dry-run`), realizing the delete-op state machine
 * (`cpt-frontx-state-cli-scaffolding-delete-op`): PLAN_COMPUTED ->
 * CONFIRMATION_PENDING -> CONFIRMED -> DELETED, or -> DECLINED.
 */
export async function deleteTarget(
  rawTarget: string,
  repoRoot: string,
  flags: DeleteCommandFlags,
  inventory: DeletePlanInventoryPort,
  canonicalizeFn: CanonicalizeTargetFn,
  listTargetFilesFn: ListTargetFilesFn,
  // The entries `listTargetFilesFn` above cannot enumerate as regular files —
  // a FIFO, a socket, a device, a dangling symlink. They occupy ground inside
  // the target and survive the deletion, so the plan has to name them: the
  // confirmation gate's whole safety argument is that its two lists state the
  // blast radius before it is executed, and an entry in neither list is
  // outside that promise.
  listUnenumerableTargetEntriesFn: ListUnenumerableTargetEntriesFn,
  readFileFn: ReadFileFn,
  removeFileFn: RemoveTargetFileFn,
  // CONTAINMENT ESCAPE FIX: proves an individual `toDelete` path stays
  // inside `repoRoot`, symlinks resolved, immediately before `removeFileFn`
  // is called for it — `listTargetFilesFn` above deliberately FOLLOWS a
  // symlink while enumerating a target's real reachable content, which is
  // correct for the deletion plan itself but means a plan path can resolve
  // outside the project once re-joined with `repoRoot`. Curried over
  // `repoRoot` (`createFsAssertPathWithinRootFn`, `../adapters/fs-project-
  // io.ts`) at the `cli.ts` dispatch site, exactly as `canonicalizeFn`
  // already is.
  assertPathWithinRootFn: AssertPathWithinRootFn,
  readProjectStateFn: ReadProjectStateFn,
  writeProjectStateFn: WriteProjectStateFn,
  confirmDeletionFn: ConfirmDeletionFn,
  removeAiBundleFn?: RemoveAiBundleFn,
  // Fail-closed origin locator and entry-kind probe: protect registered local
  // origins from the plan and from the bundle removal's real footprint.
  classifyPathStrictFn?: ClassifyPathStrictFn,
  entryKindFn?: EntryKindFn,
): Promise<DeleteOutcome> {
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-invoke
  // `rawTarget`/`flags` are accepted as this function's own parameters.
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-invoke

  // Refused up front, before anything about WHICH recorded target the
  // caller means is even asked: an argument that cannot be canonicalized at
  // all (escapes the project root, say) is an ordinary invalid-path
  // refusal regardless of whether some registered `targets[]` entry
  // happens to share its literal spelling, so this check runs first and
  // its result is not threaded any further — `resolveRecordedTarget` below
  // re-canonicalizes `rawTarget` itself wherever it actually needs that
  // form.
  if (canonicalizeFn(rawTarget) === null) {
    return {
      ok: false,
      code: 'INVALID_PATH',
      message: `Target "${rawTarget}" could not be proven to stay inside the project root.`,
      details: { target: rawTarget },
    };
  }

  // Recomputes the plan from the CURRENT project state document — called
  // once for the initial `TARGET_NOT_APPLIED`/dry-run check
  // (PLAN_COMPUTED), and called again immediately before any confirmed
  // deletion (`inst-del-recompute-plan` / `inst-do-pending-confirmed`),
  // never trusting the first call's result. Returns the document read
  // alongside the plan so a confirmed deletion's project-state mutation
  // (below) is built from the SAME read the executed plan was computed
  // against, rather than a third, potentially inconsistent read.
  async function computePlan(): Promise<PlanOutcome> {
    const stateResult = await readProjectState(repoRoot, readProjectStateFn);
    if (!stateResult.ok) {
      return { ok: false, code: 'PROJECT_INVALID', message: stateResult.message, ...(stateResult.details ? { details: stateResult.details } : {}) };
    }
    const aliased = aliasedOwnedRootRefusal(stateResult.document, canonicalizeFn);
    if (aliased !== undefined) return { ok: false, code: 'PROJECT_INVALID', ...aliased };
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-target-shape-drifted
    // `<target>` is recorded as applied (the `TARGET_NOT_APPLIED` check
    // below runs on `computeDeletionPlan`'s own return, so a target that is
    // not even registered never reaches this far), but its on-disk location
    // may have changed shape since — replaced by an ordinary file, or any
    // other non-directory entry — between `apply` and this `delete`. This is
    // the same class of fact `apply` and `upgrade` already refuse for a
    // payload path whose disk shape cannot be compared against declared
    // content (`architecture/ADR/0021-project-upgrade-mechanism.md`): here
    // it is the TARGET's own shape, not a path beneath it, but the target's
    // recorded content can no longer be read or reconciled either way, and
    // `CONTENT_CONFLICT` is the identical code both other engines already
    // use for "the disk holds something this operation cannot work with
    // where it expected a directory" — never a bespoke third code for what
    // is, from a caller's point of view, the same fact.
    // The recorded spelling comes first, and the canonical path only after
    // it: canonicalization answers WHERE on disk to act, never WHICH recorded
    // target the caller means. A target applied under `dst` that has since
    // become a symlink canonicalizes to its real path, which is not what
    // `targets[]` holds — keying the lookup off that would make the recorded
    // target unreachable through the only command that can remove it.
    // Falls back to `rawTarget` VERBATIM, never a canonicalized form, when
    // neither comparison matches: that is the ordinary "not applied" case,
    // and the `TARGET_NOT_APPLIED` refusal below names exactly what the
    // caller typed — a caller told about a resolved path they never wrote
    // has nothing to act on.
    const recordedTarget = resolveRecordedTarget(rawTarget, stateResult.document, canonicalizeFn) ?? rawTarget;
    try {
      const plan = await computeDeletionPlan(
        recordedTarget,
        repoRoot,
        stateResult.document,
        inventory,
        canonicalizeFn,
        listTargetFilesFn,
        readFileFn,
        listUnenumerableTargetEntriesFn,
        classifyPathStrictFn,
      );
      if (!plan.ok) return plan;
      // Deleting the owner's LAST target removes `.frontx/ai/<owner>/`
      // recursively and by name. Another registered template with applied
      // targets whose bundle directory sits inside that directory would lose
      // its bundle, and one whose directory CONTAINS it may hold files of its
      // own at that nested path: either way the removal is refused before
      // anything is deleted (`project-state/bundle-identity.ts`).
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-bundle-overlap
      if (isLastTarget(stateResult.document, plan.templateName, recordedTarget)) {
        const conflicts = bundleConflictsOf(stateResult.document.templates, plan.templateName);
        if (conflicts.length > 0) {
          // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-bundle-overlap
          return {
            ok: false,
            code: 'REGISTRATION_CONFLICT',
            message: bundleOverlapMessage(plan.templateName, conflicts, `Delete refused for "${recordedTarget}"`),
            details: { name: plan.templateName, target: recordedTarget, overlapping: conflicts },
          };
          // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-bundle-overlap
        }
      }
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-bundle-overlap
      // The REAL footprint of the bundle removal against every registered
      // local origin (current and previous, every entry): refused before any
      // write, for the review and for the recomputed confirmation alike.
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-origin-in-bundle-footprint
      if (classifyPathStrictFn && entryKindFn && isLastTarget(stateResult.document, plan.templateName, recordedTarget)) {
        const verdict = bundleFootprintVerdict(
          plan.templateName,
          registeredLocalOriginRaws(stateResult.document),
          classifyPathStrictFn,
          entryKindFn,
        );
        if (!verdict.ok) {
          // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-origin-in-bundle-footprint
          return {
            ok: false,
            code: 'CONTENT_CONFLICT',
            message:
              `Aborted — deleting "${recordedTarget}" would remove "${plan.templateName}"'s AI bundle at "${verdict.bundlePath}", ` +
              (verdict.origin !== undefined
                ? `which a registered local origin ("${verdict.origin}" of "${verdict.name}") lies in, contains or is reached through`
                : `and that location cannot be proven safe to remove (${verdict.reason})`) +
              '. Nothing was deleted; move that source folder or fix the link, then run delete again.',
            details: {
              target: recordedTarget,
              templateName: plan.templateName,
              bundlePath: verdict.bundlePath,
              reason: verdict.reason,
              ...(verdict.origin !== undefined ? { origin: verdict.origin } : {}),
            },
          };
          // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-origin-in-bundle-footprint
        }
      }
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-origin-in-bundle-footprint
      return { ok: true, document: stateResult.document, target: recordedTarget, plan };
    } catch (error) {
      // A read failure resolving the owning template's CURRENT manifest —
      // unreadable as a regular file, or genuinely absent — is no longer a
      // reason for `computeDeletionPlan` to throw: it is caught internally
      // there and folded into the recorded-value fallback
      // (`inst-dp-resolve-current-manifest`), so this catch no longer has
      // that class of error to answer for. Only `TargetNotDirectoryError` —
      // the TARGET's own on-disk shape, not its owning template's manifest —
      // still reaches here.
      if (error instanceof TargetNotDirectoryError) {
        // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-target-shape-drifted
        return {
          ok: false,
          code: 'CONTENT_CONFLICT',
          // The message quotes the PROJECT-RELATIVE path, not the absolute
          // one the error object carries: every other envelope in this
          // package spells a project path that way, and an absolute host path
          // in one of them is both noise for a person and a second shape for
          // a caller to parse.
          message:
            `Aborted — "${toProjectRelativePath(repoRoot, error.targetPath)}" is no longer a directory. Its ` +
            'recorded content cannot be reconciled or deleted while something other than a directory occupies ' +
            'it; nothing deleted.',
          details: { target: recordedTarget, path: toProjectRelativePath(repoRoot, error.targetPath) },
        };
        // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-target-shape-drifted
      }
      throw error;
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-target-shape-drifted
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-compute-plan
  const initial = await computePlan();
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-compute-plan

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-not-applied
  if (!initial.ok) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-not-applied
    return initial;
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-not-applied
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-not-applied

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-dry-run
  // @cpt-begin:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-plan-pending
  if (flags.dryRun) {
    // @cpt-end:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-plan-pending
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-dry-run
    // A preview only: no digest is issued and none is accepted, so a dry run
    // can never stand in for the review a confirming call is bound to.
    const preview = reviewOf(initial, removeAiBundleFn);
    return {
      ok: true,
      outcome: 'dry-run',
      target: preview.target,
      toDelete: preview.toDelete,
      toPreserve: preview.toPreserve,
      ...optionalReviewFields(preview),
      aiBundle: preview.aiBundle,
    };
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-dry-run
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-dry-run

  // One sentence on what confirming does to the project STATE, independent of
// how many files are deleted.
function detachmentNote(review: DeletionReview): string {
  return (
    `Confirming also removes "${review.target}" from "${review.templateName}"'s applied targets` +
    (review.aiBundle.removed ? ` and removes its AI bundle at ${review.aiBundle.path}` : '') +
    ' — even if every file is preserved.'
  );
}

// The review envelope: the whole projection plus the digest that binds an
  // approval to it. Nothing has been written when this is returned.
  const confirmationRequired = (computed: PlanOutcome & { ok: true }, message: string, changedSinceReview: boolean): DeleteOutcome => {
    const review = reviewOf(computed, removeAiBundleFn);
    return {
      ok: false,
      code: 'CONFIRMATION_REQUIRED',
      // The detachment is stated, not implied: confirming always removes the
      // target from the owner's recorded targets, even when every file is
      // preserved, and removes the AI bundle when it is the last target. The
      // sentence is not part of the reviewed projection or the digest.
      message: `${message} ${detachmentNote(review)}`,
      details: {
        ...review,
        planDigest: computeDeletionPlanDigest(review),
        ...(changedSinceReview ? { planChangedSinceReview: true } : {}),
      },
    };
  };

  let final: PlanOutcome & { ok: true };

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-json
  if (flags.jsonMode) {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-json-no-yes
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-plan-pending
    if (!flags.yes) {
      // @cpt-end:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-plan-pending
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-confirmation-required
      // @cpt-begin:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-declined
      return confirmationRequired(
        initial,
        `Deleting "${initial.target}" requires confirmation. Show the plan to the person who decides, then re-issue this ` +
          'command with --yes --plan-digest=<details.planDigest> once they approve it; nothing has been deleted.',
        false,
      );
      // @cpt-end:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-declined
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-confirmation-required
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-json-no-yes

    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-else-json-yes
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-digest-missing
    if (flags.expectedPlanDigest === undefined) {
      // A confirming call that names no reviewed plan binds to nothing: the
      // current plan is returned for review instead, and nothing is deleted.
      return confirmationRequired(
        initial,
        `Confirming the deletion of "${initial.target}" requires --plan-digest=<details.planDigest> of the plan that was ` +
          'reviewed; this is the current plan, nothing has been deleted.',
        false,
      );
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-digest-missing
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-recompute-plan
    // @cpt-begin:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-confirmed
    const recomputed = await computePlan();
    // @cpt-end:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-confirmed
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-recompute-plan
    if (!recomputed.ok) return recomputed;
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-plan-changed
    // The comparison is against the RECOMPUTED plan, the very object about to
    // be executed, never against the first computation of this process.
    if (computeDeletionPlanDigest(reviewOf(recomputed, removeAiBundleFn)) !== flags.expectedPlanDigest) {
      return confirmationRequired(
        recomputed,
        `The plan for "${recomputed.target}" changed since it was reviewed; nothing has been deleted. Show this updated ` +
          'plan to the person who decides and confirm with its planDigest only if they approve it.',
        true,
      );
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-plan-changed
    final = recomputed;
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-else-json-yes
  } else {
    // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-else-interactive
    // Every pass shows `shown` and asks; a plan that differs when recomputed
    // after a "yes" is shown in full and asked about again, so the plan that
    // is deleted is always one the developer was shown and agreed to.
    let shown: PlanOutcome & { ok: true } = initial;
    let changedSinceShown = false;
    for (;;) {
      const shownReview = reviewOf(shown, removeAiBundleFn);
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-prompt
      const decision = await confirmDeletionFn({
        target: shownReview.target,
        templateName: shownReview.templateName,
        toDelete: shownReview.toDelete,
        toPreserve: shownReview.toPreserve,
        ...optionalReviewFields(shownReview),
        aiBundle: shownReview.aiBundle,
        ...(changedSinceShown ? { changedSinceShown: true } : {}),
      });
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-prompt

      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-declined
      // @cpt-begin:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-declined
      if (decision === 'declined') {
        // @cpt-end:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-declined
        // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-declined
        return {
          ok: true,
          outcome: 'declined',
          target: shownReview.target,
          toDelete: shownReview.toDelete,
          toPreserve: shownReview.toPreserve,
          ...optionalReviewFields(shownReview),
          aiBundle: shownReview.aiBundle,
        };
        // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-declined
      }
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-declined

      // Recomputed on the identical confirmed path the `--json --yes` branch
      // takes: both routes to CONFIRMED recompute rather than trust what was
      // shown, and both compare the recomputed plan with what was approved.
      // @cpt-begin:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-confirmed
      const recomputed = await computePlan();
      // @cpt-end:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-pending-confirmed
      if (!recomputed.ok) return recomputed;
      // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-interactive-reconfirm
      if (computeDeletionPlanDigest(reviewOf(recomputed, removeAiBundleFn)) === computeDeletionPlanDigest(shownReview)) {
        final = recomputed;
        break;
      }
      shown = recomputed;
      changedSinceShown = true;
      // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-interactive-reconfirm
    }
    // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-else-interactive
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-json

  // CONTAINMENT ESCAPE FIX: `listTargetFilesFn` (the real
  // `createFsListTargetFilesFn`, `adapters/fs-project-io.ts`) deliberately
  // FOLLOWS a symlink while enumerating the target's real reachable content
  // — correct for computing the deletion plan itself, but it means
  // `final.plan.toDelete` can legitimately name a project-relative path
  // whose actual on-disk location, once re-joined with `repoRoot` and
  // resolved through that same symlink, sits outside the project entirely
  // (a target directory a developer replaced with a symlink to somewhere
  // outside between `apply` and this `delete`). Every path this plan is
  // about to remove is proven to stay inside `repoRoot` in its own pass
  // BEFORE anything is deleted — an escape anywhere in the plan aborts the
  // whole deletion, nothing removed.
  const invalidPaths: string[] = [];
  for (const deletedPath of final.plan.toDelete) {
    try {
      assertPathWithinRootFn(path.join(repoRoot, deletedPath));
    } catch {
      invalidPaths.push(deletedPath);
    }
  }
  if (invalidPaths.length > 0) {
    return {
      ok: false,
      code: 'INVALID_PATH',
      message:
        `Aborted — path(s) could not be proven to stay inside the project root: ${invalidPaths.join(', ')}; ` +
        'nothing deleted.',
      details: { target: final.target, paths: invalidPaths },
    };
  }

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-remove
  // @cpt-begin:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-confirmed-deleted
  // A failure partway leaves a partial result: reported with what is already
  // gone, and recoverable by re-running the same delete (the record still
  // names the target, so the recomputed plan covers what is left).
  const deletedSoFar: string[] = [];
  const partial = (reason: string): string =>
    `${reason} Deletion of "${final.target}" stopped partway: ${deletedSoFar.length} of ` +
    `${final.plan.toDelete.length} planned file(s) were already deleted` +
    (deletedSoFar.length > 0 ? ` (${deletedSoFar.join(', ')})` : '') +
    `, and the project state still records the target. Re-run "frontx delete ${final.target}" to review and finish ` +
    'the deletion, or restore the deleted files from version control.';
  for (const deletedPath of final.plan.toDelete) {
    try {
      await removeFileFn(path.join(repoRoot, deletedPath));
    } catch (error) {
      return {
        ok: false,
        code: 'INTERNAL',
        message: partial(`Could not delete "${deletedPath}": ${error instanceof Error ? error.message : String(error)}.`),
        details: { target: final.target, failedPath: deletedPath, deletedPaths: deletedSoFar },
      };
    }
    deletedSoFar.push(deletedPath);
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-remove

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-update-state
  const ownerName = final.plan.templateName;
  const ownerEntry: TemplateEntry | undefined = getOwn(final.document.templates, ownerName);
  // Filtered against the RECORDED spelling the plan was computed for, not
  // the canonical path: a recorded target whose on-disk location has since
  // become a symlink canonicalizes to something `targets[]` never held, and
  // filtering by that would leave the entry standing after its ground was
  // removed.
  const remainingTargets = ownerEntry ? ownerEntry.targets.filter((t) => t !== final.target) : [];
  if (ownerEntry) {
    // A MARKED entry (an old file may sit in ground it relinquished) keeps that
    // ground protected after the target it sat under is gone: the roots are
    // recorded on the entry, merged with any already retained, so a later
    // delete of a nested or aliased template there still preserves the file.
    const retained = [...new Set([...(ownerEntry.relinquishedGround ?? []), ...(final.plan.relinquishedGround ?? [])])].sort();
    let written: Awaited<ReturnType<typeof mutateProjectState>>;
    try {
      written = await mutateProjectState(
        repoRoot,
        {
          kind: 'set-template',
          name: ownerName,
          entry: { ...ownerEntry, targets: remainingTargets, ...(retained.length > 0 ? { relinquishedGround: retained } : {}) },
        },
        readProjectStateFn,
        writeProjectStateFn,
      );
    } catch (error) {
      const containment = error instanceof PathContainmentError;
      return {
        ok: false,
        code: containment ? 'INVALID_PATH' : 'INTERNAL',
        message: partial(`The project state could not be written: ${error instanceof Error ? error.message : String(error)}.`),
        details: { target: final.target, deletedPaths: deletedSoFar, ...(containment ? { path: error.offendingPath } : {}) },
      };
    }
    if (!written.ok) {
      return {
        ok: false,
        code: 'PROJECT_INVALID',
        message: partial(written.message),
        details: { ...written.details, target: final.target, deletedPaths: deletedSoFar },
      };
    }
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-update-state
  // @cpt-end:cpt-frontx-state-cli-scaffolding-delete-op:p1:inst-do-confirmed-deleted

  // @cpt-begin:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-applied-to-empty
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-last-target
  const finalReview = reviewOf(final, removeAiBundleFn);
  const wasLastTarget = finalReview.aiBundle.removed;
  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-remove-bundle
  let aiBundleResidue: { manifestName: string; path: string; message: string } | undefined;
  if (wasLastTarget && removeAiBundleFn) {
    try {
      await removeAiBundleFn(ownerName);
    } catch (error) {
      // The CLI-owned bundle removal (`adapters/fs-ai-bundle.ts`'s
      // `createFsRemoveBundleFn`) refuses fail-closed, the same way, when
      // its own target cannot be proven to stay inside the project root.
      // By this point the target itself is already removed and its
      // project-state entry already updated above — both real, both
      // correct — so this is not surfaced as `ok: false` (which would tell
      // a caller the whole operation failed over a deletion that in fact
      // already happened and is already recorded). Instead it is carried
      // as a named residue on the success outcome below: the deletion
      // succeeded, one CLI-owned path could not be cleaned, and this
      // module cannot check that precondition up front because
      // `removeAiBundleFn` is an opaque seam whose failure is only
      // discoverable by calling it.
      aiBundleResidue = {
        manifestName: ownerName,
        path: `.frontx/ai/${ownerName}`,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-remove-bundle
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-if-last-target
  // @cpt-end:cpt-frontx-state-composed-provenance-registration-lifecycle:p1:inst-rl-applied-to-empty

  // @cpt-begin:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-success
  return {
    ok: true,
    outcome: 'deleted',
    target: final.target,
    toDelete: final.plan.toDelete,
    toPreserve: final.plan.toPreserve,
    ...optionalReviewFields(finalReview),
    aiBundle: finalReview.aiBundle,
    // Reaching here through `--json --yes` means the recomputed plan's digest
    // equalled the stated one (any other outcome returned above).
    ...(flags.jsonMode && flags.yes ? { boundToReviewedPlan: true as const, planDigest: computeDeletionPlanDigest(finalReview) } : {}),
    templateName: ownerName,
    wasLastTarget,
    ...(aiBundleResidue ? { aiBundleResidue } : {}),
  };
  // @cpt-end:cpt-frontx-flow-cli-scaffolding-delete-target:p1:inst-del-return-success
}
