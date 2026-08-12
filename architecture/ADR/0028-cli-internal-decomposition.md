---
status: accepted
date: 2026-07-16
---

# One Monolithic CLI Component Fuses Six Distinct Lifecycle Responsibilities

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Six internal components under a retained package anchor](#six-internal-components-under-a-retained-package-anchor)
  - [Keep the single fused CLI component](#keep-the-single-fused-cli-component)
  - [Split the CLI into separately published packages](#split-the-cli-into-separately-published-packages)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-cli-internal-decomposition`

## Context and Problem Statement

The CLI pillar (`cpt-frontx-component-cli`, the `@gears-frontx/cli` package) is documented in `architecture/DESIGN.md` as a single component that fuses template resolution and acquisition, pre-publish validation, multi-template assembly, pre-flight assembly-conflict checking, per-applied-template provenance recording, and the change-set upgrade engine — the last two of which have no component of their own at all. This asymmetry leaves the CLI pillar described at a coarser altitude than the Core Framework, where each concern is its own component with explicit responsibility boundaries, and it hides distinct reasons-to-change inside one unit. How should the single CLI package be decomposed at DESIGN altitude so each lifecycle concern is a first-class component with clear boundaries, and the conflict checker and change-set engine in particular gain the standing their invariants require?

## Decision Drivers

* **Single responsibility** — acquisition, validation, assembly, conflict checking, provenance, and upgrade each change for different reasons and should be separable units, not one fused component.
* **The conflict checker and change-set engine need standing** — the ecosystem's conflict-prevention invariants (CLI-6) and its non-destructive, reviewable upgrade invariants (CLI-3, CLI-4) attach to a checker and an engine that currently have no component to anchor them.
* **One authoritative resolver** — template resolution must be a single shared path across every template application and assembly (CLI-2), which is clearest when resolution is one named component.
* **Pillar parity** — the CLI pillar should read at the same altitude as the Core Framework so the DESIGN is balanced and reviewable.
* **One package, internal structure** — the decomposition must not fragment the single published `@gears-frontx/cli` package; the parts are internal components of one artifact, anchored by a retained package-level component.

## Considered Options

* **Six internal components under a retained package anchor** — keep `cpt-frontx-component-cli` as the package-level anchor that owns the command surface and composes six internal components: template resolver, pre-publish validator, assembler, conflict checker, provenance recorder, and change-set-&-upgrade engine.
* **Keep the single fused CLI component** — leave the CLI as one component and describe its concerns as prose bullets.
* **Split the CLI into separately published packages** — promote each concern to its own npm package.

## Decision Outcome

Chosen option: **Six internal components under a retained package anchor**, because it gives each lifecycle concern a single reason to change and an explicit responsibility boundary while preserving the single published package. The anchor `cpt-frontx-component-cli` is retained — it is referenced by the CLI-pillar ADRs (`cpt-frontx-adr-template-acquisition-and-location`, `cpt-frontx-adr-source-spec-syntax`, `cpt-frontx-adr-template-manifest-contract`, `cpt-frontx-adr-project-provenance-record`, `cpt-frontx-adr-composed-template-resolution`, `cpt-frontx-adr-assembly-conflict-prevention`, `cpt-frontx-adr-project-upgrade-mechanism`, `cpt-frontx-adr-uniform-template-mechanism`) and must not be orphaned — and owns only the command surface, delegating each concern to one internal component. The template resolver becomes the one shared resolution path (CLI-2); the conflict checker becomes a first-class component that anchors the pre-flight conflict-prevention invariants (CLI-6); the change-set-&-upgrade engine becomes a first-class component that anchors the single-authoritative-engine and non-destructive-upgrade invariants (CLI-3, CLI-4). Leaving the component fused perpetuates the altitude asymmetry and hides distinct reasons-to-change; splitting into separate packages is rejected because the concerns share one command surface and one release line, and separate packages would impose versioning and coordination overhead the per-concern-versioning policy reserves for genuinely independent artifacts.

The six internal components are `cpt-frontx-component-cli-template-resolver` (acquisition by source-spec, local listing and update, transitive preset reference resolution), `cpt-frontx-component-cli-prepublish-validator` (pre-publish conformance against the manifest contract, including well-formed ownership boundaries), `cpt-frontx-component-cli-assembler` (multi-template assembly and materialization into a repository, seeding or extending), `cpt-frontx-component-cli-conflict-checker` (pre-flight ownership-boundary intersection check and post-materialization boundary-honesty guard), `cpt-frontx-component-cli-provenance-recorder` (per-applied-template provenance write-at-apply / read-and-update-at-upgrade), and `cpt-frontx-component-cli-change-set-engine` (per-applied-template change-set computation, review gating, non-destructive application). This decision fixes the decomposition and each part's responsibility boundary at DESIGN altitude; it does not specify code structure, file layout, or implementation.

### Consequences

* Good, because each concern has a single reason to change and an explicit boundary, matching the Core Framework's altitude.
* Good, because the conflict checker finally has a component to which CLI-6 attaches, and the change-set engine one to which CLI-3 and CLI-4 attach.
* Good, because the shared resolver is expressed as one component, making CLI-2 checkable.
* Neutral, because the parts remain inside one published package, so no new distribution artifact is introduced.
* Bad, because DESIGN gains six new component identifiers whose downstream coverage (DECOMPOSITION and FEATURE ownership) is a subsequent stage.
* Bad, because a package anchor that only composes internal parts adds one indirection level to the model.

### Confirmation

Compliance is confirmed by design review that each of the six internal components appears in DESIGN §3.2 with its own why-exists, responsibility scope, responsibility boundaries, and related-components, and that the retained anchor delegates rather than owns the concerns. A later stage confirms the code's module boundaries align with these components and that no second template-resolution, conflict-check, or change-set path exists (CLI-2, CLI-6, CLI-3).

## Pros and Cons of the Options

### Six internal components under a retained package anchor

Retain the package anchor; add resolver, validator, assembler, conflict checker, provenance recorder, and change-set engine as internal components.

* Good, because each concern is a single-responsibility unit with an explicit boundary.
* Good, because it keeps one published package while balancing the pillar's altitude.
* Good, because the conflict checker, change-set engine, and shared resolver become nameable, checkable components.
* Neutral, because it introduces a compose-only anchor.
* Bad, because new component IDs require later DECOMPOSITION/FEATURE coverage.

### Keep the single fused CLI component

Leave the CLI as one component described in prose.

* Good, because it introduces no new identifiers.
* Bad, because it hides five distinct reasons-to-change in one unit.
* Bad, because the change-set engine's invariants have no component to attach to, and the pillar stays below Core Framework altitude.

### Split the CLI into separately published packages

Promote each concern to its own npm package.

* Good, because each concern would version fully independently.
* Bad, because the concerns share one command surface and one natural release line.
* Bad, because it imposes cross-package coordination overhead disproportionate to the benefit.

## More Information

This decomposition is the CLI-pillar counterpart to `cpt-frontx-adr-core-package-boundaries` for the Core Framework: it partitions one artifact into boundary-governed concerns. The upgrade engine's behavior and the reviewable/non-destructive invariants are decided in `cpt-frontx-adr-project-upgrade-mechanism`; the pre-flight conflict-prevention behavior in `cpt-frontx-adr-assembly-conflict-prevention`; multi-template assembly and preset resolution in `cpt-frontx-adr-composed-template-resolution`; and the uniform mechanism the parts share in `cpt-frontx-adr-uniform-template-mechanism`. This decision also motivates the CLI-pillar design principle `cpt-frontx-principle-reviewable-lifecycle`, which states the reviewable, non-destructive lifecycle rule at principle altitude. These are non-binding pointers and do not form part of this decision's durable identity.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because a component-decomposition decision binds no latency or throughput budget. **SEC** — Not applicable, because it introduces no secret material or authentication surface. **REL** — addressed indirectly: giving the change-set engine standing anchors the non-destructive, reversible upgrade invariants that protect a developer's project. **DATA** — Not applicable, because this decision fixes no schema (contract schemas are governed by `cpt-frontx-adr-contract-schema-ownership`). **INT** — addressed: the internal components integrate through the retained package anchor and the CLI command surface. **OPS** — Not applicable, because no operational procedure attaches to an internal decomposition. **MAINT** — addressed directly: single-responsibility components reduce coupling and clarify reasons-to-change. **COMPL** — Not applicable. **UX** — Not applicable, because the command surface is unchanged by an internal decomposition. **BIZ** — Not applicable, because product requirements live in the PRD and are cited by ID.

**Post-redesign note (2026-08-12).** The decision to keep the CLI's internals decomposed under one package anchor remains in force. The component roster it enumerates predates the template-registration redesign: the provenance recorder's concern is replaced by the single project-state document (`cpt-frontx-adr-single-project-state-file`), the resolver's transitive preset resolution is removed by explicit batch application (`cpt-frontx-adr-explicit-batch-application`), and the conflict checker's algorithm is re-decided by `cpt-frontx-adr-nesting-aware-conflict-prevention`. The roster itself has since evolved rather than merely aged: a seventh internal component, `cpt-frontx-component-cli-registration`, is added to own the `register`/`unregister`/`install` behavior fixed by `cpt-frontx-adr-template-registration-and-origin-pinning`, a concern the original six-component roster had no place for because registration as a distinct step postdates it. `packages/cli/architecture/DESIGN.md`, where the CLI's internal component roster is detailed, reflects this seventh component. Reconciling the rest of the roster with the redesigned command surface (assemble/apply, delete, ownership) remains deferred to the DESIGN rework that accompanies this redesign wave.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-component-cli` — Retained as the package-level anchor that owns the command surface and composes the six internal components.
* `cpt-frontx-component-cli-template-resolver` — Established as the single shared resolution path across every template application and assembly.
* `cpt-frontx-component-cli-assembler` — Established as the component that assembles and materializes one or more templates into a repository.
* `cpt-frontx-component-cli-conflict-checker` — Established as a first-class component anchoring the pre-flight assembly-conflict-prevention invariants.
* `cpt-frontx-component-cli-change-set-engine` — Established as a first-class component anchoring the single-authoritative-engine and non-destructive-upgrade invariants.
* `cpt-frontx-constraint-cli-shared-resolver` — One authoritative shared resolver, made checkable by naming the resolver component.
* `cpt-frontx-constraint-cli-assembly-conflict-prevention` — Pre-flight conflict prevention, anchored to the conflict-checker component.
* `cpt-frontx-constraint-cli-authoritative-change-set` — Single authoritative change-set engine, anchored to the change-set-engine component.
* `cpt-frontx-constraint-cli-non-destructive-upgrade` — Non-destructive, reversible upgrade, anchored to the change-set-engine component.
* `cpt-frontx-principle-reviewable-lifecycle` — The CLI-pillar principle this decomposition motivates.
