# Feature: Upgrade Change-Set Engine


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Developer Review and Approval of an Upgrade Change Set](#developer-review-and-approval-of-an-upgrade-change-set)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Compute Template-Version Diff Against Provenance Baseline](#compute-template-version-diff-against-provenance-baseline)
  - [Apply Change Set Non-Destructively; Support Rollback; Update Provenance](#apply-change-set-non-destructively-support-rollback-update-provenance)
  - [Rollback an Applied Change Set](#rollback-an-applied-change-set)
- [4. States (CDSL)](#4-states-cdsl)
  - [Change-Set Lifecycle](#change-set-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Change-Set Computation and Presentation](#change-set-computation-and-presentation)
  - [Non-Destructive Application and Provenance Update](#non-destructive-application-and-provenance-update)
  - [Rollback to Pre-Upgrade State](#rollback-to-pre-upgrade-state)
  - [Single Authoritative Engine](#single-authoritative-engine)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-upgrade-changeset`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-upgrade-changeset`

### 1.1 Overview

The Upgrade Change-Set Engine is the single `target` CLI-owned mechanism (`cpt-frontx-component-cli`) that computes a diff between a project's current template version and a target version, presents it as a reviewable and approvable change set, applies it non-destructively on approval, and supports rollback to the pre-upgrade project state.

### 1.2 Purpose

This feature exists to let a project developer safely adopt newer template versions without hand-editing files or risking unreviewed changes. It satisfies the requirement that upgrades are expressed as approvable change sets (`cpt-frontx-fr-cli-project-upgrade-changeset`) and that no modification reaches project files until the developer grants explicit approval (`cpt-frontx-fr-cli-upgrade-review-approval`). The engine is reusable across invokers — direct CLI and AI orchestration (F17) both drive the same engine without a second implementation.

**Requirements**: `cpt-frontx-fr-cli-project-upgrade-changeset`, `cpt-frontx-fr-cli-upgrade-review-approval`

**Principles**: —

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Triggers the upgrade, reviews the computed change set, and approves or declines it |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: `cpt-frontx-feature-composed-provenance` (F13) — owns `ProjectProvenance` and `cpt-frontx-contract-project-provenance`; this engine reads the provenance baseline written at scaffold time but does not redefine the entity or the contract.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-ai-driven-template-upgrade`

### Developer Review and Approval of an Upgrade Change Set

- [ ] `p1` - **ID**: `cpt-frontx-flow-upgrade-changeset-review-approval`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer approves the change set; engine applies it non-destructively and updates provenance to the newer version.

**Error Scenarios**:
- Developer declines the change set; no project files are written and the project remains at its current version.
- Target template version cannot be resolved; the engine reports the failure and aborts before any file is written.
- Change set contains conflicts with developer modifications; engine surfaces them in the presented change set for manual resolution before approval.

**Steps**:
1. [ ] - `p1` - Developer invokes the upgrade command, providing the target template version or requesting the latest available version - `inst-invoke-upgrade`
2. [ ] - `p1` - Engine reads the project provenance baseline via `cpt-frontx-contract-project-provenance` to determine the originating template and current version - `inst-read-provenance`
3. [ ] - `p1` - **IF** the target version cannot be resolved: - `inst-if-no-target`
   1. [ ] - `p1` - Engine reports the resolution failure and **RETURN** without writing any files - `inst-abort-no-target`
4. [ ] - `p1` - Engine computes the template-version diff against the provenance baseline (see `cpt-frontx-algo-upgrade-changeset-compute`) - `inst-compute-diff`
5. [ ] - `p1` - Engine presents the change set to the developer for review, including any flagged conflicts - `inst-present-changeset`
6. [ ] - `p1` - **IF** developer approves the change set: - `inst-if-approved`
   1. [ ] - `p1` - Engine applies the change set non-destructively (see `cpt-frontx-algo-upgrade-changeset-apply`) - `inst-apply-changeset`
   2. [ ] - `p1` - Engine updates the project provenance to the newer template version - `inst-update-provenance`
   3. [ ] - `p1` - **RETURN** success: change set applied and provenance updated - `inst-return-success`
7. [ ] - `p1` - **ELSE** (developer declines): - `inst-else-declined`
   1. [ ] - `p1` - Engine makes no changes to project files - `inst-no-write-on-decline`
   2. [ ] - `p1` - **RETURN** declined: project remains at current version, no files written - `inst-return-declined`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. Reusable building blocks called by Actor Flows or other processes.

### Compute Template-Version Diff Against Provenance Baseline

- [ ] `p2` - **ID**: `cpt-frontx-algo-upgrade-changeset-compute`

**Input**: Project root path; target template version reference.

**Output**: A change set describing the diff between the provenance-recorded baseline version and the target version (added, modified, and removed files; flagged conflicts).

**Steps**:
1. [ ] - `p1` - Read `target` the project provenance record from the project root via `cpt-frontx-contract-project-provenance`; extract the originating template identity and current version - `inst-cmp-read-provenance`
2. [ ] - `p1` - Resolve `target` the template at the baseline version from the local inventory - `inst-cmp-resolve-baseline`
3. [ ] - `p1` - Resolve `target` the template at the target version from the local inventory - `inst-cmp-resolve-target`
4. [ ] - `p1` - Compute the file-level diff between the baseline-version template files and the target-version template files - `inst-cmp-diff-files`
5. [ ] - `p1` - **FOR EACH** changed file in the diff: - `inst-cmp-for-each-file`
   1. [ ] - `p1` - Check whether the developer has locally modified the file in the project - `inst-cmp-check-local-mod`
   2. [ ] - `p1` - **IF** both the template diff and a local developer modification affect the same file: - `inst-cmp-if-conflict`
      1. [ ] - `p1` - Mark the file as a conflict in the change set, recording both the template-level change and the local modification - `inst-cmp-flag-conflict`
   3. [ ] - `p1` - **ELSE**: - `inst-cmp-else-clean`
      1. [ ] - `p1` - Add the file as a clean change-set entry (add / modify / remove) - `inst-cmp-add-clean-entry`
6. [ ] - `p1` - Assemble and **RETURN** the computed change set (clean entries + flagged conflicts) - `inst-cmp-return-changeset`

### Apply Change Set Non-Destructively; Support Rollback; Update Provenance

- [ ] `p2` - **ID**: `cpt-frontx-algo-upgrade-changeset-apply`

**Input**: Approved change set; project root path.

**Output**: Applied project state with provenance updated; rollback capability retained until explicitly released.

**Steps**:
1. [ ] - `p1` - Capture `target` a pre-upgrade snapshot of all files affected by the change set so rollback can restore exact pre-upgrade state - `inst-app-snapshot`
2. [ ] - `p1` - **TRY**: - `inst-app-try`
   1. [ ] - `p1` - **FOR EACH** clean entry in the change set, in dependency order: - `inst-app-for-each-entry`
      1. [ ] - `p1` - Apply the entry (write added or modified file content; remove removed files) to the project root - `inst-app-apply-entry`
3. [ ] - `p1` - **CATCH** application error: - `inst-app-catch`
   1. [ ] - `p1` - Restore `target` all affected files from the pre-upgrade snapshot, leaving the project byte-for-byte unchanged - `inst-app-restore-on-error`
   2. [ ] - `p1` - Report the error and **RETURN** failure without updating provenance - `inst-app-return-failure`
4. [ ] - `p1` - Update `target` the project provenance record to the newer template version - `inst-app-update-prov`
5. [ ] - `p1` - Retain `target` the pre-upgrade snapshot for rollback until the developer explicitly releases it or a new upgrade cycle begins - `inst-app-retain-snapshot`
6. [ ] - `p1` - **RETURN** success: applied entries, updated provenance, rollback available - `inst-app-return-success`

### Rollback an Applied Change Set

- [ ] `p2` - **ID**: `cpt-frontx-algo-upgrade-changeset-rollback`

**Input**: Project root path; retained pre-upgrade snapshot.

**Output**: Project files and provenance restored to exact pre-upgrade state.

**Steps**:
1. [ ] - `p1` - **IF** no retained pre-upgrade snapshot exists for the project: - `inst-rb-if-no-snapshot`
   1. [ ] - `p1` - Report that rollback is not available and **RETURN** failure - `inst-rb-no-snapshot`
2. [ ] - `p1` - **FOR EACH** file in the pre-upgrade snapshot: - `inst-rb-for-each`
   1. [ ] - `p1` - Restore the file from the snapshot, overwriting the post-apply state - `inst-rb-restore-file`
3. [ ] - `p1` - Restore `target` the provenance record to the pre-upgrade version from the snapshot - `inst-rb-restore-provenance`
4. [ ] - `p1` - Release the snapshot - `inst-rb-release-snapshot`
5. [ ] - `p1` - **RETURN** success: project and provenance at exact pre-upgrade state - `inst-rb-return-success`

## 4. States (CDSL)

### Change-Set Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-upgrade-changeset-lifecycle`

**States**: COMPUTED, PRESENTED, APPROVED, APPLIED, ROLLED_BACK, REJECTED

**Initial State**: COMPUTED

**Transitions**:
1. [ ] - `p1` - **FROM** COMPUTED **TO** PRESENTED **WHEN** the change set has been built and shown to the developer for review - `inst-st-computed-to-presented`
2. [ ] - `p1` - **FROM** PRESENTED **TO** APPROVED **WHEN** the developer grants explicit approval - `inst-st-presented-to-approved`
3. [ ] - `p1` - **FROM** PRESENTED **TO** REJECTED **WHEN** the developer declines the change set - `inst-st-presented-to-rejected`
4. [ ] - `p1` - **FROM** APPROVED **TO** APPLIED **WHEN** the engine has applied all change-set entries non-destructively and updated provenance - `inst-st-approved-to-applied`
5. [ ] - `p1` - **FROM** APPLIED **TO** ROLLED_BACK **WHEN** the developer requests rollback and the engine restores the pre-upgrade snapshot - `inst-st-applied-to-rolledback`

## 5. Definitions of Done

### Change-Set Computation and Presentation

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-computation`

The system **MUST** compute a reviewable change set by diffing the target template version against the provenance baseline and presenting it to the developer before writing any project file; no project file may be created, modified, or deleted until the developer explicitly approves.

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-review-approval`
- `cpt-frontx-algo-upgrade-changeset-compute`

**Touches**:
- Entities: `ProjectProvenance`

### Non-Destructive Application and Provenance Update

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-apply`

The system **MUST** apply the approved change set non-destructively by writing only the approved entries to the project, retain a pre-upgrade snapshot for rollback, and update the project provenance to the newer template version upon successful application.

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-review-approval`
- `cpt-frontx-algo-upgrade-changeset-apply`

**Touches**:
- Entities: `ProjectProvenance`

### Rollback to Pre-Upgrade State

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-rollback`

The system **MUST** support rollback of an applied change set by restoring all affected project files and the provenance record to their exact pre-upgrade state from the retained snapshot.

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-review-approval`
- `cpt-frontx-algo-upgrade-changeset-rollback`

**Touches**:
- Entities: `ProjectProvenance`

### Single Authoritative Engine

- [ ] `p1` - **ID**: `cpt-frontx-dod-upgrade-changeset-single-engine`

The system **MUST** provide exactly one change-set engine in `cpt-frontx-component-cli`; both direct CLI invocation and AI-driven orchestration (`cpt-frontx-feature-ai-upgrade-orchestration`, F17) **MUST** drive this same engine — no second implementation is permitted.

**Implements**:
- `cpt-frontx-flow-upgrade-changeset-review-approval`
- `cpt-frontx-algo-upgrade-changeset-apply`

**Touches**:
- Entities: `ProjectProvenance`

## 6. Acceptance Criteria

- [ ] Invoking the upgrade command with an available newer template version produces a reviewable change set and writes no project files until the developer approves.
- [ ] Approving the change set writes only the approved entries and updates the project provenance record to the newer template version.
- [ ] Declining the change set leaves the project byte-for-byte unchanged, with no file created, modified, or deleted.
- [ ] Applying a change set and then rolling it back restores the exact pre-upgrade project state, including the provenance record.
- [ ] Both direct CLI invocation and AI-driven orchestration (F17) drive the same change-set engine; no second diff-and-apply implementation exists.
- [ ] A target version that cannot be resolved causes the engine to report the failure and abort before writing any project file.
