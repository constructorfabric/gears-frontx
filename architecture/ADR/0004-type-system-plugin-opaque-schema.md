---
status: proposed
date: 2026-06-04
---

# Treat Type Identifiers as Opaque and Delegate Schema Operations to an Injected Type-System Plugin


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Opaque schema surface with delegation to an injected plugin](#opaque-schema-surface-with-delegation-to-an-injected-plugin)
  - [Runtime depends on a concrete structural schema shape](#runtime-depends-on-a-concrete-structural-schema-shape)
  - [Runtime embeds a single canonical type-system format](#runtime-embeds-a-single-canonical-type-system-format)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-type-system-plugin-opaque-schema`
## Context and Problem Statement

The MFE Runtime must validate microfrontends and their extensions against type definitions and reason about type hierarchy, yet it must stay independent of any single type-definition specification so that any conforming type system can be composed against it. This requires deciding how much of a type definition the runtime is allowed to see: whether it reasons about types by their structural schema shape or solely by identity. How should the runtime's relationship to type definitions be shaped so that it carries no concrete type-format knowledge while still admitting only valid units?

## Decision Drivers

* Substrate-agnosticism — the runtime must declare no dependency on, and embed no literals of, any concrete type-system format (anchors `cpt-frontx-constraint-mfes-opaque-schema-surface`, `cpt-frontx-principle-agnostic-core`).
* Minimal knowledge — the runtime needs only to route validation and hierarchy questions to a provider and to refer to a schema by identity; it does not need a schema's internal structure to do its job.
* Confinement of format grammar — understanding the grammar of type identifiers (such as deriving a package from an identifier) is type-system knowledge and belongs to the provider, not the runtime.
* Substitutability — keeping the runtime's view of a schema to an identifier lets any conforming provider supply the concrete shape behind that identity.
* Enforceable boundary — the limit on what the runtime may see must be expressible as a continuous-integration check.

## Considered Options

* **Opaque schema surface with delegation to an injected plugin** — the runtime treats type identifiers as opaque strings, reads only a schema's identifier, and delegates every schema, validation, and hierarchy operation to an injected `TypeSystemPlugin`.
* **Runtime depends on a concrete structural schema shape** — the runtime reasons about schema internals (properties, references, structure) directly through a concrete schema type.
* **Runtime embeds a single canonical type-system format** — the runtime hardcodes one type-definition specification and reasons about types natively, with no provider port.

## Decision Outcome

Chosen option: **opaque schema surface with delegation to an injected plugin**, because it is the only option that keeps the runtime free of any concrete type-format knowledge while still admitting only valid units. The runtime reasons about types solely by identity and routes all schema, validation, and type-of operations through an injected provider port (`packages/screensets/src/mfe/plugins/types.ts`, the `TypeSystemPlugin` contract documented as treating type identifiers as opaque strings and delegating all type-identifier understanding to the plugin). The registry holds that provider as its read-only `typeSystem` (`packages/screensets/src/mfe/runtime/MfeRegistry.ts`) and performs no schema interpretation itself. The runtime's view of a schema is therefore an opaque surface that exposes only a stable identifier; the concrete schema shape lives behind the port. This is the MFES-5 boundary (`cpt-frontx-constraint-mfes-opaque-schema-surface`).

As a consequence of treating identifiers as opaque, the grammar of those identifiers is also the provider's concern: deriving structure from a type identifier — for example extracting a package from an entity identifier (`packages/screensets/src/mfe/gts/extract-package.ts`) — is type-system grammar and is owned by the type-system plugin rather than the runtime surface. This Q9 placement is reaffirmed in `cpt-frontx-adr-gts-default-type-system`.

### Consequences

* Good, because the runtime carries no concrete type-format dependency or literals, so any conforming provider can be injected.
* Good, because the runtime's logic is simpler: it refers to types by identity and asks the provider for judgments rather than interpreting schemas.
* Good, because type-identifier grammar is confined to the provider, keeping format parsing out of the runtime.
* Good, because the opaque-surface limit is a continuous-integration-checkable invariant.
* Bad, because every schema or validation question requires a call across the port, so the runtime cannot make local decisions from a schema's contents.
* Bad, because the expressive power available to the runtime is intentionally limited to identity, which constrains optimizations that would need structural schema knowledge.

### Confirmation

Architecture review confirms the runtime refers to a schema only by its identifier and delegates all schema, validation, and hierarchy operations to the injected provider. A continuous-integration check (an import-and-reference boundary grep) confirms that runtime code imports no concrete schema-shape type and reasons over no schema field other than its identifier, and that type-identifier grammar parsing is reached only through the provider — enforcing `cpt-frontx-constraint-mfes-opaque-schema-surface`.

## Pros and Cons of the Options

### Opaque schema surface with delegation to an injected plugin

The runtime sees a schema as an identifier and routes all schema and validation work to the injected `TypeSystemPlugin`.

* Good, because the runtime stays free of concrete type-format knowledge.
* Good, because any conforming provider is substitutable behind the port.
* Good, because type-identifier grammar is confined to the provider.
* Neutral, because it requires a well-defined provider port contract.
* Bad, because schema and validation questions always cross the port.

### Runtime depends on a concrete structural schema shape

The runtime reads schema internals directly through a concrete schema type.

* Good, because the runtime can make local decisions from a schema's structure without a port call.
* Bad, because the runtime becomes bound to one schema representation, losing substrate-agnosticism.
* Bad, because format-specific grammar knowledge spreads into the runtime.

### Runtime embeds a single canonical type-system format

The runtime hardcodes one type-definition specification and reasons about types natively.

* Good, because there is no port indirection and behavior is fully under runtime control.
* Bad, because the runtime cannot be composed with any alternative conforming type system.
* Bad, because a change to the chosen format reaches directly into the runtime.

## More Information

The injected provider port is defined as the `TypeSystemPlugin` contract in `packages/screensets/src/mfe/plugins/types.ts`; the runtime holds an instance as the registry's read-only `typeSystem` and delegates validation, schema lookup, and type-of resolution to it. The opaque-surface decision is the boundary `cpt-frontx-constraint-mfes-opaque-schema-surface`; the choice of which concrete provider satisfies the port, and the schemas that provider owns, are decided in `cpt-frontx-adr-gts-default-type-system`.

**Scope of impact.** Applies to what the runtime may know about a type definition and how it obtains type judgments. It does not decide the concrete provider, the concrete schema representation behind the port, or how microfrontends are loaded, mounted, or isolated.

**Review trigger.** Revisit if a requirement emerges for the runtime to make admission or placement decisions that intrinsically need structural schema knowledge, which would challenge the identity-only surface.

**Checklist applicability.**

* ARCH — applicable and addressed above (a structural decision that fixes the runtime's relationship to every type system and is hard to reverse).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new, standalone decision that supersedes no prior record.
* INT — applicable: the `TypeSystemPlugin` port is an integration surface between the runtime and any conforming provider; its breaking-change policy is governed by `cpt-frontx-interface-type-system`.
* PERF — Not applicable because the boundary is a knowledge-scope decision, not a throughput or latency target; any per-call cost is an intrinsic consequence noted above rather than a measured objective here.
* SEC — Not applicable because the opaque surface introduces no secret, credential, or authorization concern.
* REL — Not applicable because this governs the type-knowledge boundary, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store is involved; schema shape is owned by the provider, not persisted by the runtime.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-type-validation` — microfrontends and their extensions are validated at registration by delegating to the injected provider, while the runtime sees types only by identity.
* `cpt-frontx-fr-application-type-definitions` — an application's own type definitions are registered with the provider behind the opaque surface, so the runtime needs no knowledge of their structure.
* `cpt-frontx-interface-type-system` — defines the provider behind the runtime's opaque port as the type-system integration surface.
* `cpt-frontx-constraint-mfes-opaque-schema-surface` — this decision is the rationale for the MFES-5 boundary invariant.
* `cpt-frontx-component-mfe-runtime` — fixes the runtime's identity-only view of type definitions.
* `cpt-frontx-component-type-system-plugin` — places concrete schema shape and type-identifier grammar behind the provider port.
* `cpt-frontx-principle-agnostic-core` — the opaque surface is the type-substrate realization of the agnostic-core principle.
