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

Resolves a preset's referenced templates recursively through the shared resolver in a single operation, producing a per-template composition set that defers all same-target-path collision arbitration to the pre-flight ownership-boundary conflict check owned by `cpt-frontx-feature-cli-scaffolding` — aborting before any write when that check refuses the assembly — then writes the repository's provenance as a set of records — one per applied template — each capturing that template's identity, applied-from version, source-spec, and occupied ownership boundary. All CDSL behavior is `target` (GREENFIELD — grounded in `cpt-frontx-adr-composed-template-resolution`, `cpt-frontx-adr-project-provenance-record`, and DESIGN §3.1/§3.6).

### 1.2 Purpose

This feature realizes the preset (referenced-template) recursive resolution decided in `cpt-frontx-adr-composed-template-resolution` and the per-applied-template provenance decided in `cpt-frontx-adr-project-provenance-record`, and owns the concrete provenance schema per `cpt-frontx-adr-contract-schema-ownership`. It covers the recursive resolution of a preset's referenced templates through the shared resolver into a deterministic per-template composition set handed unmodified to the pre-flight ownership-boundary conflict check for pre-write collision arbitration, the assembly of the full set in one operation, and the writing of one provenance record per applied template. The provenance is a set of records, one per applied template, with no single whole-repository origin. The provenance store is a single file `.frontx/provenance.json` at the repository root, holding the SET of records — one record per applied template, so this single file contains the whole set, consistent with "no single whole-repository origin record"; each record's field layout is already documented in this feature. This feature is the OWNER of `cpt-frontx-contract-project-provenance`.

**Requirements**: `cpt-frontx-fr-cli-composed-template-resolution`

**Contracts (owned)**: `cpt-frontx-contract-project-provenance`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Initiates the scaffold operation by issuing a scaffold command with a versioned source-spec; the FrontX CLI (`@gears-frontx/cli`, `cpt-frontx-component-cli`) is the system that executes the composed-template resolution, scaffolds the project, and writes the provenance record |
| `cpt-frontx-actor-github` | Acts as the external source registry from which the CLI resolves template references |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**:
  - `cpt-frontx-feature-template-resolution` (F10 — Template Externalization & Source-Spec Resolution)
  - `cpt-frontx-feature-cli-scaffolding` (F12 — Kindless Template Assembly & Conflict-Checked Composition)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-scaffold-composed-project`

### Scaffold Composed Project

- [x] `p1` - **ID**: `cpt-frontx-flow-composed-provenance-scaffold-composed-project`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-seq-composed-project-scaffold`

**Involves**: `cpt-frontx-actor-project-developer`, `cpt-frontx-actor-github` (the FrontX CLI, `cpt-frontx-component-cli`, is the executing system)

**Success Scenarios**:
- Developer issues an apply command; the CLI resolves the root template and all of its preset's referenced templates recursively; the full set is applied in one operation; one provenance record is written per applied template into the repository.

**Error Scenarios**:
- Source registry (`cpt-frontx-actor-github`) unreachable: CLI reports the failure and aborts with no files written.
- Composition collision detected (unresolvable same-coordinate conflict): CLI reports the conflicting declarations and aborts before any files are written.
- Reference cycle detected in the composition tree: CLI reports the cycle and aborts before any files are written.
- Materializing the cleared assembly is refused (`cpt-frontx-algo-cli-scaffolding-compose-shared-files`, e.g. an on-disk shared-file block owned by a template neither in this scaffold's set nor recorded in existing provenance): CLI reports the refusal and aborts with no files written — distinct from a provenance record write failure, which happens only after files are already written.

**Steps**:

1. [x] - `p1` - Developer issues an apply command to the FrontX CLI (`cpt-frontx-component-cli`), supplying a versioned source-spec for the root template - `inst-issue-scaffold`
2. [x] - `p1` - CLI resolves the root template from `cpt-frontx-actor-github` using the shared resolver (`cpt-frontx-adr-template-acquisition-and-location`) with the supplied source-spec - `inst-resolve-root-template`
3. [x] - `p1` - **IF** the source registry is unreachable - `inst-check-registry-reach`
   1. [x] - `p1` - CLI reports the registry failure to the developer and **RETURN** (no files written) - `inst-abort-registry`
4. [x] - `p1` - CLI reads the resolved root template's manifest to obtain the referenced templates its preset declares - `inst-read-manifest`
5. [x] - `p1` - CLI invokes the referenced-template resolution algorithm (`cpt-frontx-algo-composed-provenance-recursive-resolution`) to recursively resolve all declared template references into a per-template composition set and detect unresolvable references or reference cycles - `inst-invoke-resolution`
6. [x] - `p1` - **IF** the resolution algorithm returns a resolution or cycle error - `inst-check-resolution-error`
   1. [x] - `p1` - CLI reports the unresolvable or cyclic declarations to the developer and **RETURN** (no files written) - `inst-abort-resolution-error`
7. [x] - `p1` - CLI stages the resolved per-template composition set as a staged assembly through the uniform apply path (`cpt-frontx-algo-cli-scaffolding-uniform-apply`) - `inst-stage-composition`
8. [x] - `p1` - CLI submits the staged assembly to the pre-flight ownership-boundary conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`) - `inst-check-boundary-conflict`
9. [x] - `p1` - **IF** the conflict check reports a same-target-path collision across the set - `inst-check-conflict-result`
   1. [x] - `p1` - CLI reports the contested target path and contesting template identities to the developer and **RETURN** (no files written) - `inst-abort-boundary-conflict`
10. [x] - `p1` - CLI materializes the cleared staged assembly, writing all files in one operation — including each applied template's AI-extension bundle into its identity-scoped `.frontx/ai/<template-identity>/` subtree as ordinary owned content (the bundle contract is owned by `cpt-frontx-feature-template-ai-extensions`) - `inst-scaffold-composition`
11. [x] - `p1` - CLI invokes the provenance write algorithm (`cpt-frontx-algo-composed-provenance-provenance-write`) to write one provenance record per applied template — each capturing that template's identity, applied-from version, source-spec, and occupied ownership boundary — into the repository - `inst-invoke-provenance-write`
12. [x] - `p1` - **IF** materializing the assembly is refused (`cpt-frontx-algo-cli-scaffolding-compose-shared-files`, e.g. an unrecorded on-disk block owner) or any provenance record write fails - `inst-check-provenance-write-fail`
    1. [x] - `p1` - CLI reports the failure to the developer, distinguishing a user-fixable materialization refusal — no file was written — from a provenance-write failure — files were already written, only the provenance record failed - `inst-report-provenance-fail`
13. [x] - `p1` - **RETURN** the assembled repository — its files, its `.frontx/ai/` extension bundles, and one provenance record per applied template — to the developer; the AI Tooling Framework discovers and activates those bundles on its own next invocation by scanning the repository's `.frontx/ai/` (no CLI-to-Kit signal; see `cpt-frontx-feature-template-ai-extensions` and DESIGN §3.4) - `inst-return-success`

## 3. Processes / Business Logic (CDSL)

### Composed-Template Recursive Resolution

- [x] `p2` - **ID**: `cpt-frontx-algo-composed-provenance-recursive-resolution`

**Input**: current template's manifest and its installed content path (the resolved on-disk template), set of already-visited template identities (for cycle detection), current declared-depth counter

**Output**: a per-template composition set — one entry per distinct template encountered in the composition, each entry `{ template identity, installed content path, declared ownership boundaries }` — or a resolution/cycle error, reported before any files are written. Same-target-path collisions between distinct templates are NOT arbitrated here: the full per-template set is handed unmodified to the pre-flight ownership-boundary conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`), which is the sole authority for boundary-collision arbitration, per `cpt-frontx-adr-composed-template-resolution` and `cpt-frontx-adr-assembly-conflict-prevention`.

**Steps**:

1. [x] - `p1` - Accept the current template's manifest and its installed content path, the set of already-visited template identities, and the current declared-depth counter - `inst-accept-manifest`
2. [x] - `p1` - **IF** the current template's identity is already present in the visited set - `inst-check-cycle`
   1. [x] - `p1` - **RETURN** a reference-cycle error naming the repeated identity; do not recurse further - `inst-return-cycle-error`
3. [x] - `p1` - Add the current template's identity to the visited set - `inst-add-visited`
4. [x] - `p1` - Read the declared composition list from the current template's manifest - `inst-read-composition-list`
5. [x] - `p1` - **IF** the composition list is empty - `inst-check-empty`
   1. [x] - `p1` - **RETURN** a per-template composition set containing a single entry for the current template — its identity, installed content path, and declared ownership boundaries — as this node's sole contribution - `inst-return-leaf`
6. [x] - `p1` - Initialize an accumulating per-template composition set for this node, seeded with one entry for the current template itself — its identity, its installed content path, and its declared ownership boundaries (read from its manifest) - `inst-init-accumulator`
7. [x] - `p1` - **FOR EACH** declared template reference in the composition list, in declaration order - `inst-foreach-ref`
   1. [x] - `p1` - Resolve the referenced template from the source registry through the shared resolver (`cpt-frontx-adr-template-acquisition-and-location`) - `inst-resolve-ref`
   2. [x] - `p1` - **IF** the resolution fails - `inst-check-resolve-fail`
      1. [x] - `p1` - **RETURN** a resolution error naming the unresolvable reference; do not write any files - `inst-return-resolve-error`
   3. [x] - `p1` - Recurse: invoke this algorithm with the resolved template's manifest and installed content path, the updated visited set, and the declared-depth counter incremented by one - `inst-recurse`
   4. [x] - `p1` - **IF** the recursion returns an error - `inst-check-recursion-error`
      1. [x] - `p1` - Propagate the error upward and **RETURN** - `inst-propagate-error`
   5. [x] - `p1` - Add every entry of the recursed per-template composition set into the accumulating set, keyed by template identity — one entry per distinct template regardless of whether its declared ownership boundaries overlap another entry's; no target-path comparison, precedence, or merge is applied at this step - `inst-merge-with-collision-rule`
8. [x] - `p1` - **RETURN** the fully accumulated per-template composition set — every distinct template encountered during resolution, each with its identity, installed content path, and declared ownership boundaries, unarbitrated for same-target-path overlaps — for the pre-flight ownership-boundary conflict check to evaluate - `inst-return-resolved`

### Project Provenance Record Write

- [x] `p2` - **ID**: `cpt-frontx-algo-composed-provenance-provenance-write`

**Input**: repository root path; the set of applied templates, each with its identity, applied-from version, source-spec that re-resolves it, and the ownership boundary it occupied

**Output**: one in-repository provenance record written per applied template — the provenance set; or a write error. The concrete schema (`cpt-frontx-contract-project-provenance`): a set of records, one per applied template, each record `{ templateIdentity: string, scaffoldedFromVersion: string, sourceSpec: string, occupiedOwnershipBoundary: string }`, with no single whole-repository origin record. The whole set is held in a single file `.frontx/provenance.json` at the repository root.

Terminology (owned here as the provenance schema owner): a template's **declared ownership boundary** is what its manifest declares (`cpt-frontx-feature-template-manifest`) and what the pre-flight conflict check and assembler read before apply (`cpt-frontx-feature-cli-scaffolding`); the **occupied ownership boundary** is that same boundary recorded into the provenance record at apply time. The two terms name the one boundary at two lifecycle stages — declared before apply, occupied once recorded — and later upgrade reads the occupied boundary (`cpt-frontx-feature-upgrade-changeset`).

Encoding (owned here as the concrete schema owner): `occupiedOwnershipBoundary` is a string field for backward compatibility. Current writers store canonical JSON for every resolved boundary, including an empty owns-nothing boundary: `{"exclusiveSubtrees":[],"sharedFiles":[]}`. Non-empty canonical JSON has `exclusiveSubtrees` deduplicated and lexically sorted, and `sharedFiles` sorted by path, merge strategy, and owned-region list; each `ownedRegions` list is also deduplicated and sorted. The legacy `.` value remains readable only as a pre-schema or omitted-field sentinel and is not written for a resolved empty boundary, because an empty boundary owns no files while `.` is ambiguous with a historical whole-repository placeholder. Repositories that already carry `.` require an explicit migration or re-derivation pass before that value can be interpreted precisely; that migration remains tracked by issue #530 and is outside this feature's current write contract.

**Steps**:

1. [x] - `p1` - Accept the repository root path and the set of applied templates with their identities, applied-from versions, source-specs, and occupied ownership boundaries - `inst-accept-provenance-inputs`
2. [x] - `p1` - Determine the provenance store location inside the repository root — the single file `.frontx/provenance.json` at the repository root (per `cpt-frontx-contract-project-provenance`) - `inst-determine-storage-location`
3. [x] - `p1` - **FOR EACH** applied template in the set - `inst-foreach-applied`
   1. [x] - `p1` - Construct one provenance record capturing that template's identity, its applied-from version, its source-spec (in the shape decided by `cpt-frontx-adr-source-spec-syntax`, retaining the subtree segment when the reference carries one so a later re-resolution addresses the same template), and its occupied ownership boundary encoded as the canonical `occupiedOwnershipBoundary` string - `inst-construct-provenance`
   2. [x] - `p1` - Write the record into the provenance set in a durable, human-readable format - `inst-write-record`
   3. [x] - `p1` - **IF** the write fails - `inst-check-write-fail`
      1. [x] - `p1` - **RETURN** a provenance-write error; the assembly is considered incomplete without a record for every applied template - `inst-return-write-error`
4. [x] - `p1` - **RETURN** the written provenance set — one record per applied template, no single whole-repository origin - `inst-return-provenance-location`

## 4. States (CDSL)

### Composition Resolution State Machine

- [x] `p2` - **ID**: `cpt-frontx-state-composed-provenance-composition-resolution`

**States**: DECLARED, RESOLVING, RESOLVED, CONFLICT_CHECKED, SCAFFOLDED, ABORTED

**Initial State**: DECLARED

**Transitions**:

1. [x] - `p1` - **FROM** DECLARED **TO** RESOLVING **WHEN** the developer issues a scaffold command and the CLI begins recursive resolution of the declared composition - `inst-transition-declared-resolving`
2. [x] - `p1` - **FROM** RESOLVING **TO** RESOLVED **WHEN** all declared template references are recursively resolved into the per-template composition set with no unresolvable references and no reference cycles - `inst-transition-resolving-resolved`
3. [x] - `p1` - **FROM** RESOLVING **TO** ABORTED **WHEN** an unresolvable template reference or a reference cycle is detected during resolution — the CLI reports the specific error and aborts before any files are written - `inst-transition-resolving-aborted`
4. [x] - `p1` - **FROM** RESOLVED **TO** CONFLICT_CHECKED **WHEN** the pre-flight ownership-boundary conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`) finds no same-target-path collision across the resolved per-template composition set - `inst-transition-resolved-conflict-checked`
5. [x] - `p1` - **FROM** RESOLVED **TO** ABORTED **WHEN** the pre-flight ownership-boundary conflict check reports a same-target-path collision — the CLI reports the contested path and contesting template identities and aborts before any files are written - `inst-transition-resolved-aborted-conflict`
6. [x] - `p1` - **FROM** CONFLICT_CHECKED **TO** SCAFFOLDED **WHEN** the cleared per-template composition set is written to disk and one provenance record per applied template is successfully written into the repository - `inst-transition-checked-scaffolded`

## 5. Definitions of Done

### Composed-Template Resolution Delivered

- [x] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-composition-delivered`

The system **MUST** implement recursive resolution of a preset's referenced templates through the shared resolver into a per-template composition set, detect unresolvable references and reference cycles, defer all same-target-path collision arbitration to the pre-flight ownership-boundary conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`), and report all resolution errors, cycles, and boundary conflicts before writing any files — realizing the single-operation assembly described in `cpt-frontx-flow-composed-provenance-scaffold-composed-project` and the resolution algorithm `cpt-frontx-algo-composed-provenance-recursive-resolution`.

**Implements**:
- `cpt-frontx-flow-composed-provenance-scaffold-composed-project`
- `cpt-frontx-algo-composed-provenance-recursive-resolution`

**Contracts**: `cpt-frontx-contract-project-provenance` (OWNER), `cpt-frontx-seq-composed-project-scaffold`

**Touches**:
- Entities: Template, ProjectProvenance

### Project Provenance Record Written at Scaffold

- [x] `p1` - **ID**: `cpt-frontx-dod-composed-provenance-provenance-at-scaffold`

The system **MUST** write one in-repository provenance record per applied template at apply time — each capturing that template's identity, its applied-from version, a re-resolvable source-spec, and its occupied ownership boundary as the canonical `occupiedOwnershipBoundary` string — as a set of records with no single whole-repository origin, so a later per-template upgrade can establish a precise diff baseline from the matching record — realizing `cpt-frontx-algo-composed-provenance-provenance-write`.

**Implements**:
- `cpt-frontx-algo-composed-provenance-provenance-write`

**Contracts**: `cpt-frontx-contract-project-provenance` (OWNER), `cpt-frontx-seq-composed-project-scaffold`

**Touches**:
- Entities: Template, ProjectProvenance, OwnershipBoundary

## 6. Acceptance Criteria

- [x] Applying a template whose preset references one or more other templates produces a single operation that applies all referenced templates without requiring the developer to apply each one separately.
- [x] A preset referencing templates at two or more levels of depth resolves all transitively-referenced templates, not only directly-referenced ones.
- [x] When two branches of a preset contribute a unit at the same target path, the resolution algorithm does not arbitrate the collision itself; both contributing templates appear unmodified in the per-template composition set for the pre-flight ownership-boundary conflict check to evaluate, and the same preset resolves to the same per-template set on every invocation.
- [x] When an unresolvable collision is detected, the CLI reports the conflicting target path and contributing unit identities, and no files are written to disk.
- [x] When a reference cycle is detected in the preset tree, the CLI reports the cycle and aborts before writing any files.
- [x] An assembled repository contains one provenance record per applied template, each capturing that template's identity, its applied-from version, a re-resolvable source-spec, and its canonical occupied-boundary string — with no single whole-repository origin record.
- [x] `cfs --json validate --artifact architecture/features/composed-provenance/FEATURE.md --skip-code` returns PASS.
- [x] `cfs --json validate-toc architecture/features/composed-provenance/FEATURE.md` returns PASS.
