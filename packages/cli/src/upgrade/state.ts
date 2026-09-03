// @cpt-FEATURE:cpt-frontx-feature-upgrade-changeset:p1
// @cpt-state:cpt-frontx-state-upgrade-changeset-lifecycle:p1
//
// The upgrade lifecycle §4 fixes: eight states modeling exactly ONE engine
// invocation, forward or restore, from the moment it reads its baseline to
// the moment it terminates. A later invocation — another `upgrade`, or
// `--restore` — is a FRESH instance of this same machine, starting again at
// `BASELINE_READ`; no state below is given an outgoing transition back to it
// (FEATURE §4's own text). This module is a vocabulary, not logic: `flow.ts`
// is what actually drives a run through these states.
export const UpgradeLifecycleState = {
  BASELINE_READ: 'BASELINE_READ',
  VALIDATED: 'VALIDATED',
  REFUSED: 'REFUSED',
  NOOP: 'NOOP',
  PRESENTED: 'PRESENTED',
  APPROVED: 'APPROVED',
  COMMITTED: 'COMMITTED',
  DECLINED: 'DECLINED',
} as const;

export type UpgradeLifecycleState = (typeof UpgradeLifecycleState)[keyof typeof UpgradeLifecycleState];

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-validated
// BASELINE_READ -> VALIDATED: the new origin resolves, declares the same
// identity as the registered name, and validates against every target in
// `targets[]`.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-validated

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-refused
// BASELINE_READ -> REFUSED: the name is not registered, its `targets[]` is
// empty, no preceding `{origin, version}` is recorded for a restore
// (`NOTHING_TO_RESTORE`), the recorded `version` no longer matches what the
// recorded `origin` reports (`VERSION_MISMATCH`), the new origin cannot be
// resolved, it declares a different identity, a file inside any target has
// both moved away from the baseline and does not already match the
// candidate (`CONTENT_CONFLICT`), or another registered template's target
// nests inside ground the candidate newly claims (`TARGET_CONFLICT`);
// `templates[name]` is unchanged for every target.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-refused

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-noop
// BASELINE_READ -> NOOP: the resolved candidate's `{origin, version}` equals
// the baseline's own; no plan is computed, nothing is written, and, for a
// restore, the preceding pair is left exactly as it is.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-read-to-noop

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-validated-to-presented
// VALIDATED -> PRESENTED: the transition has been built and shown to the
// developer for review.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-validated-to-presented

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-approved
// PRESENTED -> APPROVED: the developer grants explicit approval.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-approved

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-declined
// PRESENTED -> DECLINED: the developer declines the transition; nothing is
// written.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-presented-to-declined

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-approved-to-refused
// APPROVED -> REFUSED: the pre-rename verification finds a destination has
// drifted from what classification saw (`CONTENT_CONFLICT`, no destination
// touched), or an I/O failure during the destination-write step is caught
// and recovery succeeds (`INTERNAL`, every target and `templates[name]`
// exactly as before) or itself fails (`INTERNAL` naming both failures,
// `templates[name]` untouched though a destination may not be at baseline);
// nothing is committed to the project state store in any of these.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-approved-to-refused

// @cpt-begin:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-approved-to-committed
// APPROVED -> COMMITTED: the engine applies the transition within every
// target's effective ownership and commits `origin`/`version` atomically for
// the name, including when the inventory promotion after that commit point
// fails (`INTERNAL` naming the slot, the transition itself still landing
// here) — a restore's own commit lands in this same state, not a distinct
// one, since restore is this engine run against the recorded preceding
// `{origin, version}` as its candidate.
// @cpt-end:cpt-frontx-state-upgrade-changeset-lifecycle:p1:inst-st-approved-to-committed
