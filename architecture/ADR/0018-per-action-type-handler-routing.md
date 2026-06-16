---
status: accepted
date: 2026-04-01
---

# Per-Action-Type Handler Routing in ActionsChainsMediator

**ID**: `cpt-frontx-adr-per-action-type-handler-routing`

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-action-type registration with unified mediator storage](#per-action-type-registration-with-unified-mediator-storage)
  - [Monolithic handler with switch and CustomActionHandler callback](#monolithic-handler-with-switch-and-customactionhandler-callback)
  - [ActionHandler interface with per-target registration](#actionhandler-interface-with-per-target-registration)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

## Context and Problem Statement

The `ActionsChainsMediator` previously stored one handler per target (`Map<domainId, ActionHandler>` for domains and a separate `Map<extensionId, ExtensionHandlerInfo>` for extensions — two maps with different structures). Domain-side handling was concentrated in a single `ExtensionLifecycleActionHandler` class that switched on `load_ext` / `mount_ext` / `unmount_ext` and delegated everything else to an optional `customActionHandler` callback passed through `registerDomain()`. Extension-side used an `ActionHandler` interface (`handleAction(actionTypeId, payload)`).

This design has three compounding problems:

1. **OCP violation**: adding a new lifecycle action type requires modifying the switch inside `ExtensionLifecycleActionHandler`.
2. **Asymmetric APIs**: domain side used a `CustomActionHandler` callback type; extension side used an `ActionHandler` interface — two different type constructs for the same concept.
3. **Forced aggregation**: all domain-level logic had to route through one class, preventing independent registration and independent testing of individual action type behaviors.

How should the mediator store and route action handlers so that adding new action types requires no modification to any existing class?

## Decision Drivers

* Open/Closed Principle — new action types must not require modification of existing handler infrastructure
* Single Responsibility — each handler class handles exactly one action type; no branching aggregators
* Consistency — domain and extension sides must use the same registration API and handler signature; all public contracts use abstract classes, not function types
* Class-based architecture — every public component in `@gears-frontx/screensets` is an abstract class; `ActionHandler` follows the same convention as `MfeHandler`, `MfeBridgeFactory`, `RuntimeCoordinator`, and `ChildMfeBridge`

## Considered Options

* Per-action-type registration with unified mediator storage
* Monolithic handler with switch and `CustomActionHandler` callback (status quo)
* `ActionHandler` interface with per-target registration (partial improvement)

## Decision Outcome

Chosen option: "Per-action-type registration with unified mediator storage", because it is the only option that satisfies OCP (no existing code changes when a new action type is introduced), unifies the API across domain and extension sides, and eliminates forced aggregation without adding abstraction complexity.

### Consequences

* Good, because adding a new lifecycle action type requires only one new small handler class and one `mediator.registerHandler(targetId, actionTypeId, handler)` call — no existing class is modified.
* Good, because `ActionHandler` is an abstract class with a single `handleAction(actionTypeId, payload)` method — consistent with every other public contract in the package (`MfeHandler`, `MfeBridgeFactory`, `RuntimeCoordinator`, `ChildMfeBridge`).
* Good, because both domain-side (framework) and extension-side (child MFE) use identical registration pattern and identical handler type.
* Good, because the monolithic `ExtensionLifecycleActionHandler` class and its switch are eliminated; each lifecycle action type gets its own small handler class.
* Neutral, because `registerDomain()` signature changes (the `customActionHandler?` parameter is removed) and `CustomActionHandler` type is removed from the public API. The project is pre-1.0 (`0.*`) — breaking changes are expected and no external consumers exist.
* Neutral, because the mediator's internal storage changes from two heterogeneous maps to one `Map<targetId, Map<actionTypeId, ActionHandler>>`. The `ActionsChainsMediator` abstract class gains `registerHandler` / `unregisterAllHandlers` and loses `registerDomainHandler` / `registerExtensionHandler`.

> **Correction note**: An earlier draft of this ADR specified `ActionHandlerFn` (a function type alias) as the handler contract. That was inconsistent with the project rule that every public component must be an abstract class. The decision has been corrected to use `ActionHandler` abstract class. The per-action-type registration architecture is unchanged.

### Confirmation

* Code review: `ActionsChainsMediator` abstract class must not declare `registerDomainHandler`, `registerExtensionHandler`, or `unregisterDomainHandler`; it must declare `registerHandler(targetId, actionTypeId, handler)` and `unregisterAllHandlers(targetId)`.
* Code review: Monolithic `ExtensionLifecycleActionHandler` switch class must not exist; each lifecycle action type has its own small `ActionHandler` subclass.
* Code review: `CustomActionHandler` type and `ActionHandlerFn` type alias must not be exported from `@gears-frontx/screensets`; `ActionHandler` abstract class is the only public handler contract.
* Code review: `ChildMfeBridge.registerActionHandler` signature must be `(actionTypeId: string, handler: ActionHandler): void`.
* Test: registering two handlers for different action types on the same target and dispatching each type invokes the correct handler and does not invoke the other.
* Test: unregistering all handlers for a target removes all entries; subsequent dispatch for any action type on that target is a no-op.

## Pros and Cons of the Options

### Per-action-type registration with unified mediator storage

Mediator stores `Map<targetId, Map<actionTypeId, ActionHandler>>`. Registration: `registerHandler(targetId, actionTypeId, handler)`. Deregistration: `unregisterAllHandlers(targetId)`. Dispatch: `handlers.get(target)?.get(actionType)?.handleAction(actionType, payload)`.

* Good, because OCP is satisfied — new action types are additive.
* Good, because no switch statement, no conditional delegation.
* Good, because handler is a small class — consistent with all other public components in the package.
* Good, because unified storage — no separate domain/extension maps.
* Bad, because `registerDomain()` must now make three `registerHandler` calls (one per lifecycle action type) instead of one constructor call.

### Monolithic handler with switch and CustomActionHandler callback

Single `ExtensionLifecycleActionHandler` class per domain, switching on action type. `registerDomain(domain, containerProvider, onInitError?, customActionHandler?)` passes the optional callback for non-lifecycle actions.

* Good, because all domain action routing is in one place.
* Bad, because adding any new lifecycle action type requires modifying the switch — OCP violation.
* Bad, because `CustomActionHandler` (callback type) and `ActionHandler` (interface) are different types for the same concept — API asymmetry.
* Bad, because the `customActionHandler` coupling point encourages passing arbitrary logic into `registerDomain()` rather than explicit handler registration.

### ActionHandler interface with per-target registration

Keep `ActionHandler` interface (`handleAction(actionTypeId, payload)`). Register one `ActionHandler` per target. The implementor switches internally.

* Good, because slightly less coupling than the monolithic class.
* Bad, because the switch still lives somewhere — just moved to the caller; OCP is still violated.
* Bad, because asymmetry between domain and extension APIs remains if not addressed uniformly.

## More Information

`ActionHandler` is an abstract class with a single method: `abstract handleAction(actionTypeId: string, payload: Record<string, unknown> | undefined): Promise<void>`. It is exported from `@gears-frontx/screensets`. The `ChildMfeBridge.registerActionHandler(actionTypeId, handler)` signature accepts `actionTypeId` as the first parameter, making the per-type intent explicit at the call site. Domain-side lifecycle handlers are small classes extending `ActionHandler` — one class per lifecycle action type — registered via `mediator.registerHandler(domainId, actionTypeId, handler)` during `registerDomain()`.

`registerDomain` uses an options object as the third parameter:
```typescript
registerDomain(
  domain: ExtensionDomain,
  containerProvider: ContainerProvider,
  options?: {
    onInitError?: (error: Error) => void;
    actionHandlers?: Record<string, ActionHandler>;
  }
): void
```
The options object avoids parameter proliferation: `onInitError` handles async init failures, and `actionHandlers` allows callers to register custom per-action-type handlers alongside the built-in lifecycle handlers without spreading domain ID knowledge across the call site. The `customActionHandler` callback and any positional `onInitError` parameter are removed from the public API.

## Traceability

- **DESIGN**: [DESIGN.md](../DESIGN.md)
- **Feature**: [feature-mfe-registry/FEATURE.md](../features/feature-mfe-registry/FEATURE.md)
- **Feature**: [feature-mfe-isolation/FEATURE.md](../features/feature-mfe-isolation/FEATURE.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-interface-child-mfe-bridge` — `registerActionHandler` signature changes to include `actionTypeId` parameter; abstract class replaces interface
* `cpt-frontx-seq-extension-action-delivery` — mediator resolves handler by `(target, actionType)` pair instead of just `target`
* `cpt-frontx-flow-mfe-registry-register-domain` — `registerDomain` removes `customActionHandler` parameter; per-type registration is explicit
* `cpt-frontx-flow-mfe-registry-register-extension-handler` — `bridge.registerActionHandler(actionTypeId, handler)` is the per-type registration API
