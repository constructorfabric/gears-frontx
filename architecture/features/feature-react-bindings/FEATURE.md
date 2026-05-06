# Feature: React Bindings

<!-- artifact-version: 1.4 -->


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Bootstrap Application with HAI3Provider](#bootstrap-application-with-hai3provider)
  - [Access Typed Redux State in a Component](#access-typed-redux-state-in-a-component)
  - [Dispatch Actions from a Component](#dispatch-actions-from-a-component)
  - [Use Translations in a Component](#use-translations-in-a-component)
  - [Lazy-Load Screen Translations](#lazy-load-screen-translations)
  - [Switch Theme from a Component](#switch-theme-from-a-component)
  - [Access Locale-Aware Formatters](#access-locale-aware-formatters)
  - [Render an MFE Extension Domain Slot](#render-an-mfe-extension-domain-slot)
  - [Subscribe to Shared Property from MFE](#subscribe-to-shared-property-from-mfe)
  - [Request Host Action from MFE](#request-host-action-from-mfe)
  - [Observe Domain Extensions](#observe-domain-extensions)
  - [Observe Registered Packages](#observe-registered-packages)
  - [Observe Mounted Extensions in a Domain](#observe-mounted-extensions-in-a-domain)
  - [Provide MFE Context to Child Extension](#provide-mfe-context-to-child-extension)
  - [Access the FrontX App Instance Directly](#access-the-frontx-app-instance-directly)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Resolve HAI3App Instance](#resolve-hai3app-instance)
  - [Load Screen Translations](#load-screen-translations)
  - [Build Provider Tree](#build-provider-tree)
  - [Validate MFE Context Guard](#validate-mfe-context-guard)
  - [Compute Stable External Store Snapshots](#compute-stable-external-store-snapshots)
- [4. States (CDSL)](#4-states-cdsl)
  - [Extension Slot Lifecycle](#extension-slot-lifecycle)
  - [Screen Translation Loading](#screen-translation-loading)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Root Provider and App Resolution](#root-provider-and-app-resolution)
  - [Typed Redux Hooks](#typed-redux-hooks)
  - [Translation Hook](#translation-hook)
  - [Screen Translation Hook](#screen-translation-hook)
  - [Theme Hook](#theme-hook)
  - [Formatters Hook](#formatters-hook)
  - [Extension Domain Slot Component](#extension-domain-slot-component)
  - [MFE Hooks](#mfe-hooks)
  - [Domain and Package Observation Hooks](#domain-and-package-observation-hooks)
  - [EventPayloadMap Module Augmentation Re-export](#eventpayloadmap-module-augmentation-re-export)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-react-bindings`

- [x] `p2` - `cpt-frontx-feature-react-bindings`
---

## 1. Feature Context

### 1.1 Overview

React Bindings is the L3 boundary that exposes the FrontX framework to React 19 applications. It converts the framework's plain-object output (`HAI3App`) into React context, typed hooks, and MFE rendering components, forming the primary developer-facing API surface of the entire system.

Problem: The framework layer (`@cyberfabric/framework`) is deliberately React-agnostic. Application developers need typed React hooks, a root provider that wires Redux and i18n into the React tree, and components that can mount MFE extensions with CSS isolation — without importing directly from L1/L2 packages.

Primary value: One import (`@cyberfabric/react`) gives developers access to the full FrontX surface in a React-idiomatic way while preserving the strict layer hierarchy.

Key assumptions:
- The consuming application runs React 19.
- A `HAI3App` instance exists before `HAI3Provider` is rendered (either pre-built or created internally).
- MFE hooks may only be called from within `MfeProvider` context.

### 1.2 Purpose

Bridge `@cyberfabric/framework` to React 19 by providing the provider tree, typed hooks, and MFE rendering components that application developers interact with directly. Keep all React-specific code confined to L3, preserving framework-agnosticism of L1 and L2.

Success criteria: Developers can wrap their application with `<HAI3Provider>`, access typed Redux state, translations, theme, shared properties, and domain extensions solely through hooks exported from `@cyberfabric/react`, with no need to import from `@cyberfabric/framework` or lower layers.

### 1.3 Actors

- `cpt-frontx-actor-developer`
- `cpt-frontx-actor-host-app`
- `cpt-frontx-actor-microfrontend`
- `cpt-frontx-actor-runtime`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — Section 2.7
- Depends on: `cpt-frontx-feature-framework-composition`
- Design component: `cpt-frontx-component-react`
- ADRs: `cpt-frontx-adr-mandatory-screen-lazy-loading`, `cpt-frontx-adr-react-19-ref-as-prop`, `cpt-frontx-adr-domain-implementation-mount-strategies` — drives the singleton-root `ExtensionDomainSlot` design and the `useMountedExtensions` hook (issue cyberfabric/frontx#278)

---

## 2. Actor Flows (CDSL)

### Bootstrap Application with HAI3Provider

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-bootstrap-provider`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Host application renders `<HAI3Provider>` with optional `config`, `app`, or `mfeBridge` props - `inst-render-provider`
2. [x] - `p1` - Algorithm: resolve HAI3App instance using `cpt-frontx-algo-react-bindings-resolve-app` - `inst-resolve-app`
3. [x] - `p1` - `HAI3App` instance placed into `HAI3Context` via React context provider - `inst-set-hai3-context`
4. [x] - `p1` - Redux store from `app.store` wrapped in `react-redux` `<Provider>` - `inst-set-redux-provider`
5. [x] - `p1` - WHEN the app was built with `queryCache()` or `queryCacheShared()`, descendants wrapped in the internal query provider that resolves the plugin-owned `QueryClient` from the app (same stack as `HAI3QueryClientProvider` in implementation) - `inst-render-query-provider`
6. [x] - `p2` - IF `mfeBridge` prop is present THEN wrap the entire composed provider stack (outermost) in `<MfeProvider value={mfeBridge}>` — `MfeProvider` sits outside `HAI3Context` / Redux / query providers, not between them and `children` - `inst-wrap-mfe-provider`
7. [x] - `p1` - Child components rendered innermost (inside the query provider when present) - `inst-render-children`
8. [x] - `p1` - On unmount: IF app was created internally (no `app` prop provided) THEN call `app.destroy()` - `inst-destroy-app`

---

### Access Typed Redux State in a Component

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-selector`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer calls `useAppSelector(selectorFn)` inside a component tree wrapped by `HAI3Provider` - `inst-call-selector`
2. [x] - `p1` - Hook delegates to `react-redux` `useSelector` typed against `RootState` from `@cyberfabric/framework` - `inst-delegate-selector`
3. [x] - `p1` - Runtime returns the slice of state selected by `selectorFn` - `inst-return-state`
4. [x] - `p1` - Component re-renders when selected value changes - `inst-rerender-on-change`

---

### Dispatch Actions from a Component

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-dispatch`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer calls `useAppDispatch()` inside a component tree wrapped by `HAI3Provider` - `inst-call-dispatch`
2. [x] - `p1` - Hook delegates to `react-redux` `useDispatch` and casts return type to `AppDispatch` from `@cyberfabric/framework` - `inst-delegate-dispatch`
3. [x] - `p1` - Developer uses returned `dispatch` function to dispatch typed Redux actions - `inst-use-dispatch`

---

### Use Translations in a Component

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-translation`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer calls `useTranslation()` inside a component tree wrapped by `HAI3Provider` - `inst-call-translation`
2. [x] - `p1` - Hook reads `app.i18nRegistry` from `HAI3Context` - `inst-read-i18n-registry`
3. [x] - `p1` - Hook subscribes to `i18nRegistry` version changes via `useSyncExternalStore` - `inst-subscribe-i18n`
4. [x] - `p1` - Hook returns `{ t, language, setLanguage, isRTL }` - `inst-return-translation-api`
5. [x] - `p1` - When developer calls `setLanguage(lang)`, hook dispatches `app.actions.setLanguage` on the framework, which propagates via event bus to MFEs - `inst-set-language`
6. [x] - `p1` - Component re-renders when `i18nRegistry` version changes (new translations registered or language changed) - `inst-rerender-on-lang-change`

---

### Lazy-Load Screen Translations

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-screen-translations`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Screen component calls `useScreenTranslations(screensetId, screenId, translations)` where `translations` is either a `TranslationMap` or a `TranslationLoader` from `I18nRegistry.createLoader()` - `inst-call-screen-translations`
2. [x] - `p1` - Hook subscribes to `i18nRegistry` version changes to detect language switches - `inst-subscribe-lang-change`
3. [x] - `p1` - Algorithm: load screen translations using `cpt-frontx-algo-react-bindings-load-screen-translations` - `inst-run-load-screen-translations`
4. [x] - `p1` - Hook returns `{ isLoaded, error }` reflecting current loading state - `inst-return-loading-state`
5. [x] - `p1` - Screen component gates render on `isLoaded` to prevent premature display before translations are available - `inst-gate-render`

---

### Switch Theme from a Component

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-theme`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer calls `useTheme()` inside a component tree wrapped by `HAI3Provider` - `inst-call-theme`
2. [x] - `p1` - Hook reads `app.themeRegistry` from `HAI3Context` - `inst-read-theme-registry`
3. [x] - `p1` - Hook subscribes to `themeRegistry` version changes via `useSyncExternalStore` - `inst-subscribe-theme`
4. [x] - `p1` - Hook returns `{ currentTheme, themes, setTheme }` - `inst-return-theme-api`
5. [x] - `p1` - When developer calls `setTheme(themeId)`, hook dispatches `app.actions.changeTheme` - `inst-dispatch-change-theme`
6. [x] - `p1` - Component re-renders when theme registry version changes - `inst-rerender-on-theme-change`

---

### Access Locale-Aware Formatters

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-formatters`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer calls `useFormatters()` inside a component tree wrapped by `HAI3Provider` - `inst-call-formatters`
2. [x] - `p1` - Hook calls `useTranslation()` internally to subscribe to language changes - `inst-subscribe-via-translation`
3. [x] - `p1` - Hook returns a memoized `Formatters` object (formatDate, formatTime, formatDateTime, formatRelative, formatNumber, formatPercent, formatCompact, formatCurrency, compareStrings, createCollator) - `inst-return-formatters`
4. [x] - `p1` - Returned formatters read current locale from `i18nRegistry.getLanguage()` at call time - `inst-formatters-read-locale`
5. [x] - `p1` - Memoized object is replaced when language changes, triggering re-render of subscribing components - `inst-recompute-on-lang`

---

### Render an MFE Extension Domain Slot

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-extension-domain-slot`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`, `cpt-frontx-actor-runtime`

The slot is **per-domain only**. It accepts a `domainId` and provides the DOM root for that domain. It has no `extensionId` prop — what extensions live inside the root is a domain-policy concern (the strategy plus the implementation's container factory), not a slot-API concern. The slot is uniform across all cardinalities (Exclusive / Optional / Concurrent). Mount and unmount actions are dispatched by the host application via `registry.executeActionsChain`, not by the slot. The slot's only responsibility is to attach the DOM root that the per-domain `ExtensionMounter` uses to host whichever extensions the host mounts under it. Mounted extensions appear under the attached root by way of `mounter.mount(extId, container)` calls performed by the active `MountStrategy`; the slot does NOT render React children for those extensions — multi-mount children are placed imperatively by the mounter.

1. [x] - `p1` - Host renders `<ExtensionDomainSlot registry={registry} domainId={...}>`. The component renders a single root `<div>` per domain instance - `inst-render-slot`
2. [x] - `p1` - On `ref` attach callback: resolve `mounter = registry.getMounter(domainId)` and call `mounter.attach(element)`. This is the only DOM hand-off — the mounter owns the root and appends/removes per-extension containers as extensions mount and unmount. After attach, invoke optional `onAttached(element)` callback if provided - `inst-attach-root`
3. [x] - `p1` - Component renders a loading placeholder until the mounter has been attached - `inst-show-loading`
4. [x] - `p1` - On component unmount: call `mounter.detach()`. The mounter mass-unmounts every currently-mounted extension in the domain (calling `mounter.unmount(extId)` and `hooks.destroy(extId)` per extension) so no orphan DOM trees or slice/registry desync remain; the diff dispatch (with idempotent reducers per `cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`) reflects each removal. After detach, invoke optional `onDetached()` callback if provided - `inst-detach-root`

---

### Subscribe to Shared Property from MFE

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-shared-property`

**Actors**: `cpt-frontx-actor-microfrontend`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - MFE component calls `useSharedProperty(propertyTypeId)` - `inst-call-shared-property`
2. [x] - `p1` - Hook reads `bridge` from `MfeContext` (throws if called outside `MfeProvider`) - `inst-read-bridge`
3. [x] - `p1` - Hook subscribes to property changes via `bridge.subscribeToProperty(propertyTypeId, callback)` using `useSyncExternalStore` - `inst-subscribe-property`
4. [x] - `p1` - Hook returns `bridge.getProperty(propertyTypeId)?.value` typed as `T | undefined` - `inst-return-property-value`
5. [x] - `p1` - Component re-renders each time the host updates the property via `bridge.subscribeToProperty` notification - `inst-rerender-on-property-change`

---

### Request Host Action from MFE

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-host-action`

**Actors**: `cpt-frontx-actor-microfrontend`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - MFE component calls `useHostAction(actionTypeId)` - `inst-call-host-action`
2. [x] - `p1` - Hook reads `bridge` from `MfeContext` (throws if called outside `MfeProvider`) - `inst-read-bridge-for-action`
3. [x] - `p1` - Hook returns a stable callback that constructs an `ActionsChain` targeting `bridge.domainId` and dispatches it via `bridge.executeActionsChain()` - `inst-return-action-callback`
4. [x] - `p1` - IF `executeActionsChain` rejects THEN error is logged to console without propagating to the component - `inst-log-action-error`

---

### Observe Domain Extensions

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-domain-extensions`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer calls `useDomainExtensions(domainId)` inside a component wrapped by `HAI3Provider` - `inst-call-domain-extensions`
2. [x] - `p1` - Hook reads `app.mfeRegistry` from `HAI3Context`; throws if registry is absent (requires `microfrontends()` plugin) - `inst-guard-registry`
3. [x] - `p1` - Hook subscribes to `app.store` changes via `useSyncExternalStore` - `inst-subscribe-store`
4. [x] - `p1` - On each store notification, snapshot function calls `registry.getExtensionsForDomain(domainId)` and compares extension IDs to cached value - `inst-diff-extensions`
5. [x] - `p1` - RETURN cached extension array when IDs are unchanged; RETURN new array reference only when IDs differ (prevents spurious re-renders) - `inst-stable-reference`

---

### Observe Registered Packages

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-registered-packages`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer calls `useRegisteredPackages()` inside a component wrapped by `HAI3Provider` - `inst-call-registered-packages`
2. [x] - `p1` - Hook reads `app.mfeRegistry`; throws if absent - `inst-guard-registry-packages`
3. [x] - `p1` - Hook subscribes to `app.store` changes via `useSyncExternalStore` - `inst-subscribe-store-packages`
4. [x] - `p1` - Snapshot function calls `registry.getRegisteredPackages()`, joins with comma as cache key; RETURN cached list when unchanged - `inst-diff-packages`

---

### Observe Mounted Extensions in a Domain

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-use-mounted-extensions`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

Domain-agnostic hook that returns the currently-mounted `Extension` instances for any registered domain — including multi-mount domains backed by `ConcurrentMountStrategy`. Pairs with `getMountedExtensions(domainId)` on the registry.

1. [x] - `p1` - Developer calls `useMountedExtensions(domainId)` inside a component wrapped by `HAI3Provider` - `inst-call-mounted-extensions`
2. [x] - `p1` - Hook reads `app.mfeRegistry`; throws if absent (requires `microfrontends()` plugin) - `inst-guard-registry-mounted`
3. [x] - `p1` - Hook subscribes to `app.store` changes via `useSyncExternalStore` - `inst-subscribe-store-mounted`
4. [x] - `p1` - Snapshot function reads `ids = registry.getMountedExtensions(domainId)` and resolves each ID to the corresponding `Extension` instance via `registry.getExtension(id)`, filtering out any that resolve to `undefined` (race against unregister) - `inst-use-mounted-extensions-snapshot`
5. [x] - `p1` - Compute scalar cache key by joining `ids` with comma; IF cache key unchanged RETURN previous reference; ELSE update ref and RETURN new array - `inst-mounted-extensions-stable-ref`

---

### Provide MFE Context to Child Extension

- [x] `p1` - **ID**: `cpt-frontx-flow-react-bindings-mfe-provider`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`

1. [x] - `p1` - Host (or MFE mounting system) renders `<MfeProvider value={{ bridge, extensionId, domainId }}>` around the MFE component tree - `inst-render-mfe-provider`
2. [x] - `p1` - `MfeContext` is populated with `MfeContextValue` so child MFE hooks can access the bridge - `inst-set-mfe-context`
3. [x] - `p1` - `useMfeBridge()` called within any descendant returns `bridge` from `MfeContext` (throws if no `MfeProvider` ancestor) - `inst-use-bridge`
4. [x] - `p1` - `useMfeContext()` called within any descendant returns the full `MfeContextValue` (throws if no `MfeProvider` ancestor) - `inst-use-mfe-context`

---

### Access the FrontX App Instance Directly

- [x] `p2` - **ID**: `cpt-frontx-flow-react-bindings-use-hai3`

**Actors**: `cpt-frontx-actor-developer`

1. [x] - `p2` - Developer calls `useFrontX()` inside a component wrapped by `HAI3Provider` - `inst-call-use-hai3`
2. [x] - `p2` - Hook reads `HAI3Context` and throws if context value is `null` (i.e., called outside `HAI3Provider`) - `inst-guard-hai3-context`
3. [x] - `p2` - RETURN `HAI3App` instance - `inst-return-hai3-app`

---

## 3. Processes / Business Logic (CDSL)

### Resolve HAI3App Instance

- [x] `p1` - **ID**: `cpt-frontx-algo-react-bindings-resolve-app`

1. [x] - `p1` - IF `app` prop is provided THEN RETURN provided `app` unchanged - `inst-use-provided-app`
2. [x] - `p1` - IF `app` prop is absent THEN call `createHAI3App(config)` with the optional `config` prop (or `undefined`) and RETURN the result - `inst-create-app`
3. [x] - `p1` - The resolved app is memoized so identity is stable across re-renders as long as `app` and `config` props do not change - `inst-memoize-app`

---

### Load Screen Translations

- [x] `p1` - **ID**: `cpt-frontx-algo-react-bindings-load-screen-translations`

1. [x] - `p1` - Determine `currentLanguage` from `i18nRegistry.getLanguage()` - `inst-get-current-lang`
2. [x] - `p1` - IF `currentLanguage` is `null` OR `currentLanguage` equals `loadedLanguage` (already loaded for this language) THEN RETURN without action - `inst-skip-if-loaded`
3. [x] - `p1` - IF `translations` input is a function (TranslationLoader) THEN use it directly; ELSE convert the TranslationMap object to an async loader that dynamic-imports from the language-keyed entry - `inst-resolve-loader`
4. [x] - `p1` - Register the loader with `i18nRegistry.registerLoader(namespace, loader)` where `namespace = "screen.{screensetId}.{screenId}"` - `inst-register-loader`
5. [x] - `p1` - Call `loader(currentLanguage)` to obtain the translation dictionary for the current language - `inst-call-loader`
6. [x] - `p1` - Call `i18nRegistry.register(namespace, currentLanguage, loadedTranslations)` to make translations available to `t()` - `inst-register-translations`
7. [x] - `p1` - IF the component unmounted before the async operation completed THEN discard the result without calling setState - `inst-cancel-on-unmount`
8. [x] - `p1` - IF loading throws THEN store the error in component state and expose via `error` return field - `inst-handle-load-error`
9. [x] - `p1` - IF language changes while translations are loading THEN cancel the in-flight load and begin a new load for the updated language - `inst-cancel-stale-load`

---

### Build Provider Tree

- [x] `p1` - **ID**: `cpt-frontx-algo-react-bindings-build-provider-tree`

1. [x] - `p1` - Resolve `HAI3App` instance (see `cpt-frontx-algo-react-bindings-resolve-app`) - `inst-resolve-app-tree`
2. [x] - `p1` - Inner stack starts with `<HAI3Context.Provider value={app}>` - `inst-wrap-hai3-context`
3. [x] - `p1` - Wrap in `<ReduxProvider store={app.store}>` - `inst-wrap-redux`
4. [x] - `p1` - Resolve the plugin-owned `QueryClient` from the app (bootstrap/activation semantics used by `HAI3Provider`, e.g. `useBootstrappedHAI3QueryClient(app)`), then wrap in `<HAI3QueryClientProvider queryClient={queryClient}>`; when `queryClient` is `undefined`, that component renders `children` without TanStack `QueryClientProvider`. Keep `children` innermost - `inst-render-query-provider` / `inst-render-children-tree`
5. [x] - `p2` - IF `mfeBridge` prop is present THEN return that stack wrapped in `<MfeProvider value={mfeBridge}>` as the outermost provider; ELSE return the stack unchanged - `inst-wrap-mfe-conditional`

---

### Validate MFE Context Guard

- [x] `p1` - **ID**: `cpt-frontx-algo-react-bindings-mfe-context-guard`

Guards that throw when MFE-scoped hooks are used outside their required context.

1. [x] - `p1` - `useMfeBridge()`, `useMfeContext()`, `useSharedProperty()`, `useHostAction()` MUST throw a descriptive error if called outside a `MfeProvider` ancestor - `inst-throw-no-mfe-context`
2. [x] - `p1` - `useFrontX()` MUST throw a descriptive error if called outside a `HAI3Provider` ancestor - `inst-throw-no-hai3-context`
3. [x] - `p1` - `useDomainExtensions()`, `useRegisteredPackages()` MUST throw if `app.mfeRegistry` is not present, directing developers to add the `microfrontends()` plugin - `inst-throw-no-registry`

---

### Compute Stable External Store Snapshots

- [x] `p1` - **ID**: `cpt-frontx-algo-react-bindings-stable-snapshots`

Prevents unnecessary re-renders in store-subscribed hooks by returning referentially stable values.

1. [x] - `p1` - Each hook that subscribes to `app.store` via `useSyncExternalStore` MUST maintain a local ref holding the previous snapshot value - `inst-cache-ref`
2. [x] - `p1` - Snapshot function computes a scalar cache key (comma-joined IDs or comparable primitive) from the registry query result - `inst-compute-cache-key`
3. [x] - `p1` - IF cache key has not changed THEN RETURN the previous array/value reference unchanged - `inst-return-cached`
4. [x] - `p1` - IF cache key has changed THEN update the ref with the new value and RETURN the new reference - `inst-update-cache`

---

## 4. States (CDSL)

### Extension Slot Lifecycle

- [x] `p1` - **ID**: `cpt-frontx-state-react-bindings-extension-slot`

Tracks the lifecycle of a single `ExtensionDomainSlot` component instance. Because the slot is per-domain (per `cpt-frontx-flow-react-bindings-extension-domain-slot`), its lifecycle is reduced to root attachment — mount/unmount of individual extensions inside the root is owned by the per-domain `ExtensionMounter`, not the slot.

1. [x] - `p1` - **FROM** `DETACHED` **TO** `ATTACHED` **WHEN** the React ref-attach callback fires and `mounter.attach(element)` returns - `inst-slot-attached`
2. [x] - `p1` - **FROM** `ATTACHED` **TO** `DETACHED` **WHEN** the React component unmounts and `mounter.detach()` returns (after the mounter has mass-unmounted every currently-mounted extension in the domain) - `inst-slot-detached`
3. [x] - `p2` - **FROM** `ATTACHED` **TO** `ATTACHED` (no-op) **WHEN** parent supplies the same `domainId` and `registry` props on re-render - `inst-slot-stable-rerender`

---

### Screen Translation Loading

- [x] `p1` - **ID**: `cpt-frontx-state-react-bindings-screen-translation`

Tracks per-language load state for `useScreenTranslations`.

1. [x] - `p1` - **FROM** `UNLOADED` **TO** `LOADING` **WHEN** current language is set and differs from loaded language - `inst-begin-load`
2. [x] - `p1` - **FROM** `LOADING` **TO** `LOADED` **WHEN** loader resolves and translations are registered in `i18nRegistry` - `inst-load-success`
3. [x] - `p1` - **FROM** `LOADING` **TO** `ERROR` **WHEN** loader rejects - `inst-load-error`
4. [x] - `p1` - **FROM** `LOADED` **TO** `LOADING` **WHEN** language changes to a language not yet loaded for this screen namespace - `inst-reload-on-lang-change`
5. [x] - `p2` - **FROM** `ERROR` **TO** `LOADING` **WHEN** language changes, providing an implicit retry - `inst-retry-on-lang-change`

---

## 5. Definitions of Done

### Root Provider and App Resolution

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-provider`

`HAI3Provider` accepts `children`, optional `config`, optional pre-built `app`, and optional `mfeBridge`. When `app` is not provided, it creates one via `createHAI3App(config)`. When the app was built with `queryCache()` or `queryCacheShared()`, `HAI3Provider` resolves the attached shared `QueryClient` and mounts `<HAI3QueryClientProvider queryClient={...}>` (the inner component only accepts `queryClient` and `children`, not the app); otherwise `queryClient` stays `undefined` and the query provider passes `children` through without TanStack context. Internally created resources are cleaned up on unmount. Provider order is innermost-to-outermost: `HAI3Context` → `ReduxProvider` → `HAI3QueryClientProvider` → `children`. When `mfeBridge` is supplied, `MfeProvider` wraps that entire stack as the outermost provider (so MFE context wraps the Redux and query layers, not the other way around).

For MFE screen roots, the host owns the shared `QueryClient` through `queryCache()` and the child app joins that same cache through `queryCacheShared()` before the first React commit. `HAI3Provider` resolves the resulting shared client from the app instance and keeps L1 mount contracts free of cache metadata. Overlapping descriptor fetches can still reuse the same `sharedFetchCache` window across roots before TanStack observers attach.

**Implements**:
- `cpt-frontx-algo-react-bindings-resolve-app`
- `cpt-frontx-algo-react-bindings-build-provider-tree`
- `cpt-frontx-flow-react-bindings-bootstrap-provider`
- `cpt-frontx-flow-react-bindings-mfe-provider`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-principle-layer-isolation`
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-react`
- `cpt-frontx-seq-app-bootstrap`

---

### Typed Redux Hooks

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-redux-hooks`

`useAppSelector` is a `TypedUseSelectorHook<RootState>` wrapping `react-redux` `useSelector`. `useAppDispatch` wraps `react-redux` `useDispatch` and casts the return type to `AppDispatch`. Both hooks require `HAI3Provider` in the ancestor tree. Neither hook imports directly from `@cyberfabric/state`.

**Implements**:
- `cpt-frontx-flow-react-bindings-use-selector`
- `cpt-frontx-flow-react-bindings-use-dispatch`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-principle-layer-isolation`
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-react`

---

### Translation Hook

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-translation-hook`

`useTranslation` returns `{ t, language, setLanguage, isRTL }`. It subscribes to `i18nRegistry` version via `useSyncExternalStore` so components re-render on language changes. `setLanguage` dispatches `app.actions.setLanguage` which propagates to MFEs via the event bus. The hook never imports from `@cyberfabric/i18n` directly.

**Implements**:
- `cpt-frontx-flow-react-bindings-use-translation`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-component-react`
- `cpt-frontx-constraint-no-react-below-l3`

---

### Screen Translation Hook

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-screen-translation-hook`

`useScreenTranslations(screensetId, screenId, translations)` lazily loads screen-scoped translations under `screen.{screensetId}.{screenId}` namespace. It accepts either a `TranslationMap` or a `TranslationLoader`. It reloads automatically when the language changes. Returns `{ isLoaded, error }`. Stale (cancelled) in-flight loads do not mutate state after cancellation.

**Implements**:
- `cpt-frontx-flow-react-bindings-use-screen-translations`
- `cpt-frontx-algo-react-bindings-load-screen-translations`
- `cpt-frontx-state-react-bindings-screen-translation`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-fr-i18n-lazy-chunks`
- `cpt-frontx-nfr-perf-lazy-loading`

**Covers (DESIGN)**:
- `cpt-frontx-component-react`
- `cpt-frontx-constraint-no-react-below-l3`

---

### Theme Hook

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-theme-hook`

`useTheme` returns `{ currentTheme, themes, setTheme }`. It subscribes to `themeRegistry` version via `useSyncExternalStore`. `setTheme(themeId)` dispatches `app.actions.changeTheme`. The themes list is derived from `themeRegistry.getAll()`.

**Implements**:
- `cpt-frontx-flow-react-bindings-use-theme`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-component-react`
- `cpt-frontx-constraint-no-react-below-l3`

---

### Formatters Hook

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-formatters-hook`

`useFormatters` returns a memoized `Formatters` object containing all locale-aware formatter functions from `@cyberfabric/framework`. It internally calls `useTranslation()` to subscribe to language changes. The returned object is re-created only when `language` changes, preventing unnecessary re-renders from unrelated state updates.

**Implements**:
- `cpt-frontx-flow-react-bindings-use-formatters`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-component-react`
- `cpt-frontx-constraint-no-react-below-l3`

---

### Extension Domain Slot Component

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-extension-slot`

`ExtensionDomainSlot` is a **per-domain** component. It accepts a `domainId` (no `extensionId` prop) and renders exactly ONE root `<div>` per domain instance. The slot's only job is to provide the DOM root that the per-domain `ExtensionMounter` uses to host extensions; what lives inside the root is decided by the domain's strategy and `ContainerHooks`. The slot is uniform across all cardinalities — Exclusive, Optional, Concurrent — there is no per-cardinality variant.

On its `ref` callback the slot resolves `mounter = registry.getMounter(domainId)` and calls `mounter.attach(element)`; on cleanup it calls `mounter.detach()`. The slot does NOT call any method on `ExtensionDomainImplementation` directly — root attachment is now an `ExtensionMounter` responsibility (per `cpt-frontx-adr-domain-implementation-mount-strategies`). The slot does NOT render React children for mounted extensions — multi-mount children are placed imperatively under the attached root by the mounter as the active `MountStrategy` calls `mounter.mount(extId, container)` per extension.

The slot does NOT dispatch `mount_ext` or `unmount_ext` action chains; mount and unmount actions are dispatched by the host application via `registry.executeActionsChain`. Optional `onAttached(element)` and `onDetached()` callbacks let hosts observe root lifecycle. The mounted child app reuses the host **shared `QueryClient`** by building with `queryCacheShared()` instead of threading a `QueryClient` through this component or leaking cache metadata into L1 contracts.

On detach, `mounter.detach()` mass-unmounts every currently-mounted extension in the domain — calling `mounter.unmount(extId)` and `hooks.destroy(extId)` per extension — so no orphan DOM trees remain and the slice/registry stay consistent. Each removal flows through the framework's diff dispatch (with idempotent reducers per `cpt-frontx-algo-framework-composition-mount-set-diff-dispatch`).

**Implements**:
- `cpt-frontx-flow-react-bindings-extension-domain-slot`
- `cpt-frontx-state-react-bindings-extension-slot`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-nfr-sec-shadow-dom`
- `cpt-frontx-nfr-rel-error-handling`
- `cpt-frontx-nfr-perf-lazy-loading`

**Covers (DESIGN)**:
- `cpt-frontx-component-react`
- `cpt-frontx-constraint-no-react-below-l3`

---

### MFE Hooks

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-mfe-hooks`

All five MFE-scoped hooks (`useMfeBridge`, `useMfeContext`, `useSharedProperty`, `useHostAction`) require a `MfeProvider` ancestor and throw a descriptive error when used outside one. `useSharedProperty<T>(propertyTypeId)` subscribes via `bridge.subscribeToProperty` and returns typed property values using `useSyncExternalStore`. `useHostAction(actionTypeId)` returns a stable callback that constructs and dispatches an `ActionsChain`; execution errors are logged but not thrown.

**Implements**:
- `cpt-frontx-flow-react-bindings-use-shared-property`
- `cpt-frontx-flow-react-bindings-use-host-action`
- `cpt-frontx-flow-react-bindings-mfe-provider`
- `cpt-frontx-algo-react-bindings-mfe-context-guard`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-fr-broadcast-write-api`
- `cpt-frontx-nfr-rel-error-handling`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-component-react`
- `cpt-frontx-constraint-no-react-below-l3`

---

### Domain and Package Observation Hooks

- [x] `p1` - **ID**: `cpt-frontx-dod-react-bindings-observation-hooks`

`useDomainExtensions(domainId)`, `useRegisteredPackages()`, and `useMountedExtensions(domainId): Extension[]` subscribe to `app.store` changes via `useSyncExternalStore`. All three require `app.mfeRegistry` (throw if absent). All three use ref-based snapshot caching to return referentially stable arrays, preventing re-renders when the underlying data has not changed. `useDomainExtensions(domainId)` enumerates every extension registered against the domain regardless of the GTS package it originated from — for the screen domain it surfaces every screen extension across every GTS package discovered at runtime, which is the contract the nav menu relies on to render its full screen list. `useRegisteredPackages()` is a passive enumeration of the GTS packages discovered at runtime; it is observation-only and does not drive any filtering. `useMountedExtensions(domainId)` is the domain-agnostic hook for arbitrary domains, including multi-mount domains backed by `ConcurrentMountStrategy`; it resolves each ID returned by `getMountedExtensions(domainId)` to the corresponding `Extension` instance via `registry.getExtension(id)`.

**Implements**:
- `cpt-frontx-flow-react-bindings-use-domain-extensions`
- `cpt-frontx-flow-react-bindings-use-registered-packages`
- `cpt-frontx-flow-react-bindings-use-mounted-extensions`
- `cpt-frontx-algo-react-bindings-stable-snapshots`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-component-react`
- `cpt-frontx-constraint-no-react-below-l3`

---

### EventPayloadMap Module Augmentation Re-export

- [x] `p2` - **ID**: `cpt-frontx-dod-react-bindings-event-payload-map`

`@cyberfabric/react` re-declares `EventPayloadMap` as an interface extending `FrameworkEventPayloadMap` from `@cyberfabric/framework`. This creates a TypeScript declaration site at L3 that application code can augment using `declare module '@cyberfabric/react'`, avoiding direct imports from L1 (`@cyberfabric/state`). The `eventBus` instance is re-exported with the augmented type so that event bus calls in application code are type-safe against both framework and application events.

**Implements**:
- (architectural pattern, no specific flow)

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-layer-deps`
- `cpt-frontx-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-frontx-principle-layer-isolation`
- `cpt-frontx-constraint-no-react-below-l3`

---

## 6. Acceptance Criteria

- [x]`HAI3Provider` renders without errors when given only `children`, with `config`, with a pre-built `app`, and with `mfeBridge`
- [x]`useAppSelector` returns typed state; re-renders component when selected value changes, does not re-render when unrelated state changes
- [x]`useAppDispatch` returns a function that dispatches Redux actions to the store
- [x]`useTranslation` returns current language, a working `t()` function, correct `isRTL`, and a `setLanguage` that triggers language propagation to MFEs
- [x]`useScreenTranslations` transitions through `UNLOADED → LOADING → LOADED` states; reloads when language changes; does not update state after unmount
- [x]`useTheme` returns current theme and available themes; `setTheme` triggers framework theme change action
- [x]`useFormatters` returns locale-aware formatters that recalculate on language change
- [x] `ExtensionDomainSlot` is per-domain only (no `extensionId` prop), renders exactly ONE root `<div>` per domain instance, calls `registry.getMounter(domainId).attach(element)` from its ref-attach callback and `mounter.detach()` on cleanup; on detach, `mounter.detach()` mass-unmounts every currently-mounted extension in the domain so no orphan DOM trees or slice/registry desync remain. The slot does NOT dispatch `mount_ext` or `unmount_ext` actions — the host owns those dispatches via `registry.executeActionsChain`
- [x] `useMountedExtensions(domainId)` returns the array of currently-mounted `Extension` instances for the named domain (multi-mount domains return >1 entries); the array reference is stable when the underlying ID list is unchanged
- [x] `useDomainExtensions(HAI3_SCREEN_DOMAIN)` returns every screen extension registered at runtime — including those whose IDs belong to different GTS packages — without filtering by package, so a nav menu wired to this hook lists screens from every co-existing package
- [x] `useRegisteredPackages()` is a passive enumeration of GTS packages discovered at runtime; consumers use it for observation only and not for filtering other queries
- [x]`useSharedProperty` re-renders MFE component when host updates the subscribed property
- [x]`useHostAction` sends an `ActionsChain` to the host bridge; errors are logged to console, not thrown
- [x]`useDomainExtensions` and `useRegisteredPackages` both throw descriptive errors when `microfrontends()` plugin is absent
- [x]All three observation hooks return referentially stable arrays when the underlying data has not changed
- [x]MFE-scoped hooks throw descriptive errors when called outside `MfeProvider`
- [x]`useFrontX` throws descriptive error when called outside `HAI3Provider`
- [x]`@cyberfabric/react` imports ZERO `@cyberfabric/state`, `@cyberfabric/screensets`, `@cyberfabric/api`, or `@cyberfabric/i18n` packages directly (enforced by dependency-cruiser)
- [x]All components accept `ref` as a prop (React 19 pattern; no `forwardRef`)
- [x]TypeScript strict mode passes with zero `@ts-ignore` suppressions in source files
