---
status: proposed
date: 2026-06-04
---

# Composed-Template Resolution: Manifest-Declared Recursive Composition


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Manifest-declared recursive resolution with a defined collision rule](#manifest-declared-recursive-resolution-with-a-defined-collision-rule)
  - [Single-level manifest declaration, no transitive walk](#single-level-manifest-declaration-no-transitive-walk)
  - [Convention-based discovery](#convention-based-discovery)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-composed-template-resolution`
## Context and Problem Statement

A project template can stand on its own or it can be composed of other units: a project template may reference one or more microfrontend templates that belong with it. When a developer scaffolds such a project, the referenced microfrontends should arrive as part of the same operation rather than being discovered and scaffolded by hand afterwards (`cpt-frontx-fr-cli-composed-template-resolution`). This raises two coupled questions the CLI (`cpt-frontx-component-cli`, the `@cyberfabric/cli` package) must answer at design altitude: where is the set of referenced templates declared, and how is that set resolved into a single scaffolded result — including the case where one referenced microfrontend template itself references further templates, and the case where two branches of the composition contribute a conflicting unit?

## Decision Drivers

* **Single-operation completeness** — scaffolding a composed project must deliver the whole composition in one step, so the developer never has to chase down and scaffold referenced microfrontends individually.
* **Declared, inspectable composition** — the set of referenced templates must be an explicit, authored property of the template, not inferred by convention or filesystem scanning, so what a project is composed of is reviewable before it is scaffolded.
* **Arbitrary composition depth** — a referenced microfrontend template is itself a first-class template and may legitimately reference further templates; the resolution must handle composition to any depth without a special case bounded to one level.
* **Determinism under conflict** — when more than one branch of a composition contributes a unit at the same coordinate, the result must be defined by a fixed, predictable rule rather than by traversal order or chance, so the same composition always resolves the same way and a conflict can be reported, not silently merged.
* **Fail-before-write atomicity** — a composition that cannot be resolved cleanly must be reported before any files are written, so a partial or conflicted composition never lands on disk (`cpt-frontx-usecase-scaffold-composed-project` alternative flow "composition collision").

## Considered Options

* **Manifest-declared recursive resolution with a defined collision rule** — each template declares its referenced templates in its template manifest; the CLI walks the declared references transitively (recursively), resolving every referenced template through the shared resolver, and applies one fixed deterministic rule when two branches contribute a conflicting unit, reporting the conflict before any write.
* **Single-level manifest declaration, no transitive walk** — a template may declare referenced templates in its manifest, but only the directly-referenced templates are resolved; a referenced microfrontend template's own references are ignored by the scaffold.
* **Convention-based discovery** — the set of referenced templates is inferred from filesystem layout or naming convention rather than an explicit declaration, and resolved by scanning.

## Decision Outcome

Chosen option: **Manifest-declared recursive resolution with a defined collision rule**, because it is the only option that satisfies single-operation completeness, declared inspectability, and arbitrary depth together while keeping the result deterministic. The referenced templates are declared in the template manifest, whose contract is decided in `cpt-frontx-adr-template-manifest-contract`; the CLI reads those declarations and resolves each referenced template through the one shared resolver decided in `cpt-frontx-adr-template-externalization-resolution`.

Composition is **recursive**: a referenced microfrontend template may itself declare further templates, and the CLI resolves the declared references transitively to their full depth, so depth is a property of the composition, not a fixed limit in the tool. Conflict resolution is **deterministic by a nearest-declaration-wins rule**: when two branches of the composition contribute a unit at the same coordinate, the declaration nearest to the root of the composition (the shallowest declaring template, and among equally-near declarations the one declared first) defines the resolved unit. A conflict that the rule cannot resolve to a single unambiguous unit — for example two equally-near, first-declared units that genuinely disagree — is a **composition collision**: the CLI reports the conflicting composition and aborts before any files are written, matching the use-case alternative flow. The single-level option fails the arbitrary-depth driver; convention-based discovery fails the declared-inspectability driver and makes the composition implicit and unreviewable.

The scope of this decision is how a composed project's referenced templates are declared and resolved into one scaffold result, and how collisions are decided. It does not decide the manifest's full shape (that is `cpt-frontx-adr-template-manifest-contract`), nor how a single template reference is resolved to its source (that is `cpt-frontx-adr-template-externalization-resolution`), nor how an already-scaffolded project is upgraded (that is `cpt-frontx-adr-upgrade-changeset-engine`).

### Consequences

* Good, because a developer gets a complete composed project in a single scaffold operation, with every referenced microfrontend resolved for them.
* Good, because the composition is an explicit, reviewable manifest declaration rather than an implicit convention, so what a project is composed of is knowable before scaffolding.
* Good, because recursion makes depth a property of the composition, so deeply composed templates need no special handling and no arbitrary depth cap.
* Good, because the nearest-declaration-wins collision rule makes the resolved composition deterministic and reproducible, and an unresolvable conflict is reported rather than silently merged.
* Bad, because recursive resolution must guard against a reference cycle (a template that, transitively, references itself); the resolver must detect a cycle and report it rather than recurse without bound.
* Bad, because the nearest-declaration-wins rule is a single fixed policy: a composition that wants a different precedence cannot express it and must restructure its declarations instead.

### Confirmation

Compliance is confirmed by a continuous-integration check on the CLI package: a fixture project template that recursively references microfrontend templates two or more levels deep is scaffolded, and the check asserts every transitively-referenced microfrontend is present in the single scaffold result. A second fixture constructs a deliberate same-coordinate conflict across two branches and asserts (a) that a resolvable conflict resolves to the nearest-declaration-wins unit and (b) that an unresolvable conflict is reported as a composition collision with no files written. Design and code review confirm referenced templates are read from the manifest contract and resolved through the shared resolver rather than by filesystem convention.

## Pros and Cons of the Options

### Manifest-declared recursive resolution with a defined collision rule

Each template declares its referenced templates in its manifest; the CLI resolves them transitively through the shared resolver and applies a fixed nearest-declaration-wins rule, reporting an unresolvable conflict before any write.

* Good, because composition is explicit, declared, and reviewable.
* Good, because recursion supports arbitrary composition depth with no special case.
* Good, because the collision rule is deterministic and an unresolvable conflict is reported, not merged.
* Neutral, because it depends on the manifest contract and the shared resolver, which are separate decisions it composes with.
* Bad, because it must detect and report reference cycles, and the single fixed precedence rule cannot be overridden per composition.

### Single-level manifest declaration, no transitive walk

Only directly-referenced templates are resolved; a referenced template's own references are ignored.

* Good, because resolution is simple and cannot recurse or cycle.
* Good, because the directly-referenced set is still explicit in the manifest.
* Bad, because a microfrontend template that is itself composed cannot deliver its own referenced units, failing single-operation completeness for any composition deeper than one level.
* Bad, because it pushes multi-level composition back onto the developer to assemble by hand.

### Convention-based discovery

The referenced set is inferred from filesystem layout or naming rather than declared, and resolved by scanning.

* Good, because a template author writes no explicit reference list.
* Bad, because the composition is implicit and not reviewable before scaffolding, failing declared inspectability.
* Bad, because convention-based inference is fragile and ambiguous, and offers no clean place to define a deterministic collision rule.

## More Information

The template manifest that carries the composition declaration is decided in `cpt-frontx-adr-template-manifest-contract`. Resolution of any single template reference to its source is performed by the one shared resolver decided in `cpt-frontx-adr-template-externalization-resolution`. Applying a newer template version to an already-scaffolded project is a separate, reviewable concern decided in `cpt-frontx-adr-upgrade-changeset-engine`. These are non-binding pointers to related decisions and are not part of this decision's durable identity.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because this is local developer tooling with no throughput or latency budget bound to the decision. **SEC** — Not applicable, because the decision introduces no secret material and no authentication surface. **REL** — Not applicable, because there is no service-availability target; the scaffold runs locally and on demand, and its fail-before-write atomicity is captured under the drivers rather than as a service-reliability concern. **DATA** — Not applicable, because no persistent database or schema is defined here. **OPS** — Not applicable, because there are no runbooks or operational procedures for a local command. **COMPL** — Not applicable, because no regulatory obligation bears on composition resolution. **UX** — addressed implicitly: one scaffold operation yields the whole composition, and a collision is reported clearly. **MAINT** — addressed: an explicit declared composition is easier to reason about and review than an inferred one. **TEST** — the Confirmation defines the fixtures that exercise recursion and collision; test implementation lives in code, not here. **ARCH-ADR-008 (supersession)** — Not applicable, because this ADR supersedes no live ADR. **Review cadence**: revisit if a composition needs a precedence other than nearest-declaration-wins, or if compositions routinely require cycle-bearing references; either condition would invalidate the single-fixed-rule assumption.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-cli-composed-template-resolution` — Recursive, manifest-declared resolution through the shared resolver is the mechanism by which referenced microfrontends are resolved and scaffolded as part of the same operation.
* `cpt-frontx-usecase-scaffold-composed-project` — This decision defines the single scaffold operation that delivers the composed project, and names the deterministic resolution for the "composition collision" alternative flow (report and abort before any write).
* `cpt-frontx-component-cli` — The CLI component owns composed-template resolution; this decision constrains how that component resolves a composition into one scaffold result.
