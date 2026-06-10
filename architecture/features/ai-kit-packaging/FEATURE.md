# Feature: AI Tooling Kit Packaging & Base Content


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Kit Base-Capability Session Availability](#kit-base-capability-session-availability)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Manifest Validation & Prefix Enforcement](#manifest-validation--prefix-enforcement)
- [4. States (CDSL)](#4-states-cdsl)
  - [Kit Lifecycle State Machine](#kit-lifecycle-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Kit Installs and Activates Base Capabilities](#kit-installs-and-activates-base-capabilities)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-ai-kit-packaging`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-ai-kit-packaging`

### 1.1 Overview

Ships the AI Tooling Framework as a Cypilot kit (`cyber-pilot-kit-frontx`) with a declarative manifest, `frontx_`-prefixed resource identifiers, and solution-agnostic base ecosystem capabilities — making those capabilities available to AI agents at session start with no solution-specific content bundled into the base.

### 1.2 Purpose

The framework must reach consuming projects through the Cypilot CLI so that AI agents working in those projects gain ecosystem-fluency skills, workflows, guidelines, and reference artifacts from the first session interaction. This feature realizes the kit-installation contract and enforces the template-agnostic base boundary mandated by the FRs and the KIT-1 constraint.

**Requirements**: `cpt-frontx-fr-ai-session-start-knowledge`, `cpt-frontx-fr-ai-frontx-skills`, `cpt-frontx-fr-ai-tooling-template-agnostic`

**Principles**: `cpt-frontx-principle-template-agnostic-tooling`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-cypilot-cli` | Installs the AI Tooling kit into a consuming project; surfaces `frontx_`-prefixed resources to agents at session start through the installation contract |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: None

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: none direct — flow models session-start base-capability availability (no PRD usecase)

### Kit Base-Capability Session Availability

- [ ] `p1` - **ID**: `cpt-frontx-flow-ai-kit-packaging-session-availability`

**Actor**: `cpt-frontx-actor-cypilot-cli`

**Note**: No PRD usecase backs this flow. It models the system behavior by which, after kit installation, the AI Tooling Framework's base capabilities become available to agents at session start — not a human-actor journey.

**Success Scenarios**:
- The kit is installed and registered; on next session start the agent receives all `frontx_`-prefixed resources declared in the kit manifest.

**Error Scenarios**:
- The kit manifest is absent or malformed; the agent session starts without AI Tooling Framework capabilities and a diagnostic error is surfaced.
- A required resource declared in the manifest is missing from the installed kit; the resource is skipped and the agent is notified of the partial-capability state.

**Steps**:
1. [ ] - `p1` - AI agent session starts in a project that has `cyber-pilot-kit-frontx` installed - `inst-session-start`
2. [ ] - `p1` - Cypilot CLI locates the kit registration at `[kits.cyber-pilot-kit-frontx]` in `core.toml` - `inst-locate-registration`
3. [ ] - `p1` - **IF** the kit registration is missing or `core.toml` is unreadable - `inst-if-no-registration`
   1. [ ] - `p1` - Surface a diagnostic error indicating the kit is not installed; agent session proceeds without AI Tooling capabilities - `inst-no-registration-error`
   2. [ ] - `p1` - **RETURN** partial-capability state - `inst-return-no-kit`
4. [ ] - `p1` - Read the kit's `manifest.toml` from the path recorded in `[kits.cyber-pilot-kit-frontx].path` - `inst-read-manifest`
5. [ ] - `p1` - Invoke **Process**: `cpt-frontx-algo-ai-kit-packaging-manifest-validation` to validate the manifest and enforce `frontx_`-prefix and solution-agnostic-base rules - `inst-invoke-validation`
6. [ ] - `p1` - **IF** manifest validation fails - `inst-if-manifest-invalid`
   1. [ ] - `p1` - Surface validation errors; agent session proceeds without AI Tooling capabilities - `inst-manifest-invalid-error`
   2. [ ] - `p1` - **RETURN** partial-capability state with validation errors - `inst-return-invalid`
7. [ ] - `p1` - **FOR EACH** resource entry in the validated manifest `resources` array - `inst-for-each-resource`
   1. [ ] - `p1` - Resolve the resource's installed path from `[kits.cyber-pilot-kit-frontx.resources.<id>].path` - `inst-resolve-resource-path`
   2. [ ] - `p1` - **IF** the resource path does not exist on disk - `inst-if-resource-missing`
      1. [ ] - `p1` - Record the resource as unavailable; continue iterating remaining resources - `inst-record-missing`
   3. [ ] - `p1` - **ELSE** - `inst-else-resource-present`
      1. [ ] - `p1` - Make the resource available to the agent session under its `frontx_`-prefixed resource id - `inst-expose-resource`
8. [ ] - `p1` - **IF** any resources were recorded as unavailable - `inst-if-partial`
   1. [ ] - `p1` - Surface a diagnostic warning listing unavailable resources; agent session proceeds with partial base capabilities - `inst-partial-warning`
9. [ ] - `p1` - **RETURN** session-active capability set to the agent - `inst-return-session-active`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly.

### Manifest Validation & Prefix Enforcement

- [ ] `p1` - **ID**: `cpt-frontx-algo-ai-kit-packaging-manifest-validation`

**Input**: kit `manifest.toml` content (parsed as `{ manifest, resources[] }`) and optional presence flag indicating whether a no-solution-content scan is requested

**Output**: validation result — PASS or FAIL with a list of specific violations

**Steps**:
1. [ ] - `p1` - Confirm the manifest object has the required top-level fields: `manifest` and `resources` - `inst-check-required-fields`
2. [ ] - `p1` - Confirm `manifest.version` is present and non-empty - `inst-check-version`
3. [ ] - `p1` - Confirm `resources` is a non-empty array - `inst-check-resources-array`
4. [ ] - `p1` - **FOR EACH** entry in `resources` - `inst-for-each-entry`
   1. [ ] - `p1` - Confirm the entry has required fields: `id`, `source`, `default_path`, `type` - `inst-check-entry-required`
   2. [ ] - `p1` - Confirm `id` matches the pattern `^[a-z][a-z0-9_]*$` (base schema requirement) - `inst-check-id-pattern`
   3. [ ] - `p1` - **[target]** Confirm `id` begins with literal prefix `frontx_` (KIT-1 enforcement specific to `cyber-pilot-kit-frontx`) - `inst-check-frontx-prefix`
   4. [ ] - `p1` - **IF** the `frontx_` prefix check fails - `inst-if-prefix-fail`
      1. [ ] - `p1` - Record violation: resource id `id` does not carry the required `frontx_` prefix - `inst-record-prefix-violation`
   5. [ ] - `p1` - Confirm `type` is one of `file` or `directory` - `inst-check-type-enum`
5. [ ] - `p1` - **[target]** Scan the manifest resource set for any entry whose `id` or `description` names a known solution or template-specific concept (solution-agnostic-base enforcement for `cyber-pilot-kit-frontx`) - `inst-scan-solution-content`
6. [ ] - `p1` - **IF** any solution-specific entry is detected - `inst-if-solution-content`
   1. [ ] - `p1` - Record violation: base kit contains solution-specific content, which is prohibited by `cpt-frontx-adr-base-solution-ai-content-split` - `inst-record-solution-violation`
7. [ ] - `p1` - **IF** any violations were recorded - `inst-if-violations`
   1. [ ] - `p1` - **RETURN** FAIL with the complete violation list - `inst-return-fail`
8. [ ] - `p1` - **RETURN** PASS - `inst-return-pass`

## 4. States (CDSL)

### Kit Lifecycle State Machine

- [ ] `p1` - **ID**: `cpt-frontx-state-ai-kit-packaging-kit-lifecycle`

**States**: `PACKAGED`, `INSTALLED`, `SESSION_ACTIVE`

**Initial State**: `PACKAGED`

**Transitions**:
1. [ ] - `p1` - **FROM** `PACKAGED` **TO** `INSTALLED` **WHEN** the Cypilot CLI installs `cyber-pilot-kit-frontx` into the consuming project and records the kit registration at `[kits.cyber-pilot-kit-frontx]` in `core.toml` with its `path`, `version`, and `source` - `inst-transition-packaged-to-installed`
2. [ ] - `p1` - **FROM** `INSTALLED` **TO** `SESSION_ACTIVE` **WHEN** an AI agent session starts, locates the kit registration, reads the manifest, passes manifest validation (including `frontx_`-prefix and solution-agnostic-base checks), and exposes all available resources to the agent session - `inst-transition-installed-to-active`
3. [ ] - `p1` - **FROM** `SESSION_ACTIVE` **TO** `INSTALLED` **WHEN** the agent session ends; the kit registration and installed resources remain on disk unchanged - `inst-transition-active-to-installed`
4. [ ] - `p1` - **FROM** `INSTALLED` **TO** `PACKAGED` **WHEN** the Cypilot CLI uninstalls or removes the kit from the consuming project, deleting the `[kits.cyber-pilot-kit-frontx]` registration and installed resources - `inst-transition-installed-to-packaged`

## 5. Definitions of Done

### Kit Installs and Activates Base Capabilities

- [ ] `p1` - **ID**: `cpt-frontx-dod-ai-kit-packaging-install-and-activate`

The system **MUST** install `cyber-pilot-kit-frontx` through the Cypilot CLI such that all `frontx_`-prefixed resources declared in the kit manifest are made available to AI agents at session start, the kit lifecycle reaches `SESSION_ACTIVE`, and the installed base carries no solution-specific content.

**Implements**:
- `cpt-frontx-flow-ai-kit-packaging-session-availability`
- `cpt-frontx-algo-ai-kit-packaging-manifest-validation`

**Constraints**: `cpt-frontx-constraint-kit-prefixed-resource-ids`

**Touches**:
- Entities: `Kit`
- Resource shape: kit-manifest (`manifest` object + `resources[]` array with `id`, `source`, `default_path`, `type`, `user_modifiable` per entry)
- Registration: `[kits.cyber-pilot-kit-frontx]` block in `core.toml` (fields: `format`, `path`, `version`, `source`; per-resource sub-table `[kits.cyber-pilot-kit-frontx.resources.<id>]` with `path`)
- No API surface; no persistent database

## 6. Acceptance Criteria

- [ ] `cyber-pilot-kit-frontx` installs through the Cypilot CLI and the kit registration appears at `[kits.cyber-pilot-kit-frontx]` in `core.toml` with `path`, `version`, and `source` fields
- [ ] Every resource `id` declared in the kit's `manifest.toml` begins with the literal prefix `frontx_` (KIT-1); a CI check on the manifest asserts all ids match `^frontx_`
- [ ] The kit manifest validates against the kit-manifest schema (`manifest` + non-empty `resources[]`; required fields present on every entry)
- [ ] No solution-specific content is present in the base kit manifest; the solution-agnostic-base admission check passes
- [ ] On agent session start in a project with the kit installed, all declared `frontx_`-prefixed resources are available to the agent; the kit lifecycle state is `SESSION_ACTIVE`
- [ ] When the kit manifest is absent or malformed, the agent session starts without AI Tooling Framework capabilities and a diagnostic error is surfaced
- [ ] When an installed resource file is missing, the agent session starts with partial capabilities and a diagnostic warning is surfaced listing unavailable resources
- [ ] The state machine covers all three lifecycle states (`PACKAGED` → `INSTALLED` → `SESSION_ACTIVE`) with defined FROM/TO/WHEN transitions
