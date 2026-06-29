# Feature: MFE Registry & Handler Resolution


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Register Domain and Extension, Validate, and Mount](#register-domain-and-extension-validate-and-mount)
  - [Build Registry via Factory](#build-registry-via-factory)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Handler Resolution by Declared Base Type](#handler-resolution-by-declared-base-type)
  - [Extension Registration and Entry Storage](#extension-registration-and-entry-storage)
- [4. States (CDSL)](#4-states-cdsl)
  - [MfeEntry Registration Lifecycle](#mfeentry-registration-lifecycle)
  - [Factory Cache Lifecycle](#factory-cache-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Registry Facade Contract](#registry-facade-contract)
  - [Handler Resolution by Declared Base Type](#handler-resolution-by-declared-base-type-1)
  - [Register–Validate–Mount Sequence Ownership](#registervalidatemount-sequence-ownership)
  - [Type Contracts](#type-contracts)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-mfe-registry`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-mfe-registry`

### 1.1 Overview

This feature provides the abstract `MfeRegistry` façade — built via `mfeRegistryFactory` with the type-system provider injected — that owns microfrontend registration and on-demand load orchestration, resolving each unit's handler by its declared base type via the injected type system.

### 1.2 Purpose

The registry façade gives host applications a stable contract for registering extension domains and microfrontend extensions, resolving the correct handler by subtype matching through the injected `TypeSystemPlugin`, and orchestrating the complete register → validate → mount sequence — all without embedding type-format literals or concrete implementation dependencies.

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-fr-ui-framework-agnostic`

**Principles**: `cpt-frontx-principle-agnostic-core`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Integrates MFEs into a host application by registering domains and extensions through the registry façade |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR 0003**: [ADR/0003-mfe-registry-facade.md](../../ADR/0003-mfe-registry-facade.md)
- **ADR 0006**: [ADR/0006-handler-abstraction-registry-resolution.md](../../ADR/0006-handler-abstraction-registry-resolution.md)
- **Dependencies**: `cpt-frontx-feature-type-substrate-port`

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

**Sequences**: `cpt-frontx-seq-mfe-register-validate-mount` (this feature owns and realizes this sequence)

### Register Domain and Extension, Validate, and Mount

- [ ] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-register-validate-mount`

**Actor**: `cpt-frontx-actor-project-developer`

**Sequence realized**: `cpt-frontx-seq-mfe-register-validate-mount`

**Success Scenarios**:
- Developer registers a domain and a conforming extension; the extension passes type validation and domain contract matching, is loaded on demand, and mounts under the domain's mount strategy.

**Error Scenarios**:
- Extension entry type validation fails — the registry rejects the extension and it is not placed into its extension domain.
- No registered handler matches the extension's declared base type — the registry rejects with a handler-not-found error.
- Domain contract matching fails — the extension is rejected before load.

**Steps**:
1. [ ] - `p1` - Developer obtains a registry instance by calling `mfeRegistryFactory.build` with an injected `TypeSystemPlugin` - `inst-flow-rvm-01`
2. [ ] - `p1` - Developer calls `registry.registerDomain` with an `ExtensionDomain` declaration and an `ExtensionDomainImplementationFactory` - `inst-flow-rvm-02`
3. [ ] - `p1` - Registry validates the domain declaration through `typeSystem.register` and synchronously constructs the domain implementation via the factory - `inst-flow-rvm-03`
4. [ ] - `p1` - **IF** validation fails **THEN** registry throws, domain is not registered, flow ends - `inst-flow-rvm-04`
5. [ ] - `p1` - Developer calls `registry.registerExtension` with an `Extension` value - `inst-flow-rvm-05`
6. [ ] - `p1` - Registry invokes handler resolution: **FOR EACH** registered handler ordered by descending priority, evaluate `typeSystem.isTypeOf(extension.entry.typeId, handler.handledBaseTypeId)` - `inst-flow-rvm-06`
   1. [ ] - `p1` - **IF** `isTypeOf` returns true, select this handler and stop evaluation - `inst-flow-rvm-06a`
7. [ ] - `p1` - **IF** no handler matched, registry rejects the extension and flow ends - `inst-flow-rvm-07`
8. [ ] - `p1` - Registry validates the extension's entry against its domain contract and checks cardinality - `inst-flow-rvm-08`
9. [ ] - `p1` - **IF** contract matching or cardinality check fails, registry rejects the extension and flow ends - `inst-flow-rvm-09`
10. [ ] - `p1` - Registry marks the extension as `ADMITTED` and stores the resolved handler reference - `inst-flow-rvm-10`
11. [ ] - `p1` - On a load trigger, the registry initiates the extension's load through the actions-chain lifecycle — a load action (`FRONTX_ACTION_LOAD_EXT`) targeting the extension's domain and keyed by the extension instance ID is executed via the mediator, which dispatches it to the domain's load handler (load mechanics owned by F5) - `inst-flow-rvm-11`
12. [ ] - `p1` - Once loaded, a mount action (`FRONTX_ACTION_MOUNT_EXT`) is executed through the same actions-chain mechanism; the extension mounts under its domain's mount strategy and the registry marks it `MOUNTED` (mount-strategy mechanics owned by F7) - `inst-flow-rvm-12`
13. [ ] - `p1` - **RETURN** occupant active in domain - `inst-flow-rvm-13`

### Build Registry via Factory

- [ ] `p2` - **ID**: `cpt-frontx-flow-mfe-registry-factory-build`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- First call creates and caches a registry instance bound to the supplied `TypeSystemPlugin`.
- Subsequent calls with the same plugin return the cached instance.

**Error Scenarios**:
- Subsequent call supplies a different `TypeSystemPlugin` — factory throws a configuration mismatch error.

**Steps**:
1. [ ] - `p1` - Developer calls `mfeRegistryFactory.build` with a configuration containing a `TypeSystemPlugin` - `inst-flow-fb-01`
2. [ ] - `p1` - **IF** a cached instance already exists, validate that the supplied plugin matches the cached configuration - `inst-flow-fb-02`
   1. [ ] - `p1` - **IF** the plugin differs, throw a configuration mismatch error and **RETURN** - `inst-flow-fb-02a`
   2. [ ] - `p1` - **IF** the plugin matches, **RETURN** cached instance - `inst-flow-fb-02b`
3. [ ] - `p1` - Create a new registry implementation bound to the supplied `TypeSystemPlugin`, cache it alongside the configuration, and **RETURN** the new instance - `inst-flow-fb-03`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly.

### Handler Resolution by Declared Base Type

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-handler-resolution`

**Input**: `entryTypeId` (the declared type identifier of an `MfeEntry`), ordered list of registered `MfeHandler` instances sorted by descending priority

**Output**: The matched `MfeHandler`, or a resolution failure

**Steps**:
1. [ ] - `p1` - Sort the registered handler list by descending `handler.priority` — handlers with equal priority retain insertion order - `inst-algo-hr-01`
2. [ ] - `p1` - **FOR EACH** handler in sorted order - `inst-algo-hr-02`
   1. [ ] - `p1` - Evaluate `typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)` through the injected `TypeSystemPlugin` - `inst-algo-hr-02a`
   2. [ ] - `p1` - **IF** `isTypeOf` returns true, **RETURN** this handler as the match — stop iterating - `inst-algo-hr-02b`
3. [ ] - `p1` - **IF** no handler matched after iterating all handlers, **RETURN** resolution failure indicating no registered handler covers the given entry type - `inst-algo-hr-03`

### Extension Registration and Entry Storage

- [ ] `p2` - **ID**: `cpt-frontx-algo-mfe-registry-register-extension`

**Input**: `Extension` value containing an `MfeEntry` with a declared `typeId`

**Output**: Registration outcome (success or rejection with reason)

**Steps**:
1. [ ] - `p1` - Validate the extension's entry via `typeSystem` against the registered type schemas - `inst-algo-re-01`
2. [ ] - `p1` - **IF** validation fails, **RETURN** rejection with the validation error - `inst-algo-re-02`
3. [ ] - `p1` - Invoke handler resolution (see `cpt-frontx-algo-mfe-registry-handler-resolution`) with the entry's `typeId` - `inst-algo-re-03`
4. [ ] - `p1` - **IF** resolution fails, **RETURN** rejection with a handler-not-found error - `inst-algo-re-04`
5. [ ] - `p1` - Store the extension in the registry's internal map keyed by `extension.id`, associating it with the resolved handler - `inst-algo-re-05`
6. [ ] - `p1` - Notify the extension's target domain that a new extension has been registered - `inst-algo-re-06`
7. [ ] - `p1` - **RETURN** success - `inst-algo-re-07`

## 4. States (CDSL)

### MfeEntry Registration Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-mfe-registry-entry-lifecycle`

**States**: UNREGISTERED, REGISTERED, HANDLER_RESOLVED, ADMITTED, MOUNTED, REJECTED

**Initial State**: UNREGISTERED

**Transitions**:
1. [ ] - `p1` - **FROM** UNREGISTERED **TO** REGISTERED **WHEN** `registerExtension` is called and type validation succeeds - `inst-state-el-01`
2. [ ] - `p1` - **FROM** UNREGISTERED **TO** REJECTED **WHEN** `registerExtension` is called and type validation fails - `inst-state-el-02`
3. [ ] - `p1` - **FROM** REGISTERED **TO** HANDLER_RESOLVED **WHEN** the registry finds a matching handler via `typeSystem.isTypeOf` - `inst-state-el-03`
4. [ ] - `p1` - **FROM** REGISTERED **TO** REJECTED **WHEN** no registered handler matches the entry's declared base type - `inst-state-el-04`
5. [ ] - `p1` - **FROM** HANDLER_RESOLVED **TO** ADMITTED **WHEN** domain contract matching succeeds and cardinality allows the occupant - `inst-state-el-05`
6. [ ] - `p1` - **FROM** HANDLER_RESOLVED **TO** REJECTED **WHEN** domain contract matching fails or cardinality is exceeded - `inst-state-el-06`
7. [ ] - `p1` - **FROM** ADMITTED **TO** MOUNTED **WHEN** `handler.load` completes and the lifecycle is mounted under the domain's mount strategy - `inst-state-el-07`
8. [ ] - `p1` - **FROM** ADMITTED **TO** REJECTED **WHEN** `handler.load` fails or mount fails - `inst-state-el-08`
9. [ ] - `p1` - **FROM** MOUNTED **TO** UNREGISTERED **WHEN** `unregisterExtension` is called — the extension is unmounted first, then removed from the registry - `inst-state-el-09`

### Factory Cache Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-mfe-registry-factory-cache`

**States**: EMPTY, CACHED

**Initial State**: EMPTY

**Transitions**:
1. [ ] - `p1` - **FROM** EMPTY **TO** CACHED **WHEN** `build` is called for the first time and a new registry instance is created and stored - `inst-state-fc-01`
2. [ ] - `p1` - **FROM** CACHED **TO** CACHED **WHEN** `build` is called again with a matching configuration — returns the existing instance - `inst-state-fc-02`

## 5. Definitions of Done

### Registry Facade Contract

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-registry-contract`

The system **MUST** expose the abstract `MfeRegistry` as the sole public runtime contract, obtainable only through `mfeRegistryFactory.build({ typeSystem })`, with the concrete implementation and internal coordination machinery remaining inaccessible to consumers.

**Implements**:
- `cpt-frontx-flow-mfe-registry-factory-build`

**Touches**:
- Entities: `MfeEntry`, `Extension`
- Interface: `cpt-frontx-interface-mfe-runtime`
- Component: `cpt-frontx-component-mfe-runtime`

### Handler Resolution by Declared Base Type

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-handler-injection`

The system **MUST** resolve a handler for each registered `MfeEntry` by evaluating `typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)` through the injected `TypeSystemPlugin` — the runtime MUST contain no type-format string literals used for handler matching, and handlers MUST NOT carry a self-selection predicate.

**Implements**:
- `cpt-frontx-algo-mfe-registry-handler-resolution`

**Touches**:
- Entities: `MfeEntry`, `Extension`
- Component: `cpt-frontx-component-mfe-runtime`

### Register–Validate–Mount Sequence Ownership

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-register-validate-mount`

The system **MUST** own and orchestrate the complete register → type-validate → handler-resolve → domain-admit → load-on-demand → mount sequence, rejecting any extension whose type validation or domain contract matching fails before loading occurs.

**Implements**:
- `cpt-frontx-flow-mfe-registry-register-validate-mount`
- `cpt-frontx-algo-mfe-registry-register-extension`

**Touches**:
- Entities: `MfeEntry`, `Extension`
- Component: `cpt-frontx-component-mfe-runtime`
- Sequence: `cpt-frontx-seq-mfe-register-validate-mount`

### Type Contracts

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-type-contracts`

The system **MUST** define the `MfeHandler` abstract class with `handledBaseTypeId`, `priority`, `bridgeFactory`, and `load(entry, extensionId)` — and MUST NOT include any `canHandle`-style self-selection method on the handler.

**Implements**:
- `cpt-frontx-algo-mfe-registry-handler-resolution`

**Touches**:
- Entities: `MfeEntry`
- Component: `cpt-frontx-component-mfe-runtime`

## 6. Acceptance Criteria

- [ ] The abstract `MfeRegistry` is the only exported public runtime contract; consumers obtain instances via `mfeRegistryFactory.build({ typeSystem })`.
- [ ] Handler resolution uses `typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)` exclusively — no type-format string literals appear in the registry's resolution logic.
- [ ] `MfeHandler` declares `handledBaseTypeId`, `priority`, `bridgeFactory`, and `load` — no self-selection predicate.
- [ ] The factory-with-cache pattern returns the same instance on repeated calls with matching configuration, and throws on configuration mismatch.
- [ ] An extension whose type validation fails is rejected without being placed into its extension domain.
- [ ] An extension with no matching handler is rejected with a handler-not-found error.
- [ ] The `MfeEntry` state machine (UNREGISTERED → REGISTERED → HANDLER_RESOLVED → ADMITTED → MOUNTED / REJECTED) is honored by the runtime.
