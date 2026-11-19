---
status: accepted
date: 2026-10-01
decision-makers: German Bartenev
description: Architecture decision that Occupant is a structural parameter contract the FrontX router builds and passes to Route Ownership Signal, keeping the routing package free of ecosystem imports.
---

# Occupant Reference Boundary

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Occupant as a structural parameter contract, adapted by the router](#occupant-as-a-structural-parameter-contract-adapted-by-the-router)
  - [Direct import of the concrete extension type](#direct-import-of-the-concrete-extension-type)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-routing-adr-occupant-reference-boundary`

## Context and Problem Statement

Route Ownership Signal resolves, for each domain, every URL entry whose own domain key matches that domain's own key — matching that entry's own extension token against that domain's registered extensions — and reports the route owner each such entry names, or that none does, to the FrontX router observing that domain, which lives in this package and conforms to the runtime's abstract router (`cpt-frontx-adr-extension-routing-port`). That route owner is, in this ecosystem, ultimately an `mfes` runtime `Extension` — the concrete registration type carrying `id`, `domain`, `entry`, and an optional declared `route` — which the runtime registers with the FrontX router by its id, its domain's id and its route. How should the routing core name and carry that identity through resolution and reporting without itself depending on the concrete extension type the `mfes` runtime defines?

## Decision Drivers

* Standalone package boundary — `@gears-frontx/routing` imports no other ecosystem package (`cpt-frontx-routing-nfr-standalone`), enforced mechanically by the `arch:edges`/`arch:deps` boundary guards, not merely by convention; its FrontX router reaches the runtime only through the abstract dependencies this package declares itself, which the runtime hands it (`cpt-frontx-adr-extension-routing-port`).
* Agnostic core — the navigation substrate and the route ownership signal built on it carry no dependency on a concrete router engine or UI framework, and by the same reasoning carry no dependency on a concrete extension-registration format either (`cpt-frontx-routing-nfr-agnostic-core`).
* Structural contract, not a behavioral port — Occupant, as this ADR specifies it, is a plain data pair (a stable identity plus an opaque parameter bag) that the FrontX router builds from what the runtime registers with it and passes as an argument at each resolution call, never injected and never implemented by anything, so there is nothing for an implementer to satisfy. This is a deliberate contrast with how this package treats its router-engine dependency: `NavigationHistory` (`location`, `subscribe`, `push`, `replace`, `go`) is a behavioral port — a contract of methods a separately published engine-provider package, the ecosystem's own default engine provider among them, implements, never a concrete engine import inside the core (`cpt-frontx-adr-core-package-boundaries`). The two shapes both keep a concrete dependency out of the routing core, but by different means — one by injection, satisfied by an implementer; the other by argument-passing, satisfied by a caller — and the contrast is what motivates treating Occupant as its own kind of boundary rather than assuming it must take the same shape `NavigationHistory` does.

## Considered Options

* **Occupant as a structural parameter contract, adapted by the router** — the routing core resolves against `Occupant`: a structural type carrying a stable identity plus an opaque parameter bag, with no knowledge of `mfes`'s `Extension` shape, passed as a plain argument at each resolution call rather than injected; the FrontX router maps the ids and routes the runtime registers with it into that structural shape.
* **Direct import of the concrete extension type** — the routing core imports `@gears-frontx/mfes` and resolves directly against `Extension`/`ScreenExtension`, skipping an adapter layer.

## Decision Outcome

Chosen option: **Occupant as a structural parameter contract, adapted by the router**, because it is the only option consistent with this package's own CI-enforced boundary properties, and because Occupant is data the FrontX router builds, so nothing outside the package has anything to implement. `cpt-frontx-routing-nfr-standalone` requires zero intra-ecosystem edges in this package's manifest and import graph, checked mechanically by the boundary guards; importing `@gears-frontx/mfes` directly would add exactly the edge that requirement forbids.

`cpt-frontx-routing-nfr-agnostic-core` requires the package to carry no dependency on a concrete router engine or UI framework "whatsoever" — the same rationale extends to a concrete extension-registration format, since binding route resolution to one runtime's own registration shape would reintroduce, for extension identity, precisely the coupling the engine-provider port exists to avoid for router engines. This is where the comparison to `NavigationHistory` is useful only as a contrast, not as precedent: `NavigationHistory` is "deliberately narrower than what any concrete engine's own history contract typically requires," carried as a behavioral port the substrate declares and a separately published provider *implements* (`cpt-frontx-routing-design-routing`, Navigation Substrate) — a real dependency inversion, satisfied by an implementer this package never calls directly.

Occupant cannot take that shape, because nothing implements it: it is a structural type — a stable identity plus an opaque parameter bag — that the FrontX router *constructs* and hands to the routing core as a plain argument at each resolution call. The two keep the routing core free of a concrete dependency by different mechanisms — one by injection, the other by argument-passing — and calling Occupant a "port" by analogy to `NavigationHistory` would misstate which mechanism is actually at work.

Everything else about what that identity names — the extension's declaration and the entry it mounts — stays with the runtime: the FrontX router knows only the ids, the routes and the one boolean the runtime tells it — whether a domain declares `unmount_ext` — and the domain each extension belongs to, and `cpt-frontx-routing-principle-publishes-not-orchestrates` keeps any occupancy model out of this package.

### Consequences

* Good, because the package keeps its zero-intra-ecosystem-edge property, verifiable by the same `arch:edges`/`arch:deps` guards that check it.
* Good, because the routing core stays free of the concrete `Extension` type, and nothing in the core presupposes the runtime exists.
* Good, because any runtime that registers ids and routes with the FrontX router and supplies the FrontX router's abstract dependencies, under any conforming type system, needs no change to the routing core.
* Bad, because the FrontX router carries one more layer than a direct import would: the mapping of the registered ids and routes into `Occupant` pairs.
* Bad, because a mismatch between an `Occupant`'s opaque parameter bag and what a concrete `Extension` actually carries is caught only where the FrontX router builds one from what the runtime registers, not by a compiler-checked import of the concrete type inside the routing core itself.
* Good, because lexical well-formedness of an occupant identity is enforced at this package's own API boundary, not merely documented: observer creation and the URL back-projection helper both reject a malformed token synchronously, so a caller of either entry point cannot construct an invalid entry through this package's own code.
* Bad, because every invariant the address depends on beyond lexical well-formedness — identity uniqueness within a domain, stability across reload — rests on the FrontX router's registration-time checks and on the registration contract rather than on the Occupant type; a plain data pair carries no compiler-checked guarantee that the identity it holds is unique or equal to the value it held on a previous mount.
* Bad, because that mapping is not a nameless abstraction for this ecosystem: it is the FrontX router's, which is exactly why this package's own `cpt-frontx-routing-adr-occupant-identity-stability` fixes which concrete extension field the runtime hands the FrontX router as the route the identity is derived from — that obligation is decided and enforced there, not restated here — while which extension types are routable at all is the runtime's own registration contract, recorded as an assumption in this package's PRD, not a decision this ADR restates either.
* Bad, because the resolution primitive's own enforcement stops at lexical well-formedness, checked only at observer creation and at the back-projection helper: cross-mount identity uniqueness is the FrontX router's registration-time conflict check (the routing PRD, Assumptions), and the resolution primitive cannot check either invariant at rest, since it holds no registry of occupants to check them against.

### Confirmation

Confirmed the same way this package's standalone and agnostic-core properties are confirmed: the boundary guards (`arch:edges`, `arch:deps`) report zero intra-ecosystem edges in this package's manifest and import graph, and a design/code review of the Occupant contract's own shape confirms it carries no field, literal, or import that names `@gears-frontx/mfes` or any other concrete extension-registration format, and confirms it is passed as a plain argument rather than declared as an injectable port with an implementer.

## Pros and Cons of the Options

### Occupant as a structural parameter contract, adapted by the router

The routing core declares `Occupant` as a stable identity plus an opaque parameter bag, a structural type rather than an injected port; the FrontX router maps the ids and routes the runtime registers with it into that shape and hands it to the routing core as a plain argument — construction and argument-passing rather than implementation and injection, the mechanism that distinguishes it from the Engine Provider's role for `NavigationHistory`.

* Good, because it preserves the zero-intra-ecosystem-edge property the package claims and that CI enforces.
* Good, because Occupant is data the FrontX router builds itself, so no party outside the package has to implement anything for resolution to run.
* Neutral, because it requires the FrontX router to carry that mapping.
* Bad, because a resolution bug at the Occupant seam surfaces one layer away from where the concrete extension is declared, in the FrontX router's mapping rather than in the resolution primitive.

### Direct import of the concrete extension type

The routing core imports `@gears-frontx/mfes` and resolves against `Extension`/`ScreenExtension` directly, with no intermediate abstraction.

* Good, because there is one fewer layer between a declared route owner and the code that resolves it, and no separate mapping to keep in sync.
* Bad, because it adds an intra-ecosystem edge this package's own NFR (`cpt-frontx-routing-nfr-standalone`) forbids, breaking a property the boundary guards check.
* Bad, because it ties route resolution to one runtime's own extension-registration format, contradicting the agnostic-core property (`cpt-frontx-routing-nfr-agnostic-core`) and the precedent set for the router engine.

## More Information

Diagram note: this decision is a single binary comparison — the chosen Occupant structural-contract abstraction against the one rejected alternative of a direct concrete import — matching the shape this repository's own root ADRs already use for a decision of this kind (`cpt-frontx-adr-core-package-boundaries`, `cpt-frontx-adr-extension-domain-occupancy`), both recorded in prose and comparison tables with no diagram. No diagram is included here for the same reason.

**Scope of impact.** Governs only how the routing core (`@gears-frontx/routing`) names and carries route-owner identity through resolution and reporting. It does not decide how the FrontX router maps the ids and routes the runtime registers with it into the Occupant contract — that mapping is the FrontX router's own internal concern — nor does it revisit the engine-provider port this ADR draws its contrast from (`cpt-frontx-routing-fr-engine-provider-port`). It also does not decide, and defers entirely, which concrete extension field the runtime hands the FrontX router as the route the identity is derived from — this package's own `cpt-frontx-routing-adr-occupant-identity-stability` decides that — nor which extension types carry a route at all, which the runtime's own registration contract decides and this package's PRD records only as an assumption. That an occupant's own identity is uninterpreted but well-formed, its alphabet being the grammar's `name` production, is decided in `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity`; the production and the synchronous validation this package runs at observer creation and at the URL back-projection helper are stated by `cpt-frontx-feature-routing-navigation-substrate`, not restated here.

**Review trigger.** Revisit if a requirement emerges for the routing core itself to interpret a field of the concrete extension registration (rather than treating the whole parameter bag as opaque), which would undercut the rationale for keeping Occupant's shape structural rather than interpreted.

**Occupant is assembled from two inputs, not handed over pre-built.** "Passed as a plain argument at each resolution call" describes the mechanism — argument-passing rather than injection — not the timing or the source of every field Occupant carries. In the route-ownership-signal FEATURE's own resolution primitive, a domain's own registered-extensions source supplies only the identity half of Occupant — the extension token each Route Owner declares, with no payload attached to it — at observer creation; the payload half is never carried by that source at all. It always arrives separately, from the URL entry the resolution primitive matches against, at resolution time (the route-ownership-signal FEATURE's registered-extensions source and transition shapes; `cpt-frontx-algo-routing-route-ownership-signal-entry-resolution`). An Occupant the resolution primitive names — identity plus payload together — is therefore assembled from two different inputs arriving through two different channels, not handed to the routing core as one pre-built pair at one call site.

**Checklist applicability.**

* ARCH — applicable and addressed above (an architecturally significant, hard-to-reverse boundary decision affecting how the FrontX router bridges extension registrations into route ownership).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new decision that supersedes no prior record.
* SEC — Not applicable because this decision introduces no secret, credential, or authorization concern; it only shapes what identity shape crosses a package boundary.
* PERF — Not applicable because a structural identity-plus-parameter-bag contract carries no different runtime cost than a concrete-type import at the volumes this package operates at.
* REL — Not applicable because it governs a compile-time/import-graph boundary, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — applicable: the Occupant contract sits between the routing core's resolution primitive and the FrontX router that bridges a concrete runtime's registrations into it, and its shape is owned by this package; the FrontX router's own integration contract with the runtime is recorded in `cpt-frontx-adr-extension-routing-port`.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.
* MAINT — applicable: the structural contract keeps the routing core's own blast radius bounded to this package when the concrete extension-registration format changes, at the cost of the extra mapping the FrontX router carries, noted above, and at the cost that the Occupant type cannot itself carry the invariants the FrontX router's registration checks uphold (see Consequences).
* TEST — applicable and addressed under Confirmation: the boundary guards and a design/code review of the Occupant contract's shape.
* COMPL — Not applicable because no regulated or personal data is involved.
* UX — Not applicable because the Occupant contract is internal to the routing package and changes nothing a user sees.
* BIZ — Not applicable because this is an internal architecture decision; product requirements are cited by ID below.

## Traceability

- **PRD**: [../PRD.md](../PRD.md)
- **DESIGN**: [../DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-routing-nfr-standalone` — the Occupant structural contract is what lets route resolution avoid the intra-ecosystem edge this NFR forbids.
* `cpt-frontx-routing-nfr-agnostic-core` — extends this package's engine-agnosticism to extension-registration-format agnosticism.
* `cpt-frontx-routing-fr-route-ownership-signal` — the signal reports Occupant identity, not concrete `Extension` identity, at every domain.
* `cpt-frontx-routing-fr-engine-provider-port` — cited only as a deliberate contrast, not as precedent: a behavioral port satisfied by an implementer, distinct from the structural, argument-passed contract this decision adopts for Occupant.
* `cpt-frontx-component-routing-navigation-substrate` — the component whose resolution primitive this decision keeps free of any concrete extension-registration import.
* `cpt-frontx-routing-adr-occupant-identity-stability` — this package's own decision that fixes which concrete extension field the runtime hands the FrontX router as the route Occupant identity is derived from; this ADR names that record as where that obligation is decided and enforced, not restated. Which extension types carry a route at all is, in turn, the runtime's own registration contract's decision — recorded as an assumption in this package's PRD, not by an ADR this package holds.
* `cpt-frontx-routing-adr-domain-occupancy-addressing-granularity` — the record that decides, under its Occupant Identity Lexical Rule, that an occupant's identity is uninterpreted but well-formed, its alphabet being the grammar's `name` production, which `cpt-frontx-feature-routing-navigation-substrate` states.
* `cpt-frontx-adr-extension-routing-port` — places the FrontX router in this package and records that the runtime registers routed extensions with it by ids and routes, which the FrontX router maps into the Occupant contract and supplies as plain arguments.
