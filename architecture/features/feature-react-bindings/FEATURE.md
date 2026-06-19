# Feature: React Bindings


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
  - [Render an MFE Extension in a Domain Slot](#render-an-mfe-extension-in-a-domain-slot)
  - [Subscribe to Shared Property from MFE](#subscribe-to-shared-property-from-mfe)
  - [Request Host Action from MFE](#request-host-action-from-mfe)
  - [Observe Domain Extensions](#observe-domain-extensions)
  - [Observe Registered Packages](#observe-registered-packages)
  - [Observe Active Screen Package](#observe-active-screen-package)
  - [Provide MFE Context to Child Extension](#provide-mfe-context-to-child-extension)
  - [Access the HAI3 App Instance Directly](#access-the-hai3-app-instance-directly)
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
  - [RefContainerProvider](#refcontainerprovider)
  - [EventPayloadMap Module Augmentation Re-export](#eventpayloadmap-module-augmentation-re-export)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-hai3-featstatus-react-bindings`

- [x] `p2` - `cpt-hai3-feature-react-bindings`
---

## 1. Feature Context

### 1.1 Overview

React Bindings is the L3 boundary that exposes the HAI3 framework to React 19 applications. It converts the framework's plain-object output (`HAI3App`) into React context, typed hooks, and MFE rendering components, forming the primary developer-facing API surface of the entire system.

Problem: The framework layer (`@gears-frontx/framework`) is deliberately React-agnostic. Application developers need typed React hooks, a root provider that wires Redux and i18n into the React tree, and components that can mount MFE extensions with CSS isolation — without importing directly from L1/L2 packages.

Primary value: One import (`@gears-frontx/react`) gives developers access to the full HAI3 surface in a React-idiomatic way while preserving the strict layer hierarchy.

Key assumptions:
- The consuming application runs React 19.
- A `HAI3App` instance exists before `HAI3Provider` is rendered (either pre-built or created internally).
- MFE hooks may only be called from within `MfeProvider` context.

### 1.2 Purpose

Bridge `@gears-frontx/framework` to React 19 by providing the provider tree, typed hooks, and MFE rendering components that application developers interact with directly. Keep all React-specific code confined to L3, preserving framework-agnosticism of L1 and L2.

Success criteria: Developers can wrap their application with `<HAI3Provider>`, access typed Redux state, translations, theme, shared properties, and domain extensions solely through hooks exported from `@gears-frontx/react`, with no need to import from `@gears-frontx/framework` or lower layers.

### 1.3 Actors

- `cpt-hai3-actor-developer`
- `cpt-hai3-actor-host-app`
- `cpt-hai3-actor-microfrontend`
- `cpt-hai3-actor-runtime`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — Section 2.7
- Depends on: `cpt-hai3-feature-framework-composition`
- Design component: `cpt-hai3-component-react`
- ADRs: `cpt-hai3-adr-mandatory-screen-lazy-loading`, `cpt-hai3-adr-react-19-ref-as-prop`

---

## 2. Actor Flows (CDSL)

### Bootstrap Application with HAI3Provider

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-bootstrap-provider`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Host application renders `<HAI3Provider>` with optional `config`, `app`, or `mfeBridge` props - `inst-render-provider`
2. [x] - `p1` - Algorithm: resolve HAI3App instance using `cpt-hai3-algo-react-bindings-resolve-app` - `inst-resolve-app`
3. [x] - `p1` - `HAI3App` instance placed into `HAI3Context` via React context provider - `inst-set-hai3-context`
4. [x] - `p1` - Redux store from `app.store` wrapped in `react-redux` `<Provider>` - `inst-set-redux-provider`
5. [x] - `p2` - IF `mfeBridge` prop is present THEN wrap the context tree in `<MfeProvider value={mfeBridge}>` - `inst-wrap-mfe-provider`
6. [x] - `p1` - Child components rendered inside the complete context tree - `inst-render-children`
7. [x] - `p1` - On unmount: IF app was created internally (no `app` prop provided) THEN call `app.destroy()` - `inst-destroy-app`

---

### Access Typed Redux State in a Component

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-selector`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useAppSelector(selectorFn)` inside a component tree wrapped by `HAI3Provider` - `inst-call-selector`
2. [x] - `p1` - Hook delegates to `react-redux` `useSelector` typed against `RootState` from `@gears-frontx/framework` - `inst-delegate-selector`
3. [x] - `p1` - Runtime returns the slice of state selected by `selectorFn` - `inst-return-state`
4. [x] - `p1` - Component re-renders when selected value changes - `inst-rerender-on-change`

---

### Dispatch Actions from a Component

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-dispatch`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useAppDispatch()` inside a component tree wrapped by `HAI3Provider` - `inst-call-dispatch`
2. [x] - `p1` - Hook delegates to `react-redux` `useDispatch` and casts return type to `AppDispatch` from `@gears-frontx/framework` - `inst-delegate-dispatch`
3. [x] - `p1` - Developer uses returned `dispatch` function to dispatch typed Redux actions - `inst-use-dispatch`

---

### Use Translations in a Component

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-translation`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useTranslation()` inside a component tree wrapped by `HAI3Provider` - `inst-call-translation`
2. [x] - `p1` - Hook reads `app.i18nRegistry` from `HAI3Context` - `inst-read-i18n-registry`
3. [x] - `p1` - Hook subscribes to `i18nRegistry` version changes via `useSyncExternalStore` - `inst-subscribe-i18n`
4. [x] - `p1` - Hook returns `{ t, language, setLanguage, isRTL }` - `inst-return-translation-api`
5. [x] - `p1` - When developer calls `setLanguage(lang)`, hook dispatches `app.actions.setLanguage` on the framework, which propagates via event bus to MFEs - `inst-set-language`
6. [x] - `p1` - Component re-renders when `i18nRegistry` version changes (new translations registered or language changed) - `inst-rerender-on-lang-change`

---

### Lazy-Load Screen Translations

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-screen-translations`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Screen component calls `useScreenTranslations(screensetId, screenId, translations)` where `translations` is either a `TranslationMap` or a `TranslationLoader` from `I18nRegistry.createLoader()` - `inst-call-screen-translations`
2. [x] - `p1` - Hook subscribes to `i18nRegistry` version changes to detect language switches - `inst-subscribe-lang-change`
3. [x] - `p1` - Algorithm: load screen translations using `cpt-hai3-algo-react-bindings-load-screen-translations` - `inst-run-load-screen-translations`
4. [x] - `p1` - Hook returns `{ isLoaded, error }` reflecting current loading state - `inst-return-loading-state`
5. [x] - `p1` - Screen component gates render on `isLoaded` to prevent premature display before translations are available - `inst-gate-render`

---

### Switch Theme from a Component

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-theme`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useTheme()` inside a component tree wrapped by `HAI3Provider` - `inst-call-theme`
2. [x] - `p1` - Hook reads `app.themeRegistry` from `HAI3Context` - `inst-read-theme-registry`
3. [x] - `p1` - Hook subscribes to `themeRegistry` version changes via `useSyncExternalStore` - `inst-subscribe-theme`
4. [x] - `p1` - Hook returns `{ currentTheme, themes, setTheme }` - `inst-return-theme-api`
5. [x] - `p1` - When developer calls `setTheme(themeId)`, hook dispatches `app.actions.changeTheme` - `inst-dispatch-change-theme`
6. [x] - `p1` - Component re-renders when theme registry version changes - `inst-rerender-on-theme-change`

---

### Access Locale-Aware Formatters

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-formatters`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useFormatters()` inside a component tree wrapped by `HAI3Provider` - `inst-call-formatters`
2. [x] - `p1` - Hook calls `useTranslation()` internally to subscribe to language changes - `inst-subscribe-via-translation`
3. [x] - `p1` - Hook returns a memoized `Formatters` object (formatDate, formatTime, formatDateTime, formatRelative, formatNumber, formatPercent, formatCompact, formatCurrency, compareStrings, createCollator) - `inst-return-formatters`
4. [x] - `p1` - Returned formatters read current locale from `i18nRegistry.getLanguage()` at call time - `inst-formatters-read-locale`
5. [x] - `p1` - Memoized object is replaced when language changes, triggering re-render of subscribing components - `inst-recompute-on-lang`

---

### Render an MFE Extension in a Domain Slot

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-extension-domain-slot`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-microfrontend`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Host renders `<ExtensionDomainSlot registry={registry} domainId={...} extensionId={...}>` - `inst-render-slot`
2. [x] - `p1` - Component renders a loading placeholder while mounting proceeds - `inst-show-loading`
3. [x] - `p1` - Component dispatches `HAI3_ACTION_MOUNT_EXT` via `registry.executeActionsChain()` with `domainId` and `extensionId` - `inst-dispatch-mount`
4. [x] - `p1` - IF mount succeeds THEN component queries `registry.getParentBridge(extensionId)` to obtain the parent bridge - `inst-get-bridge`
5. [x] - `p1` - IF bridge is returned THEN component transitions to mounted state and invokes optional `onMounted(bridge)` callback - `inst-notify-mounted`
6. [x] - `p1` - IF mount throws THEN component transitions to error state, renders error UI, invokes optional `onError(err)` callback - `inst-handle-mount-error`
7. [x] - `p1` - On component unmount: IF bridge was obtained THEN dispatch `HAI3_ACTION_UNMOUNT_EXT` asynchronously, then invoke optional `onUnmounted()` callback - `inst-cleanup-unmount`
8. [x] - `p2` - IF component unmounts while mount is still in progress THEN dispatch `HAI3_ACTION_UNMOUNT_EXT` immediately after the in-flight mount resolves - `inst-race-cleanup`

---

### Subscribe to Shared Property from MFE

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-shared-property`

**Actors**: `cpt-hai3-actor-microfrontend`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - MFE component calls `useSharedProperty(propertyTypeId)` - `inst-call-shared-property`
2. [x] - `p1` - Hook reads `bridge` from `MfeContext` (throws if called outside `MfeProvider`) - `inst-read-bridge`
3. [x] - `p1` - Hook subscribes to property changes via `bridge.subscribeToProperty(propertyTypeId, callback)` using `useSyncExternalStore` - `inst-subscribe-property`
4. [x] - `p1` - Hook returns `bridge.getProperty(propertyTypeId)?.value` typed as `T | undefined` - `inst-return-property-value`
5. [x] - `p1` - Component re-renders each time the host updates the property via `bridge.subscribeToProperty` notification - `inst-rerender-on-property-change`

---

### Request Host Action from MFE

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-host-action`

**Actors**: `cpt-hai3-actor-microfrontend`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - MFE component calls `useHostAction(actionTypeId)` - `inst-call-host-action`
2. [x] - `p1` - Hook reads `bridge` from `MfeContext` (throws if called outside `MfeProvider`) - `inst-read-bridge-for-action`
3. [x] - `p1` - Hook returns a stable callback that constructs an `ActionsChain` targeting `bridge.domainId` and dispatches it via `bridge.executeActionsChain()` - `inst-return-action-callback`
4. [x] - `p1` - IF `executeActionsChain` rejects THEN error is logged to console without propagating to the component - `inst-log-action-error`

---

### Observe Domain Extensions

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-domain-extensions`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useDomainExtensions(domainId)` inside a component wrapped by `HAI3Provider` - `inst-call-domain-extensions`
2. [x] - `p1` - Hook reads `app.screensetsRegistry` from `HAI3Context`; throws if registry is absent (requires `microfrontends()` plugin) - `inst-guard-registry`
3. [x] - `p1` - Hook subscribes to `app.store` changes via `useSyncExternalStore` - `inst-subscribe-store`
4. [x] - `p1` - On each store notification, snapshot function calls `registry.getExtensionsForDomain(domainId)` and compares extension IDs to cached value - `inst-diff-extensions`
5. [x] - `p1` - RETURN cached extension array when IDs are unchanged; RETURN new array reference only when IDs differ (prevents spurious re-renders) - `inst-stable-reference`

---

### Observe Registered Packages

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-registered-packages`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useRegisteredPackages()` inside a component wrapped by `HAI3Provider` - `inst-call-registered-packages`
2. [x] - `p1` - Hook reads `app.screensetsRegistry`; throws if absent - `inst-guard-registry-packages`
3. [x] - `p1` - Hook subscribes to `app.store` changes via `useSyncExternalStore` - `inst-subscribe-store-packages`
4. [x] - `p1` - Snapshot function calls `registry.getRegisteredPackages()`, joins with comma as cache key; RETURN cached list when unchanged - `inst-diff-packages`

---

### Observe Active Screen Package

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-use-active-package`

**Actors**: `cpt-hai3-actor-developer`, `cpt-hai3-actor-runtime`

1. [x] - `p1` - Developer calls `useActivePackage()` inside a component wrapped by `HAI3Provider` - `inst-call-active-package`
2. [x] - `p1` - Hook reads `app.screensetsRegistry`; throws if absent - `inst-guard-registry-active`
3. [x] - `p1` - Hook subscribes to `app.store` changes via `useSyncExternalStore` - `inst-subscribe-store-active`
4. [x] - `p1` - Snapshot function calls `registry.getMountedExtension(HAI3_SCREEN_DOMAIN)` - `inst-get-mounted-extension`
5. [x] - `p1` - IF no extension mounted THEN RETURN `undefined` - `inst-return-undefined-active`
6. [x] - `p1` - IF extension mounted THEN call `extractGtsPackage(extensionId)` and RETURN result, using cached value when unchanged - `inst-extract-package`

---

### Provide MFE Context to Child Extension

- [x] `p1` - **ID**: `cpt-hai3-flow-react-bindings-mfe-provider`

**Actors**: `cpt-hai3-actor-host-app`, `cpt-hai3-actor-microfrontend`

1. [x] - `p1` - Host (or MFE mounting system) renders `<MfeProvider value={{ bridge, extensionId, domainId }}>` around the MFE component tree - `inst-render-mfe-provider`
2. [x] - `p1` - `MfeContext` is populated with `MfeContextValue` so child MFE hooks can access the bridge - `inst-set-mfe-context`
3. [x] - `p1` - `useMfeBridge()` called within any descendant returns `bridge` from `MfeContext` (throws if no `MfeProvider` ancestor) - `inst-use-bridge`
4. [x] - `p1` - `useMfeContext()` called within any descendant returns the full `MfeContextValue` (throws if no `MfeProvider` ancestor) - `inst-use-mfe-context`

---

### Access the HAI3 App Instance Directly

- [x] `p2` - **ID**: `cpt-hai3-flow-react-bindings-use-hai3`

**Actors**: `cpt-hai3-actor-developer`

1. [x] - `p2` - Developer calls `useHAI3()` inside a component wrapped by `HAI3Provider` - `inst-call-use-hai3`
2. [x] - `p2` - Hook reads `HAI3Context` and throws if context value is `null` (i.e., called outside `HAI3Provider`) - `inst-guard-hai3-context`
3. [x] - `p2` - RETURN `HAI3App` instance - `inst-return-hai3-app`

---

## 3. Processes / Business Logic (CDSL)

### Resolve HAI3App Instance

- [x] `p1` - **ID**: `cpt-hai3-algo-react-bindings-resolve-app`

1. [x] - `p1` - IF `app` prop is provided THEN RETURN provided `app` unchanged - `inst-use-provided-app`
2. [x] - `p1` - IF `app` prop is absent THEN call `createHAI3App(config)` with the optional `config` prop (or `undefined`) and RETURN the result - `inst-create-app`
3. [x] - `p1` - The resolved app is memoized so identity is stable across re-renders as long as `app` and `config` props do not change - `inst-memoize-app`

---

### Load Screen Translations

- [x] `p1` - **ID**: `cpt-hai3-algo-react-bindings-load-screen-translations`

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

- [x] `p1` - **ID**: `cpt-hai3-algo-react-bindings-build-provider-tree`

1. [x] - `p1` - Resolve `HAI3App` instance (see `cpt-hai3-algo-react-bindings-resolve-app`) - `inst-resolve-app-tree`
2. [x] - `p1` - Construct innermost context: `<HAI3Context.Provider value={app}>` - `inst-wrap-hai3-context`
3. [x] - `p1` - Wrap in Redux provider: `<ReduxProvider store={app.store}>` - `inst-wrap-redux`
4. [x] - `p2` - IF `mfeBridge` prop is present THEN wrap the above in `<MfeProvider value={mfeBridge}>` - `inst-wrap-mfe-conditional`
5. [x] - `p1` - Render `children` as the innermost element of the composed provider tree - `inst-render-children-tree`

---

### Validate MFE Context Guard

- [x] `p1` - **ID**: `cpt-hai3-algo-react-bindings-mfe-context-guard`

Guards that throw when MFE-scoped hooks are used outside their required context.

1. [x] - `p1` - `useMfeBridge()`, `useMfeContext()`, `useSharedProperty()`, `useHostAction()` MUST throw a descriptive error if called outside a `MfeProvider` ancestor - `inst-throw-no-mfe-context`
2. [x] - `p1` - `useHAI3()` MUST throw a descriptive error if called outside a `HAI3Provider` ancestor - `inst-throw-no-hai3-context`
3. [x] - `p1` - `useDomainExtensions()`, `useRegisteredPackages()`, `useActivePackage()` MUST throw if `app.screensetsRegistry` is not present, directing developers to add the `microfrontends()` plugin - `inst-throw-no-registry`

---

### Compute Stable External Store Snapshots

- [x] `p1` - **ID**: `cpt-hai3-algo-react-bindings-stable-snapshots`

Prevents unnecessary re-renders in store-subscribed hooks by returning referentially stable values.

1. [x] - `p1` - Each hook that subscribes to `app.store` via `useSyncExternalStore` MUST maintain a local ref holding the previous snapshot value - `inst-cache-ref`
2. [x] - `p1` - Snapshot function computes a scalar cache key (comma-joined IDs or comparable primitive) from the registry query result - `inst-compute-cache-key`
3. [x] - `p1` - IF cache key has not changed THEN RETURN the previous array/value reference unchanged - `inst-return-cached`
4. [x] - `p1` - IF cache key has changed THEN update the ref with the new value and RETURN the new reference - `inst-update-cache`

---

## 4. States (CDSL)

### Extension Slot Lifecycle

- [x] `p1` - **ID**: `cpt-hai3-state-react-bindings-extension-slot`

Tracks the lifecycle of a single `ExtensionDomainSlot` component instance.

1. [x] - `p1` - **FROM** `IDLE` **TO** `MOUNTING` **WHEN** component mounts and DOM container ref is available - `inst-start-mount`
2. [x] - `p1` - **FROM** `MOUNTING` **TO** `MOUNTED` **WHEN** `registry.executeActionsChain(mount)` resolves and `getParentBridge` returns a non-null bridge - `inst-mount-success`
3. [x] - `p1` - **FROM** `MOUNTING` **TO** `ERROR` **WHEN** `registry.executeActionsChain(mount)` rejects or `getParentBridge` returns null - `inst-mount-error`
4. [x] - `p1` - **FROM** `MOUNTED` **TO** `UNMOUNTING` **WHEN** React component unmounts - `inst-start-unmount`
5. [x] - `p1` - **FROM** `MOUNTING` **TO** `UNMOUNTING` **WHEN** React component unmounts before mount resolves - `inst-race-unmount`
6. [x] - `p2` - **FROM** `ERROR` **TO** `MOUNTING` **WHEN** parent supplies a new `extensionId` or `domainId` prop - `inst-retry-mount`

---

### Screen Translation Loading

- [x] `p1` - **ID**: `cpt-hai3-state-react-bindings-screen-translation`

Tracks per-language load state for `useScreenTranslations`.

1. [x] - `p1` - **FROM** `UNLOADED` **TO** `LOADING` **WHEN** current language is set and differs from loaded language - `inst-begin-load`
2. [x] - `p1` - **FROM** `LOADING` **TO** `LOADED` **WHEN** loader resolves and translations are registered in `i18nRegistry` - `inst-load-success`
3. [x] - `p1` - **FROM** `LOADING` **TO** `ERROR` **WHEN** loader rejects - `inst-load-error`
4. [x] - `p1` - **FROM** `LOADED` **TO** `LOADING` **WHEN** language changes to a language not yet loaded for this screen namespace - `inst-reload-on-lang-change`
5. [x] - `p2` - **FROM** `ERROR` **TO** `LOADING` **WHEN** language changes, providing an implicit retry - `inst-retry-on-lang-change`

---

## 5. Definitions of Done

### Root Provider and App Resolution

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-provider`

`HAI3Provider` accepts `children`, optional `config`, optional pre-built `app`, and optional `mfeBridge`. When `app` is not provided, it creates one via `createHAI3App(config)`. The instance is memoized; it is destroyed on unmount only if it was created internally. The full context tree (`HAI3Context` → `ReduxProvider` → optional `MfeProvider`) is assembled before children render.

**Implements**:
- `cpt-hai3-algo-react-bindings-resolve-app`
- `cpt-hai3-algo-react-bindings-build-provider-tree`
- `cpt-hai3-flow-react-bindings-bootstrap-provider`
- `cpt-hai3-flow-react-bindings-mfe-provider`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-principle-layer-isolation`
- `cpt-hai3-constraint-no-react-below-l3`
- `cpt-hai3-component-react`
- `cpt-hai3-seq-app-bootstrap`

---

### Typed Redux Hooks

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-redux-hooks`

`useAppSelector` is a `TypedUseSelectorHook<RootState>` wrapping `react-redux` `useSelector`. `useAppDispatch` wraps `react-redux` `useDispatch` and casts the return type to `AppDispatch`. Both hooks require `HAI3Provider` in the ancestor tree. Neither hook imports directly from `@gears-frontx/state`.

**Implements**:
- `cpt-hai3-flow-react-bindings-use-selector`
- `cpt-hai3-flow-react-bindings-use-dispatch`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-principle-layer-isolation`
- `cpt-hai3-constraint-no-react-below-l3`
- `cpt-hai3-component-react`

---

### Translation Hook

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-translation-hook`

`useTranslation` returns `{ t, language, setLanguage, isRTL }`. It subscribes to `i18nRegistry` version via `useSyncExternalStore` so components re-render on language changes. `setLanguage` dispatches `app.actions.setLanguage` which propagates to MFEs via the event bus. The hook never imports from `@gears-frontx/i18n` directly.

**Implements**:
- `cpt-hai3-flow-react-bindings-use-translation`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### Screen Translation Hook

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-screen-translation-hook`

`useScreenTranslations(screensetId, screenId, translations)` lazily loads screen-scoped translations under `screen.{screensetId}.{screenId}` namespace. It accepts either a `TranslationMap` or a `TranslationLoader`. It reloads automatically when the language changes. Returns `{ isLoaded, error }`. Stale (cancelled) in-flight loads do not mutate state after cancellation.

**Implements**:
- `cpt-hai3-flow-react-bindings-use-screen-translations`
- `cpt-hai3-algo-react-bindings-load-screen-translations`
- `cpt-hai3-state-react-bindings-screen-translation`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-fr-i18n-lazy-chunks`
- `cpt-hai3-nfr-perf-lazy-loading`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### Theme Hook

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-theme-hook`

`useTheme` returns `{ currentTheme, themes, setTheme }`. It subscribes to `themeRegistry` version via `useSyncExternalStore`. `setTheme(themeId)` dispatches `app.actions.changeTheme`. The themes list is derived from `themeRegistry.getAll()`.

**Implements**:
- `cpt-hai3-flow-react-bindings-use-theme`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### Formatters Hook

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-formatters-hook`

`useFormatters` returns a memoized `Formatters` object containing all locale-aware formatter functions from `@gears-frontx/framework`. It internally calls `useTranslation()` to subscribe to language changes. The returned object is re-created only when `language` changes, preventing unnecessary re-renders from unrelated state updates.

**Implements**:
- `cpt-hai3-flow-react-bindings-use-formatters`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### Extension Domain Slot Component

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-extension-slot`

`ExtensionDomainSlot` mounts and unmounts MFE extensions within a domain. It renders a loading placeholder during mount, exposes an error UI on failure, and renders a DOM container div when mounted. It dispatches `HAI3_ACTION_MOUNT_EXT` on mount and `HAI3_ACTION_UNMOUNT_EXT` on unmount. Unmounting during an in-flight mount dispatches unmount after the mount operation settles. Optional callbacks (`onMounted`, `onUnmounted`, `onError`) are invoked at lifecycle transitions.

**Implements**:
- `cpt-hai3-flow-react-bindings-extension-domain-slot`
- `cpt-hai3-state-react-bindings-extension-slot`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-sec-shadow-dom`
- `cpt-hai3-nfr-rel-error-handling`
- `cpt-hai3-nfr-perf-lazy-loading`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### MFE Hooks

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-mfe-hooks`

All five MFE-scoped hooks (`useMfeBridge`, `useMfeContext`, `useSharedProperty`, `useHostAction`) require a `MfeProvider` ancestor and throw a descriptive error when used outside one. `useSharedProperty<T>(propertyTypeId)` subscribes via `bridge.subscribeToProperty` and returns typed property values using `useSyncExternalStore`. `useHostAction(actionTypeId)` returns a stable callback that constructs and dispatches an `ActionsChain`; execution errors are logged but not thrown.

**Implements**:
- `cpt-hai3-flow-react-bindings-use-shared-property`
- `cpt-hai3-flow-react-bindings-use-host-action`
- `cpt-hai3-flow-react-bindings-mfe-provider`
- `cpt-hai3-algo-react-bindings-mfe-context-guard`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-fr-broadcast-write-api`
- `cpt-hai3-nfr-rel-error-handling`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### Domain and Package Observation Hooks

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-observation-hooks`

`useDomainExtensions(domainId)`, `useRegisteredPackages()`, and `useActivePackage()` subscribe to `app.store` changes via `useSyncExternalStore`. All three require `app.screensetsRegistry` (throw if absent). All three use ref-based snapshot caching to return referentially stable arrays, preventing re-renders when the underlying data has not changed. `useActivePackage` extracts the GTS package string from the currently mounted screen extension via `extractGtsPackage`.

**Implements**:
- `cpt-hai3-flow-react-bindings-use-domain-extensions`
- `cpt-hai3-flow-react-bindings-use-registered-packages`
- `cpt-hai3-flow-react-bindings-use-active-package`
- `cpt-hai3-algo-react-bindings-stable-snapshots`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### RefContainerProvider

- [x] `p1` - **ID**: `cpt-hai3-dod-react-bindings-ref-container-provider`

`RefContainerProvider` is a concrete `ContainerProvider` (from `@gears-frontx/framework`) that wraps a React `RefObject<HTMLDivElement>`. It implements `getContainer(extensionId)` by returning `ref.current`, throwing if the ref is not yet attached. `releaseContainer` is a no-op because React manages the ref lifecycle. This class bridges React DOM refs to the framework's container abstraction without introducing React into the framework layer.

**Implements**:
- (supports `cpt-hai3-flow-react-bindings-extension-domain-slot` via container injection)

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-react-layer`
- `cpt-hai3-nfr-sec-shadow-dom`

**Covers (DESIGN)**:
- `cpt-hai3-component-react`
- `cpt-hai3-constraint-no-react-below-l3`

---

### EventPayloadMap Module Augmentation Re-export

- [x] `p2` - **ID**: `cpt-hai3-dod-react-bindings-event-payload-map`

`@gears-frontx/react` re-declares `EventPayloadMap` as an interface extending `FrameworkEventPayloadMap` from `@gears-frontx/framework`. This creates a TypeScript declaration site at L3 that application code can augment using `declare module '@gears-frontx/react'`, avoiding direct imports from L1 (`@gears-frontx/state`). The `eventBus` instance is re-exported with the augmented type so that event bus calls in application code are type-safe against both framework and application events.

**Implements**:
- (architectural pattern, no specific flow)

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-layer-deps`
- `cpt-hai3-nfr-compat-react`

**Covers (DESIGN)**:
- `cpt-hai3-principle-layer-isolation`
- `cpt-hai3-constraint-no-react-below-l3`

---

## 6. Acceptance Criteria

- [x]`HAI3Provider` renders without errors when given only `children`, with `config`, with a pre-built `app`, and with `mfeBridge`
- [x]`useAppSelector` returns typed state; re-renders component when selected value changes, does not re-render when unrelated state changes
- [x]`useAppDispatch` returns a function that dispatches Redux actions to the store
- [x]`useTranslation` returns current language, a working `t()` function, correct `isRTL`, and a `setLanguage` that triggers language propagation to MFEs
- [x]`useScreenTranslations` transitions through `UNLOADED → LOADING → LOADED` states; reloads when language changes; does not update state after unmount
- [x]`useTheme` returns current theme and available themes; `setTheme` triggers framework theme change action
- [x]`useFormatters` returns locale-aware formatters that recalculate on language change
- [x]`ExtensionDomainSlot` shows loading state during mount, transitions to mounted container on success, shows error UI on failure, and dispatches unmount on React component unmount
- [x]`useSharedProperty` re-renders MFE component when host updates the subscribed property
- [x]`useHostAction` sends an `ActionsChain` to the host bridge; errors are logged to console, not thrown
- [x]`useDomainExtensions`, `useRegisteredPackages`, `useActivePackage` all throw descriptive errors when `microfrontends()` plugin is absent
- [x]All three observation hooks return referentially stable arrays when the underlying data has not changed
- [x]MFE-scoped hooks throw descriptive errors when called outside `MfeProvider`
- [x]`useHAI3` throws descriptive error when called outside `HAI3Provider`
- [x]`@gears-frontx/react` imports ZERO `@gears-frontx/state`, `@gears-frontx/screensets`, `@gears-frontx/api`, or `@gears-frontx/i18n` packages directly (enforced by dependency-cruiser)
- [x]All components accept `ref` as a prop (React 19 pattern; no `forwardRef`)
- [x]TypeScript strict mode passes with zero `@ts-ignore` suppressions in source files
