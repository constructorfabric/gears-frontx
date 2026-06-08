---
status: accepted
date: 2026-06-05
---

# Protocol-Separated, Solution-Agnostic API Surface


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Single unified client](#single-unified-client)
  - [Protocol-separated abstraction with a generic plugin extension point](#protocol-separated-abstraction-with-a-generic-plugin-extension-point)
  - [Per-solution API clients](#per-solution-api-clients)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-protocol-separated-api`
## Context and Problem Statement

Composed applications and their microfrontends issue both request/response calls and long-lived streaming calls to back-end services, and these two interaction shapes have different lifecycles, plugin hooks, and cancellation semantics. The API Protocol Surface (`cpt-frontx-component-api-surface`) must expose a single, stable surface that serves both shapes while remaining a dependency-light, reusable Core Framework unit that no single application or solution can specialise. How should the surface organise request/response versus streaming communication, and how should it admit application-specific behaviour, so that one neutral abstraction serves every consumer without binding the surface to any one solution?

## Decision Drivers

* **Separation of interaction concerns** — request/response and streaming have distinct lifecycles (one-shot fetch with retry versus a persistent connection emitting events); each needs its own typed hook surface that keeps the other's concepts out.
* **Solution-agnostic reuse** (`cpt-frontx-constraint-api-no-solution-content`, API-1) — the surface is a shared Core Framework unit; it must carry no behaviour specific to any one application, and ship no application-specific plugin of its own, so it stays reusable across all consumers.
* **Dependency lightness** — the surface must impose no runtime dependency on a specific data-fetching or state-management library, and its transport must be a peer dependency the consumer owns, so adopting it does not dictate a consumer's wider stack.
* **Open extension, closed core** — new protocols and new per-request behaviour must be addable without editing the core abstraction (open/closed), via a uniform extension point rather than special-casing inside the surface.
* **Declarative endpoints with stable identity** — consumers declare endpoints and receive stable, automatically derived cache keys, so call sites carry no hand-written key bookkeeping.

## Considered Options

* **Single unified client** — one client object exposes both fetch and stream calls behind one merged interface, with conditional behaviour selecting transport per call.
* **Protocol-separated abstraction with a generic plugin extension point** — an abstract `ApiProtocol` base with one implementation per interaction shape (request/response, streaming), descriptor-based endpoints with auto-derived cache keys, and all application-specific behaviour supplied through a uniform plugin contract rather than built into the surface.
* **Per-solution API clients** — each solution defines and ships its own client, with no shared abstraction.

## Decision Outcome

Chosen option: **Protocol-separated abstraction with a generic plugin extension point**, because it resolves the separation-of-concerns and solution-agnostic-reuse drivers simultaneously: each interaction shape gets its own typed protocol implementation behind a common abstract base, while every application-specific concern arrives only through the uniform plugin contract, so the core surface owns no solution-specific content and remains a neutral, reusable unit. The unified-client option couples the two lifecycles, and the per-solution option forfeits all reuse and consistency.

The surface is organised as an abstract `ApiProtocol` base parameterised by a protocol-specific plugin-hooks type, with concrete request/response and streaming implementations. Endpoints are declared as descriptors that carry a cache key derived automatically from the request identity, and any per-request or cross-cutting behaviour is contributed as a plugin registered against a protocol. A registered plugin may short-circuit a request — intercept it before the outbound transport call and return a response in place of performing the call — so behaviours that stand in for, augment, or pre-empt a network response are ordinary plugins, without the surface embedding or naming any of them. The surface ships no application-specific plugin of its own; consumers and templates contribute them, and the surface names and privileges no particular plugin kind.

### Consequences

* Good, because the two interaction lifecycles evolve independently behind one stable abstraction, and each carries only the hooks its shape needs.
* Good, because the surface stays solution-agnostic: it ships no application behaviour, so it is freely reusable across every consumer and cannot be specialised into one solution's needs.
* Good, because the surface imposes no runtime dependency on a data-fetching or state library and treats its transport as a peer dependency, leaving the wider stack to the consumer.
* Good, because new protocols and new behaviours are added by extension (a new `ApiProtocol` subtype, a new plugin) without editing the core, honouring the open/closed driver.
* Bad, because consumers must supply behaviour as plugins rather than reaching for a built-in convenience, raising the initial wiring cost of a service.
* Bad, because the protocol/plugin indirection adds conceptual surface area a consumer must learn before first use.

### Confirmation

Compliance is confirmed by design and code review against three checkable invariants, each enforceable as a continuous-integration check on the surface package: (1) the surface declares no runtime dependency and treats its transport as a peer dependency (assert an empty `dependencies` map and a peer-declared transport in the package manifest); (2) request/response and streaming behaviour are reachable only through distinct `ApiProtocol` subtypes with protocol-specific plugin-hook types (no merged client interface); (3) no application/solution-specific identifier appears in the surface at all, and the surface ships no application-specific plugin of its own, which is exactly `cpt-frontx-constraint-api-no-solution-content` (API-1); solution behaviour arrives only through the generic plugin contract and its short-circuit capability, verified by a grep-style boundary check over the surface package that fails on solution-specific symbols.

## Pros and Cons of the Options

### Single unified client

One client object exposes both fetch and stream operations behind one interface, branching internally on the requested transport.

* Good, because a consumer learns a single entry point.
* Good, because shared cross-cutting logic lives in one place.
* Neutral, because it can still expose typed methods per operation.
* Bad, because the two lifecycles are forced into one type, so streaming hooks and request retry hooks bleed into each other.
* Bad, because adding a new interaction shape edits the shared client, conflicting with the open/closed driver.

### Protocol-separated abstraction with a generic plugin extension point

An abstract `ApiProtocol` base with one concrete implementation per interaction shape, descriptor-based endpoints with auto-derived cache keys, and all application-specific behaviour supplied through a uniform plugin contract.

* Good, because each interaction shape is isolated behind its own typed implementation and hook surface.
* Good, because the core carries no solution-specific content, keeping the surface reusable and neutral.
* Good, because protocols and behaviours extend the surface without editing it.
* Neutral, because all application-specific behaviour, including any short-circuiting response provider, is consumer- or template-supplied on top of the generic plugin contract, so the surface ships no application-specific plugin of its own.
* Bad, because consumers must assemble behaviour from plugins rather than from built-in conveniences.

### Per-solution API clients

Each solution defines and ships its own client, with no shared abstraction.

* Good, because each solution optimises freely for its own needs.
* Bad, because there is no shared reuse, consistency, or single place to evolve protocol behaviour.
* Bad, because each solution re-implements cross-cutting concerns and cache-key derivation independently.

## More Information

The mechanism described here ships in the `@cyberfabric/api` package. For accuracy (and as non-binding present detail), the abstract base and plugin contract are defined in `packages/api/src/types.ts` (the `ApiProtocol` abstract class at `types.ts:152`, the `isShortCircuit` and protocol-specific guards, and the descriptor types `EndpointDescriptor` / `ParameterizedEndpointDescriptor` / `MutationDescriptor` / `StreamDescriptor`). The request/response implementation is `packages/api/src/protocols/RestProtocol.ts` and the streaming implementation is `packages/api/src/protocols/SseProtocol.ts`; the public surface is re-exported from `packages/api/src/index.ts`. Auto-derived cache keys take the form `[baseURL, method, path]` (see the descriptor key documentation in `packages/api/src/types.ts`). The surface's transport is a peer dependency declared in `packages/api/package.json` (`peerDependencies.axios`), and the package declares no runtime `dependencies`. These specific symbols and paths are present detail for reviewer verification and are not part of this decision's durable identity.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following design elements:

* `cpt-frontx-component-api-surface` — This decision defines how the API Protocol Surface organises protocol-separated request/response and streaming communication behind a common abstraction with a generic plugin extension point, and why the surface admits no solution-specific content. It is intentionally below PRD interface altitude (it maps to no PRD §7.1 public interface) and therefore anchors the DESIGN component rather than any PRD requirement.
* `cpt-frontx-constraint-api-no-solution-content` (API-1) — This decision enforces the design constraint that the API surface carries no solution-specific content: the surface ships no application-specific plugin of its own; all such behaviour is consumer- or template-supplied through the generic plugin contract and its short-circuit capability.
