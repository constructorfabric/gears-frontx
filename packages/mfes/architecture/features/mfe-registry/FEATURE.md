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
  - [Router Admission and Release Notifications](#router-admission-and-release-notifications)
  - [Domain Unregistration Closes Extension Registration](#domain-unregistration-closes-extension-registration)
  - [Non-Blocking Lifecycle Stage Triggering](#non-blocking-lifecycle-stage-triggering)
- [4. States (CDSL)](#4-states-cdsl)
  - [MfeEntry Registration Lifecycle](#mfeentry-registration-lifecycle)
  - [Factory Cache Lifecycle](#factory-cache-lifecycle)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Registry Facade Contract](#registry-facade-contract)
  - [Optional Router in the Factory Configuration](#optional-router-in-the-factory-configuration)
  - [Router Admission Before Durable Registration, Release at Cleanup](#router-admission-before-durable-registration-release-at-cleanup)
  - [Handler Resolution by Declared Base Type](#handler-resolution-by-declared-base-type-1)
  - [Register–Validate–Mount Sequence Ownership](#registervalidatemount-sequence-ownership)
  - [Non-Blocking Lifecycle Stage Triggering](#non-blocking-lifecycle-stage-triggering-1)
  - [Type Contracts](#type-contracts)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-mfe-registry`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-mfe-registry`

### 1.1 Overview

This feature provides the abstract `MfeRegistry` façade — built via `createMfeRegistryFactory()` with the type-system provider injected and, optionally, a router implementing the router port — that owns microfrontend registration and on-demand load orchestration, resolving each unit's handler by its declared base type via the injected type system, and presenting each domain and extension registration to the injected router before the registration becomes durable.

### 1.2 Purpose

The registry façade gives host applications a stable contract for registering extension domains and microfrontend extensions, resolving the correct handler by subtype matching through the injected `TypeSystemPlugin`, and orchestrating the complete register → validate → mount sequence — all without embedding type-format literals, routing grammar, or concrete implementation dependencies. Where a router is injected, the registry is that router's private admission path: registration notifications let the router admit or reject each routed registration before it is durable, and release notifications free what the router admitted when an extension or domain is unregistered or the registry is disposed (`cpt-frontx-constraint-mfes-router-port`). A registry built without a router runs every extension standalone and presents nothing to anyone.

Out of scope here: the router port's member contract, the occupant-value rendezvous, and the history intent (specified by `cpt-frontx-feature-mfe-host-communication`), and the settled-action report made from a domain's mount and unmount handler path (specified by `cpt-frontx-feature-extension-domain-governance`).

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-fr-ui-framework-agnostic`

**Principles**: `cpt-frontx-principle-agnostic-core`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Integrates MFEs into a host application by registering domains and extensions through the registry façade, optionally injecting a router at the factory |

### 1.4 References

- **PRD**: [PRD.md](../../../../../architecture/PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR 0003**: [ADR/0003-mfe-runtime-public-surface.md](../../../../../architecture/ADR/0003-mfe-runtime-public-surface.md)
- **ADR 0006**: [ADR/0006-mfe-handler-resolution.md](../../../../../architecture/ADR/0006-mfe-handler-resolution.md)
- **ADR 0036**: [ADR/0036-extension-routing-port.md](../../../../../architecture/ADR/0036-extension-routing-port.md)
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
- Developer registers a domain and a conforming extension; the extension passes type validation and domain contract matching, is admitted by the injected router where one is present, is loaded on demand, and mounts under the domain's mount strategy through a `mount_ext` actions chain.
- Developer builds the registry without a router; the same registrations and mounts run standalone and nothing is presented or reported to anyone.

**Error Scenarios**:
- Extension entry type validation fails — the registry rejects the extension and it is not placed into its extension domain.
- No registered handler matches the extension's declared base type — the registry rejects with a handler-not-found error.
- Domain contract matching fails — the extension is rejected before load.
- The domain or extension id is already registered — the registry rejects the registration before anything is changed or presented to a router, and the registered domain or extension is left unchanged.
- The injected router rejects a domain or extension registration (for example, a routed-domain route that collides with another routed domain live in the page) — the registry rejects with the router's error and nothing of that registration is left in the registry.

**Steps**:
1. [ ] - `p1` - Developer obtains a registry instance by calling `createMfeRegistryFactory().build` with an injected `TypeSystemPlugin` and, optionally, a router implementing the router port - `inst-flow-rvm-01`
2. [ ] - `p1` - Developer calls `registry.registerDomain` with an `ExtensionDomain` declaration and an `ExtensionDomainImplementationFactory` - `inst-flow-rvm-02`
3. [ ] - `p1` - Registry checks that the domain id is not already registered, then synchronously constructs the domain implementation via the factory; the domain declaration is validated and registered through `typeSystem.register` only after the router admits it (step 5), or directly when no router is injected - `inst-flow-rvm-03`
4. [ ] - `p1` - **IF** the domain id is already registered **THEN** registry throws before anything is changed or presented to a router, the already-registered domain is left unchanged, and the flow ends; **IF** constructing the domain implementation fails **THEN** registry throws before presenting anything to a router, nothing of this call is registered, and the flow ends; **IF** `typeSystem.register` fails **THEN** registry releases the router admission, if any, throws a `DomainValidationError`, nothing of this call is left registered, and the flow ends - `inst-flow-rvm-04`
5. [x] - `p1` - **IF** a router is injected, the registry presents the domain declaration to it before the domain becomes durable (`cpt-frontx-algo-mfe-registry-router-admission`) - `inst-flow-rvm-router-domain`
   1. [x] - `p1` - **IF** the router rejects the domain, the registry throws the router's error, the domain is left registered nowhere in the registry, and the flow ends - `inst-flow-rvm-router-domain-reject`
6. [x] - `p1` - Developer calls `registry.registerExtension` with an `Extension` value; **IF** the extension id is already registered, registry throws before anything is changed or presented to a router, the registered extension is left unchanged, and the flow ends - `inst-flow-rvm-05`
7. [ ] - `p1` - Registry invokes handler resolution: **FOR EACH** registered handler ordered by descending priority, evaluate `typeSystem.isTypeOf(extension.entry.typeId, handler.handledBaseTypeId)` - `inst-flow-rvm-06`
   1. [ ] - `p1` - **IF** `isTypeOf` returns true, select this handler and stop evaluation - `inst-flow-rvm-06a`
8. [ ] - `p1` - **IF** no handler matched, registry rejects the extension and flow ends - `inst-flow-rvm-07`
9. [ ] - `p1` - Registry validates the extension's entry against its domain contract and checks cardinality - `inst-flow-rvm-08`
10. [ ] - `p1` - **IF** contract matching or cardinality check fails, registry rejects the extension and flow ends - `inst-flow-rvm-09`
11. [x] - `p1` - **IF** a router is injected, the registry presents the admitted extension declaration to it before the extension becomes durable (`cpt-frontx-algo-mfe-registry-router-admission`) - `inst-flow-rvm-router-extension`
    1. [x] - `p1` - **IF** the router rejects the extension, the registry rejects with the router's error, the extension is left registered nowhere in the registry, and the flow ends - `inst-flow-rvm-router-extension-reject`
12. [ ] - `p1` - Registry marks the extension as `ADMITTED` and stores the resolved handler reference - `inst-flow-rvm-10`
13. [ ] - `p1` - On a load trigger, the registry initiates the extension's load through the actions-chain lifecycle — a load action (`FRONTX_ACTION_LOAD_EXT`) targeting the extension's domain and keyed by the extension instance ID is executed via the mediator, which dispatches it to the domain's load handler (load mechanics owned by F5) - `inst-flow-rvm-11`
14. [ ] - `p1` - A mount is requested only as a `mount_ext` actions chain (`FRONTX_ACTION_MOUNT_EXT`), restoration and opening included, executed through the same actions-chain mechanism; the extension mounts under its domain's mount strategy and the registry marks it `MOUNTED` (mount-strategy mechanics and the settled-action report owned by F7; the occupant value handed to the extension at mount owned by `cpt-frontx-feature-mfe-host-communication`) - `inst-flow-rvm-12`
15. [ ] - `p1` - **RETURN** occupant active in domain - `inst-flow-rvm-13`

### Build Registry via Factory

- [x] `p2` - **ID**: `cpt-frontx-flow-mfe-registry-factory-build`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- First call creates and caches a registry instance bound to the supplied `TypeSystemPlugin` and to the supplied router, or to no router when none is supplied.
- Subsequent calls with the same plugin and the same router — or the same plugin and again no router — return the cached instance.

**Error Scenarios**:
- Subsequent call supplies a different `TypeSystemPlugin` — factory throws a configuration mismatch error.
- Subsequent call supplies a different router, supplies a router after the first build supplied none, or omits the router after the first build supplied one — factory throws a configuration mismatch error.

**Steps**:
1. [x] - `p1` - Developer creates the factory the composition root owns by calling `createMfeRegistryFactory()`, the package's sole creation path - `inst-flow-fb-create`
2. [x] - `p1` - Developer calls `build` on that factory with an `MfeRegistryConfig` containing a `TypeSystemPlugin` in `typeSystem` and, optionally, a router implementing the router port in `router` - `inst-flow-fb-01`
3. [x] - `p1` - **IF** a cached instance already exists, validate that the supplied plugin is the one the cached instance was built with and that the supplied router is the one it was built with, absence included: the snapshot is compared by identity, and an absent router matches only an absent router - `inst-flow-fb-02`
   1. [x] - `p1` - **IF** the plugin differs, or the router differs, or the router's presence differs, throw a configuration mismatch error naming which of the two differs and **RETURN** - `inst-flow-fb-02a`
   2. [x] - `p1` - **IF** both match, **RETURN** cached instance - `inst-flow-fb-02b`
4. [x] - `p1` - Create a new registry implementation bound to the supplied `TypeSystemPlugin` and to the supplied router or to no router, cache it alongside a snapshot of that plugin and that router taken from the configuration rather than the caller's configuration object itself, and **RETURN** the new instance - `inst-flow-fb-03`
5. [x] - `p1` - **IF** no router was supplied, the registry runs standalone for its whole life: it presents no registration, sends no release notification, assigns no occupant value, and reports no settled action to anyone - `inst-flow-fb-standalone`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly.

### Handler Resolution by Declared Base Type

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-handler-resolution`

**Input**: `entryTypeId` (the declared type identifier of an `MfeEntry`), ordered list of registered `MfeHandler` instances sorted by descending priority

**Output**: The matched `MfeHandler`, or a resolution failure

**Steps**:
1. [x] - `p1` - Supply the registry's injected `TypeSystemPlugin` to each handler as it is registered, so a handler the developer constructed before any registry existed can resolve the references its own load path owns; matching itself stays with the registry - `inst-algo-hr-attach-type-system`
2. [x] - `p1` - Sort the registered handler list by descending `handler.priority` — handlers with equal priority retain insertion order - `inst-algo-hr-01`
3. [ ] - `p1` - **FOR EACH** handler in sorted order - `inst-algo-hr-02`
   1. [ ] - `p1` - Evaluate `typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)` through the injected `TypeSystemPlugin` - `inst-algo-hr-02a`
   2. [x] - `p1` - **IF** `isTypeOf` returns true, **RETURN** this handler as the match — stop iterating - `inst-algo-hr-02b`
4. [x] - `p1` - **IF** no handler matched after iterating all handlers, **RETURN** resolution failure indicating no registered handler covers the given entry type - `inst-algo-hr-03`

### Extension Registration and Entry Storage

- [ ] `p2` - **ID**: `cpt-frontx-algo-mfe-registry-register-extension`

**Input**: `Extension` value containing an `MfeEntry` with a declared `typeId`

**Output**: Registration outcome (success or rejection with reason)

**Steps**:
1. [ ] - `p1` - Validate the extension's entry via `typeSystem` against the registered type schemas - `inst-algo-re-01`
2. [ ] - `p1` - **IF** validation fails, **RETURN** rejection with the validation error - `inst-algo-re-02`
3. [ ] - `p1` - Invoke handler resolution (see `cpt-frontx-algo-mfe-registry-handler-resolution`) with the entry's `typeId` - `inst-algo-re-03`
4. [ ] - `p1` - **IF** resolution fails, **RETURN** rejection with a handler-not-found error - `inst-algo-re-04`
5. [x] - `p1` - **IF** a router is injected, present the extension to it (`inst-algo-ra-present-extension` in `cpt-frontx-algo-mfe-registry-router-admission`) after every check above and before the storage below - `inst-algo-re-router-admit`
   1. [x] - `p1` - **IF** the router rejects the extension, **RETURN** rejection with the router's error, leaving nothing stored - `inst-algo-re-router-reject`
6. [x] - `p1` - Store the extension in the registry's internal map keyed by `extension.id`, associating it with the resolved handler - `inst-algo-re-05`
7. [ ] - `p1` - Notify the extension's target domain that a new extension has been registered - `inst-algo-re-06`
8. [ ] - `p1` - **RETURN** success - `inst-algo-re-07`

### Router Admission and Release Notifications

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-router-admission`

**Input**: A domain registration, an extension registration, an extension or domain unregistration, or the terminal disposal of the registry; the router snapshotted by the factory, or no router

**Output**: For a registration — admitted (the registration proceeds to become durable) or rejected with the router's error (nothing of it is left in the registry). For an unregistration or disposal — the release notifications that free what the router admitted, and no settled-action report

**Steps**:
1. [x] - `p1` - **IF** the registry was built with no router, skip every step below: no registration is presented, no release notification is sent, and the registry's own registration, unregistration, and disposal behaviour is otherwise unchanged - `inst-algo-ra-standalone`
2. [x] - `p1` - On domain registration, once the runtime's own non-persisting checks have passed — lifecycle-hook validation, construction of the domain implementation, and the strategy and cardinality cross-validation (`cpt-frontx-algo-extension-domain-governance-strategy-cardinality`) — present the declaration to the router through `registerDomain(domain)`; the domain's own type-system validation and registration (`typeSystem.register`, which the underlying type-system provider cannot run without also persisting the instance) runs only after the router admits it, immediately before its handlers are persisted to the mediator, its implementation is recorded, its advertisement is propagated, or its `init` stage is triggered — so a router rejection leaves the domain registered with the type system nowhere either, not merely absent from the registry's own map - `inst-algo-ra-present-domain`
   1. [x] - `p1` - **IF** `registerDomain` throws, reject the registration with the router's error unchanged, leaving no type-system registration, no mediator-persisted handlers, no recorded implementation, no advertisement, and no `init` trigger behind; no release notification is sent for a registration the router did not admit - `inst-algo-ra-domain-rejected`
   2. [x] - `p1` - **IF** the router admits but the domain's own subsequent `typeSystem.register` throws (an invalid declaration), release the router admission through `releaseDomain(domainId)` before rolling the registration back, substituting a `DomainValidationError` naming the domain for the router's own error, since the router already admitted and the rejection is this method's own, not the router's; the released admission leaves the router able to admit a corrected retry under the same domain id; a throw from this release is logged and never lets the `DomainValidationError` be lost - `inst-domain-type-register`
3. [x] - `p1` - On extension registration, once the runtime's own non-persisting checks have passed — the target domain being registered, subset-rule contract matching, extension-type validation, lifecycle-hook validation, and handler coverage of the entry's type — present the declaration to the router through `registerExtension(extension)`; the extension's own type-system validation and registration (`typeSystem.register`, which the underlying type-system provider cannot run without also persisting the instance) runs only after the router admits it, immediately before the extension's state is stored, its `init` stage is triggered, or its advertisement is propagated — so a router rejection leaves the extension registered with the type system nowhere either, not merely absent from the registry's own map - `inst-algo-ra-present-extension`
   1. [x] - `p1` - **IF** `registerExtension` throws, reject the registration with the router's error unchanged, leaving no type-system registration, no extension state, no package tracking, no advertisement, and no `init` trigger behind; no release notification is sent for a registration the router did not admit - `inst-algo-ra-extension-rejected`
   2. [x] - `p1` - **IF** the router admits but the extension's own subsequent `typeSystem.register` throws (an invalid declaration), release the router admission through `releaseExtension(extensionId)` before rethrowing the type-system's error unchanged, leaving no extension state, no package tracking, no advertisement, and no `init` trigger behind; the released admission leaves the router able to admit a corrected retry under the same extension id; a throw from this release is logged and never masks the type-system error being rethrown - `inst-extension-type-register`
4. [x] - `p1` - The runtime derives no routing token, validates no route name, and checks no route uniqueness: a domain's or extension's declared `route` is carried uninterpreted inside the declaration presented to the router, which owns routing identity and the page-wide uniqueness of routed-domain routes - `inst-algo-ra-no-routing-grammar`
5. [x] - `p1` - On unregistration of an extension the router admitted, once the extension has been removed — after its unmount when it was mounted (`inst-state-el-09`), its `destroyed` stage, and the release of its bridge pair — send `releaseExtension(extensionId)` - `inst-algo-ra-release-extension`
6. [x] - `p1` - On unregistration of a domain the router admitted, each extension it holds is released through step 5 as the domain's unregistration unregisters it, and once the domain itself has been removed, send `releaseDomain(domainId)` - `inst-algo-ra-release-domain`
7. [x] - `p1` - On terminal disposal of the registry, send `releaseExtension` for every extension and then `releaseDomain` for every domain the router admitted and the registry still holds, before the registry clears its own state - `inst-algo-ra-release-on-dispose`
8. [x] - `p1` - **IF** a release notification throws, log a diagnostic naming the extension or domain and continue the unregistration or disposal; a release is resource cleanup and is never refused - `inst-algo-ra-release-failure`
9. [x] - `p1` - Unregistration and terminal disposal are resource cleanup, not occupancy actions: the physical releases they perform dispatch no `unmount_ext`, send no settled-action report, and so give the router no occupancy action to reflect into the URL - `inst-algo-ra-cleanup-no-report`
10. [x] - `p1` - **RETURN** the admission outcome for a registration, or nothing for an unregistration or disposal - `inst-algo-ra-return`

### Domain Unregistration Closes Extension Registration

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission`

**Input**: A domain id undergoing `unregisterDomain`; a concurrent `registerExtension` call naming that same domain

**Output**: Every extension the domain holds at the start of unregistration is drained; a `registerExtension` call that names the domain is rejected from the moment unregistration begins until the domain id is free to be reused

**Steps**:
1. [x] - `p1` - Mark the domain id closed to new extension registration as the first action of `unregisterDomain`, before draining its current membership or querying it even once - `inst-algo-du-close-first`
2. [x] - `p1` - **WHILE** the domain remains closed, **IF** `registerExtension` names this domain id, reject immediately with a domain-unregistering error, before the target domain's presence is otherwise checked and before the type system, router, or any other admission check runs - `inst-algo-du-reject-registration`
3. [x] - `p1` - Drain the domain's current extension membership by re-querying it after each pass: closing the domain to new registrations first means a later pass can only ever find fewer live extensions than an earlier one, never more, so the drain is guaranteed to terminate once every extension present at close time (and none admitted after) has been unregistered - `inst-algo-du-drain-bounded`
4. [x] - `p1` - Once the domain itself has been removed from the registry, clear the closed marking for this domain id so the id can be registered again as a fresh domain - `inst-algo-du-reopen`
5. [x] - `p1` - The closed marking is cleared even if draining or domain removal throws, so a failed unregistration never leaves the domain id permanently unregistrable; when the unregistration fails and the domain stays registered, its occupancy queue accepts requests again, and a pending request already failed when the queue closed stays failed - `inst-algo-du-reopen-on-failure`

### Non-Blocking Lifecycle Stage Triggering

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`

**Input**: An entity (`Extension` or `ExtensionDomain`) undergoing a runtime transition, and the lifecycle stage that accompanies it.

**Output**: The stage's hooks' actions chains are handed to `executeActionsChain`; the accompanying transition proceeds without regard to them.

**Steps**:
1. [x] - `p1` - There are exactly five automatic trigger sites, each accompanying one runtime transition: `init` alongside extension registration, `activated` alongside extension mount, `deactivated` alongside extension unmount, `destroyed` alongside extension unregistration, and the domain's own `destroyed` alongside domain unregistration - `inst-algo-lst-sites`
2. [x] - `p1` - **FOR** the stage being triggered, collect the entity's hooks whose declared stage matches, in declaration order - `inst-algo-lst-collect`
3. [x] - `p1` - **FOR EACH** collected hook, in declaration order, hand its actions chain to `executeActionsChain` without awaiting it - `inst-algo-lst-dispatch-order`
   1. [x] - `p1` - Declaration order governs dispatch order only; completion order among a stage's hooks is explicitly not guaranteed and **MUST NOT** be assumed by any caller or test - `inst-algo-lst-no-completion-order`
4. [x] - `p1` - The triggering operation and the per-domain trigger facade a domain implementation reaches through its runtime context both yield nothing an emitter or domain author can await for chain execution, consistent with `cpt-frontx-constraint-mfes-recursive-chain-execution` - `inst-algo-lst-non-awaitable`
5. [x] - `p1` - **RETURN** once every collected hook's chain has been handed to `executeActionsChain`; the accompanying runtime transition proceeds independently of this return - `inst-algo-lst-return-non-blocking`

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
5. [ ] - `p1` - **FROM** HANDLER_RESOLVED **TO** ADMITTED **WHEN** domain contract matching succeeds, cardinality allows the occupant, and, where a router is injected, the router admits the registration - `inst-state-el-05`
6. [ ] - `p1` - **FROM** HANDLER_RESOLVED **TO** REJECTED **WHEN** domain contract matching fails, cardinality is exceeded, or the injected router rejects the registration - `inst-state-el-06`
7. [ ] - `p1` - **FROM** ADMITTED **TO** MOUNTED **WHEN** `handler.load` completes and the lifecycle is mounted under the domain's mount strategy - `inst-state-el-07`
8. [ ] - `p1` - **FROM** ADMITTED **TO** REJECTED **WHEN** `handler.load` fails or mount fails - `inst-state-el-08`
9. [x] - `p1` - **FROM** MOUNTED **TO** UNREGISTERED **WHEN** `unregisterExtension` is called — the extension is first unmounted exactly as an ordinary unmount unmounts it, which includes destroying its container once through the container hooks of the mount strategy that created it; only after that unmount has settled is the extension's `destroyed` lifecycle stage triggered, and only then is the extension removed from the registry - `inst-state-el-09`
10. [x] - `p1` - The MOUNTED → UNREGISTERED transition is resource cleanup, not an occupancy action: the unmount it performs dispatches no `unmount_ext` and sends no settled-action report, so it has no effect on the URL; once the extension is removed, a router that admitted it receives its release notification (`inst-algo-ra-release-extension`) - `inst-state-el-10`

### Factory Cache Lifecycle

- [x] `p2` - **ID**: `cpt-frontx-state-mfe-registry-factory-cache`

**States**: EMPTY, CACHED

**Initial State**: EMPTY

**Transitions**:
1. [x] - `p1` - **FROM** EMPTY **TO** CACHED **WHEN** `build` is called for the first time and a new registry instance is created and stored alongside the snapshot of its plugin and of its router, or of the router's absence - `inst-state-fc-01`
2. [x] - `p1` - **FROM** CACHED **TO** CACHED **WHEN** `build` is called again with the same plugin and the same router, or the same plugin and again no router — returns the existing instance - `inst-state-fc-02`
3. [x] - `p1` - **FROM** CACHED **TO** CACHED **WHEN** `build` is called again with a different plugin, a different router, or a change in the router's presence — the call throws a configuration mismatch error and the cached instance and its snapshot stay unchanged - `inst-state-fc-03`

## 5. Definitions of Done

### Registry Facade Contract

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-registry-contract`

The system **MUST** expose the abstract `MfeRegistry` as the sole public runtime contract, obtainable only through `createMfeRegistryFactory().build({ typeSystem, router })` with `router` optional, with the concrete implementation and internal coordination machinery remaining inaccessible to consumers. The router port adds no member to `MfeRegistry`.

**Implements**:
- `cpt-frontx-flow-mfe-registry-factory-build`

**Touches**:
- Entities: `MfeEntry`, `Extension`
- Interface: `cpt-frontx-interface-mfe-runtime`
- Component: `cpt-frontx-component-mfe-runtime`

### Optional Router in the Factory Configuration

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-router-configuration`

The system **MUST** accept an optional `router` field in `MfeRegistryConfig`, beside `typeSystem`, typed as the router port the package declares (`cpt-frontx-dod-mfe-host-communication-router-port-contract`). The factory **MUST** snapshot both the plugin and the router — or the router's absence — on its first build and **MUST** throw a configuration mismatch error on a later build that supplies a different plugin, a different router, a router after initially omitting one, or no router after initially supplying one, leaving the cached instance unchanged. A registry built with no router **MUST** run every extension standalone: it presents no registration, sends no release notification, assigns no occupant value, and reports no settled action.

**Implements**:
- `cpt-frontx-flow-mfe-registry-factory-build`
- `cpt-frontx-state-mfe-registry-factory-cache`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`

**Touches**:
- Entities: Router port
- Interface: `cpt-frontx-interface-mfe-runtime`, `cpt-frontx-mfes-interface-router-port`
- Component: `cpt-frontx-component-mfe-runtime`

### Router Admission Before Durable Registration, Release at Cleanup

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-router-admission`

The system **MUST**, where a router is injected, present each domain and each extension registration to it through `registerDomain` and `registerExtension` after the runtime's own checks pass and before the registration becomes durable, and **MUST** leave a registration the router rejects registered nowhere in the registry — including with the type system, whose own registration of the entity is likewise deferred until after the router admits — throwing the router's error to the caller unchanged — no partial admission. The runtime **MUST NOT** derive a routing token, validate a route name, or check route uniqueness: a declared `route` is carried uninterpreted. The system **MUST** send `releaseExtension` when an admitted extension is unregistered, `releaseDomain` when an admitted domain is unregistered, and both for every admitted extension and domain at terminal disposal, and a release that throws **MUST** be logged without stopping the cleanup. Unregistering a mounted extension **MUST** keep unmounting it before destroying its container, and unregistration and disposal **MUST** send no settled-action report. A domain being unregistered **MUST** be closed to new `registerExtension` calls naming it from the start of its unregistration, so a registration racing the final drain pass can never be admitted against a domain state that is then removed.

**Implements**:
- `cpt-frontx-algo-mfe-registry-router-admission`
- `cpt-frontx-algo-mfe-registry-register-extension`
- `cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission`
- `cpt-frontx-flow-mfe-registry-register-validate-mount`
- `cpt-frontx-state-mfe-registry-entry-lifecycle`

**Constraints**: `cpt-frontx-constraint-mfes-router-port`

**Touches**:
- Entities: `Extension`, `ExtensionDomain`, Router port
- Component: `cpt-frontx-component-mfe-runtime`
- Sequence: `cpt-frontx-seq-mfe-register-validate-mount`

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

The system **MUST** own and orchestrate the complete register → type-validate → handler-resolve → domain-admit → router-admit (where a router is injected) → load-on-demand → mount sequence, rejecting any extension whose type validation, domain contract matching, or router admission fails before loading occurs, and requesting every mount through a `mount_ext` actions chain.

**Implements**:
- `cpt-frontx-flow-mfe-registry-register-validate-mount`
- `cpt-frontx-algo-mfe-registry-register-extension`

**Touches**:
- Entities: `MfeEntry`, `Extension`
- Component: `cpt-frontx-component-mfe-runtime`
- Sequence: `cpt-frontx-seq-mfe-register-validate-mount`

### Non-Blocking Lifecycle Stage Triggering

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-lifecycle-stage-triggering`

The system **MUST** trigger the `init`, `activated`, `deactivated`, `destroyed` (extension), and `destroyed` (domain's own) lifecycle stages as non-blocking notifications accompanying their respective transitions — the accompanying transition **MUST NOT** await any stage's dispatched chains, and neither the triggering operation nor the per-domain trigger facade a domain implementation reaches through its runtime context **MUST** yield anything an emitter or domain author can await for chain execution.

**Implements**:
- `cpt-frontx-algo-mfe-registry-lifecycle-stage-triggering`

**Constraints**: `cpt-frontx-constraint-mfes-recursive-chain-execution`

**Touches**:
- Entities: `MfeEntry`, `Extension`, `ExtensionDomain`
- Component: `cpt-frontx-component-mfe-runtime`

### Type Contracts

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-type-contracts`

The system **MUST** define the `MfeHandler` abstract class with `handledBaseTypeId`, `priority`, `bridgeFactory`, `load(entry, extensionId)`, and a registration-time `attachTypeSystem(typeSystem)` the base class implements for every handler — and MUST NOT include any `canHandle`-style self-selection method on the handler. Type matching **MUST** remain the registry's, evaluated against `handledBaseTypeId`; the plugin a handler receives **MUST** serve only the references its own load path owns, and registration **MUST** be the sole channel by which a handler obtains one. A handler **MUST** bind to a single plugin for its lifetime: re-attaching the plugin it already holds is a no-op, and attaching a different one **MUST** be refused rather than swapped in, since the handler's own caches are keyed by extension and manifest id alone and cannot tell the two plugins' answers apart.

**Implements**:
- `cpt-frontx-algo-mfe-registry-handler-resolution`

**Touches**:
- Entities: `MfeEntry`
- Component: `cpt-frontx-component-mfe-runtime`

## 6. Acceptance Criteria

- [x] The abstract `MfeRegistry` is the only exported public runtime contract; consumers obtain instances via `createMfeRegistryFactory().build({ typeSystem, router })`, with `router` optional and no router-related member on `MfeRegistry`.
- [x] Handler resolution uses `typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)` exclusively — no type-format string literals appear in the registry's resolution logic.
- [x] `MfeHandler` declares `handledBaseTypeId`, `priority`, `bridgeFactory`, `load`, and `attachTypeSystem` — no self-selection predicate.
- [x] A handler constructed with no type system and passed to the registry through `mfeHandlers` resolves its own type-system-owned references after registration, with no change at the construction site.
- [x] The factory-with-cache pattern returns the same instance on repeated calls with matching configuration, and throws on configuration mismatch.
- [x] A second build with a different router, with a router after initially omitting one, or omitting a router after initially supplying one throws a configuration mismatch error; a second build with the same plugin and the same router, or the same plugin and again no router, returns the cached instance.
- [x] A registry built with no router registers, mounts, and unmounts extensions and nothing is presented, released, assigned, or reported to any router.
- [x] An extension whose type validation fails is rejected without being placed into its extension domain.
- [x] An extension with no matching handler is rejected with a handler-not-found error.
- [x] With a router test double injected, every domain and extension registration is presented to it after the runtime's own checks pass and before the registration is durable; a registration the double rejects throws the double's error unchanged and leaves no domain or extension state, no handler, no advertisement, and no `init` trigger in the registry.
- [ ] A domain and an extension that declare a `route` are presented to the router with that `route` unchanged; the runtime itself rejects no registration for the shape or uniqueness of a route.
- [x] Unregistering an admitted extension sends `releaseExtension` for it, unregistering an admitted domain sends `releaseExtension` for each of its extensions and then `releaseDomain`, and disposing the registry sends both for every admitted extension and domain; a release that throws is logged and the cleanup completes.
- [x] Unregistering a mounted extension unmounts it, then destroys its container once, then removes it, and sends no settled-action report to the router.
- [ ] The `MfeEntry` state machine (UNREGISTERED → REGISTERED → HANDLER_RESOLVED → ADMITTED → MOUNTED / REJECTED) is honored by the runtime.
