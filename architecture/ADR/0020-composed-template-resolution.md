---
status: superseded
superseded_by: cpt-frontx-adr-explicit-batch-application
date: 2026-06-04
---

# Multi-Template Assembly and Preset Reference Resolution

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Manifest-declared reference resolution with ownership-boundary conflict arbitration](#manifest-declared-reference-resolution-with-ownership-boundary-conflict-arbitration)
  - [Single-level reference declaration, no transitive walk](#single-level-reference-declaration-no-transitive-walk)
  - [Convention-based discovery](#convention-based-discovery)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-composed-template-resolution`

## Context and Problem Statement

A repository is assembled from one or more independently-applied templates, and a template may reference other templates to be applied together as a set — a **preset** (the requirement this decision addressed, since retired and superseded by `cpt-frontx-adr-explicit-batch-application`). When a developer applies a preset, the templates it references should arrive as part of the same operation rather than being discovered and applied by hand afterwards. This raises two coupled questions the CLI (`cpt-frontx-component-cli`, the `@gears-frontx/cli` package) must answer at design altitude: where is the set of referenced templates declared and how is that set resolved into one assembly operation — including the case where a referenced template itself references further templates — and how is a clash arbitrated when two templates in the assembly claim the same ground?

## Decision Drivers

* **Single-operation assembly** — applying a preset must deliver every referenced template in one step, so the developer never has to chase down and apply referenced templates individually.
* **Declared, inspectable references** — the set of referenced templates must be an explicit, authored property of the template, not inferred by convention or filesystem scanning, so what a preset assembles is reviewable before it is applied.
* **Arbitrary reference depth** — a referenced template is itself a first-class template and may legitimately reference further templates; resolution must handle references to any depth without a special case bounded to one level, and must detect a reference cycle rather than recurse without bound.
* **Conflict arbitration by declared ownership** — when two templates in the assembly claim the same ground, the result must be decided by their declared ownership boundaries and refused if they clash, not by application order or a silent merge.
* **Fail-before-write atomicity** — an assembly that cannot be resolved cleanly, or whose templates conflict, must be reported before any files are written, so a partial or conflicted assembly never lands on disk.

## Considered Options

* **Manifest-declared reference resolution with ownership-boundary conflict arbitration** — each template declares its referenced templates in its manifest; the CLI resolves the declared references transitively into the full set of templates to apply, detecting cycles, and arbitrates any clash between two templates in the assembly through their declared ownership boundaries via the pre-flight conflict check, refusing before any write.
* **Single-level reference declaration, no transitive walk** — a template may declare referenced templates, but only the directly-referenced ones are resolved; a referenced template's own references are ignored.
* **Convention-based discovery** — the set of referenced templates is inferred from filesystem layout or naming rather than declared, and resolved by scanning.

## Decision Outcome

Chosen option: **Manifest-declared reference resolution with ownership-boundary conflict arbitration**, because it is the only option that satisfies single-operation assembly, declared inspectability, and arbitrary depth together while keeping the result deterministic. The referenced templates are declared in the template manifest, whose contract is decided in `cpt-frontx-adr-template-manifest-contract`; the CLI reads those declarations and resolves each referenced template through the one shared resolver decided in `cpt-frontx-adr-template-acquisition-and-location`.

Reference resolution is **transitive**: a referenced template may itself declare further references, and the CLI resolves them to their full depth, so depth is a property of the preset, not a fixed limit in the tool; a reference cycle is detected and reported rather than recursed without bound. Conflict arbitration is **by declared ownership boundary, not by application order**: the resolved set of templates is handed to the pre-flight conflict check (`cpt-frontx-adr-assembly-conflict-prevention`), which compares each pair's declared ownership boundaries (`cpt-frontx-adr-template-ownership-boundary-declaration`) and, if two templates claim the same ground, refuses the whole assembly before any file is written. There is no order-dependent or silent merge; a clash is reported with the contesting templates and the contested ground. The single-level option fails the arbitrary-depth driver; convention-based discovery fails the declared-inspectability driver and makes the composition implicit and unreviewable.

The scope of this decision is how a preset's referenced templates are declared and resolved into one assembly operation, to arbitrary depth with cycle detection, and that clashes are arbitrated by the pre-flight ownership-boundary check. It does not decide the manifest's shape (`cpt-frontx-adr-template-manifest-contract`), how a single template reference resolves to its source (`cpt-frontx-adr-template-acquisition-and-location`), the conflict check's own mechanism (`cpt-frontx-adr-assembly-conflict-prevention`), or how an already-applied template is upgraded (`cpt-frontx-adr-project-upgrade-mechanism`).

### Consequences

* Good, because a developer gets a complete assembly in a single operation, with every referenced template resolved for them.
* Good, because the referenced set is an explicit, reviewable manifest declaration rather than an implicit convention, so what a preset assembles is knowable before applying.
* Good, because transitive resolution makes depth a property of the preset, so deeply composed presets need no special handling and no arbitrary depth cap.
* Good, because clashes are arbitrated by declared ownership boundaries and refused before any write, so the assembly is deterministic and never silently merged.
* Bad, because transitive resolution must detect a reference cycle and report it rather than recurse without bound.
* Bad, because a genuine ownership clash between two referenced templates is refused rather than reconciled, so a preset author must arrange references whose boundaries do not intersect.

### Confirmation

Compliance is confirmed by a continuous-integration check on the CLI package: a fixture preset that references templates two or more levels deep is applied, and the check asserts every transitively-referenced template is present in the single assembly. A second fixture introduces a reference cycle and asserts it is detected and reported rather than recursing. A third fixture constructs two referenced templates that claim the same ground and asserts the pre-flight conflict check refuses the assembly before any files are written, naming the contesting templates. Design and code review confirm referenced templates are read from the manifest contract, resolved through the shared resolver, and arbitrated by the ownership-boundary conflict check rather than by application order or filesystem convention.

## Pros and Cons of the Options

### Manifest-declared reference resolution with ownership-boundary conflict arbitration

Each template declares its references in its manifest; the CLI resolves them transitively through the shared resolver, detects cycles, and arbitrates clashes through the pre-flight ownership-boundary check, refusing before any write.

* Good, because assembly is explicit, declared, and reviewable.
* Good, because transitive resolution supports arbitrary reference depth with no special case.
* Good, because clashes are arbitrated by declared ownership and refused, not merged.
* Neutral, because it depends on the manifest contract, the shared resolver, and the conflict check, which are separate decisions it composes with.
* Bad, because it must detect reference cycles, and a genuine ownership clash is refused rather than reconciled.

### Single-level reference declaration, no transitive walk

Only directly-referenced templates are resolved; a referenced template's own references are ignored.

* Good, because resolution is simple and cannot recurse or cycle.
* Good, because the directly-referenced set is still explicit in the manifest.
* Bad, because a referenced template that is itself a preset cannot deliver its own referenced templates, failing single-operation assembly beyond one level.
* Bad, because it pushes multi-level assembly back onto the developer to arrange by hand.

### Convention-based discovery

The referenced set is inferred from filesystem layout or naming rather than declared, and resolved by scanning.

* Good, because a template author writes no explicit reference list.
* Bad, because the assembly is implicit and not reviewable before applying, failing declared inspectability.
* Bad, because convention-based inference is fragile and ambiguous, and offers no clean place to arbitrate a clash.

## More Information

The template manifest that carries the reference declaration is decided in `cpt-frontx-adr-template-manifest-contract`. Resolution of any single template reference to its source is performed by the one shared resolver decided in `cpt-frontx-adr-template-acquisition-and-location`. Clash arbitration among the resolved set is performed by the pre-flight conflict check decided in `cpt-frontx-adr-assembly-conflict-prevention`, comparing the boundaries shaped by `cpt-frontx-adr-template-ownership-boundary-declaration`. Applying a newer template version to an already-applied template is a separate, reviewable concern decided in `cpt-frontx-adr-project-upgrade-mechanism`. These are non-binding pointers to related decisions and are not part of this decision's durable identity.

Applicability of the remaining checklist categories:

* **PERF** — Not applicable, because this is local developer tooling with no throughput or latency budget bound to the decision.
* **SEC** — Not applicable, because the decision introduces no secret material and no authentication surface.
* **REL** — Not applicable, because there is no service-availability target; the assembly runs locally and on demand, and its fail-before-write atomicity is captured under the drivers rather than as a service-reliability concern.
* **DATA** — Not applicable, because no persistent database or schema is defined here.
* **OPS** — Not applicable, because there are no runbooks or operational procedures for a local command.
* **COMPL** — Not applicable, because no regulatory obligation bears on reference resolution.
* **UX** — addressed implicitly: one operation yields the whole assembly, and a clash is reported clearly.
* **MAINT** — addressed: an explicit declared reference set is easier to reason about and review than an inferred one.
* **TEST** — the Confirmation defines the fixtures that exercise transitive resolution, cycles, and clash arbitration; test implementation lives in code, not here.
* **Review cadence**: revisit if presets routinely require reference-arbitration behavior other than refuse-on-clash, or if reference cycles become a common authoring pattern.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* The retired composed-template-resolution requirement (superseded by `cpt-frontx-adr-explicit-batch-application`) — transitive, manifest-declared reference resolution through the shared resolver was the mechanism by which a preset's referenced templates were resolved and applied as part of the same assembly operation, with clashes arbitrated by declared ownership boundaries.
* `cpt-frontx-usecase-scaffold-composed-project` — This decision defines the single assembly operation that delivers a preset's templates, and delegates the "conflicting assembly" alternative flow to the pre-flight ownership-boundary check (report and refuse before any write).
* `cpt-frontx-component-cli` — The CLI component owns multi-template assembly and preset resolution; this decision constrains how that component resolves a preset into one assembly and arbitrates clashes.
