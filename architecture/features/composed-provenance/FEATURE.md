# Feature: Composed-Template Resolution & Project Provenance

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Scaffold Composed Project](#scaffold-composed-project)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Composed-Template Recursive Resolution](#composed-template-recursive-resolution)
  - [Project Provenance Record Write](#project-provenance-record-write)
- [4. States (CDSL)](#4-states-cdsl)
  - [Composition Resolution State Machine](#composition-resolution-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Composed-Template Resolution Delivered](#composed-template-resolution-delivered)
  - [Project Provenance Record Written at Scaffold](#project-provenance-record-written-at-scaffold)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-composed-provenance`

## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-composed-provenance`

### 1.1 Overview

Resolves manifest-declared composed templates recursively through the shared resolver in a single scaffold operation, applying a nearest-declaration-wins collision rule and aborting before any write on unresolvable collisions, then records the originating template identity, version, and source-spec as an in-project provenance record. All CDSL behavior is `target` (GREENFIELD — grounded in `cpt-frontx-adr-composed-template-resolution`, `cpt-frontx-adr-project-provenance-record`, and DESIGN §3.1/§3.6).

### 1.2 Purpose

This feature realizes the manifest-declared recursive composition decided in `cpt-frontx-adr-composed-template-resolution` and the project-provenance record decided in `cpt-frontx-adr-project-provenance-record`. It covers the recursive resolution of a project template's composed microfrontend templates through the shared resolver, the deterministic nearest-declaration-wins collision rule with pre-write reporting, the scaffold of the full composition in one operation, and the writing of the in-project provenance record. This feature is the OWNER of `cpt-frontx-contract-project-provenance`.

**Requirements**: `cpt-frontx-fr-cli-composed-template-resolution`

**Contracts (owned)**: `cpt-frontx-contract-project-provenance`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Initiates the scaffold operation by issuing a scaffold command with a versioned source-spec |
| `cpt-frontx-actor-github` | Acts as the external source registry from which the CLI resolves template references |
| `cpt-frontx-actor-cypilot-cli` | Executes the composed-template resolution, scaffolds the project, and writes the provenance record |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**:
  - `cpt-frontx-feature-template-resolution` (F10 — Template Externalization & Source-Spec Resolution)
  - `cpt-frontx-feature-cli-scaffolding` (F12 — Two-Namespace Commands & Project/MFE Scaffolding)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-scaffold-composed-project`

### Scaffold Composed Project

- [ ] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-scaffold-composed-project`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-seq-composed-project-scaffold`

**Involves**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-github`, `cpt-frontx-actor-cypilot-cli`

**Success Scenarios**:
- Developer issues a scaffold command; the CLI resolves the project template and all composed microfrontend templates recursively; the full composition is delivered in one operation; the provenance record is written into the scaffolded project.

**Error Scenarios**:
- Source registry (`cpt-frontx-actor-github`) unreachable: CLI reports the failure and aborts with no files written.
- Composition collision detected (unresolvable same-coordinate conflict): CLI reports the conflicting declarations and aborts before any files are written.
- Reference cycle detected in the composition tree: CLI reports the cycle and aborts before any files are written.

**Steps**:

1. [ ] - `p1` - Developer issues a scaffold command to `cpt-frontx-actor-cypilot-cli`, supplying a versioned source-spec for the project template - `inst-issue-scaffold`
2. [ ] - `p1` - CLI resolves the project template from `cpt-frontx-actor-github` using the shared resolver (`cpt-frontx-adr-template-externalization-resolution`) with the supplied source-spec - `inst-resolve-root-template`
3. [ ] - `p1` - **IF** the source registry is unreachable - `inst-check-registry-reach`
   1. [ ] - `p1` - CLI reports the registry failure to the developer and **RETURN** (no files written) - `inst-abort-registry`
4. [ ] - `p1` - CLI reads the resolved project template's manifest to obtain its declared composition of microfrontend templates - `inst-read-manifest`
5. [ ] - `p1` - CLI invokes the composed-template resolution algorithm (`cpt-frontx-algo-composed-provenance-recursive-resolution`) to recursively resolve all declared template references and detect collisions or cycles - `inst-invoke-resolution`
6. [ ] - `p1` - **IF** the resolution algorithm returns a collision or cycle error - `inst-check-resolution-error`
   1. [ ] - `p1` - CLI reports the conflicting or cyclic declarations to the developer and **RETURN** (no files written) - `inst-abort-resolution-error`
7. [ ] - `p1` - CLI scaffolds the project and all resolved composed microfrontends from the single collision-free composition set, writing all files in one operation - `inst-scaffold-composition`
8. [ ] - `p1` - CLI invokes the provenance write algorithm (`cpt-frontx-algo-composed-provenance-provenance-write`) to record the originating template identity, version, and source-spec inside the scaffolded project root - `inst-invoke-provenance-write`
9. [ ] - `p1` - **IF** the provenance write fails - `inst-check-provenance-write-fail`
   1. [ ] - `p1` - CLI reports the provenance write failure to the developer - `inst-report-provenance-fail`
10. [ ] - `p1` - CLI signals the AI Tooling Framework to activate base ecosystem capabilities and any bundled template extensions - `inst-activate-kit`
11. [ ] - `p1` - **RETURN** the scaffolded project with provenance and AI capabilities active to the developer - `inst-return-success`

## 3. Processes / Business Logic (CDSL)

### Composed-Template Recursive Resolution

- [ ] `p2` - **ID**: `cpt-frontx-algo-composed-provenance-recursive-resolution`

**Input**: current template's manifest, set of already-visited template identities (for cycle detection), current declared-depth counter

**Output**: a collision-free composition set (flat mapping of target path to resolved template unit), or a collision/cycle error — reported before any files are written

**Steps**:

1. [ ] - `p1` - Accept the current template's manifest, the set of already-visited template identities, and the current declared-depth counter - `inst-accept-manifest`
2. [ ] - `p1` - **IF** the current template's identity is already present in the visited set - `inst-check-cycle`
   1. [ ] - `p1` - **RETURN** a reference-cycle error naming the repeated identity; do not recurse further - `inst-return-cycle-error`
3. [ ] - `p1` - Add the current template's identity to the visited set - `inst-add-visited`
4. [ ] - `p1` - Read the declared composition list from the current template's manifest - `inst-read-composition-list`
5. [ ] - `p1` - **IF** the composition list is empty - `inst-check-empty`
   1. [ ] - `p1` - **RETURN** the current template's own content as its sole contribution to the composition set - `inst-return-leaf`
6. [ ] - `p1` - Initialize an accumulating composition set for this node, seeded with the current template's own content - `inst-init-accumulator`
7. [ ] - `p1` - **FOR EACH** declared template reference in the composition list, in declaration order - `inst-foreach-ref`
   1. [ ] - `p1` - Resolve the referenced template from the source registry through the shared resolver (`cpt-frontx-adr-template-externalization-resolution`) - `inst-resolve-ref`
   2. [ ] - `p1` - **IF** the resolution fails - `inst-check-resolve-fail`
      1. [ ] - `p1` - **RETURN** a resolution error naming the unresolvable reference; do not write any files - `inst-return-resolve-error`
   3. [ ] - `p1` - Recurse: invoke this algorithm with the resolved template's manifest, the updated visited set, and the declared-depth counter incremented by one - `inst-recurse`
   4. [ ] - `p1` - **IF** the recursion returns an error - `inst-check-recursion-error`
      1. [ ] - `p1` - Propagate the error upward and **RETURN** - `inst-propagate-error`
   5. [ ] - `p1` - Merge the recursed contribution into the accumulating composition set applying the nearest-declaration-wins collision rule: when two contributions declare the same target path, the contribution from the shallower declaring template (the one nearer to the composition root in declared depth) takes precedence; among equally shallow declarations the one appearing first in the manifest list takes precedence - `inst-merge-with-collision-rule`
   6. [ ] - `p1` - **IF** the same target path is contributed by two equally-near, first-declared units that cannot be resolved to one unambiguous unit - `inst-check-unresolvable-collision`
      1. [ ] - `p1` - Record the target path and the conflicting unit identities as a composition collision entry - `inst-record-collision`
8. [ ] - `p1` - **IF** any collision entries were recorded during the merge pass - `inst-check-any-collisions`
   1. [ ] - `p1` - **RETURN** the full collision report listing each conflicting target path and contributing unit identities; do not write any files - `inst-return-collision-report`
9. [ ] - `p1` - **RETURN** the fully resolved, collision-free composition set - `inst-return-resolved`

### Project Provenance Record Write

- [ ] `p2` - **ID**: `cpt-frontx-algo-composed-provenance-provenance-write`

**Input**: scaffolded project root path, originating template identity, scaffolded-from template version, source-spec that re-resolves the origin

**Output**: in-project provenance record written; or a write error

**Steps**:

1. [ ] - `p1` - Accept the scaffolded project root path, the template identity, the exact scaffolded-from template version, and the source-spec sufficient to re-resolve the origin - `inst-accept-provenance-inputs`
2. [ ] - `p1` - Construct the provenance record capturing: template identity, scaffolded-from version, and source-spec (in the shape decided by `cpt-frontx-adr-source-spec-syntax`) - `inst-construct-provenance`
3. [ ] - `p1` - Determine the provenance record storage location inside the scaffolded project root (per `cpt-frontx-contract-project-provenance`) - `inst-determine-storage-location`
4. [ ] - `p1` - Write the provenance record to that location in a durable, human-readable format - `inst-write-record`
5. [ ] - `p1` - **IF** the write fails - `inst-check-write-fail`
   1. [ ] - `p1` - **RETURN** a provenance-write error; the scaffold is considered incomplete without the record - `inst-return-write-error`
6. [ ] - `p1` - **RETURN** the written provenance record location - `inst-return-provenance-location`

## 4. States (CDSL)

### Composition Resolution State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-composed-provenance-composition-resolution`

**States**: DECLARED, RESOLVING, RESOLVED, SCAFFOLDED, COLLISION_ABORTED

**Initial State**: DECLARED

**Transitions**:

1. [ ] - `p1` - **FROM** DECLARED **TO** RESOLVING **WHEN** the developer issues a scaffold command and the CLI begins recursive resolution of the declared composition - `inst-transition-declared-resolving`
2. [ ] - `p1` - **FROM** RESOLVING **TO** RESOLVED **WHEN** all declared template references are recursively resolved and the accumulating composition set contains no collisions and no cycles - `inst-transition-resolving-resolved`
3. [ ] - `p1` - **FROM** RESOLVING **TO** COLLISION_ABORTED **WHEN** an unresolvable composition collision or a reference cycle is detected during resolution — the CLI reports the specific conflict or cycle and aborts before any files are written - `inst-transition-resolving-collision-aborted`
4. [ ] - `p1` - **FROM** RESOLVED **TO** SCAFFOLDED **WHEN** the full collision-free composition is written to disk and the provenance record is successfully written into the scaffolded project root - `inst-transition-resolved-scaffolded`

## 5. Definitions of Done

### Composed-Template Resolution Delivered

- [ ] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-composition-delivered`

The system **MUST** implement manifest-declared recursive composition through the shared resolver, apply the nearest-declaration-wins collision rule, detect reference cycles, and report all collisions and cycles before writing any files — realizing the single-operation composed scaffold described in `cpt-frontx-flow-composed-provenance-scaffold-composed-project` and the resolution algorithm `cpt-frontx-algo-composed-provenance-recursive-resolution`.

**Implements**:
- `cpt-frontx-flow-composed-provenance-scaffold-composed-project`
- `cpt-frontx-algo-composed-provenance-recursive-resolution`

**Contracts**: `cpt-frontx-contract-project-provenance` (OWNER), `cpt-frontx-seq-composed-project-scaffold`

**Touches**:
- Entities: Template, ProjectProvenance

### Project Provenance Record Written at Scaffold

- [ ] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-provenance-at-scaffold`

The system **MUST** write an in-project provenance record at scaffold time capturing the originating template identity, the exact scaffolded-from template version, and a re-resolvable source-spec — enabling a later upgrade operation to establish a precise diff baseline from the record — realizing `cpt-frontx-algo-composed-provenance-provenance-write`.

**Implements**:
- `cpt-frontx-algo-composed-provenance-provenance-write`

**Contracts**: `cpt-frontx-contract-project-provenance` (OWNER), `cpt-frontx-seq-composed-project-scaffold`

**Touches**:
- Entities: Template, ProjectProvenance

## 6. Acceptance Criteria

- [ ] Scaffolding a project template with one or more manifest-declared microfrontend template references produces a single operation that delivers all referenced microfrontends without requiring the developer to scaffold each one separately.
- [ ] A composition referencing microfrontend templates at two or more levels of depth resolves all transitively-declared microfrontends, not only directly-declared ones.
- [ ] When two branches of a composition contribute a unit at the same target path, the nearest-declaration-wins rule resolves to the shallower declaration; the same composition resolves identically on every invocation.
- [ ] When an unresolvable composition collision is detected, the CLI reports the conflicting target path and contributing unit identities, and no files are written to disk.
- [ ] When a reference cycle is detected in the composition tree, the CLI reports the cycle and aborts before writing any files.
- [ ] A scaffolded project contains an in-project provenance record capturing the originating template identity, the exact template version it was scaffolded from, and a source-spec sufficient to re-resolve that origin.
- [ ] `cpt --json validate --artifact architecture/features/composed-provenance/FEATURE.md --skip-code` returns PASS.
- [ ] `cpt --json validate-toc architecture/features/composed-provenance/FEATURE.md` returns PASS.
