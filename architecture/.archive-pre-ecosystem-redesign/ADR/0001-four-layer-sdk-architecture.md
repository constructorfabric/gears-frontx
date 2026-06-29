---
status: accepted
date: 2025-12-21
---

# Four-Layer SDK Architecture


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Four-layer architecture with strict downward-only dependency direction](#four-layer-architecture-with-strict-downward-only-dependency-direction)
  - [Monolithic uicore package](#monolithic-uicore-package)
  - [Micro-packages without layering rules](#micro-packages-without-layering-rules)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-four-layer-sdk-architecture`
## Context and Problem Statement

FrontX needed a modular architecture allowing users to pick individual SDK pieces while maintaining a cohesive framework, without imposing React on SDK consumers. The predecessor `@gears-frontx/uicore` monolith bundled state, API, i18n, and UI concerns in a single package. This made it impossible to adopt individual capabilities independently, forced React on non-UI consumers, and created circular dependency risks as the codebase grew.

## Decision Drivers

* Framework-agnostic core — SDK consumers must not be forced to depend on React
* SOLID compliance — each package must have a single, clearly scoped responsibility
* Independent versionability — L1 packages must be releasable without coordinating with UI layers

## Considered Options

* Four-layer architecture with strict downward-only dependency direction
* Monolithic uicore package combining all concerns
* Micro-packages without explicit layering rules

## Decision Outcome

Chosen option: "Four-layer architecture with strict downward-only dependency direction", because it enforces clear separation of concerns, makes each layer independently testable and versionable, and enables future framework adapters (Vue, Solid) without restructuring the core.

### Consequences

* Good, because L1 packages are zero-dependency relative to other `@gears-frontx/*` packages, enabling tree-shaking and independent adoption
* Bad, because the repository contains more packages to maintain and build order must be respected during CI

### Confirmation

`dependency-cruiser` rules enforce layer boundaries — any L1 package importing another `@gears-frontx/*` package will fail the lint step. Verify by inspecting `packages/*/package.json` and confirming the `dependencies` field contains no `@gears-frontx/*` entries for L1 packages (state, api, i18n, screensets).

## Pros and Cons of the Options

### Four-layer architecture with strict downward-only dependency direction

* Good, because each layer has a single responsibility and can be adopted, tested, and released independently
* Bad, because contributors must understand the layer model before making changes, and adding capabilities that span layers requires deliberate design

### Monolithic uicore package

* Good, because a single package is simpler to publish and easier for consumers to install
* Bad, because all capabilities are bundled together, React is forced on non-UI consumers, and bundle size cannot be reduced through tree-shaking

### Micro-packages without layering rules

* Good, because each concern gets its own package without a prescribed hierarchy
* Bad, because without explicit dependency direction rules, cross-dependency cycles emerge and build order becomes unpredictable

## More Information

- Layer definitions: L1 SDK (state, screensets, api, i18n) — zero `@gears-frontx/*` dependencies; L2 Framework — composes all L1; L3 React — depends only on L2; Standalone — studio, cli outside the hierarchy
- Related: ADR 0005 (ESM-First Module Format) governs output format for all layers

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:
* `cpt-frontx-fr-sdk-flat-packages` — each SDK concern lives in its own package with no cross-L1 dependencies
* `cpt-frontx-fr-sdk-layer-deps` — downward-only dependency direction enforced by dependency-cruiser
* `cpt-frontx-nfr-maint-zero-crossdeps` — zero cross-dependencies at L1 as a non-functional requirement
* `cpt-frontx-principle-layer-isolation` — architectural principle mandating layer boundary enforcement
* `cpt-frontx-constraint-zero-cross-deps-at-l1` — hard constraint on L1 package dependency graph
* `cpt-frontx-tech-layer-architecture` — technology decision capturing the four-layer model
