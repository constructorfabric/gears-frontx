# Feature: AI-Driven Upgrade Orchestration


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [AI-Driven Template Upgrade](#ai-driven-template-upgrade)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Upgrade Enrichment](#upgrade-enrichment)
- [4. States (CDSL)](#4-states-cdsl)
  - [Orchestrated-Upgrade Lifecycle State Machine](#orchestrated-upgrade-lifecycle-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [AI Upgrade Orchestration Implemented](#ai-upgrade-orchestration-implemented)
  - [Review Gate Enforced Before Apply](#review-gate-enforced-before-apply)
  - [Single Engine Enforced](#single-engine-enforced)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-ai-upgrade-orchestration`
## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-ai-upgrade-orchestration`

### 1.1 Overview

Provides the AI workflow surface through which an AI agent orchestrates a template upgrade by reading the project's provenance record set, selecting which applied template to upgrade (a repository holds one provenance record per applied template, with no single whole-repository origin), invoking and enriching the CLI change-set engine with change-impact analysis, review gates, and downstream-effect assessment, then applying the approved change set or leaving the project unchanged if the developer declines.

**Recorded debt — selection does not reach the engine**: the command surface takes only the project root and target version, so the orchestration's template selection governs the enriched review package but not the engine's own baseline, which the engine resolves from the first provenance record (`packages/cli/src/adapters/provenance-io.ts`). In a repository with more than one applied template, the enriched package and the engine's change set can therefore name different templates. This holds until upgrade-target selection lands on the command surface (tracked by issue #508); `inst-invoke-engine` below states the invocation as shipped.

### 1.2 Purpose

Delivers the AI-guided upgrade path defined in `cpt-frontx-seq-ai-driven-template-upgrade`: an AI agent that reads provenance, drives the single CLI change-set engine (F14), enriches the output with analysis and downstream-effect assessment, and gates apply on an explicit developer decision — ensuring the identical change set is applied by both the AI-orchestrated path and the direct CLI path.

**Requirements**: `cpt-frontx-fr-ai-upgrade-orchestration`

**Components**: `cpt-frontx-component-ai-upgrade-orchestration` (the internal sub-component that owns this behavior), within the package anchor `cpt-frontx-component-ai-tooling-kit`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Initiates the AI-driven upgrade, reviews the enriched change set, and approves or declines the apply |

### 1.4 References

- **PRD**: [PRD.md](../../../../../architecture/PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: `cpt-frontx-feature-upgrade-changeset` (F14 — the CLI change-set engine this feature orchestrates), `cpt-frontx-feature-ai-kit-packaging` (F15 — the base kit this workflow ships inside)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-ai-driven-template-upgrade`

### AI-Driven Template Upgrade

- [x] `p1` - **ID**: `cpt-frontx-flow-ai-upgrade-orchestration-upgrade`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-seq-ai-driven-template-upgrade`

**Success Scenarios**:
- Developer initiates upgrade, AI presents the enriched change set, developer approves, and the engine applies the change set non-destructively, updating project provenance to the newer template version.

**Error Scenarios**:
- Provenance record is absent or unreadable; upgrade cannot proceed.
- Engine returns an empty or unresolvable change set; AI presents the finding and halts before the review gate.
- Developer declines at the review gate; no project files are written and the project remains at its current version.
- Downstream-effect assessment flags incompatibilities; AI surfaces them before the gate so the developer can decline.

**Steps**:
1. [x] - `p1` - Developer requests an AI-driven template upgrade for the current project, naming the applied template to upgrade (or asking the AI to list the applied templates from provenance so one can be chosen) - `inst-request-upgrade`
2. [x] - `p1` - AI reads the project's provenance record set (`cpt-frontx-contract-project-provenance`) and selects the record for the named applied template, determining that template's identity and current version - `inst-read-provenance`
3. [x] - `p1` - **IF** provenance is absent or unreadable, or holds no record for the named applied template - `inst-check-provenance`
   1. [x] - `p1` - **RETURN** error to developer: no matching provenance record; upgrade cannot proceed - `inst-provenance-missing`
4. [x] - `p1` - AI invokes the Upgrade Enrichment algorithm with the selected applied template's provenance record and the target template version - `inst-invoke-enrichment`
5. [x] - `p1` - **IF** the engine returns an empty or unresolvable change set - `inst-check-changeset`
   1. [x] - `p1` - **RETURN** finding to developer: no applicable change set; upgrade halted before review gate - `inst-empty-changeset`
6. [x] - `p1` - AI presents the enriched change set (change-impact analysis + downstream-effect assessment) to the developer for review - `inst-present-review`
7. [x] - `p1` - **IF** developer approves the change set - `inst-gate-approve`
   1. [x] - `p1` - Trigger engine apply: engine writes the change set to project files non-destructively - `inst-engine-apply`
   2. [x] - `p1` - Engine updates project provenance record to the newer template version - `inst-update-provenance`
   3. [x] - `p1` - **RETURN** upgrade complete with summary of applied changes - `inst-return-applied`
8. [x] - `p1` - **ELSE** developer declines or incompatibilities are flagged - `inst-gate-decline`
   1. [x] - `p1` - Engine writes no project files; project remains at current version - `inst-no-write`
   2. [x] - `p1` - **RETURN** decline acknowledged; no changes applied - `inst-return-declined`

## 3. Processes / Business Logic (CDSL)

### Upgrade Enrichment

- [x] `p1` - **ID**: `cpt-frontx-algo-ai-upgrade-orchestration-enrich`

**Input**: the selected applied template's provenance record (template identity, current version), target template version

**Output**: Enriched review package containing the proposed change set, change-impact analysis, and downstream-effect assessment

**Steps**:
1. [x] - `p1` - Extract the selected applied template's identity and current version from its provenance record - `inst-extract-provenance`
2. [x] - `p1` - Invoke the single CLI change-set engine (F14) for the project root and target version; the selected template's identity and current version stay with the orchestration for enrichment (see the recorded debt in §1.1) - `inst-invoke-engine`
3. [x] - `p1` - Receive the proposed reviewable change set from the engine (the identical change set the direct CLI upgrade path would produce) - `inst-receive-changeset`
4. [x] - `p1` - **IF** the change set is empty or unresolvable - `inst-check-empty`
   1. [x] - `p1` - **RETURN** empty change set signal to the caller - `inst-empty-signal`
5. [x] - `p1` - Run change-impact analysis over the change set — identify which project files are affected, what type of changes each represents, and whether any change requires developer attention before apply - `inst-impact-analysis`
6. [x] - `p1` - Run downstream-effect assessment — determine which project capabilities or configuration depend on the changed template files and surface any incompatibilities - `inst-downstream-assess`
7. [x] - `p1` - Combine engine change set, change-impact analysis, and downstream-effect assessment into a single enriched review package - `inst-combine-results`
8. [x] - `p1` - **RETURN** enriched review package to the AI agent for presentation at the review gate - `inst-return-enriched`

## 4. States (CDSL)

### Orchestrated-Upgrade Lifecycle State Machine

- [x] `p2` - **ID**: `cpt-frontx-state-ai-upgrade-orchestration-lifecycle`

**States**: PROVENANCE_READ, ANALYZED, REVIEWED, APPLIED, DECLINED

**Initial State**: PROVENANCE_READ

**Transitions**:
1. [x] - `p1` - **FROM** PROVENANCE_READ **TO** ANALYZED **WHEN** the provenance record set has been read, the applied template to upgrade has been selected, and the CLI change-set engine has been invoked and returned a change set and change-impact analysis and downstream-effect assessment are complete - `inst-to-analyzed`
2. [x] - `p1` - **FROM** ANALYZED **TO** REVIEWED **WHEN** the enriched change set with downstream-impact assessment has been presented to the developer at the review gate - `inst-to-reviewed`
3. [x] - `p1` - **FROM** REVIEWED **TO** APPLIED **WHEN** developer approves and the engine has applied the change set non-destructively and project provenance has been updated to the newer template version - `inst-to-applied`
4. [x] - `p1` - **FROM** REVIEWED **TO** DECLINED **WHEN** developer declines or incompatibilities are flagged at the review gate; no project files written; project remains at current version - `inst-to-declined`

## 5. Definitions of Done

### AI Upgrade Orchestration Implemented

- [x] `p1` - **ID**: `cpt-frontx-dod-ai-upgrade-orchestration-flow-complete`

The system **MUST** implement the AI-driven upgrade orchestration flow such that an AI agent can read project provenance, invoke and enrich the single CLI change-set engine with change-impact analysis and downstream-effect assessment, present the enriched review package at a developer review gate, and apply the approved change set non-destructively or leave the project unchanged on decline — matching the frozen design intent of `cpt-frontx-seq-ai-driven-template-upgrade`.

**Implements**:
- `cpt-frontx-flow-ai-upgrade-orchestration-upgrade`
- `cpt-frontx-algo-ai-upgrade-orchestration-enrich`

**Cites**:
- `cpt-frontx-seq-ai-driven-template-upgrade`
- `cpt-frontx-component-ai-upgrade-orchestration`
- `cpt-frontx-component-ai-tooling-kit`

**Touches**:
- Entities: ProjectProvenance, AiExtension

### Review Gate Enforced Before Apply

- [x] `p1` - **ID**: `cpt-frontx-dod-ai-upgrade-orchestration-gate-enforced`

The system **MUST** ensure that the engine apply step is never triggered without an explicit developer approval at the review gate — the engine writes no project files until the developer approves, and a decline or flagged incompatibility leaves the project at its current version with no files written.

**Implements**:
- `cpt-frontx-flow-ai-upgrade-orchestration-upgrade`

**Cites**:
- `cpt-frontx-seq-ai-driven-template-upgrade`
- `cpt-frontx-component-ai-upgrade-orchestration`
- `cpt-frontx-component-ai-tooling-kit`

**Touches**:
- Entities: ProjectProvenance

### Single Engine Enforced

- [x] `p1` - **ID**: `cpt-frontx-dod-ai-upgrade-orchestration-single-engine`

The system **MUST** invoke only the CLI change-set engine (F14 — `cpt-frontx-feature-upgrade-changeset`) to produce the upgrade change set; the AI orchestration layer **MUST NOT** implement a second change-set engine, so that the AI-driven upgrade and the direct CLI upgrade produce the identical change set.

**Implements**:
- `cpt-frontx-algo-ai-upgrade-orchestration-enrich`

**Cites**:
- `cpt-frontx-seq-ai-driven-template-upgrade`
- `cpt-frontx-component-ai-upgrade-orchestration`
- `cpt-frontx-component-ai-tooling-kit`

**Touches**:
- Entities: ProjectProvenance

## 6. Acceptance Criteria

- [x] The AI-driven upgrade flow reads the project's provenance record set, selects the named applied template to upgrade, invokes the single CLI change-set engine for that template, enriches the result with change-impact analysis and downstream-effect assessment, and presents it to the developer before any apply.
- [x] The review gate stands unconditionally before the engine apply step: no project files are written until an explicit developer approval.
- [x] On developer decline or flagged incompatibilities, the project remains at its current version with no files written.
- [x] The AI orchestration layer contains no second change-set engine implementation; the identical change set is applied by both the AI-orchestrated path and the direct CLI path.
- [x] Project provenance is updated to the newer template version only after a successful non-destructive apply.
- [x] The orchestrated-upgrade state machine transitions correctly through PROVENANCE_READ → ANALYZED → REVIEWED → APPLIED on approval and PROVENANCE_READ → ANALYZED → REVIEWED → DECLINED on decline.
