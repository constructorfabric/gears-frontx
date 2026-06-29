---
status: accepted
date: 2026-06-05
---

# Admit Extensions into Domains by Subset-Rule Contract Matching


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Subset-rule contract matching with a scoped infrastructure exemption](#subset-rule-contract-matching-with-a-scoped-infrastructure-exemption)
  - [Free binding (no compatibility check)](#free-binding-no-compatibility-check)
  - [Exact-equality matching](#exact-equality-matching)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-domain-extension-contract-matching`
## Context and Problem Statement

An extension domain is a governed slot, and binding an extension's entry into a domain creates a two-way dependency: the entry needs certain capabilities and shared properties from the domain, and the domain needs certain capabilities from any entry it admits. Admitting an entry whose capability and property expectations do not line up with the domain would defer a structural mismatch to the moment a user interacts with it. How should the runtime decide whether a given entry is compatible with a given domain, so that an incompatible binding is rejected deterministically at admission rather than failing later?

## Decision Drivers

* Two-way compatibility — both the entry's requirements of the domain and the domain's requirements of the entry must be satisfied before the binding is admitted.
* Deterministic, explainable admission — the decision must be a small set of precise rules whose failures name exactly which capability or property is missing (anchors `cpt-frontx-fr-mfe-type-validation`).
* Fail-at-admission — an incompatible binding must be rejected when the entry is matched against the domain, not when a user later triggers an action it cannot service.
* Compositional substitutability — any entry that satisfies a domain's requirements may occupy that domain, so independently developed entries are interchangeable against a fixed domain contract.
* Scoped infrastructure exemption — lifecycle actions the runtime itself wires onto a domain must not be conflated with an entry's own declared cross-domain requirements.
* Substrate neutrality — matching must operate over opaque identifiers and carry no solution-specific vocabulary (anchors `cpt-frontx-constraint-mfes-no-solution-shared-properties`).

## Considered Options

* **Subset-rule contract matching with a scoped infrastructure exemption** — admission is decided by a small set of subset (containment) rules over the entry's and domain's declared capabilities and properties; lifecycle actions the runtime wires onto domains are explicitly exempted from the entry-requires-domain rule, since they are infrastructure rather than an entry's own cross-domain requirements.
* **Free binding (no compatibility check)** — any entry may be bound into any domain; incompatibilities are discovered when an action cannot be serviced at runtime.
* **Exact-equality matching** — an entry is admitted only if its declared capability and property sets are exactly equal to the domain's, with no subset relationship and no exemption.

## Decision Outcome

Chosen option: **subset-rule contract matching with a scoped infrastructure exemption**, because it is the only option that decides two-way compatibility deterministically at admission while still allowing independently developed entries to be substitutable against a fixed domain contract. Admission requires that three containment relationships hold: the properties an entry requires are provided by the domain; the capabilities the domain requires of its occupants are supported by the entry; and the cross-domain capabilities the entry requires are supported by the domain. The third rule explicitly exempts the lifecycle actions the runtime itself wires onto a domain — these are infrastructure the runtime supplies, not part of an entry's own declared cross-domain requirements, so they are excluded from that subset comparison. Each rule is a containment check over opaque identifiers, so a failure names exactly which property or capability is missing, and any entry that satisfies a domain's requirements may occupy it regardless of who authored the entry.

### Consequences

* Good, because an incompatible binding is rejected deterministically at admission, with an error that names the exact missing property or capability.
* Good, because subset (rather than exact-equality) matching lets an entry expose more than a domain requires and a domain provide more than an entry needs, so independently developed entries remain substitutable.
* Good, because the rules operate over opaque identifiers and carry no solution-specific vocabulary, keeping the matching substrate neutral.
* Good, because the infrastructure-lifecycle-action exemption keeps runtime-wired actions from being mistaken for an entry's own cross-domain requirements, so the entry-requires-domain rule stays meaningful.
* Bad, because the exemption is a deliberate carve-out that must be documented and kept narrow, or it risks masking a genuine missing-capability mismatch.
* Bad, because correct admission depends on entries and domains declaring their capabilities and properties accurately; an under-declared entry can still fail at action time despite passing matching.

### Confirmation

Architecture review confirms that admission applies exactly the three containment rules and that the infrastructure-lifecycle-action exemption is scoped to the runtime-wired lifecycle actions on the entry-requires-domain rule only. An automated check exercises matching: an entry whose required properties are a subset of the domain's, whose supported capabilities cover the domain's requirements, and whose non-infrastructure cross-domain requirements are covered by the domain is admitted; an entry that fails any rule is rejected with an error identifying the specific property or capability; and a runtime-wired lifecycle action appearing on the entry side does not by itself cause rejection. The grounding mechanism is `validateContract` and the `INFRASTRUCTURE_LIFECYCLE_ACTIONS` exemption in `packages/screensets/src/mfe/validation/contract.ts`.

## Pros and Cons of the Options

### Subset-rule contract matching with a scoped infrastructure exemption

Admission is decided by three containment rules over declared capabilities and properties, with runtime-wired lifecycle actions exempted from the entry-requires-domain rule.

* Good, because compatibility is decided deterministically at admission with precise, attributable failures.
* Good, because subset matching preserves substitutability of independently developed entries.
* Good, because the exemption cleanly separates runtime-supplied infrastructure from an entry's own cross-domain requirements.
* Neutral, because it requires entries and domains to declare their capability and property sets explicitly.
* Bad, because the exemption is a carve-out that must be kept narrow and documented.

### Free binding (no compatibility check)

Any entry may bind to any domain; mismatches surface only at runtime.

* Good, because it imposes no declaration discipline and admits everything immediately.
* Bad, because a structural mismatch is discovered when a user interacts with the binding, not at admission.
* Bad, because there is no deterministic, explainable guarantee that an admitted entry can service the domain's actions.

### Exact-equality matching

An entry is admitted only when its capability and property sets exactly equal the domain's, with no subset relationship and no exemption.

* Good, because the relationship is the simplest possible to state and check.
* Bad, because it forbids an entry from supporting more than a domain requires or a domain from providing more than an entry needs, destroying substitutability.
* Bad, because without an exemption, runtime-wired infrastructure actions would have to appear identically on both sides, coupling entries to runtime wiring details.

## More Information

The present concrete instantiation is `validateContract` in `packages/screensets/src/mfe/validation/contract.ts`, which applies three rules — an entry's required properties must be contained in the domain's shared properties; the domain's required extension capabilities must be contained in the entry's supported capabilities; and the entry's required domain capabilities, excluding the runtime-wired lifecycle actions held in `INFRASTRUCTURE_LIFECYCLE_ACTIONS`, must be contained in the domain's capabilities — returning a result that names each unsatisfied rule. The specific field names and the present membership of the exemption set are descriptive of the current instantiation and non-binding; the durable decision is subset-rule matching with a scoped infrastructure-lifecycle exemption.

**Scope of impact.** Applies to how the runtime decides whether a given extension entry may be bound into a given domain. It does not decide how a domain selects its occupancy behavior or how its declared actions are cardinality-validated (decided in `cpt-frontx-adr-mount-strategies-cardinality`), nor how type identifiers themselves are validated by the type-system provider — matching consumes already-resolved identifiers opaquely.

**Review trigger.** Revisit if a new compatibility dimension beyond properties and the two capability directions is needed, or if the infrastructure-lifecycle-action exemption needs to cover categories beyond the runtime-wired lifecycle actions.

**Checklist applicability.**

* ARCH — applicable and addressed above (a runtime admission decision affecting every extension–domain binding, and hard to reverse once entries and domains declare against these rules).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new, standalone decision that replaces no prior record.
* SEC — Not applicable because contract matching validates structural capability and property compatibility, not admission trust or code isolation; arbitrary-code admission and isolation are decided in `cpt-frontx-adr-blob-url-mfe-isolation`.
* PERF — Not applicable because this is a compatibility-decision rule, not a runtime-performance decision.
* REL — Not applicable because it governs admission compatibility, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — Not applicable because it shapes internal admission compatibility, not an external integration contract.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-type-validation` — contract matching is how the runtime validates that an extension is compatible with the domain it is registered into, surfacing mismatches at integration time.
* `cpt-frontx-fr-mfe-multi-occupant-domain` — matching admits each compatible entry into a domain, complementing the occupancy rules that govern how many entries a domain may hold.
* `cpt-frontx-component-mfe-runtime` — this decision shapes the extension-admission behavior of the MFE Runtime component.
* `cpt-frontx-constraint-mfes-no-solution-shared-properties` — matching compares opaque shared-property identifiers supplied by the application, holding no solution-specific property vocabulary of its own.
* `cpt-frontx-principle-agnostic-core` — the matching rules operate over opaque identifiers and carry no type-format or domain knowledge.
