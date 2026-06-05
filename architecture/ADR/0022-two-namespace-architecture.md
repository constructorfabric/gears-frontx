---
status: proposed
date: 2026-06-04
---

# Two-Namespace Command Architecture by Template Kind


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Two namespaces by template kind, over one shared resolver](#two-namespaces-by-template-kind-over-one-shared-resolver)
  - [Flat command set](#flat-command-set)
  - [One binary per kind](#one-binary-per-kind)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-two-namespace-architecture`
## Context and Problem Statement

The product supports two first-class kinds of template: project templates and microfrontend templates. The CLI (`cpt-frontx-component-cli`, the `@cyberfabric/cli` package) drives the full lifecycle of both — scaffolding a project from a project template (`cpt-frontx-fr-cli-project-scaffold`) and scaffolding a microfrontend from a microfrontend template (`cpt-frontx-fr-cli-microfrontend-scaffold`) — and must present that lifecycle as a command surface developers can navigate. The product requires commands organized into a project-level namespace and a microfrontend-level namespace (`cpt-frontx-fr-cli-two-namespace-commands`). How should the command surface be shaped so a developer finds the right command by the kind of work they are doing, and how should the two kinds relate to the single mechanism that resolves a template reference to its source?

## Decision Drivers

* **Navigability by work kind** — a developer should locate the right command by the kind of unit they are working on (a project or a microfrontend), so the surface mirrors how developers think about the work.
* **A stable, versioned public interface** — the command surface is the CLI's public interface (`cpt-frontx-interface-cli`); its shape is a compatibility contract, so its organization must be deliberate and its evolution governed by an explicit versioning policy.
* **Reflecting the two template kinds** — the surface should make the two first-class template kinds visible in its structure rather than hiding the distinction behind flat, undifferentiated commands.
* **One resolution mechanism across kinds** — both kinds resolve a template reference to its source the same way; the surface organization must not imply or require two divergent resolvers.
* **Cohesion within a kind** — operations on a project (scaffold, upgrade, provenance) and operations on a microfrontend should each cluster, so related commands sit together and the surface stays coherent as commands are added.

## Considered Options

* **Two namespaces by template kind, over one shared resolver** — commands are grouped into a project-level namespace and a microfrontend-level namespace reflecting the two template kinds; both namespaces resolve template references through one shared resolver.
* **Flat command set** — all commands sit in a single undifferentiated namespace, distinguished only by command name, with the template kind expressed as an argument or naming prefix rather than as namespace structure.
* **One binary per kind** — the project lifecycle and the microfrontend lifecycle ship as two separate command-line programs, each with its own surface and its own resolution path.

## Decision Outcome

Chosen option: **Two namespaces by template kind, over one shared resolver**, because it is the only option that makes the two template kinds first-class in the surface, keeps each kind's commands cohesive, and presents a single governed public interface — while still resolving references through one mechanism. Commands are organized into a project-level namespace and a microfrontend-level namespace; that organization is the shape of the CLI's public command surface.

Crucially, the two namespaces share **ONE** resolver: the single shared resolver decided in `cpt-frontx-adr-template-externalization-resolution` resolves a template reference to its source for both the project-level and the microfrontend-level namespace. The namespace split is a surface-organization decision for navigability and cohesion; it is not a split in resolution mechanism. The flat option fails navigability and cohesion and hides the two-kind distinction; the one-binary-per-kind option fragments the public interface into two programs and pressures the surface toward two divergent resolution paths, working against the one-resolver driver.

The command surface this organization defines is the CLI's public interface (`cpt-frontx-interface-cli`), and its stability is governed by the matched-version artifact-distribution policy decided in `cpt-frontx-adr-matched-version-artifact-distribution`: an incompatible change to the command surface requires a major version bump, while minor and patch versions preserve backward compatibility. The scope of this decision is the organization and public-interface shape of the command surface and its relationship to the shared resolver. It does not decide what each individual command does, nor the resolver's own design (that is `cpt-frontx-adr-template-externalization-resolution`), nor the versioning policy itself (that is `cpt-frontx-adr-matched-version-artifact-distribution`).

### Consequences

* Good, because a developer navigates to the right command by the kind of unit they are working on, matching how the work is conceived.
* Good, because each kind's commands cluster cohesively, so the surface stays coherent as commands are added within a namespace.
* Good, because one shared resolver serves both namespaces, so resolution behaviour is defined once and cannot diverge by kind.
* Good, because the surface is one governed public interface whose compatibility is bound to an explicit version policy.
* Bad, because a command meaningful to both kinds must be placed deliberately or mirrored in both namespaces, which is a surface-design cost the flat option would not incur.
* Bad, because the namespace boundary is itself part of the public interface, so reorganizing it later is a compatibility-affecting change governed by the version policy.

### Confirmation

Compliance is confirmed by a continuous-integration check on the CLI package that asserts the command surface exposes exactly a project-level namespace and a microfrontend-level namespace, that project-kind and microfrontend-kind commands resolve to their respective namespace, and that both namespaces invoke the one shared resolver rather than separate resolution paths. A public-interface compatibility check (tied to the version policy) asserts that an incompatible change to the namespace surface is accompanied by a major version bump. Design and code review confirm the namespace organization mirrors the two template kinds and that no second resolver exists.

## Pros and Cons of the Options

### Two namespaces by template kind, over one shared resolver

Commands are grouped into project-level and microfrontend-level namespaces; both resolve references through one shared resolver.

* Good, because the surface is navigable by work kind and makes the two template kinds first-class.
* Good, because each kind's commands stay cohesive within their namespace.
* Good, because one shared resolver guarantees uniform resolution across both kinds.
* Neutral, because it relies on the shared resolver and the version policy, which are separate decisions it composes with.
* Bad, because cross-kind commands need deliberate placement and the namespace boundary is part of the versioned public interface.

### Flat command set

All commands sit in one undifferentiated namespace, with kind expressed by name or argument.

* Good, because there is no namespace structure to design or maintain.
* Good, because there is no cross-kind placement question.
* Bad, because the two template kinds are not first-class in the surface, failing navigability and the reflect-the-kinds driver.
* Bad, because related commands do not cluster, so the surface loses cohesion as it grows.

### One binary per kind

The project lifecycle and the microfrontend lifecycle ship as two separate programs.

* Good, because each program's surface is fully cohesive to one kind.
* Bad, because the public interface fragments into two programs a developer must install and learn separately.
* Bad, because two programs pressure the design toward two resolution paths, working against the one-shared-resolver driver.

## More Information

The single shared resolver both namespaces use is decided in `cpt-frontx-adr-template-externalization-resolution`. The version policy that governs the public command surface's compatibility is decided in `cpt-frontx-adr-matched-version-artifact-distribution`. These are non-binding pointers to related decisions and are not part of this decision's durable identity.

Integration treatment (INT): the namespace organization is the shape of the CLI's public interface (`cpt-frontx-interface-cli`). **Interface stability and versioning** — the surface is governed by the matched-version policy: an incompatible change to the command surface requires a major version bump; minor and patch releases preserve backward compatibility (INT-ADR-001). **Contract changes (INT-ADR-002)** — because the namespace boundary is part of the public interface, a change to it is a public-interface change subject to the same compatibility policy; consumers (developers and the AI agents acting for them) are notified through the version bump, and backward compatibility within a major version is the consumer guarantee. There is no separate network protocol or wire format to version here, so protocol-change items are Not applicable.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because there is no latency or throughput budget bound to command-surface organization. **SEC** — Not applicable, because the decision introduces no secret material and no authentication surface. **REL** — Not applicable, because there is no service-availability target; the CLI runs locally and on demand. **DATA** — Not applicable, because no persistent database or schema is defined here. **OPS** — Not applicable, because there are no runbooks or operational procedures for a local command surface. **COMPL** — Not applicable, because no regulatory obligation bears on the command organization. **UX** — addressed: the two namespaces are the primary navigability affordance of the surface. **MAINT** — addressed: cohesive per-kind namespaces keep the surface coherent as commands are added. **ARCH-ADR-008 (supersession)** — Not applicable, because this ADR supersedes no live ADR. **Review cadence**: revisit if a third first-class template kind is introduced (which would add a namespace) or if a large share of commands prove meaningful to both kinds (which would pressure the by-kind organization).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-fr-cli-two-namespace-commands` — This decision is the organization that realizes the required project-level and microfrontend-level command namespaces.
* `cpt-frontx-fr-cli-project-scaffold` — Project scaffolding is a project-level-namespace command under this organization.
* `cpt-frontx-fr-cli-microfrontend-scaffold` — Microfrontend scaffolding is a microfrontend-level-namespace command under this organization.
* `cpt-frontx-interface-cli` — The namespace organization is the shape of this public interface; this decision defines that shape and binds its stability to the matched-version policy.
* `cpt-frontx-component-cli` — The CLI component owns the command surface; this decision constrains how that surface is organized and how both namespaces share one resolver.
