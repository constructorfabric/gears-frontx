// @cpt-FEATURE:cpt-frontx-feature-upgrade-changeset:p1
// @cpt-flow:cpt-frontx-flow-upgrade-changeset-review-approval:p1
// @cpt-flow:cpt-frontx-flow-upgrade-changeset-restore:p1
//
// `frontx upgrade <templateName> <new-origin>` / `frontx upgrade
// <templateName> --restore` — the command surface wired onto the rewritten
// engine (`../upgrade/flow.ts`). This module owns exactly what `commands/
// delete.ts` owns for `delete`: the human-interactive vs. `--json`
// confirmation protocol around one already-implemented plan-producing
// engine, never a second idea of what the plan or its commit mean. The
// engine itself (`upgradeToOrigin`/`restorePreceding`, `cpt-frontx-dod-
// upgrade-changeset-single-engine`) is untouched by this module — direct
// CLI use and any future external orchestration both drive it through this
// same command surface.
//
// `--json` reuses `delete`'s own precedent EXACTLY (`commands/delete.ts`'s
// own header, `inst-del-if-json-no-yes`): `CONFIRMATION_REQUIRED` when
// `--yes` is absent, carrying the computed plan, and the engine never blocks
// on stdin in this mode. No new error code is introduced for that —
// `CONFIRMATION_REQUIRED` is already part of the shared vocabulary
// (`envelope.ts`'s `ErrorCode`), and upgrade's own narrower
// `UpgradeRefusalCode` (`upgrade/types.ts`) deliberately has no dedicated
// equivalent for a decision the CALLER, not the engine, must make.
//
// HOW THE `--json`-WITHOUT-`--yes` SUBSTITUTION WORKS, without touching
// `flow.ts`: the engine's own `presentPlan` seam is the only place a
// computed plan ever reaches a caller before commit. In that mode,
// `presentPlan` is wired to return `'declined'` UNCONDITIONALLY — it never
// reads stdin — which drives the engine to its ordinary `{ok: true,
// outcome: 'declined', plan}` return (nothing committed, exactly as a real
// decline). This function then recognizes that SPECIFIC combination
// (`--json`, no `--yes`, an engine-reported decline) and reports it as
// `CONFIRMATION_REQUIRED` instead of an ordinary declined success — the
// plan the caller must re-approve travels back on the very same `outcome:
// 'declined'` value the engine already produced, so no second plan
// computation or capture mechanism is needed.
import { upgradeToOrigin, restorePreceding } from '../upgrade/flow';
import { computePlanDigest, renderReviewablePlan, reviewNotes } from '../upgrade/plan';
import type { UpgradeEngineDeps, UpgradeFlowOutcome } from '../upgrade/flow';
import type { UpgradePlan, PresentUpgradePlanFn } from '../upgrade/types';
import type { ErrorCode } from '../envelope';

export interface UpgradeCommandFlags {
  jsonMode: boolean;
  yes: boolean;
  // `--plan-digest=<hex>`: the `details.planDigest` of the `CONFIRMATION_REQUIRED`
  // review this `--yes` call confirms. When present, the call commits only if
  // the plan it computes itself has exactly that digest; otherwise nothing is
  // written and the freshly computed plan is returned for a new review.
  expectedPlanDigest?: string;
}

// Which direction this invocation requested — the ONE thing that
// distinguishes a forward upgrade from a restore at this dispatch layer,
// mirroring `upgrade/flow.ts`'s own `deriveCandidate` seam: everything else
// below (confirmation protocol, outcome mapping) is identical for both.
export type UpgradeDirection = { kind: 'forward'; newOrigin: string } | { kind: 'restore' };

export type UpgradeCommandOutcome =
  | { ok: true; outcome: 'noop'; at: { origin: string; version: string }; recordedExclusions?: string[] }
  | { ok: true; outcome: 'declined'; plan: UpgradePlan }
  | { ok: true; outcome: 'success'; plan: UpgradePlan; reclaimedTempPaths: string[] }
  | { ok: false; code: ErrorCode; message: string; details?: Record<string, unknown> };

/**
 * `cpt-frontx-flow-upgrade-changeset-review-approval` /
 * `cpt-frontx-flow-upgrade-changeset-restore` — dispatches to whichever
 * direction `direction` selects, builds the `presentPlan` seam for the
 * requested mode, and applies the `--json`-without-`--yes` substitution this
 * file's header describes.
 */
export async function upgradeCommand(
  templateName: string,
  direction: UpgradeDirection,
  flags: UpgradeCommandFlags,
  engineDeps: Omit<UpgradeEngineDeps, 'presentPlan'>,
  presentInteractively: PresentUpgradePlanFn,
): Promise<UpgradeCommandOutcome> {
  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-invoke-upgrade
  // @cpt-begin:cpt-frontx-flow-upgrade-changeset-restore:p1:inst-rst-invoke
  // `templateName`/`direction`/`flags` are accepted as this function's own
  // parameters — the CLI dispatch layer (`cli.ts`) has already parsed the
  // process invocation down to these.
  // `--yes` bound to a reviewed plan (`--plan-digest`) approves only that plan:
  // a plan whose content differs (project or candidate changed since the
  // review) is declined here, which the substitution below reports as a fresh
  // `CONFIRMATION_REQUIRED` — reviewed equals applied across the two calls.
  let planChangedSinceReview = false;
  // Automated approval must name the plan it approves (plan-ai-recovery r9 §1):
  // a digestless `--json --yes` is answered with the review, never applied.
  let digestMissing = false;
  const presentPlan: PresentUpgradePlanFn = flags.jsonMode
    ? flags.yes
      ? async (plan) => {
          if (flags.expectedPlanDigest === undefined) {
            digestMissing = true;
            return 'declined';
          }
          if (computePlanDigest(plan) === flags.expectedPlanDigest) return 'approved';
          planChangedSinceReview = true;
          return 'declined';
        }
      : async () => 'declined' // never reads stdin — see this file's header
    : presentInteractively;

  const deps: UpgradeEngineDeps = {
    ...engineDeps,
    presentPlan,
    // A digest names a reviewed plan, and a reviewed plan is never a no-op:
    // for this call a no-op outcome is itself a changed plan (see the flow).
    ...(flags.jsonMode && flags.yes && flags.expectedPlanDigest !== undefined ? { boundToReviewedPlan: true } : {}),
  };

  const outcome: UpgradeFlowOutcome =
    direction.kind === 'forward'
      ? await upgradeToOrigin(templateName, direction.newOrigin, deps)
      : await restorePreceding(templateName, deps);
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-restore:p1:inst-rst-invoke
  // @cpt-end:cpt-frontx-flow-upgrade-changeset-review-approval:p1:inst-invoke-upgrade

  // The state the digest was computed against is gone (the project reached the
  // candidate meanwhile): same answer as any other changed plan — fail closed,
  // the approval is not carried over. No plan exists to show; nothing written.
  if (outcome.ok && outcome.outcome === 'review-superseded') {
    return {
      ok: false,
      code: 'CONFIRMATION_REQUIRED',
      message:
        `"${templateName}"'s upgrade plan is not the plan that was reviewed: the project is already at ` +
        `"${outcome.at.origin}" (version ${outcome.at.version}), so there is nothing left to approve. Nothing has been written.`,
      details: { name: templateName, reviewSuperseded: true, at: outcome.at },
    };
  }

  // The substitution this file's header describes: an engine-reported
  // decline reached ONLY because `presentPlan` above never actually asked
  // anyone (`--json` without `--yes`) is not a real developer decision —
  // it is reported as `CONFIRMATION_REQUIRED`, carrying the plan, so a
  // caller can re-issue the identical command with `--yes` rather than
  // being told (falsely) that the upgrade was declined. Deliberately
  // UNMARKED (no `@cpt-` id): neither `cpt-frontx-flow-upgrade-changeset-
  // review-approval` nor `-restore` describes a distinct "unattended --json
  // caller" step — this is the identical dispatch-layer substitution
  // `commands/delete.ts` already makes for `delete` (`inst-del-if-json-no-
  // yes`), which is that OTHER feature's own instruction, not this one's.
  if (outcome.ok && outcome.outcome === 'declined' && flags.jsonMode && (!flags.yes || planChangedSinceReview || digestMissing)) {
    return {
      ok: false,
      code: 'CONFIRMATION_REQUIRED',
      message: (digestMissing
        ? `"${templateName}"'s upgrade was not applied: --yes confirms only a reviewed plan. Review the plan in this envelope and ` +
          're-issue with --yes --plan-digest=<details.planDigest>; nothing has been written.'
        : planChangedSinceReview
        ? `"${templateName}"'s upgrade plan is not the plan that was reviewed: the project or the candidate changed ` +
          'since the review. Nothing has been written; review the plan in this envelope and confirm it with its own planDigest.'
        : `"${templateName}"'s upgrade requires confirmation. Re-issue this exact command with --yes ` +
          '--plan-digest=<details.planDigest> after obtaining authorization out of band; nothing has been written.') +
        reviewNotes(outcome.plan).map((note) => ` ${note}`).join(''),
      // Projected, never the internal plan: `renderReviewablePlan` strips the
      // three content fields the commit algorithm needs (`expectedDisk`,
      // `newContent`, `baselineContent`), which would otherwise put up to
      // three full copies of every changed file — and the baseline's own
      // content — into this envelope. See `../upgrade/plan.ts` for why that
      // contradicts what the plan is.
      details: {
        name: templateName,
        plan: renderReviewablePlan(outcome.plan),
        planDigest: computePlanDigest(outcome.plan),
        ...(reviewNotes(outcome.plan).length > 0 ? { notes: reviewNotes(outcome.plan) } : {}),
      },
    };
  }

  return outcome;
}
