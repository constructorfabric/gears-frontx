# Feature: Kindless Template Assembly & Conflict-Checked Composition

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Preview an Explicit Batch](#preview-an-explicit-batch)
  - [Seed a New or Empty Repository](#seed-a-new-or-empty-repository)
  - [Apply a Batch into an Already-Assembled Repository](#apply-a-batch-into-an-already-assembled-repository)
  - [Delete an Applied Target](#delete-an-applied-target)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Resolve and Stage an Explicit Batch](#resolve-and-stage-an-explicit-batch)
  - [Pre-Flight, Nesting-Aware Target Conflict Check](#pre-flight-nesting-aware-target-conflict-check)
  - [Existing-Content Reconciliation](#existing-content-reconciliation)
  - [Compute a Target's Deletion Plan](#compute-a-targets-deletion-plan)
  - [Materialize or Remove the CLI-Owned AI-Extension Bundle](#materialize-or-remove-the-cli-owned-ai-extension-bundle)
- [4. States (CDSL)](#4-states-cdsl)
  - [Assembly Operation State Machine](#assembly-operation-state-machine)
  - [Delete Operation State Machine](#delete-operation-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [One Uniform Batch Path: Preview and Apply](#one-uniform-batch-path-preview-and-apply)
  - [Nesting-Aware, Fail-Closed Conflict Check](#nesting-aware-fail-closed-conflict-check)
  - [Existing-Content Protocol and Idempotent Re-Apply](#existing-content-protocol-and-idempotent-re-apply)
  - [Delete Under Explicit Confirmation](#delete-under-explicit-confirmation)
  - [CLI-Owned AI-Extension Bundle Materialization](#cli-owned-ai-extension-bundle-materialization)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-cli-scaffolding`

## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-cli-scaffolding`

### 1.1 Overview

`@gears-frontx/cli` applies any registered template through one uniform batch path: `assemble` previews an explicit, target-keyed batch statelessly and writes nothing; `apply` independently re-resolves and re-validates the identical batch shape and materializes it, whether the target repository has never had a template applied (seed) or already carries applied templates (add). A pre-flight, nesting-aware conflict check canonicalizes every target and refuses the whole batch before any file is written when two targets coincide, when one contains another outside a declared exclusion, or when a target lands on reserved project ground. This feature also owns `delete`, which computes a target's deletion plan through the same conflict-checker geometry and executes it only under explicit confirmation. All CDSL behavior is `target` (GREENFIELD — grounded in `cpt-frontx-adr-composed-template-resolution`, `cpt-frontx-adr-template-ownership-boundary-declaration`, `cpt-frontx-adr-assembly-conflict-prevention`, and DESIGN §3.2/§3.6).

Composition is no longer resolved from a manifest-declared reference graph: a batch names exactly the templates and targets a caller wants applied, and no template may pull in another through its own manifest. Ownership is no longer declared as a two-tier exclusive-subtree-plus-shared-file-region structure: a template owns its entire target by default, narrowed only by its manifest's `excludedSubtrees` and the project's `projectOwnedRoots`. There is no `sharedFiles` construct, no merge strategy, and no region marker of any kind — no two templates ever write into the same target, so there is nothing to compose at the file level.

### 1.2 Purpose

This feature realizes the explicit target-keyed batch model decided in `cpt-frontx-adr-composed-template-resolution`, the whole-target ownership model decided in `cpt-frontx-adr-template-ownership-boundary-declaration`, and the nesting-aware, fail-closed conflict check decided in `cpt-frontx-adr-assembly-conflict-prevention`. It covers previewing a batch (`assemble`), materializing a batch to seed a new repository or extend one that already holds applied templates (`apply`), and deleting an applied target (`delete`). It realizes the internal components `cpt-frontx-component-cli-assembler` (batch resolution, materialization, existing-content reconciliation, delete) and `cpt-frontx-component-cli-conflict-checker` (canonicalization and the nesting-aware intersection check, reused identically by `assemble`, `apply`, `delete`, and `cpt-frontx-feature-composed-provenance`'s `ownership add`).

Earlier revisions of this feature resolved a template's manifest-declared preset (`referencedTemplates`) transitively and composed shared files from declared, merge-strategy-tagged regions; both are retired. Composition is now driven only by the caller's explicit batch, and a target is owned wholly by one template — there is no region-level co-ownership, no `compose-shared-files` algorithm, and no marker-delimited block to locate, carry forward, or refuse. Delete is owned here: the Assembler computes a deletion plan through the Conflict Checker's geometry.

A template's AI-extension bundle at `.frontx/ai/<manifest-name>/` is delivered by a dedicated CLI-owned step this feature owns (`cpt-frontx-algo-cli-scaffolding-ai-bundle`), never through the template's own ownership. `cpt-frontx-adr-template-ownership-boundary-declaration` unconditionally subtracts `.frontx` from every template's effective ownership, so no template may claim or materialize a bundle there through the ownership mechanism this feature implements for targets; instead, the first `apply` that gives a template name its first target copies that name's `.frontx/ai/<manifest-name>/` convention folder — when the template's payload carries one — out of the template's installed content path and into the project's `.frontx/ai/<manifest-name>/`, exactly as the CLI itself writes `.frontx/project.json`: a CLI-owned write no template manifest declares and no ownership-boundary computation ever attributes to the template. The bundle is materialized once per name, refreshed by `upgrade` when a new version of the name's payload carries a new bundle (`cpt-frontx-feature-upgrade-changeset`), and removed by `delete` when a name's last remaining target is deleted. This feature's conflict check and materialization continue to treat `.frontx` as reserved ground no target may ever claim; that reservation is what makes the CLI-owned bundle step safe to run unconditionally rather than a further rule this feature's conflict check enforces per bundle.

**Requirements**: `cpt-frontx-fr-cli-seed-repository`, `cpt-frontx-fr-cli-add-template-to-repository`, `cpt-frontx-fr-cli-template-boundary-declaration`, `cpt-frontx-fr-cli-assembly-conflict-prevention`, `cpt-frontx-fr-cli-template-delete`

**Principles**: `cpt-frontx-principle-ownership-bounded-composition`, `cpt-frontx-cli-principle-reviewed-reversible-mutation`

**Applicability** (Often-N/A domains for a CLI Command feature, per the FEATURE checklist's Applicability Context): COMPL is not applicable — no regulatory or compliance scope attaches to file-lifecycle operations on a developer's own repository. OPS (observability) is not applicable — this feature introduces no logging, metrics, or tracing surface of its own beyond the uniform envelope and the `--dry-run`/preview reporting it already specifies. SEC is partially addressed rather than N/A: the Conflict Checker's fail-closed path canonicalization (`inst-cc-canonicalize`, `INVALID_PATH`) is a path-traversal control, though this feature enforces no authentication or authorization boundary. PERF is addressed by `cpt-frontx-cli-nfr-template-scale` (§6, Acceptance Criteria). UX is addressed by `assemble`'s preview report and `delete`'s confirmation/dry-run surface (§2).

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Previews and applies an explicit batch to seed or extend a repository, resolves any reported conflict or existing-content decision, and confirms or declines a delete — directly or through an AI agent acting on their authorization |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-composed-template-resolution`, `cpt-frontx-adr-template-ownership-boundary-declaration`, `cpt-frontx-adr-assembly-conflict-prevention`, `cpt-frontx-adr-source-spec-syntax`, `cpt-frontx-adr-uniform-cli-json-envelope`, `cpt-frontx-adr-cli-internal-decomposition`
- **Dependencies**:
  - `cpt-frontx-feature-template-resolution` (F10 — resolves and auto-installs a registered template's content)
  - `cpt-frontx-feature-composed-provenance` (owns `.frontx/project.json`: this feature reads registered origins and every already-applied target and `projectOwnedRoots` from it, and records every newly applied or deleted target into it)

## 2. Actor Flows (CDSL)

**Use cases**: `cpt-frontx-usecase-scaffold-composed-project`, `cpt-frontx-usecase-add-microfrontend-to-project`, `cpt-frontx-usecase-ai-driven-template-delete`

### Preview an Explicit Batch

- [ ] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-assemble-preview`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-seq-composed-project-scaffold`

**Success Scenarios**:
- Developer supplies a batch `{"templates": {"<name>": ["<target>", ...]}}` to `assemble`; the CLI resolves each named template, computes effective ownership, and runs the nesting-aware conflict check against the batch plus everything already applied; the repository is byte-identical before and after — nothing is written.

**Error Scenarios**:
- A named template has no entry in the project state store: the CLI reports `TEMPLATE_NOT_REGISTERED` and previews nothing further for that entry.
- The conflict check reports an intersecting claim: the CLI reports `TARGET_CONFLICT`, naming the contesting templates and the contested ground.

**Steps**:
1. [ ] - `p1` - Developer invokes `assemble` with a batch naming, for each registered template, the target or targets to apply it to - `inst-asm-invoke`
2. [ ] - `p1` - The CLI invokes the batch resolution algorithm (`cpt-frontx-algo-cli-scaffolding-uniform-apply`) in preview mode, auto-installing a named template's registered origin when its content is not yet locally available - `inst-asm-resolve`
3. [ ] - `p1` - **IF** any named template has no entry in the project state store, or its registered origin cannot be auto-installed - `inst-asm-if-resolve-fail`
   1. [ ] - `p1` - **RETURN** the corresponding failure (`TEMPLATE_NOT_REGISTERED` or `ORIGIN_UNAVAILABLE`); nothing written - `inst-asm-return-resolve-fail`
4. [ ] - `p1` - The CLI submits the staged batch to the pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`) against everything already applied, read from the project state store - `inst-asm-conflict-check`
5. [ ] - `p1` - **IF** the check reports an intersecting claim - `inst-asm-if-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT` naming the contesting templates and the contested ground; nothing written - `inst-asm-return-conflict`
6. [ ] - `p1` - **RETURN** the preview report — resolution, effective ownership per target, and a clean pass; the repository and the project state store are untouched - `inst-asm-return-preview`

### Seed a New or Empty Repository

- [ ] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-seed-repository`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-seq-composed-project-scaffold`

**Success Scenarios**:
- Developer invokes `seed <dir> --input <batch>` against a new or empty project directory that carries no `.frontx/project.json` yet: the CLI creates `.frontx/project.json`, auto-registers each official default template named in the batch — resolving its origin, pinning it, and writing its entry through the register algorithm (`cpt-frontx-algo-composed-provenance-register`, `cpt-frontx-feature-composed-provenance`) exactly as a direct `register` call would — then applies the batch through the identical apply mechanism `cpt-frontx-flow-cli-scaffolding-add-template` uses: resolving, conflict-checking against reserved ground only (nothing is applied yet), reconciling each target's existing on-disk content if any, and materializing every target in one operation, recording each under its template's entry.

**Error Scenarios**:
- `<dir>` already carries a `.frontx/project.json`: `seed` refuses with `INVALID_INPUT` — a project once seeded is extended through `apply`, never re-seeded; nothing written.
- A batch entry names a template that is not one of the CLI's built-in official default origins: `seed` accepts only the official defaults, since no `.frontx/project.json` can yet exist for anything to already be registered against; the CLI refuses with `TEMPLATE_NOT_REGISTERED`, naming the entry and directing the developer to `register` the template — which creates `.frontx/project.json` on this first mutation if it does not exist yet, exactly as `seed` itself would have — and then `apply` it: no prior `seed` call is required for this path, `register` then `apply` is the complete bootstrap on its own; whole batch aborted, nothing written.
- A named official default's origin cannot be resolved and pinned: `ORIGIN_UNAVAILABLE`; whole batch aborted, `.frontx/project.json` left uncreated.
- Two batch entries collide or one contains another outside a declared `excludedSubtrees`, or a batch entry lands on `.frontx` or a reserved environment entry (there is no `projectOwnedRoots` yet to land on): `TARGET_CONFLICT`; whole batch aborted, nothing written.
- A target's existing on-disk content differs from what the template's payload would write at a path the payload declares: `CONTENT_CONFLICT`; whole batch aborted, nothing written.
- A target already holds content at a path the payload does not declare: `EXISTING_PATHS_REQUIRE_DECISION`; whole batch aborted unless `--adopt-existing` is given.

**Steps**:
1. [ ] - `p1` - Developer invokes `seed <dir> --input <batch>`, naming in the batch the official default templates to apply - `inst-seed-invoke`
2. [ ] - `p1` - **IF** `<dir>` already carries a `.frontx/project.json` - `inst-seed-if-already-seeded`
   1. [ ] - `p1` - **RETURN** `INVALID_INPUT`, directing the developer to `apply` instead; nothing written - `inst-seed-return-already-seeded`
3. [ ] - `p1` - The CLI creates `.frontx/project.json` with the initial empty shape (`cpt-frontx-algo-composed-provenance-project-state-io`) - `inst-seed-create-project-state`
4. [ ] - `p1` - **FOR EACH** batch entry naming an official default template not yet registered - `inst-seed-foreach-default`
   1. [ ] - `p1` - The CLI resolves the built-in default's origin and invokes the register algorithm (`cpt-frontx-algo-composed-provenance-register`) to pin it and write `templates[name]` - `inst-seed-register-default`
   2. [ ] - `p1` - **IF** resolution or registration fails - `inst-seed-if-register-fail`
      1. [ ] - `p1` - **RETURN** `ORIGIN_UNAVAILABLE` naming the default and its origin; abort before any target is applied - `inst-seed-return-register-fail`
5. [ ] - `p1` - The CLI resolves and re-stages the batch (`cpt-frontx-algo-cli-scaffolding-uniform-apply`) against the now-registered names - `inst-seed-resolve`
6. [ ] - `p1` - **IF** any named template still has no entry in the project state store, or its registered origin cannot be auto-installed - `inst-seed-if-resolve-fail`
   1. [ ] - `p1` - **RETURN** the corresponding failure (`TEMPLATE_NOT_REGISTERED` or `ORIGIN_UNAVAILABLE`); nothing further written - `inst-seed-return-resolve-fail`
7. [ ] - `p1` - The CLI runs the pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`); because no template has yet been applied in this project, the comparison set is the batch's own entries plus reserved ground only (`.frontx`, the reserved environment entries `.git`/`.DS_Store`/`Thumbs.db`; there is no `projectOwnedRoots` yet) - `inst-seed-conflict-check`
8. [ ] - `p1` - **IF** the check reports an intersecting claim - `inst-seed-if-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT`; nothing written - `inst-seed-return-conflict`
9. [ ] - `p1` - The CLI runs existing-content reconciliation (`cpt-frontx-algo-cli-scaffolding-existing-content`) for every target in the batch — every target is unrecorded, since the project state store was just created empty - `inst-seed-existing-content`
10. [ ] - `p1` - **IF** any target reports a content conflict, or reports additional paths and `--adopt-existing` was not given - `inst-seed-if-existing-conflict`
    1. [ ] - `p1` - **RETURN** `CONTENT_CONFLICT` or `EXISTING_PATHS_REQUIRE_DECISION` naming the paths; nothing written for the whole batch - `inst-seed-return-existing-conflict`
11. [ ] - `p1` - The CLI materializes every target in the batch in one operation, leaving any adopted additional paths untouched - `inst-seed-materialize`
12. [ ] - `p1` - For each template name that just received its first target, the CLI materializes that name's CLI-owned AI-extension bundle (`cpt-frontx-algo-cli-scaffolding-ai-bundle`) into `.frontx/ai/<manifest-name>/`, when the template's payload carries one - `inst-seed-materialize-bundle`
13. [ ] - `p1` - The CLI records every newly applied target under its template's entry in the project state store (`cpt-frontx-feature-composed-provenance`) - `inst-seed-record`
14. [ ] - `p1` - **RETURN** success — repository seeded, every default registered, every target recorded - `inst-seed-return-done`

### Apply a Batch into an Already-Assembled Repository

- [ ] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-add-template`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-seq-composed-project-scaffold`

**Success Scenarios**:
- Developer supplies a batch to `apply` for a project that already has at least one applied target: the CLI runs the identical mechanism as seeding, except the conflict check now also compares the batch against every already-applied target read from the project state store.
- Developer supplies a batch to `apply` for a project with zero applied targets: `.frontx/project.json` already exists — created by a prior, separate `register` call on its own first mutation, since `apply` requires every named template to already have a `templates[name]` entry to resolve against and so can never itself be the first thing to touch a truly virgin directory — but every template's `targets[]` in it is still empty. `apply` runs the identical mechanism as the already-applied case; this is the ordinary bootstrap path for a non-official, forked, or `path:` template into a fresh repository, requiring no prior `seed` call, and the conflict check's comparison set is reserved ground only, exactly as it is when `seed` runs against the same starting state.
- Developer re-applies the same template to the same target a second time — whether or not the on-disk content still matches exactly — and that target is already recorded under that template's `targets[]` entry in the project state store: the CLI treats it as an idempotent no-op purely by that record, reading no on-disk content and running no existing-content reconciliation for it.

**Error Scenarios**:
- Same as seeding, plus: a batch entry coincides with, or is an undeclared ancestor/descendant of, a target another template already occupies: `TARGET_CONFLICT`, naming the contesting templates and the contested ground; whole batch aborted, nothing written.
- A batch entry lands on `projectOwnedRoots`, `.frontx`, a local origin folder, or a reserved environment entry (`.git`, `.DS_Store`, `Thumbs.db`): `TARGET_CONFLICT`; whole batch aborted, nothing written.

**Steps**:
1. [ ] - `p1` - Developer invokes `apply` with a batch naming one or more registered templates and targets, individually or together, against a repository that already has at least one applied target - `inst-add-invoke`
2. [ ] - `p1` - The CLI independently re-resolves and re-stages the batch (`cpt-frontx-algo-cli-scaffolding-uniform-apply`) - `inst-add-resolve`
3. [ ] - `p1` - **IF** any named template has no entry in the project state store, or its registered origin cannot be auto-installed - `inst-add-if-resolve-fail`
   1. [ ] - `p1` - **RETURN** the corresponding failure (`TEMPLATE_NOT_REGISTERED` or `ORIGIN_UNAVAILABLE`); nothing written - `inst-add-return-resolve-fail`
4. [ ] - `p1` - The CLI runs the pre-flight conflict check (`cpt-frontx-algo-cli-scaffolding-conflict-check`) against the batch's own entries and every target already recorded in the project state store - `inst-add-conflict-check`
5. [ ] - `p1` - **IF** the check reports an intersecting claim against an already-applied target, or among the batch's own entries, or against reserved ground - `inst-add-if-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT` naming the contesting templates and the contested ground; nothing written - `inst-add-return-conflict`
6. [ ] - `p1` - **FOR EACH** target in the batch already recorded under its named template's `targets[]` entry in the project state store - `inst-add-if-recorded-noop`
   1. [ ] - `p1` - Treat it as an idempotent no-op by that record alone: no on-disk content is read for it, existing-content reconciliation never runs for it, and no file is written for it - `inst-add-noop-target`
7. [ ] - `p1` - The CLI runs existing-content reconciliation (`cpt-frontx-algo-cli-scaffolding-existing-content`) only for every target in the batch **not** already recorded under its template's `targets[]` entry, against whatever is already on disk there — nothing, or foreign content (never this template's own previously-applied content, since that case is already resolved as a no-op by record in the prior step) - `inst-add-existing-content`
8. [ ] - `p1` - **IF** any unrecorded target reports a content conflict, or reports additional paths and `--adopt-existing` was not given - `inst-add-if-existing-conflict`
   1. [ ] - `p1` - **RETURN** `CONTENT_CONFLICT` or `EXISTING_PATHS_REQUIRE_DECISION` naming the paths; nothing written for the whole batch - `inst-add-return-existing-conflict`
9. [ ] - `p1` - The CLI materializes every target in the batch that is not an idempotent no-op-by-record, leaving any adopted additional paths untouched - `inst-add-materialize`
10. [ ] - `p1` - For each template name that just received its first target in this batch, the CLI materializes that name's CLI-owned AI-extension bundle (`cpt-frontx-algo-cli-scaffolding-ai-bundle`) into `.frontx/ai/<manifest-name>/`, when the template's payload carries one - `inst-add-materialize-bundle`
11. [ ] - `p1` - The CLI records every newly applied target under its template's entry in the project state store - `inst-add-record`
12. [ ] - `p1` - **RETURN** success — new targets recorded; already-recorded targets reported as no-ops-by-record - `inst-add-return-done`

### Delete an Applied Target

- [ ] `p1` - **ID**: `cpt-frontx-flow-cli-scaffolding-delete-target`

**Actor**: `cpt-frontx-actor-project-developer`

**Realizes**: `cpt-frontx-cli-seq-ai-driven-delete`

**Success Scenarios**:
- Developer runs `delete <target>` interactively: the CLI computes the deletion plan, shows what would be deleted and what would be preserved, prompts for confirmation defaulting to No, and on explicit confirmation removes the deletion plan's ground from disk and removes the target from its template's entry in the project state store.
- An AI agent acting for the developer runs `delete <target> --json`: the CLI returns `CONFIRMATION_REQUIRED` with the delete/preserve lists, never prompting or reading stdin; having obtained the developer's authorization out of band, the agent re-issues the identical command with `--yes`, and the CLI recomputes the identical geometry — never trusting the first call's result — before deleting.
- Developer or agent runs `delete <target> --dry-run`: the CLI reports the same delete/preserve lists without deleting anything and without requiring confirmation in either mode, because nothing is at stake to confirm.

**Error Scenarios**:
- `<target>` is not found among any registered template's `targets` array: the CLI refuses with `TARGET_NOT_APPLIED`, naming the target as not an applied instance of any registered template.
- Interactive confirmation is declined (the default): nothing is deleted, the repository and the project state store are unchanged.
- `--json` mode without `--yes`: `CONFIRMATION_REQUIRED`; nothing deleted.

**Steps**:
1. [ ] - `p1` - Developer or AI agent invokes `delete <target>` (optionally `--json`, `--yes`, `--dry-run`) - `inst-del-invoke`
2. [ ] - `p1` - The CLI invokes the deletion-plan algorithm (`cpt-frontx-algo-cli-scaffolding-delete-plan`) against `<target>` - `inst-del-compute-plan`
3. [ ] - `p1` - **IF** `<target>` is not found in any template's `targets` array - `inst-del-if-not-applied`
   1. [ ] - `p1` - **RETURN** `TARGET_NOT_APPLIED`, naming the target as not an applied instance of any registered template - `inst-del-return-not-applied`
4. [ ] - `p1` - **IF** `--dry-run` was given - `inst-del-if-dry-run`
   1. [ ] - `p1` - **RETURN** the delete/preserve lists; nothing is deleted and no confirmation is required - `inst-del-return-dry-run`
5. [ ] - `p1` - **IF** `--json` was given - `inst-del-if-json`
   1. [ ] - `p1` - **IF** `--yes` was not given - `inst-del-if-json-no-yes`
      1. [ ] - `p1` - **RETURN** `CONFIRMATION_REQUIRED` with the delete/preserve lists; no prompt is shown and stdin is never read; nothing deleted - `inst-del-return-confirmation-required`
   2. [ ] - `p1` - **ELSE** (`--yes` given) - `inst-del-else-json-yes`
      1. [ ] - `p1` - Recompute the deletion plan from scratch, never trusting the first call's result - `inst-del-recompute-plan`
6. [ ] - `p1` - **ELSE** (interactive) - `inst-del-else-interactive`
   1. [ ] - `p1` - Prompt the developer to confirm, defaulting to No - `inst-del-prompt`
   2. [ ] - `p1` - **IF** the developer declines - `inst-del-if-declined`
      1. [ ] - `p1` - **RETURN** nothing deleted - `inst-del-return-declined`
7. [ ] - `p1` - Remove the deletion plan's ground from disk, preserving every path in the plan's preserve list - `inst-del-remove`
8. [ ] - `p1` - Remove `<target>` from its template's `targets` array in the project state store (`cpt-frontx-feature-composed-provenance`) - `inst-del-update-state`
9. [ ] - `p1` - **IF** this removal empties the owning template name's `targets` array - `inst-del-if-last-target`
   1. [ ] - `p1` - The CLI removes that name's CLI-owned AI-extension bundle at `.frontx/ai/<manifest-name>/`, if present (`cpt-frontx-algo-cli-scaffolding-ai-bundle`) - `inst-del-remove-bundle`
10. [ ] - `p1` - **RETURN** success — the deleted and preserved lists - `inst-del-return-success`

## 3. Processes / Business Logic (CDSL)

### Resolve and Stage an Explicit Batch

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-uniform-apply`

**Input**: An explicit batch `{"templates": {"<manifestName>": ["<target>", ...]}}`; the project state store's current document.

**Output**: A staged assembly — for each batch entry, the named template's resolved manifest, its installed content path, its declared `excludedSubtrees`, and the target(s) it is applied to — ready for the conflict check; or a resolution failure (`TEMPLATE_NOT_REGISTERED`, `ORIGIN_UNAVAILABLE`).

**Steps**:
1. [ ] - `p1` - Receive the batch and the current project state document - `inst-ua-receive`
2. [ ] - `p1` - **FOR EACH** template name in the batch - `inst-ua-foreach-name`
   1. [ ] - `p1` - **IF** the name has no entry in the project state store's `templates` map - `inst-ua-if-not-registered`
      1. [ ] - `p1` - **RETURN** `TEMPLATE_NOT_REGISTERED` naming the unregistered name; no further resolution - `inst-ua-return-not-registered`
   2. [ ] - `p1` - **IF** the registered origin's content is not already available in the local inventory - `inst-ua-if-not-installed`
      1. [ ] - `p1` - Auto-install it through the shared resolver (`cpt-frontx-feature-template-resolution`) using the registered, pinned origin - `inst-ua-auto-install`
      2. [ ] - `p1` - **IF** installation fails - `inst-ua-if-install-fail`
         1. [ ] - `p1` - **RETURN** `ORIGIN_UNAVAILABLE` naming the name and its origin - `inst-ua-return-unavailable`
   3. [ ] - `p1` - Read the resolved manifest's declared `excludedSubtrees` - `inst-ua-read-manifest`
   4. [ ] - `p1` - Compute the template's effective ownership for each of its batch targets as the target minus `excludedSubtrees` minus `projectOwnedRoots` minus `.frontx` minus the reserved environment entries (`.git`, `.DS_Store`, `Thumbs.db`) minus the template's own local origin folder (when installed by local path) - `inst-ua-compute-ownership`
   5. [ ] - `p1` - Stage the template's identity, installed content path, declared `excludedSubtrees`, and each target's effective ownership, tagged with the template's name - `inst-ua-stage-entry`
3. [ ] - `p1` - **RETURN** the staged assembly for the conflict check to evaluate - `inst-ua-return-staged`

### Pre-Flight, Nesting-Aware Target Conflict Check

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-conflict-check`

**Input**: A staged assembly's targets (per `cpt-frontx-algo-cli-scaffolding-uniform-apply`, or a single candidate path from `ownership add`); every target already recorded across every template's `targets` array in the project state store; the project's current `projectOwnedRoots`; the fixed set of reserved environment entries (`.git`, `.DS_Store`, `Thumbs.db`).

**Output**: A pass result, or a `TARGET_CONFLICT` report naming every contesting claim and the contested ground — produced before any file is written or any `projectOwnedRoots` entry is added.

**Steps**:
1. [ ] - `p1` - **FOR EACH** target under check (a staged batch target, or a candidate `ownership add` path) - `inst-cc-foreach-target`
   1. [ ] - `p1` - Canonicalize the target to a project-relative POSIX path; a symlink or a `..` segment can never resolve outside the project root - `inst-cc-canonicalize`
   2. [ ] - `p1` - **IF** the target cannot be proven to stay inside the project root - `inst-cc-if-escape`
      1. [ ] - `p1` - **RETURN** `INVALID_PATH` naming the unresolvable path; the check is fail-closed rather than guessing - `inst-cc-return-escape`
2. [ ] - `p1` - Combine every canonicalized target under check with every target already recorded in the project state store, each tagged with its owning template name (or, for `ownership add`, with no owning name) - `inst-cc-combine`
3. [ ] - `p1` - **FOR EACH** pair of targets in the combined set in which at least one side is a target under check - `inst-cc-foreach-pair`
   1. [ ] - `p1` - **IF** the two targets are identical and claimed by the same template name - `inst-cc-if-same-template-noop`
      1. [ ] - `p1` - Treat the pair as an idempotent no-op, not a conflict - `inst-cc-noop`
   2. [ ] - `p1` - **IF** the two targets are identical and claimed by two different template names - `inst-cc-if-same-target-diff-template`
      1. [ ] - `p1` - Record a conflict naming the contested target and both templates - `inst-cc-record-same-target`
   3. [ ] - `p1` - **IF** one target is a strict ancestor of the other — decided by whole path segments of each canonicalized target, never by string-prefix comparison, so `packages/app` and `packages/app-shell` share a string prefix but no path segment and are siblings, not ancestor and descendant - `inst-cc-if-ancestor`
      1. [ ] - `p1` - **IF** the inner (descendant) target lies at or inside one of the outer (ancestor) template's declared `excludedSubtrees` entries — a target equal to a declared entry is inside it, since the entry is ground the host reserved for a guest to occupy - `inst-cc-if-excluded-nest`
         1. [ ] - `p1` - Treat the nesting as permitted — the outer template deliberately carved out that ground - `inst-cc-permit-nest`
      2. [ ] - `p1` - **ELSE** - `inst-cc-else-undeclared-nest`
         1. [ ] - `p1` - Record a conflict naming both targets and both templates - `inst-cc-record-ancestor`
   4. [ ] - `p1` - **IF** the target under check lands inside a `projectOwnedRoot`, inside `.frontx`, inside a locally-installed template's own origin folder, or coincides with or lands inside a reserved environment entry (`.git`, `.DS_Store`, `Thumbs.db`) - `inst-cc-if-reserved-ground`
      1. [ ] - `p1` - Record a conflict naming the target and the reserved ground it lands on; this direction is always a conflict regardless of nesting - `inst-cc-record-reserved`
   5. [ ] - `p1` - **IF** a `projectOwnedRoot` or a local origin folder lands inside the target under check (the reverse containment) - `inst-cc-if-reverse-containment`
      1. [ ] - `p1` - Treat it as a subtraction from that target's effective ownership, not a conflict - `inst-cc-permit-reverse`
4. [ ] - `p1` - **IF** any conflict was recorded - `inst-cc-if-any-conflict`
   1. [ ] - `p1` - **RETURN** `TARGET_CONFLICT` listing every contested ground and its contesting templates; refuse the whole operation, never silently merged - `inst-cc-return-conflict`
5. [ ] - `p1` - **RETURN** pass - `inst-cc-return-pass`

### Existing-Content Reconciliation

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-existing-content`

**Input**: For one target cleared by the conflict check and **not already recorded** under its named template's `targets[]` entry in the project state store — a target already recorded there is an idempotent no-op by that record alone and never reaches this algorithm (`cpt-frontx-dod-cli-scaffolding-existing-content-protocol`) — the payload — the file paths the template's effective ownership at that target would write, read from its installed content — and whatever already exists on disk within that target's effective ownership area.

**Output**: Three partitions — `identicalFiles` (already on disk, matching the payload exactly), `contentConflicts` (already on disk at a payload path, differing from it), `additionalPaths` (already on disk within the target's effective ownership area, at a path the payload does not write) — or, when nothing pre-exists, all three empty.

**Steps**:
1. [ ] - `p1` - Compute the payload's file path set from the template's installed content, scoped to the target's effective ownership - `inst-ec-compute-payload`
2. [ ] - `p1` - Read what already exists on disk under the target's effective ownership area (empty when the target is new) - `inst-ec-read-existing`
3. [ ] - `p1` - **FOR EACH** path in the payload set - `inst-ec-foreach-payload-path`
   1. [ ] - `p1` - **IF** the path exists on disk - `inst-ec-if-exists`
      1. [ ] - `p1` - **IF** its content matches the payload exactly - `inst-ec-if-match`
         1. [ ] - `p1` - Add it to `identicalFiles` - `inst-ec-add-identical`
      2. [ ] - `p1` - **ELSE** - `inst-ec-else-differs`
         1. [ ] - `p1` - Add it to `contentConflicts` - `inst-ec-add-conflict`
4. [ ] - `p1` - **FOR EACH** path that exists on disk under the target's effective ownership area but is not in the payload set - `inst-ec-foreach-extra`
   1. [ ] - `p1` - Add it to `additionalPaths` - `inst-ec-add-additional`
5. [ ] - `p1` - **RETURN** `identicalFiles`, `contentConflicts`, `additionalPaths` - `inst-ec-return-partitions`

### Compute a Target's Deletion Plan

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-delete-plan`

**Input**: A canonicalized `<target>`; the project state store's current document.

**Output**: `{ toDelete, toPreserve }` — the plan's delete and preserve lists — or `TARGET_NOT_APPLIED` when `<target>` matches no template's applied `targets` array.

**Steps**:
1. [ ] - `p1` - **FOR EACH** registered template's `targets` array in the project state store - `inst-dp-foreach-template`
   1. [ ] - `p1` - **IF** `<target>` is present in that array - `inst-dp-if-found`
      1. [ ] - `p1` - Record the owning template name and stop searching - `inst-dp-record-owner`
2. [ ] - `p1` - **IF** no template's `targets` array contains `<target>` - `inst-dp-if-not-found`
   1. [ ] - `p1` - **RETURN** `TARGET_NOT_APPLIED` — `<target>` is not an applied instance of any registered template - `inst-dp-return-not-found`
3. [ ] - `p1` - Read the owning template's declared `excludedSubtrees` and compute `<target>`'s effective ownership by the same six-term subtraction the apply path computes (`inst-ua-compute-ownership`, CLI-5): `<target>` minus `excludedSubtrees` minus `projectOwnedRoots` beneath it minus `.frontx` minus the reserved environment entries (`.git`, `.DS_Store`, `Thumbs.db`) beneath it minus the template's own local origin folder (when installed by local path). The local-origin term is not optional here: a `path:`-installed template whose origin folder sits beneath its own target would otherwise have that folder — the developer's own source for the template — computed into this target's owned ground and removed - `inst-dp-compute-ownership`
4. [ ] - `p1` - Identify every other template's target that is a strict descendant of `<target>` — a nested applied instance belonging to a different template - `inst-dp-find-nested`
5. [ ] - `p1` - Set `toPreserve` to `excludedSubtrees` beneath `<target>`, every nested target found, every `projectOwnedRoots` entry beneath `<target>`, and every reserved environment entry beneath `<target>` — so a target `.` at the project root never lists `.git`, `.DS_Store`, or `Thumbs.db` in `toDelete`, since they were already subtracted from `<target>`'s effective ownership in the prior step - `inst-dp-set-preserve`
6. [ ] - `p1` - Set `toDelete` to `<target>`'s effective ownership minus every path in `toPreserve` - `inst-dp-set-delete`
7. [ ] - `p1` - **RETURN** `{ toDelete, toPreserve }` - `inst-dp-return-plan`

### Materialize or Remove the CLI-Owned AI-Extension Bundle

- [ ] `p1` - **ID**: `cpt-frontx-algo-cli-scaffolding-ai-bundle`

Realizes resolution B1: a template's AI-extension bundle at `.frontx/ai/<manifest-name>/` is delivered by a CLI-owned step, never through the template's own ownership — `.frontx` stays unconditionally subtracted from every template's effective ownership (`cpt-frontx-adr-template-ownership-boundary-declaration`). This algorithm runs once per name transition — the first target a name gains, or the last target a name loses — never per target.

**Input**: A template name; whether the operation just gave that name its first target (`targets[]` was empty before this batch and non-empty after) or removed its last remaining target (`targets[]` was non-empty before this deletion and empty after); for a materialize trigger, the name's installed content path.

**Output**: `.frontx/ai/<manifest-name>/` materialized from that name's installed content path's own `.frontx/ai/<manifest-name>/` convention folder (copied verbatim, when present), or removed; a no-op when the template's payload carries no such folder, or when neither trigger condition holds.

**Steps**:
1. [ ] - `p1` - **IF** this operation just gave `name` its first target - `inst-aib-if-first-target`
   1. [ ] - `p1` - **IF** the name's installed content path contains a `.frontx/ai/<manifest-name>/` folder - `inst-aib-if-bundle-present`
      1. [ ] - `p1` - Copy it verbatim into the project's `.frontx/ai/<manifest-name>/`, as a CLI-owned write attributed to no template's ownership - `inst-aib-copy`
   2. [ ] - `p1` - **ELSE** - `inst-aib-else-no-bundle`
      1. [ ] - `p1` - No-op — the payload carries no bundle for this name - `inst-aib-noop-no-bundle`
2. [ ] - `p1` - **IF** this operation just removed `name`'s last remaining target - `inst-aib-if-last-target`
   1. [ ] - `p1` - **IF** the project's `.frontx/ai/<manifest-name>/` exists - `inst-aib-if-bundle-exists`
      1. [ ] - `p1` - Remove it as a CLI-owned deletion - `inst-aib-remove`
   2. [ ] - `p1` - **ELSE** - `inst-aib-else-nothing-to-remove`
      1. [ ] - `p1` - No-op — there is nothing to remove - `inst-aib-noop-no-removal`
3. [ ] - `p1` - **RETURN** the outcome (materialized, removed, or no-op) - `inst-aib-return`

## 4. States (CDSL)

### Assembly Operation State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-cli-scaffolding-assembly-op`

**States**: REQUESTED, RESOLVED, CONFLICT_CHECKED, RECONCILED, ASSEMBLED, ABORTED

**Initial State**: REQUESTED

**Transitions**:
1. [ ] - `p1` - **FROM** REQUESTED **TO** RESOLVED **WHEN** every named template in the batch is registered and its content is locally available (installed if needed) - `inst-as-req-resolved`
2. [ ] - `p1` - **FROM** REQUESTED **TO** ABORTED **WHEN** a named template has no entry in the project state store, or its registered origin cannot be auto-installed - `inst-as-req-aborted-unresolved`
3. [ ] - `p1` - **FROM** RESOLVED **TO** CONFLICT_CHECKED **WHEN** the pre-flight conflict check finds no intersecting claim across the batch, everything already applied, and reserved ground - `inst-as-resolved-checked`
4. [ ] - `p1` - **FROM** RESOLVED **TO** ABORTED **WHEN** the conflict check reports `TARGET_CONFLICT`; no files are written - `inst-as-resolved-aborted-conflict`
5. [ ] - `p1` - **FROM** CONFLICT_CHECKED **TO** RECONCILED **WHEN** every target already recorded under its template's `targets[]` entry is treated as a no-op by that record alone, and existing-content reconciliation reports, for every remaining (unrecorded) target, no `contentConflicts` and either no `additionalPaths` or `--adopt-existing` was given - `inst-as-checked-reconciled`
6. [ ] - `p1` - **FROM** CONFLICT_CHECKED **TO** ABORTED **WHEN** existing-content reconciliation reports a `contentConflicts` or an unadopted `additionalPaths` entry for any unrecorded target; no files are written - `inst-as-checked-aborted-existing-content`
7. [ ] - `p1` - **FROM** RECONCILED **TO** ASSEMBLED **WHEN** every non-no-op target is materialized and recorded in the project state store - `inst-as-reconciled-assembled`

### Delete Operation State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-cli-scaffolding-delete-op`

**States**: PLAN_COMPUTED, CONFIRMATION_PENDING, CONFIRMED, DELETED, DECLINED

**Initial State**: PLAN_COMPUTED

**Transitions**:
1. [ ] - `p1` - **FROM** PLAN_COMPUTED **TO** CONFIRMATION_PENDING **WHEN** `<target>` matches an applied instance and neither `--dry-run` nor a prior confirmation is present - `inst-do-plan-pending`
2. [ ] - `p1` - **FROM** CONFIRMATION_PENDING **TO** CONFIRMED **WHEN** the developer confirms interactively, or `--json --yes` is supplied and the plan is recomputed identically - `inst-do-pending-confirmed`
3. [ ] - `p1` - **FROM** CONFIRMATION_PENDING **TO** DECLINED **WHEN** the developer declines interactively (the default), or `--json` is called without `--yes` (`CONFIRMATION_REQUIRED`) - `inst-do-pending-declined`
4. [ ] - `p1` - **FROM** CONFIRMED **TO** DELETED **WHEN** the plan's `toDelete` ground is removed from disk and `<target>` is removed from the project state store - `inst-do-confirmed-deleted`

## 5. Definitions of Done

### One Uniform Batch Path: Preview and Apply

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-uniform-apply`

The system **MUST** apply any registered template through one uniform batch path (`target`): `assemble` previews an explicit, target-keyed batch statelessly and writes nothing to the repository or the project state store; `apply` independently re-resolves and re-validates the identical batch shape — never trusting a prior `assemble` run — and materializes it against a repository that already carries applied templates (extending). `seed` wraps this identical apply mechanism for a new or empty project — creating `.frontx/project.json`, auto-registering the batch's official default templates, then resolving, conflict-checking, and materializing exactly as `apply` does — rather than being a second materialization path. No per-template-category dispatch and no manifest-declared composition of any kind exists anywhere in this path.

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-assemble-preview`
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-algo-cli-scaffolding-uniform-apply`

**Constraints**: `cpt-frontx-constraint-cli-boundary-declaration`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-assembler`
- Entities: `Template`, `Assembly`, `OwnershipBoundary`

### Nesting-Aware, Fail-Closed Conflict Check

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-conflict-check`

The system **MUST** canonicalize every target to a project-relative path before any comparison, refusing with `INVALID_PATH` a target that cannot be proven to stay inside the project root, and **MUST** run one nesting-aware intersection check — over the batch plus everything already applied plus reserved ground — that treats the same target claimed by two different templates as a conflict, the same target claimed twice by the same template as an idempotent no-op, an undeclared ancestor/descendant relationship as a conflict unless the inner target lies at or inside one of the outer template's declared `excludedSubtrees` entries, and a target landing inside `projectOwnedRoots`, `.frontx`, a local origin folder, or a reserved environment entry (`.git`, `.DS_Store`, `Thumbs.db`) as always a conflict. Ancestor/descendant is decided by whole path segments of the canonicalized path, never by string-prefix comparison — `packages/app` and `packages/app-shell` are siblings, not a conflict. The check **MUST** run identically in `assemble`, `apply`, `delete`, and `cpt-frontx-feature-composed-provenance`'s `ownership add`, with no `--force` override (`target`).

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-assemble-preview`
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-algo-cli-scaffolding-conflict-check`

**Constraints**: `cpt-frontx-constraint-cli-assembly-conflict-prevention`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-conflict-checker`
- Entities: `Assembly`, `OwnershipBoundary`

### Existing-Content Protocol and Idempotent Re-Apply

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-existing-content-protocol`

The system **MUST** treat a target already recorded under its named template's `targets[]` entry in the project state store as an idempotent no-op by that record alone — reading no on-disk content and running no existing-content reconciliation for it, regardless of whether the on-disk content still matches what was last applied. For every target a batch was cleared to write to and **not** already so recorded, the system **MUST**, before materializing it, reconcile the template's payload against whatever already exists on disk within that target's effective ownership area, reporting `identicalFiles`, `contentConflicts`, and `additionalPaths` separately: the system **MUST** refuse the whole batch, writing no file, when any unrecorded target reports a `contentConflicts` entry or reports `additionalPaths` without `--adopt-existing`, and **MUST NOT** silently overwrite differing content. An intentional overwrite of already-recorded, already-applied content is available only through `upgrade` (`cpt-frontx-feature-upgrade-changeset`); a repeated `apply` never re-inspects a recorded target's on-disk content and so can never move it onto new content (`target`).

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-algo-cli-scaffolding-existing-content`

**Constraints**: `cpt-frontx-constraint-cli-assembly-conflict-prevention`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-assembler`
- Entities: `Template`, `Assembly`, `OwnershipBoundary`

### Delete Under Explicit Confirmation

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-delete`

The system **MUST** compute a target's deletion plan as that target's effective ownership — the six-term subtraction CLI-5 fixes, applied whole and never as a subset, so the plan is bounded by exactly the ground `apply` computed as owned — minus any nested target belonging to another template, through the Conflict Checker's canonicalized geometry, and **MUST** execute it only under explicit confirmation defaulting to no, or, in `--json` mode, the `CONFIRMATION_REQUIRED` code carrying the delete/preserve lists with a re-issued call carrying `--yes` — never a prompt or a blocking read of stdin in that mode. A `<target>` matching no registered template's applied `targets` array **MUST** be refused with `TARGET_NOT_APPLIED`. The system **MUST** support a non-destructive `--dry-run` that reports the identical lists without deleting anything and without requiring confirmation, and **MUST** recompute the deletion plan at confirmed-execution time rather than trusting an earlier computed plan (`target`).

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-delete-target`
- `cpt-frontx-algo-cli-scaffolding-delete-plan`
- `cpt-frontx-state-cli-scaffolding-delete-op`

**Constraints**: `cpt-frontx-constraint-cli-machine-envelope`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-assembler`, `cpt-frontx-component-cli-conflict-checker`
- Entities: `Template`, `Assembly`, `OwnershipBoundary`, `ProjectProvenance`

### CLI-Owned AI-Extension Bundle Materialization

- [ ] `p1` - **ID**: `cpt-frontx-dod-cli-scaffolding-ai-bundle`

The system **MUST** materialize a template name's AI-extension bundle at `.frontx/ai/<manifest-name>/` as a CLI-owned write — never through the template's own ownership, which unconditionally excludes `.frontx` — the first time `apply` or `seed` gives that name its first applied target, copying it verbatim from the name's installed content path's own `.frontx/ai/<manifest-name>/` convention folder when the payload carries one, and as a no-op otherwise. The system **MUST** remove that name's `.frontx/ai/<manifest-name>/` when `delete` removes the name's last remaining target, and **MUST** refresh it when `upgrade` commits a new version of the name whose payload carries a new bundle (`cpt-frontx-feature-upgrade-changeset`) (`target`).

**Implements**:
- `cpt-frontx-flow-cli-scaffolding-seed-repository`
- `cpt-frontx-flow-cli-scaffolding-add-template`
- `cpt-frontx-flow-cli-scaffolding-delete-target`
- `cpt-frontx-algo-cli-scaffolding-ai-bundle`

**Constraints**: `cpt-frontx-constraint-cli-boundary-declaration`

**Touches**:
- Interface: `cli`
- Component: `cpt-frontx-component-cli`, `cpt-frontx-component-cli-assembler`
- Entities: `Template`, `ProjectProvenance`

## 6. Acceptance Criteria

- [ ] `assemble` accepts an explicit batch `{"templates": {"<name>": ["<target>", ...]}}`, runs the same resolution, ownership, and conflict checks `apply` runs, and leaves the repository and the project state store byte-identical afterward.
- [ ] `apply` never trusts a prior `assemble` run: called directly on a batch `assemble` never saw, it independently re-resolves, re-checks, and materializes or refuses on its own.
- [ ] A batch naming an unregistered template name is refused with `TEMPLATE_NOT_REGISTERED`, resolving nothing further for that entry and writing no file.
- [ ] A registered-but-not-yet-installed template's content is auto-installed through the shared resolver before staging; a failed auto-install is refused with `ORIGIN_UNAVAILABLE`.
- [ ] Two batch entries claiming the same target, or one containing another with no matching `excludedSubtrees` declaration, are refused with `TARGET_CONFLICT` naming both templates and the contested ground; the same nesting inside a declared `excludedSubtrees` entry is accepted. `packages/app` and `packages/app-shell` share no path segment and are never reported as ancestor/descendant or in conflict.
- [ ] A batch entry landing inside `projectOwnedRoots`, `.frontx`, a local origin folder, or a reserved environment entry (`.git`, `.DS_Store`, `Thumbs.db`) is refused with `TARGET_CONFLICT`; the reverse — one of those landing inside a template's target — is accepted as a subtraction from that target's ownership, not a conflict.
- [ ] A target that cannot be canonicalized to a path proven to stay inside the project root is refused with `INVALID_PATH`, fail-closed rather than guessed.
- [ ] The same template applied twice to the same target in one batch, or across two batches, is an idempotent no-op decided by the target's presence in that template's `targets[]` entry alone — never by reading or diffing the target's on-disk content.
- [ ] A target already recorded under its template's `targets[]` entry is never passed to existing-content reconciliation, even when its on-disk content has since been locally edited; a repeated `apply` never reports `CONTENT_CONFLICT` for it and never overwrites it — the only path to intentionally move it onto new content is `upgrade`.
- [ ] For a target not yet recorded, existing on-disk content matching the payload exactly is reported as `identicalFiles` and causes no refusal; content differing from the payload at a payload path is reported as `contentConflicts` and refuses the whole batch, writing no file; content at a path the payload does not declare is reported as `additionalPaths` and refuses the batch unless `--adopt-existing` is given, in which case it is left untouched.
- [ ] `delete <target>` on a path that matches no registered template's applied `targets` is refused with `TARGET_NOT_APPLIED`, naming the target as unmatched.
- [ ] `delete <target>` interactively prompts for confirmation defaulting to No; declining leaves the repository and the project state store unchanged.
- [ ] `delete <target> --json` without `--yes` returns `CONFIRMATION_REQUIRED` with the delete/preserve lists, never reading stdin or blocking; the identical call with `--yes` recomputes the plan and deletes only after recomputation.
- [ ] `delete <target> --dry-run` reports the delete/preserve lists without deleting anything and without any confirmation step, in both interactive and `--json` modes.
- [ ] A deletion plan preserves the target's declared `excludedSubtrees`, every nested target belonging to another template, every `projectOwnedRoots` entry beneath the target, and every reserved environment entry (`.git`, `.DS_Store`, `Thumbs.db`) beneath the target; a `delete .` on the project root never lists a reserved environment entry in its delete list or its `additionalPaths`.
- [ ] `seed <dir> --input <batch>` on a directory that does not yet carry `.frontx/project.json` creates it, auto-registers each named official default template through the register algorithm (resolve → pin → write origin), and then applies the batch through the identical mechanism `apply` uses; `seed` on a directory that already carries `.frontx/project.json` is refused, directing the developer to `apply`.
- [ ] The first `apply` or `seed` batch to give a template name its first target materializes that name's CLI-owned `.frontx/ai/<manifest-name>/` bundle from the template's payload, when the payload carries one, as a write attributed to the CLI, never to the template's own ownership; `delete` of a name's last remaining target removes that bundle.
- [ ] No apply, assemble, or delete path silently merges conflicting claims or silently overwrites differing content.
- [ ] Every `RETURN`-level refusal in this feature's flows and algorithms names a code from the shared error-code vocabulary (`cpt-frontx-adr-uniform-cli-json-envelope`).
- [ ] The apply/assemble/seed/delete command surface is part of `cpt-frontx-interface-cli`; an incompatible change to the surface requires a major version bump per `cpt-frontx-adr-artifact-versioning-and-distribution`.
- [ ] `assemble`/`apply` satisfy `cpt-frontx-cli-nfr-template-scale`'s assembly threshold: evaluating at least 20 templates in one batch and reporting every ownership conflict found — including containment between targets — before any repository file is written.
- [ ] `cfs --json validate --artifact packages/cli/architecture/features/cli-scaffolding/FEATURE.md --skip-code` returns PASS.
- [ ] `cfs --json validate-toc packages/cli/architecture/features/cli-scaffolding/FEATURE.md` returns PASS.
