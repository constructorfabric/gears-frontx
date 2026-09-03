// @cpt-FEATURE:cpt-frontx-feature-upgrade-changeset:p1
// @cpt-algo:cpt-frontx-algo-upgrade-changeset-validate:p1
// @cpt-dod:cpt-frontx-dod-upgrade-changeset-computation:p1
// @cpt-state:cpt-frontx-state-upgrade-changeset-lifecycle:p1
//
// Validates a candidate new origin against every target a registered name
// carries, per `cpt-frontx-adr-project-upgrade-mechanism`'s ordering: several
// refusals MUST happen before anything else is resolved or inspected, so the
// step ORDER below is as normative as the individual checks —
//
//   check baseline honesty -> resolve candidate (ONCE) -> check candidate's
//   own recorded-version honesty (restore only) -> check declared identity
//   -> check no-op -> classify every target -> refuse on the first
//   conflict class found, never mid-loop
//
// Each ordering rule closes one specific correctness hole:
//   - Baseline honesty BEFORE candidate resolution (`inst-val-check-baseline`
//     / `inst-val-if-baseline-drift`) means a transition is never computed
//     from a baseline the project state misreports — resolving the candidate
//     first and only then discovering the baseline was wrong would have
//     already spent a network round-trip diffing against a version this
//     project never actually had.
//   - The candidate is resolved EXACTLY ONCE, here (`inst-val-resolve-new-
//     origin`) — never re-resolved by a caller (including restore) before or
//     after calling this function. Two resolutions of what is supposed to be
//     the SAME candidate could disagree (a mutable ref moving between calls),
//     silently classifying against content the developer never actually
//     reviewed.
//   - Identity and no-op checks BEFORE any target is classified
//     (`inst-val-if-identity-mismatch`, `inst-val-if-candidate-is-baseline`)
//     means a name is never silently re-keyed to a different template's
//     content, and an upgrade to where the name already is never computes a
//     plan or consumes the one generation of reversal.
//   - EVERY target is classified before either conflict check runs
//     (`inst-val-if-target-fails`, `inst-val-if-nested-conflict`) — no
//     early return inside the loop — so a refusal always names every
//     doubly-changed path and every nested conflict in one report, never a
//     partial one that would require a second run to discover the rest.
import { classifyTarget } from './classify';
import type { ClassifyInput } from './classify';
import { versionMatchesRecorded } from './payload';
import type {
  OriginVersion,
  ReadDiskEntryFn,
  ResolvePayloadFn,
  UpgradeOperation,
  UpgradePlan,
  UpgradeRefusal,
  UpgradeSkippedPath,
} from './types';
import type { ProjectStateDocument, TemplateEntry } from '../project-state/types';
import { joinUnderTarget } from '../paths/relative-path';
import { parseLocalOrigin } from '../resolver/types';

// Derives the project-relative folder a `path:`-installed name's own origin
// occupies. Derived from the BASELINE's currently recorded origin
// (`entry.origin`) — never the candidate's — since that is the origin
// actually registered in the project state store for the whole of this
// validation; the transition to the candidate's origin has not committed
// yet.
function deriveLocalOriginFolder(origin: string, canonicalizeFn: (raw: string) => string | null): string | undefined {
  const relativePath = parseLocalOrigin(origin);
  if (relativePath === undefined) return undefined;
  const canonical = canonicalizeFn(relativePath);
  return canonical ?? undefined;
}

export type ValidateOutcome =
  | { ok: true; kind: 'plan'; plan: UpgradePlan }
  | { ok: true; kind: 'noop'; at: OriginVersion }
  | UpgradeRefusal;

export interface ValidateInput {
  name: string;
  // The baseline: `templates[name]` as currently recorded — `{origin,
  // version, targets[], previous?}`. `previous` is read by neither this
  // algorithm nor `flow.ts`'s call into it; only `commit.ts` writes it.
  entry: TemplateEntry;
  candidateOrigin: string;
  // Supplied ONLY by a restore invocation, carrying the recorded preceding
  // pair's own recorded version — a forward upgrade's candidate carries no
  // such recorded expectation and never supplies this
  // (`inst-val-if-candidate-version-mismatch`'s own text).
  candidateExpectedVersion?: string;
  // For `projectOwnedRoots` and every OTHER registered template's targets
  // (`inst-cls-if-newly-claimed-nested`'s nesting-aware check needs both).
  document: ProjectStateDocument;
  repoRoot: string;
  resolvePayload: ResolvePayloadFn;
  // Resolves one OTHER registered template's declared `excludedSubtrees` —
  // its MANIFEST only, never its payload.
  //
  // A separate seam from `resolvePayload` on purpose, and the distinction is
  // load-bearing rather than stylistic. The nesting check needs nothing from
  // another template but its declared exclusions, while `resolvePayload`
  // reads that template's ENTIRE payload — every file, and a network fetch
  // for a remote origin. Routing this through `resolvePayload` would make
  // preparing ONE name's upgrade resolve every other registered template in
  // full: for the twenty-registered-template project
  // `cpt-frontx-cli-nfr-template-scale` names as its own threshold, that is
  // nineteen needless full resolutions per upgrade, which is precisely the
  // independence that NFR requires upgrade to preserve.
  //
  // The wiring layer satisfies this with `resolveRegisteredExcludedSubtrees`
  // (`../scaffold/registered-manifest.ts`) — the ONE shared formulation
  // `apply`, `ownership add`, and `delete-plan` already re-derive a
  // registered name's current exclusions through, and the one that reads a
  // local `path:` origin's manifest directly rather than via the inventory
  // (the checkpoint-4 defect where `inventory.lookup` alone silently returned
  // `[]` for every locally-registered template). Kept as an injected seam
  // rather than an import so this algorithm takes no dependency on the
  // inventory it has no other use for.
  resolveRegisteredExclusions: (name: string, origin: string) => Promise<string[]>;
  readDiskEntry: ReadDiskEntryFn;
  canonicalizeFn: (raw: string) => string | null;
}

/**
 * `cpt-frontx-algo-upgrade-changeset-validate` — validates `candidateOrigin`
 * against every target `entry.targets[]` names, in the exact order this
 * file's header comment fixes. See `ValidateOutcome` for the three shapes
 * this can return: a validated `UpgradePlan` ready for review, an idempotent
 * `noop`, or an `UpgradeRefusal` naming why.
 */
export async function validateUpgrade(input: ValidateInput): Promise<ValidateOutcome> {
  const { name, entry, candidateOrigin, candidateExpectedVersion, document, repoRoot, resolvePayload, resolveRegisteredExclusions, readDiskEntry, canonicalizeFn } =
    input;

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-check-baseline
  // Resolve the name's CURRENTLY RECORDED origin and compare the version it
  // reports against the `version` recorded beside it — the baseline honesty
  // check that must run BEFORE the candidate is ever resolved
  // (`inst-val-check-baseline`'s own text: "obtain the baseline payload ...
  // classification will compare against").
  const baselineResolved = await resolvePayload(entry.origin);
  if (!baselineResolved.ok) {
    // Not itself one of this algorithm's numbered `inst-val-*` branches — the
    // FEATURE describes only the DRIFT case for an already-registered
    // baseline (`inst-val-if-baseline-drift`), never an outright unresolvable
    // one, since a name's baseline ordinarily resolves (it was applied from
    // it). Propagated as the resolver's OWN failure code/message rather than
    // fabricated as `VERSION_MISMATCH`: there is no version to compare a
    // baseline that cannot be resolved at all against, so reporting a
    // version mismatch would be dishonest about what actually failed.
    return { ok: false, code: baselineResolved.code, message: baselineResolved.message };
  }
  const baseline = baselineResolved.payload;
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-check-baseline

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-baseline-drift
  if (!versionMatchesRecorded(baseline, entry.version)) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-baseline-drift
    // No transition computed, no target inspected: a transition diffed
    // against a version this project never actually had would be worthless
    // regardless of what it concluded.
    return {
      ok: false,
      code: 'VERSION_MISMATCH',
      message:
        `"${name}"'s recorded version "${entry.version}" no longer matches what its recorded origin "${entry.origin}" ` +
        `now reports ("${baseline.version}"). Refusing before resolving the candidate origin or inspecting any target.`,
      details: { name, recordedVersion: entry.version, reportedVersion: baseline.version },
    };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-baseline-drift
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-baseline-drift

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-resolve-new-origin
  // The ONLY resolution of `candidateOrigin` this algorithm performs — a
  // caller (including restore) never re-resolves it beforehand or
  // afterward.
  const candidateResolved = await resolvePayload(candidateOrigin);
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-resolve-new-origin

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-resolve-fail
  if (!candidateResolved.ok) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-unavailable
    // Propagates the resolver's own code (`ORIGIN_UNAVAILABLE` or, for a
    // legacy-shaped manifest, `INVALID_MANIFEST` — `payload.ts`'s own header
    // documents why that second code exists) rather than collapsing both to
    // `ORIGIN_UNAVAILABLE`: `UpgradeRefusalCode` includes both for exactly
    // this reason.
    return { ok: false, code: candidateResolved.code, message: candidateResolved.message };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-unavailable
  }
  const candidate = candidateResolved.payload;
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-resolve-fail

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-candidate-version-mismatch
  if (candidateExpectedVersion !== undefined && candidate.version !== candidateExpectedVersion) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-candidate-version-mismatch
    // The SAME baseline-honesty semantics `inst-val-if-baseline-drift`
    // already applies, applied here to a candidate that itself carries a
    // recorded expectation — which is what a restore's preceding pair is. No
    // target is inspected.
    return {
      ok: false,
      code: 'VERSION_MISMATCH',
      message:
        `"${name}"'s candidate origin "${candidateOrigin}" was recorded at version "${candidateExpectedVersion}" but ` +
        `now reports "${candidate.version}". No target inspected.`,
      details: { name, recordedVersion: candidateExpectedVersion, reportedVersion: candidate.version },
    };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-candidate-version-mismatch
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-candidate-version-mismatch

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-read-name
  // `candidate.name` and `candidate.excludedSubtrees` were already read as
  // part of resolution above (`ResolvedPayload`'s own shape) — this step is
  // realized by simply consulting those fields, not a second read.
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-read-name

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-identity-mismatch
  if (candidate.name !== name) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-identity-mismatch
    return {
      ok: false,
      code: 'REGISTRATION_CONFLICT',
      message: `Origin "${candidateOrigin}" declares identity "${candidate.name}", but "${name}" is the name being upgraded. No target inspected.`,
      details: { registeredName: name, declaredName: candidate.name },
    };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-identity-mismatch
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-identity-mismatch

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-candidate-is-baseline
  if (candidate.origin === entry.origin && candidate.version === entry.version) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-noop
    // No plan computed, nothing written, and — the caller's responsibility,
    // not this function's — the name's preceding pair is left exactly as it
    // is: an upgrade to where the name already is does not consume the one
    // generation of reversal.
    return { ok: true, kind: 'noop', at: { origin: entry.origin, version: entry.version } };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-noop
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-candidate-is-baseline

  // Every OTHER registered template's targets, each tagged with that
  // template's currently declared `excludedSubtrees` joined under each of
  // its own targets — the identical join `commands/ownership.ts`'s own
  // `buildRecordedTargets` performs for the identical reason
  // (`checkTargetConflicts`'s nesting check compares a `TargetClaim`'s
  // `excludedSubtrees` against a full project-relative path, so each
  // declared entry must already be re-rooted under the target it was
  // declared for). Resolved through the SAME shared `resolvePayload` seam
  // Resolved through `resolveRegisteredExclusions` — the MANIFEST-only seam,
  // never `resolvePayload` (see `ValidateInput`'s own doc comment for why
  // routing it through the payload resolver would defeat
  // `cpt-frontx-cli-nfr-template-scale`) — and, mirroring
  // `resolveRegisteredExcludedSubtrees`'s own convention, fails closed to
  // `[]` for a template whose origin cannot currently be resolved: an
  // unrelated template's broken origin must never block validating THIS
  // name's upgrade (`cpt-frontx-cli-nfr-template-scale`'s own independence
  // requirement), and `[]` is the SAFE direction for a nesting check — it
  // can only ADMIT more conflicts, never silently permit one.
  const otherTemplateTargets: { target: string; templateName: string; excludedSubtrees: string[] }[] = [];
  for (const [otherName, otherEntry] of Object.entries(document.templates)) {
    if (otherName === name) continue;
    if (otherEntry.targets.length === 0) continue;
    // MANIFEST-only, never a payload read — see `resolveRegisteredExclusions`'s
    // own doc comment on `ValidateInput` for why routing this through
    // `resolvePayload` would defeat `cpt-frontx-cli-nfr-template-scale`.
    const declaredExclusions = await resolveRegisteredExclusions(otherName, otherEntry.origin);
    for (const otherTarget of otherEntry.targets) {
      otherTemplateTargets.push({
        target: otherTarget,
        templateName: otherName,
        excludedSubtrees: declaredExclusions.map((declared) => joinUnderTarget(otherTarget, declared)),
      });
    }
  }

  // The six-term slot carries the BASELINE's own origin folder (the origin
  // actually registered for the whole of this validation).
  const localOriginFolder = deriveLocalOriginFolder(entry.origin, canonicalizeFn);

  // Reserved ground beyond the six terms — see `ClassifyInput.additional
  // ExclusionRoots` for why this is the caller's addition rather than a
  // seventh term, and which live-confirmed exposure it closes.
  //
  // Two sources. First, the CANDIDATE's own origin folder: on a
  // `path:`->`path:` transition it is a DIFFERENT directory from the
  // baseline's, so the six-term slot does not cover it, and writing into the
  // very folder the content is being read from would be self-destructive.
  // Second, every OTHER registered template's local origin folder — that
  // template's own source of truth, which this name's upgrade must never
  // ADD/REPLACE/REMOVE inside, exactly as `apply` and `delete` already
  // guarantee.
  const additionalExclusionRoots: string[] = [];
  const candidateOwnFolder = deriveLocalOriginFolder(candidate.origin, canonicalizeFn);
  if (candidateOwnFolder !== undefined && candidateOwnFolder !== localOriginFolder) {
    additionalExclusionRoots.push(candidateOwnFolder);
  }
  for (const [otherName, otherEntry] of Object.entries(document.templates)) {
    if (otherName === name) continue;
    const otherFolder = deriveLocalOriginFolder(otherEntry.origin, canonicalizeFn);
    // A folder that can no longer be proven to stay inside the project root is
    // simply omitted: it was proven at register time, so a failure here means
    // that ground has since been removed or now escapes via a changed symlink
    // — there is nothing real left to subtract. `scaffold/assembler.ts`'s
    // `collectOtherLocalOriginFolders` omits it for the identical reason.
    if (otherFolder !== undefined && !additionalExclusionRoots.includes(otherFolder)) {
      additionalExclusionRoots.push(otherFolder);
    }
  }

  const operations: UpgradeOperation[] = [];
  // Per-target boundary, carried onto the plan for the commit algorithm's own
  // boundary-scoped stale-temp reclaim — see `UpgradePlan.exclusionRootsByTarget`.
  const exclusionRootsByTarget: Record<string, string[]> = {};
  const skipped: UpgradeSkippedPath[] = [];
  const contentConflicts: { target: string; path: string }[] = [];
  const targetConflicts: { target: string; contestingTarget: string; contestingTemplateName: string }[] = [];

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-foreach-target
  for (const target of entry.targets) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-check-target
    const classifyInput: ClassifyInput = {
      target,
      repoRoot,
      baseline,
      candidate,
      projectOwnedRoots: document.projectOwnedRoots,
      localOriginFolder,
      otherTemplateTargets,
      additionalExclusionRoots,
      readDiskEntry,
      canonicalizeFn,
    };
    const result = await classifyTarget(classifyInput);
    exclusionRootsByTarget[target] = result.exclusionRoots;
    operations.push(...result.operations);
    skipped.push(...result.skipped);
    for (const path of result.conflictPaths) contentConflicts.push({ target, path });
    for (const nested of result.nestedConflicts) {
      targetConflicts.push({ target, contestingTarget: nested.target, contestingTemplateName: nested.templateName });
    }
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-check-target
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-foreach-target

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-target-fails
  if (contentConflicts.length > 0) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-target-fail
    // Every target was classified above before this check runs — no partial
    // pass is ever returned, and every doubly-changed target/path is named
    // in one report.
    return {
      ok: false,
      code: 'CONTENT_CONFLICT',
      message: `"${name}"'s upgrade was refused: ${contentConflicts.length} file(s) have both moved away from the baseline and do not already match the candidate.`,
      details: { conflicts: contentConflicts },
    };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-target-fail
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-target-fails

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-nested-conflict
  if (targetConflicts.length > 0) {
    // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-nested-conflict
    // Same "classify all first" rule: every nested conflict across every
    // target is named in one report, checked only AFTER the content-conflict
    // check above finds nothing, per `inst-val-if-target-fails` /
    // `inst-val-if-nested-conflict`'s own numbered order.
    return {
      ok: false,
      code: 'TARGET_CONFLICT',
      message: `"${name}"'s upgrade was refused: ${targetConflicts.length} target(s) newly claim ground another registered template's target nests inside.`,
      details: { conflicts: targetConflicts },
    };
    // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-nested-conflict
  }
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-if-nested-conflict

  // @cpt-begin:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-pass
  // @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-validated
  const plan: UpgradePlan = {
    name,
    from: { origin: entry.origin, version: entry.version },
    to: { origin: candidate.origin, version: candidate.version },
    targets: entry.targets,
    operations,
    skipped,
    exclusionRootsByTarget,
  };
  return { ok: true, kind: 'plan', plan };
  // @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-validated
  // @cpt-end:cpt-frontx-algo-upgrade-changeset-validate:p1:inst-val-return-pass
}
