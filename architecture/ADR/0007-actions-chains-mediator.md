---
status: accepted
date: 2026-06-05
---

# Route Host–MFE Actions Through a Mediator Keyed by Target and Action Type with Recursive Chain Execution


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Mediator keyed by (target, action type) with a catch-all forwarding tier and recursive chain execution](#mediator-keyed-by-target-action-type-with-a-catch-all-forwarding-tier-and-recursive-chain-execution)
  - [Publish/subscribe event bus](#publishsubscribe-event-bus)
  - [Point-to-point handler references](#point-to-point-handler-references)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-actions-chains-mediator`
## Context and Problem Statement

Microfrontends and the host application coordinate by dispatching actions to targets — extension domains and the extensions mounted in them — where sender and receiver are independently developed and hold no direct reference to one another. A single dispatched action frequently triggers a sequence with conditional follow-ups (continue on success, divert on failure) and must complete within a bounded time, while targets may be registered and torn down at any moment. What dispatch mechanism routes an action to the right handler, supports compositional sequencing with branching and timeouts, and permits actions to reach a child runtime's own domains — all without coupling senders to receivers?

## Decision Drivers

* Decoupled coordination — senders address a target by identifier, never by holding a reference to it (anchors `cpt-frontx-fr-mfe-host-communication`).
* Deterministic routing — a `(targetId, actionTypeId)` pair resolves to at most one handler, with a defined fallback tier when no specific handler exists.
* Cross-runtime forwarding — actions targeting a child runtime's domains must be forwardable even though the parent does not know the child's action vocabulary at registration time.
* Compositional control flow — a dispatched unit may declare success and failure continuations that compose into chains.
* Bounded execution and safe teardown — per-action and whole-chain time bounds, and tracking of in-flight actions so a target's handlers are not removed while it is still executing.
* Type-agnostic dispatch — action admission must run through the injected type-system provider, not embedded format knowledge (anchors `cpt-frontx-principle-agnostic-core`).

## Considered Options

* **Mediator keyed by (target, action type) with a catch-all forwarding tier and recursive chain execution** — a central mediator holds a `targetId → (actionTypeId → handler)` registry, falls back to a per-target catch-all handler when no specific pair matches, and executes chains recursively with success/fallback branching, time bounds, and pending-action tracking.
* **Publish/subscribe event bus** — senders publish named events and any number of subscribers react; there is no single addressed handler per action.
* **Point-to-point handler references** — a sender obtains and holds a reference to its target and invokes it directly.

## Decision Outcome

Chosen option: **mediator keyed by (target, action type) with a catch-all forwarding tier and recursive chain execution**, because it is the only option that delivers addressed, decoupled, single-handler routing while also supporting compositional chains, time bounds, and cross-runtime forwarding. The mediator resolves a handler by looking up the `(targetId, actionTypeId)` pair first and falling back to a per-target catch-all handler; the catch-all tier is what lets actions be forwarded to a child runtime's domains without the parent enumerating the child's action types in advance. Chains execute recursively: on success the mediator follows the `next` branch, on failure it follows the `fallback` branch, and both whole-chain and per-action time bounds apply. The mediator tracks in-flight actions per target so a target's handlers cannot be unregistered while actions are still pending.

### Consequences

* Good, because senders and receivers are fully decoupled — every interaction is addressed by identifier and resolved centrally.
* Good, because routing is deterministic: a `(target, action type)` pair maps to one handler, with an explicit catch-all fallback rather than ambiguous multi-delivery.
* Good, because the catch-all tier provides a clean seam for cross-runtime forwarding to child domains whose action vocabulary is unknown to the parent.
* Good, because success/fallback chain branching expresses coordinated multi-step behavior without bespoke orchestration in each unit.
* Good, because per-action and per-chain time bounds plus pending-action tracking prevent unbounded execution and unsafe teardown.
* Bad, because a central mediator is a single coordination point that every interaction passes through, concentrating responsibility.
* Bad, because deep recursive chains with branching are harder to trace than a single flat call, requiring path accumulation to remain debuggable.

### Confirmation

Architecture review and continuous-integration checks confirm that all host–MFE dispatch flows through the mediator's `(target, actionType)` resolution with the per-target catch-all as the sole fallback tier; that chain execution follows `next` on success and `fallback` on failure under enforced time bounds; that action admission is delegated to the injected type system rather than embedded format checks; and that unregistering a target's handlers is rejected while actions for that target remain pending.

## Pros and Cons of the Options

### Mediator keyed by (target, action type) with a catch-all forwarding tier and recursive chain execution

A central registry maps targets and action types to handlers, with a catch-all fallback and recursive, branching chain execution under time bounds.

* Good, because it gives addressed, decoupled, single-handler routing.
* Good, because the catch-all tier cleanly supports cross-runtime forwarding.
* Good, because chains with success/fallback branching and time bounds are first-class.
* Neutral, because it requires explicit handler registration and unregistration lifecycle management.
* Bad, because the mediator is a central point all interactions traverse.

### Publish/subscribe event bus

Senders publish events; subscribers react independently.

* Good, because publishers and subscribers are loosely coupled and many subscribers can react to one event.
* Bad, because there is no single addressed handler per action, so request/response semantics, deterministic routing, and per-target teardown guarantees are awkward to express.
* Bad, because compositional success/fallback chaining is not naturally supported by fire-and-forget broadcast.

### Point-to-point handler references

A sender holds a direct reference to its target and invokes it.

* Good, because invocation is direct and simple to follow.
* Bad, because it recouples independently-developed units, defeating the decoupling that composing third-party microfrontends requires.
* Bad, because lifecycle and isolation become the sender's problem, and cross-runtime targets cannot be reached without exposing references across the boundary.

## More Information

The present concrete instantiation is `DefaultActionsChainsMediator` (`packages/screensets/src/mfe/mediator/actions-chains-mediator.ts`): a `actionHandlers` map of `targetId → (actionTypeId → handler)`, a `catchAllHandlers` map consulted as the fallback tier in `resolveHandler`, recursive `executeChainRecursive` that follows `chain.next` on success and `chain.fallback` on failure, `executeWithTimeout` applied to both whole-chain and per-action bounds, and a `pendingActions` map that blocks `unregisterAllHandlers` for a target while actions are still in flight. Action admission is delegated to the injected type system (`typeSystem.register(action)`) so the mediator embeds no type-format knowledge. The catch-all tier is the seam used by the parent–child bridge for forwarding to a child runtime's domains, decided in `cpt-frontx-adr-parent-child-bridge`.

**Scope of impact.** Applies to how actions are routed and how chains execute between the host and microfrontends, including forwarding to child runtimes. It does not decide the shape of the runtime's public surface (decided in `cpt-frontx-adr-mfe-registry-facade`) or how the type system validates an action's payload (decided in `cpt-frontx-adr-type-system-plugin-opaque-schema`).

**Review trigger.** Revisit if a requirement emerges for an action to be delivered to multiple handlers concurrently, or for chain control flow richer than success/fallback branching (for example parallel fan-out or compensation across targets).

**Checklist applicability.**

* ARCH — applicable and addressed above (a coordination-pattern decision affecting every host–MFE interaction and difficult to reverse once units depend on the dispatch contract).
* ARCH-ADR-008 (supersession) — Not applicable because this is a new, standalone decision that supersedes no prior record.
* INT — applicable: the mediator defines the host↔MFE communication contract, including cross-runtime forwarding; its breaking-change policy is governed by `cpt-frontx-interface-mfe-runtime`.
* PERF — Not applicable because the time bounds here are correctness and teardown-safety guarantees, not a throughput or latency target.
* SEC — Not applicable because this decision introduces no secret, credential, or authorization concern.
* REL — Not applicable because availability and fault-tolerance posture are outside this routing decision, though it does bound execution time.
* DATA — Not applicable because no persistent data store or schema is involved.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-host-communication` — the mediator is how microfrontends communicate with the host and react to host state, through decoupled addressed dispatch.
* `cpt-frontx-interface-mfe-runtime` — action dispatch is part of the runtime's public surface and is governed by its breaking-change policy.
* `cpt-frontx-component-mfe-runtime` — this decision shapes the communication-mediation mechanism of the MFE Runtime component.
* `cpt-frontx-principle-agnostic-core` — delegating action admission to the injected type system keeps dispatch free of type-format literals.
