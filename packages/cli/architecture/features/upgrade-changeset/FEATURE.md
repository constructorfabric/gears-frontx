# Feature: Upgrade Change-Set Engine

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Developer Review and Approval of an Atomic All-Targets Upgrade](#developer-review-and-approval-of-an-atomic-all-targets-upgrade)
  - [Developer Restores a Template's Pre-Upgrade State](#developer-restores-a-templates-pre-upgrade-state)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Validate a New Origin Against Every Target of a Name](#validate-a-new-origin-against-every-target-of-a-name)
  - [Commit the Atomic All-Targets Transition](#commit-the-atomic-all-targets-transition)
- [4. States (CDSL)](#4-states-cdsl)
  - [Upgrade Lifecycle](#upgrade-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Atomic All-Targets Validation and Review](#atomic-all-targets-validation-and-review)
  - [Atomic All-Targets Commit](#atomic-all-targets-commit)
  - [Restore to Pre-Upgrade State](#restore-to-pre-upgrade-state)
  - [Single Authoritative Engine](#single-authoritative-engine)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-upgrade-changeset`

## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-upgrade-changeset`

### 1.1 Overview

The Upgrade Change-Set Engine is the single `target` CLI-owned mechanism (`cpt-frontx-component-cli-change-set-engine`) that upgrades a registered template's **name** — every target that name has been applied to, atomically, as one unit. `upgrade <templateName> <new-origin>` reads the name's current `{origin, version}` entry from `cpt-frontx-feature-composed-provenance`'s single project state document as its only baseline, resolves the new origin through the shared resolver, validates it against every target listed under the name, presents the validated transition for developer review, and — only on approval — commits the new `origin`/`version` atomically to the project state store while applying the change within each target's effective ownership. A partial upgrade, where one target of a name moves to the new version while a sibling target of the same name stays on the old one, is not a representable state: the registry records exactly one `origin` and one `version` per name. All CDSL behavior is `target` (GREENFIELD — grounded in `cpt-frontx-adr-atomic-all-targets-upgrade`, `cpt-frontx-adr-single-project-state-file`, and DESIGN §3.2/§3.6).

Earlier revisions of this feature upgraded one applied template **instance** at a time, diffing against a per-instance provenance record retained specifically for that purpose. Neither the per-instance unit nor the provenance-record baseline exists any longer: the registry now records one `origin`/`version` pair per template **name**, covering every target that name has been applied to, so the engine's unit of operation is the name and its baseline is that one registry entry. The feature's identifier, `cpt-frontx-feature-upgrade-changeset`, still names a file-level change-set (diff/merge/rollback) mechanism this feature does not own — that mechanism is deferred to a dedicated future decision (CLI DESIGN §4) — while this feature currently commits only the atomic name-level `origin`/`version` transition; renaming the identifier once that future decision lands, or independently of it, is tracked as a coordination work item in the root DECOMPOSITION (`cpt-frontx-feature-identifier-rename-wave`).

### 1.2 Purpose

This feature exists to let a project developer safely adopt a newer origin for any registered template, across every target it has been applied to, without hand-editing files or risking an unreviewed or partially-applied change. It satisfies `cpt-frontx-fr-cli-project-upgrade-changeset` (the upgrade is one atomic change set covering all of a name's targets), `cpt-frontx-fr-cli-upgrade-review-approval` (no file is written until the developer approves), and `cpt-frontx-fr-cli-upgrade-restore` (an approved upgrade remains reversible). The engine is reusable across invokers — direct CLI use and AI-driven orchestration (`cpt-frontx-feature-ai-upgrade-orchestration`) both drive the same engine, never a second implementation.

`cpt-frontx-adr-atomic-all-targets-upgrade` deliberately fixes only the unit of upgrade (a template name, atomically across all its targets) and the source of its baseline (the project state store's `origin`/`version` entry) — it does **not** fix a changeset representation, a file-level diff or three-way-merge algorithm, or per-file conflict detection within an upgrade, leaving that mechanism to a dedicated future decision (DESIGN §4). This feature does not invent that mechanism in its place: its validation and commit algorithms describe the operation only at the level of detail the ADR and DESIGN fix — validate the new origin against every target, and on success commit `origin`/`version` atomically; on any failure, refuse the whole upgrade with nothing changed. The concrete mechanism behind `cpt-frontx-fr-cli-upgrade-restore`'s reversibility requirement is likewise an **open question** this feature does not resolve (see §5, "Restore to Pre-Upgrade State"); it states the requirement's observable contract without asserting what state is retained or how a reversal is carried out at the file level.

**Requirements**: `cpt-frontx-fr-cli-project-upgrade-changeset`, `cpt-frontx-fr-cli-upgrade-review-approval`, `cpt-frontx-fr-cli-upgrade-restore`

**Principles**: `cpt-frontx-cli-principle-reviewed-reversible-mutation`

**Applicability** (Often-N/A domains for a CLI Command feature, per the FEATURE checklist's Applicability Context): SEC and COMPL are not applicable — this engine enforces no authentication or authorization boundary and carries no regulatory scope; the closest security-adjacent control is `REGISTRATION_CONFLICT` on an identity mismatch (`inst-val-if-identity-mismatch`), a supply-chain integrity check rather than an auth boundary. OPS (observability) is not applicable — no logging, metrics, or tracing surface is introduced beyond the reviewable transition this feature already presents. UX is addressed by the developer review-and-approval presentation (§2, "Developer Review and Approval of an Atomic All-Targets Upgrade"). PERF is addressed by `cpt-frontx-cli-nfr-template-scale` (§6, Acceptance Criteria).

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Triggers the upgrade, reviews the computed transition, approves or declines it, and may later request restore |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-atomic-all-targets-upgrade`, `cpt-frontx-adr-single-project-state-file`, `cpt-frontx-adr-template-registration-and-origin-pinning`, `cpt-frontx-adr-uniform-cli-json-envelope`
- **Dependencies**:
  - `cpt-frontx-feature-composed-provenance` — owns the single project state document; this engine reads the name's `{origin, version, targets[]}` entry as its baseline and commits the post-upgrade `origin`/`version` back into it, but does not redefine the document or the contract.
  - `cpt-frontx-feature-template-resolution` — resolves the new origin through the same shared resolver every other lifecycle command uses.
  - `cpt-frontx-feature-cli-scaffolding` (F12 — the engine applies a transition within each target's effective ownership, reusing the Conflict Checker's canonicalized geometry rather than redefining it; also owns the CLI-owned AI-extension bundle step (`cpt-frontx-algo-cli-scaffolding-ai-bundle`) this engine invokes to refresh a name's `.frontx/ai/<manifest-name>/` bundle on a committed upgrade, without redefining that step).

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-upgrade-applied-template`

### Developer Review and Approval of an Atomic All-Targets Upgrade

- [ ] `p1` - **ID**: `cpt-frontx-flow-upgrade-changeset-review-approval`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-cli-seq-upgrade-review-apply`

**Success Scenarios**:
- Developer approves the validated transition; the engine commits the new `origin`/`version` atomically across every target of the name and applies the change within each target's effective ownership.

**Error Scenarios**:
- The name has no entry in the project state store: `TEMPLATE_NOT_REGISTERED`.
- The name's `targets` array is empty: the engine refuses with `TARGET_NOT_APPLIED`, directing the developer to `register --replace` instead — there is no applied ground for `upgrade` to reconcile.
- The name's recorded `version` no longer matches what its recorded `origin` reports: the engine refuses with `VERSION_MISMATCH` before resolving the candidate origin, because the baseline it would diff against is not the state the project actually holds.
- The new origin cannot be resolved: `ORIGIN_UNAVAILABLE`; the engine reports the failure and aborts before writing anything.
- The new origin's manifest declares a `name` different from the registered name being upgraded: the engine refuses with `REGISTRATION_CONFLICT`, naming both identities, and computes no transition — a registered name's identity comes from exactly one place, its own manifest, and `upgrade` must not silently re-key an entry to a different template.
- Validation fails for any one target under the name: the engine refuses the entire upgrade — never moving some targets and not others — and `templates[name]` is left unchanged for every target.
- Developer declines the presented transition: no project files are written and `templates[name]` is left unchanged.

**Steps**:
1. [ ] - `p1` - Developer invokes `upgrade <templateName> <new-origin>` - `inst-invoke-upgrade`
2. [ ] - `p1` - Engine reads `templates[templateName]` — its current `origin`, `version`, and `targets[]` — from the project state store (`cpt-frontx-feature-composed-provenance`) as its baseline - `inst-read-provenance`
3. [ ] - `p1` - **IF** `templateName` has no entry - `inst-if-not-registered`
   1. [ ] - `p1` - **RETURN** `TEMPLATE_NOT_REGISTERED`; no diff computed - `inst-abort-not-registered`
4. [ ] - `p1` - **IF** `targets` is empty - `inst-if-empty-targets`
   1. [ ] - `p1` - **RETURN** `TARGET_NOT_APPLIED` directing the developer to `register --replace`; no diff computed - `inst-abort-empty-targets`
5. [ ] - `p1` - Engine invokes the validation algorithm (`cpt-frontx-algo-upgrade-changeset-validate`) against `new-origin` and every target in `targets[]` - `inst-compute-diff`
6. [ ] - `p1` - **IF** the new origin cannot be resolved, declares a different identity, or fails validation for any one target - `inst-if-no-target`
   1. [ ] - `p1` - **RETURN** the corresponding failure (`ORIGIN_UNAVAILABLE`, `REGISTRATION_CONFLICT` for an identity mismatch, or a validation failure naming the failing target(s)); `templates[templateName]` unchanged for every target - `inst-abort-no-target`
7. [ ] - `p1` - Engine presents the validated transition — the current `{origin, version}` and the new `{origin, version}`, covering every target in `targets[]` — to the developer for review - `inst-present-changeset`
8. [ ] - `p1` - **IF** developer approves - `inst-if-approved`
   1. [ ] - `p1` - Engine invokes the commit algorithm (`cpt-frontx-algo-upgrade-changeset-commit`) - `inst-apply-changeset`
   2. [ ] - `p1` - **IF** the commit reports an application failure - `inst-if-commit-fail`
      1. [ ] - `p1` - **RETURN** the failure; every target and `templates[templateName]` unchanged - `inst-return-commit-fail`
   3. [ ] - `p1` - **RETURN** success: `templates[templateName].origin`/`.version` updated atomically for every target - `inst-return-success`
9. [ ] - `p1` - **ELSE** (developer declines) - `inst-else-declined`
   1. [ ] - `p1` - Engine makes no changes to any project file or to `templates[templateName]` - `inst-no-write-on-decline`
   2. [ ] - `p1` - **RETURN** declined - `inst-return-declined`

### Developer Restores a Template's Pre-Upgrade State

- [ ] `p1` - **ID**: `cpt-frontx-flow-upgrade-changeset-restore`

**Actor**: `cpt-frontx-actor-project-developer`

**Use cases**: `cpt-frontx-usecase-upgrade-applied-template` (postcondition)

**Success Scenarios**:
- Developer requests restore of a name's most recently applied upgrade; the engine reverses `templates[name].origin`/`.version` back to the pre-upgrade values, atomically across every target of the name, and reverses the applied content within each target's effective ownership back to its pre-upgrade state.

**Error Scenarios**:
- There is no applied upgrade available to restore for the name — none has been applied, or the retained pre-upgrade state a prior restore would consume is no longer available under whichever specific consumption rule the deferred restore-carrier mechanism settles (open question; §5 "Restore to Pre-Upgrade State", DESIGN §4): the engine refuses with `NOTHING_TO_RESTORE`.

**Steps**:
1. [ ] - `p1` - Developer requests restore for `templateName` - `inst-rst-invoke`
2. [ ] - `p1` - **IF** no applied upgrade is available to restore for `templateName` - `inst-rst-if-unavailable`
   1. [ ] - `p1` - **RETURN** `NOTHING_TO_RESTORE` - `inst-rst-return-unavailable`
3. [ ] - `p1` - **ELSE** - `inst-rst-else`
   1. [ ] - `p1` - Reverse `templates[templateName].origin` and `.version` to their pre-upgrade values, atomically across every target of the name — where those pre-upgrade values are retained, and for how long, is part of the same open question this feature does not resolve (§5 "Restore to Pre-Upgrade State", DESIGN §4): the project state document itself records only the name's *current* `origin`/`version`, not its history, and so is not, by itself, the state carrier this reversal needs (`cpt-frontx-adr-single-project-state-file`) - `inst-rst-reverse-state`
   2. [ ] - `p1` - Reverse the applied content within each target's effective ownership back to its pre-upgrade state — the concrete mechanism by which this reversal is carried out is not fixed by this feature (open question; see §5 "Restore to Pre-Upgrade State" and DESIGN §4) - `inst-rst-reverse-content`
   3. [ ] - `p1` - **RETURN** success: the name and every one of its targets are at the pre-upgrade state - `inst-rst-return-success`

## 3. Processes / Business Logic (CDSL)

### Validate a New Origin Against Every Target of a Name

- [ ] `p2` - **ID**: `cpt-frontx-algo-upgrade-changeset-validate`

**Input**: The registered name's current baseline `{origin, version, targets[]}`; a candidate `new-origin`.

**Output**: A validated transition `{ from: {origin, version}, to: {origin, version}, targets[] }` ready for review, or a failure naming why validation did not pass (`VERSION_MISMATCH` for a baseline the project state misreports, `ORIGIN_UNAVAILABLE` for an unresolvable origin, `REGISTRATION_CONFLICT` for a declared-identity mismatch, or a validation failure naming a target that fails validation).

**Steps**:
1. [ ] - `p1` - Confirm the recorded baseline is still honest before anything is computed from it: resolve the name's currently recorded `origin` and compare the version it reports against the `version` recorded beside it in the project state document - `inst-val-check-baseline`
2. [ ] - `p1` - **IF** the recorded `version` differs from the version the recorded origin now reports - `inst-val-if-baseline-drift`
   1. [ ] - `p1` - **RETURN** `VERSION_MISMATCH` naming the template name, its recorded version, and the version its recorded origin now reports; no transition is computed and no target is inspected, because a transition computed from a baseline the project state misreports would diff against a version this project never actually had. For a pinned remote origin this can only mean `.frontx/project.json` was hand-edited or corrupted, since an immutable pin re-fetches identically (`cpt-frontx-adr-template-registration-and-origin-pinning`); for a `path:` origin it is genuine drift in the local folder, which has no publication to pin against — the same two cases `cpt-frontx-feature-composed-provenance`'s `validate --project` distinguishes for this code - `inst-val-return-baseline-drift`
3. [ ] - `p1` - Resolve `new-origin` through the shared resolver (`cpt-frontx-feature-template-resolution`), installing and pinning it exactly as `register` would - `inst-val-resolve-new-origin`
4. [ ] - `p1` - **IF** resolution fails - `inst-val-if-resolve-fail`
   1. [ ] - `p1` - **RETURN** `ORIGIN_UNAVAILABLE` - `inst-val-return-unavailable`
5. [ ] - `p1` - Read the resolved manifest's declared `name` - `inst-val-read-name`
6. [ ] - `p1` - **IF** the resolved `name` differs from the registered name being upgraded - `inst-val-if-identity-mismatch`
   1. [ ] - `p1` - **RETURN** `REGISTRATION_CONFLICT` naming both identities; no target is inspected - `inst-val-return-identity-mismatch`
7. [ ] - `p1` - **FOR EACH** target in `targets[]` - `inst-val-foreach-target`
   1. [ ] - `p1` - Validate the resolved new origin against that target — the concrete per-target check this step performs (structural conformance, ownership-boundary consistency, or any file-level comparison) is intentionally left to the future decision `cpt-frontx-adr-atomic-all-targets-upgrade` reserves for changeset representation and diff mechanics (DESIGN §4); this algorithm's contract is only that every target must be inspected and that any one target's failure fails the whole check - `inst-val-check-target`
   2. [ ] - `p1` - **IF** the target fails validation - `inst-val-if-target-fails`
      1. [ ] - `p1` - **RETURN** `CONTENT_CONFLICT` naming every failing target; do not continue checking remaining targets is optional, but no partial pass is ever returned - `inst-val-return-target-fail`
8. [ ] - `p1` - **RETURN** the validated transition `{ from: {origin, version}, to: {origin: <resolved>, version: <resolved>}, targets[] }` - `inst-val-return-pass`

### Commit the Atomic All-Targets Transition

- [ ] `p2` - **ID**: `cpt-frontx-algo-upgrade-changeset-commit`

**Input**: An approved, validated transition (name, `targets[]`, `from {origin, version}`, `to {origin, version}`).

**Output**: `templates[name].origin`/`.version` updated to `to` atomically across every target; or, on an application failure, every target and the project state store left exactly as they were before the attempt.

**Steps**:
1. [ ] - `p1` - **TRY**: - `inst-com-try`
   1. [ ] - `p1` - Apply the transition within each target's effective ownership, atomically across every target listed for the name — every target moves together, or none do; the concrete file-level operation performed at each target is intentionally not fixed by this feature (`cpt-frontx-adr-atomic-all-targets-upgrade`, DESIGN §4) - `inst-com-apply-within-boundary`
2. [ ] - `p1` - **CATCH** an application error affecting any target - `inst-com-catch`
   1. [ ] - `p1` - Leave every target and `templates[name]` exactly as they were before the attempt; no partial commit - `inst-com-restore-on-error`
   2. [ ] - `p1` - **RETURN** `INTERNAL` naming the error; `templates[name]` unchanged - `inst-com-return-failure`
3. [ ] - `p1` - Commit `templates[name].origin` and `.version` to `to`'s values, as one atomic write to the project state store - `inst-com-commit-state`
4. [ ] - `p1` - The engine refreshes `name`'s CLI-owned AI-extension bundle at `.frontx/ai/<manifest-name>/` from the new payload's own `.frontx/ai/<manifest-name>/` convention folder, when present, through the same CLI-owned step `apply` and `delete` use (`cpt-frontx-algo-cli-scaffolding-ai-bundle`, `cpt-frontx-feature-cli-scaffolding`) - `inst-com-refresh-bundle`
5. [ ] - `p1` - **RETURN** success: transition applied and `templates[name]` updated for every target - `inst-com-return-success`

## 4. States (CDSL)

### Upgrade Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-upgrade-changeset-lifecycle`

**States**: BASELINE_READ, VALIDATED, REFUSED, PRESENTED, APPROVED, COMMITTED, DECLINED, RESTORED

**Initial State**: BASELINE_READ

**Transitions**:
1. [ ] - `p1` - **FROM** BASELINE_READ **TO** VALIDATED **WHEN** the new origin resolves, declares the same identity as the registered name, and validates against every target in `targets[]` - `inst-st-read-to-validated`
2. [ ] - `p1` - **FROM** BASELINE_READ **TO** REFUSED **WHEN** the name is not registered, its `targets[]` is empty, the new origin cannot be resolved, it declares a different identity, or validation fails for any one target; `templates[name]` is unchanged for every target - `inst-st-read-to-refused`
3. [ ] - `p1` - **FROM** VALIDATED **TO** PRESENTED **WHEN** the transition has been built and shown to the developer for review - `inst-st-validated-to-presented`
4. [ ] - `p1` - **FROM** PRESENTED **TO** APPROVED **WHEN** the developer grants explicit approval - `inst-st-presented-to-approved`
5. [ ] - `p1` - **FROM** PRESENTED **TO** DECLINED **WHEN** the developer declines the transition; nothing is written - `inst-st-presented-to-declined`
6. [ ] - `p1` - **FROM** APPROVED **TO** COMMITTED **WHEN** the engine applies the transition within every target's effective ownership and commits `origin`/`version` atomically for the name - `inst-st-approved-to-committed`
7. [ ] - `p1` - **FROM** COMMITTED **TO** RESTORED **WHEN** a subsequent restore reverses the commit back to the name's pre-upgrade `origin`/`version` across every target - `inst-st-committed-to-restored`

## 5. Definitions of Done

### Atomic All-Targets Validation and Review

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-computation`

The system **MUST** read a registered name's `{origin, version, targets[]}` entry from the project state store (`cpt-frontx-feature-composed-provenance`) as the sole baseline, refusing with `TEMPLATE_NOT_REGISTERED` when the name has no entry, with `TARGET_NOT_APPLIED` when its `targets[]` is empty, and with `VERSION_MISMATCH` when the recorded `version` no longer matches what the recorded `origin` reports — a baseline the project state misreports is not a baseline to diff from; resolve a candidate new origin through the shared resolver, confirm it declares the same manifest identity as the registered name, validate it against every target listed for the name, and present the validated transition to the developer before writing any project file; the system **MUST** refuse the entire upgrade — writing nothing and leaving every target's recorded `origin`/`version` unchanged — with `ORIGIN_UNAVAILABLE` when the origin cannot be resolved, with `REGISTRATION_CONFLICT` when it declares a different identity, or with a validation failure naming the target(s) when it fails validation for any one target (`target`).

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-review-approval`
- `cpt-frontx-algo-upgrade-changeset-validate`

**Constraints**: `cpt-frontx-constraint-cli-authoritative-change-set`

**Touches**:
- Component: `cpt-frontx-component-cli-change-set-engine`
- Entities: `ProjectProvenance`, `Template`

### Atomic All-Targets Commit

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-apply`

The system **MUST** commit an approved transition's `origin` and `version` to the project state store atomically across every target listed for the name — every target moves together, or none do — applying the transition within each target's effective ownership, and **MUST** leave every target and the project state store exactly as they were before the attempt when application fails for any target, with no partial commit. A successful commit **MUST** refresh the name's CLI-owned AI-extension bundle at `.frontx/ai/<manifest-name>/` from the new payload, through the same CLI-owned step `apply` and `delete` use (`cpt-frontx-algo-cli-scaffolding-ai-bundle`), never through the template's own ownership (`target`).

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-review-approval`
- `cpt-frontx-algo-upgrade-changeset-commit`

**Constraints**: `cpt-frontx-constraint-cli-non-destructive-upgrade`

**Touches**:
- Component: `cpt-frontx-component-cli-change-set-engine`
- Entities: `ProjectProvenance`

### Restore to Pre-Upgrade State

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-rollback`

The system **MUST** allow a developer to restore a registered name to its pre-upgrade `origin`/`version` and pre-upgrade applied content, atomically across every target of the name, after an approved upgrade has been committed (`cpt-frontx-fr-cli-upgrade-restore`), and **MUST** refuse with `NOTHING_TO_RESTORE` when no applied upgrade is available to restore for the name. The concrete mechanism — what state is retained to make this possible, for how long, and how each target's content is reversed at the file level — is an **open question** this feature does not resolve: `cpt-frontx-adr-atomic-all-targets-upgrade` deliberately leaves file-level changeset, diff, and reconciliation mechanics to a dedicated future decision (DESIGN §4), and this DoD fixes only the observable contract — restore is available after a committed upgrade and reverses the name and every one of its targets together — not the mechanism that delivers it.

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-restore`

**Constraints**: `cpt-frontx-constraint-cli-non-destructive-upgrade`

**Touches**:
- Entities: `ProjectProvenance`

### Single Authoritative Engine

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-single-engine`

The system **MUST** provide exactly one change-set engine, `cpt-frontx-component-cli-change-set-engine`; both direct CLI invocation and AI-driven orchestration (`cpt-frontx-feature-ai-upgrade-orchestration`) **MUST** drive this same engine — no second implementation is permitted.

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-review-approval`
- `cpt-frontx-algo-upgrade-changeset-commit`

**Constraints**: `cpt-frontx-constraint-cli-authoritative-change-set`

**Touches**:
- Component: `cpt-frontx-component-cli-change-set-engine`
- Entities: `ProjectProvenance`

## 6. Acceptance Criteria

- [ ] Invoking `upgrade <templateName> <new-origin>` for a registered name with at least one applied target produces a reviewable, validated transition covering every target under that name, and writes no project file until the developer approves.
- [ ] The baseline read for the upgrade is exactly `templates[templateName].{origin, version}` from the single project state document — no per-instance provenance record or per-file hash set is read or required to exist.
- [ ] Approving the transition commits `templates[templateName].origin`/`.version` atomically and applies the change within every target's effective ownership; declining leaves the repository and the project state store byte-for-byte unchanged.
- [ ] A validation failure on any one target under the name refuses the entire upgrade, leaving `templates[templateName]` unchanged for every target of that name — never a partial commit.
- [ ] `upgrade` against a name with no registered entry returns `TEMPLATE_NOT_REGISTERED`; against a name whose `targets` array is empty, the engine refuses with `TARGET_NOT_APPLIED` and directs the developer to `register --replace`.
- [ ] A registered name whose recorded `version` no longer matches what its recorded `origin` reports is refused with `VERSION_MISMATCH` before the candidate origin is resolved and before any target is validated, naming the recorded and the reported version.
- [ ] A new origin that fails to resolve returns `ORIGIN_UNAVAILABLE` before any target is validated.
- [ ] A new origin whose manifest declares an identity different from the registered name being upgraded is refused with `REGISTRATION_CONFLICT`, naming both identities, with no target validated and no transition computed.
- [ ] The reviewed transition equals the applied transition: the `origin`/`version` a developer approved is exactly what is committed to the project state store.
- [ ] A successful, committed upgrade refreshes the name's CLI-owned `.frontx/ai/<manifest-name>/` bundle from the new payload, when the payload carries one, through the same CLI-owned step `apply`/`delete` use — never through the template's own ownership.
- [ ] Both direct CLI invocation and AI-driven orchestration (`cpt-frontx-feature-ai-upgrade-orchestration`) drive the same change-set engine; no second upgrade implementation exists.
- [ ] A developer can request restore of a name's most recently committed upgrade and observe the name and every one of its targets return to the pre-upgrade `origin`/`version` and applied content; requesting restore when no applied upgrade is available for that name returns `NOTHING_TO_RESTORE`.
- [ ] This feature's DoD and CDSL make no claim about a file-level diff, three-way-merge, or per-file conflict-detection mechanism for either upgrade or restore — that mechanism is explicitly deferred to a future decision, consistent with `cpt-frontx-adr-atomic-all-targets-upgrade` and DESIGN §4.
- [ ] Every `RETURN`-level refusal in this feature's flows and algorithms names a code from the shared error-code vocabulary (`cpt-frontx-adr-uniform-cli-json-envelope`).
- [ ] `upgrade` satisfies `cpt-frontx-cli-nfr-template-scale`'s upgrade-preparation threshold: preparing a reviewable upgrade change set for one registered template in a project with at least 20 registered templates, without requiring any unrelated template to upgrade.
- [ ] `cfs --json validate --artifact packages/cli/architecture/features/upgrade-changeset/FEATURE.md --skip-code` returns PASS.
- [ ] `cfs --json validate-toc packages/cli/architecture/features/upgrade-changeset/FEATURE.md` returns PASS.
