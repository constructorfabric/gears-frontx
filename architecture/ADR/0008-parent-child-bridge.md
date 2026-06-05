---
status: proposed
date: 2026-06-05
---

# Give Child Microfrontends a Narrow Capability Bridge that Delegates to the Registry


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Narrow capability bridge delegating to the registry](#narrow-capability-bridge-delegating-to-the-registry)
  - [Direct registry reference](#direct-registry-reference)
  - [Message-passing protocol only](#message-passing-protocol-only)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-parent-child-bridge`
## Context and Problem Statement

A child microfrontend runs isolated from the host yet must still interact with it: execute actions chains, read and subscribe to shared properties, and register handlers for actions targeted at itself. Handing the child a reference to the host runtime would couple child code to runtime internals and widen the surface a child can reach. What should the host give a child so the child gains exactly the capabilities it needs to participate — and nothing more — while the host retains a matching handle to manage and dispose the child instance?

## Decision Drivers

* Minimal capability surface — a child receives only the operations it needs to participate; the runtime's internals stay encapsulated behind that surface.
* Stable child-facing contract — the capabilities a child depends on must not change when runtime internals change (anchors `cpt-frontx-interface-mfe-runtime`).
* Delegation, not duplication — bridge operations route to the single runtime authority (the registry and its mediator) rather than re-implementing coordination inside the bridge.
* Symmetric parent handle — the host needs a matching narrow handle to identify a child instance and tear it down deterministically.
* Enforceable boundary — the rule that child code depends only on the capability surface, never on concrete runtime internals, must be expressible as a continuous-integration check.

## Considered Options

* **Narrow capability bridge delegating to the registry** — the child receives an abstract bridge exposing exactly the capability methods it needs (`executeActionsChain`, `subscribeToProperty`, `getProperty`, `registerActionHandler`), each delegating to the registry and its mediator; the host holds a matching narrow parent handle (instance identity plus disposal).
* **Direct registry reference** — the host hands the child a reference to the runtime registry object itself.
* **Message-passing protocol only** — child and host communicate solely through serialized messages over a transport, with no typed capability object given to the child.

## Decision Outcome

Chosen option: **narrow capability bridge delegating to the registry**, because it is the only option that gives a child exactly the participation capabilities it needs while keeping runtime internals encapsulated and the child-facing contract stable. The abstract child bridge exposes only `executeActionsChain`, `subscribeToProperty`, `getProperty`, and `registerActionHandler`; each method delegates to the registry and its mediator rather than carrying coordination logic of its own. The host holds a matching abstract parent handle exposing only the child's instance identity and `dispose()`, giving the host deterministic control over the child's lifecycle. The bridge thereby exposes only a narrow capability surface, and the concrete implementation's transport and wiring internals remain encapsulated behind the abstract contract.

### Consequences

* Good, because a child depends only on a small, stable capability surface, so runtime internals can change without breaking child code.
* Good, because the bridge exposes only a narrow capability surface; the concrete implementation's transport and wiring internals remain encapsulated.
* Good, because each capability delegates to the single runtime authority, so behavior stays consistent with host-side dispatch and no coordination logic is duplicated in the bridge.
* Good, because the symmetric parent handle gives the host deterministic identity and disposal control over each child instance.
* Bad, because every capability a child may legitimately need must be deliberately added to the abstract surface, so extending child capability is an explicit contract change rather than incidental access.
* Bad, because the delegation indirection means a child cannot reach a runtime capability that the bridge does not expose, even when convenient.

### Confirmation

Architecture review confirms that the abstract child bridge exposes exactly the four capability methods and that the abstract parent handle exposes only instance identity and `dispose()`. A continuous-integration check (an import-boundary grep) confirms that child-facing code depends only on the abstract bridge — never on a concrete bridge implementation or on the registry directly — and that each capability method delegates to the registry or its mediator rather than implementing coordination inline.

## Pros and Cons of the Options

### Narrow capability bridge delegating to the registry

The child holds an abstract bridge of exactly the capabilities it needs; each delegates to the registry and mediator. The host holds a matching narrow parent handle.

* Good, because the child-facing surface is minimal and stable while runtime internals stay encapsulated.
* Good, because delegation keeps child-initiated behavior consistent with host-side dispatch.
* Good, because the parent handle gives deterministic lifecycle control.
* Neutral, because it requires an abstract contract on both the child and parent sides plus wiring that injects the delegation callbacks.
* Bad, because extending what a child can do is an explicit contract change.

### Direct registry reference

The host gives the child the registry object directly.

* Good, because the child can reach any runtime capability without a mediating contract.
* Bad, because the child couples to runtime internals, so internal changes ripple into child code and the reachable surface is unbounded.
* Bad, because there is no narrow, enforceable boundary between participation capability and runtime internals.

### Message-passing protocol only

Child and host exchange serialized messages over a transport, with no typed capability object.

* Good, because it imposes a hard process-style boundary and avoids sharing any object across the divide.
* Bad, because every capability must be re-expressed as ad hoc message conventions, losing the typed, discoverable contract a capability object provides.
* Bad, because request/response capabilities like reading a property synchronously become awkward round-trips, complicating ordinary child participation.

## More Information

The present concrete instantiation is the abstract `ChildMfeBridge` (`packages/screensets/src/mfe/handler/types.ts`), which exposes `executeActionsChain`, `subscribeToProperty`, `getProperty`, and `registerActionHandler`; its concrete implementation `ChildMfeBridgeImpl` (`packages/screensets/src/mfe/bridge/ChildMfeBridge.ts`) delegates `executeActionsChain` to an injected registry callback and `registerActionHandler` to a mediator-registration callback, while its transport and wiring methods are not part of the abstract surface. The matching abstract `ParentMfeBridge` (`packages/screensets/src/mfe/handler/types.ts`) exposes only `instanceId` and `dispose()`. Forwarding of actions to a child's own domains is carried by the mediator's catch-all tier through `ChildDomainForwardingHandler` (`packages/screensets/src/mfe/bridge/ChildDomainForwardingHandler.ts`), and the routing that tier participates in is decided in `cpt-frontx-adr-actions-chains-mediator`.

**Scope of impact.** Applies to the capability surface a child microfrontend receives and the parent handle the host retains. It does not decide how a bundle is loaded or isolated, nor how the mediator routes actions internally (decided in `cpt-frontx-adr-actions-chains-mediator`).

**Review trigger.** Revisit if a child requires a participation capability that cannot be expressed as a delegating method on the bridge, or if the host needs richer lifecycle control than instance identity and disposal.

**Checklist applicability.**

* ARCH — applicable and addressed above (a boundary decision affecting every child microfrontend and the host, and hard to reverse once children depend on the capability surface).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new, standalone decision that supersedes no prior record.
* INT — applicable: the bridge is the child-facing half of the host↔MFE communication contract; its breaking-change policy is governed by `cpt-frontx-interface-mfe-runtime`.
* PERF — Not applicable because this is a surface-shape decision, not a runtime-performance decision.
* SEC — Not applicable because, while the narrow surface constrains what a child can reach, this decision introduces no secret, credential, or authorization mechanism of its own.
* REL — Not applicable because it governs the capability surface, not runtime availability or fault tolerance.
* DATA — Not applicable because no persistent data store or schema is involved.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-host-communication` — the capability bridge is how a child microfrontend communicates with the host and reacts to host state, through a narrow delegating surface.
* `cpt-frontx-interface-mfe-runtime` — the child bridge and parent handle are part of the runtime's public surface and are governed by its breaking-change policy.
* `cpt-frontx-component-mfe-runtime` — this decision shapes the parent–child communication boundary of the MFE Runtime component.
* `cpt-frontx-principle-agnostic-core` — the bridge carries only opaque type and property identifiers, holding no type-format knowledge of its own.
