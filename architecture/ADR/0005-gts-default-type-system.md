---
status: accepted
date: 2026-06-04
---

# Supply a GTS-Backed Default Provider for the Runtime's Type-Substrate Port


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A GTS-backed default provider shipped with the ecosystem](#a-gts-backed-default-provider-shipped-with-the-ecosystem)
  - [No default provider; consumer-supplied only](#no-default-provider-consumer-supplied-only)
  - [A minimal built-in ad-hoc validator](#a-minimal-built-in-ad-hoc-validator)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-gts-default-type-system`
## Context and Problem Statement

The MFE Runtime reasons about types only by identity and delegates all schema, validation, and hierarchy operations to an injected provider of its type-substrate port. For the ecosystem to admit and validate microfrontends out of the box, that port needs a concrete provider that gives type identifiers meaning and that supplies the ecosystem's infrastructure type definitions. How should the ecosystem's default type-substrate provider be shaped so that it gives the runtime working type judgments, is ready to use immediately, and confines the concrete type-definition specification to a single component?

## Decision Drivers

* Out-of-the-box readiness — the ecosystem must validate microfrontends without every consumer first authoring a type system (anchors `cpt-frontx-fr-mfe-type-validation`).
* Confinement of the concrete specification — the concrete type-definition specification must live in exactly one component so the runtime and all other Core Framework concerns stay agnostic (anchors `cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`, `cpt-frontx-principle-agnostic-core`).
* Ownership of infrastructure type definitions — the ecosystem's infrastructure schemas and default lifecycle instances need a clear owner that registers them as part of being ready.
* Conformance to the type-substrate port — whatever provides type judgments must satisfy the runtime's port contract so it remains substitutable.
* Specification conformance — the default provider must conform to the Global Type System specification it builds on (anchors PRD §10).

## Considered Options

* **A GTS-backed default provider shipped with the ecosystem** — a component implements the type-substrate port over the Global Type System (GTS) toolkit, owns the ecosystem infrastructure schemas and the default lifecycle instances, and registers them at construction so it is ready immediately.
* **No default provider; consumer-supplied only** — the ecosystem ships no provider, and every consumer must author and inject a conforming implementation before any validation can occur.
* **A minimal built-in ad-hoc validator** — the ecosystem ships a small bespoke validator instead of building on an established type-system toolkit.

## Decision Outcome

Chosen option: **a GTS-backed default provider shipped with the ecosystem**, because it is the only option that makes the ecosystem ready to validate microfrontends out of the box while confining the concrete type-definition specification to one component. The provider implements the runtime's type-substrate port over the Global Type System toolkit (`@globaltypesystem/gts-ts`) and, at construction, loads and registers the ecosystem infrastructure schemas and the default lifecycle-stage instances, validating those instances before it is considered ready (`packages/screensets/src/mfe/plugins/gts/index.ts`; the infrastructure schema and instance set is loaded from `packages/screensets/src/mfe/gts/loader.ts`). It answers the runtime's type-of questions over GTS type derivation and exposes a ready-to-use default instance. It owns the ecosystem infrastructure schemas only (`cpt-frontx-constraint-gts-plugin-owns-infra-schemas`); solution-specific schemas are registered by their owners at runtime and are excluded from it (`cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`).

Consistent with `cpt-frontx-adr-type-system-plugin-opaque-schema`, the grammar of type identifiers is owned here, not by the runtime surface: deriving a package from an entity identifier (`packages/screensets/src/mfe/gts/extract-package.ts`) is GTS grammar and belongs to this provider, reaffirming the Q9 placement.

### Consequences

* Good, because the ecosystem validates microfrontends out of the box, with infrastructure schemas and default lifecycle instances registered at construction.
* Good, because the concrete type-definition specification is confined to one component, keeping the runtime and other concerns agnostic.
* Good, because the provider satisfies the runtime's port and therefore remains substitutable by any other conforming provider.
* Good, because type-identifier grammar is owned alongside the concrete specification rather than in the runtime.
* Bad, because the default provider carries a dependency on the GTS toolkit and the GTS specification, which consumers of the default inherit.
* Bad, because the provider must keep its infrastructure schema set conformant with the GTS specification as that specification evolves.

### Confirmation

Architecture review confirms the provider implements the runtime's type-substrate port, owns the ecosystem infrastructure schemas and default lifecycle instances, and registers them at construction such that it is ready immediately. A continuous-integration check confirms the provider satisfies the port contract and that its owned schema set is the infrastructure set with no solution-specific schemas (`cpt-frontx-constraint-gts-plugin-owns-infra-schemas`, `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas`), and that type-identifier grammar parsing is owned here rather than in the runtime.

## Pros and Cons of the Options

### A GTS-backed default provider shipped with the ecosystem

A component implements the type-substrate port over the GTS toolkit and registers the infrastructure schemas and default lifecycle instances at construction.

* Good, because the ecosystem is ready to validate without consumer setup.
* Good, because it confines the concrete specification and its grammar to one component.
* Good, because it builds on an established type-system toolkit rather than bespoke validation.
* Neutral, because it introduces a dependency on the GTS toolkit and specification.
* Bad, because the provider must track the GTS specification as it evolves.

### No default provider; consumer-supplied only

The ecosystem ships no provider; consumers must author and inject one.

* Good, because the ecosystem carries no type-system dependency at all.
* Bad, because nothing validates out of the box, raising the cost of first use for every consumer.
* Bad, because the ecosystem's own infrastructure schemas would lack a canonical owner.

### A minimal built-in ad-hoc validator

The ecosystem ships a small bespoke validator instead of an established toolkit.

* Good, because it avoids depending on an external type-system toolkit.
* Bad, because bespoke validation re-derives type-system capabilities (hierarchy, derivation, schema resolution) that a mature toolkit already provides.
* Bad, because it offers no shared specification for solution authors to target.

## More Information

The present concrete instantiation of the default provider is `@gears-frontx/gts-plugin`, which implements the type-substrate port over `@globaltypesystem/gts-ts` and is exposed as a ready-to-use default instance. At construction it loads the ecosystem infrastructure schemas and the default lifecycle-stage instances from `packages/screensets/src/mfe/gts/loader.ts` and registers them; the specific membership and size of that infrastructure set is descriptive and non-binding, and may change as the ecosystem's infrastructure schemas evolve without altering this decision. Solution-specific and application-derived type definitions are registered by their owners at runtime and are not part of this provider.

**Scope of impact.** Applies to the ecosystem's default type-substrate provider, the schemas it owns, and the placement of type-identifier grammar. It does not decide the runtime's opaque view of types (decided in `cpt-frontx-adr-type-system-plugin-opaque-schema`), the runtime's public surface, or how solution authors structure their own schemas.

**Review trigger.** Revisit if the Global Type System specification ceases to satisfy the ecosystem's type-validation needs, or if a requirement emerges for the ecosystem to ship without any default provider.

**Checklist applicability.**

* ARCH — applicable and addressed above (selects the ecosystem's default type-substrate provider and the owner of its infrastructure schemas; reversible only by re-homing those schemas).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new, standalone decision that supersedes no prior record.
* INT — applicable: the provider conforms to the runtime's type-substrate port and to the GTS specification; both are integration surfaces, governed by `cpt-frontx-interface-type-system` and PRD §10 respectively.
* PERF — Not applicable because this selects a provider and schema owner, not a performance target.
* SEC — Not applicable because the provider introduces no secret, credential, or authorization concern.
* REL — Not applicable because this governs the default provider's identity and ownership, not runtime availability or fault tolerance.
* DATA — Not applicable here because schema content is owned by the provider and described at design altitude rather than enumerated in this record.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-type-validation` — the default provider is what gives type identifiers meaning so microfrontends and extensions can be validated at registration out of the box.
* `cpt-frontx-interface-type-system` — provides the concrete implementation behind the type-system interface's opaque port.
* `cpt-frontx-constraint-gts-plugin-owns-infra-schemas` — this decision is the rationale for the provider owning the ecosystem infrastructure schemas.
* `cpt-frontx-constraint-gts-plugin-excludes-solution-schemas` — this decision is the rationale for excluding solution-specific schemas from the provider.
* `cpt-frontx-component-type-system-plugin` — selects and shapes the Type System Plugin component.
* `cpt-frontx-component-mfe-runtime` — the provider satisfies the runtime's injected type-substrate port.
* `cpt-frontx-principle-agnostic-core` — confining the concrete specification to this provider keeps the rest of the Core Framework agnostic.
