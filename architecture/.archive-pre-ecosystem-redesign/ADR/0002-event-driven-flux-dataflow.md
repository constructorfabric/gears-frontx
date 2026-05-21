---
status: accepted
date: 2025-11-16
---

# Event-Driven Flux Data Flow


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Fixed Action → Event → Effect → Reducer → Store sequence with typed EventBus](#fixed-action--event--effect--reducer--store-sequence-with-typed-eventbus)
  - [Direct Redux dispatch from components](#direct-redux-dispatch-from-components)
  - [Effects calling APIs directly without event mediation](#effects-calling-apis-directly-without-event-mediation)
  - [Redux Toolkit thunks](#redux-toolkit-thunks)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-event-driven-flux-dataflow`
## Context and Problem Statement

FrontX needed a consistent data flow pattern across all domains. Without enforcement, developers mix direct dispatch, imperative logic in components, and async middleware — creating untraceable state mutations that are difficult to debug and impossible to observe from outside a domain. SSE streaming integration highlighted this gap: actions need to orchestrate API streaming while effects remain responsible solely for state updates in response to events.

## Decision Drivers

* Every state change must be traceable from cause to effect without inspecting component internals
* MFEs must participate in host events without tight module-level coupling
* SSE streaming must integrate naturally without bespoke middleware

## Considered Options

* Fixed Action → Event → Effect → Reducer → Store sequence with typed EventBus
* Direct Redux dispatch from components
* Effects calling APIs directly without event mediation
* Redux Toolkit thunks as async middleware

## Decision Outcome

Chosen option: "Fixed Action → Event → Effect → Reducer → Store sequence with typed EventBus", because it makes every state change fully traceable and debuggable, allows MFEs to communicate across domain boundaries without tight integration, and maps SSE streaming naturally onto the event model.

### Consequences

* Good, because the full causal chain of every state mutation is observable and replayable via EventBus event logs
* Bad, because simple state updates require more ceremony than direct dispatch, and new developers must learn the Action → Event → Effect pattern before contributing

### Confirmation

`packages/state/src/eventBus.ts` provides the typed EventBus. `packages/state/src/actions.ts` exposes `createAction()` which wraps emission. `packages/state/src/effects.ts` contains effect subscriptions that dispatch to reducers. Architecture lint rules flag any `store.dispatch` call found directly inside component files.

## Pros and Cons of the Options

### Fixed Action → Event → Effect → Reducer → Store sequence with typed EventBus

* Good, because cross-domain communication via EventBus is typed at compile time and observable at runtime without component-level access
* Bad, because the additional indirection (action → event → effect) increases the surface area developers must understand for routine changes

### Direct Redux dispatch from components

* Good, because it is the minimal-ceremony approach familiar to Redux users
* Bad, because mutations originate from arbitrary UI code with no cross-domain observability, and SSE orchestration has no natural home

### Effects calling APIs directly without event mediation

* Good, because effects can coordinate streaming logic close to where data arrives
* Bad, because it violates the event-driven principle by mixing API orchestration and state update concerns in one place

### Redux Toolkit thunks

* Good, because RTK thunks are well-documented and widely understood
* Bad, because thunks do not support EventBus-mediated cross-domain communication, making MFE coordination impossible without custom middleware

## More Information

- EventBus typing ensures event payloads are validated at compile time; unknown event names produce TypeScript errors
- SSE streams emit events through the EventBus on each message chunk; effects accumulate chunks into store state
- Related: ADR 0003 (Plugin-Based Framework Composition) — plugins register effects through the same EventBus context

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:
* `cpt-frontx-fr-sdk-action-pattern` — Action factory and emission contract
* `cpt-frontx-fr-sdk-state-interface` — Store interface exposed to effects and reducers
* `cpt-frontx-fr-sdk-flux-terminology` — Canonical names for each node in the flux sequence
* `cpt-frontx-nfr-maint-event-driven` — Non-functional requirement for event-driven state management
* `cpt-frontx-principle-event-driven-architecture` — Architectural principle requiring EventBus mediation
* `cpt-frontx-principle-action-event-effect-reducer-flux` — Named principle for the fixed flux sequence
* `cpt-frontx-seq-screenset-data-flow` — Sequence diagram tracing screenset state changes through the flux cycle
