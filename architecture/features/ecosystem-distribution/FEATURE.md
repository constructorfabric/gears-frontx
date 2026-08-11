# Feature: Ecosystem Distribution & Versioning Policy


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Independent Per-Concern Publication](#independent-per-concern-publication)
  - [Consumer Independent Upgrade](#consumer-independent-upgrade)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Coupled-Edge Compatibility Check](#coupled-edge-compatibility-check)
  - [Registry-Side Deprecation Cycle](#registry-side-deprecation-cycle)
- [4. States (CDSL)](#4-states-cdsl)
  - [Registry Version Availability State Machine](#registry-version-availability-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Each Artifact Publishes on Its Own Semver Line](#each-artifact-publishes-on-its-own-semver-line)
  - [Coupled-Edge Compatibility Is Range-Based, Not Pinned](#coupled-edge-compatibility-is-range-based-not-pinned)
  - [Deprecation Cycle Is Enforced Registry-Side Before Removal](#deprecation-cycle-is-enforced-registry-side-before-removal)
  - [Consumer Upgrade Does Not Require Lockstep Updates](#consumer-upgrade-does-not-require-lockstep-updates)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-ecosystem-distribution`
## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-ecosystem-distribution`

### 1.1 Overview

This is a cross-cutting versioning and distribution policy with no single component. It establishes per-concern **independent** versioning: each FrontX artifact is published and versioned on its own semver line and cadence, a breaking change increments only that artifact's own major version, and the single compile-time coupling edge (`@gears-frontx/mfes → @gears-frontx/gts-plugin`) is bounded by a satisfiable semver range rather than a matched version number. Deprecation and removal are registry-side operations (npm deprecate plus a minimum window) — there is no in-package lifecycle-state field.

### 1.2 Purpose

This feature exists to deliver a predictable, compatibility-bounded upgrade path across the FrontX ecosystem — one concern per artifact, versioned on its own cadence — so that a breaking change in one artifact does not compel consumers of unrelated artifacts to upgrade in lockstep, and so the ecosystem imposes no ceiling on the number of concerns it distributes. Cross-artifact skew is solved by semver ranges on the one coupled edge, not by lockstep or a matched version number.

**Requirements**: `cpt-frontx-fr-versioned-platform-evolution`, `cpt-frontx-fr-no-architectural-ceiling`, `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

**Principles**: `cpt-frontx-principle-per-concern-versioning`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| N/A | N/A |

Not applicable — there is no actor-facing usecase for this cross-cutting policy; the flows model an independent per-concern publication path plus a consumer independent-upgrade path.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Component**: `cpt-frontx-component-ecosystem-version-policy` — this feature is that component's concrete spec: the version-policy check (`scripts/ecosystem-version-policy.mjs`) and the release conventions it asserts
- **Dependencies**: None
- **Contract**: `cpt-frontx-contract-package-registry-distribution`

## 2. Actor Flows (CDSL)

Note: there is no actor-facing PRD usecase for this cross-cutting policy. The flows below model the independent per-concern publication path and the consumer independent-upgrade path. They trace to the per-concern independent versioning mechanism described in DESIGN (`cpt-frontx-principle-per-concern-versioning`, DESIGN §"Per-concern independent versioning"; ecosystem overview, DESIGN §"Ecosystem"; `cpt-frontx-nfr-evolvability` verification).

### Independent Per-Concern Publication

- [x] `p1` - **ID**: `cpt-frontx-flow-ecosystem-distribution-independent-publication`

**Actor**: Release pipeline

**Success Scenarios**:
- The artifact is published on its own semver line; a breaking change increments only that artifact's own major version, requiring no sibling artifact version change. (DESIGN: "a breaking change bumps only that artifact's own major version, and no single artifact's release pace constrains another's".)

**Error Scenarios**:
- The artifact is `@gears-frontx/mfes` and its declared dependency on `@gears-frontx/gts-plugin` is an exact pin or an unsatisfiable range; publication is blocked. (DESIGN: the coupled edge is "bounded by a satisfiable semver range rather than a matched version number".)

**Steps**:
1. [x] - `p1` - Release pipeline triggers publication for a single artifact on its own semver line - `inst-pub-trigger`
2. [x] - `p1` - Determine the change class (major / minor / patch) for this artifact independently of any sibling artifact's version - `inst-pub-classify`
3. [x] - `p1` - **IF** the artifact is `@gears-frontx/mfes` (the consumer side of the one coupled edge): - `inst-pub-if-mfes`
   1. [x] - `p1` - Invoke the coupled-edge compatibility check against its declared range on `@gears-frontx/gts-plugin` - `inst-pub-invoke-edge-check`
   2. [x] - `p1` - **IF** the compatibility check returns FAIL: - `inst-pub-if-edge-fail`
      1. [x] - `p1` - Block publication and report the offending range (exact-pinned or unsatisfiable) - `inst-pub-block`
      2. [x] - `p1` - **RETURN** FAIL with the range report - `inst-pub-return-fail`
4. [x] - `p1` - Publish the artifact to the package registry on its own version line without requiring any sibling artifact's version to change - `inst-pub-publish`
5. [x] - `p1` - **RETURN** PASS; artifact is published independently - `inst-pub-return-pass`

### Consumer Independent Upgrade

- [x] `p1` - **ID**: `cpt-frontx-flow-ecosystem-distribution-consumer-upgrade`

**Actor**: Consuming project (CI pipeline or developer tooling)

**Success Scenarios**:
- Consumer adopts the new version of one artifact without upgrading unrelated artifacts; the application installs and resolves dependencies correctly. (DESIGN: "Consuming applications adopt new versions on their own schedule rather than in lockstep".)

**Error Scenarios**:
- Consumer requests a version the registry reports as deprecated; the install surfaces the registry deprecation warning and the recommended supported version. (DESIGN: "a registry-side deprecation cycle (a published notice and a minimum window elapse before any removal)".)

**Steps**:
1. [x] - `p1` - Consuming project requests a version update for one specific FrontX artifact via the package registry - `inst-cu-request`
2. [x] - `p1` - Resolve the requested artifact version against the package registry - `inst-cu-resolve`
3. [x] - `p1` - **IF** the registry reports the requested version as deprecated (an `npm deprecate` notice is present): - `inst-cu-if-deprecated`
   1. [x] - `p1` - Surface the registry deprecation warning, including the notice's publish date and the recommended supported version - `inst-cu-warn-deprecated`
4. [x] - `p1` - **IF** the requested artifact is `@gears-frontx/mfes` or `@gears-frontx/gts-plugin` (the one coupled edge): - `inst-cu-if-coupled`
   1. [x] - `p1` - Verify the resolved `mfes` version's declared peer range on `gts-plugin` is satisfied by the `gts-plugin` version present in the project - `inst-cu-check-edge`
   2. [x] - `p1` - **IF** the peer range is not satisfied: - `inst-cu-if-edge-conflict`
      1. [x] - `p1` - Report the unsatisfied peer range and the `gts-plugin` version present - `inst-cu-report-conflict`
      2. [x] - `p1` - **RETURN** FAIL with the peer-range conflict report - `inst-cu-return-conflict`
5. [x] - `p1` - Install the requested artifact version without requiring updates to any other FrontX artifact - `inst-cu-install`
6. [x] - `p1` - **RETURN** PASS — consumer has adopted the new version on their own schedule - `inst-cu-return-pass`

## 3. Processes / Business Logic (CDSL)

### Coupled-Edge Compatibility Check

- [x] `p1` - **ID**: `cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check`

Traces to DESIGN `cpt-frontx-nfr-evolvability` verification: "a compatibility check asserting the `mfes → gts-plugin` range is satisfiable and not exact-pinned (no duplicate-runtime skew)", and to the principle's statement that `mfes` "declares a satisfiable semver range (peer/caret) on `gts-plugin`, so version skew is resolved by ranges rather than lockstep".

**Input**: The version range `@gears-frontx/mfes` declares on its `@gears-frontx/gts-plugin` peer dependency, and the set of `gts-plugin` versions published on the registry.

**Output**: PASS if the declared range is a satisfiable, non-exact semver range; FAIL with the reason otherwise.

**Steps**:
1. [x] - `p1` - Read the peer-dependency range `mfes` declares on `gts-plugin` from the release manifest - `inst-edge-read-range`
2. [x] - `p1` - **IF** the declared range is an exact pin (a single version with no range operator): - `inst-edge-if-pinned`
   1. [x] - `p1` - **RETURN** FAIL — an exact pin forces duplicate-runtime skew; a caret/range is required - `inst-edge-return-pinned`
3. [x] - `p1` - Resolve the declared range against the `gts-plugin` versions published on the registry - `inst-edge-resolve`
4. [x] - `p1` - **IF** no published `gts-plugin` version satisfies the declared range: - `inst-edge-if-unsat`
   1. [x] - `p1` - **RETURN** FAIL — the declared range is unsatisfiable against published `gts-plugin` versions - `inst-edge-return-unsat`
5. [x] - `p1` - **RETURN** PASS — the declared range is satisfiable and not exact-pinned - `inst-edge-return-pass`

### Registry-Side Deprecation Cycle

- [x] `p2` - **ID**: `cpt-frontx-algo-ecosystem-distribution-deprecation-gate`

Traces to DESIGN `cpt-frontx-nfr-evolvability` verification and the principle: "a registry-side deprecation cycle (published notice + minimum window) before any removal". There is no in-package lifecycle-state field; the cycle is realized entirely through registry metadata.

**Input**: The artifact version proposed for removal, and its registry deprecation metadata.

**Output**: PASS if the registry-side deprecation cycle is satisfied and the version may be removed; FAIL with the unsatisfied condition otherwise.

**Steps**:
1. [x] - `p2` - Read the version's registry deprecation metadata: the `npm deprecate` notice and the date it was applied - `inst-dep-read`
2. [x] - `p2` - **IF** no deprecation notice is present on the registry for the version: - `inst-dep-if-no-notice`
   1. [x] - `p2` - **RETURN** FAIL — a published `npm deprecate` notice is required before removal - `inst-dep-return-no-notice`
3. [x] - `p2` - Compute the elapsed time since the deprecation notice was applied - `inst-dep-elapsed`
4. [x] - `p2` - **IF** the minimum deprecation window (defined by release policy) has not elapsed: - `inst-dep-if-window`
   1. [x] - `p2` - **RETURN** FAIL — the minimum deprecation window has not elapsed - `inst-dep-return-window`
5. [x] - `p2` - **RETURN** PASS — registry-side deprecation cycle satisfied; the version may be removed - `inst-dep-return-pass`

## 4. States (CDSL)

### Registry Version Availability State Machine

- [x] `p2` - **ID**: `cpt-frontx-state-ecosystem-distribution-registry-version-availability`

This state machine models the availability of a single published artifact **version** as recorded on the package registry (dist-tags plus `npm deprecate` metadata). It is registry-side and descriptive — there is NO in-package lifecycle-state field. It traces to DESIGN's registry-side deprecation cycle: `cpt-frontx-nfr-evolvability` verification and the principle ("a registry-side deprecation cycle (a published notice and a minimum window elapse before any removal)").

**States**: ACTIVE, DEPRECATED, REMOVED

**Initial State**: ACTIVE

**Transitions**:
1. [x] - `p2` - **FROM** ACTIVE **TO** DEPRECATED **WHEN** an `npm deprecate` notice is published against the version on the registry - `inst-rva-active-to-deprecated`
2. [x] - `p2` - **FROM** DEPRECATED **TO** REMOVED **WHEN** the registry-side deprecation-cycle gate passes — notice present and the minimum deprecation window elapsed - `inst-rva-deprecated-to-removed`

## 5. Definitions of Done

### Each Artifact Publishes on Its Own Semver Line

- [x] `p1` - **ID**: `cpt-frontx-dod-ecosystem-distribution-independent-publication`

The system **MUST** publish each FrontX artifact on its own independent semver line and cadence, such that a breaking change increments only that artifact's own major version and requires no version change to any sibling artifact.

**Implements**:
- `cpt-frontx-flow-ecosystem-distribution-independent-publication`

**Constraints**: None applicable — no DESIGN constraint bounds the internal release tooling for this policy.

**Touches**:
- Package registry (npm-compatible) — per-artifact publication
- Release pipeline — per-artifact version line
- `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

### Coupled-Edge Compatibility Is Range-Based, Not Pinned

- [x] `p1` - **ID**: `cpt-frontx-dod-ecosystem-distribution-edge-compatibility`

The system **MUST** assert, at publication of `@gears-frontx/mfes`, that its declared dependency on `@gears-frontx/gts-plugin` is a satisfiable semver range (peer/caret) and not an exact pin, so that cross-artifact skew on the one coupled edge is resolved by ranges rather than lockstep and no duplicate `gts-plugin` runtime is forced.

**Implements**:
- `cpt-frontx-flow-ecosystem-distribution-independent-publication`
- `cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check`

**Constraints**: None applicable.

**Touches**:
- Package registry — `mfes` manifest `peerDependencies`
- `cpt-frontx-nfr-evolvability`

### Deprecation Cycle Is Enforced Registry-Side Before Removal

- [x] `p1` - **ID**: `cpt-frontx-dod-ecosystem-distribution-deprecation-cycle-enforced`

The system **MUST** require that a published artifact version carry a registry-side deprecation notice (via `npm deprecate`) and that a minimum deprecation window elapse before that version is removed. There is NO in-package lifecycle-state field; deprecation and removal are registry operations, ensuring consumers get advance notice and adequate time to migrate.

**Implements**:
- `cpt-frontx-algo-ecosystem-distribution-deprecation-gate`
- `cpt-frontx-state-ecosystem-distribution-registry-version-availability`

**Constraints**: None applicable.

**Touches**:
- Package registry deprecation metadata — `npm deprecate` notice
- Registry version availability state machine
- `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

### Consumer Upgrade Does Not Require Lockstep Updates

- [x] `p1` - **ID**: `cpt-frontx-dod-ecosystem-distribution-independent-upgrade`

The system **MUST** allow a consuming project to adopt a new version of exactly one FrontX artifact without being required to simultaneously upgrade any other FrontX artifact, subject only to the `mfes → gts-plugin` peer range resolving on the one coupled edge.

**Implements**:
- `cpt-frontx-flow-ecosystem-distribution-consumer-upgrade`
- `cpt-frontx-algo-ecosystem-distribution-edge-compatibility-check`

**Constraints**: None applicable.

**Touches**:
- Package registry distribution channels (npm + GitHub source)
- `cpt-frontx-nfr-evolvability`, `cpt-frontx-nfr-scalability-ceiling`

## 6. Acceptance Criteria

- [x] Publishing a breaking change to one artifact increments only that artifact's own major version and requires no version change to any sibling artifact.
- [x] Publication of `@gears-frontx/mfes` is blocked when its declared dependency on `@gears-frontx/gts-plugin` is an exact pin or an unsatisfiable range.
- [x] A consuming project can adopt a new patch, minor, or major version of one FrontX artifact without changing any other FrontX artifact, provided the `mfes → gts-plugin` peer range resolves.
- [x] A version cannot be removed from the registry until an `npm deprecate` notice has been published and the minimum deprecation window has elapsed.
- [x] No architectural ceiling is imposed: adding or retiring an artifact requires no version amendment to any other artifact.
