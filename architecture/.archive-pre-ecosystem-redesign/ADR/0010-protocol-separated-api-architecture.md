---
status: accepted
date: 2025-11-16
---

# Protocol-Separated API Architecture


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Single configuration object with all protocol options in a flat structure](#single-configuration-object-with-all-protocol-options-in-a-flat-structure)
  - [String-based plugin identification with a shared plugin registry](#string-based-plugin-identification-with-a-shared-plugin-registry)
  - [Protocol-specific configuration interfaces extending a base config; global plugin registry keyed by protocol class](#protocol-specific-configuration-interfaces-extending-a-base-config-global-plugin-registry-keyed-by-protocol-class)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-protocol-separated-api-architecture`
## Context and Problem Statement

FrontX needed to support multiple API protocols (REST, SSE, potentially others) without coupling services to specific transports. A monolithic configuration object containing all protocol options would grow unwieldy as protocols are added and would couple the evolution of one protocol to changes in another. The same separation rule applies to API contracts at the service layer: imperative transport contracts (`get`, `post`, `connect`) and declarative descriptor contracts (`query`, `mutation`, `stream`) must remain separate peers so no base service becomes a transport router.

## Decision Drivers

* Adding a new protocol or declarative contract must require no changes to existing protocol implementations (Open/Closed Principle)
* Plugin registration must be type-safe and support dynamic registration after protocol instances are created

## Considered Options

* Single configuration object with all protocol options in a flat structure
* String-based plugin identification with a shared plugin registry
* Protocol-specific configuration interfaces extending a base config; global plugin registry keyed by protocol class

## Decision Outcome

Chosen option: "Protocol-specific configuration interfaces extending a base config; global plugin registry keyed by protocol class", because protocols evolve independently, the protocol class as Map key provides type-safe retrieval, runtime query at request execution enables dynamic plugin discovery without constructor coupling, and declarative endpoint/stream contracts can be introduced as separate peers without changing existing imperative transports.

### Consequences

* Good, because protocol independence, type-safe plugin management, and extensibility without modifying existing code
* Good, because declarative contracts can evolve separately from imperative transports without turning `BaseApiService` into a protocol router
* Bad, because indirection is introduced (plugins are queried at request time rather than injected), and developers must understand two plugin levels — global registry and instance-level overrides

### Confirmation

Protocol-specific config interfaces (`RestProtocolConfig`, `SseProtocolConfig`) are located in `packages/api/src/protocols/`. The `apiRegistry` with Map-based plugin storage lives in `packages/api/src/registry.ts`. REST and SSE protocol implementations query the registry during request execution rather than at construction time. Declarative service contracts are modeled as separate peers (`RestEndpointProtocol`, `SseStreamProtocol`) rather than as methods on `BaseApiService` or on the imperative transports themselves.

## Pros and Cons of the Options

### Single configuration object with all protocol options in a flat structure

* Good, because simple — one object to configure all protocol behaviour
* Bad, because every new protocol adds fields to a shared object, coupling protocol evolution and producing a growing configuration surface

### String-based plugin identification with a shared plugin registry

* Good, because human-readable plugin identifiers that are easy to log and debug
* Bad, because string keys are not type-safe; mismatched strings cause silent runtime failures rather than compile-time errors

### Protocol-specific configuration interfaces extending a base config; global plugin registry keyed by protocol class

* Good, because Open/Closed Principle is satisfied — a new protocol is added by creating a new class and config interface, not by modifying existing ones
* Bad, because the two-level plugin model (global registry plus instance-level overrides) requires developers to understand the precedence rules

## More Information

Protocols query `apiRegistry` during request execution rather than receiving plugins through constructor injection. This design choice was deliberate: constructor injection would prevent dynamic plugin registration that occurs after protocol instances are created. Services compose imperative and declarative peers explicitly, for example `new RestProtocol()` plus `new RestEndpointProtocol(rest)`, so the base service stays transport-agnostic while each contract remains single-purpose.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-sse-protocol` — SSE protocol implementation and configuration
* `cpt-frontx-fr-sse-protocol-registry` — protocol registry and plugin discovery at request time
* `cpt-frontx-fr-sdk-api-package` — api package structure and public contracts
* `cpt-frontx-nfr-rel-api-retry` — retry plugin integration through the global registry
* `cpt-frontx-component-api` — api package component boundary
* `cpt-frontx-interface-api-service` — ApiService interface and protocol configuration contracts
