# Feature: State Management


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Developer Subscribes to Events and Augments Types](#developer-subscribes-to-events-and-augments-types)
  - [Developer Defines and Registers a Slice](#developer-defines-and-registers-a-slice)
  - [Developer Authors an Effect](#developer-authors-an-effect)
  - [Framework Plugin Initializes the Store](#framework-plugin-initializes-the-store)
  - [Screenset Action Triggers State Update (Flux Data Flow)](#screenset-action-triggers-state-update-flux-data-flow)
  - [Slice Unregistration (Testing / HMR Cleanup)](#slice-unregistration-testing--hmr-cleanup)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Register Slice](#register-slice)
  - [Unregister Slice](#unregister-slice)
  - [EventBus Emit](#eventbus-emit)
  - [EventBus Subscribe](#eventbus-subscribe)
  - [EventBus Subscribe Once](#eventbus-subscribe-once)
  - [Create Slice Wrapper](#create-slice-wrapper)
  - [Reset Store (Testing)](#reset-store-testing)
- [4. States (CDSL)](#4-states-cdsl)
  - [Store Lifecycle](#store-lifecycle)
  - [Effect Registration Lifecycle](#effect-registration-lifecycle)
  - [EventBus Handler Registration](#eventbus-handler-registration)
- [5. Definitions of Done](#5-definitions-of-done)
  - [EventBus Pub/Sub](#eventbus-pubsub)
  - [Store Factory and Singleton](#store-factory-and-singleton)
  - [Dynamic Slice Registration](#dynamic-slice-registration)
  - [Effect System](#effect-system)
  - [FrontX createSlice Wrapper](#frontx-createslice-wrapper)
  - [Module Augmentation for Type Safety](#module-augmentation-for-type-safety)
  - [Slice Unregistration and Store Reset](#slice-unregistration-and-store-reset)
  - [Flux Terminology Enforcement](#flux-terminology-enforcement)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-state-management`

- [x] `p2` - `cpt-frontx-feature-state-management`
## 1. Feature Context

### 1.1 Overview

Foundational state management and event infrastructure for the entire FrontX system. This feature delivers the typed EventBus, Redux Toolkit store with dynamic slice registration, the FrontX `createSlice` wrapper, and the effect system that enforce the Action → Event → Effect → Reducer data-flow pattern.

Problem: Without a shared event bus and store abstraction every package would implement its own state patterns, producing fragmented debugging, untraceable data flow, and ad-hoc state mutations.

Primary value: A single, predictable channel for all cross-domain communication and a dynamically extensible store that any plugin or screenset can contribute slices to at runtime.

Key assumptions: Consumers operate in a browser or Node.js ESM environment. Redux Toolkit is a peer dependency; no other `@gears-frontx/*` package is required.

### 1.2 Purpose

Provide the event bus, store factory, slice factory, and effect system that every higher FrontX layer depends on, without coupling to React, the framework, or any other SDK package.

Success criteria: Any `@gears-frontx/state` consumer can emit and receive typed events, register slices dynamically, and wire effects — all with compile-time type safety and zero `@gears-frontx/*` transitive dependencies.

### 1.3 Actors

- `cpt-frontx-actor-developer`
- `cpt-frontx-actor-framework-plugin`
- `cpt-frontx-actor-host-app`
- `cpt-frontx-actor-runtime`
- `cpt-frontx-actor-build-system`

### 1.4 References

- Architecture: [DESIGN.md](../../DESIGN.md)
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — section 2.1
- PRD FRs: `cpt-frontx-fr-sdk-state-interface`, `cpt-frontx-fr-sdk-flux-terminology`, `cpt-frontx-fr-sdk-action-pattern`, `cpt-frontx-fr-sdk-module-augmentation`
- PRD NFRs: `cpt-frontx-nfr-rel-serialization`, `cpt-frontx-nfr-perf-action-timeout`, `cpt-frontx-nfr-maint-event-driven`
- Design component: `cpt-frontx-component-state`
- Design sequence: `cpt-frontx-seq-screenset-data-flow`
- ADRs: `cpt-frontx-adr-event-driven-flux-dataflow`, `cpt-frontx-adr-four-layer-sdk-architecture`, `cpt-frontx-adr-esm-first-module-format`

---

## 2. Actor Flows (CDSL)

### Developer Subscribes to Events and Augments Types

- [x] `p1` - **ID**: `cpt-frontx-flow-state-management-type-augmentation`

**Actors**: `cpt-frontx-actor-developer`

**Pre-condition**: `@gears-frontx/state` is installed. The developer is authoring a screenset module.

1. [x] `p1` - Developer declares a `module '@gears-frontx/state'` block augmenting `EventPayloadMap` with screenset-specific event keys and payload shapes - `inst-augment-event-map`
2. [x] `p1` - Developer declares a `module '@gears-frontx/state'` block augmenting `RootState` with screenset-specific slice key-to-state mappings - `inst-augment-root-state`
3. [x] `p1` - TypeScript compiler merges the declarations into the base interfaces, making new event keys available to `eventBus.emit()` and `eventBus.on()` without explicit casting - `inst-ts-merge`
4. [x] `p1` - Developer calls `eventBus.on('screenset/domain/eventName', handler)` with full payload type inference - `inst-subscribe-typed`
5. [x] `p1` - RETURN subscription object containing `unsubscribe()` - `inst-return-subscription`

---

### Developer Defines and Registers a Slice

- [x] `p1` - **ID**: `cpt-frontx-flow-state-management-slice-registration`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

**Pre-condition**: The developer has augmented `RootState` with the slice key.

1. [x] `p1` - Developer calls `createSlice({ name, initialState, reducers })` - `inst-call-create-slice`
2. [x] `p1` - RETURN destructured result `{ slice, ...reducerFunctions }` where `slice` exposes only `name` and `reducer` - `inst-return-slice-result`
3. [x] `p1` - Developer calls `registerSlice(slice, initEffects)` - `inst-call-register-slice`
4. [x] `p1` - Runtime executes the slice registration process via `cpt-frontx-algo-state-management-register-slice` - `inst-run-register`
5. [x] `p1` - Runtime calls `initEffects(dispatch)` to wire event subscriptions for this slice - `inst-call-init-effects`
6. [x] `p1` - RETURN (void); slice state is now live in the Redux store - `inst-return-registered`

---

### Developer Authors an Effect

- [x] `p1` - **ID**: `cpt-frontx-flow-state-management-effect-authoring`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

**Pre-condition**: A slice is registered. Reducer functions are exported from the slice module.

1. [x] `p1` - Developer authors an `EffectInitializer` function that receives `dispatch: AppDispatch` - `inst-define-effect-initializer`
2. [x] `p1` - Inside the initializer, developer calls `eventBus.on(eventKey, handler)` for each event this slice reacts to - `inst-subscribe-in-effect`
3. [x] `p1` - Each handler receives the typed payload and calls `dispatch(reducerFunction(payload))` to update state - `inst-dispatch-reducer`
4. [x] `p1` - Developer returns a cleanup function from the initializer that calls `subscription.unsubscribe()` for each subscription - `inst-return-cleanup`
5. [x] `p1` - Runtime stores the cleanup function, keyed by slice name, in the effect cleanups map - `inst-store-cleanup`

---

### Framework Plugin Initializes the Store

- [x] `p1` - **ID**: `cpt-frontx-flow-state-management-store-init`

**Actors**: `cpt-frontx-actor-framework-plugin`, `cpt-frontx-actor-host-app`, `cpt-frontx-actor-runtime`

**Pre-condition**: No store instance exists yet.

1. [x] `p1` - Framework plugin calls `createStore(initialReducers)` with its static layout reducers - `inst-call-create-store`
2. [x] `p1` - Runtime creates a Redux Toolkit store via `configureStore` using the combined static reducers - `inst-configure-rtk-store`
3. [x] `p1` - Runtime wraps the RTK store in a typed `Gears FrontXStore<RootState>` facade exposing `getState`, `dispatch`, `subscribe`, `replaceReducer` - `inst-wrap-store`
4. [x] `p1` - RETURN `Gears FrontXStore` instance to the framework plugin - `inst-return-store`
5. [x] `p1` - Subsequent calls to `getStore()` by any module return the same instance without re-creation - `inst-get-store-singleton`

---

### Screenset Action Triggers State Update (Flux Data Flow)

- [x] `p1` - **ID**: `cpt-frontx-flow-state-management-flux-dataflow`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

**Pre-condition**: A slice is registered with effects wired. The consuming component has called the action function.

1. [x] `p1` - A FrontX Action function (authored by the developer) calls `eventBus.emit(eventKey, payload)` - `inst-action-emit`
2. [x] `p1` - EventBus delivers the payload synchronously to all registered handlers for that event key - `inst-bus-deliver`
3. [x] `p1` - The matching Effect handler receives the payload and performs any side-effect work (e.g., API call, validation) - `inst-effect-side-effect`
4. [x] `p1` - Effect handler calls `dispatch(reducerFunction(payload))` to produce a Redux action - `inst-effect-dispatch`
5. [x] `p1` - Redux Toolkit reducer processes the action and returns the next immutable state - `inst-reducer-update`
6. [x] `p1` - Redux store notifies all subscribers of the state change - `inst-store-notify`

---

### Slice Unregistration (Testing / HMR Cleanup)

- [x] `p2` - **ID**: `cpt-frontx-flow-state-management-slice-unregister`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

**Pre-condition**: A slice with the given name is registered.

1. [x] `p2` - Developer or test harness calls `unregisterSlice(sliceName)` - `inst-call-unregister`
2. [x] `p2` - Runtime runs effect cleanup for the slice via `cpt-frontx-algo-state-management-unregister-slice` - `inst-run-cleanup`
3. [x] `p2` - Runtime removes the slice reducer from `dynamicReducers` and rebuilds the root reducer - `inst-rebuild-reducer`
4. [x] `p2` - Redux store reflects the removed slice state key after `replaceReducer` - `inst-store-updated`

---

## 3. Processes / Business Logic (CDSL)

### Register Slice

- [x] `p1` - **ID**: `cpt-frontx-algo-state-management-register-slice`

**Inputs**: `slice: SliceObject<TState>`, `initEffects?: EffectInitializer`

1. [x] `p1` - IF no store instance exists, call `createStore()` to auto-create a default store - `inst-auto-create-store`
2. [x] `p1` - IF a previous effect cleanup exists for `slice.name`, call it and remove the entry from the cleanups map — this handles HMR re-execution where the module is re-evaluated but the slice is still registered - `inst-cleanup-previous-effects`
3. [x] `p1` - IF `dynamicReducers[slice.name]` already exists, re-initialize effects only (if provided), store the cleanup, and RETURN — avoids duplicate reducer registration during HMR - `inst-hmr-reregister`
4. [x] `p1` - IF `slice.name` contains `/`, split on `/` and validate exactly two non-empty parts exist; IF not, THROW with a descriptive error identifying the invalid format - `inst-validate-domain-format`
5. [x] `p1` - Add `slice.reducer` to `dynamicReducers` under key `slice.name` - `inst-add-dynamic-reducer`
6. [x] `p1` - Combine all static and dynamic reducers via `combineReducers` and call `store.replaceReducer` to hot-swap the root reducer - `inst-replace-root-reducer`
7. [x] `p1` - IF `initEffects` is provided, call `initEffects(dispatch)` to wire event subscriptions - `inst-call-init-effects`
8. [x] `p1` - IF `initEffects` returns a cleanup function, store it in the effect cleanups map under `slice.name` - `inst-store-effect-cleanup`
9. [x] `p1` - RETURN (void) - `inst-return`

---

### Unregister Slice

- [x] `p2` - **ID**: `cpt-frontx-algo-state-management-unregister-slice`

**Inputs**: `sliceName: string`

1. [x] `p2` - IF no store instance exists, RETURN early — nothing to unregister - `inst-guard-no-store`
2. [x] `p2` - IF `dynamicReducers[sliceName]` does not exist, log a warning and RETURN — slice was never registered - `inst-guard-not-registered`
3. [x] `p2` - IF a cleanup function exists for `sliceName` in the cleanups map, call it and remove the entry - `inst-run-effect-cleanup`
4. [x] `p2` - Remove `sliceName` from `dynamicReducers` - `inst-remove-reducer`
5. [x] `p2` - Rebuild root reducer combining remaining static and dynamic reducers; IF no reducers remain, use an identity reducer returning empty object - `inst-rebuild-root-reducer`
6. [x] `p2` - Call `store.replaceReducer` with the rebuilt root reducer - `inst-replace-reducer`
7. [x] `p2` - RETURN (void) - `inst-return`

---

### EventBus Emit

- [x] `p1` - **ID**: `cpt-frontx-algo-state-management-eventbus-emit`

**Inputs**: `eventType: K extends keyof EventPayloadMap`, `payload?: EventPayloadMap[K]`

1. [x] `p1` - Look up the handler set for `eventType` in the internal handlers map - `inst-lookup-handlers`
2. [x] `p1` - IF no handlers are registered for `eventType`, RETURN (no-op; event is dropped silently) - `inst-no-handlers`
3. [x] `p1` - FOR EACH handler in the set, call `handler(payload)` synchronously - `inst-invoke-handlers`
4. [x] `p1` - RETURN (void) - `inst-return`

---

### EventBus Subscribe

- [x] `p1` - **ID**: `cpt-frontx-algo-state-management-eventbus-subscribe`

**Inputs**: `eventType: K`, `handler: EventHandler<EventPayloadMap[K]>`

1. [x] `p1` - IF no handler set exists for `eventType`, create a new `Set` and insert it into the handlers map - `inst-init-handler-set`
2. [x] `p1` - Add `handler` to the handler set for `eventType` - `inst-add-handler`
3. [x] `p1` - RETURN a `Subscription` object whose `unsubscribe()` removes the handler from the set and deletes the set entry if it becomes empty - `inst-return-subscription`

---

### EventBus Subscribe Once

- [x] `p2` - **ID**: `cpt-frontx-algo-state-management-eventbus-subscribe-once`

**Inputs**: `eventType: K`, `handler: EventHandler<EventPayloadMap[K]>`

1. [x] `p2` - Create a wrapped handler that calls the original `handler` then immediately calls `subscription.unsubscribe()` - `inst-create-wrapped-handler`
2. [x] `p2` - Subscribe the wrapped handler via `eventBus.on(eventType, wrappedHandler)`, storing the returned subscription - `inst-subscribe-wrapped`
3. [x] `p2` - RETURN the subscription object - `inst-return-subscription`

---

### Create Slice Wrapper

- [x] `p1` - **ID**: `cpt-frontx-algo-state-management-create-slice`

**Inputs**: `options: CreateSliceOptions<TState, TReducers, TName>`

1. [x] `p1` - Pass `options` to Redux Toolkit's `createSlice` internally - `inst-rtk-create-slice`
2. [x] `p1` - Build a `SliceObject<TState>` containing only `name` and `reducer` from the RTK slice result — all other RTK properties (`.actions`, `.selectors`, `.caseReducers`) are intentionally excluded from the returned `slice` object to hide Redux internals - `inst-build-slice-object`
3. [x] `p1` - Spread RTK's `slice.actions` as top-level keys on the result object, making each reducer function directly accessible without the `.actions` indirection - `inst-spread-reducer-fns`
4. [x] `p1` - RETURN `{ slice, ...reducerFunctions }` - `inst-return-result`

---

### Reset Store (Testing)

- [x] `p2` - **ID**: `cpt-frontx-algo-state-management-reset-store`

1. [x] `p2` - FOR EACH entry in the effect cleanups map, call the cleanup function - `inst-cleanup-all-effects`
2. [x] `p2` - Clear the effect cleanups map - `inst-clear-cleanups`
3. [x] `p2` - Delete all keys from `dynamicReducers` - `inst-clear-dynamic-reducers`
4. [x] `p2` - Reset static reducers to an empty object - `inst-reset-static-reducers`
5. [x] `p2` - Set the store instance to `null` - `inst-null-store`
6. [x] `p2` - RETURN (void) - `inst-return`

---

## 4. States (CDSL)

### Store Lifecycle

- [x] `p1` - **ID**: `cpt-frontx-state-state-management-store-lifecycle`

1. [x] `p1` - **FROM** `UNINITIALIZED` **TO** `ACTIVE` **WHEN** `createStore(initialReducers)` is called - `inst-create`
2. [x] `p1` - **FROM** `UNINITIALIZED` **TO** `ACTIVE` **WHEN** `registerSlice()` is called before any explicit `createStore()` — auto-creation path - `inst-auto-create`
3. [x] `p1` - **FROM** `ACTIVE` **TO** `ACTIVE` **WHEN** `registerSlice(slice)` is called — root reducer is replaced, store remains active - `inst-register-slice`
4. [x] `p2` - **FROM** `ACTIVE` **TO** `ACTIVE` **WHEN** `unregisterSlice(sliceName)` is called — root reducer is replaced without the removed slice - `inst-unregister-slice`
5. [x] `p2` - **FROM** `ACTIVE` **TO** `UNINITIALIZED` **WHEN** `resetStore()` is called — all effects cleaned up, all reducers cleared, instance nulled - `inst-reset`

---

### Effect Registration Lifecycle

- [x] `p1` - **ID**: `cpt-frontx-state-state-management-effect-lifecycle`

1. [x] `p1` - **FROM** `UNREGISTERED` **TO** `ACTIVE` **WHEN** `registerSlice(slice, initEffects)` completes and `initEffects` returns a cleanup function - `inst-activate-effect`
2. [x] `p1` - **FROM** `ACTIVE` **TO** `ACTIVE` **WHEN** HMR triggers re-registration: previous cleanup is called, new effect initializer is run - `inst-hmr-reinit`
3. [x] `p2` - **FROM** `ACTIVE` **TO** `UNREGISTERED` **WHEN** `unregisterSlice(sliceName)` calls the stored cleanup function - `inst-deactivate-effect`
4. [x] `p2` - **FROM** `ACTIVE` **TO** `UNREGISTERED` **WHEN** `resetStore()` calls all cleanup functions - `inst-reset-effects`

---

### EventBus Handler Registration

- [x] `p1` - **ID**: `cpt-frontx-state-state-management-handler-registration`

1. [x] `p1` - **FROM** `NO_LISTENERS` **TO** `HAS_LISTENERS` **WHEN** `eventBus.on(eventType, handler)` is called for an event with no existing subscribers - `inst-first-subscribe`
2. [x] `p1` - **FROM** `HAS_LISTENERS` **TO** `HAS_LISTENERS` **WHEN** additional handlers subscribe to the same event type - `inst-additional-subscribe`
3. [x] `p1` - **FROM** `HAS_LISTENERS` **TO** `NO_LISTENERS` **WHEN** the last handler for an event type calls `subscription.unsubscribe()` — the handler set is deleted from the map - `inst-last-unsubscribe`

---

## 5. Definitions of Done

### EventBus Pub/Sub

- [x] `p1` - **ID**: `cpt-frontx-dod-state-management-eventbus`

The `eventBus` singleton provides type-safe event emission and subscription. Emitting an event delivers the payload synchronously to all registered handlers. Subscribing returns a `Subscription` with a working `unsubscribe()`. The `once()` method auto-unsubscribes after the first invocation. `clear(eventType)` and `clearAll()` remove handlers without calling them.

**Implements**:
- `cpt-frontx-algo-state-management-eventbus-emit`
- `cpt-frontx-algo-state-management-eventbus-subscribe`
- `cpt-frontx-algo-state-management-eventbus-subscribe-once`
- `cpt-frontx-state-state-management-handler-registration`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-state-interface`
- `cpt-frontx-fr-sdk-flux-terminology`
- `cpt-frontx-nfr-maint-event-driven`

**Covers (DESIGN)**:
- `cpt-frontx-principle-event-driven-architecture`
- `cpt-frontx-principle-action-event-effect-reducer-flux`
- `cpt-frontx-component-state`
- `cpt-frontx-constraint-zero-cross-deps-at-l1`
- `cpt-frontx-constraint-no-react-below-l3`

---

### Store Factory and Singleton

- [x] `p1` - **ID**: `cpt-frontx-dod-state-management-store-factory`

`createStore(initialReducers)` produces a `Gears FrontXStore<RootState>` wrapping a Redux Toolkit store configured with the provided static reducers. `getStore()` returns the same instance without re-creating it; if no instance exists it auto-creates an empty store. The `Gears FrontXStore` facade exposes `getState`, `dispatch`, `subscribe`, and `replaceReducer`. Redux internals (`EnhancedStore`, `configureStore`, `combineReducers`) are not re-exported.

**Implements**:
- `cpt-frontx-flow-state-management-store-init`
- `cpt-frontx-state-state-management-store-lifecycle`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-state-interface`
- `cpt-frontx-nfr-rel-serialization`

**Covers (DESIGN)**:
- `cpt-frontx-component-state`
- `cpt-frontx-constraint-zero-cross-deps-at-l1`
- `cpt-frontx-constraint-typescript-strict-mode`
- `cpt-frontx-constraint-esm-first-module-format`
- `cpt-frontx-seq-screenset-data-flow`

---

### Dynamic Slice Registration

- [x] `p1` - **ID**: `cpt-frontx-dod-state-management-slice-registration`

`registerSlice(slice, initEffects?)` adds a reducer under `slice.name` as the state key and hot-swaps the root reducer via `replaceReducer`. Domain-based slice names (containing `/`) must match the `screensetId/domain` two-part format — violations throw a descriptive error. HMR re-registration is handled by cleaning up previous effects and re-running `initEffects` without adding a duplicate reducer. `hasSlice(name)` and `getRegisteredSlices()` expose runtime introspection.

**Implements**:
- `cpt-frontx-flow-state-management-slice-registration`
- `cpt-frontx-algo-state-management-register-slice`
- `cpt-frontx-state-state-management-store-lifecycle`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-state-interface`
- `cpt-frontx-fr-sdk-flux-terminology`

**Covers (DESIGN)**:
- `cpt-frontx-component-state`
- `cpt-frontx-constraint-typescript-strict-mode`
- `cpt-frontx-constraint-zero-cross-deps-at-l1`
- `cpt-frontx-seq-screenset-data-flow`

---

### Effect System

- [x] `p1` - **ID**: `cpt-frontx-dod-state-management-effect-system`

`registerSlice` accepts an optional `EffectInitializer` function that receives `dispatch: AppDispatch`. The initializer subscribes to `eventBus` events and dispatches to reducers. If it returns a cleanup function, that function is stored and called before any re-registration or unregistration. This prevents duplicate subscriptions during HMR and ensures clean teardown during testing.

**Implements**:
- `cpt-frontx-flow-state-management-effect-authoring`
- `cpt-frontx-state-state-management-effect-lifecycle`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-state-interface`
- `cpt-frontx-fr-sdk-action-pattern`
- `cpt-frontx-nfr-perf-action-timeout`
- `cpt-frontx-nfr-maint-event-driven`

**Covers (DESIGN)**:
- `cpt-frontx-principle-action-event-effect-reducer-flux`
- `cpt-frontx-component-state`
- `cpt-frontx-seq-screenset-data-flow`

---

### FrontX createSlice Wrapper

- [x] `p1` - **ID**: `cpt-frontx-dod-state-management-create-slice`

`createSlice(options)` wraps Redux Toolkit's `createSlice` and returns `{ slice, ...reducerFunctions }`. The `slice` property carries only `name` and `reducer` — all Redux Toolkit internals (`.actions`, `.selectors`, `.caseReducers`) are excluded. Reducer functions are spread at the top level of the return value so effects can import them directly. This enforces FrontX terminology where "action" means an event-emitting function, not a Redux action creator.

**Implements**:
- `cpt-frontx-algo-state-management-create-slice`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-state-interface`
- `cpt-frontx-fr-sdk-flux-terminology`

**Covers (DESIGN)**:
- `cpt-frontx-principle-action-event-effect-reducer-flux`
- `cpt-frontx-component-state`
- `cpt-frontx-constraint-typescript-strict-mode`

---

### Module Augmentation for Type Safety

- [x] `p2` - **ID**: `cpt-frontx-dod-state-management-module-augmentation`

`EventPayloadMap` and `RootState` are declared as empty TypeScript interfaces (not types) so consumers can extend them via `declare module '@gears-frontx/state'`. Augmented event keys are enforced at the call sites of `eventBus.emit()` and `eventBus.on()` — the compiler rejects unknown keys and mismatched payloads. Augmented `RootState` keys are available to `getStore().getState()` selectors with correct type inference.

**Implements**:
- `cpt-frontx-flow-state-management-type-augmentation`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-module-augmentation`
- `cpt-frontx-fr-sdk-flux-terminology`

**Covers (DESIGN)**:
- `cpt-frontx-component-state`
- `cpt-frontx-constraint-typescript-strict-mode`
- `cpt-frontx-constraint-zero-cross-deps-at-l1`

---

### Slice Unregistration and Store Reset

- [x] `p2` - **ID**: `cpt-frontx-dod-state-management-unregister-reset`

`unregisterSlice(sliceName)` removes a dynamic slice from the store, runs its effect cleanup, and rebuilds the root reducer. If the slice was not registered, a console warning is emitted and the call is a no-op. `resetStore()` tears down all effects, clears all reducers, and nulls the store instance — intended only for test isolation.

**Implements**:
- `cpt-frontx-flow-state-management-slice-unregister`
- `cpt-frontx-algo-state-management-unregister-slice`
- `cpt-frontx-algo-state-management-reset-store`
- `cpt-frontx-state-state-management-store-lifecycle`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-state-interface`

**Covers (DESIGN)**:
- `cpt-frontx-component-state`
- `cpt-frontx-constraint-typescript-strict-mode`

---

### Flux Terminology Enforcement

- [x] `p2` - **ID**: `cpt-frontx-dod-state-management-flux-terminology`

The public API of `@gears-frontx/state` uses FrontX Flux terminology exclusively. Types are named `ReducerPayload` (not `PayloadAction`), `EffectInitializer` (not middleware or thunk), `EventHandler` (not listener or observer), `Subscription` (not unsubscribe token). The terms `action creator`, `dispatch`, or any Redux Toolkit internal type are not part of the exported public surface. `ReducerPayload<T>` is a transparent alias for RTK's `PayloadAction<T>`; the alias is the only publicly exported name.

**Implements**:
- `cpt-frontx-flow-state-management-flux-dataflow`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-flux-terminology`
- `cpt-frontx-fr-sdk-action-pattern`

**Covers (DESIGN)**:
- `cpt-frontx-principle-action-event-effect-reducer-flux`
- `cpt-frontx-constraint-typescript-strict-mode`
- `cpt-frontx-constraint-esm-first-module-format`
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-constraint-zero-cross-deps-at-l1`
- `cpt-frontx-component-state`

---

## 6. Acceptance Criteria

- [ ] `@gears-frontx/state` has no `@gears-frontx/*` entries in `dependencies` or `peerDependencies`; the only peer is `@reduxjs/toolkit`
- [ ] `eventBus.emit(unknownKey, ...)` produces a TypeScript compile error when the key is not declared in `EventPayloadMap`
- [ ] `eventBus.on(eventKey, handler)` infers the correct payload type from `EventPayloadMap` without explicit annotation
- [ ] `registerSlice({ name: 'a/b/c', reducer })` throws at runtime with a message identifying the invalid format
- [ ] `registerSlice(slice, initEffects)` called twice for the same slice name (HMR scenario) does not add a duplicate reducer; previous effects are cleaned up before new ones are wired
- [ ] `createSlice(options)` returns `{ slice, ...reducerFunctions }` where `slice` has only `name` and `reducer`; no `.actions` property is present on the returned object
- [ ] `resetStore()` followed by `getStore()` returns a fresh empty store with no previously registered slices
- [ ] `unregisterSlice(name)` on an unregistered slice emits a console warning and does not throw
- [ ] Redux internals (`combineReducers`, `configureStore`, `PayloadAction`, `EnhancedStore`) are not re-exported from `@gears-frontx/state`'s public index
- [ ] All source files in `packages/state/src/` compile under `tsc --noEmit` with `"strict": true`; no `any`, `@ts-ignore`, or `as unknown as` casts in production code
