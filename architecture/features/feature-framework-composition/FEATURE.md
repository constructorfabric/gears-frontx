# Feature: Framework Composition

<!-- artifact-version: 1.2 -->


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Application Bootstrap](#application-bootstrap)
  - [Plugin Registration with Dependency Enforcement](#plugin-registration-with-dependency-enforcement)
  - [Convenience Full-Preset Bootstrap](#convenience-full-preset-bootstrap)
  - [Theme Change and MFE Propagation](#theme-change-and-mfe-propagation)
  - [Language Change and MFE Propagation](#language-change-and-mfe-propagation)
  - [MFE Extension Registration](#mfe-extension-registration)
  - [MFE Extension Lifecycle (Load / Mount / Unmount)](#mfe-extension-lifecycle-load--mount--unmount)
  - [Shared Property Broadcast](#shared-property-broadcast)
  - [App Configuration via Events](#app-configuration-via-events)
  - [Application Teardown](#application-teardown)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Builder Dependency Resolution (Topological Sort)](#builder-dependency-resolution-topological-sort)
  - [Plugin Provides Aggregation](#plugin-provides-aggregation)
  - [GTS Shared Property Validation](#gts-shared-property-validation)
  - [Base Path Resolution](#base-path-resolution)
  - [Mount-Set Diff Dispatch](#mount-set-diff-dispatch)
  - [Mock Mode Toggle](#mock-mode-toggle)
- [4. States (CDSL)](#4-states-cdsl)
  - [MFE Extension Registration State](#mfe-extension-registration-state)
  - [MFE Domain Mount State](#mfe-domain-mount-state)
  - [Plugin Builder State](#plugin-builder-state)
  - [Tenant State](#tenant-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Builder API and Plugin System](#builder-api-and-plugin-system)
  - [Layout Orchestration](#layout-orchestration)
  - [App Configuration and Event-Driven API](#app-configuration-and-event-driven-api)
  - [Theme and Language Propagation to MFEs](#theme-and-language-propagation-to-mfes)
  - [Microfrontends Plugin and MFE Lifecycle](#microfrontends-plugin-and-mfe-lifecycle)
  - [Shared Property Broadcast with GTS Validation](#shared-property-broadcast-with-gts-validation)
  - [Presets](#presets)
  - [SDK Re-exports and Convenience Surface](#sdk-re-exports-and-convenience-surface)
  - [GTS Derived Schemas for Application-Layer Registration](#gts-derived-schemas-for-application-layer-registration)
- [6. Acceptance Criteria](#6-acceptance-criteria)
- [Additional Context](#additional-context)
  - [Plugin Lifecycle Sequence](#plugin-lifecycle-sequence)
  - [MFE Effects Initialization Exception](#mfe-effects-initialization-exception)
  - [Shared Property Late Registration Limitation](#shared-property-late-registration-limitation)
  - [Single Write Path for Shared Properties](#single-write-path-for-shared-properties)
  - [HAI3Config Fields](#hai3config-fields)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-framework-composition`

- [x] `p2` - `cpt-frontx-feature-framework-composition`
---

## 1. Feature Context

### 1.1 Overview

Framework Composition is the L2 layer that stitches together the four L1 SDK packages (`@cyberfabric/state`, `@cyberfabric/screensets`, `@cyberfabric/api`, `@cyberfabric/i18n`) into a cohesive, production-ready application framework. It does this through a plugin architecture centered on the `createHAI3()` builder: the host application chains `.use(plugin)` calls and calls `.build()` to produce an assembled `HAI3App` instance that owns a Redux store, theme registry, i18n registry, API registry, MFE-enabled screensets registry, and a complete set of typed actions.

**Problem this solves**: Without this layer each application would manually wire state slices, event subscriptions, registries, and lifecycle hooks across four packages — a complex and error-prone process that produces inconsistent patterns across projects.

**Primary value**: A single call to `createHAI3App()` (or a composed `.use()` chain) yields a framework instance that the React layer (`@cyberfabric/react`) can consume directly, with all cross-cutting concerns (theme, language, MFE lifecycle, mock mode, layout state) already coordinated.

**Key assumptions**:
- Applications run in a browser environment; no SSR.
- Each plugin declares name and optional dependencies; the builder performs topological ordering.
- The framework has no React dependency — all React integration lives in `@cyberfabric/react` (L3).

### 1.2 Purpose

Enable host applications to compose a fully-wired FrontX framework instance by assembling plugins via a fluent builder API, with theme/language propagation to MFEs, GTS-validated shared property broadcast, layout state management, and base-path-aware navigation configuration — all without modifying framework source code.

**Success criteria**: A host application initializes a complete FrontX framework instance with one function call; plugins register slices and effects without order dependency; theme and language changes propagate to all registered MFE domains within the same synchronous call chain.

### 1.3 Actors

- `cpt-frontx-actor-host-app`
- `cpt-frontx-actor-framework-plugin`
- `cpt-frontx-actor-developer`
- `cpt-frontx-actor-runtime`
- `cpt-frontx-actor-microfrontend`
- `cpt-frontx-actor-gts-plugin`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — entry 2.6
- PRD: [PRD.md](../../PRD.md) — sections 5.2 (App Configuration), 5.10 (Shared Property Broadcast), 5.11 (Shared Property Validation), 5.18 (Microfrontend Plugin)
- Design component: `cpt-frontx-component-framework`
- Sequences: `cpt-frontx-seq-app-bootstrap`, `cpt-frontx-seq-shared-property-broadcast`
- ADRs: `cpt-frontx-adr-plugin-based-framework-composition`, `cpt-frontx-adr-four-layer-sdk-architecture`, `cpt-frontx-adr-global-shared-property-broadcast`, `cpt-frontx-adr-domain-implementation-mount-strategies` — drives the per-domain ordered-list slice shape and the diff-dispatch sync wrapper algorithm (issue cyberfabric/frontx#278)

---

## 2. Actor Flows (CDSL)

### Application Bootstrap

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-app-bootstrap`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-runtime`

1. [ ] `p1` - Host calls `createHAI3(config?)` to obtain a builder instance - `inst-create-builder`
2. [ ] `p1` - Host chains one or more `.use(plugin)` calls, each appending a resolved plugin to the pending list - `inst-use-plugin`
3. [ ] `p1` - **IF** a plugin with the same name is already registered **RETURN** silently (skip duplicate) - `inst-dedup-plugin`
4. [ ] `p1` - Host calls `.build()`, which triggers dependency resolution via topological sort - `inst-build`
5. [ ] `p1` - **FOR EACH** plugin in dependency order: invoke `onRegister(builder, config)` if present - `inst-on-register`
6. [ ] `p1` - Aggregate all `provides.registries`, `provides.slices`, `provides.effects`, and `provides.actions` from all plugins - `inst-aggregate-provides`
7. [ ] `p1` - Obtain or create the shared Redux store; register all aggregated slices via `registerSlice()` - `inst-create-store`
8. [ ] `p1` - **FOR EACH** aggregated effect initializer: invoke with `store.dispatch` - `inst-init-effects`
9. [ ] `p1` - Assemble the `HAI3App` object from aggregated registries, store, and actions - `inst-assemble-app`
10. [ ] `p1` - **FOR EACH** plugin in dependency order: invoke `onInit(app)` if present - `inst-on-init`
11. [ ] `p1` - **RETURN** the fully assembled `HAI3App` - `inst-return-app`

### Plugin Registration with Dependency Enforcement

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-plugin-dependency`

**Actors**: `cpt-frontx-actor-framework-plugin`, `cpt-frontx-actor-host-app`

1. [ ] `p1` - Builder receives a plugin instance or factory; resolves factory if needed - `inst-resolve-factory`
2. [ ] `p1` - During `build()` topological sort, visit each plugin's declared `dependencies` array - `inst-visit-deps`
3. [ ] `p1` - **IF** a declared dependency name is not found among registered plugins AND `strictMode` is `true` **RETURN** error `"Plugin X requires Y but it is not registered"` - `inst-strict-dep-error`
4. [ ] `p1` - **IF** a declared dependency name is not found AND `strictMode` is `false`: log warning, continue - `inst-lax-dep-warn`
5. [ ] `p1` - **IF** circular dependency detected during DFS traversal **RETURN** error `"Circular dependency detected"` - `inst-circular-error`
6. [ ] `p1` - Add plugin to resolved list only after all dependencies are already resolved - `inst-topo-order`

### Convenience Full-Preset Bootstrap

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-full-preset`

**Actors**: `cpt-frontx-actor-host-app`

1. [ ] `p1` - Host calls `createHAI3App(config?)` - `inst-call-createapp`
2. [ ] `p1` - `createHAI3App` delegates to `createHAI3(config).useAll(full(presetConfig)).build()` - `inst-delegate-full`
3. [ ] `p1` - `full()` preset returns the canonical plugin set: `effects`, `screensets`, `themes`, `layout`, `i18n`, `queryCache`, `mock`, `microfrontends` - `inst-full-plugin-set`
4. [ ] `p1` - **RETURN** fully assembled `HAI3App` - `inst-return-full-app`

### Theme Change and MFE Propagation

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-theme-propagation`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-framework-plugin`, `cpt-frontx-actor-microfrontend`

1. [ ] `p1` - Host or developer calls `app.actions.changeTheme({ themeId })` - `inst-call-change-theme`
2. [ ] `p1` - Action emits `theme/changed` event on the event bus - `inst-emit-theme-changed`
3. [ ] `p1` - The `themes` plugin's `onInit` handler receives the event - `inst-themes-plugin-handler`
4. [ ] `p1` - Handler calls `themeRegistry.apply(themeId)` to update the in-process theme - `inst-apply-theme`
5. [ ] `p1` - **TRY** call `mfeRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, themeId)` to broadcast to all MFE domains - `inst-broadcast-theme`
6. [ ] `p1` - **CATCH** log error `"[FrontX] Failed to propagate theme to MFE domains"` without re-throwing - `inst-catch-theme-error`

### Language Change and MFE Propagation

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-i18n-propagation`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-framework-plugin`, `cpt-frontx-actor-microfrontend`

1. [ ] `p1` - Host or developer calls `app.actions.setLanguage({ language })` - `inst-call-set-language`
2. [ ] `p1` - Action emits `i18n/language/changed` event on the event bus - `inst-emit-lang-changed`
3. [ ] `p1` - The `i18n` plugin's `onInit` handler receives the event - `inst-i18n-plugin-handler`
4. [ ] `p1` - Handler calls `i18nRegistry.setLanguage(language)` asynchronously - `inst-set-language`
5. [ ] `p1` - **TRY** call `mfeRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_LANGUAGE, language)` to broadcast to all MFE domains - `inst-broadcast-lang`
6. [ ] `p1` - **CATCH** log error `"[FrontX] Failed to propagate language to MFE domains"` without re-throwing - `inst-catch-lang-error`

### MFE Extension Registration

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-mfe-registration`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`

1. [ ] `p1` - Host calls `app.actions.registerExtension(extension)` - `inst-call-register-ext`
2. [ ] `p1` - Action emits `mfe/registerExtensionRequested` event on the event bus - `inst-emit-register-event`
3. [ ] `p1` - MFE effects handler receives the event; dispatches `setExtensionRegistering` to the MFE slice - `inst-dispatch-registering`
4. [ ] `p1` - **TRY** handler calls `mfeRegistry.registerExtension(extension)` - `inst-call-registry-register`
5. [ ] `p1` - On success: dispatch `setExtensionRegistered` to the MFE slice - `inst-dispatch-registered`
6. [ ] `p1` - **CATCH** dispatch `setExtensionError` with error message to the MFE slice - `inst-dispatch-register-error`

### MFE Extension Lifecycle (Load / Mount / Unmount)

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-mfe-lifecycle`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`

1. [ ] `p1` - Host calls `app.actions.loadExtension(extensionId)` - `inst-call-load-ext`
2. [ ] `p1` - Action resolves the domain ID from the registered extension; calls `mfeRegistry.executeActionsChain` with `gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.load_ext.v1~` — fire-and-forget - `inst-execute-load-chain`
3. [ ] `p1` - Host calls `app.actions.mountExtension(extensionId)` - `inst-call-mount-ext`
4. [ ] `p1` - Action resolves domain ID; calls `executeActionsChain` with `gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.mount_ext.v1~` - `inst-execute-mount-chain`
5. [ ] `p1` - On chain completion (success or failure), the plugin's sync wrapper runs `cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`: it snapshots `getMountedExtensions(domainId)` before and after the chain, computes `added = after \ before` and `removed = before \ after`, and dispatches one `addExtensionMounted({ domainId, extensionId })` per element of `added` and one `removeExtensionMounted({ domainId, extensionId })` per element of `removed` to the MFE slice. There is no scalar `setExtensionMounted` reducer - `inst-dispatch-mount-diff`
6. [ ] `p2` - Host calls `app.actions.unmountExtension(extensionId)` - `inst-call-unmount-ext`
7. [ ] `p2` - Action resolves domain ID; calls `executeActionsChain` with `gts.hai3.mfes.comm.action.v1~hai3.mfes.ext.unmount_ext.v1~` - `inst-execute-unmount-chain`
8. [ ] `p2` - On chain completion the same set-diff dispatch in step 5 fires for the unmount action — the removed extension produces a `removeExtensionMounted({ domainId, extensionId })` reducer call. There is no scalar `setExtensionUnmounted` reducer - `inst-dispatch-unmount-diff`

### Shared Property Broadcast

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-shared-property-broadcast`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-gts-plugin`, `cpt-frontx-actor-microfrontend`

1. [ ] `p1` - A framework plugin (or host) calls `mfeRegistry.updateSharedProperty(propertyId, value)` - `inst-call-update-sp`
2. [ ] `p1` - Registry performs GTS validation via algorithm `cpt-frontx-algo-framework-composition-gts-validation` — BEFORE any propagation - `inst-validate-sp`
3. [ ] `p1` - **IF** validation fails **RETURN** throw error with validation details; property is NOT stored and NOT propagated - `inst-sp-validation-fail`
4. [ ] `p1` - **FOR EACH** registered domain whose `sharedProperties` array includes `propertyId`: propagate the validated value to all domain subscribers - `inst-broadcast-sp`
5. [ ] `p1` - Domains that do NOT declare `propertyId` in their `sharedProperties` array receive NO update - `inst-sp-domain-filter`
6. [ ] `p1` - **IF** no matching domains exist: silently succeed (no-op) - `inst-sp-noop`

### App Configuration via Events

- [x] `p1` - **ID**: `cpt-frontx-flow-framework-composition-app-config`

**Actors**: `cpt-frontx-actor-host-app`

1. [ ] `p1` - Host emits a tenant event on the event bus: `app/tenant/changed` with `{ tenant: Tenant }` payload - `inst-emit-tenant`
2. [ ] `p1` - Tenant effect handler receives the event and dispatches `setTenant(tenant)` to the tenant slice - `inst-tenant-reducer`
3. [ ] `p1` - Host emits `app/tenant/cleared` to remove tenant context; tenant slice resets to `null` - `inst-tenant-cleared`
4. [ ] `p2` - Host calls layout visibility actions (`setFooterVisible`, `setMenuVisible`, `setSidebarVisible`) to control layout regions - `inst-layout-visibility`

### Application Teardown

- [x] `p2` - **ID**: `cpt-frontx-flow-framework-composition-teardown`

**Actors**: `cpt-frontx-actor-host-app`

1. [ ] `p2` - Host calls `app.destroy()` - `inst-call-destroy`
2. [ ] `p2` - Builder iterates plugins in reverse initialization order; invokes `onDestroy(app)` for each that defines it - `inst-call-on-destroy`
3. [ ] `p2` - MFE effects cleanup: all event subscriptions unsubscribed - `inst-mfe-cleanup`

---

## 3. Processes / Business Logic (CDSL)

### Builder Dependency Resolution (Topological Sort)

- [x] `p1` - **ID**: `cpt-frontx-algo-framework-composition-dep-resolution`

1. [ ] `p1` - Maintain a `visited` set (fully resolved) and a `visiting` set (in-progress DFS) — both keyed by plugin name - `inst-init-visited-sets`
2. [ ] `p1` - **FOR EACH** registered plugin: call `visit(plugin)` - `inst-visit-each`
3. [ ] `p1` - **IF** plugin name is in `visited`: **RETURN** (already resolved) - `inst-skip-visited`
4. [ ] `p1` - **IF** plugin name is in `visiting`: **RETURN** error "Circular dependency detected" - `inst-detect-cycle`
5. [ ] `p1` - Add plugin name to `visiting` - `inst-add-visiting`
6. [ ] `p1` - **FOR EACH** name in `plugin.dependencies`: find the plugin object; **IF** not found handle per `strictMode`; otherwise recursively call `visit(dep)` - `inst-visit-dep`
7. [ ] `p1` - Remove plugin name from `visiting`; add to `visited`; append plugin to resolved output list - `inst-finalize-plugin`
8. [ ] `p1` - **RETURN** resolved list (dependencies guaranteed before dependents) - `inst-return-ordered`

### Plugin Provides Aggregation

- [x] `p1` - **ID**: `cpt-frontx-algo-framework-composition-provides-aggregation`

1. [ ] `p1` - Initialize empty `registries` record, `slices` array, `effects` array, `actions` partial object - `inst-init-accumulators`
2. [ ] `p1` - **FOR EACH** plugin in resolved order: **IF** `plugin.provides` is absent skip to next - `inst-check-provides`
3. [ ] `p1` - **IF** `provides.registries` present: merge into `registries` via `Object.assign` - `inst-merge-registries`
4. [ ] `p1` - **IF** `provides.slices` present: push all slices into `slices` array - `inst-collect-slices`
5. [ ] `p1` - **IF** `provides.effects` present: push all effect initializers into `effects` array - `inst-collect-effects`
6. [ ] `p1` - **IF** `provides.actions` present: merge into `actions` via `Object.assign` (later plugins override earlier on name collision) - `inst-merge-actions`
7. [ ] `p1` - **RETURN** `{ registries, slices, effects, actions }` - `inst-return-aggregated`

### GTS Shared Property Validation

- [x] `p1` - **ID**: `cpt-frontx-algo-framework-composition-gts-validation`

1. [ ] `p1` - Construct `ephemeralId` by appending the runtime suffix to the property type ID: `ephemeralId = "${propertyTypeId}hai3.mfes.comm.runtime.v1"` - `inst-build-ephemeral-id`
2. [ ] `p1` - Call `typeSystem.register({ id: ephemeralId, value })`; `register()` both registers the candidate instance (overwriting any prior registration for the same deterministic ID) AND validates it against the schema derived from the chained instance ID in a single call - `inst-gts-register`
3. [ ] `p1` - **IF** the value does not conform to the schema, `register()` throws a plain `Error` whose message carries instance JSON, resolved schema JSON, and the failure reason; the caller re-throws and propagation is blocked - `inst-gts-reject`
4. [ ] `p1` - **IF** `register()` returns normally: propagation may proceed - `inst-gts-accept`
5. [ ] `p1` - This algorithm MAY be called once per `updateSharedProperty` invocation even when multiple domains declare the same property (single-validation optimization) - `inst-single-validation`
6. [ ] `p1` - **IF** the schema for `propertyTypeId` has never been registered in GTS: `register()` throws; treat as configuration error — all property type schemas must be loaded before use - `inst-unregistered-schema-error`

### Base Path Resolution

- [x] `p1` - **ID**: `cpt-frontx-algo-framework-composition-base-path`

1. [ ] `p1` - Receive raw `base` string from `HAI3Config`; **IF** empty or undefined **RETURN** `"/"` - `inst-empty-base`
2. [ ] `p1` - **IF** `base` does not start with `"/"`: prepend `"/"` - `inst-add-leading-slash`
3. [ ] `p1` - **IF** normalized value is not `"/"` AND ends with `"/"`: remove trailing slash - `inst-remove-trailing-slash`
4. [ ] `p1` - **RETURN** normalized base path - `inst-return-base`
5. [ ] `p1` - Strip operation: given `pathname` and `base`, **IF** `base` is `"/"` **RETURN** `pathname` unchanged - `inst-strip-root-base`
6. [ ] `p1` - **IF** `pathname` does not start with `base` **RETURN** `null` (no match) - `inst-strip-no-match`
7. [ ] `p1` - **IF** character immediately after `base` prefix in `pathname` is neither end-of-string nor `"/"`: **RETURN** `null` (partial segment match) - `inst-strip-partial-match`
8. [ ] `p1` - **RETURN** remainder of `pathname` after stripping `base`; use `"/"` if exact match - `inst-strip-return`

### Mount-Set Diff Dispatch

- [x] `p1` - **ID**: `cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`

Computes the per-domain mount-set delta around an action chain completion and dispatches one reducer call per element of the diff. Replaces the previous scalar before/after compare in `packages/framework/src/plugins/microfrontends/index.ts:137-157` (per ADR `cpt-frontx-adr-domain-implementation-mount-strategies`).

`executeActionsChain` is NOT serialized at the domain level — concurrent chains for the same multi-mount domain are permitted. Eventual consistency under interleaving is preserved because the slice reducers are **idempotent** (`addExtensionMounted` is append-if-absent; `removeExtensionMounted` is no-op-if-absent — see `cpt-frontx-dod-framework-composition-mfe-plugin`). Two concurrent chains that both observe `[extB]` in their `added` set produce two `addExtensionMounted({ domainId, extensionId: extB })` dispatches; the first inserts, the second is a no-op — final slice state matches `registry.getMountedExtensions(domainId)`.

1. [ ] `p1` - Resolve `domainId` from the chain's action target — only mount/unmount actions targeting a registered domain are eligible; other action types are skipped - `inst-mount-diff-resolve-domain`
2. [ ] `p1` - **BEFORE** invoking the chain: snapshot `before = new Set(registry.getMountedExtensions(domainId))` - `inst-mount-diff-snapshot-before`
3. [ ] `p1` - **AWAIT** the chain to complete (success or recorded failure) - `inst-mount-diff-await-chain`
4. [ ] `p1` - **AFTER** the chain settles: snapshot `after = new Set(registry.getMountedExtensions(domainId))` - `inst-mount-diff-snapshot-after`
5. [ ] `p1` - Compute `added = after \ before` (set difference: elements in `after` not in `before`) - `inst-mount-diff-compute-added`
6. [ ] `p1` - Compute `removed = before \ after` (set difference: elements in `before` not in `after`) - `inst-mount-diff-compute-removed`
7. [ ] `p1` - **FOR EACH** `extensionId` in `added`: dispatch `addExtensionMounted({ domainId, extensionId })` to the MFE slice — append-if-absent reducer (idempotent under concurrent dispatch) - `inst-mount-diff-dispatch-added`
8. [ ] `p1` - **FOR EACH** `extensionId` in `removed`: dispatch `removeExtensionMounted({ domainId, extensionId })` to the MFE slice — no-op-if-absent reducer (idempotent under concurrent dispatch) - `inst-mount-diff-dispatch-removed`

---

### Mock Mode Toggle

- [x] `p2` - **ID**: `cpt-frontx-algo-framework-composition-mock-toggle`

1. [ ] `p2` - Host calls `app.actions.toggleMockMode(enabled)` - `inst-call-toggle-mock`
2. [ ] `p2` - Action emits a mock-toggle event on the event bus - `inst-emit-mock-event`
3. [ ] `p2` - Mock effects handler dispatches `setMockEnabled(enabled)` to the mock slice - `inst-mock-reducer`
4. [ ] `p2` - Effect iterates all registered API service plugins; activates/deactivates plugins where `isMockPlugin(plugin)` is `true` - `inst-toggle-mock-plugins`

---

## 4. States (CDSL)

### MFE Extension Registration State

- [x] `p1` - **ID**: `cpt-frontx-state-framework-composition-mfe-registration`

Tracked in `state.mfe.registrationStates[extensionId]`.

1. [ ] `p1` - **FROM** `unregistered` **TO** `registering` **WHEN** `registerExtension` action is dispatched - `inst-to-registering`
2. [ ] `p1` - **FROM** `registering` **TO** `registered` **WHEN** `mfeRegistry.registerExtension()` resolves successfully - `inst-to-registered`
3. [ ] `p1` - **FROM** `registering` **TO** `error` **WHEN** `mfeRegistry.registerExtension()` throws - `inst-to-error`
4. [ ] `p1` - **FROM** `registered` **TO** `unregistered` **WHEN** `unregisterExtension` action succeeds - `inst-to-unregistered`
5. [ ] `p1` - **FROM** any state **TO** `error` **WHEN** `unregisterExtension` throws - `inst-unreg-error`

### MFE Domain Mount State

- [x] `p1` - **ID**: `cpt-frontx-state-framework-composition-mfe-mount`

Tracked in `state.mfe.mountedExtensions[domainId]` as a per-domain insertion-ordered `string[]` of currently-mounted extension IDs. The slice never stores `undefined` for a registered domain; it stores `[]`.

1. [ ] `p1` - **FROM** `[...prev]` **TO** `[...prev, extensionId]` **WHEN** the mount-set diff dispatch (`cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`) emits `addExtensionMounted({ domainId, extensionId })` after a chain completion - `inst-domain-add-mounted`
2. [ ] `p1` - **FROM** `[..., extensionId, ...]` **TO** `[...prev without extensionId]` **WHEN** the mount-set diff dispatch emits `removeExtensionMounted({ domainId, extensionId })` after a chain completion - `inst-domain-remove-mounted`
3. [ ] `p1` - **FROM** `[]` **TO** `[]` (no-op) **WHEN** a chain completion produces no diff (e.g., idempotent mount of an already-mounted extension under `OptionalMountStrategy` / `ExclusiveMountStrategy`) - `inst-domain-mount-noop`

### Plugin Builder State

- [x] `p1` - **ID**: `cpt-frontx-state-framework-composition-builder`

Lifecycle state of the `HAI3AppBuilder` instance.

1. [ ] `p1` - **FROM** `composing` (initial) **TO** `composing` **WHEN** `.use(plugin)` is called — builder returns `this` for chaining - `inst-composing`
2. [ ] `p1` - **FROM** `composing` **TO** `built` **WHEN** `.build()` is called and succeeds - `inst-built`
3. [ ] `p1` - **FROM** `composing` **TO** `error` **WHEN** `.build()` throws (circular dependency or missing strict dep) - `inst-build-error`

### Tenant State

- [x] `p1` - **ID**: `cpt-frontx-state-framework-composition-tenant`

Tracked in `state.tenant`.

1. [ ] `p1` - **FROM** `{ tenant: null, loading: false }` (initial) **TO** `{ tenant: null, loading: true }` **WHEN** `setTenantLoadingState(true)` is dispatched - `inst-tenant-loading`
2. [ ] `p1` - **FROM** `{ loading: true }` **TO** `{ tenant: Tenant, loading: false }` **WHEN** `changeTenant(tenant)` event is handled - `inst-tenant-set`
3. [ ] `p1` - **FROM** any **TO** `{ tenant: null, loading: false }` **WHEN** `clearTenantAction()` event is handled - `inst-tenant-cleared`

---

## 5. Definitions of Done

### Builder API and Plugin System

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-builder`

Host applications can compose a FrontX framework instance by chaining `.use(plugin)` calls on the builder returned by `createHAI3()` and calling `.build()`. The builder resolves plugin dependencies topologically, aggregates all slice/effect/action/registry contributions, creates the Redux store, and returns a `HAI3App` with fully initialized registries and actions. Duplicate plugins (same name) are silently ignored. Circular dependencies throw immediately. Missing dependencies throw in `strictMode` or warn otherwise.

**API surface**:
- `createHAI3(config?: HAI3Config): HAI3AppBuilder`
- `HAI3AppBuilder.use(plugin): HAI3AppBuilder`
- `HAI3AppBuilder.useAll(plugins): HAI3AppBuilder`
- `HAI3AppBuilder.build(): HAI3App`
- `createHAI3App(config?: HAI3AppConfig): HAI3App` (convenience, uses `full()` preset)

**Implements**:
- `cpt-frontx-flow-framework-composition-app-bootstrap`
- `cpt-frontx-flow-framework-composition-plugin-dependency`
- `cpt-frontx-flow-framework-composition-full-preset`
- `cpt-frontx-algo-framework-composition-dep-resolution`
- `cpt-frontx-algo-framework-composition-provides-aggregation`
- `cpt-frontx-state-framework-composition-builder`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-framework-layer`
- `cpt-frontx-fr-sdk-plugin-arch`
- `cpt-frontx-fr-sdk-layer-deps`

**Covers (DESIGN)**:
- `cpt-frontx-principle-plugin-first-composition`
- `cpt-frontx-principle-layer-isolation`
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-framework`
- `cpt-frontx-seq-app-bootstrap`

---

### Layout Orchestration

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-layout`

The `layout()` plugin registers Redux slices for all six layout domains (header, footer, menu, sidebar, popup, overlay), subscribes to layout events on the event bus, and dispatches corresponding reducer actions to keep state consistent. All layout state types are exported from `@cyberfabric/framework`.

**Layout domains and their slices**:
- `header`: `HeaderState` — user info, loading
- `footer`: `FooterState` — visible flag
- `menu`: `MenuState` — collapsed, items, visible
- `sidebar`: `SidebarState` — collapsed, position, title, content, visible, width
- `popup`: stack of `PopupState` — id, title, component, props, zIndex
- `overlay`: `OverlayState` — visible

**Covers (PRD)**:
- `cpt-frontx-fr-appconfig-layout-visibility`

**Covers (DESIGN)**:
- `cpt-frontx-component-framework`

---

### App Configuration and Event-Driven API

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-app-config`

The framework provides an event-driven API for configuring tenant, language, theme, and navigation. All configuration changes propagate via the event bus rather than direct state mutation. The `Tenant` type has shape `{ id: string }` and tenant state is typed `Tenant | null`. Router mode is configurable via `HAI3Config.routerMode` (`'browser'` | `'hash'` | `'memory'`). Base path normalization handles leading slash insertion, trailing slash removal, and empty-string-to-root conversion.

**Events**:
- `app/tenant/changed` → `setTenant(tenant)` in tenant slice
- `app/tenant/cleared` → `clearTenant()` in tenant slice
- `theme/changed` → `themeRegistry.apply(themeId)`
- `i18n/language/changed` → `i18nRegistry.setLanguage(language)`

**Implements**:
- `cpt-frontx-flow-framework-composition-app-config`
- `cpt-frontx-algo-framework-composition-base-path`
- `cpt-frontx-state-framework-composition-tenant`

**Covers (PRD)**:
- `cpt-frontx-fr-appconfig-tenant`
- `cpt-frontx-fr-appconfig-event-api`
- `cpt-frontx-fr-appconfig-router-config`
- `cpt-frontx-fr-appconfig-layout-visibility`

**Covers (DESIGN)**:
- `cpt-frontx-principle-event-driven-architecture`
- `cpt-frontx-component-framework`

---

### Theme and Language Propagation to MFEs

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-propagation`

When the host changes theme or language, the respective plugin propagates the new value to all registered MFE domains by calling `mfeRegistry.updateSharedProperty()` with the appropriate shared property constant. Errors from the registry call are caught and logged; they never crash the host application. On initialization, the `themes()` plugin applies the first registered theme; the `i18n()` plugin loads English translations in the background.

**Shared property constants**:
- `HAI3_SHARED_PROPERTY_THEME` (`gts.hai3.mfes.comm.shared_property.v1~hai3.mfes.comm.theme.v1~`)
- `HAI3_SHARED_PROPERTY_LANGUAGE` (`gts.hai3.mfes.comm.shared_property.v1~hai3.mfes.comm.language.v1~`)

**Implements**:
- `cpt-frontx-flow-framework-composition-theme-propagation`
- `cpt-frontx-flow-framework-composition-i18n-propagation`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-theme-propagation`
- `cpt-frontx-fr-mfe-i18n-propagation`
- `cpt-frontx-nfr-rel-error-handling`

**Covers (DESIGN)**:
- `cpt-frontx-component-framework`
- `cpt-frontx-seq-shared-property-broadcast`

---

### Microfrontends Plugin and MFE Lifecycle

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-mfe-plugin`

The `microfrontends()` plugin accepts `MicrofrontendsConfig` with required `typeSystem: TypeSystemPlugin` and optional `mfeHandlers: MfeHandler[]`. It builds a `MfeRegistry` instance via `mfeRegistryFactory.build({ typeSystem: config.typeSystem, mfeHandlers: config.mfeHandlers })` — the plugin does NOT import or hardcode any specific `TypeSystemPlugin` implementation. It exposes the registry as `app.mfeRegistry`. It registers the `mfe` Redux slice tracking per-extension registration state (`unregistered` | `registering` | `registered` | `error`) and per-domain mount state. The mount-state slot has shape `mountedExtensions: Record<string, string[]>` (per-domain insertion-ordered array of extension IDs). The slice exposes reducers `addExtensionMounted({ domainId, extensionId })` / `removeExtensionMounted({ domainId, extensionId })` and selector `selectMountedExtensions(state, domainId): readonly string[]`. The previous scalar reducers `setExtensionMounted` / `setExtensionUnmounted` and the previous selector `selectMountedExtension` do NOT exist.

**Idempotent reducer contract** (required for safe concurrent diff-dispatch under unserialized action chains):

- `addExtensionMounted({ domainId, extensionId })` is **append-if-absent**: if `extensionId` is already present in `state.mfe.mountedExtensions[domainId]`, the reducer is a no-op (it does NOT throw and does NOT append a duplicate).
- `removeExtensionMounted({ domainId, extensionId })` is **no-op-if-absent**: if `extensionId` is not present in `state.mfe.mountedExtensions[domainId]`, the reducer is a no-op (it does NOT throw).

These idempotency guarantees combined with the diff-dispatch algorithm produce eventually-consistent slice state under interleaved chains for the same multi-mount domain — the slice always converges to `registry.getMountedExtensions(domainId)`.

The plugin wires MFE lifecycle actions (`loadExtension`, `mountExtension`, `unmountExtension`, `registerExtension`, `unregisterExtension`) into the FrontX actions map. The plugin intercepts `executeActionsChain` completions for mount/unmount actions and runs the mount-set diff dispatch (`cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`): it snapshots `registry.getMountedExtensions(domainId)` before and after each chain, computes per-domain `added` and `removed` sets, and dispatches one `addExtensionMounted` per added element and one `removeExtensionMounted` per removed element.

**Domain constants** (GTS instance IDs):
- `HAI3_SCREEN_DOMAIN` — main content area
- `HAI3_SIDEBAR_DOMAIN` — collapsible side panel
- `HAI3_POPUP_DOMAIN` — modal dialogs
- `HAI3_OVERLAY_DOMAIN` — full-screen overlay

**Implements**:
- `cpt-frontx-flow-framework-composition-mfe-registration`
- `cpt-frontx-flow-framework-composition-mfe-lifecycle`
- `cpt-frontx-state-framework-composition-mfe-registration`
- `cpt-frontx-state-framework-composition-mfe-mount`
- `cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-plugin`
- `cpt-frontx-fr-mfe-dynamic-registration`

**Covers (DESIGN)**:
- `cpt-frontx-component-framework`
- `cpt-frontx-seq-app-bootstrap`

---

### Shared Property Broadcast with GTS Validation

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-shared-property`

`MfeRegistry.updateSharedProperty(propertyId, value)` is the sole write path for shared property values. The implementation validates the value against the GTS-derived schema before any propagation. Validation is performed by `typeSystem.register({ id: ephemeralId, value })` — a single call that registers the ephemeral instance AND validates it against the schema derived from the chained instance ID — where `ephemeralId = "${propertyTypeId}hai3.mfes.comm.runtime.v1"`. If the value does not conform to the schema, `register()` throws a plain `Error` with a rich diagnostic (instance JSON, resolved schema JSON, failure reason) and no domain receives the update. Only domains whose `sharedProperties` array includes `propertyId` receive the update. No matching domains is a silent no-op. The deprecated `updateDomainProperty()` and `updateDomainProperties()` methods do NOT exist on the abstract class or implementation.

**Implements**:
- `cpt-frontx-flow-framework-composition-shared-property-broadcast`
- `cpt-frontx-algo-framework-composition-gts-validation`

**Covers (PRD)**:
- `cpt-frontx-fr-broadcast-write-api`
- `cpt-frontx-fr-broadcast-matching`
- `cpt-frontx-fr-broadcast-validate`
- `cpt-frontx-fr-validation-gts`
- `cpt-frontx-fr-validation-reject`
- `cpt-frontx-nfr-sec-type-validation`

**Covers (DESIGN)**:
- `cpt-frontx-component-framework`
- `cpt-frontx-seq-shared-property-broadcast`

---

### Presets

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-presets`

Three presets are provided as functions returning `HAI3Plugin[]`:
- `full(config?)` — all plugins (`effects`, `themes`, `layout`, `i18n`, `queryCache`, `mock`, `microfrontends`)
- `minimal()` — `themes` only

All presets are exported from `@cyberfabric/framework`. The `presets` object collects all under named keys.

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-plugin-arch`

**Covers (DESIGN)**:
- `cpt-frontx-principle-plugin-first-composition`

---

### SDK Re-exports and Convenience Surface

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-reexports`

`@cyberfabric/framework` re-exports the public API of all four L1 packages so that consumers can import from a single entry point. Re-exported symbols include:
- From `@cyberfabric/state`: `eventBus`, `createStore`, `getStore`, `registerSlice`, `hasSlice`, `createSlice`, and all related types
- From `@cyberfabric/screensets`: `MfeRegistry`, `mfeRegistryFactory`, `MfeHandler`, `MfeBridgeFactory`, `LayoutDomain`, action/property constants, type contracts
- From `@cyberfabric/api`: `apiRegistry`, `BaseApiService`, `RestProtocol`, `SseProtocol`, mock plugins, type guards, `StreamDescriptor`, `StreamStatus`
- From `@cyberfabric/i18n`: `i18nRegistry`, `Language`, `SUPPORTED_LANGUAGES`, all formatters

The framework does NOT export `createAction` to consumers; actions are handwritten functions.

---

### GTS Derived Schemas for Application-Layer Registration

- [x] `p1` - **ID**: `cpt-frontx-dod-framework-composition-derived-schemas`

`@cyberfabric/framework` exports three GTS derived schemas (`themeSchema`, `languageSchema`, `extensionScreenSchema`) for application-layer registration. These schemas encode application-level constraints — valid theme values, supported languages, screen extension presentation shape — and are NOT part of the core type system in `@cyberfabric/screensets` (L1). The application registers them on the `TypeSystemPlugin` instance before constructing the FrontX app via `gtsPlugin.registerSchema()`. This keeps the L1 SDK generic and allows projects to substitute custom schemas.

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-shared-property`

**Covers (DESIGN)**:
- `cpt-frontx-component-framework`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-framework-layer`
- `cpt-frontx-nfr-maint-zero-crossdeps`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-no-react-below-l3`

---

## 6. Acceptance Criteria

- [x] `createHAI3().use(pluginA()).use(pluginB()).build()` produces a `HAI3App` with `store`, `themeRegistry`, `i18nRegistry`, `apiRegistry`, `mfeRegistry`, and `actions` all populated
- [x] Plugin dependency ordering is enforced: if `pluginB` declares `dependencies: ['pluginA']`, `pluginA.onInit` is always called before `pluginB.onInit` regardless of `.use()` call order
- [x] Registering the same plugin name twice results in only one plugin in the resolved list (second is silently ignored)
- [x] A circular dependency between two plugins throws an error during `.build()`
- [x] `app.actions.changeTheme({ themeId: 'dark' })` calls `themeRegistry.apply('dark')` AND calls `mfeRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, 'dark')` when the `microfrontends()` plugin is registered
- [x] Errors thrown by `mfeRegistry.updateSharedProperty()` in theme/language propagation are caught and logged; the host application continues without crash
- [x] `mfeRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, 'invalid-theme')` throws a GTS validation error; no domain subscriber receives the value
- [x] `mfeRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, 'dark')` propagates to all domains declaring the property; domains not declaring it receive no update
- [x] `app.actions.registerExtension(ext)` transitions `state.mfe.registrationStates[ext.id]` from `'unregistered'` → `'registering'` → `'registered'`
- [x] A failing `mfeRegistry.registerExtension()` call transitions state to `'error'` with the error message recorded
- [x] Slice `mountedExtensions[domainId]` is `[]` immediately after `registerDomain` returns; subsequent successful mount chains append the extension's `subject` to `state.mfe.mountedExtensions[domainId]` (insertion-ordered string array) via `addExtensionMounted` (append-if-absent); subsequent successful unmount chains remove the named ID via `removeExtensionMounted` (no-op-if-absent); the slice never holds `undefined` for a registered domain. Multi-mount domains backed by `ConcurrentMountStrategy` accumulate multiple IDs in the array; concurrent mount chains for the same multi-mount domain converge to `registry.getMountedExtensions(domainId)` because the reducers are idempotent
- [x] `normalizeBase('/console/')` returns `'/console'`; `normalizeBase('')` returns `'/'`; `normalizeBase('console')` returns `'/console'`
- [x] `stripBase('/console/dashboard', '/console')` returns `'/dashboard'`; `stripBase('/admin/x', '/console')` returns `null`; `stripBase('/console-admin', '/console')` returns `null`
- [x] `createHAI3App()` uses the `full()` preset and returns a valid `HAI3App` without configuration
- [x] `@cyberfabric/framework` has no React import (enforced by `dependency-cruiser`)
- [x] All layout domain types (`HeaderState`, `FooterState`, `MenuState`, `SidebarState`, `PopupState`, `OverlayState`) are exported from `@cyberfabric/framework`

---

## Additional Context

### Plugin Lifecycle Sequence

The three lifecycle hooks are called in a specific order during `build()`:

1. `onRegister(builder, config)` — called before the store is created; plugins may add more plugins to the builder
2. Provides aggregation and store construction occur between step 1 and step 3
3. `onInit(app)` — called after the store is created and all effects are initialized; plugins subscribe to events here

`onDestroy(app)` is called in reverse initialization order when `app.destroy()` is invoked.

### MFE Effects Initialization Exception

The `microfrontends()` plugin does NOT use `provides.effects` for its effect initializers. Effects are initialized manually in `onInit()` so that the cleanup function reference is captured in the plugin closure and exposed via `onDestroy()`. This is intentional: the framework's step-5 effects initialization (from `provides.effects`) would discard the cleanup reference.

### Shared Property Late Registration Limitation

The broadcast model is fire-and-forget: `updateSharedProperty()` propagates only to domains already registered at call time. Domains registered after a broadcast do NOT retroactively receive prior values. The application layer is responsible for re-broadcasting current values after late domain registration if initial state is required.

### Single Write Path for Shared Properties

Shared properties are global — a property ID means the same thing across all domains that declare it, so writes are not domain-targeted. `updateSharedProperty(propertyId, value)` is the only write path; per ADR `cpt-frontx-adr-global-shared-property-broadcast`, propagation is determined by each domain's `sharedProperties` declaration.

### HAI3Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | `'FrontX App'` | Application identifier |
| `devMode` | `boolean` | `false` | Enables duplicate plugin warnings |
| `strictMode` | `boolean` | `false` | Throws on missing plugin dependencies |
| `autoNavigate` | `boolean` | `true` | Auto-route to the first registered route on mount; when `false`, stays on `/` until explicit navigation occurs |
| `base` | `string` | `'/'` | Base path for navigation |
| `routerMode` | `'browser'` \| `'hash'` \| `'memory'` | `'browser'` | Router strategy |
