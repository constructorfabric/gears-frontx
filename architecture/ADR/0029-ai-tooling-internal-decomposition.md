---
status: accepted
date: 2026-07-16
---

# One Monolithic AI-Tooling Component Fuses Base Kit, Extension Host, and Upgrade Orchestration

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Three internal components under a retained package anchor](#three-internal-components-under-a-retained-package-anchor)
  - [Keep the single fused AI-tooling component](#keep-the-single-fused-ai-tooling-component)
  - [Merge upgrade orchestration into the CLI pillar](#merge-upgrade-orchestration-into-the-cli-pillar)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-ai-tooling-internal-decomposition`

## Context and Problem Statement

The AI Tooling pillar (`cpt-frontx-component-ai-tooling-kit`, the `cyber-pilot-kit-frontx` package) is documented in `architecture/DESIGN.md` as a single component that fuses three separable concerns: the base ecosystem capabilities available at session start, the discovery-and-activation of template-bundled AI extensions, and the AI workflow surface that orchestrates the CLI change-set engine for upgrades. As with the CLI pillar, this leaves the AI pillar described at a coarser altitude than the Core Framework and hides distinct reasons-to-change in one unit. How should the single AI-tooling package be decomposed at DESIGN altitude so each concern is a first-class component with clear boundaries, without fragmenting the single published kit?

## Decision Drivers

* **Single responsibility** — base capabilities, extension discovery/activation, and upgrade orchestration change for different reasons and should be separable units.
* **Solution-agnostic base** — the boundary that keeps zero solution-specific content in the framework (KIT-2) is clearest when the base kit is its own component distinct from the extension host that admits template content.
* **Orchestrate, do not reimplement** — the rule that the framework orchestrates rather than reimplements the CLI change-set engine (KIT-3) needs a component to attach to, distinct from the base kit and extension host.
* **Pillar parity** — the AI pillar should read at the same altitude as the Core Framework and the newly decomposed CLI pillar.
* **One package, internal structure** — the parts are internal components of one published kit, anchored by a retained package-level component.

## Considered Options

* **Three internal components under a retained package anchor** — keep `cpt-frontx-component-ai-tooling-kit` as the package-level anchor (the installed kit) that composes three internal components: base kit, extension host, and upgrade orchestration.
* **Keep the single fused AI-tooling component** — leave the kit as one component described in prose bullets.
* **Merge upgrade orchestration into the CLI pillar** — move the AI upgrade workflow surface into the CLI's change-set-engine component.

## Decision Outcome

Chosen option: **Three internal components under a retained package anchor**, because it gives each concern a single reason to change and an explicit boundary while preserving the single published kit. The anchor `cpt-frontx-component-ai-tooling-kit` is retained — it is referenced by the AI-pillar ADRs (`cpt-frontx-adr-ai-tooling-framework-packaging`, `cpt-frontx-adr-template-ai-extension-contract`, `cpt-frontx-adr-extension-discovery-activation`, `cpt-frontx-adr-solution-ai-content-placement`, `cpt-frontx-adr-ai-driven-upgrade-orchestration`) and must not be orphaned — and owns only the kit packaging and composition, delegating each concern to one internal component. The base kit isolates the solution-agnostic capabilities (anchoring KIT-2), the extension host isolates discovery-and-activation of template bundles, and upgrade orchestration isolates the AI workflow surface that orchestrates the CLI engine (anchoring KIT-3). Leaving the component fused perpetuates the altitude asymmetry; merging upgrade orchestration into the CLI pillar is rejected because it would put AI workflow logic inside the Core lifecycle package and blur the KIT-3 boundary that keeps the AI framework an orchestrator, not an owner, of the change-set engine.

The three internal components are `cpt-frontx-component-ai-base-kit` (base ecosystem capabilities at session start, `frontx_`-prefixed), `cpt-frontx-component-ai-extension-host` (recognition of the AI-extension contract and discovery/activation of installed-template bundles), and `cpt-frontx-component-ai-upgrade-orchestration` (the AI workflow surface that orchestrates and enriches the CLI change-set engine). This decision fixes the decomposition and each part's responsibility boundary at DESIGN altitude; it does not specify kit resource layout or implementation.

On the pillar's own guiding principle: rather than introduce a new AI-specific principle, this decision folds the AI pillar's "template-sourced expertise" rule into the existing `cpt-frontx-principle-template-agnostic-tooling`, which already states that the framework ships only base capabilities and gains solution-specific expertise exclusively through installed-template bundles. A separate principle would restate that rule and add no new guidance, so the existing principle is treated as the AI pillar's own; the base-kit/extension-host boundary in this decomposition is the structural expression of it.

### Consequences

* Good, because each concern has a single reason to change and an explicit boundary, matching the Core Framework's altitude.
* Good, because KIT-2 attaches to the base-kit component and KIT-3 attaches to the upgrade-orchestration component.
* Good, because the extension host isolates the one place template content enters the framework.
* Neutral, because the parts remain inside one published kit, so no new distribution artifact is introduced.
* Bad, because DESIGN gains three new component identifiers whose downstream coverage is a subsequent stage.
* Bad, because a package anchor that only composes internal parts adds one indirection level to the model.

### Confirmation

Compliance is confirmed by design review that each of the three internal components appears in DESIGN §3.2 with its own why-exists, responsibility scope, responsibility boundaries, and related-components, and that the retained anchor delegates rather than owns the concerns. A later stage confirms the kit's resource organization aligns with these components and that upgrade orchestration holds no independent change-set logic (KIT-3).

## Pros and Cons of the Options

### Three internal components under a retained package anchor

Retain the package anchor; add base kit, extension host, and upgrade orchestration as internal components.

* Good, because each concern is a single-responsibility unit with an explicit boundary.
* Good, because it keeps one published kit while balancing the pillar's altitude.
* Good, because KIT-2 and KIT-3 become attachable to distinct components.
* Neutral, because it introduces a compose-only anchor.
* Bad, because new component IDs require later DECOMPOSITION/FEATURE coverage.

### Keep the single fused AI-tooling component

Leave the kit as one component described in prose.

* Good, because it introduces no new identifiers.
* Bad, because it hides three distinct reasons-to-change in one unit and keeps the pillar below Core Framework altitude.
* Bad, because KIT-2 and KIT-3 have no distinct component to anchor.

### Merge upgrade orchestration into the CLI pillar

Move the AI upgrade workflow surface into the CLI change-set-engine component.

* Good, because upgrade logic would live beside the engine it drives.
* Bad, because it puts AI workflow logic inside the Core lifecycle package.
* Bad, because it blurs the KIT-3 boundary that keeps the framework an orchestrator, not an owner, of the engine.

## More Information

This decomposition is the AI-pillar counterpart to `cpt-frontx-adr-cli-internal-decomposition` and to `cpt-frontx-adr-core-package-boundaries`. The base capabilities' packaging is decided in `cpt-frontx-adr-ai-tooling-framework-packaging`; the extension contract in `cpt-frontx-adr-template-ai-extension-contract`; discovery/activation in `cpt-frontx-adr-extension-discovery-activation`; the solution-agnostic boundary in `cpt-frontx-adr-solution-ai-content-placement`; and the orchestration relationship in `cpt-frontx-adr-ai-driven-upgrade-orchestration`. These are non-binding pointers and do not form part of this decision's durable identity.

Applicability of the remaining checklist categories: **PERF** — Not applicable, because a component-decomposition decision binds no latency or throughput budget. **SEC** — Not applicable, because it introduces no secret material or authentication surface. **REL** — Not applicable, because the AI framework owns no service-availability tier. **DATA** — Not applicable, because this decision fixes no schema (contract schemas are governed by `cpt-frontx-adr-contract-schema-ownership`). **INT** — addressed: the upgrade-orchestration component integrates with the CLI change-set engine strictly as an orchestrator (KIT-3). **OPS** — Not applicable, because no operational procedure attaches to an internal decomposition. **MAINT** — addressed directly: single-responsibility components reduce coupling and clarify reasons-to-change. **COMPL** — Not applicable. **UX** — Not applicable, because the agent-facing surface is unchanged by an internal decomposition. **BIZ** — Not applicable, because product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-component-ai-tooling-kit` — Retained as the package-level anchor that owns kit packaging and composes the three internal components.
* `cpt-frontx-component-ai-base-kit` — Established as the solution-agnostic base-capability component.
* `cpt-frontx-component-ai-extension-host` — Established as the discovery-and-activation component for template-bundled extensions.
* `cpt-frontx-component-ai-upgrade-orchestration` — Established as the AI workflow surface that orchestrates the CLI change-set engine.
* `cpt-frontx-constraint-kit-zero-solution-content` — Zero solution-specific content, anchored to the base-kit component.
* `cpt-frontx-constraint-kit-orchestrates-not-reimplements` — Orchestrates, not reimplements. It binds every CLI engine the framework drives, not the upgrade path alone: the change-set engine on that path, and the template resolver and assembler on the scaffolding path. This decision's internal decomposition places the orchestration workflows that satisfy it, and the constraint itself is stated in DESIGN's KIT-3 clause together with the one delegation it admits.
