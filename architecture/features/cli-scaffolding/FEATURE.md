# Feature: Kindless Template Assembly & Conflict-Checked Composition


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Seed a Repository from a Template](#seed-a-repository-from-a-template)
  - [Add a Template into an Existing Repository](#add-a-template-into-an-existing-repository)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Uniform Template Apply](#uniform-template-apply)
  - [Pre-Flight Assembly Conflict Check](#pre-flight-assembly-conflict-check)
  - [Compose Shared Files from Owned Regions at Materialization](#compose-shared-files-from-owned-regions-at-materialization)
- [4. States (CDSL)](#4-states-cdsl)
  - [Assembly Operation State Machine](#assembly-operation-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Uniform Apply Path](#uniform-apply-path)
  - [Pre-Flight Conflict Check Before Any Write](#pre-flight-conflict-check-before-any-write)
  - [Shared-File Region Composition at Materialization](#shared-file-region-composition-at-materialization)
  - [Ownership-Boundary-Declared Assembly](#ownership-boundary-declared-assembly)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-cli-scaffolding`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-cli-scaffolding`

### 1.1 Overview

`@gears-frontx/cli` applies any installed template through one uniform apply path: applying a template to seed a new repository and adding a template into an existing repository are the same uniform mechanism, differing only in whether the target already holds applied templates. Each template declares the ownership boundaries it occupies — the exclusive subtrees it alone writes and the shared-file regions it owns with a declared merge — and the CLI runs a pre-flight intersection check over the staged assembly, refusing conflicting claims before any file is written rather than silently merging. A repository is assembled from one or more independently-applied templates, and a preset's referenced templates are resolved and applied together in the same operation. All CDSL behavior is `target` (GREENFIELD — grounded in `cpt-frontx-adr-uniform-template-mechanism`, `cpt-frontx-adr-template-ownership-boundary-declaration`, `cpt-frontx-adr-assembly-conflict-prevention`, and DESIGN §3.3).

### 1.2 Purpose

This feature realizes the uniform apply mechanism decided in `cpt-frontx-adr-uniform-template-mechanism`, the ownership-boundary declaration decided in `cpt-frontx-adr-template-ownership-boundary-declaration`, and the pre-flight assembly conflict check decided in `cpt-frontx-adr-assembly-conflict-prevention`. It covers seeding a repository from a template, adding a template into a repository that already holds applied templates, resolving a preset's referenced templates into the set applied together (`cpt-frontx-adr-composed-template-resolution`), and refusing an assembly whose declared boundaries intersect before any content is materialized. The command surface that drives these operations is `cpt-frontx-interface-cli`; its stability is governed by `cpt-frontx-adr-artifact-versioning-and-distribution`.

A template's AI-extension bundle root `.frontx/ai/<template-identity>/` is an ordinary identity-scoped **exclusive subtree** in that template's declared boundaries (`cpt-frontx-feature-template-manifest`, `cpt-frontx-feature-template-ai-extensions`): co-applied templates' bundle subtrees are disjoint, so the pre-flight conflict check accepts them and the post-materialization boundary-honesty guard treats each bundle as a declared write. The CLI-owned `.frontx/` metadata — `.frontx/provenance.json` written by `cpt-frontx-feature-composed-provenance` and any other CLI metadata under `.frontx/` that is not a template's own `.frontx/ai/<template-identity>/` bundle — is written by the CLI itself outside any template's ownership boundary; it is neither a party to the template-vs-template conflict check nor a write the boundary-honesty guard attributes to a template, and the manifest validator refuses any template that tries to claim this reserved namespace.

**Requirements**: `cpt-frontx-fr-cli-seed-repository`, `cpt-frontx-fr-cli-add-template-to-repository`, `cpt-frontx-fr-cli-template-boundary-declaration`, `cpt-frontx-fr-cli-assembly-conflict-prevention`, `cpt-frontx-fr-cli-composed-template-resolution`

**Principles**: `cpt-frontx-principle-ownership-bounded-composition`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Applies one or more installed templates to seed a repository or to extend an existing one, and resolves any reported assembly conflict before retrying. |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-uniform-template-mechanism`, `cpt-frontx-adr-template-ownership-boundary-declaration`, `cpt-frontx-adr-assembly-conflict-prevention`, `cpt-frontx-adr-composed-template-resolution`, `cpt-frontx-adr-cli-internal-decomposition`
- **Dependencies**: `cpt-frontx-feature-template-resolution`

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-scaffold-composed-project`

### Seed a Repository from a Template

- [x] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-seed-repository`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer applies an installed template to an empty target directory; the CLI resolves the template and any templates its preset references, checks the staged assembly for boundary conflicts, and materializes the repository.

**Error Scenarios**:
- Template reference cannot be resolved from the local template inventory: the operation is aborted and the developer is notified with no files written.
- Two applied templates in the staged assembly claim the same ground: the operation is aborted before any file is written, naming the contesting templates and the contested ground.

**Steps**:
1. [x] - `p1` - Developer invokes the apply command with a template reference and a target directory path. - `inst-seed-invoke`
2. [x] - `p1` - **IF** the template reference resolves to no entry in the local template inventory - `inst-seed-check-resolved`
   1. [x] - `p1` - **RETURN** apply aborted — template reference not found in local inventory. - `inst-seed-abort-not-found`
3. [x] - `p1` - The CLI resolves the referenced template and, per `cpt-frontx-adr-composed-template-resolution`, the templates its preset references, producing the set to apply. - `inst-seed-resolve-set`
4. [x] - `p1` - The CLI stages the resolved set as an assembly against the empty target directory through the uniform apply path (`cpt-frontx-algo-cli-scaffolding-uniform-apply`). - `inst-seed-stage`
5. [x] - `p1` - The CLI submits the staged assembly to the pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`). - `inst-seed-conflict-check`
6. [x] - `p1` - **IF** the conflict check reports an intersecting claim - `inst-seed-if-conflict`
   1. [x] - `p1` - **RETURN** apply aborted — the contesting templates and the contested ground are reported; no files written. - `inst-seed-abort-conflict`
7. [x] - `p1` - The CLI materializes the staged assembly into the target directory, composing every shared file from its co-owning templates' owned regions per `cpt-frontx-algo-cli-scaffolding-compose-shared-files`. - `inst-seed-materialize`
8. [x] - `p1` - **RETURN** apply complete — repository seeded and one provenance record written per applied template. - `inst-seed-return-done`

### Add a Template into an Existing Repository

- [x] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-add-template`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer applies an installed template into a repository that already holds applied templates; the CLI checks the new template's declared boundaries against those already occupied and, finding no intersection, materializes only the new template's contribution.

**Error Scenarios**:
- Template reference cannot be resolved from the local template inventory: the operation is aborted and the developer is notified with no files written.
- An already-applied template's provenance record cannot be matched to an installed template, either by the identity it names or by the source address it records, or the matched template does not satisfy the manifest contract: the operation is aborted naming that record's source-spec, because the boundaries that template occupies cannot be established and proceeding would check the new template against an incomplete picture.
- The new template's declared boundaries intersect an already-applied template's boundaries: the operation is aborted before any file is written, naming the contesting templates and the contested ground.

**Steps**:
1. [x] - `p1` - Developer invokes the apply command with a template reference and the path of a repository that already holds applied templates. - `inst-add-invoke`
2. [x] - `p1` - **IF** the template reference resolves to no entry in the local template inventory - `inst-add-check-resolved`
   1. [x] - `p1` - **RETURN** apply aborted — template reference not found in local inventory. - `inst-add-abort-not-found`
3. [x] - `p1` - The CLI resolves the referenced template and any templates its preset references into the set to apply. - `inst-add-resolve-set`
4. [x] - `p1` - The CLI stages the resolved set as an assembly against the existing repository through the same uniform apply path used to seed a repository (`cpt-frontx-algo-cli-scaffolding-uniform-apply`). - `inst-add-stage`
5. [x] - `p1` - The CLI establishes the boundaries already occupied by matching each existing provenance record to an installed template — first by the identity the record names, and failing that by the source address the record records, so that a record written before identity came from the manifest still resolves — and reading the matched template's declared boundaries. - `inst-add-resolve-occupied`
6. [x] - `p1` - **IF** any existing record matches no installed template by either identity or source address, matches more than one by source address, or matches a template that does not satisfy the manifest contract - `inst-add-check-occupied`
   1. [x] - `p1` - **RETURN** apply aborted — the unresolvable record's identity and its source-spec are reported; no files written, because an incomplete occupied set would let the conflict check pass a claim it should refuse. - `inst-add-abort-occupied-unknown`
7. [x] - `p1` - The CLI submits the staged assembly, together with the boundaries already occupied by the repository's applied templates, to the pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`). - `inst-add-conflict-check`
8. [x] - `p1` - **IF** the conflict check reports an intersecting claim against an already-applied boundary - `inst-add-if-conflict`
   1. [x] - `p1` - **RETURN** apply aborted — the contesting templates and the contested ground are reported; no files written. - `inst-add-abort-conflict`
9. [x] - `p1` - The CLI materializes only the newly applied templates' contribution into the repository, composing any shared file it co-owns with an already-applied template from their owned regions per `cpt-frontx-algo-cli-scaffolding-compose-shared-files`. - `inst-add-materialize`
10. [x] - `p1` - **RETURN** apply complete — one provenance record added per newly applied template. - `inst-add-return-done`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures called by actor flows above.

### Uniform Template Apply

- [x] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-uniform-apply`

**Input**: A resolved set of templates to apply (each with identity, version, installed content path, and declared ownership boundaries) and a target repository path that is either empty or already holds applied templates.

**Output**: A staged assembly ready for the conflict check, or an apply abort reason.

**Steps**:
1. [x] - `p1` - Receive the resolved set of templates and the target repository path. - `inst-ua-receive`
2. [x] - `p1` - Read each template's manifest to obtain ONLY its four declared categories — identity, version, declared ownership boundaries, and referenced templates; the manifest declares no content and carries no file bodies. - `inst-ua-read-manifests`
3. [x] - `p1` - Read each template's content items directly from its installed content path — the resolved on-disk template materialized into the local inventory by `cpt-frontx-feature-template-resolution` — never from its manifest. - `inst-ua-read-content`
4. [x] - `p1` - **FOR EACH** template in the resolved set - `inst-ua-foreach-template`
   - [x] - `p1` - Compute the content items the template contributes by scoping the content read from its installed content path to the exclusive subtrees and shared-file regions its manifest declares to occupy. - `inst-ua-compute-contribution`
   - [x] - `p1` - Add the template's contribution and declared boundaries to the staged assembly, tagged with the template's identity. - `inst-ua-stage-contribution`
5. [x] - `p1` - **RETURN** the staged assembly carrying every applied template's contribution and declared boundaries, for the conflict check to evaluate. - `inst-ua-return-staged`

### Pre-Flight Assembly Conflict Check

- [x] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-conflict-check`

**Input**: A staged assembly (per-template contributions and declared ownership boundaries) plus the ownership boundaries already occupied by any templates previously applied to the target repository.

**Output**: A pass result that clears the assembly for materialization, or a conflict report naming each contested ground and its contesting templates — produced before any file is written.

**Steps**:
1. [x] - `p1` - Combine the staged assembly's declared boundaries with the boundaries already occupied in the target repository into one comparison set, each entry tagged with its owning template identity. - `inst-cc-combine`
2. [x] - `p1` - **FOR EACH** pair of applied templates in the comparison set - `inst-cc-foreach-pair`
   - [x] - `p1` - **IF** both templates declare the same exclusive subtree - `inst-cc-if-subtree-clash`
      1. [x] - `p1` - Record a conflict entry naming the contested subtree and the two contesting template identities. - `inst-cc-record-subtree-conflict`
   - [x] - `p1` - **IF** both templates claim the same shared-file path and either both declare merge strategy `exclusive` for it, or one declares `exclusive` while the other declares `region-union` (whole-file ownership of a shared file cannot be shared, per `cpt-frontx-feature-template-manifest`) - `inst-cc-if-exclusive-clash`
      1. [x] - `p1` - Record a conflict entry naming the contested file path and the two contesting template identities. - `inst-cc-record-exclusive-conflict`
   - [x] - `p1` - **IF** both templates declare merge strategy `region-union` on the same shared-file path and claim the same declared region key - `inst-cc-if-region-key-clash`
      1. [x] - `p1` - Record a conflict entry naming the contested file path, the contested region key, and the two contesting template identities. - `inst-cc-record-region-conflict`
3. [x] - `p1` - **IF** any conflict entries were recorded - `inst-cc-if-any-conflict`
   1. [x] - `p1` - **RETURN** the conflict report listing every contested ground and its contesting templates; the assembly is refused and no files are written, never silently merged. - `inst-cc-return-conflict`
4. [x] - `p1` - **RETURN** pass — the declared boundaries do not intersect; the assembly is cleared for materialization. - `inst-cc-return-pass`

### Compose Shared Files from Owned Regions at Materialization

- [x] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-compose-shared-files`

**Input**: The conflict-cleared staged assembly (per-template contributions and declared ownership boundaries, including `region-union` shared-file entries with their owned region keys, per `cpt-frontx-feature-template-manifest`) and the target repository path.

**Output**: For each repository file path, the materialized file body — a single owner's content for an `exclusive` path or exclusive subtree, or the composed disjoint-region union for a `region-union` path — written to the target repository; a materialization-invariant error if a declared-level collision (same region key, or a contested `exclusive` path) reaches this stage; or a materialization conflict refusing the assembly when any two owned regions on the path — across templates or within a single template's multiple keys — have overlapping actual on-disk marker spans (the content-level check the pre-flight cannot perform).

**Steps**:
1. [x] - `p1` - Group the staged assembly's contributions by target repository file path, carrying each contributing template's identity, declared merge strategy, and owned region keys. - `inst-cs-group-by-path`
2. [x] - `p1` - **FOR EACH** target file path owned whole by exactly one template (an exclusive subtree or a whole-file `exclusive` claim) - `inst-cs-foreach-single`
   1. [x] - `p1` - Write that template's content for the path directly. - `inst-cs-write-single`
3. [x] - `p1` - **FOR EACH** target file path with any `region-union` contribution — one contributor or many - `inst-cs-foreach-multi`
   1. [x] - `p1` - **IF** more than one contributor claims the path and any of them declares `exclusive` for it - `inst-cs-if-exclusive-contested`
      1. [x] - `p1` - **RETURN** a materialization-invariant error naming the contested path and do not write the file — a contested `exclusive` path must have been refused by the pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`), so reaching materialization is an invariant violation. - `inst-cs-return-exclusive-invariant`
   2. [x] - `p1` - **FOR EACH** contributing template, locate and extract its owned region(s) from its installed content by matching the begin/end sentinel markers keyed by that template's identity and each declared region key (region-addressing schema owned by `cpt-frontx-feature-template-manifest`). - `inst-cs-extract-regions`
   3. [x] - `p1` - **IF** two contributors resolved the same declared region key on the path - `inst-cs-if-key-collision`
      1. [x] - `p1` - **RETURN** a materialization-invariant error naming the contested region key and templates — a same-declared-key collision must have been refused by the pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`), so reaching materialization is an invariant violation. - `inst-cs-return-key-invariant`
   4. [x] - `p1` - **IF** any two extracted regions on the path have overlapping actual on-disk marker spans — whether owned by different templates or by the same template declaring multiple region keys - `inst-cs-if-span-overlap`
      1. [x] - `p1` - **RETURN** a materialization conflict naming the contested file, the overlapping region markers, and the owning template(s); refuse the assembly and write no file. Actual marker-span overlap is a content-level property that neither pre-publish manifest validation (well-formed keys only) nor the pre-flight conflict check (declared keys only) can observe, so materialization — run per shared-file path regardless of contributor count — is where it is first detectable and refused, covering single-template self-overlap as well as cross-template overlap. - `inst-cs-return-span-overlap`
   5. [x] - `p1` - Compose the repository file as the disjoint union of every contributor's extracted region(s), preserving each region's sentinel markers so a later boundary-scoped upgrade can re-locate it, in a deterministic order (by owning template identity, then region key). - `inst-cs-compose-union`
   6. [x] - `p1` - Write the composed file to the target repository. - `inst-cs-write-composed`
4. [x] - `p1` - **RETURN** the materialized repository files. - `inst-cs-return-materialized`

## 4. States (CDSL)

### Assembly Operation State Machine

- [x] `p2` - **ID**: `cpt-frontx-state-cli-scaffolding-assembly-op`

**States**: REQUESTED, RESOLVED, CONFLICT_CHECKED, ASSEMBLED, ABORTED

**Initial State**: REQUESTED

**Transitions**:
1. [x] - `p1` - **FROM** REQUESTED **TO** RESOLVED **WHEN** every referenced template — including a preset's referenced templates — is located in the local inventory and staged as an assembly. - `inst-as-req-resolved`
2. [x] - `p1` - **FROM** REQUESTED **TO** ABORTED **WHEN** a template reference cannot be resolved from the local inventory. - `inst-as-req-aborted-unresolved`
3. [x] - `p1` - **FROM** RESOLVED **TO** CONFLICT_CHECKED **WHEN** the pre-flight conflict check finds no intersecting boundary claim across the staged assembly and any already-occupied boundaries. - `inst-as-resolved-checked`
4. [x] - `p1` - **FROM** RESOLVED **TO** ABORTED **WHEN** the pre-flight conflict check reports an intersecting boundary claim; no files are written. - `inst-as-resolved-aborted-conflict`
5. [x] - `p1` - **FROM** CONFLICT_CHECKED **TO** ASSEMBLED **WHEN** the cleared assembly is materialized into the target repository and one provenance record is written per applied template. - `inst-as-checked-assembled`

## 5. Definitions of Done

### Uniform Apply Path

- [x] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-uniform-apply`

The system **MUST** apply any installed template through one uniform path (`target`), such that seeding a new repository and adding a template into a repository that already holds applied templates invoke the same mechanism and differ only in whether the target already holds applied templates — with no per-template-category dispatch and no second apply path.

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-algo-cli-scaffolding-uniform-apply`

**Constraints**: (none owned by this feature)

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-assembler`
- Entities: `Template`, `Assembly`

### Pre-Flight Conflict Check Before Any Write

- [x] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-conflict-check`

The system **MUST** run a pre-flight intersection check over the staged assembly and any already-occupied boundaries and **MUST** refuse the whole assembly before writing any file when two applied templates claim the same exclusive subtree or the same shared-file region without a compatible declared merge, reporting the contesting templates and the contested ground and never silently merging (`target`).

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-algo-cli-scaffolding-conflict-check`

**Constraints**: `cpt-frontx-constraint-cli-assembly-conflict-prevention`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-conflict-checker`
- Entities: `Assembly`, `OwnershipBoundary`

### Shared-File Region Composition at Materialization

- [x] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-compose-shared-files`

The system **MUST** materialize a shared file co-owned by more than one applied template by extracting each template's owned region(s) from its installed content (located by the identity-and-region-key sentinel markers whose schema `cpt-frontx-feature-template-manifest` owns) and writing the disjoint union of those regions to a single repository file, preserving the region markers for later boundary-scoped upgrade; an `exclusive` path is written whole by its single owner. Declared-level collisions (same region key, or a contested `exclusive` path) reaching materialization are invariant violations because the pre-flight conflict check already refuses them, whereas an overlap between any two owned regions' actual on-disk marker spans — whether contributed by different templates or by a single template declaring multiple keys — is a content-level property the pre-flight cannot observe, so materialization (run per shared-file path regardless of contributor count) is the authority that detects it and refuses the assembly (`target`).

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-algo-cli-scaffolding-compose-shared-files`

**Constraints**: `cpt-frontx-constraint-cli-boundary-declaration`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-assembler`
- Entities: `Template`, `OwnershipBoundary`, `Assembly`

### Ownership-Boundary-Declared Assembly

- [x] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-boundary-declared-assembly`

The system **MUST** assemble a repository from one or more independently-applied templates — including a preset's referenced templates resolved and applied together — reading each template's declared ownership boundaries from its manifest, reading that template's content from its installed content path scoped to those declared boundaries (never from the manifest), and writing one provenance record per applied template (`target`).

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-algo-cli-scaffolding-uniform-apply`

**Constraints**: `cpt-frontx-constraint-cli-boundary-declaration`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-assembler`
- Entities: `Template`, `OwnershipBoundary`, `Assembly`

## 6. Acceptance Criteria

- [ ] `architecture/features/cli-scaffolding/FEATURE.md` exists with all template sections in order.
- [ ] Applying a template to an empty target directory seeds a repository through the same apply path used to add a template into an existing repository. (`target`)
- [ ] Adding a template into a repository that already holds applied templates checks the new template's declared boundaries against the already-occupied boundaries before any write. (`target`)
- [ ] A preset's referenced templates are resolved and applied together in one operation, one provenance record written per applied template. (`target`)
- [ ] Apply is aborted with notification and no files written when the template reference cannot be resolved from the local inventory. (`target`)
- [ ] The pre-flight conflict check refuses the whole assembly before any write, reporting the contesting templates and the contested ground, when two applied templates claim: the same exclusive subtree; the same shared-file path with two `exclusive` claims or one `exclusive` mixed with a `region-union` claim; or the same declared region key on one `region-union` shared-file path. (`target`)
- [ ] A shared file co-owned by two or more applied templates under `region-union` is materialized as the disjoint union of each template's owned region(s), extracted from installed content by the identity-and-region-key sentinel markers and written with those markers preserved; an `exclusive` path is written whole by its single owner. (`target`)
- [ ] Materialization refuses the assembly when any two owned regions on a shared-file path have overlapping actual on-disk marker spans — whether contributed by different templates or by a single template declaring multiple keys — the content-level check that runs per shared-file path regardless of contributor count and that the pre-flight conflict check cannot perform. (`target`)
- [ ] No apply path silently merges conflicting claims. (`target`)
- [ ] The apply command surface is part of `cpt-frontx-interface-cli`; an incompatible change to the surface requires a major version bump per `cpt-frontx-adr-artifact-versioning-and-distribution`. (`target`)
