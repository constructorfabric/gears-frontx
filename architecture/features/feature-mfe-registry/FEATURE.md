# Feature: MFE Registry & Contracts

<!-- artifact-version: 1.8 -->


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Register Extension Domain](#register-extension-domain)
  - [Register Extension at Runtime](#register-extension-at-runtime)
  - [Unregister Extension](#unregister-extension)
  - [Unregister Domain](#unregister-domain)
  - [Execute Actions Chain](#execute-actions-chain)
  - [Register Extension Action Handler](#register-extension-action-handler)
  - [Update Shared Property](#update-shared-property)
  - [Query Registry State](#query-registry-state)
  - [Build Registry via Factory](#build-registry-via-factory)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Extension Registration Validation Pipeline](#extension-registration-validation-pipeline)
  - [Domain Registration Validation](#domain-registration-validation)
  - [Contract Matching](#contract-matching)
  - [Extension Type Hierarchy Validation](#extension-type-hierarchy-validation)
  - [Shared Property GTS Validation and Broadcast](#shared-property-gts-validation-and-broadcast)
  - [GTS Package Auto-Discovery](#gts-package-auto-discovery)
  - [Entry Type Handler Resolution](#entry-type-handler-resolution)
  - [Operation Serialization](#operation-serialization)
  - [Domain Implementation Construction with Encapsulation Enforcement](#domain-implementation-construction-with-encapsulation-enforcement)
  - [Strategy/Action Cross-Validation Matrix](#strategyaction-cross-validation-matrix)
  - [Concurrent Mount Strategy](#concurrent-mount-strategy)
  - [Optional Mount Strategy](#optional-mount-strategy)
  - [Exclusive Mount Strategy](#exclusive-mount-strategy)
- [4. States (CDSL)](#4-states-cdsl)
  - [Extension Load State](#extension-load-state)
  - [Extension Mount State](#extension-mount-state)
  - [Registry Factory Cache State](#registry-factory-cache-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [MfeRegistry Public Contract](#mferegistry-public-contract)
  - [MFE Type Contracts](#mfe-type-contracts)
  - [GTS-Based Validation](#gts-based-validation)
  - [MFE Schema Registration](#mfe-schema-registration)
  - [MfManifest GTS Schema and Type Update](#mfmanifest-gts-schema-and-type-update)
  - [Shared Property Broadcast](#shared-property-broadcast)
  - [MFE Handler Injection](#mfe-handler-injection)
  - [ActionsChainsMediator Contract](#actionschainsmediator-contract)
  - [Mount Strategy and Mounter Contracts](#mount-strategy-and-mounter-contracts)
  - [DomainLifecycleTrigger Contract](#domainlifecycletrigger-contract)
  - [TypeSystemPlugin Interface](#typesystemplugin-interface)
  - [Factory-with-Cache Pattern](#factory-with-cache-pattern)
  - [Layer and Build Constraints](#layer-and-build-constraints)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-mfe-registry`

- [x] `p2` - `cpt-frontx-feature-mfe-registry`
---

## 1. Feature Context

### 1.1 Overview

The MFE Registry & Contracts feature provides the foundational contract layer between host applications and microfrontend extensions in FrontX. It defines all TypeScript type contracts for the MFE type system, implements the `MfeRegistry` runtime facade, and manages the lifecycle of extension domains and extensions through a GTS-validated registration pipeline.

The feature is a pure TypeScript L1 SDK package (`@cyberfabric/screensets`) with zero `@cyberfabric/*` inter-dependencies. It exports abstract classes (`MfeRegistry`, `MfeRegistryFactory`, `MfeHandler`, `MfeBridgeFactory`), all MFE TypeScript interfaces, action/property constants, and the `TypeSystemPlugin` interface that decouples the registry from any specific type system implementation.

The registry acts as the central runtime authority: it owns domain and extension state, enforces multi-step validation on registration, serializes concurrent operations per entity, mediates action chain execution, and manages the parent/child MFE bridge lifecycle.

### 1.2 Purpose

Enable host applications and microfrontend extensions to communicate through declared contracts validated at runtime, while keeping the registry itself free of any React, framework, or type-system implementation dependencies.

Success criteria: A host application can register a domain and extension, execute actions chains, broadcast shared properties, and dispose the registry — all without importing anything beyond `@cyberfabric/screensets`.

### 1.3 Actors

- `cpt-frontx-actor-developer`
- `cpt-frontx-actor-host-app`
- `cpt-frontx-actor-microfrontend`
- `cpt-frontx-actor-gts-plugin`
- `cpt-frontx-actor-framework-plugin`
- `cpt-frontx-actor-build-system`
- `cpt-frontx-actor-runtime`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — section 2.2
- Component: `cpt-frontx-component-screensets`
- Design principle: `cpt-frontx-principle-self-registering-registries`
- Design constraint: `cpt-frontx-constraint-no-react-below-l3`
- Design constraint: `cpt-frontx-constraint-zero-cross-deps-at-l1`
- Design constraint: `cpt-frontx-constraint-no-barrel-exports-for-registries`
- ADR: `cpt-frontx-adr-domain-implementation-mount-strategies` — domain implementation as composable behavior class with mount strategies and encapsulated mounter (issue cyberfabric/frontx#278)
- ADR: `cpt-frontx-adr-per-action-type-handler-routing`

#### Non-Applicable Domains

- **OPS**: Client-side library, no server deployment
- **COMPL**: No regulatory data handling
- **UX**: Infrastructure capability, no direct user interface
- **DATA**: No database persistence
- **INT**: No external service integrations
- **BIZ**: Infrastructure capability; business value derived transitively
- **PERF**: No hot code paths beyond validation (sub-millisecond operations)
- **MAINT**: No formal SLA or support tier — maintained under FrontX iterative development model
- **SEC**: No authentication or authorization implementation; security concerns (input validation, schema enforcement) are addressed through GTS validation already covered by `cpt-frontx-nfr-sec-type-validation`

---

## 2. Actor Flows (CDSL)

### Register Extension Domain

- [ ] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-register-domain`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-gts-plugin`

1. - [x] `p1` - Host app obtains a `MfeRegistry` instance via `mfeRegistryFactory.build(config)` - `inst-obtain-registry`
2. - [ ] `p1` - Host app calls `registry.registerDomain(declaration, factory)` where `declaration: ExtensionDomain` is the GTS-validated declaration and `factory: ExtensionDomainImplementationFactory` is a concrete subclass of the abstract `ExtensionDomainImplementationFactory` class. The factory's `build(ctx: DomainContext): ExtensionDomainImplementation` method returns synchronously; the synchronous return type enforces synchronous construction at the type level — no runtime check is required - `inst-call-register-domain`
3. - [x] `p1` - Registry runs `cpt-frontx-algo-mfe-registry-domain-validation` — IF GTS validation fails the underlying `typeSystem.register(declaration)` call throws with a rich diagnostic message (instance JSON, resolved schema JSON, failure reason); IF a lifecycle hook references an unsupported stage RETURN `UnsupportedLifecycleStageError` - `inst-run-domain-validation`
4. - [ ] `p1` - Registry constructs a `DefaultExtensionMounter` for the domain (composes the per-domain mount-set state owned by the registry and the resolved `MfeHandler` chain) plus a per-domain `DefaultDomainLifecycleTrigger` instance - `inst-build-mounter`
5. - [ ] `p1` - Registry runs `cpt-frontx-algo-mfe-registry-domain-implementation-construction` — builds `DomainContext` (carrying `mounter`, `lifecycleTrigger`, and `registerHandler`), invokes `factory.build(ctx)`, captures the `ExtensionDomainImplementation` instance, and invalidates `ctx` in a `finally` block so subsequent `ctx.mounter`, `ctx.lifecycleTrigger`, or `ctx.registerHandler` access — including any captured function handle — throws. **IF** `factory.build` throws after one or more `ctx.registerHandler` calls succeeded **THEN** the registry rolls back all registrations performed during the call (no handlers are persisted to the mediator, no domain state is stored) and rethrows the original error - `inst-construct-implementation`
6. - [ ] `p1` - Registry cross-validates handlers vs declaration AND strategy/cardinality matrix per `cpt-frontx-algo-mfe-registry-cross-validate-handlers` — every action type listed in `declaration.actions` must have a handler registered via `ctx.registerHandler` during construction; any handler registered for an action type not listed in `declaration.actions` is rejected; the strategy/action matrix is enforced strictly (`ConcurrentMountStrategy` and `OptionalMountStrategy` both REQUIRE `mount_ext` AND `unmount_ext`; `ExclusiveMountStrategy` REQUIRES `mount_ext` and FORBIDS `unmount_ext`). Validation runs after factory construction and before the registry persists registration state - `inst-cross-validate-handlers`
7. - [ ] `p1` - Registry stores domain state (properties Map, extensions Set, propertySubscribers Map, **mountedExtensions empty array (insertion-ordered) — owned by the registry as the canonical source of mount-set state**, implementation instance, mounter instance, lifecycle-trigger instance) - `inst-store-domain-state`
8. - [x] `p1` - Registry fires-and-forgets the `init` lifecycle stage for the domain; errors logged to `console.error` - `inst-trigger-domain-init`
9. - [x] `p1` - `registerDomain` returns synchronously - `inst-return-sync`

### Register Extension at Runtime

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-register-extension`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-framework-plugin`, `cpt-frontx-actor-gts-plugin`

1. - [x] `p1` - Caller invokes `await registry.registerExtension(extension)` at any point during app lifecycle - `inst-call-register-extension`
2. - [x] `p1` - Operation is serialized per `extension.id` via `OperationSerializer` — concurrent calls for the same extension ID are queued - `inst-serialize-per-id`
3. - [x] `p1` - Registry runs `cpt-frontx-algo-mfe-registry-extension-validation` — IF any step fails RETURN the appropriate typed error - `inst-run-extension-validation`
4. - [x] `p1` - Registry stores `ExtensionState` (bridge null, loadState `idle`, mountState `unmounted`) and adds extension to domain's extensions Set - `inst-store-extension-state`
5. - [x] `p1` - Registry runs `cpt-frontx-algo-mfe-registry-gts-package-discovery` to track GTS package; if `extension.id` is not a valid GTS ID the error is silently swallowed - `inst-track-gts-package`
6. - [x] `p1` - Registry triggers the `init` lifecycle stage for the extension - `inst-trigger-extension-init`
7. - [x] `p1` - Promise resolves when init lifecycle completes - `inst-return-resolved`

### Unregister Extension

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-unregister-extension`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-framework-plugin`

1. - [x] `p1` - Caller invokes `await registry.unregisterExtension(extensionId)` - `inst-call-unregister`
2. - [x] `p1` - Operation is serialized per `extensionId` via `OperationSerializer` - `inst-serialize-unregister`
3. - [x] `p1` - IF extension is not registered, operation is a no-op (idempotent) - `inst-idempotent-check`
4. - [x] `p1` - IF extension `mountState` is `mounted`, `MountManager.unmountExtension` is called directly (bypassing `OperationSerializer` to avoid deadlock) - `inst-auto-unmount`
5. - [x] `p1` - `destroyed` lifecycle stage is triggered for the extension - `inst-trigger-destroyed`
6. - [x] `p1` - Extension is removed from the domain's extensions Set and from the extensions Map - `inst-remove-extension`
7. - [x] `p1` - GTS package tracking is cleaned up; if the package Set is now empty, the package key is deleted - `inst-cleanup-package`
8. - [x] `p1` - Promise resolves when all steps complete - `inst-return-complete`

### Unregister Domain

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-unregister-domain`

**Actors**: `cpt-frontx-actor-host-app`

1. - [x] `p1` - Caller invokes `await registry.unregisterDomain(domainId)` - `inst-call-unregister-domain`
2. - [x] `p1` - Operation is serialized per `domainId` via `OperationSerializer` - `inst-serialize-domain-unregister`
3. - [x] `p1` - IF domain is not registered, operation is a no-op (idempotent) - `inst-domain-idempotent`
4. - [x] `p1` - All per-action-type handlers for the domain are unregistered from the mediator via `mediator.unregisterAllHandlers(domainId)` - `inst-unregister-action-handler`
5. - [x] `p1` - FOR EACH extension in the domain's extensions Set: `unregisterExtension(extensionId)` is called sequentially - `inst-cascade-unregister`
6. - [x] `p1` - `destroyed` lifecycle stage is triggered for the domain itself - `inst-trigger-domain-destroyed`
7. - [x] `p1` - Domain is removed from the domains Map - `inst-remove-domain`

### Execute Actions Chain

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-execute-chain`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`, `cpt-frontx-actor-framework-plugin`

1. - [x] `p1` - Caller invokes `await registry.executeActionsChain(chain)` - `inst-call-execute-chain`
2. - [x] `p1` - Registry delegates to `ActionsChainsMediator.executeActionsChain(chain)` - `inst-delegate-to-mediator`
3. - [x] `p1` - Mediator resolves the target domain from `chain.action.target` - `inst-resolve-target`
4. - [x] `p1` - IF target domain is not registered, the chain fails with a recorded error - `inst-target-not-found`
5. - [x] `p1` - Mediator validates the action via anonymous instance pattern: the action object (no `id` field) is registered with `typeSystem.register(action)`; the type system resolves the schema from the action's `type` field and validates against it inside `register()`; IF validation fails `register()` throws and the chain fails with a recorded error - `inst-validate-action-anonymous`
6. - [ ] `p1` - Mediator performs runtime entry declaration validation for extension-targeted actions: IF `chain.action.target` resolves to an extension (not a domain), look up the entry that owns the extension; IF `chain.action.type` is not present in the entry's `actions` array (the list of action types the entry is capable of receiving and executing), the chain fails with a recorded error `Action type '{type}' is not declared by target entry '{entryId}'`. Infrastructure lifecycle actions (`HAI3_ACTION_LOAD_EXT`, `HAI3_ACTION_MOUNT_EXT`, `HAI3_ACTION_UNMOUNT_EXT`) target domains, not extensions, and are exempt from this runtime check - `inst-validate-entry-declaration`
7. - [x] `p1` - Mediator resolves the handler by `(action.target, action.type)` pair: looks up `handlers.get(action.target)?.get(action.type)`. Domain handlers and extension handlers are stored in the same unified `Map<targetId, Map<actionTypeId, ActionHandler>>`. Since GTS schemas enforce that domain-targeted actions use domain IDs and extension-targeted actions use extension IDs, there is no overlap — an action targets exactly one handler - `inst-resolve-handler`
8. - [x] `p1` - IF a handler is found for the `(target, actionType)` pair, mediator calls `handler.handleAction(action.type, action.payload)`. IF no per-`(target, actionType)` handler is found, the mediator checks for a catch-all handler registered for the target (used for child domain forwarding). IF no handler exists at all, the action is a successful no-op - `inst-invoke-handler`
9. - [ ] `p1` - Action contract enforcement is two-layered: (1) GTS schema validation in step 5 constrains `target` via `x-gts-ref` — lifecycle action schemas restrict target to domain IDs; custom MFE action schemas restrict target to specific extension IDs; invalid targets are rejected by the type system. (2) Runtime entry declaration validation in step 6 ensures the target entry explicitly declares the action type in its `actions` array. GTS alone is insufficient — an entry may opt into only a subset of actions its domain supports, and runtime validation enforces that scoping before handler resolution - `inst-validate-extension-contract`
10. - [x] `p1` - IF action completes successfully AND `chain.next` is defined, mediator executes `chain.next` recursively - `inst-execute-next`
11. - [x] `p1` - IF action fails AND `chain.fallback` is defined, mediator executes `chain.fallback` instead - `inst-execute-fallback`
12. - [x] `p1` - IF `result.completed` is false, registry logs the error and path to `console.error` - `inst-log-chain-failure`
13. - [x] `p1` - Promise resolves when the chain execution concludes (success or exhausted fallback) - `inst-resolve-chain`

### Register Extension Action Handler

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-register-extension-handler`

**Actors**: `cpt-frontx-actor-microfrontend`, `cpt-frontx-actor-framework-plugin`

1. - [x] `p1` - Child MFE calls `bridge.registerActionHandler(actionTypeId, handler)` during mount, once per action type it wishes to handle — `handler` is an `ActionHandler` abstract class instance - `inst-call-register-handler`
2. - [x] `p1` - `ChildMfeBridge` delegates to `mediator.registerHandler(extensionId, actionTypeId, handler)` — the bridge holds `extensionId` from its construction context - `inst-bridge-delegates-to-mediator`
3. - [x] `p1` - Mediator stores the handler in the unified `handlers` map: `handlers.get(extensionId).set(actionTypeId, handler)` - `inst-store-extension-handler`
4. - [x] `p1` - When the bridge is disposed (extension unmount or unregister), mediator unregisters all handlers for `extensionId` — the entire inner map entry is removed - `inst-unregister-on-dispose`

### Update Shared Property

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-update-shared-property`

**Actors**: `cpt-frontx-actor-framework-plugin`, `cpt-frontx-actor-gts-plugin`

1. - [x] `p1` - Caller invokes `registry.updateSharedProperty(propertyId, value)` (synchronous) - `inst-call-update-property`
2. - [x] `p1` - Registry runs `cpt-frontx-algo-mfe-registry-shared-property-broadcast` - `inst-run-broadcast-algo`
3. - [x] `p1` - IF GTS validation fails, RETURN throw — no domain receives the update - `inst-throw-on-invalid`
4. - [x] `p1` - FOR EACH domain that declares `propertyId` in its `sharedProperties`: store the raw value and notify all subscribers - `inst-propagate-to-domains`

### Query Registry State

- [x] `p2` - **ID**: `cpt-frontx-flow-mfe-registry-query`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-framework-plugin`

1. - [ ] `p2` - Caller invokes any read-only method: `getExtension`, `getDomain`, `getExtensionsForDomain`, `getMountedExtensions(domainId): readonly string[]` (plural — insertion-ordered list of currently-mounted extension IDs for the domain), `getDomainProperty`, `getParentBridge`, `getRegisteredPackages`, `getExtensionsForPackage` - `inst-call-query`
2. - [x] `p2` - Registry delegates to `ExtensionManager` for extension/domain lookups, or to the `packages` Map for GTS package queries - `inst-delegate-query`
3. - [x] `p2` - Methods return the requested value or a safe default (undefined, null, or empty array) — they never throw on missing entities - `inst-return-safe-default`

### Build Registry via Factory

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-registry-factory-build`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-framework-plugin`

1. - [x] `p1` - Caller invokes `mfeRegistryFactory.build({ typeSystem, mfeHandlers? })` - `inst-call-build`
2. - [x] `p1` - IF no instance is cached: factory creates a `DefaultMfeRegistry`, caches it along with the config, and returns it - `inst-create-and-cache`
3. - [x] `p1` - IF instance is already cached AND the provided `typeSystem` differs from the cached one: RETURN throw with config mismatch message - `inst-throw-mismatch`
4. - [x] `p1` - IF instance is cached AND `typeSystem` matches: RETURN the cached instance - `inst-return-cached`
5. - [x] `p1` - IF `mfeHandlers` are provided, handlers are sorted by descending `priority` before being stored - `inst-sort-handlers`

---

## 3. Processes / Business Logic (CDSL)

### Extension Registration Validation Pipeline

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-extension-validation`

1. - [x] `p1` - `typeSystem.register(extension)` registers and schema-validates the extension in a single call; IF the instance does not conform to its GTS schema `register()` throws with a rich diagnostic message (instance JSON, resolved schema JSON, failure reason); the throw is the authoritative "invalid" signal — the caller cannot rely on the entity having been accepted, and a subsequent successful `register()` with the same deterministic id supersedes the failed attempt - `inst-register-gts`
2. - [x] `p1` - Resolve the `ExtensionDomainState` for `extension.domain` — IF domain not registered RETURN throw with descriptive message - `inst-check-domain-exists`
3. - [x] `p1` - Resolve the `MfeEntry` for `extension.entry` from existing extension states or from `typeSystem.getSchema(entryId)` — IF not found RETURN throw with descriptive message - `inst-resolve-entry`
4. - [x] `p1` - Run `cpt-frontx-algo-mfe-registry-contract-matching` — IF invalid RETURN throw with the collected contract error list - `inst-run-contract-matching`
5. - [x] `p1` - Run `cpt-frontx-algo-mfe-registry-extension-type-validation` — IF invalid RETURN throw `ExtensionTypeError` - `inst-run-type-validation`
6. - [x] `p1` - Validate lifecycle hooks reference only stages listed in `domain.extensionsLifecycleStages` — IF invalid RETURN throw `UnsupportedLifecycleStageError` - `inst-validate-lifecycle-hooks`
7. - [x] `p1` - Run `cpt-frontx-algo-mfe-registry-handler-resolution` — IF handlers are registered and none match the entry type, RETURN throw `EntryTypeNotHandledError` - `inst-validate-entry-type`

### Domain Registration Validation

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-domain-validation`

1. - [x] `p1` - `typeSystem.register(domain)` registers and schema-validates the domain in a single call; IF the instance does not conform to its GTS schema `register()` throws with a rich diagnostic message (instance JSON, resolved schema JSON, failure reason); the throw is the authoritative "invalid" signal — the caller cannot rely on the entity having been accepted, and a subsequent successful `register()` with the same deterministic id supersedes the failed attempt - `inst-register-domain-gts`
2. - [x] `p1` - Validate that all `LifecycleHook` entries in `domain.lifecycle` (if present) reference only stages listed in `domain.lifecycleStages` — IF any hook references an unsupported stage RETURN throw `UnsupportedLifecycleStageError` - `inst-validate-domain-lifecycle-hooks`

### Contract Matching

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-contract-matching`

This algorithm enforces three subset rules. All errors are collected before returning so the full set of violations is reported at once.

1. - [x] `p1` - **Rule 1 — Required properties**: FOR EACH `prop` in `entry.requiredProperties`: IF `prop` is not in `domain.sharedProperties` APPEND `missing_property` error - `inst-check-required-props`
2. - [x] `p1` - **Rule 2 — Entry supports domain-required actions** (`domain.extensionsActions ⊆ entry.actions`): FOR EACH `action` in `domain.extensionsActions`: IF `action` is not in `entry.actions` APPEND `unsupported_action` error. Rationale: `domain.extensionsActions` declares the action types an extension's entry must support to be injectable into this domain; the entry's `actions` (action types it is capable of receiving and executing) must be a superset - `inst-check-entry-actions`
3. - [x] `p1` - **Rule 3 — Domain supports entry-required actions, non-infrastructure** (`entry.domainActions ⊆ domain.actions`): FOR EACH `action` in `entry.domainActions`: IF `action` is in the infrastructure set (`gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~`, `gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~`, `gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~`) CONTINUE; IF `action` is not in `domain.actions` APPEND `unhandled_domain_action` error. Rationale: `entry.domainActions` declares the action types the parent domain must support for this entry to be injectable; the domain's `actions` (action types it is capable of receiving and executing) must be a superset - `inst-check-domain-actions`
4. - [x] `p1` - IF errors array is empty RETURN valid; ELSE RETURN invalid with collected errors - `inst-return-contract-result`

### Extension Type Hierarchy Validation

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-extension-type-validation`

Schema-level extension validation is handled by `typeSystem.register(extension)` in the extension registration pipeline (step 1 of `cpt-frontx-algo-mfe-registry-extension-validation`). This algorithm only performs the remaining type-hierarchy check against the domain's `extensionsTypeId`; it assumes the extension is already registered and schema-valid.

1. - [x] `p1` - IF `domain.extensionsTypeId` is not set RETURN (no type hierarchy requirement) - `inst-skip-if-no-type-id`
2. - [x] `p1` - `typeSystem.isTypeOf(extension.id, domain.extensionsTypeId)` — IF false THROW `ExtensionTypeError(extension.id, domain.extensionsTypeId)` - `inst-check-type-hierarchy`

### Shared Property GTS Validation and Broadcast

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-shared-property-broadcast`

1. - [x] `p1` - Collect all domains whose `sharedProperties` array includes `propertyId` — IF no domains match RETURN (silent no-op) - `inst-collect-matching-domains`
2. - [x] `p1` - Construct a deterministic ephemeral GTS instance ID: `${propertyId}hai3.mfes.comm.runtime.v1` — this ID is deterministic so repeated calls overwrite the previous ephemeral instance, preventing store growth - `inst-construct-ephemeral-id`
3. - [x] `p1` - `typeSystem.register({ id: ephemeralId, value })` registers the ephemeral instance AND validates it against the derived shared property schema in a single call; IF invalid `register()` throws with the validation diagnostic (instance JSON, resolved schema JSON, failure reason) and propagation is blocked - `inst-register-ephemeral`
4. - [x] `p1` - FOR EACH matching domain: store the raw value in `domainState.properties` keyed by `propertyId` - `inst-store-domain-value`
5. - [x] `p1` - FOR EACH matching domain: notify all subscribers in `domainState.propertySubscribers.get(propertyId)` with `(propertyId, value)` - `inst-notify-subscribers`

### GTS Package Auto-Discovery

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-gts-package-discovery`

GTS packages are extracted from extension IDs automatically — there is no explicit package registration API.

1. - [x] `p1` - TRY: call `extractGtsPackage(extension.id)` to derive the two-segment GTS package string (e.g., `'hai3.demo'`) - `inst-extract-package`
2. - [x] `p1` - IF the package key does not yet exist in the `packages` Map, create a new empty Set for it - `inst-create-package-set`
3. - [x] `p1` - Add `extension.id` to the Set for this package - `inst-add-to-set`
4. - [x] `p1` - CATCH any error from `extractGtsPackage`: silently swallow — the extension ID is not a valid GTS ID and package tracking is skipped - `inst-swallow-extract-error`

### Entry Type Handler Resolution

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-handler-resolution`

1. - [x] `p1` - IF no handlers are registered in the registry, RETURN (skip validation — early registration before handler setup is allowed; loading will fail later at runtime) - `inst-skip-if-no-handlers`
2. - [x] `p1` - FOR EACH registered handler: call `typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)` using the registry's own `typeSystem` — the handler does not perform this check itself - `inst-check-can-handle`
3. - [x] `p1` - IF any handler matches RETURN (at least one handler can process the entry type) - `inst-return-if-handled`
4. - [x] `p1` - IF no handler can handle the type RETURN throw `EntryTypeNotHandledError` with the entry type ID and list of handler base type IDs - `inst-throw-not-handled`

### Operation Serialization

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-operation-serialization`

All mutating operations on a given entity are queued per entity ID to prevent concurrent modification races.

1. - [x] `p1` - `OperationSerializer.serializeOperation(entityId, operation)` wraps the async operation in a per-entity queue - `inst-queue-operation`
2. - [x] `p1` - IF another operation is already running for `entityId`, the new operation waits in the queue - `inst-wait-in-queue`
3. - [x] `p1` - When the running operation completes (resolve or reject), the next queued operation starts - `inst-dequeue-next`
4. - [x] `p1` - `unregisterExtension` always calls `MountManager.unmountExtension` directly (not via `OperationSerializer`) to avoid deadlock — the parent `unregisterExtension` operation already holds the serializer lock for that entity - `inst-bypass-serializer-for-unmount`

### Domain Implementation Construction with Encapsulation Enforcement

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-domain-implementation-construction`

Builds the `ExtensionDomainImplementation` instance for a domain and mechanically invalidates the construction context so that no implementation can hold mounter / lifecycleTrigger / registerHandler access beyond its constructor. Invalidation is at the **function-handle level** — captured references to `ctx.mounter`, `ctx.lifecycleTrigger`, or `ctx.registerHandler` (held in the implementation's closure) also reject after invalidation. References captured by strategies (which hold the mounter and lifecycleTrigger privately as bound class members) survive registration end because the `MountStrategy` and `ExtensionDomainImplementation` constructors store the values directly, not via the `ctx` object.

1. - [ ] `p1` - Build `DomainContext` value object exposing `mounter` accessor, `lifecycleTrigger` accessor, and `registerHandler(actionType, handler)`; each member is implemented as a closure-captured function that consults the `valid` flag on every call - `inst-build-context`
2. - [ ] `p1` - Initialize an empty handler collector `Map<actionType, ActionHandler>` and a boolean `valid = true` flag inside the closure - `inst-init-collector`
3. - [ ] `p1` - **TRY** invoke `factory.build(ctx)` synchronously to obtain the `ExtensionDomainImplementation` instance — the implementation's constructor instantiates one or more shipped strategies (extending the abstract `MountStrategy` base class — `ConcurrentMountStrategy`, `OptionalMountStrategy`, `ExclusiveMountStrategy`) with `(ctx.mounter, hooks)`, capturing the mounter privately, and pushes per-action-type `ActionHandler` instances via `ctx.registerHandler` - `inst-invoke-factory`
4. - [ ] `p1` - **CATCH** any throw from `factory.build`: clear the handler collector, instruct the mediator to discard any pending handler entries collected for this domain, and rethrow — atomic rollback ensures no partial registration is observable - `inst-rollback-on-throw`
5. - [ ] `p1` - **FINALLY** flip `valid = false`; from this point any call to `ctx.mounter`, `ctx.lifecycleTrigger`, or `ctx.registerHandler` — including any captured function handle stashed in the implementation's closure — throws `Error("DomainContext invalidated after registration")` (or the corresponding member-specific message). Function-handle-level invalidation guarantees no implementation can stash a reference and use it asynchronously after registration - `inst-invalidate-context`
6. - [ ] `p1` - **RETURN** `{ implementation, handlers }` to the registry; the registry registers each `(actionType, handler)` pair with the mediator via `mediator.registerHandler(domainId, actionType, handler)` - `inst-return-construction-result`

---

### Strategy/Action Cross-Validation Matrix

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-cross-validate-handlers`

Enforces the strict cardinality matrix between the `MountStrategy` selected by the implementation and the action types declared by the domain. Runs after factory construction (the implementation's strategy is now observable) and before the registry persists registration state. Rejection here causes the registry to roll back any handlers collected during construction (per `cpt-frontx-algo-mfe-registry-domain-implementation-construction`) and rethrow.

| Strategy | `mount_ext` | `unmount_ext` |
|---|---|---|
| `ConcurrentMountStrategy` | REQUIRED | REQUIRED |
| `OptionalMountStrategy` | REQUIRED | REQUIRED |
| `ExclusiveMountStrategy` | REQUIRED | FORBIDDEN |

A "write-once" Concurrent variant (mount-only, no unmount) is NOT permitted; if a future use case emerges, relaxation is non-breaking. The matrix is enforced statically by the registry — no fallback heuristic on `domain.actions`.

1. - [ ] `p1` - Identify the strategy class instance(s) the implementation captured during construction; if none, throw `Error("Domain implementation must capture at least one MountStrategy instance")` - `inst-identify-strategy`
2. - [ ] `p1` - Look up the row in the cardinality matrix for the resolved strategy class; the row defines which of `mount_ext` / `unmount_ext` are REQUIRED and which are FORBIDDEN - `inst-lookup-matrix-row`
3. - [ ] `p1` - **FOR EACH** action type marked REQUIRED: **IF** the action type is missing from `declaration.actions` **THEN** throw `Error("{Strategy} requires {actionType} in declaration.actions")` - `inst-enforce-required`
4. - [ ] `p1` - **FOR EACH** action type marked FORBIDDEN: **IF** the action type is present in `declaration.actions` **THEN** throw `Error("{Strategy} forbids {actionType} in declaration.actions")` - `inst-enforce-forbidden`
5. - [ ] `p1` - **FOR EACH** action type listed in `declaration.actions` that has no handler in the construction collector: throw `Error("Declaration lists {actionType} but no handler was registered via ctx.registerHandler")` - `inst-enforce-handler-coverage`
6. - [ ] `p1` - **FOR EACH** action type registered via `ctx.registerHandler` that is NOT listed in `declaration.actions`: throw `Error("Handler registered for {actionType} but {actionType} is not declared in declaration.actions")` - `inst-enforce-no-extra-handlers`

---

### Concurrent Mount Strategy

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-concurrent-mount-strategy`

Append-mount semantics for multi-mount domains (e.g., `widgets`). Each mount adds a new container under the domain root; each unmount removes only the named extension. Multiple extensions remain mounted concurrently. The strategy reads the registry's canonical mount-set when it needs to inspect cardinality (per `cpt-frontx-dod-mfe-registry-mount-contracts`).

**Mount**:
1. - [ ] `p1` - Receive `ActionPayload` carrying `subject` (the extension ID) - `inst-concurrent-mount-receive`
2. - [ ] `p1` - Call `hooks.create(extensionId)` to materialize a fresh unattached `Element` for this extension — pure factory, no DOM attachment - `inst-concurrent-mount-create-container`
3. - [ ] `p1` - **TRY** `await mounter.mount(extensionId, container)` — mounter appends `container` under its attached root and updates the registry's mount-set to `[...prev, extensionId]` - `inst-concurrent-mount-call-mounter`
4. - [ ] `p1` - **CATCH** error: `hooks.destroy(extensionId)` to release the orphan container; rethrow - `inst-concurrent-mount-cleanup-on-error`
5. - [ ] `p1` - **RETURN** resolved Promise on success - `inst-concurrent-mount-return`

**Unmount**:
1. - [ ] `p1` - Receive `ActionPayload` carrying `subject` (the extension ID) - `inst-concurrent-unmount-receive`
2. - [ ] `p1` - **TRY** `await mounter.unmount(extensionId)` — removes the extension from the registry's mount-set and detaches the container from the attached root - `inst-concurrent-unmount-call-mounter`
3. - [ ] `p1` - Call `hooks.destroy(extensionId)` to release the container - `inst-concurrent-unmount-destroy-container`
4. - [ ] `p1` - **RETURN** resolved Promise - `inst-concurrent-unmount-return`

---

### Optional Mount Strategy

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-optional-mount-strategy`

Zero-or-one mount with explicit unmount support (sidebar, popup, overlay domains). Mounting while occupied displaces the prior extension; explicit unmount empties the slot. The strategy reads the canonical mount-set from the registry via the registry handle passed alongside the mounter (the registry owns mount-set state per `cpt-frontx-dod-mfe-registry-mount-contracts`).

**Mount**:
1. - [ ] `p1` - Receive `ActionPayload` carrying `subject` (the new extension ID) - `inst-optional-mount-receive`
2. - [ ] `p1` - Read current `mounted = registry.getMountedExtensions(domainId)` - `inst-optional-mount-read-current`
3. - [ ] `p1` - **IF** `mounted.length === 1` AND `mounted[0] !== subject`: `await mounter.unmount(mounted[0])`; `hooks.destroy(mounted[0])` to displace the prior extension before mounting the new one - `inst-optional-mount-displace-prior`
4. - [ ] `p1` - **IF** `mounted.includes(subject)`: idempotent — RETURN without re-mounting - `inst-optional-mount-idempotent`
5. - [ ] `p1` - `container = hooks.create(subject)` — pure factory; container is unattached, mounter appends under its root - `inst-optional-mount-create-container`
6. - [ ] `p1` - **TRY** `await mounter.mount(subject, container)` — mounter appends `container` under the attached root and updates the registry's mount-set - `inst-optional-mount-call-mounter`
7. - [ ] `p1` - **CATCH** error: `hooks.destroy(subject)`; rethrow - `inst-optional-mount-cleanup-on-error`
8. - [ ] `p1` - **RETURN** resolved Promise - `inst-optional-mount-return`

**Unmount**:
1. - [ ] `p1` - Receive `ActionPayload` carrying `subject` (the extension ID to unmount) - `inst-optional-unmount-receive`
2. - [ ] `p1` - **IF** `subject` is not in `registry.getMountedExtensions(domainId)`: idempotent — RETURN - `inst-optional-unmount-idempotent`
3. - [ ] `p1` - `await mounter.unmount(subject)` - `inst-optional-unmount-call-mounter`
4. - [ ] `p1` - `hooks.destroy(subject)` - `inst-optional-unmount-destroy-container`
5. - [ ] `p1` - **RETURN** resolved Promise - `inst-optional-unmount-return`

---

### Exclusive Mount Strategy

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-registry-exclusive-mount-strategy`

Pre-emptive single-mount semantics with no public unmount path (screen domain). Mounting always evicts any other extension currently mounted in the domain. The declaration MUST omit `unmount_ext` from `actions` — `cpt-frontx-algo-mfe-registry-cross-validate-handlers` rejects otherwise.

**Mount**:
1. - [ ] `p1` - Receive `ActionPayload` carrying `subject` (the new extension ID) - `inst-exclusive-mount-receive`
2. - [ ] `p1` - Read `mounted = registry.getMountedExtensions(domainId)` — registry is the canonical source of mount-set state - `inst-exclusive-mount-read-current`
3. - [ ] `p1` - **IF** `mounted.length === 1` AND `mounted[0] === subject`: idempotent — RETURN without re-mounting - `inst-exclusive-mount-idempotent`
4. - [ ] `p1` - **FOR EACH** `siblingId` in `mounted` where `siblingId !== subject`: `await mounter.unmount(siblingId)`; `hooks.destroy(siblingId)` to evict any pre-existing siblings - `inst-exclusive-mount-evict-siblings`
5. - [ ] `p1` - `container = hooks.create(subject)` — pure factory; container is unattached - `inst-exclusive-mount-create-container`
6. - [ ] `p1` - **TRY** `await mounter.mount(subject, container)` — mounter appends `container` under its attached root - `inst-exclusive-mount-call-mounter`
7. - [ ] `p1` - **CATCH** error: `hooks.destroy(subject)`; rethrow - `inst-exclusive-mount-cleanup-on-error`
8. - [ ] `p1` - **RETURN** resolved Promise on success - `inst-exclusive-mount-return`

`ExclusiveMountStrategy` does NOT implement the optional `unmount` method declared on the abstract `MountStrategy` base class. Eviction happens only as a side effect of `mount`. `cpt-frontx-algo-mfe-registry-cross-validate-handlers` rejects unmount actions for domains backed by this strategy at registration time.

---

## 4. States (CDSL)

### Extension Load State

- [x] `p1` - **ID**: `cpt-frontx-state-mfe-registry-extension-load`

Tracks whether an extension's bundle has been fetched and initialized.

1. - [x] `p1` - **FROM** `idle` **TO** `loading` **WHEN** an action whose `type` is `gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~` is dispatched for the extension - `inst-idle-to-loading`
2. - [x] `p1` - **FROM** `loading` **TO** `loaded` **WHEN** the `MfeHandler.load()` promise resolves successfully - `inst-loading-to-loaded`
3. - [x] `p1` - **FROM** `loading` **TO** `error` **WHEN** the `MfeHandler.load()` promise rejects - `inst-loading-to-error`
4. - [ ] `p2` - **FROM** `error` **TO** `idle` **WHEN** the extension is unregistered and re-registered - `inst-error-to-idle`

### Extension Mount State

- [x] `p1` - **ID**: `cpt-frontx-state-mfe-registry-extension-mount`

Tracks whether an extension's React tree is rendered into a domain container.

1. - [x] `p1` - **FROM** `unmounted` **TO** `mounting` **WHEN** an action whose `type` is `gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~` is dispatched and load state is `loaded` - `inst-unmounted-to-mounting`
2. - [x] `p1` - **FROM** `mounting` **TO** `mounted` **WHEN** `MfeEntryLifecycle.mount()` resolves successfully - `inst-mounting-to-mounted`
3. - [ ] `p1` - **FROM** `mounted` **TO** `unmounting` **WHEN** the active mount strategy decides to unmount the extension — `OptionalMountStrategy.unmount` and `ConcurrentMountStrategy.unmount` are dispatched explicitly via the unmount action type for the named extension; `ExclusiveMountStrategy.mount` evicts pre-existing siblings as a side effect of mounting a different extension. The state machine deals with extensions individually — there is no domain-wide "another extension was mounted" transition - `inst-mounted-to-unmounting`
4. - [x] `p1` - **FROM** `unmounting` **TO** `unmounted` **WHEN** `MfeEntryLifecycle.unmount()` resolves - `inst-unmounting-to-unmounted`
5. - [x] `p1` - **FROM** `mounted` **TO** `unmounted` **WHEN** the extension is unregistered while mounted (auto-unmount) - `inst-mounted-to-unmounted-on-unregister`

### Registry Factory Cache State

- [x] `p1` - **ID**: `cpt-frontx-state-mfe-registry-factory-cache`

Tracks the singleton caching state of `DefaultMfeRegistryFactory`.

1. - [x] `p1` - **FROM** `empty` **TO** `cached` **WHEN** `factory.build(config)` is called for the first time — instance and config are stored - `inst-empty-to-cached`
2. - [x] `p1` - **FROM** `cached` **TO** `cached` **WHEN** `factory.build(config)` is called again with the same `typeSystem` reference — cached instance is returned - `inst-cached-same-config`
3. - [x] `p1` - **FROM** `cached` **TO** `error` (throws) **WHEN** `factory.build(config)` is called with a different `typeSystem` reference — throws config mismatch error - `inst-cached-config-mismatch`

---

## 5. Definitions of Done

### MfeRegistry Public Contract

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-registry-contract`

`MfeRegistry` is exported as an abstract class. All external consumers hold references of type `MfeRegistry` — never the concrete `DefaultMfeRegistry`. The abstract class exposes: `typeSystem` (readonly), `registerDomain(declaration: ExtensionDomain, factory: ExtensionDomainImplementationFactory): void` (two-arg form; `factory` is a concrete subclass instance of the abstract `ExtensionDomainImplementationFactory` class whose `build(ctx): ExtensionDomainImplementation` method is called synchronously by the registry), `unregisterDomain`, `registerExtension`, `unregisterExtension`, `updateSharedProperty`, `getDomainProperty`, `executeActionsChain`, `getExtension`, `getDomain`, `getExtensionsForDomain`, `getMountedExtensions(domainId): readonly string[]` (plural; insertion-ordered list of currently-mounted extension IDs — the canonical source of mount-set state), `getMounter(domainId): ExtensionMounter` (returns the per-domain mounter for slot-side root attachment via `mounter.attach(element)` / `mounter.detach()`), `getRegisteredPackages`, `getExtensionsForPackage`, `getParentBridge`, `dispose`.

`loadExtension`, `mountExtension`, and `unmountExtension` are NOT public — all lifecycle operations go through `executeActionsChain`. Implementation-driven lifecycle transitions go through the per-domain `DomainLifecycleTrigger` (see `cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract`); the framework's mount/unmount completion handlers call internal trigger plumbing directly (not the public lifecycle trigger). `ChildMfeBridge.triggerLifecycleStage` (extension-side self-trigger) is a separate channel.

Mount-set reads use the plural `getMountedExtensions(domainId)`; consumers that need "the active screen extension" call `getMountedExtensions(HAI3_SCREEN_DOMAIN)[0]`. Containers are supplied by the implementation via `ContainerHooks`; mount semantics are owned by the three shipped strategy classes (`ConcurrentMountStrategy`, `OptionalMountStrategy`, `ExclusiveMountStrategy`); `MountManager` is strictly internal, composed by `DefaultExtensionMounter`.

The package additionally exports `ExtensionDomainImplementation` (abstract class), `ExtensionDomainImplementationFactory` (abstract class), `ExtensionMounter` (abstract class), `MountStrategy` (abstract base class), `DomainLifecycleTrigger` (abstract class), `DomainContext` (interface — carries `mounter`, `lifecycleTrigger`, `registerHandler`), `ContainerHooks` (interface — pure factory: `create`/`destroy`), `ConcurrentMountStrategy` / `OptionalMountStrategy` / `ExclusiveMountStrategy` (concrete classes extending `MountStrategy`), and `ActionHandler.fromFunction(fn)` (static helper for one-off function-to-handler wraps).

**Per-app boundary**: a `ScreensetsRegistry` is per-app — every FrontX app instance, including any MFE that itself owns extensions domains, owns its own registry, store, mediator, event bus, and lifecycle trigger built from the same `createHAI3()` primitive. Nested FrontX apps own their own registries; there is no shared registry across the app tree. Cross-boundary chain delivery is an internal routing concern of the framework, not a registry-sharing concern.

**Domain-ID uniqueness scope**: domain IDs are unique within ONE registry — that is, per-app — not globally across the app tree. Two MFEs rooted in different FrontX apps MAY both register a domain with the same ID (for example, `gts.hai3.mfes.ext.domain.v1~hai3.widgets.domain.v1~hai3.widgets.area.v1`); each registration anchors the domain in its own owning registry. Uniqueness is enforced inside one registry only.

**Extension discovery surface (registered-domain-IDs view)**: the registry exposes its set of registered domain IDs as a read-only collection. This is the capability the framework-composition plugin consumes to determine which extension declarations — read from registered `MfManifest` entities in the GTS runtime store — belong on this app's registry. The collection reflects current registry state — a newly-registered domain becomes part of the collection on registration, an unregistered domain leaves it on unregister — and the framework-composition plugin's content-addressed discovery (per `cpt-frontx-dod-framework-composition-mfe-plugin`) consumes this view to filter and dispatch.

**Single-owner extension registration**: an extension is registered on exactly one registry — the registry of the FrontX app that owns the domain identified by the extension's `domain` field. The MFE that ships the extension does NOT determine the owning registry by its source-tree location; the GTS instance ID in `extension.domain` does. Registration is idempotent: dispatching the same `(extensionId, domainId)` pair more than once leaves registry state unchanged after the first successful registration. An MFE whose `extensions[]` declares entries targeting domains owned by different apps reaches each target registry independently — each entry resolves to the single registry whose registered-domain-IDs view contains its `domain`.

**Implements**:
- `cpt-frontx-flow-mfe-registry-register-domain`
- `cpt-frontx-flow-mfe-registry-register-extension`
- `cpt-frontx-flow-mfe-registry-unregister-extension`
- `cpt-frontx-flow-mfe-registry-unregister-domain`
- `cpt-frontx-flow-mfe-registry-execute-chain`
- `cpt-frontx-flow-mfe-registry-update-shared-property`
- `cpt-frontx-flow-mfe-registry-query`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-screensets-package`
- `cpt-frontx-fr-mfe-dynamic-registration`
- `cpt-frontx-fr-broadcast-write-api`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`
- `cpt-frontx-constraint-no-barrel-exports-for-registries`

### MFE Type Contracts

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-type-contracts`

All MFE TypeScript interfaces are defined with the correct shapes as derived from source code and architecture artifacts:

- `MfeEntry`: `id`, `requiredProperties`, `actions`, `domainActions`, optional `optionalProperties`
- `MfeEntryMF` extends `MfeEntry`: adds `manifest` (`string | MfManifest`), `exposedModule`, `exposeAssets`. Fields:
  - `manifest` — reference to the package-level manifest. Two resolution paths:
    1. **GTS type reference (string)**: resolved from the ManifestCache by GTS ID at load time
    2. **Inline MfManifest object**: validated and cached at load time
  - `exposedModule` — which module to load from the MFE package (e.g., `"./lifecycle"`)
  - `exposeAssets` — chunk paths and CSS assets for THIS specific exposed module:
    - `js` — `{ sync: string[], async: string[] }` — JS chunk filenames relative to manifest's `publicPath`
    - `css` — `{ sync: string[], async: string[] }` — CSS asset filenames relative to manifest's `publicPath`
  - The `exposeAssets` data originates from the `exposes[]` array in `mf-manifest.json` but is split out at registration time — the manifest entity carries shared data, the entry carries per-module data
- `MfManifest` (GTS schema `gts://gts.hai3.mfes.mfe.mf_manifest.v1~`): package-level metadata shared across all entries from the same MFE package. Contains ONLY what is common between entries — knows nothing about individual entries or exposed modules. Fields:
  - `id` — GTS instance ID (required)
  - `name` — federation container name (required)
  - `metaData` — build and entry metadata (required):
    - `publicPath` — base URL for resolving chunk paths (e.g., `http://localhost:3001/`)
    - `remoteEntry` — entry point location: `{ path, name, type }` (e.g., `{ path: "/js/", name: "remoteEntry.js", type: "module" }`)
    - `name` — federation name (same as top-level `name`)
    - `buildInfo` — `{ buildVersion, buildName }`
    - `globalName` — global variable name for script-tag loading
  - `shared` — array of shared dependency declarations (required). Each entry:
    - `name` — package name (e.g., `"react"`)
    - `version` — actual installed version (e.g., `"19.0.0"`)
    - `requiredVersion` — semver range (e.g., `"^19.0.0"`)
    - `chunkPath` — MFE-relative path to the standalone ESM for this dependency (e.g., `"shared/react.js"`); set by the `frontx-mf-gts` plugin; the handler resolves against `publicPath` and deduplicates via `sharedDepTextCache` keyed by `name@version`
    - `unwrapKey` — the export key to access the module inside the standalone ESM (e.g., `"react"`); `null` means `'default'` is used; determined by the `frontx-mf-gts` plugin from the package's export structure
    - `assets` — `{ js: { sync: string[], async: string[] }, css: { sync: string[], async: string[] } }` — chunk filenames
  - Fields present in `mf-manifest.json` but excluded from `MfManifest`: `exposes` (per-module data — split into `MfeEntryMF.exposeAssets` at registration time), `remotes` (not used by the handler), `singleton` (meaningless under blob URL isolation), `hash`, `fallback`/`fallbackName`/`fallbackType`
- `ExtensionDomain`: `id`, `sharedProperties`, `actions`, `extensionsActions`, `defaultActionTimeout` (required number), `lifecycleStages` (required), `extensionsLifecycleStages` (required), optional `extensionsTypeId`, optional `lifecycle`
- `Extension`: `id`, `domain`, `entry`, optional `lifecycle`
- `ScreenExtension` extends `Extension`: adds required `presentation` (`ExtensionPresentation`)
- `ExtensionPresentation`: `label`, `route`, optional `icon`, optional `order`
- `SharedProperty`: `id`, `value: unknown`
- `Action`: `type` (GTS schema type ID with trailing `~`), `target`, optional `payload`, optional `timeout`; no `id` field; when `payload` is present and the action targets an extension, `payload.subject` carries a GTS reference to the extension instance — no `payload.extensionId` field exists
- `ActionsChain`: `action` (Action instance), optional `next` (ActionsChain), optional `fallback` (ActionsChain); no `id` field
- `LifecycleStage`, `LifecycleHook` with appropriate shapes

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-entry-types`
- `cpt-frontx-fr-mfe-ext-domain`
- `cpt-frontx-fr-mfe-shared-property`
- `cpt-frontx-fr-mfe-action-types`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`

### GTS-Based Validation

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-gts-validation`

All registration and dispatch paths perform GTS-native validation. Schema validation is the responsibility of `typeSystem.register(entity)` itself: `register()` registers the instance and validates it against its resolved schema in a single call. IF validation fails, `register()` throws a plain `Error` whose message carries rich diagnostics (instance JSON, resolved schema JSON, and the failure reason); the throw is the authoritative "invalid" signal, and a subsequent successful `register()` with the same deterministic id supersedes a failed attempt. Callers do not need to run a separate validation step.

- Domain registration: `typeSystem.register(domain)` registers and schema-validates the domain; lifecycle hook stages validated against `domain.lifecycleStages`
- Extension registration: `typeSystem.register(extension)` registers and schema-validates the extension; contract matching; type hierarchy check via `typeSystem.isTypeOf`; lifecycle hooks validated against `domain.extensionsLifecycleStages`
- Action dispatch (schema validation): anonymous instance pattern — the action object (no `id` field) is registered via `typeSystem.register(action)`; the type system resolves the schema from the action's `type` field and validates against it inside `register()`; the `payload.subject` field is validated as required by the schema, making a separate `requireExtensionId()` helper redundant
- Action dispatch (runtime entry declaration validation): before handler invocation, the mediator validates that the action's `type` is in the target entry's `actions` array (the list of action types the entry is capable of receiving and executing); undeclared actions fail the chain with an error `Action type '{type}' is not declared by target entry '{entryId}'`; domain-targeted infrastructure lifecycle actions (`HAI3_ACTION_LOAD_EXT`, `HAI3_ACTION_MOUNT_EXT`, `HAI3_ACTION_UNMOUNT_EXT`) are exempt because they target domains, not entries; this layer is required in addition to GTS schema validation — the type system alone cannot verify entry-specific opt-in
- Shared property update: ephemeral instance `{ id: ephemeralId, value }` registered (and validated) in a single `register()` call before any domain receives the value; validation failure throws and blocks all propagation
- Schema-validation failures surface as plain `Error` instances (thrown from `register()`); registry-level invariants (type hierarchy, lifecycle stage subset, handler resolution) surface as typed exceptions: `ExtensionTypeError`, `UnsupportedLifecycleStageError`, `EntryTypeNotHandledError`

**GTS-ID convention**: derived schema IDs and instance IDs follow the project rule `<namespace>.<entity>.v<N>` for each chain segment; the entity segment is required. Schema IDs end with `~`; instance IDs do not. Each `~`-separated segment denotes a chain link — inheritance for derived schemas, anchoring for instances. The convention is a project rule applied uniformly across all GTS IDs the package emits or accepts.

**Implements**:
- `cpt-frontx-algo-mfe-registry-extension-validation`
- `cpt-frontx-algo-mfe-registry-domain-validation`
- `cpt-frontx-algo-mfe-registry-contract-matching`
- `cpt-frontx-algo-mfe-registry-extension-type-validation`
- `cpt-frontx-algo-mfe-registry-shared-property-broadcast`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-dynamic-registration`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`
- `cpt-frontx-principle-self-registering-registries`

### MFE Schema Registration

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-mfe-schema-registration`

`mfe.json` is the single validatable per-package contract describing all entries, extensions, schemas, and an optional `domains[]` array of MFE-declared `ExtensionDomain` instances under one GTS package. It has two states:

- **Authored state** (pre-build): the developer maintains `entries` (without `exposeAssets`), `extensions`, an optional `schemas` array of inline GTS JSON Schema definitions, and an optional `domains[]` array of MFE-declared `ExtensionDomain` instances. The `manifest` field exists only with authored metadata (`id`, `remoteEntry`); `metaData`, `shared[]`, and per-entry `exposeAssets` are absent.
- **Enriched state** (post-build): the `frontx-mf-gts` Vite plugin enriches the SAME `mfe.json` file in place, populating `manifest.metaData` (from `mf-manifest.json` — includes `publicPath`, `remoteEntry`, `name`, `buildInfo`, `globalName`), `manifest.shared[]` entries (with `chunkPath`, `version`, `unwrapKey` per dep), and `entries[].exposeAssets`. The `domains[]` array, when authored, is preserved unchanged through enrichment. The enriched file is committed alongside source.

The `frontx-mf-gts` Vite plugin derives the shared dep list from `rollupOptions.external` in the resolved Vite config, builds standalone ESM modules for each from `node_modules` via esbuild, and writes the enriched `mfe.json` back to the package root.

The host application's bootstrap loader receives `mfe.json` content per package and registers each package's entities into the GTS runtime store in this order — scoped schemas → `MfManifest` entity → MFE-declared `domains[]` (when authored) → entries → extensions. Schema registration is **scoped per entry**: for each entry in the loaded `mfe.json` content, collect the action IDs declared in `entry.actions` and `entry.domainActions`; for each collected action ID, locate the matching schema in the package's `schemas[]` (the schema whose `$id` equals the action ID with the `gts://` prefix); call `typeSystem.registerSchema(schema)` only for the matched schemas. Schemas that do not correspond to any action declared by any entry in the package are NOT registered. The `domains[]` step registers each `ExtensionDomain` instance opaquely between the `MfManifest` entity and entries so entries/extensions registered after it can resolve their target domain by GTS instance ID; `domains[]` is OPTIONAL per MFE — MFEs that do not own `ExtensionDomain` instances omit it and the bootstrap iterates an empty list. Deduplication is automatic because GTS overwrites any entity with the same `$id` or instance ID. The L4 transport by which the bootstrap loader receives `mfe.json` content is documented under `cpt-frontx-fr-manifest-generation-script` and is out of scope for this DoD.

**Rules**:
- `mfe.json` is the single source of truth per MFE package and is committed in its enriched state; there is no separate build-output file per MFE
- Enrichment is deterministic and idempotent: re-running the build against an already-enriched `mfe.json` rewrites the `metaData`, `shared[]`, and `exposeAssets` fields from the current build inputs without producing a different shape; the `domains[]` field, when authored, is preserved unchanged through enrichment
- Bootstrap registration order per package is fixed: schemas → `MfManifest` entity → MFE-declared `domains[]` → entries → extensions
- `domains[]` registration in the bootstrap happens after `MfManifest` entity registration and before `registerEntry` / `registerExtension` calls; `domains[]` is OPTIONAL per MFE (missing or empty array is silently skipped, the bootstrap iterates an empty list)
- Schema registration in the bootstrap happens before `MfManifest` entity registration (and therefore before `domains[]`, entries, and extensions) for the loaded package
- Schema registration is scoped: only schemas matching action IDs declared by at least one entry in the package are registered; this, combined with runtime action declaration validation in the mediator, ensures entries receive only the actions they opt into
- Missing or empty `schemas` array is silently skipped
- An action ID declared by an entry but missing a matching schema in `config.schemas[]` does NOT cause bootstrap to fail — the type system will reject unvalidatable actions at dispatch time
- Each schema element must carry a `$id` — the GTS `registerSchema` implementation enforces this at runtime
- Each `ExtensionDomain` instance in `domains[]` must carry a GTS instance ID; the GTS runtime store rejects duplicate instance IDs at registration
- Registration is idempotent: loading the same MFE package twice does not produce errors

**Implements**:
- `cpt-frontx-interface-mfe-json-schemas`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`

### MfManifest GTS Schema and Type Update

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-mfmanifest-schema-update`

The `MfManifest` TypeScript interface and the GTS schema `mf_manifest.v1.json` (registered as `gts://gts.hai3.mfes.mfe.mf_manifest.v1~`) are updated to include build-time fields: `metaData` (extracted from `mf-manifest.json` by the plugin — includes `publicPath`, `remoteEntry`, `name`, `buildInfo`, `globalName`) at the manifest level, and `chunkPath: string` / `version: string` / `unwrapKey: string | null` on each shared dependency entry (produced by the `frontx-mf-gts` Vite plugin from standalone ESM builds). The `GtsPlugin` registers `mf_manifest.v1.json` as a first-class schema alongside all other built-in schemas. All runtime code (`MfeHandlerMF`, `ManifestCache`, `MfeBridgeFactory`) works with the `MfManifest` TypeScript interface and never imports or inspects GTS JSON schemas directly. The GTS layer is the validation boundary; the TypeScript interface is the runtime contract.

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-entry-types`
- `cpt-frontx-contract-mfe-manifest`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`

### Shared Property Broadcast

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-shared-property-broadcast`

`updateSharedProperty(propertyId, value)` is the only write method for shared properties. `updateDomainProperty()` and `updateDomainProperties()` do not exist. The method:
- Silently no-ops if no registered domains declare the property
- Validates the value once using a deterministic ephemeral GTS instance ID before touching any domain
- Throws synchronously on validation failure — no partial updates
- Propagates the raw value to all matching domain states and notifies all per-domain, per-property subscribers
- Known property constants are `HAI3_SHARED_PROPERTY_THEME = 'gts.hai3.mfes.comm.shared_property.v1~hai3.mfes.comm.theme.v1~'` and `HAI3_SHARED_PROPERTY_LANGUAGE = 'gts.hai3.mfes.comm.shared_property.v1~hai3.mfes.comm.language.v1~'`. Their derived GTS schemas are registered at the application layer, not bundled in the SDK.

**Cross-boundary subscription**: shared property subscription is propagated across the parent-child edge — a subscriber in the child app receives updates the parent app's property tree emits for the matching property. Each parent-child edge is independent; multi-edge propagation along a chain (root app → screen-MFE app → widget-MFE app) is per-edge sequential, with each edge applying its own validation and notification before the next edge is reached.

**Implements**:
- `cpt-frontx-flow-mfe-registry-update-shared-property`
- `cpt-frontx-algo-mfe-registry-shared-property-broadcast`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-shared-property`
- `cpt-frontx-fr-broadcast-write-api`
- `cpt-frontx-fr-broadcast-matching`
- `cpt-frontx-fr-broadcast-validate`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`

### MFE Handler Injection

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-handler-injection`

`MfeRegistryConfig` has `typeSystem: TypeSystemPlugin` (required) and `mfeHandlers?: MfeHandler[]` (optional). If handlers are provided, they are stored sorted by descending `priority`. `MfeHandler` is an abstract class with `handledBaseTypeId: string`, `priority: number`, `bridgeFactory`, and abstract `load(entry)`. The handler does NOT hold a `typeSystem` reference and does NOT have a `canHandle()` method — the registry performs handler resolution directly using its own `typeSystem.isTypeOf(entryTypeId, handler.handledBaseTypeId)`. `MfeBridgeFactory` is an abstract class with `create(domainId, entryTypeId, instanceId)` and `dispose(bridge)`.

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-screensets-package`
- `cpt-frontx-fr-mfe-dynamic-registration`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`

### ActionsChainsMediator Contract

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-mediator-contract`

`ActionsChainsMediator` is exported as an abstract class. Handler storage uses a unified two-level map: `Map<targetId, Map<actionTypeId, ActionHandler>>`. A single `registerHandler(targetId, actionTypeId, handler)` API covers both domain-side and extension-side registration. `ActionHandler` is an abstract class with a single `abstract handleAction(actionTypeId: string, payload: Record<string, unknown> | undefined): Promise<void>` method — consistent with all other public contracts in the package. The `CustomActionHandler` type and any `ActionHandlerFn` alias are removed. Mediator resolution uses `(target, actionType)` pair, not just `target`. Domain-side lifecycle handlers are small classes extending `ActionHandler` (one per lifecycle action type), not closures.

Domain-side: `registerDomain()` registers three handlers (one per lifecycle action type) and `unregisterDomain()` removes all of them. Extension-side: `registerHandler()` is called once per action type; disposing the bridge calls `unregisterAllHandlers(extensionId)` which removes the entire inner map entry.

**Runtime action declaration validation**: before resolving and invoking a handler, the mediator validates that the action's `type` is declared by the target entry. For extension-targeted actions, it resolves the extension, locates the entry that owns the extension, and requires that the entry's `actions` array (the list of action types the entry is capable of receiving and executing) contain the action type. `domainActions` is NOT consulted at runtime — it captures the action types the parent domain must support for the entry to be injectable, and is enforced at registration time via contract matching Rule 3, not at dispatch time. Undeclared actions fail the chain with a recorded error `Action type '{type}' is not declared by target entry '{entryId}'`. Infrastructure lifecycle actions (`HAI3_ACTION_LOAD_EXT`, `HAI3_ACTION_MOUNT_EXT`, `HAI3_ACTION_UNMOUNT_EXT`) target domains, not extensions, so this check does not apply to them. Combined with scoped bootstrap schema registration, this ensures the `actions` array on entries is a live runtime contract — not a dead declaration only consulted at registration time.

**Cross-app chain delivery**: any caller may target any target via `executeActionsChain`, regardless of which app's mediator the caller and the target belong to. The framework's bridge infrastructure routes the chain to the target's owning mediator at internal runtime; the caller does not need to know which mediator owns the target. Validation against the target's runtime contract — entry-level `entry.actions[]`, domain-level `domain.actions[]`, and GTS schema validation — happens in the target's owning mediator's app, against THAT app's registry data. The routing is a runtime implementation detail; the user-visible API surface is `executeActionsChain` only. Internal mechanisms that bridge mediators across boundaries are infrastructure detail and are not part of the user-facing contract.

**Cross-app handler precedence**: the mediator looks up `handlers.get(target).get(actionType)` first; IF a handler is found, it is invoked. IF no per-`(target, actionType)` handler is present in the local mediator, the framework's internal cross-boundary routing engages (the target may belong to another app), and the chain is delivered to the target's owning mediator. The caller's app does NOT check entry declarations against the target — entry declaration checks and GTS schema checks always run in the target's owning app, against THAT app's registry data, on arrival.

**Cross-app timeout origin**: the target's owning app applies its own `defaultActionTimeout` for the target domain. The caller's app does NOT impose its own timeout on a cross-boundary chain.

**Cross-app error propagation**: exceptions and chain failures propagate back to the caller via the bridge as the rejected Promise from `executeActionsChain`. Stack and cause information is preserved end-to-end; the routing path does not swallow errors.

**Cross-app result propagation**: action chain results, where a chain emits one, are returned to the caller via the same Promise, serialized as the `Action`-typed result the chain emits.

**Implements**:
- `cpt-frontx-flow-mfe-registry-execute-chain`
- `cpt-frontx-flow-mfe-registry-register-extension-handler`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`
- `cpt-frontx-seq-extension-action-delivery`

### Mount Strategy and Mounter Contracts

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-mount-contracts`

The mounter facade, the implementation-supplied container factory, the abstract `MountStrategy` base, and the three shipped concrete strategy classes are exported with the following type contracts. All abstractions are abstract classes (or interfaces where noted), consistent with the package's class-first style. The registry owns the canonical per-domain mount-set state (`ExtensionDomainState.mountedExtensions: string[]`, insertion-ordered); the mounter does NOT keep duplicate state.

- `ExtensionMounter` (abstract class) exposes the following abstract methods:
  - `attach(root: Element): void` — registers `root` as the DOM root the mounter places per-extension containers under; called by `ExtensionDomainSlot` from its ref-attach callback. Idempotent if called with the same root; replaces the prior root if called with a different element.
  - `detach(): void` — releases the attached root and **mass-unmounts every currently-mounted extension in the domain** by calling `mounter.unmount(extId)` and `hooks.destroy(extId)` per extension (so the slice/registry stay consistent — the diff dispatch reflects each removal). After detach, the mounter has no root; subsequent `mount` calls will throw until `attach` is called again.
  - `mount(extensionId: string, container: Element): Promise<void>` — appends `container` under the attached root; updates the registry's mount-set to include `extensionId`; throws if the mounter has no attached root.
  - `unmount(extensionId: string): Promise<void>` — detaches the per-extension container from the attached root and updates the registry's mount-set to remove `extensionId`.
  The mounter does NOT expose `getMounted()` — strategies and consumers read mount-set state from the registry via `getMountedExtensions(domainId)`. One concrete `ExtensionMounter` instance is constructed by the registry per registered domain.
- `MountStrategy` (abstract base class) exposes:
  - `mount(payload: ActionPayload, mounter: ExtensionMounter, hooks: ContainerHooks): Promise<void>` — abstract; every concrete strategy implements this method.
  - `unmount(payload: ActionPayload, mounter: ExtensionMounter, hooks: ContainerHooks): Promise<void>` — OPTIONAL; declared on the base for shape, NOT abstract. Concrete strategies MAY define it. `ExclusiveMountStrategy` does NOT define it; `ConcurrentMountStrategy` and `OptionalMountStrategy` do. Cardinality enforcement is structural (the absence of `unmount`) plus runtime cross-validation at registration (`cpt-frontx-algo-mfe-registry-cross-validate-handlers`).
- `ContainerHooks` (interface, supplied by the implementation) is a **pure factory** with NO DOM-attachment responsibility:
  - `create(extensionId: string): Element` — materializes a fresh **unattached** host element for the named extension; the mounter (which owns the attached root) appends/removes from its root.
  - `destroy(extensionId: string): void` — releases the host element produced by the matching `create` call; invoked by strategies during unmount and on mount-failure cleanup.
  This interface is on the implementation side, never on the framework side, because container shape is domain-specific (DOM, Shadow DOM, off-DOM portal, etc.) and the framework treats containers as opaque `Element` references.
- `ConcurrentMountStrategy`, `OptionalMountStrategy`, `ExclusiveMountStrategy` are concrete classes shipped by `@cyberfabric/screensets` extending `MountStrategy`. Each accepts the mounter and the implementation's container hooks at construction time as `constructor(mounter: ExtensionMounter, hooks: ContainerHooks)`. The implementation captures the strategy instance privately; the strategy in turn captures the mounter privately as a bound class field, which is what allows mount/unmount calls to keep functioning after `DomainContext` invalidation.
- `ExtensionDomainImplementationFactory` (abstract class) exposes a single abstract method `build(ctx: DomainContext): ExtensionDomainImplementation`. The synchronous return type enforces synchronous construction at the type level — async factories are rejected at compile time (no `Promise<ExtensionDomainImplementation>` overload) and no runtime check is required. Concrete subclasses are written by domain authors.
- `DomainContext` (interface) exposes `mounter: ExtensionMounter`, `lifecycleTrigger: DomainLifecycleTrigger`, and `registerHandler(actionType: string, handler: ActionHandler): void`. All three members reject (throw) once the registry invalidates the context at the end of `registerDomain`. Function-handle-level invalidation: captured references to `mounter`, `lifecycleTrigger`, or `registerHandler` (held in the implementation's closure) also reject after invalidation, not just access through the `ctx` object.

The framework receives only opaque `Element` references through `mounter.mount(extId, container)`. The framework does not know — and does not need to know — how the implementation constructs, positions, or destroys those elements; that is entirely the implementation's responsibility through `ContainerHooks`. Container attachment to the DOM is the **mounter's** responsibility (via the slot's `mounter.attach(element)` call), not the implementation's.

**Per-app boundary**: mount semantics are LOCAL to one registry. Each FrontX app instance gets its own `ExtensionMounter` per domain it registers, its own per-domain mount-set state, its own cross-validation pass at registration, and its own diff dispatch into its own slice. The mount machinery is entirely per-app; cross-app mount visibility does not exist. A nested FrontX app rooted inside an MFE owns mount state for its own domains independently; the parent app's registry holds only the parent's directly-registered extensions and is unaware of the nested app's mounts.

**Implements**:
- `cpt-frontx-flow-mfe-registry-register-domain`
- `cpt-frontx-algo-mfe-registry-domain-implementation-construction`
- `cpt-frontx-algo-mfe-registry-cross-validate-handlers`
- `cpt-frontx-algo-mfe-registry-concurrent-mount-strategy`
- `cpt-frontx-algo-mfe-registry-optional-mount-strategy`
- `cpt-frontx-algo-mfe-registry-exclusive-mount-strategy`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-dynamic-registration`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`
- `cpt-frontx-adr-domain-implementation-mount-strategies`

---

### DomainLifecycleTrigger Contract

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-lifecycle-trigger-contract`

Implementation-driven lifecycle transitions go through a per-domain `DomainLifecycleTrigger` facade. The mounter stays SRP-pure (mounting only). Mount and unmount internally auto-fire their associated mount/unmount lifecycle stages — implementations do NOT have to call the trigger to fire those.

- `DomainLifecycleTrigger` (abstract class) exposes three abstract methods:
  - `triggerExtensionStage(extId: string, stageId: string): Promise<void>` — fires a lifecycle stage for the named extension only.
  - `triggerStage(stageId: string): Promise<void>` — cascades the named stage across all extensions registered in the domain.
  - `triggerOwnStage(stageId: string): Promise<void>` — fires the named stage on the domain itself (no cascade to extensions).
- One concrete `DomainLifecycleTrigger` instance is constructed by the registry per registered domain (`DefaultDomainLifecycleTrigger`, marked `@internal`) and exposed to the implementation through `DomainContext.lifecycleTrigger`. The captured reference (held privately by the implementation as a bound class field) survives `DomainContext` invalidation; access through the `ctx` object after invalidation throws.
- The registry's public `triggerLifecycleStage`, `triggerDomainLifecycleStage`, and `triggerDomainOwnLifecycleStage` methods are REMOVED. Framework-side mount/unmount completion handlers call internal trigger plumbing directly (not the public `lifecycleTrigger`). `ChildMfeBridge.triggerLifecycleStage` (extension-side self-trigger) stays unchanged — that channel was always extension-side, separate from the per-domain trigger.

**Implements**:
- `cpt-frontx-flow-mfe-registry-register-domain`
- `cpt-frontx-algo-mfe-registry-domain-implementation-construction`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-dynamic-registration`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`
- `cpt-frontx-adr-domain-implementation-mount-strategies`

---

### TypeSystemPlugin Interface

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-type-system-plugin`

`TypeSystemPlugin` is a plain TypeScript interface (not a class) with:
- `name: string` and `version: string` (readonly)
- `registerSchema(schema: JSONSchema): void` — for vendor/dynamic schemas; first-class schemas are built into the plugin and need not be registered
- `getSchema(typeId: string): JSONSchema | undefined`
- `register(entity: unknown): void` — GTS-native registration AND validation in one call; for named instances the schema is extracted from the chained instance ID; for anonymous instances (no `id` field) the schema is extracted from the entity's `type` field; the entity is validated against the resolved schema as part of registration — IF validation fails `register()` throws a plain `Error` whose message carries instance JSON, resolved schema JSON, and the failure reason; the throw is the authoritative "invalid" signal and a subsequent successful `register()` with the same deterministic id supersedes a failed attempt (callers that catch and continue MUST NOT rely on prior registration state). Schema-vs-instance determination is gts-ts's responsibility per gts-spec (the authoritative marker is the trailing `~` on the identifier); this interface does not impose a plugin-layer distinguishing check
- `isTypeOf(typeId: string, baseTypeId: string): boolean` — type hierarchy check
- `JSONSchema` is the only supporting type exported alongside the interface; schema validation failures are reported via thrown `Error` rather than a structured result object — there is no `validateInstance()` method, and no `ValidationResult`/`ValidationError` types
- The package treats all type IDs as opaque strings; no parsing of type IDs occurs in `@cyberfabric/screensets`
- The GTS plugin implementation is exported via subpath `@cyberfabric/screensets/plugins/gts` to avoid pulling `@globaltypesystem/gts-ts` when consumers only need the contracts

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-screensets-package`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`
- `cpt-frontx-constraint-no-barrel-exports-for-registries`

### Factory-with-Cache Pattern

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-factory-cache`

`MfeRegistryFactory` is an abstract class with a single abstract method `build(config: MfeRegistryConfig): MfeRegistry`. `DefaultMfeRegistryFactory` is the concrete implementation — it is marked `@internal` and not exported from the public barrel. The exported singleton `mfeRegistryFactory` is an instance of `DefaultMfeRegistryFactory`. After the first `build()` call the instance is cached; subsequent calls with the same `typeSystem` reference return the cached instance; calls with a different `typeSystem` reference throw. Construction verifies all thirteen first-class GTS schemas are present in the plugin.

**Implements**:
- `cpt-frontx-flow-mfe-registry-factory-build`
- `cpt-frontx-state-mfe-registry-factory-cache`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-screensets-package`
- `cpt-frontx-fr-mfe-dynamic-registration`

**Covers (DESIGN)**:
- `cpt-frontx-component-screensets`
- `cpt-frontx-principle-self-registering-registries`

### Layer and Build Constraints

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-registry-layer-constraints`

`@cyberfabric/screensets` has zero `@cyberfabric/*` entries in `dependencies` or `devDependencies`. No `import 'react'` or any React API appears in `packages/screensets/src/`. The package output is ESM-only (`"type": "module"`, `format: ['esm']` in tsup config). All source compiles with `"strict": true`. `LayoutDomain` enum and all action/property constants are exported from the main barrel. Concrete runtime classes (`DefaultMfeRegistry`, `DefaultMfeRegistryFactory`) are not exported from the main barrel — only abstract base classes are public.

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-flat-packages`
- `cpt-frontx-fr-sdk-screensets-package`
- `cpt-frontx-nfr-maint-zero-crossdeps`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-constraint-zero-cross-deps-at-l1`
- `cpt-frontx-constraint-typescript-strict-mode`
- `cpt-frontx-constraint-esm-first-module-format`
- `cpt-frontx-constraint-no-barrel-exports-for-registries`

---

## 6. Acceptance Criteria

- [x] `mfeRegistryFactory.build({ typeSystem: gtsPlugin })` returns a `MfeRegistry` instance and subsequent calls with the same `typeSystem` return the same instance
- [x] `mfeRegistryFactory.build({ typeSystem: differentPlugin })` after an initial build throws a config mismatch error
- [ ] `registerDomain(declaration, factory)` accepts a concrete `ExtensionDomainImplementationFactory` subclass instance (not a function); the registry invokes `factory.build(ctx)`, captures the implementation, and invalidates `ctx` in a `finally` block such that subsequent `ctx.mounter`, `ctx.lifecycleTrigger`, or `ctx.registerHandler` access — including any captured function handle stashed in the implementation's closure — throws. Strategy-captured references survive registration end (verified by mounting and unmounting an extension after `registerDomain` returns). It propagates the plain `Error` thrown by `typeSystem.register(declaration)` when the declaration fails GTS schema validation (message carries instance JSON, schema JSON, and the failure reason), and throws `UnsupportedLifecycleStageError` when a lifecycle hook references a stage not in `declaration.lifecycleStages`. The registry rejects handler/declaration mismatches per the strict cross-validation matrix in `cpt-frontx-algo-mfe-registry-cross-validate-handlers`. **IF** `factory.build` throws after one or more `ctx.registerHandler` calls succeeded **THEN** the registry rolls back all collected handlers and the domain is not registered (atomic rollback)
- [x] `registerExtension` propagates the plain `Error` thrown by `typeSystem.register(extension)` on schema validation failure, throws an `Error` with the collected contract error list on contract-matching failure, and throws `ExtensionTypeError`, `UnsupportedLifecycleStageError`, or `EntryTypeNotHandledError` at the appropriate validation step
- [x] Contract matching enforces all three subset rules and excludes infrastructure lifecycle actions from Rule 3
- [x] `updateSharedProperty` throws synchronously if GTS validation fails and no domain receives the update; silently no-ops if no domain declares the property
- [x] `unregisterExtension` auto-unmounts a mounted extension before triggering the `destroyed` lifecycle stage
- [x] `unregisterDomain` cascade-unregisters all extensions before triggering the domain's `destroyed` lifecycle stage
- [x] Concurrent `registerExtension` calls for the same extension ID are serialized via `OperationSerializer`; calls for different IDs proceed concurrently
- [x] `getRegisteredPackages()` returns packages in discovery order; `getExtensionsForPackage(packageId)` returns only live (still-registered) extensions
- [x] `dispose()` clears all internal state, disposes all bridges, and clears the `packages` Map
- [x] `@cyberfabric/screensets` package has zero `@cyberfabric/*` dependencies and zero React imports, confirmed by CI dependency-cruiser check
- [x] All source compiles without TypeScript errors under `"strict": true`
- [ ] Mediator rejects an extension-targeted action whose `type` is not declared in the target entry's `actions` array — the chain fails with an error naming the action type and entry ID; `domainActions` is NOT consulted at runtime (it is enforced at registration time by contract matching Rule 3); domain-targeted infrastructure lifecycle actions (`HAI3_ACTION_LOAD_EXT`, `HAI3_ACTION_MOUNT_EXT`, `HAI3_ACTION_UNMOUNT_EXT`) remain exempt
- [ ] Bootstrap schema registration is scoped per entry: only schemas whose `$id` matches an action ID declared in `entry.actions` or `entry.domainActions` of at least one entry in the package are registered via `typeSystem.registerSchema`; unreferenced schemas from `config.schemas[]` are never registered
- [ ] `getMountedExtensions(domainId)` returns a `readonly string[]` of insertion-ordered extension IDs currently mounted in the domain — empty array for an unknown or empty domain, never `undefined`
- [ ] `ConcurrentMountStrategy` mounts multiple extensions concurrently: after mounting `extA` then `extB`, `getMountedExtensions(domainId)` returns `[extA, extB]`; after unmounting `extA`, it returns `[extB]`. The registry's strict cross-validation matrix REQUIRES `mount_ext` AND `unmount_ext` for `ConcurrentMountStrategy`-backed declarations and rejects any declaration that omits either
- [ ] `OptionalMountStrategy` displaces a prior single mount: after mounting `extA` then mounting `extB`, `getMountedExtensions(domainId)` returns `[extB]`; after unmounting `extB`, it returns `[]`. The registry's strict cross-validation matrix REQUIRES `mount_ext` AND `unmount_ext` for `OptionalMountStrategy`-backed declarations and rejects any declaration that omits either
- [ ] `ExclusiveMountStrategy` evicts pre-existing siblings on mount and does NOT implement the optional `unmount` method on the abstract `MountStrategy` base; the registry rejects an `ExclusiveMountStrategy`-backed declaration that lists `unmount_ext` in `declaration.actions` with a clear error and rejects one that omits `mount_ext`
- [ ] `ExtensionMounter.attach(root)` registers the DOM root used by subsequent `mount` calls; `ExtensionMounter.detach()` mass-unmounts every currently-mounted extension in the domain (calling `mounter.unmount(extId)` and `hooks.destroy(extId)` per extension), reflected in the slice via the diff-dispatch reducers
- [ ] `ExtensionMounter` does NOT expose `getMounted()`; strategies and consumers read mount-set state via `registry.getMountedExtensions(domainId)` (the canonical owner)
- [ ] `DomainContext` exposes `mounter`, `lifecycleTrigger`, and `registerHandler`; the public registry methods `triggerLifecycleStage`, `triggerDomainLifecycleStage`, `triggerDomainOwnLifecycleStage` do NOT exist on `MfeRegistry`
- [ ] `registry.getMounter(domainId)` returns the per-domain `ExtensionMounter` instance; consumers (e.g., `ExtensionDomainSlot`) call `mounter.attach(element)` and `mounter.detach()`
- [ ] `DomainContext` invalidation is mechanical: calling `ctx.mounter` after `registerDomain` returns throws `Error("DomainContext invalidated after registration")`; calling `ctx.registerHandler` after `registerDomain` returns throws `Error("DomainContext.registerHandler called after registration")`; strategies that captured the mounter inside the implementation's constructor continue to function
