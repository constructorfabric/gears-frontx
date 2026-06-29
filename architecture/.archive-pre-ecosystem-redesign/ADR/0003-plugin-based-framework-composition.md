---
status: accepted
date: 2025-12-21
---

# Plugin-Based Framework Composition


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Builder pattern with plugin chain and Symbol-based identification](#builder-pattern-with-plugin-chain-and-symbol-based-identification)
  - [Monolithic framework with all features built in](#monolithic-framework-with-all-features-built-in)
  - [Configuration object with boolean feature flags](#configuration-object-with-boolean-feature-flags)
  - [String-based plugin identification](#string-based-plugin-identification)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-plugin-based-framework-composition`
## Context and Problem Statement

The framework layer must compose L1 SDK packages into a cohesive application without requiring source code modifications for each new capability. Features like MFE lifecycle management, mock mode control, theme propagation, and i18n management all need a consistent, open extension mechanism that does not bloat the framework core. A hardcoded feature registry would require framework changes every time a capability is added or removed.

## Decision Drivers

* Open/Closed Principle — the framework must be extensible without modification to its core
* Type-safe plugin identification to prevent runtime name collisions between independently authored plugins
* Plugin composition must be order-aware where plugins have dependencies on each other

## Considered Options

* Builder pattern with plugin chain and Symbol-based identification
* Monolithic framework with all features built in
* Configuration object with boolean feature flags
* String-based plugin identification

## Decision Outcome

Chosen option: "Builder pattern with plugin chain and Symbol-based identification", because it satisfies Open/Closed without source changes to the framework, Symbols prevent runtime identification collisions without a global registry, and the builder pattern makes plugin ordering explicit and readable at the call site.

### Consequences

* Good, because new capabilities are added by authoring a plugin and calling `.use()`, with no changes to framework internals
* Bad, because plugin ordering is implicit — plugins that depend on each other being initialized first require documentation or runtime guards

### Confirmation

`packages/framework/src/plugin.ts` defines the `Gears FrontXPlugin` interface with `init(context: Gears FrontXPluginContext)`. `packages/framework/src/createGears FrontX.ts` implements the builder with `.use()` and `.build()`. The mock plugin exports `MOCK_PLUGIN` Symbol and `MockPlugin` class in `packages/framework/src/plugins/mock/`.

## Pros and Cons of the Options

### Builder pattern with plugin chain and Symbol-based identification

* Good, because `Symbol()` guarantees uniqueness without a central registry, and the fluent `.use(plugin)` chain makes composition readable and statically analyzable
* Bad, because the call-site ordering of `.use()` invocations is the only mechanism for expressing plugin initialization order, which is not self-documenting

### Monolithic framework with all features built in

* Good, because all capabilities are always available without explicit composition
* Bad, because every consumer bundles all features regardless of need, and adding a capability requires modifying framework internals

### Configuration object with boolean feature flags

* Good, because it is familiar and requires no knowledge of plugin interfaces
* Bad, because configuration flags have limited expressiveness — plugins cannot accept typed initialization parameters or register dynamic slices

### String-based plugin identification

* Good, because strings are human-readable in logs and debugging output
* Bad, because string identifiers conflict silently at runtime when two plugins choose the same name, and TypeScript cannot validate uniqueness at compile time

## More Information

- `Gears FrontXPluginContext` exposes `registerSlice()`, `registerEffect()`, and `on()` (EventBus subscription) as the three extension surfaces available to plugins
- Related: ADR 0002 (Event-Driven Flux Data Flow) — plugins register effects and event listeners through the same context
- Related: ADR 0001 (Four-Layer SDK Architecture) — framework is L2, plugins may compose any L1 package through the context

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:
* `cpt-frontx-fr-sdk-plugin-arch` — Plugin interface and builder contract
* `cpt-frontx-fr-mfe-plugin` — MFE lifecycle plugin registration
* `cpt-frontx-fr-mock-toggle` — Mock mode controlled via MockPlugin through builder chain
* `cpt-frontx-principle-plugin-first-composition` — Architectural principle requiring all framework features to be delivered as plugins
* `cpt-frontx-component-framework` — Framework component boundary in the layer diagram
* `cpt-frontx-interface-plugin` — Formal Gears FrontXPlugin interface definition
