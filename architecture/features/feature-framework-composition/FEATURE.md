# Feature: Framework Composition


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
  - [No `updateDomainProperty` / `updateDomainProperties`](#no-updatedomainproperty--updatedomainproperties)
  - [HAI3Config Fields](#hai3config-fields)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-hai3-featstatus-framework-composition`

- [x] `p2` - `cpt-hai3-feature-framework-composition`
---

## 1. Feature Context

### 1.1 Overview

Framework Composition is the L2 layer that stitches together the four L1 SDK packages (`@gears-frontx/state`, `@gears-frontx/screensets`, `@gears-frontx/api`, `@gears-frontx/i18n`) into a cohesive, production-ready application framework. It does this through a plugin architecture centered on the `createHAI3()` builder: the host application chains `.use(plugin)` calls and calls `.build()` to produce an assembled `HAI3App` instance that owns a Redux store, theme registry, i18n registry, API registry, MFE-enabled screensets registry, and a complete set of typed actions.

**Problem this solves**: Without this layer each application would manually wire state slices, event subscriptions, registries, and lifecycle hooks across four packages — a complex and error-prone process that produces inconsistent patterns across projects.

**Primary value**: A single call to `createHAI3App()` (or a composed `.use()` chain) yields a framework instance that the React layer (`@gears-frontx/react`) can consume directly, with all cross-cutting concerns (theme, language, MFE lifecycle, mock mode, layout state) already coordinated.

**Key assumptions**:
- Applications run in a browser environment; no SSR.
- Each plugin declares name and optional dependencies; the builder performs topological ordering.
- The framework has no React dependency — all React integration lives in `@gears-frontx/react` (L3).

### 1.2 Purpose

Enable host applications to compose a fully-wired HAI3 framework instance by assembling plugins via a fluent builder API, with theme/language propagation to MFEs, GTS-validated shared property broadcast, layout state management, and base-path-aware navigation configuration — all without modifying framework source code.

**Success criteria**: A host application initializes a complete HAI3 framework instance with one function call; plugins register slices and effects without order dependency; theme and language changes propagate to all registered MFE domains within the same synchronous call chain.

### 1.3 Actors

- `cpt-hai3-actor-host-app`
- `cpt-hai3-actor-framework-plugin`
- `cpt-hai3-actor-developer`
- `cpt-hai3-actor-runtime`
- `cpt-hai3-actor-microfrontend`
- `cpt-hai3-actor-gts-plugin`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — entry 2.6
- PRD: [PRD.md](../../PRD.md) — sections 5.2 (App Configuration), 5.10 (Shared Property Broadcast), 5.11 (Shared Property Validation), 5.18 (Microfrontend Plugin)
- Design component: `cpt-hai3-component-framework`
- Sequences: `cpt-hai3-seq-app-bootstrap`, `cpt-hai3-seq-shared-property-broadcast`
- ADRs: `cpt-hai3-adr-plugin-based-framework-composition`, `cpt-hai3-adr-four-layer-sdk-architecture`, `cpt-hai3-adr-global-shared-property-broadcast`

---

## 2. Actor Flows (CDSL)

### Application Bootstrap

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-app-bootstrap`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-runtime`

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

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-plugin-dependency`

**Actors**: `cpt-hai3-actor-framework-plugin`, `cpt-hai3-actor-host-app`

1. [ ] `p1` - Builder receives a plugin instance or factory; resolves factory if needed - `inst-resolve-factory`
2. [ ] `p1` - During `build()` topological sort, visit each plugin's declared `dependencies` array - `inst-visit-deps`
3. [ ] `p1` - **IF** a declared dependency name is not found among registered plugins AND `strictMode` is `true` **RETURN** error `"Plugin X requires Y but it is not registered"` - `inst-strict-dep-error`
4. [ ] `p1` - **IF** a declared dependency name is not found AND `strictMode` is `false`: log warning, continue - `inst-lax-dep-warn`
5. [ ] `p1` - **IF** circular dependency detected during DFS traversal **RETURN** error `"Circular dependency detected"` - `inst-circular-error`
6. [ ] `p1` - Add plugin to resolved list only after all dependencies are already resolved - `inst-topo-order`

### Convenience Full-Preset Bootstrap

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-full-preset`

**Actors**: `cpt-hai3-actor-host-app`

1. [ ] `p1` - Host calls `createHAI3App(config?)` - `inst-call-createapp`
2. [ ] `p1` - `createHAI3App` delegates to `createHAI3(config).useAll(full(presetConfig)).build()` - `inst-delegate-full`
3. [ ] `p1` - `full()` preset returns the canonical plugin set: `effects`, `screensets`, `themes`, `layout`, `i18n`, `mock`, `microfrontends` - `inst-full-plugin-set`
4. [ ] `p1` - **RETURN** fully assembled `HAI3App` - `inst-return-full-app`

### Theme Change and MFE Propagation

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-theme-propagation`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-framework-plugin`, `cpt-hai3-actor-microfrontend`

1. [ ] `p1` - Host or developer calls `app.actions.changeTheme({ themeId })` - `inst-call-change-theme`
2. [ ] `p1` - Action emits `theme/changed` event on the event bus - `inst-emit-theme-changed`
3. [ ] `p1` - The `themes` plugin's `onInit` handler receives the event - `inst-themes-plugin-handler`
4. [ ] `p1` - Handler calls `themeRegistry.apply(themeId)` to update the in-process theme - `inst-apply-theme`
5. [ ] `p1` - **TRY** call `screensetsRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, themeId)` to broadcast to all MFE domains - `inst-broadcast-theme`
6. [ ] `p1` - **CATCH** log error `"[HAI3] Failed to propagate theme to MFE domains"` without re-throwing - `inst-catch-theme-error`

### Language Change and MFE Propagation

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-i18n-propagation`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-framework-plugin`, `cpt-hai3-actor-microfrontend`

1. [ ] `p1` - Host or developer calls `app.actions.setLanguage({ language })` - `inst-call-set-language`
2. [ ] `p1` - Action emits `i18n/language/changed` event on the event bus - `inst-emit-lang-changed`
3. [ ] `p1` - The `i18n` plugin's `onInit` handler receives the event - `inst-i18n-plugin-handler`
4. [ ] `p1` - Handler calls `i18nRegistry.setLanguage(language)` asynchronously - `inst-set-language`
5. [ ] `p1` - **TRY** call `screensetsRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_LANGUAGE, language)` to broadcast to all MFE domains - `inst-broadcast-lang`
6. [ ] `p1` - **CATCH** log error `"[HAI3] Failed to propagate language to MFE domains"` without re-throwing - `inst-catch-lang-error`

### MFE Extension Registration

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-mfe-registration`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-microfrontend`

1. [ ] `p1` - Host calls `app.actions.registerExtension(extension)` - `inst-call-register-ext`
2. [ ] `p1` - Action emits `mfe/registerExtensionRequested` event on the event bus - `inst-emit-register-event`
3. [ ] `p1` - MFE effects handler receives the event; dispatches `setExtensionRegistering` to the MFE slice - `inst-dispatch-registering`
4. [ ] `p1` - **TRY** handler calls `screensetsRegistry.registerExtension(extension)` - `inst-call-registry-register`
5. [ ] `p1` - On success: dispatch `setExtensionRegistered` to the MFE slice - `inst-dispatch-registered`
6. [ ] `p1` - **CATCH** dispatch `setExtensionError` with error message to the MFE slice - `inst-dispatch-register-error`

### MFE Extension Lifecycle (Load / Mount / Unmount)

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-mfe-lifecycle`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-microfrontend`

1. [ ] `p1` - Host calls `app.actions.loadExtension(extensionId)` - `inst-call-load-ext`
2. [ ] `p1` - Action resolves the domain ID from the registered extension; calls `screensetsRegistry.executeActionsChain` with `HAI3_ACTION_LOAD_EXT` — fire-and-forget - `inst-execute-load-chain`
3. [ ] `p1` - Host calls `app.actions.mountExtension(extensionId)` - `inst-call-mount-ext`
4. [ ] `p1` - Action resolves domain ID; calls `executeActionsChain` with `HAI3_ACTION_MOUNT_EXT` - `inst-execute-mount-chain`
5. [ ] `p1` - On successful mount completion, dispatch `setExtensionMounted({ domainId, extensionId })` to the MFE slice - `inst-dispatch-mounted`
6. [ ] `p2` - Host calls `app.actions.unmountExtension(extensionId)` - `inst-call-unmount-ext`
7. [ ] `p2` - Action resolves domain ID; calls `executeActionsChain` with `HAI3_ACTION_UNMOUNT_EXT` - `inst-execute-unmount-chain`
8. [ ] `p2` - On successful unmount completion, dispatch `setExtensionUnmounted({ domainId })` to the MFE slice - `inst-dispatch-unmounted`

### Shared Property Broadcast

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-shared-property-broadcast`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-gts-plugin`, `cpt-hai3-actor-microfrontend`

1. [ ] `p1` - A framework plugin (or host) calls `screensetsRegistry.updateSharedProperty(propertyId, value)` - `inst-call-update-sp`
2. [ ] `p1` - Registry performs GTS validation via algorithm `cpt-hai3-algo-framework-composition-gts-validation` — BEFORE any propagation - `inst-validate-sp`
3. [ ] `p1` - **IF** validation fails **RETURN** throw error with validation details; property is NOT stored and NOT propagated - `inst-sp-validation-fail`
4. [ ] `p1` - **FOR EACH** registered domain whose `sharedProperties` array includes `propertyId`: propagate the validated value to all domain subscribers - `inst-broadcast-sp`
5. [ ] `p1` - Domains that do NOT declare `propertyId` in their `sharedProperties` array receive NO update - `inst-sp-domain-filter`
6. [ ] `p1` - **IF** no matching domains exist: silently succeed (no-op) - `inst-sp-noop`

### App Configuration via Events

- [x] `p1` - **ID**: `cpt-hai3-flow-framework-composition-app-config`

**Actors**: `cpt-hai3-actor-host-app`

1. [ ] `p1` - Host emits a tenant event on the event bus: `app/tenant/changed` with `{ tenant: Tenant }` payload - `inst-emit-tenant`
2. [ ] `p1` - Tenant effect handler receives the event and dispatches `setTenant(tenant)` to the tenant slice - `inst-tenant-reducer`
3. [ ] `p1` - Host emits `app/tenant/cleared` to remove tenant context; tenant slice resets to `null` - `inst-tenant-cleared`
4. [ ] `p2` - Host calls layout visibility actions (`setFooterVisible`, `setMenuVisible`, `setSidebarVisible`) to control layout regions - `inst-layout-visibility`

### Application Teardown

- [x] `p2` - **ID**: `cpt-hai3-flow-framework-composition-teardown`

**Actors**: `cpt-hai3-actor-host-app`

1. [ ] `p2` - Host calls `app.destroy()` - `inst-call-destroy`
2. [ ] `p2` - Builder iterates plugins in reverse initialization order; invokes `onDestroy(app)` for each that defines it - `inst-call-on-destroy`
3. [ ] `p2` - MFE effects cleanup: all event subscriptions unsubscribed - `inst-mfe-cleanup`

---

## 3. Processes / Business Logic (CDSL)

### Builder Dependency Resolution (Topological Sort)

- [x] `p1` - **ID**: `cpt-hai3-algo-framework-composition-dep-resolution`

1. [ ] `p1` - Maintain a `visited` set (fully resolved) and a `visiting` set (in-progress DFS) — both keyed by plugin name - `inst-init-visited-sets`
2. [ ] `p1` - **FOR EACH** registered plugin: call `visit(plugin)` - `inst-visit-each`
3. [ ] `p1` - **IF** plugin name is in `visited`: **RETURN** (already resolved) - `inst-skip-visited`
4. [ ] `p1` - **IF** plugin name is in `visiting`: **RETURN** error "Circular dependency detected" - `inst-detect-cycle`
5. [ ] `p1` - Add plugin name to `visiting` - `inst-add-visiting`
6. [ ] `p1` - **FOR EACH** name in `plugin.dependencies`: find the plugin object; **IF** not found handle per `strictMode`; otherwise recursively call `visit(dep)` - `inst-visit-dep`
7. [ ] `p1` - Remove plugin name from `visiting`; add to `visited`; append plugin to resolved output list - `inst-finalize-plugin`
8. [ ] `p1` - **RETURN** resolved list (dependencies guaranteed before dependents) - `inst-return-ordered`

### Plugin Provides Aggregation

- [x] `p1` - **ID**: `cpt-hai3-algo-framework-composition-provides-aggregation`

1. [ ] `p1` - Initialize empty `registries` record, `slices` array, `effects` array, `actions` partial object - `inst-init-accumulators`
2. [ ] `p1` - **FOR EACH** plugin in resolved order: **IF** `plugin.provides` is absent skip to next - `inst-check-provides`
3. [ ] `p1` - **IF** `provides.registries` present: merge into `registries` via `Object.assign` - `inst-merge-registries`
4. [ ] `p1` - **IF** `provides.slices` present: push all slices into `slices` array - `inst-collect-slices`
5. [ ] `p1` - **IF** `provides.effects` present: push all effect initializers into `effects` array - `inst-collect-effects`
6. [ ] `p1` - **IF** `provides.actions` present: merge into `actions` via `Object.assign` (later plugins override earlier on name collision) - `inst-merge-actions`
7. [ ] `p1` - **RETURN** `{ registries, slices, effects, actions }` - `inst-return-aggregated`

### GTS Shared Property Validation

- [x] `p1` - **ID**: `cpt-hai3-algo-framework-composition-gts-validation`

1. [ ] `p1` - Construct `ephemeralId` by appending the runtime suffix to the property type ID: `ephemeralId = "${propertyTypeId}frontx.mfes.comm.runtime.v1"` - `inst-build-ephemeral-id`
2. [ ] `p1` - Call `typeSystem.register({ id: ephemeralId, value })` to register the candidate instance in the GTS store (overwrites any prior registration for the same deterministic ID) - `inst-gts-register`
3. [ ] `p1` - Call `typeSystem.validateInstance(ephemeralId)` to validate the value against the schema derived from the chained instance ID - `inst-gts-validate`
4. [ ] `p1` - **IF** validation returns failure: **RETURN** throw error containing validation failure details - `inst-gts-reject`
5. [ ] `p1` - **IF** validation passes: **RETURN** (propagation may proceed) - `inst-gts-accept`
6. [ ] `p1` - This algorithm MAY be called once per `updateSharedProperty` invocation even when multiple domains declare the same property (single-validation optimization) - `inst-single-validation`
7. [ ] `p1` - **IF** the schema for `propertyTypeId` has never been registered in GTS: validation will fail; treat as configuration error — all property type schemas must be loaded before use - `inst-unregistered-schema-error`

### Base Path Resolution

- [x] `p1` - **ID**: `cpt-hai3-algo-framework-composition-base-path`

1. [ ] `p1` - Receive raw `base` string from `HAI3Config`; **IF** empty or undefined **RETURN** `"/"` - `inst-empty-base`
2. [ ] `p1` - **IF** `base` does not start with `"/"`: prepend `"/"` - `inst-add-leading-slash`
3. [ ] `p1` - **IF** normalized value is not `"/"` AND ends with `"/"`: remove trailing slash - `inst-remove-trailing-slash`
4. [ ] `p1` - **RETURN** normalized base path - `inst-return-base`
5. [ ] `p1` - Strip operation: given `pathname` and `base`, **IF** `base` is `"/"` **RETURN** `pathname` unchanged - `inst-strip-root-base`
6. [ ] `p1` - **IF** `pathname` does not start with `base` **RETURN** `null` (no match) - `inst-strip-no-match`
7. [ ] `p1` - **IF** character immediately after `base` prefix in `pathname` is neither end-of-string nor `"/"`: **RETURN** `null` (partial segment match) - `inst-strip-partial-match`
8. [ ] `p1` - **RETURN** remainder of `pathname` after stripping `base`; use `"/"` if exact match - `inst-strip-return`

### Mock Mode Toggle

- [x] `p2` - **ID**: `cpt-hai3-algo-framework-composition-mock-toggle`

1. [ ] `p2` - Host calls `app.actions.toggleMockMode(enabled)` - `inst-call-toggle-mock`
2. [ ] `p2` - Action emits a mock-toggle event on the event bus - `inst-emit-mock-event`
3. [ ] `p2` - Mock effects handler dispatches `setMockEnabled(enabled)` to the mock slice - `inst-mock-reducer`
4. [ ] `p2` - Effect iterates all registered API service plugins; activates/deactivates plugins where `isMockPlugin(plugin)` is `true` - `inst-toggle-mock-plugins`

---

## 4. States (CDSL)

### MFE Extension Registration State

- [x] `p1` - **ID**: `cpt-hai3-state-framework-composition-mfe-registration`

Tracked in `state.mfe.registrationStates[extensionId]`.

1. [ ] `p1` - **FROM** `unregistered` **TO** `registering` **WHEN** `registerExtension` action is dispatched - `inst-to-registering`
2. [ ] `p1` - **FROM** `registering` **TO** `registered` **WHEN** `screensetsRegistry.registerExtension()` resolves successfully - `inst-to-registered`
3. [ ] `p1` - **FROM** `registering` **TO** `error` **WHEN** `screensetsRegistry.registerExtension()` throws - `inst-to-error`
4. [ ] `p1` - **FROM** `registered` **TO** `unregistered` **WHEN** `unregisterExtension` action succeeds - `inst-to-unregistered`
5. [ ] `p1` - **FROM** any state **TO** `error` **WHEN** `unregisterExtension` throws - `inst-unreg-error`

### MFE Domain Mount State

- [x] `p1` - **ID**: `cpt-hai3-state-framework-composition-mfe-mount`

Tracked in `state.mfe.mountedExtensions[domainId]` as an extension ID string or `undefined`.

1. [ ] `p1` - **FROM** `undefined` **TO** `extensionId` **WHEN** `HAI3_ACTION_MOUNT_EXT` chain completes successfully - `inst-domain-mounted`
2. [ ] `p2` - **FROM** `extensionId` **TO** `undefined` **WHEN** `HAI3_ACTION_UNMOUNT_EXT` chain completes successfully - `inst-domain-unmounted`

### Plugin Builder State

- [x] `p1` - **ID**: `cpt-hai3-state-framework-composition-builder`

Lifecycle state of the `HAI3AppBuilder` instance.

1. [ ] `p1` - **FROM** `composing` (initial) **TO** `composing` **WHEN** `.use(plugin)` is called — builder returns `this` for chaining - `inst-composing`
2. [ ] `p1` - **FROM** `composing` **TO** `built` **WHEN** `.build()` is called and succeeds - `inst-built`
3. [ ] `p1` - **FROM** `composing` **TO** `error` **WHEN** `.build()` throws (circular dependency or missing strict dep) - `inst-build-error`

### Tenant State

- [x] `p1` - **ID**: `cpt-hai3-state-framework-composition-tenant`

Tracked in `state.tenant`.

1. [ ] `p1` - **FROM** `{ tenant: null, loading: false }` (initial) **TO** `{ tenant: null, loading: true }` **WHEN** `setTenantLoadingState(true)` is dispatched - `inst-tenant-loading`
2. [ ] `p1` - **FROM** `{ loading: true }` **TO** `{ tenant: Tenant, loading: false }` **WHEN** `changeTenant(tenant)` event is handled - `inst-tenant-set`
3. [ ] `p1` - **FROM** any **TO** `{ tenant: null, loading: false }` **WHEN** `clearTenantAction()` event is handled - `inst-tenant-cleared`

---

## 5. Definitions of Done

### Builder API and Plugin System

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-builder`

Host applications can compose a HAI3 framework instance by chaining `.use(plugin)` calls on the builder returned by `createHAI3()` and calling `.build()`. The builder resolves plugin dependencies topologically, aggregates all slice/effect/action/registry contributions, creates the Redux store, and returns a `HAI3App` with fully initialized registries and actions. Duplicate plugins (same name) are silently ignored. Circular dependencies throw immediately. Missing dependencies throw in `strictMode` or warn otherwise.

**API surface**:
- `createHAI3(config?: HAI3Config): HAI3AppBuilder`
- `HAI3AppBuilder.use(plugin): HAI3AppBuilder`
- `HAI3AppBuilder.useAll(plugins): HAI3AppBuilder`
- `HAI3AppBuilder.build(): HAI3App`
- `createHAI3App(config?: HAI3AppConfig): HAI3App` (convenience, uses `full()` preset)

**Implements**:
- `cpt-hai3-flow-framework-composition-app-bootstrap`
- `cpt-hai3-flow-framework-composition-plugin-dependency`
- `cpt-hai3-flow-framework-composition-full-preset`
- `cpt-hai3-algo-framework-composition-dep-resolution`
- `cpt-hai3-algo-framework-composition-provides-aggregation`
- `cpt-hai3-state-framework-composition-builder`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-framework-layer`
- `cpt-hai3-fr-sdk-plugin-arch`
- `cpt-hai3-fr-sdk-layer-deps`

**Covers (DESIGN)**:
- `cpt-hai3-principle-plugin-first-composition`
- `cpt-hai3-principle-layer-isolation`
- `cpt-hai3-constraint-no-react-below-l3`
- `cpt-hai3-component-framework`
- `cpt-hai3-seq-app-bootstrap`

---

### Layout Orchestration

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-layout`

The `layout()` plugin registers Redux slices for all seven layout domains (header, footer, menu, sidebar, screen, popup, overlay), subscribes to layout events on the event bus, and dispatches corresponding reducer actions to keep state consistent. The `screensets()` plugin registers the screen slice. All layout state types are exported from `@gears-frontx/framework`.

**Layout domains and their slices**:
- `header`: `HeaderState` — user info, loading
- `footer`: `FooterState` — visible flag, screenset options
- `menu`: `MenuState` — collapsed, items, visible
- `sidebar`: `SidebarState` — collapsed, position, title, content, visible, width
- `screen`: `ScreenState` — activeScreen, loading
- `popup`: stack of `PopupState` — id, title, component, props, zIndex
- `overlay`: `OverlayState` — visible

**Covers (PRD)**:
- `cpt-hai3-fr-appconfig-layout-visibility`

**Covers (DESIGN)**:
- `cpt-hai3-component-framework`

---

### App Configuration and Event-Driven API

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-app-config`

The framework provides an event-driven API for configuring tenant, language, theme, and navigation. All configuration changes propagate via the event bus rather than direct state mutation. The `Tenant` type has shape `{ id: string }` and tenant state is typed `Tenant | null`. Router mode is configurable via `HAI3Config.routerMode` (`'browser'` | `'hash'` | `'memory'`). Base path normalization handles leading slash insertion, trailing slash removal, and empty-string-to-root conversion.

**Events**:
- `app/tenant/changed` → `setTenant(tenant)` in tenant slice
- `app/tenant/cleared` → `clearTenant()` in tenant slice
- `theme/changed` → `themeRegistry.apply(themeId)`
- `i18n/language/changed` → `i18nRegistry.setLanguage(language)`

**Implements**:
- `cpt-hai3-flow-framework-composition-app-config`
- `cpt-hai3-algo-framework-composition-base-path`
- `cpt-hai3-state-framework-composition-tenant`

**Covers (PRD)**:
- `cpt-hai3-fr-appconfig-tenant`
- `cpt-hai3-fr-appconfig-event-api`
- `cpt-hai3-fr-appconfig-router-config`
- `cpt-hai3-fr-appconfig-layout-visibility`

**Covers (DESIGN)**:
- `cpt-hai3-principle-event-driven-architecture`
- `cpt-hai3-component-framework`

---

### Theme and Language Propagation to MFEs

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-propagation`

When the host changes theme or language, the respective plugin propagates the new value to all registered MFE domains by calling `screensetsRegistry.updateSharedProperty()` with the appropriate shared property constant. Errors from the registry call are caught and logged; they never crash the host application. On initialization, the `themes()` plugin applies the first registered theme; the `i18n()` plugin loads English translations in the background.

**Shared property constants**:
- `HAI3_SHARED_PROPERTY_THEME` (`gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.theme.v1~`)
- `HAI3_SHARED_PROPERTY_LANGUAGE` (`gts.frontx.mfes.comm.shared_property.v1~frontx.mfes.comm.language.v1~`)

**Implements**:
- `cpt-hai3-flow-framework-composition-theme-propagation`
- `cpt-hai3-flow-framework-composition-i18n-propagation`

**Covers (PRD)**:
- `cpt-hai3-fr-mfe-theme-propagation`
- `cpt-hai3-fr-mfe-i18n-propagation`
- `cpt-hai3-nfr-rel-error-handling`

**Covers (DESIGN)**:
- `cpt-hai3-component-framework`
- `cpt-hai3-seq-shared-property-broadcast`

---

### Microfrontends Plugin and MFE Lifecycle

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-mfe-plugin`

The `microfrontends()` plugin accepts `MicrofrontendsConfig` with required `typeSystem: TypeSystemPlugin` and optional `mfeHandlers: MfeHandler[]`. It builds a `ScreensetsRegistry` instance via `screensetsRegistryFactory.build({ typeSystem: config.typeSystem, mfeHandlers: config.mfeHandlers })` — the plugin does NOT import or hardcode any specific `TypeSystemPlugin` implementation. It exposes the registry as `app.screensetsRegistry`. It registers the `mfe` Redux slice tracking per-extension registration state (`unregistered` | `registering` | `registered` | `error`) and per-domain mount state. It wires MFE lifecycle actions (`loadExtension`, `mountExtension`, `unmountExtension`, `registerExtension`, `unregisterExtension`) into the HAI3 actions map. The plugin intercepts `executeActionsChain` completions for mount/unmount to dispatch Redux slice updates.

**Domain constants** (GTS instance IDs):
- `HAI3_SCREEN_DOMAIN` — main content area
- `HAI3_SIDEBAR_DOMAIN` — collapsible side panel
- `HAI3_POPUP_DOMAIN` — modal dialogs
- `HAI3_OVERLAY_DOMAIN` — full-screen overlay

**Implements**:
- `cpt-hai3-flow-framework-composition-mfe-registration`
- `cpt-hai3-flow-framework-composition-mfe-lifecycle`
- `cpt-hai3-state-framework-composition-mfe-registration`
- `cpt-hai3-state-framework-composition-mfe-mount`

**Covers (PRD)**:
- `cpt-hai3-fr-mfe-plugin`
- `cpt-hai3-fr-mfe-dynamic-registration`

**Covers (DESIGN)**:
- `cpt-hai3-component-framework`
- `cpt-hai3-seq-app-bootstrap`

---

### Shared Property Broadcast with GTS Validation

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-shared-property`

`ScreensetsRegistry.updateSharedProperty(propertyId, value)` is the sole write path for shared property values. The implementation validates the value against the GTS-derived schema before any propagation. Validation uses `typeSystem.register({ id: ephemeralId, value })` + `typeSystem.validateInstance(ephemeralId)` where `ephemeralId = "${propertyTypeId}frontx.mfes.comm.runtime.v1"`. If validation fails, the method throws and no domain receives the update. Only domains whose `sharedProperties` array includes `propertyId` receive the update. No matching domains is a silent no-op. The deprecated `updateDomainProperty()` and `updateDomainProperties()` methods do NOT exist on the abstract class or implementation.

**Implements**:
- `cpt-hai3-flow-framework-composition-shared-property-broadcast`
- `cpt-hai3-algo-framework-composition-gts-validation`

**Covers (PRD)**:
- `cpt-hai3-fr-broadcast-write-api`
- `cpt-hai3-fr-broadcast-matching`
- `cpt-hai3-fr-broadcast-validate`
- `cpt-hai3-fr-validation-gts`
- `cpt-hai3-fr-validation-reject`
- `cpt-hai3-nfr-sec-type-validation`

**Covers (DESIGN)**:
- `cpt-hai3-component-framework`
- `cpt-hai3-seq-shared-property-broadcast`

---

### Presets

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-presets`

Three presets are provided as functions returning `HAI3Plugin[]`:
- `full(config?)` — all seven plugins (`effects`, `screensets`, `themes`, `layout`, `i18n`, `mock`, `microfrontends`)
- `minimal()` — `screensets` + `themes` only
- `headless()` — `screensets` only

All presets are exported from `@gears-frontx/framework`. The `presets` object collects all three under named keys.

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-plugin-arch`

**Covers (DESIGN)**:
- `cpt-hai3-principle-plugin-first-composition`

---

### SDK Re-exports and Convenience Surface

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-reexports`

`@gears-frontx/framework` re-exports the public API of all four L1 packages so that consumers can import from a single entry point. Re-exported symbols include:
- From `@gears-frontx/state`: `eventBus`, `createStore`, `getStore`, `registerSlice`, `hasSlice`, `createSlice`, and all related types
- From `@gears-frontx/screensets`: `ScreensetsRegistry`, `screensetsRegistryFactory`, `MfeHandler`, `MfeBridgeFactory`, `LayoutDomain`, action/property constants, type contracts
- From `@gears-frontx/api`: `apiRegistry`, `BaseApiService`, `RestProtocol`, `SseProtocol`, mock plugins, type guards
- From `@gears-frontx/i18n`: `i18nRegistry`, `Language`, `SUPPORTED_LANGUAGES`, all formatters

The framework does NOT export `createAction` to consumers; actions are handwritten functions.

---

### GTS Derived Schemas for Application-Layer Registration

- [x] `p1` - **ID**: `cpt-hai3-dod-framework-composition-derived-schemas`

`@gears-frontx/framework` exports three GTS derived schemas (`themeSchema`, `languageSchema`, `extensionScreenSchema`) for application-layer registration. These schemas encode application-level constraints — valid theme values, supported languages, screen extension presentation shape — and are NOT part of the core type system in `@gears-frontx/screensets` (L1). The application registers them on the `TypeSystemPlugin` instance before constructing the HAI3 app via `gtsPlugin.registerSchema()`. This keeps the L1 SDK generic and allows projects to substitute custom schemas.

**Covers (PRD)**:
- `cpt-hai3-fr-mfe-shared-property`

**Covers (DESIGN)**:
- `cpt-hai3-component-framework`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-framework-layer`
- `cpt-hai3-nfr-maint-zero-crossdeps`

**Covers (DESIGN)**:
- `cpt-hai3-constraint-no-react-below-l3`

---

## 6. Acceptance Criteria

- [x] `createHAI3().use(pluginA()).use(pluginB()).build()` produces a `HAI3App` with `store`, `themeRegistry`, `i18nRegistry`, `apiRegistry`, `screensetsRegistry`, and `actions` all populated
- [x] Plugin dependency ordering is enforced: if `pluginB` declares `dependencies: ['pluginA']`, `pluginA.onInit` is always called before `pluginB.onInit` regardless of `.use()` call order
- [x] Registering the same plugin name twice results in only one plugin in the resolved list (second is silently ignored)
- [x] A circular dependency between two plugins throws an error during `.build()`
- [x] `app.actions.changeTheme({ themeId: 'dark' })` calls `themeRegistry.apply('dark')` AND calls `screensetsRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, 'dark')` when the `microfrontends()` plugin is registered
- [x] Errors thrown by `screensetsRegistry.updateSharedProperty()` in theme/language propagation are caught and logged; the host application continues without crash
- [x] `screensetsRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, 'invalid-theme')` throws a GTS validation error; no domain subscriber receives the value
- [x] `screensetsRegistry.updateSharedProperty(HAI3_SHARED_PROPERTY_THEME, 'dark')` propagates to all domains declaring the property; domains not declaring it receive no update
- [x] `app.actions.registerExtension(ext)` transitions `state.mfe.registrationStates[ext.id]` from `'unregistered'` → `'registering'` → `'registered'`
- [x] A failing `screensetsRegistry.registerExtension()` call transitions state to `'error'` with the error message recorded
- [x] `app.actions.mountExtension(extensionId)` after successful execution sets `state.mfe.mountedExtensions[domainId]` to `extensionId`
- [x] `normalizeBase('/console/')` returns `'/console'`; `normalizeBase('')` returns `'/'`; `normalizeBase('console')` returns `'/console'`
- [x] `stripBase('/console/dashboard', '/console')` returns `'/dashboard'`; `stripBase('/admin/x', '/console')` returns `null`; `stripBase('/console-admin', '/console')` returns `null`
- [x] `createHAI3App()` uses the `full()` preset and returns a valid `HAI3App` without configuration
- [x] `@gears-frontx/framework` has no React import (enforced by `dependency-cruiser`)
- [x] All layout domain types (`HeaderState`, `FooterState`, `MenuState`, `SidebarState`, `ScreenState`, `PopupState`, `OverlayState`) are exported from `@gears-frontx/framework`

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

### No `updateDomainProperty` / `updateDomainProperties`

These methods were removed as part of the global shared property broadcast model (`cpt-hai3-adr-global-shared-property-broadcast`). Shared properties are global — a property ID means the same thing across all domains that declare it, so domain-targeted writes are semantically incorrect. `updateSharedProperty(propertyId, value)` is the only write path.

### HAI3Config Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | `'HAI3 App'` | Application identifier |
| `devMode` | `boolean` | `false` | Enables duplicate plugin warnings |
| `strictMode` | `boolean` | `false` | Throws on missing plugin dependencies |
| `autoNavigate` | `boolean` | `true` | Deprecated — auto-route to first screen on mount |
| `base` | `string` | `'/'` | Base path for navigation |
| `routerMode` | `'browser'` \| `'hash'` \| `'memory'` | `'browser'` | Router strategy |
