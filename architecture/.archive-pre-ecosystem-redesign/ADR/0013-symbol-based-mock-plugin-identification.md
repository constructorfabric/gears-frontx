---
status: accepted
date: 2026-01-04
---

# Symbol-Based Mock Plugin Identification


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Symbol-based plugin identification](#symbol-based-plugin-identification)
  - [Interface-based marking](#interface-based-marking)
  - [String-based identification](#string-based-identification)
  - [Centralized mock registry](#centralized-mock-registry)
  - [Service-specific mock mode flag](#service-specific-mock-mode-flag)
- [Bundling Trade-Off: Mock Fixtures Ship to Production](#bundling-trade-off-mock-fixtures-ship-to-production)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-symbol-based-mock-plugin-identification`
## Context and Problem Statement

FrontX needs centralized mock mode control across all API services while maintaining layer separation — L1 (SDK) is mock-agnostic and L2 (Framework) owns mock logic. The framework must be able to identify which plugins are mock plugins in order to activate or deactivate them, without L1 gaining any knowledge of mock-specific concerns.

## Decision Drivers

* L1 must remain mock-agnostic — mock identification logic belongs in L2
* Plugin identification must be type-safe at both compile time and runtime
* Adding mock support to a service must not require changing existing service registration code (Open/Closed Principle)
* Symbol prevents runtime collisions with other plugin type markers

## Considered Options

* Symbol-based plugin identification (`MOCK_PLUGIN` symbol + `isMockPlugin()` type guard)
* Interface-based marking
* String-based identification
* Centralized mock registry
* Service-specific mock mode flag

## Decision Outcome

Chosen option: "Symbol-based plugin identification", because symbols are type-safe at both compile time and runtime, existing service registration code (`registerPlugin()`) is unchanged when mock support is added, and the Framework layer (L2) owns all mock-specific logic through `mockSlice` and `mockEffects` while L1 remains clean. The `toggleMockMode` action broadcasts state changes via the event bus.

### Consequences

* Good, because the solution is type-safe, layer-respecting, OCP-compliant, and provides centralized control over mock activation
* Bad, because the symbol concept adds a learning curve for new contributors, and mock logic is intentionally split between the L1 plugin interface definition and the L2 activation control

### Confirmation

`MOCK_PLUGIN` symbol is defined in `packages/api/src/plugins/`. The `isMockPlugin()` type guard is in the same location. `mockSlice` and `mockEffects` are in `packages/framework/src/plugins/mock/`. The `toggleMockMode` action is in the same directory.

## Pros and Cons of the Options

### Symbol-based plugin identification

* Good, because symbols survive TypeScript erasure and are available at runtime, giving both compile-time and runtime type safety
* Bad, because developers unfamiliar with JavaScript symbols may find the pattern non-obvious

### Interface-based marking

* Good, because interfaces are idiomatic TypeScript and familiar to most developers
* Bad, because interfaces are erased at runtime, making filtering impossible without additional runtime metadata

### String-based identification

* Good, because strings are simple and require no special language features
* Bad, because string identifiers can collide with other plugin types and provide no compile-time safety

### Centralized mock registry

* Good, because all mock plugins are enumerable from one place
* Bad, because a centralized registry violates vertical slice architecture and creates a cross-cutting dependency

### Service-specific mock mode flag

* Good, because each service controls its own mock state explicitly
* Bad, because it violates the Single Responsibility Principle by embedding infrastructure concerns in service logic

## Bundling Trade-Off: Mock Fixtures Ship to Production

Mock fixture files (`mocks.ts`, `mock-user-store.ts`) and `RestMockPlugin`/`SseMockPlugin` registrations are included in production bundles unconditionally. This is intentional.

**Why not strip at build time?**

- Mock mode is a **runtime** capability, toggleable in deployed dev/staging environments via `toggleMockMode`. A build-time flag would remove that capability.
- The mock toggle already gates **activation**, not inclusion. When mock mode is off (the production default — `isDevEnvironment()` returns `false` for non-localhost hostnames), `syncMockPlugins(false)` never wires mock plugins into protocol chains. No interception occurs; no mock data is returned.
- Mock fixture files are small data maps (typically 15–50 lines each). The bundle cost is negligible compared to framework and HTTP-client dependencies that ship regardless.
- This differs from Studio (`@gears-frontx/studio`), which uses `import.meta.env.DEV` gating because it carries substantial DOM/CSS weight. Mock fixtures carry no UI weight and no side effects when inactive.

**Separation from test utilities.** Runtime mock fixtures (`mocks.ts`, `mock-user-store.ts`) live alongside their API service, outside `__test-utils__/`. Test-only helpers (state reset functions, factory builders) live in `__test-utils__/` per `UNIT_TESTING.md`. The two serve different purposes and the split is correct:

| Location | Purpose | Consumed by | In bundle? |
|---|---|---|---|
| `api/mocks.ts`, `api/mock-user-store.ts` | Runtime mock data for `RestMockPlugin` | Service constructor | Yes |
| `api/__test-utils__/mocks.ts` | Test reset/getter helpers | Vitest test files only | No |

**When to revisit.** If mock fixture files grow large (e.g., full response corpuses exceeding several KB), consider dynamic `import()` behind the mock toggle to defer loading. This is a performance optimisation, not a correctness concern, and should be driven by bundle analysis rather than preemptive policy.

## More Information

- MDN Symbol documentation: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol
- Related: ADR 0003 (Plugin-Based Framework Composition)

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses:

* `cpt-frontx-fr-mock-toggle` — `toggleMockMode` action activates/deactivates mock plugins
* `cpt-frontx-fr-sse-mock-mode` — SSE service mock plugin registered and controlled via this pattern
* `cpt-frontx-component-api` — `MOCK_PLUGIN` symbol and type guard owned by the API package (L1)
* `cpt-frontx-component-framework` — `mockSlice` and `mockEffects` owned by the Framework package (L2)
