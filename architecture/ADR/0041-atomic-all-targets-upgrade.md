---
status: accepted
date: 2026-08-12
---

# Atomic All-Targets Upgrade as the Unit of the Upgrade Operation

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-applied-template-instance upgrade with a provenance-derived baseline and file-level reconstruction](#per-applied-template-instance-upgrade-with-a-provenance-derived-baseline-and-file-level-reconstruction)
  - [Per-target upgrade with independently versioned instances of the same template](#per-target-upgrade-with-independently-versioned-instances-of-the-same-template)
  - [Atomic all-targets upgrade with the baseline read from `project.json`](#atomic-all-targets-upgrade-with-the-baseline-read-from-projectjson)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-atomic-all-targets-upgrade`

## Context and Problem Statement

The redesigned project-state contract collapses everything the CLI previously tracked per applied template instance — registry entry, provenance record, ownership record — into one document, `.frontx/project.json`, keyed by template name: `templates[name] = { origin, version, targets[] }`. A template name carries exactly one `origin` and one `version`, and `targets` is the list of paths that name has been applied to; there is no per-target `origin`/`version` field and no per-instance provenance record for an upgrade to read as a baseline. `cpt-frontx-adr-project-upgrade-mechanism` (ADR-0021) decided the previous upgrade mechanism against the model it replaces: one engine operating on **one applied template instance at a time**, diffing against a **per-instance provenance record** written at apply time. Neither that unit of operation nor that baseline source exists in the new structure, so both must be re-decided: what is the unit an upgrade operates on, and where does its baseline come from, when a single registry entry names every target a template has been applied to?

## Decision Drivers

* **One origin and one version per template name** — the registry structure itself (`templates[name] = { origin, version, targets[] }`) has no field for a per-target origin or version; any upgrade unit finer than "the template name" cannot be expressed without adding fields the redesign deliberately removed.
* **A minimal, algorithmic baseline for v1** — the baseline an upgrade diffs against must be derivable from data the project already keeps for other reasons (the registered `origin` and `version`), not from a dedicated per-instance provenance record or per-file content hashes maintained solely to serve upgrade.
* **Determinism over partial-success granularity** — a registry entry that names one `origin`/`version` for potentially several `targets` must never end up describing a template partially upgraded and partially not; the entry's truth (which version this name is at) must hold for every target it names at the end of the operation.
* **The spirit of ADR-0021 survives its mechanism** — a developer must still be able to review an upgrade before it lands, it must not destroy in-progress edits, and it must be reversible; these properties are requirements independent of which unit or baseline implements them, and this decision does not relax them.
* **Ownership subtraction still applies** — regardless of unit, an upgrade must not touch ground the applied template does not effectively own: `excludedSubtrees` declared by the manifest, `projectOwnedRoots`, nested targets belonging to other templates, local origin folders, and `.frontx` itself.
* **Deliberate re-application must stay distinct from accidental overwrite** — re-running `apply` against an unchanged, already-applied target must remain an idempotent no-op that protects an edited instance; intentionally moving a target onto a new template version is a separate, named operation (`upgrade`), never something `apply` does by itself.

## Considered Options

* **Per-applied-template-instance upgrade with a provenance-derived baseline and file-level reconstruction** — the model ADR-0021 decided: one engine invocation per target, diffing against a dedicated per-instance provenance record and reconstructing a three-way merge from that record's origin.
* **Per-target upgrade with independently versioned instances of the same template** — keep the instance as the unit, but let each target of a given template name carry its own `origin`/`version`, so `login` can sit on v2 while `registration` stays on v1.
* **Atomic all-targets upgrade with the baseline read from `project.json`** — the unit of upgrade is the template *name*; `frontx upgrade <templateName> <new-origin>` validates and updates every target listed under that name as one atomic operation, using the name's own `{ origin, version }` entry as the baseline.

## Decision Outcome

Chosen option: **Atomic all-targets upgrade with the baseline read from `project.json`**, because it is the only option that fits the registry structure the project-state redesign already settled on, and it gives v1 a deterministic, dependency-free upgrade unit without reintroducing the per-instance provenance records and file-level reconstruction machinery the redesign removed as contract bloat.

`frontx upgrade <templateName> <new-origin>` treats every target listed under `templateName` in `.frontx/project.json` as one unit: it validates the new origin against all of that name's targets and, on success, updates `origin` and `version` for the name atomically — every target moves together, or none do. A partial upgrade of one target to a new version while a sibling target of the same name stays on the old version is not a supported state in v1; it is a direct consequence of the registry recording one `origin` and one `version` per name rather than per target. The baseline an upgrade diffs against is the name's own registry entry — `{ origin, version }` in `project.json` — not a per-instance provenance record or a per-file hash set; no such record exists to read.

`upgrade` is the only path permitted to change a template name's `origin` while its `targets` list is non-empty; when `targets` is empty, `register --replace` is sufficient because there is no applied ground to reconcile. Re-applying a since-changed template onto an existing target is, by definition, an `upgrade`, never a plain `apply`: `apply` against an already-applied, unchanged target remains an idempotent no-op, precisely so an edited instance is never silently clobbered by a template that moved on. An upgrade computes and applies its changes only within the effective ownership of the targets it touches — the target minus the manifest's `excludedSubtrees`, minus `projectOwnedRoots`, minus any nested target belonging to another template, minus local origin folders, minus `.frontx` — so protected and other-owned ground is never disturbed regardless of how many targets are being moved at once. Every outcome — success, `VERSION_MISMATCH`, or any other failure — is reported through the CLI's single JSON result envelope, consistent with every other command.

This decision fixes the unit of upgrade (the template name, all its targets, atomically) and the source of its baseline (the `project.json` registry entry, not a provenance record). It deliberately does **not** define the changeset representation, a diff or three-way-merge algorithm, per-file conflict detection within an upgrade, or how a future version might reconcile targets that have diverged from one another under the same name — those are left to a dedicated future decision so this contract is not inflated to cover a reconstruction problem no consumer has yet required.

### Consequences

* Good, because the upgrade unit matches the registry structure exactly — one name, one origin, one version, several targets — so there is no field or state the registry can represent that upgrade cannot act on consistently.
* Good, because the baseline is data the project already carries for `list`, `validate`, and `apply` to auto-install a registered origin; upgrade introduces no dedicated baseline artifact, no file to go stale, and no record a developer could edit or delete out from under the upgrade.
* Good, because atomicity across all targets of a name rules out a registry that claims one version while its targets sit at a mix of versions — a state the previous per-instance model could produce and that a validator would otherwise need to detect and explain.
* Bad, because a developer cannot move one target of a multi-target template forward while leaving a sibling target behind (login on v2, registration still on v1); adopting a new version for any one target requires accepting it for all targets of that name, or not upgrading that name yet.
* Bad, because an upgrade that touches several targets at once must succeed or fail as a whole; a conflict or ownership violation confined to one target blocks the version change for every other target of the same name until that target's issue is resolved.
* Bad, because this mechanism does not itself implement the reviewable, non-destructive, reversible discipline ADR-0021 established: those properties carry forward as standing requirements on the future changeset decision (see More Information), not as consequences this ADR's atomic unit-and-baseline choice already delivers.

### Confirmation

Compliance is confirmed by design and code review plus a CLI test: register a template applied to two targets under one name, then run `upgrade <name> <new-origin>`; assert the operation reads `{ origin, version }` from `project.json` (not any provenance or per-instance file) as its baseline, that both targets are validated and updated together, and that `project.json`'s `origin`/`version` for that name change exactly once, atomically, only on success. A companion test asserts that when validation fails for any one of the name's targets, `project.json` is left unchanged for every target of that name — no partial commit — and the result is reported as a single JSON envelope entry (e.g. `VERSION_MISMATCH`) rather than a per-target list of independent outcomes. A further test asserts that `upgrade` against a name with an empty `targets` list is rejected or redirected to `register --replace`, and that a plain `apply` re-run against an unchanged, already-applied target remains a no-op that performs no origin/version change.

## Pros and Cons of the Options

### Per-applied-template-instance upgrade with a provenance-derived baseline and file-level reconstruction

The mechanism ADR-0021 decided: one engine invocation per applied instance, reading a dedicated per-instance provenance record as the diff baseline and reconstructing a three-way merge from it.

* Good, because each instance upgrades fully independently of every other instance of the same template.
* Bad, because it requires a per-instance provenance record and file-level baseline reconstruction that the project-state redesign removed as unnecessary for v1 — reinstating them here would resurrect the contract surface the redesign was chosen to shed.
* Bad, because it has no baseline to read under the new `project.json`-only registry: there is no per-instance record left to diff against.

### Per-target upgrade with independently versioned instances of the same template

Keep the instance as the unit, but let each target of a given template name carry its own `origin`/`version`, so different targets of the same name can sit at different versions.

* Good, because it preserves the flexibility of upgrading targets one at a time.
* Bad, because it breaks the registry's own invariant — one `origin` and one `version` per template name — forcing `templates[name]` to become a map of per-target versions and reopening exactly the structural question the project-state redesign closed.
* Bad, because it complicates every other registry-reading operation (`list`, `validate`, auto-install on `apply`) with a per-target version dimension none of them currently need.

### Atomic all-targets upgrade with the baseline read from `project.json`

The template name is the unit; `upgrade` validates and moves every target under that name together, atomically, using the name's own registry entry as the baseline.

* Good, because it requires no new persisted state — the baseline is the registry entry every other command already reads and writes.
* Good, because a registry entry can never describe a template name at an internally inconsistent version across its own targets.
* Neutral, because it provides useful, if coarse, determinism for v1 while leaving room for a future decision to introduce finer-grained reconciliation if a validated need for it appears.
* Bad, because it cannot express "upgrade this one target, leave the others" — a real workflow the previous per-instance model supported and that a future decision may need to reintroduce deliberately.

## More Information

This decision supersedes `cpt-frontx-adr-project-upgrade-mechanism` (ADR-0021). ADR-0021's reviewable, non-destructive, reversible discipline is not reopened here, but its status changes with this decision: those three properties are **standing requirements on a future changeset decision**, not properties this ADR's mechanism itself delivers. This decision fixes only the unit of operation (all targets of a template name, atomically) and the baseline source (the `project.json` registry entry); it defines no changeset representation, no diff or three-way-merge algorithm, and no per-file conflict detection, so it has no mechanism of its own to review, reverse, or check for destructiveness at the file level. Carrying those properties forward as live requirements — rather than as satisfied consequences — means the dedicated changeset decision this ADR defers to is not optional future work but the first item in the implementation-phase queue: until it lands, `upgrade` moves a template name's targets to a new version without an implemented review-and-approval step or a defined reversal path, and the PRD's requirements for that review, approval, and restoration (`cpt-frontx-fr-cli-project-upgrade-changeset`, `cpt-frontx-fr-cli-upgrade-review-approval`, `cpt-frontx-fr-cli-upgrade-restore`) are correctly tracked as blocked on it, not as already met. What ADR-0021 got right — that these properties matter regardless of mechanism — is preserved as the contract the next decision must satisfy; only the per-instance unit and the per-instance provenance baseline are retired here because the project-state model they depended on no longer exists.

The baseline this decision reads has a constraint the future changeset decision must resolve, not one this ADR can close: for a template registered from a local `path:` origin, the baseline is not recoverable from the origin itself. A remote origin's baseline is its pinned commit SHA or exact package version, always re-fetchable; a `path:` origin names a folder inside the project that a developer edits in place, and the project's own inventory of that folder is local and does not travel — there is no separate, addressable "prior version" to re-fetch when an upgrade needs to diff against what was last applied. The future changeset decision must therefore define where a `path:` origin's baseline snapshot lives before a diff-based upgrade can work for local templates at all; a copy captured into the local inventory at `apply` or `register` time is one candidate, and the pattern has prior art in template tools that keep an answers/context snapshot beside the applied output for exactly this reason (Copier's `.copier-answers.yml`, `cruft`'s equivalent link file) — cited here as precedent for the shape of a solution, not as a decision this ADR makes.

The exact field layout `project.json` uses to record `{ origin, version, targets }` is not fixed here; per `cpt-frontx-adr-contract-schema-ownership`, that layout belongs to the owning FEATURE, and this decision only relies on an `origin`/`version` baseline being readable per template name, however it is laid out. The behavior this decision constrains is delivered by the CLI's change-set-and-upgrade component, `cpt-frontx-component-cli-change-set-engine`, established as one of the CLI's internal components in `cpt-frontx-adr-cli-internal-decomposition`.

The engine this decision fixes operates independently of any AI layer: `frontx upgrade <templateName> <new-origin>` is a direct CLI invocation that validates and moves a template name's targets whether a developer types it themselves or an AI orchestrator issues it on their behalf, reaffirming the orchestration boundary `cpt-frontx-adr-ai-driven-upgrade-orchestration` already fixed — the CLI executes and arbitrates the engine ADR-0021 established the need for, an AI layer only sequences and interprets around it. A successful upgrade also refreshes the applying name's CLI-owned AI bundle — `.frontx/ai/<manifest-name>/`, materialized as described in `cpt-frontx-adr-whole-target-ownership` — from the new version's payload, the same way `apply` refreshes it on first materialization.

Integration analysis (**INT**): the upgrade operation is an internal CLI contract with no external party — its producer is the `upgrade` command and its consumer is the local project (`project.json` plus the files under each target). Version-compatibility intent is forward-looking only in the sense that the JSON result envelope's error vocabulary (including `VERSION_MISMATCH`) must remain stable for scripted and AI-driven callers; the internal baseline representation is free to evolve as `project.json`'s owning FEATURE evolves it.

Applicability of the remaining checklist categories:

* **PERF** — Not applicable, because validating and updating a bounded, developer-sized list of targets for one template name carries no throughput or latency budget at decision altitude.
* **SEC** — Not applicable, because the operation handles template origins and version strings, not secret material.
* **REL** — addressed narrowly: the all-or-nothing atomicity requirement is this decision's reliability property (no partial commit across a name's targets on failure); the recovery/rollback mechanics for a partially-attempted upgrade are implementation concerns for the future changeset decision, not fixed here.
* **DATA** — Not applicable as a complete schema, because the `project.json` field layout is owned by its FEATURE per `cpt-frontx-adr-contract-schema-ownership`; this decision fixes only that an `origin`/`version` baseline is read per template name.
* **OPS** — Not applicable, because no operational procedure attaches to a local developer command.
* **MAINT** — addressed: one baseline source and one atomic unit per template name removes the bookkeeping a per-instance provenance store would otherwise require.
* **UX** — addressed implicitly: a developer reasons about upgrading a template by name, not about reconciling divergent versions across its individual targets.
* **BIZ** — Not applicable, because product requirements live in the PRD and are cited here by ID.

**Review cadence**: revisit if a validated need emerges for upgrading one target of a multi-target template independently of its siblings, or once the deferred changeset/merge mechanics are designed and may need to reference this decision's unit and baseline.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-cli-project-upgrade-changeset` — Redefines the unit this requirement's changeset operates on: one atomic changeset per template name covering all of that name's targets, rather than one changeset per applied instance.
* `cpt-frontx-fr-cli-upgrade-review-approval` — The atomic all-targets operation remains subject to review and approval before it writes to any target; this decision does not relax that requirement, only the mechanism that produces what is reviewed.
* `cpt-frontx-adr-project-upgrade-mechanism` — Superseded by this decision: its per-applied-template-instance unit and per-instance provenance baseline are replaced by the atomic all-targets unit and the `project.json` registry baseline decided here.
* `cpt-frontx-component-cli-change-set-engine` — This decision constrains the component's unit of operation (a template name and all its targets, atomically) and its baseline source (the registry entry in `project.json`).
