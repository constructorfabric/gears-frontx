# Feature: Ecosystem Distribution & Versioning Policy


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Version-Policy CI Check](#version-policy-ci-check)
  - [Consumer Upgrade-on-Own-Schedule](#consumer-upgrade-on-own-schedule)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Matched Major/Minor Version-Policy Check](#matched-majorminor-version-policy-check)
  - [Deprecation-Cycle Gate](#deprecation-cycle-gate)
- [4. States (CDSL)](#4-states-cdsl)
  - [Artifact Release Lifecycle State Machine](#artifact-release-lifecycle-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Version-Policy CI Check Is Enforced at Publication](#version-policy-ci-check-is-enforced-at-publication)
  - [Deprecation Cycle Is Enforced Before Removal](#deprecation-cycle-is-enforced-before-removal)
  - [Consumer Upgrade Does Not Require Lockstep Updates](#consumer-upgrade-does-not-require-lockstep-updates)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-ecosystem-distribution`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-ecosystem-distribution`

### 1.1 Overview

This is a cross-cutting versioning and distribution policy with no single component. It establishes the matched-version, per-concern artifact distribution policy by which each FrontX artifact is independently published and versioned, with major and minor versions kept matched across the ecosystem while patch and pre-release may diverge, isolating breaking changes behind semantic versioning and a deprecation cycle so consumers can upgrade on their own schedule without facing an architectural ceiling.

### 1.2 Purpose

This feature exists to deliver a predictable, compatibility-bounded upgrade path across the FrontX ecosystem — one concern per artifact, versioned on its own cadence — so that a breaking change in one artifact does not compel consumers of unrelated artifacts to upgrade in lockstep, and so the ecosystem imposes no ceiling on the number of concerns it distributes.

**Requirements**: `cpt-frontx-fr-versioned-platform-evolution`, `cpt-frontx-fr-no-architectural-ceiling`, `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

**Principles**: `cpt-frontx-principle-per-concern-versioning`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| N/A | N/A |

Not applicable — there is no actor-facing usecase for this cross-cutting policy; the flows model a CI version-policy check plus a consumer upgrade-on-own-schedule path.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: None
- **Contract**: `cpt-frontx-contract-package-registry-distribution`

## 2. Actor Flows (CDSL)

Note: there is no actor-facing PRD usecase for this cross-cutting policy. The flows below model the version-policy CI check and the consumer upgrade-on-own-schedule path.

### Version-Policy CI Check

- [ ] `p1` - **ID**: `cpt-frontx-flow-ecosystem-distribution-version-policy-ci-check`

**Actor**: CI pipeline

**Success Scenarios**:
- All published artifacts have matched major/minor versions; artifact is cleared for publication.

**Error Scenarios**:
- Major or minor version mismatch detected across ecosystem artifacts; publication is blocked.

**Steps**:
1. [ ] - `p1` - CI pipeline triggers a version-policy check for the artifact scheduled for release - `inst-vpc-trigger`
2. [ ] - `p1` - Retrieve the candidate artifact's major and minor version from the release manifest - `inst-vpc-get-version`
3. [ ] - `p1` - Invoke the matched major/minor version-policy check algorithm against all sibling artifacts in the published ecosystem - `inst-vpc-invoke-check`
4. [ ] - `p1` - **IF** the version-policy check returns FAIL: - `inst-vpc-if-mismatch`
   1. [ ] - `p1` - Block the release and report the conflicting artifact names and their version numbers - `inst-vpc-block`
   2. [ ] - `p1` - **RETURN** FAIL with mismatch report - `inst-vpc-return-fail`
5. [ ] - `p1` - Confirm that the artifact's release lifecycle state is not REMOVED - `inst-vpc-check-state`
6. [ ] - `p1` - **RETURN** PASS; artifact is cleared for publication - `inst-vpc-return-pass`

### Consumer Upgrade-on-Own-Schedule

- [ ] `p1` - **ID**: `cpt-frontx-flow-ecosystem-distribution-consumer-upgrade`

**Actor**: Consuming project (CI pipeline or developer tooling)

**Success Scenarios**:
- Consumer adopts the new version of one artifact without upgrading unrelated artifacts; application installs and resolves dependencies correctly.

**Error Scenarios**:
- Consumer requests a REMOVED artifact; upgrade is blocked with a deprecation notice referencing the last supported version.

**Steps**:
1. [ ] - `p1` - Consuming project requests a version update for one specific FrontX artifact via the package registry - `inst-cu-request`
2. [ ] - `p1` - Resolve the requested artifact version against the package registry - `inst-cu-resolve`
3. [ ] - `p1` - **IF** the requested artifact has lifecycle state REMOVED: - `inst-cu-if-removed`
   1. [ ] - `p1` - Return a deprecation notice referencing the last published version before removal - `inst-cu-deprecation-notice`
   2. [ ] - `p1` - **RETURN** FAIL — artifact is no longer available - `inst-cu-return-removed`
4. [ ] - `p1` - **IF** the requested artifact has lifecycle state DEPRECATED: - `inst-cu-if-deprecated`
   1. [ ] - `p1` - Emit a deprecation warning with the announced end-of-life schedule (target) - `inst-cu-warn-deprecated`
5. [ ] - `p1` - Verify that no other FrontX artifact in the consuming project's dependency set has a conflicting major or minor version with the requested artifact - `inst-cu-check-compat`
6. [ ] - `p1` - **IF** a major or minor version conflict is detected: - `inst-cu-if-conflict`
   1. [ ] - `p1` - Report which existing dependency conflicts and the conflicting version range - `inst-cu-report-conflict`
   2. [ ] - `p1` - **RETURN** FAIL with conflict report - `inst-cu-return-conflict`
7. [ ] - `p1` - Install the requested artifact version without requiring updates to any other FrontX artifact - `inst-cu-install`
8. [ ] - `p1` - **RETURN** PASS — consumer has adopted the new version on their own schedule - `inst-cu-return-pass`

## 3. Processes / Business Logic (CDSL)

### Matched Major/Minor Version-Policy Check

- [ ] `p1` - **ID**: `cpt-frontx-algo-ecosystem-distribution-version-policy-check`

**Input**: Candidate artifact name and its candidate major/minor version being evaluated for release or adoption.

**Output**: PASS if all sibling artifacts have a matching major/minor version; FAIL with the list of conflicting artifact names and their current versions otherwise.

**Steps**:
1. [ ] - `p1` - Retrieve the published major and minor versions for all sibling artifacts in the ecosystem from the package registry - `inst-vpa-retrieve`
2. [ ] - `p1` - Extract the major version and minor version from the candidate artifact's version string - `inst-vpa-extract`
3. [ ] - `p1` - **FOR EACH** sibling artifact in the published set: - `inst-vpa-foreach`
   1. [ ] - `p1` - Compare the sibling's major version against the candidate's major version - `inst-vpa-cmp-major`
   2. [ ] - `p1` - **IF** the major versions differ: - `inst-vpa-if-major`
      1. [ ] - `p1` - Record the sibling as a mismatch, noting its name, its current version, and the candidate's version - `inst-vpa-record-major`
   3. [ ] - `p1` - Compare the sibling's minor version against the candidate's minor version - `inst-vpa-cmp-minor`
   4. [ ] - `p1` - **IF** the minor versions differ: - `inst-vpa-if-minor`
      1. [ ] - `p1` - Record the sibling as a mismatch, noting its name, its current version, and the candidate's version - `inst-vpa-record-minor`
4. [ ] - `p1` - **IF** any mismatches were recorded: - `inst-vpa-if-fail`
   1. [ ] - `p1` - **RETURN** FAIL with the complete list of conflicting artifact names and version strings - `inst-vpa-return-fail`
5. [ ] - `p1` - **RETURN** PASS — candidate artifact's major and minor version matches all sibling artifacts - `inst-vpa-return-pass`

### Deprecation-Cycle Gate

- [ ] `p2` - **ID**: `cpt-frontx-algo-ecosystem-distribution-deprecation-gate`

**Input**: Artifact name and its current release lifecycle state.

**Output**: PASS if the deprecation-cycle requirements are satisfied and the artifact may transition to REMOVED; FAIL with the unsatisfied gate condition otherwise.

**Steps**:
1. [ ] - `p2` - Load the artifact's deprecation record, including the date it entered DEPRECATED state and the contents of its published deprecation notice (target) - `inst-dep-load`
2. [ ] - `p2` - Verify that a deprecation notice was published to the package registry changelog before or at the point the artifact entered DEPRECATED state - `inst-dep-verify-notice`
3. [ ] - `p2` - **IF** the deprecation notice is absent: - `inst-dep-if-no-notice`
   1. [ ] - `p2` - **RETURN** FAIL — deprecation-cycle gate not satisfied; a published notice is required before removal - `inst-dep-return-no-notice`
4. [ ] - `p2` - Verify that the minimum deprecation window has elapsed since the artifact entered DEPRECATED state (target — window duration to be specified by release policy) - `inst-dep-verify-window`
5. [ ] - `p2` - **IF** the minimum deprecation window has not elapsed: - `inst-dep-if-window`
   1. [ ] - `p2` - **RETURN** FAIL — deprecation-cycle gate not satisfied; the minimum window has not elapsed - `inst-dep-return-window`
6. [ ] - `p2` - **RETURN** PASS — deprecation-cycle gate satisfied; artifact may transition to REMOVED - `inst-dep-return-pass`

## 4. States (CDSL)

### Artifact Release Lifecycle State Machine

- [ ] `p1` - **ID**: `cpt-frontx-state-ecosystem-distribution-artifact-lifecycle`

**States**: DRAFT, PUBLISHED, DEPRECATED, REMOVED

**Initial State**: DRAFT

**Transitions**:
1. [ ] - `p1` - **FROM** DRAFT **TO** PUBLISHED **WHEN** the artifact passes the matched major/minor version-policy CI check and is successfully pushed to the package registry (target) - `inst-al-draft-to-published`
2. [ ] - `p1` - **FROM** PUBLISHED **TO** DEPRECATED **WHEN** a deprecation notice is published to the changelog announcing the artifact's scheduled end-of-life (target) - `inst-al-published-to-deprecated`
3. [ ] - `p1` - **FROM** DEPRECATED **TO** REMOVED **WHEN** the deprecation-cycle gate is satisfied — notice published and minimum deprecation window elapsed (target) - `inst-al-deprecated-to-removed`

## 5. Definitions of Done

### Version-Policy CI Check Is Enforced at Publication

- [ ] `p1` - **ID**: `cpt-frontx-dod-ecosystem-distribution-version-policy-enforced`

The system MUST enforce the matched major/minor version-policy check as an automated CI gate that blocks publication of any artifact whose candidate major or minor version does not match the rest of the published ecosystem.

**Implements**:
- `cpt-frontx-flow-ecosystem-distribution-version-policy-ci-check`
- `cpt-frontx-algo-ecosystem-distribution-version-policy-check`

**Constraints**: None applicable — no DESIGN constraint bounds the internal CI tooling selection for this gate.

**Touches**:
- Package registry (npm-compatible) — artifact publication gate
- CI pipeline — version-policy check step
- `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

### Deprecation Cycle Is Enforced Before Removal

- [ ] `p1` - **ID**: `cpt-frontx-dod-ecosystem-distribution-deprecation-cycle-enforced`

The system MUST require that an artifact satisfy the deprecation-cycle gate — a published deprecation notice and an elapsed minimum deprecation window — before its lifecycle state may transition to REMOVED, ensuring consumers have advance notice and adequate time to migrate.

**Implements**:
- `cpt-frontx-algo-ecosystem-distribution-deprecation-gate`
- `cpt-frontx-state-ecosystem-distribution-artifact-lifecycle`

**Constraints**: None applicable.

**Touches**:
- Package registry changelog — deprecation notice publication
- Artifact release lifecycle state machine
- `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

### Consumer Upgrade Does Not Require Lockstep Updates

- [ ] `p1` - **ID**: `cpt-frontx-dod-ecosystem-distribution-independent-upgrade`

The system MUST allow a consuming project to adopt a new version of exactly one FrontX artifact without being required to simultaneously upgrade any other FrontX artifact, so long as the version-policy check passes for the adopted artifact.

**Implements**:
- `cpt-frontx-flow-ecosystem-distribution-consumer-upgrade`
- `cpt-frontx-algo-ecosystem-distribution-version-policy-check`

**Constraints**: None applicable.

**Touches**:
- Package registry distribution channels (npm + GitHub source)
- `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

## 6. Acceptance Criteria

- [ ] The matched major/minor version-policy CI check blocks publication when any sibling artifact has a differing major or minor version.
- [ ] An artifact in DEPRECATED state cannot transition to REMOVED until a deprecation notice has been published and the minimum deprecation window has elapsed.
- [ ] A consuming project can adopt a new patch or pre-release version of one FrontX artifact without changing any other FrontX artifact's version.
- [ ] A consuming project can adopt a new minor version of one FrontX artifact when the matched minor version-policy check passes.
- [ ] The artifact release lifecycle follows the DRAFT → PUBLISHED → DEPRECATED → REMOVED sequence; no transition skips a state.
- [ ] No architectural ceiling is imposed: adding or retiring an artifact requires no version amendment to any other artifact.
