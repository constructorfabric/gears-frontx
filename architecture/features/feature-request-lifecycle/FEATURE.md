# Feature: Request Lifecycle & Query Integration


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Flow 1 — REST Request with AbortSignal Cancellation](#flow-1--rest-request-with-abortsignal-cancellation)
  - [Flow 2 — Declarative Query via useApiQuery Hook](#flow-2--declarative-query-via-useapiquery-hook)
  - [Flow 3 — Declarative Mutation via useApiMutation Hook](#flow-3--declarative-mutation-via-useapimutation-hook)
  - [Flow 6 — Declarative SSE Stream via useApiStream Hook](#flow-6--declarative-sse-stream-via-useapistream-hook)
  - [Flow 5 — Cross-Feature Orchestration via Flux (Escape Hatch)](#flow-5--cross-feature-orchestration-via-flux-escape-hatch)
  - [Flow 4 — Shared QueryClient Lifecycle in HAI3Provider](#flow-4--shared-queryclient-lifecycle-in-hai3provider)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Algorithm 1 — AbortSignal Threading in RestProtocol](#algorithm-1--abortsignal-threading-in-restprotocol)
  - [Algorithm 2 — CanceledError Detection and Bypass](#algorithm-2--cancelederror-detection-and-bypass)
  - [Algorithm 3 — RequestOptions Pattern for HTTP Methods](#algorithm-3--requestoptions-pattern-for-http-methods)
  - [Algorithm 4 — QueryClient Default Configuration (queryCache Plugin)](#algorithm-4--queryclient-default-configuration-querycache-plugin)
  - [Algorithm 5 — Optimistic Update with Rollback](#algorithm-5--optimistic-update-with-rollback)
  - [Algorithm 6 — Query Invalidation After Mutation](#algorithm-6--query-invalidation-after-mutation)
- [4. States (CDSL)](#4-states-cdsl)
  - [State 1 — Query Lifecycle State](#state-1--query-lifecycle-state)
  - [State 2 — Mutation Lifecycle State](#state-2--mutation-lifecycle-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [DoD 1 — AbortSignal Support in RestProtocol](#dod-1--abortsignal-support-in-restprotocol)
  - [DoD 2 — Shared QueryClient Runtime (queryCache / queryCacheShared)](#dod-2--shared-queryclient-runtime-querycache--querycacheshared)
  - [DoD 3 — useApiQuery Hook](#dod-3--useapiquery-hook)
  - [DoD 4 — useApiMutation Hook](#dod-4--useapimutation-hook)
  - [DoD 5 — useApiStream Hook](#dod-5--useapistream-hook)
- [6. Acceptance Criteria](#6-acceptance-criteria)
- [Non-Applicable Domains](#non-applicable-domains)
- [Additional Context](#additional-context)
  - [TanStack Query Retry Disabled by Default](#tanstack-query-retry-disabled-by-default)
  - [Event-Driven Pattern Coexistence](#event-driven-pattern-coexistence)
  - [AbortSignal in Short-Circuit Path](#abortsignal-in-short-circuit-path)
  - [QueryCache Interface](#querycache-interface)
  - [Shared QueryClient Across MFEs](#shared-queryclient-across-mfes)
  - [Endpoint Descriptors and Automatic Cache Keys](#endpoint-descriptors-and-automatic-cache-keys)
  - [Event-Based Cache Invalidation for Flux Effects](#event-based-cache-invalidation-for-flux-effects)
  - [Test Coverage Scope (this ticket)](#test-coverage-scope-this-ticket)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-request-lifecycle`

- [x] `p2` - `cpt-frontx-feature-request-lifecycle`
---

## 1. Feature Context

### 1.1 Overview

Adds request cancellation via `AbortSignal` to the REST protocol at L1, and integrates `@tanstack/react-query` at L3 to provide declarative data fetching with automatic caching, deduplication, background refetch, and cancellation on top of existing `BaseApiService` instances.

Problem: `RestProtocol` has no mechanism to cancel in-flight requests. Screen-set authors must manually manage loading/error/data states in Redux slices and write action/event/effect boilerplate for every API call. No request deduplication exists when multiple components fetch the same data.

Primary value: Developers get automatic request cancellation on unmount, stale-while-revalidate caching, request deduplication, and a declarative hook API — while preserving the existing plugin chain, mock mode, and service registry patterns.

Key assumptions: `@tanstack/react-query` remains a peer dependency (not bundled). `@tanstack/query-core` has zero runtime dependencies. TanStack Query is the default mechanism for both reads and writes at the component level. The existing event-driven Flux pattern (action → event → effect → reducer) is reserved for cross-feature orchestration where a mutation in one screen-set must trigger effects in another.

### 1.2 Purpose

Enable developers to cancel in-flight REST requests via the standard `AbortSignal` browser API at L1, and adopt declarative query and mutation hooks at L3 that eliminate per-endpoint Redux boilerplate for both reads and writes while preserving the service registry, plugin chain, and mock mode architecture.

Success criteria: A developer can fetch data with `useApiQuery` and submit changes with `useApiMutation` — with automatic loading/error states, request cancellation on unmount, cached responses on re-mount, optimistic updates, and cache invalidation — without writing a slice, effect, event, or action.

### 1.3 Actors

- `cpt-frontx-actor-developer`
- `cpt-frontx-actor-screenset-author`
- `cpt-frontx-actor-runtime`
- `cpt-frontx-actor-host-app`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition: [DECOMPOSITION.md](../../DECOMPOSITION.md) — section 2.12 (this feature); depends on sections 2.4 (API Communication), 2.6 (Framework Composition), 2.7 (React Bindings)
- PRD: [PRD.md](../../PRD.md) — sections 5.1 (API Package), 5.19 (Mock Mode)
- Parent features: `cpt-frontx-feature-api-communication`, `cpt-frontx-feature-framework-composition`, `cpt-frontx-feature-react-bindings`
- ADRs: `cpt-frontx-adr-protocol-separated-api-architecture`, `cpt-frontx-adr-tanstack-query-data-management`

---

## 2. Actor Flows (CDSL)

### Flow 1 — REST Request with AbortSignal Cancellation

- [x] `p1` - **ID**: `cpt-frontx-flow-request-lifecycle-rest-abort`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p1` - Developer creates an `AbortController` instance — `inst-create-controller`
2. [x] - `p1` - Developer calls a REST method with `signal` option (e.g., `protocol.get(url, { signal })`) — `inst-call-with-signal`
3. [x] - `p1` - `RestProtocol` builds `RestRequestContext` including the `signal` property — `inst-build-context-signal`
4. [x] - `p1` - `RestProtocol` executes `onRequest` plugin chain; plugins receive context with `signal` — `inst-plugin-chain-signal`
5. [x] - `p1` - IF any plugin short-circuits, RETURN short-circuit response (signal is irrelevant) — `inst-short-circuit-bypass`
6. [x] - `p1` - `RestProtocol` passes `signal` to `AxiosRequestConfig` for the HTTP call — `inst-axios-signal`
7. [x] - `p1` - IF `controller.abort()` is called before response arrives, Axios throws `CanceledError` — `inst-abort-fires`
8. [x] - `p1` - `RestProtocol` catches the `CanceledError` and re-throws it without entering the `onError` plugin chain — `inst-cancel-skip-plugins`
9. [x] - `p1` - RETURN error to caller; caller handles cancellation (typically a no-op on unmount) — `inst-return-cancel-error`

---

### Flow 2 — Declarative Query via useApiQuery Hook

- [x] `p2` - **ID**: `cpt-frontx-flow-request-lifecycle-use-api-query`

**Actors**: `cpt-frontx-actor-screenset-author`, `cpt-frontx-actor-runtime`

1. [x] - `p2` - Screen-set author calls `useApiQuery(service.endpoint)` passing an `EndpointDescriptor` from the service class — `inst-call-use-api-query`
2. [x] - `p2` - `useApiQuery` extracts `key` and `fetch` from the descriptor, delegates to the underlying caching library (e.g., TanStack Query's `useQuery`) — `inst-delegate-use-query`
3. [x] - `p2` - The caching library invokes `descriptor.fetch({ signal })`, passing an internally created `AbortSignal` — `inst-tanstack-provides-signal`
4. [x] - `p2` - `fetch` calls the appropriate `BaseApiService` protocol method, forwarding the `signal` — `inst-service-call-with-signal`
5. [x] - `p2` - IF the descriptor's key is already cached and fresh in the shared `QueryClient`, return cached data immediately — `inst-cache-hit`
6. [x] - `p2` - IF another component or separately mounted MFE uses the same descriptor (same key) in-flight, deduplicate through the shared runtime observer or the L1 `sharedFetchCache` (share the single request promise) — `inst-dedup`
7. [x] - `p2` - On success, cache the response and RETURN `ApiQueryResult { data, isLoading: false, error: null }` — `inst-return-data`
8. [x] - `p2` - On error, RETURN `ApiQueryResult { data: undefined, isLoading: false, error }` — `inst-return-error`
9. [x] - `p2` - On component unmount, abort the in-flight request via the signal — `inst-unmount-abort`
10. [x] - `p2` - Screen-set author MAY call `useApiSuspenseQuery(service.endpoint)` inside a Suspense boundary; it uses the same `EndpointDescriptor` contract and request cancellation wiring as `useApiQuery` — `inst-call-use-api-suspense-query`
11. [x] - `p2` - `useApiSuspenseQuery` delegates to the underlying caching library's suspense query observer and RETURNs `ApiSuspenseQueryResult { data, isFetching, refetch }` once the boundary resolves — `inst-return-suspense-data`
12. [x] - `p2` - Screen-set author MAY call `useApiInfiniteQuery({ initialPage, getNextPage, getPreviousPage? })`, where every page is still represented by an `EndpointDescriptor` resolved by the service layer — `inst-call-use-api-infinite-query`
13. [x] - `p2` - `useApiInfiniteQuery` delegates to the underlying caching library's infinite-query observer using `initialPage.key` as the shared cache identity and `descriptor.fetch({ signal })` as the page fetcher — `inst-delegate-use-infinite-query`
14. [x] - `p2` - `getNextPage` / `getPreviousPage` resolve adjacent `EndpointDescriptor` objects from the current page payload, and the hook uses those descriptors as page params without exposing raw query keys to MFEs — `inst-resolve-adjacent-pages`
15. [x] - `p2` - On success, RETURN `ApiInfiniteQueryResult { data: pages, hasNextPage, hasPreviousPage, fetchNextPage, fetchPreviousPage }` while keeping all pages under the initial descriptor's cache entry — `inst-return-infinite-pages`
16. [x] - `p2` - Screen-set author MAY call `useApiSuspenseInfiniteQuery({ initialPage, getNextPage, getPreviousPage? })` inside a Suspense boundary for the same descriptor-driven pagination contract — `inst-call-use-api-suspense-infinite-query`
17. [x] - `p2` - `useApiSuspenseInfiniteQuery` delegates to the caching library's suspense infinite-query observer and RETURNs `ApiSuspenseInfiniteQueryResult { data: pages, hasNextPage, hasPreviousPage, fetchNextPage, fetchPreviousPage }` once the boundary resolves — `inst-return-suspense-infinite-pages`

---

### Flow 3 — Declarative Mutation via useApiMutation Hook

- [x] `p2` - **ID**: `cpt-frontx-flow-request-lifecycle-use-api-mutation`

**Actors**: `cpt-frontx-actor-screenset-author`, `cpt-frontx-actor-runtime`

1. [x] - `p2` - Screen-set author calls `useApiMutation({ endpoint: service.mutationDescriptor, onMutate?, onSuccess?, onError?, onSettled? })` — `inst-call-use-api-mutation`
2. [x] - `p2` - Hook returns `ApiMutationResult { mutate, mutateAsync, isPending, error, data, reset }` — `inst-return-mutation-state`
3. [x] - `p2` - Hook internally creates a `QueryCache` accessor (`get`, `getState`, `set`, `cancel`, `invalidate`, `invalidateMany`, `remove`) wrapping the internal cache client — MFEs never receive the cache client directly. `QueryCache` methods accept `EndpointDescriptor` or raw `QueryKey` — `inst-create-query-cache`
4. [x] - `p2` - Author calls `mutate(variables)` from an event handler or form submission — `inst-invoke-mutate`
5. [x] - `p2` - IF `onMutate` provided (optimistic update), execute it with `(variables, { queryCache })`: snapshot via `queryCache.get(service.queryDescriptor)`, apply optimistic data via `queryCache.set(service.queryDescriptor, ...)`, RETURN snapshot for rollback — `inst-optimistic-apply`
6. [x] - `p2` - The caching library invokes `descriptor.fetch(variables)` which calls the service protocol method (e.g., `RestProtocol.post()`, `RestProtocol.put()`) — `inst-mutation-service-call`
7. [x] - `p2` - On success, IF `onSuccess` provided, execute it with `(data, variables, context, { queryCache })` — typically calls `queryCache.invalidate(service.queryDescriptor)` to refetch affected queries — `inst-mutation-on-success`
8. [x] - `p2` - On error, IF `onError` provided, execute it with `(error, variables, context, { queryCache })` — IF optimistic update was applied, rollback by restoring snapshot via `queryCache.set(service.queryDescriptor, context.snapshot)` — `inst-mutation-on-error-rollback`
9. [x] - `p2` - On settled (success or error), IF `onSettled` provided, execute it with `(data, error, variables, context, { queryCache })` — typically used for final cleanup or conditional invalidation — `inst-mutation-on-settled`

---

### Flow 6 — Declarative SSE Stream via useApiStream Hook

- [x] `p2` - **ID**: `cpt-frontx-flow-request-lifecycle-use-api-stream`

**Actors**: `cpt-frontx-actor-screenset-author`, `cpt-frontx-actor-runtime`

1. [x] - `p2` - Screen-set author calls `useApiStream(service.streamDescriptor, options?)` passing a `StreamDescriptor<TEvent>` from the service class — `inst-call-use-api-stream`
2. [x] - `p2` - `useApiStream` sets status to `'connecting'` and calls `descriptor.connect(onEvent, onComplete)` — `inst-connect-on-mount`
3. [x] - `p2` - `connect` delegates to `SseProtocol.connect()` which runs the full SSE plugin chain (including mock short-circuit via `SseMockPlugin`) — `inst-sse-plugin-chain`
4. [x] - `p2` - On each SSE message event, the descriptor's `parse` function (default `JSON.parse(event.data)`) produces a typed `TEvent`, which is passed to the hook's internal `onEvent` handler — `inst-parse-event`
5. [x] - `p2` - In `'latest'` mode (default), the hook stores only the most recent event in `data`. In `'accumulate'` mode, the hook appends each event to the `events` array — `inst-mode-handling`
6. [x] - `p2` - Status transitions to `'connected'` after the first event or when the connect promise resolves — `inst-status-connected`
7. [x] - `p2` - IF the SSE stream emits a `'done'` event, `SseProtocol` calls `onComplete` and disconnects; the hook sets status to `'disconnected'` — `inst-stream-complete`
8. [x] - `p2` - On component unmount, the hook calls `descriptor.disconnect(connectionId)` to close the EventSource — `inst-disconnect-on-unmount`
9. [x] - `p2` - IF `options.enabled` is `false`, the hook defers connection (status remains `'idle'`); when toggled to `true`, the hook connects — `inst-enabled-toggle`

---

### Flow 5 — Cross-Feature Orchestration via Flux (Escape Hatch)

- [x] `p2` - **ID**: `cpt-frontx-flow-request-lifecycle-flux-escape-hatch`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

1. [x] - `p2` - Developer determines that a mutation must trigger effects across multiple screen-sets or update shared Redux state — `inst-identify-cross-feature`
2. [x] - `p2` - Developer uses the existing Flux pattern: action → eventBus.emit → effect → service call → dispatch — `inst-use-flux`
3. [x] - `p2` - Effect calls the service method directly (not through TanStack) — `inst-effect-service-call`
4. [x] - `p2` - After effect completes, IF query-cache entries must change, effect emits the appropriate EventBus cache contract so the `queryCache()` plugin updates the shared `QueryClient` and L1 `sharedFetchCache` in lockstep — typically `cache/invalidate` (e.g. `{ queryKey }`); when authoritative data is already known or an entry must be dropped without refetch semantics, effects MAY emit `cache/set` or `cache/remove` instead — effects do not access the TanStack `QueryClient` instance directly — `inst-invalidate-after-flux`
5. [x] - `p2` - RETURN: both Redux state and the TanStack `QueryClient` cache (plus shared-fetch windows for overlapping reads) stay aligned — `inst-state-sync`

---

### Flow 4 — Shared QueryClient Lifecycle in HAI3Provider

- [x] `p2` - **ID**: `cpt-frontx-flow-request-lifecycle-query-client-lifecycle`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-runtime`

1. [x] - `p2` - The `queryCache()` framework plugin creates or joins a shared `QueryClient` with configurable defaults during `onInit` and attaches it to the app instance for internal React consumption — `inst-create-query-client`
2. [x] - `p2` - `HAI3Provider` resolves that shared `QueryClient` from the app instance and mounts `QueryClientProvider` directly around children — `inst-render-query-provider`
3. [x] - `p2` - IF MFE mode, the host uses `queryCache()` and mounted MFE apps use `queryCacheShared()` so both roots join the same host-owned `QueryClient` before rendering — shared cache across all MFEs, each using its own `apiRegistry` as `queryFn` — `inst-mfe-query-client`
4. [x] - `p2` - The `queryCache()` plugin listens for `MockEvents.Toggle` and clears cache on mock mode changes — `inst-mock-cache-clear`
5. [x] - `p2` - The `queryCache()` plugin listens for `cache/invalidate`, `cache/set`, and `cache/remove` from L2 (Flux effects or other producers): each handler updates the shared `QueryClient` and invalidates matching entries in the L1 `sharedFetchCache` where applicable (so cross-root descriptor dedupe does not serve stale windows) — `inst-flux-cache-invalidate`
6. [x] - `p2` - On `app.destroy()`, the `queryCache()` plugin's `onDestroy` cancels and clears the runtime's queries, then **`releaseSharedFetchCache()`** after teardown to balance init-time retain — `inst-cleanup-query-client`

---

## 3. Processes / Business Logic (CDSL)

### Algorithm 1 — AbortSignal Threading in RestProtocol

- [x] `p1` - **ID**: `cpt-frontx-algo-request-lifecycle-signal-threading`

1. [x] - `p1` - Receive `signal` from caller via `RequestOptions` parameter — `inst-receive-signal`
2. [x] - `p1` - Attach `signal` to `RestRequestContext` as a readonly optional property — `inst-attach-to-context`
3. [x] - `p1` - Pass `RestRequestContext` through `executePluginOnRequest` chain (plugins can read `signal` but MUST NOT replace it) — `inst-plugin-passthrough`
4. [x] - `p1` - Copy `signal` from context to `AxiosRequestConfig.signal` before HTTP execution — `inst-copy-to-axios`
5. [x] - `p1` - IF `signal` is already aborted before Axios call, Axios throws synchronously — `inst-pre-aborted`
6. [x] - `p1` - RETURN: Axios handles abort natively; no additional wiring needed — `inst-axios-native`

---

### Algorithm 2 — CanceledError Detection and Bypass

- [x] `p1` - **ID**: `cpt-frontx-algo-request-lifecycle-cancel-detection`

1. [x] - `p1` - In `requestInternal` catch block, check if error is an Axios `CanceledError` (via `axios.isCancel(error)`) — `inst-check-is-cancel`
2. [x] - `p1` - IF `axios.isCancel(error)` is true, re-throw immediately without entering `executePluginOnError` — `inst-rethrow-cancel`
3. [x] - `p1` - IF `axios.isCancel(error)` is false, proceed to `executePluginOnError` as before — `inst-normal-error-path`
4. [x] - `p1` - RETURN: cancellation errors are never retried and never processed by plugins — `inst-no-retry-cancel`

---

### Algorithm 3 — RequestOptions Pattern for HTTP Methods

- [x] `p1` - **ID**: `cpt-frontx-algo-request-lifecycle-request-options`

1. [x] - `p1` - Define `RestRequestOptions` interface with optional `signal?: AbortSignal` and optional `params?: Record<string, string>` — `inst-define-options`
2. [x] - `p1` - Update `get`, `post`, `put`, `patch`, `delete` method signatures to accept `RestRequestOptions` as final parameter — `inst-update-signatures`
3. [x] - `p1` - Extract `signal` and `params` from options in each method, forward to `request()` — `inst-extract-options`
4. [x] - `p1` - `request()` passes `signal` and `params` to `requestInternal()` — `inst-forward-to-internal`
5. [x] - `p1` - RETURN: existing callers without options continue to work (options parameter is optional) — `inst-backward-compat`

---

### Algorithm 4 — QueryClient Default Configuration (queryCache Plugin)

- [x] `p2` - **ID**: `cpt-frontx-algo-request-lifecycle-query-client-defaults`

1. [x] - `p2` - The `queryCache()` plugin creates `QueryClient` with defaults merged from plugin config — `inst-create-in-plugin`
2. [x] - `p2` - Set `staleTime` to `config.staleTime ?? 30_000` (avoid immediate refetch on re-mount) — `inst-stale-time`
3. [x] - `p2` - Set `gcTime` to `config.gcTime ?? 300_000` (garbage-collect unused cache entries) — `inst-gc-time`
4. [x] - `p2` - Set `retry` to 0 (HAI3 has its own retry plugin system; avoid double retry) — `inst-no-retry`
5. [x] - `p2` - Set `refetchOnWindowFocus` to `config.refetchOnWindowFocus ?? true` (refresh stale data on tab switch) — `inst-refetch-focus`
6. [x] - `p2` - Attach the shared `QueryClient` to the app instance behind an internal symbol so React bindings can resolve it without exposing a public runtime abstraction — `inst-expose-client`
7. [x] - `p2` - `HAI3Provider` reads the attached `QueryClient` through its internal resolver — `inst-provider-reads-client`
8. [x] - `p2` - RETURN: React hooks and `QueryCache` operate on the shared `QueryClient`, while the raw client stays internal to framework/react internals — `inst-return-client`
9. [x] - `p2` - During plugin init, `retainSharedFetchCache()` enables shared-fetch teardown coordination; cache event handlers keep TanStack state and `sharedFetchCache` consistent — `inst-shared-fetch-retain`

---

### Algorithm 5 — Optimistic Update with Rollback

- [x] `p2` - **ID**: `cpt-frontx-algo-request-lifecycle-optimistic-update`

All cache operations use the `QueryCache` interface, either injected into mutation callbacks by `useApiMutation` or returned by `useQueryCache()`. MFEs never access the caching library client directly. `QueryCache` methods accept `EndpointDescriptor` or raw `QueryKey`.

1. [x] - `p2` - In `onMutate` callback, cancel any outgoing refetches for the affected endpoint via `queryCache.cancel(service.queryDescriptor)` to prevent race conditions — `inst-cancel-refetches`
2. [x] - `p2` - Snapshot the current cache value via `queryCache.get(service.queryDescriptor)` — `inst-snapshot`
3. [x] - `p2` - Apply the optimistic update via `queryCache.set(service.queryDescriptor, optimisticData)` — `inst-apply-optimistic`
4. [x] - `p2` - RETURN the snapshot as the `onMutate` return value (passed to `onError` as `context`) — `inst-return-snapshot`
5. [x] - `p2` - IF mutation fails, `onError` receives the snapshot via `context` and restores it via `queryCache.set(service.queryDescriptor, context.snapshot)` — `inst-rollback`
6. [x] - `p2` - In `onSettled`, call `queryCache.invalidate(service.queryDescriptor)` to refetch authoritative cached data regardless of success or failure — `inst-refetch-authoritative`

---

### Algorithm 6 — Query Invalidation After Mutation

- [x] `p2` - **ID**: `cpt-frontx-algo-request-lifecycle-query-invalidation`

1. [x] - `p2` - In `onSuccess` or `onSettled` callback, determine which endpoint descriptors are affected by the mutation — `inst-determine-keys`
2. [x] - `p2` - Call `queryCache.invalidate(service.descriptor)` for each affected endpoint, or `queryCache.invalidateMany(filters)` for namespace-wide invalidation, via the `QueryCache` interface — `inst-invalidate`
3. [x] - `p2` - TanStack Query marks matched cached entries as stale — `inst-mark-stale`
4. [x] - `p2` - IF any component is currently mounted and observing an invalidated key, TanStack Query triggers a background refetch automatically — `inst-auto-refetch`
5. [x] - `p2` - IF no component is observing the key, the stale data remains in cache until next access or GC — `inst-lazy-refetch`

---

## 4. States (CDSL)

### State 1 — Query Lifecycle State

- [x] `p2` - **ID**: `cpt-frontx-state-request-lifecycle-query`

**States**: IDLE, FETCHING, SUCCESS, ERROR, STALE

**Initial State**: IDLE

1. [x] - `p2` - **FROM** IDLE **TO** FETCHING **WHEN** `useApiQuery` mounts and no cached data exists — `inst-initial-fetch`
2. [x] - `p2` - **FROM** FETCHING **TO** SUCCESS **WHEN** `queryFn` resolves — `inst-fetch-success`
3. [x] - `p2` - **FROM** FETCHING **TO** ERROR **WHEN** `queryFn` rejects — `inst-fetch-error`
4. [x] - `p2` - **FROM** SUCCESS **TO** STALE **WHEN** `staleTime` elapses — `inst-become-stale`
5. [x] - `p2` - **FROM** STALE **TO** FETCHING **WHEN** component re-mounts or window refocuses — `inst-refetch`
6. [x] - `p2` - **FROM** ERROR **TO** FETCHING **WHEN** manual refetch triggered — `inst-retry-manual`
7. [x] - `p2` - **FROM** any **TO** IDLE **WHEN** component unmounts and `gcTime` elapses — `inst-gc`

### State 2 — Mutation Lifecycle State

- [x] `p2` - **ID**: `cpt-frontx-state-request-lifecycle-mutation`

**States**: IDLE, PENDING, SUCCESS, ERROR

**Initial State**: IDLE

1. [x] - `p2` - **FROM** IDLE **TO** PENDING **WHEN** `mutate(variables)` is called — `inst-mutation-start`
2. [x] - `p2` - **FROM** PENDING **TO** SUCCESS **WHEN** `mutationFn` resolves; `onSuccess` and `onSettled` callbacks fire — `inst-mutation-success`
3. [x] - `p2` - **FROM** PENDING **TO** ERROR **WHEN** `mutationFn` rejects; `onError` and `onSettled` callbacks fire, optimistic rollback executes if applicable — `inst-mutation-error`
4. [x] - `p2` - **FROM** SUCCESS **TO** IDLE **WHEN** `reset()` is called or component unmounts — `inst-mutation-reset-success`
5. [x] - `p2` - **FROM** ERROR **TO** IDLE **WHEN** `reset()` is called or component unmounts — `inst-mutation-reset-error`
6. [x] - `p2` - **FROM** ERROR **TO** PENDING **WHEN** `mutate(variables)` is called again (retry) — `inst-mutation-retry`

---

## 5. Definitions of Done

### DoD 1 — AbortSignal Support in RestProtocol

- [x] `p1` - **ID**: `cpt-frontx-dod-request-lifecycle-abort-signal`

The system **MUST** support request cancellation via `AbortSignal` in `RestProtocol` without modifying the plugin chain contract.

**Implementation details**:

- Type: `RestRequestOptions` interface in `packages/api/src/types.ts` with `signal?: AbortSignal` and `params?: Record<string, string>`
- Type: Add `signal?: AbortSignal` to `RestRequestContext` interface
- Class: `RestProtocol` in `packages/api/src/protocols/RestProtocol.ts` — update HTTP method signatures to accept `RestRequestOptions`
- Method: `requestInternal` — pass `signal` to `AxiosRequestConfig.signal`
- Method: `requestInternal` catch block — detect `axios.isCancel(error)` and re-throw without plugin chain

**Implements**:
- `cpt-frontx-flow-request-lifecycle-rest-abort`
- `cpt-frontx-algo-request-lifecycle-signal-threading`
- `cpt-frontx-algo-request-lifecycle-cancel-detection`
- `cpt-frontx-algo-request-lifecycle-request-options`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-api-package`
- `cpt-frontx-fr-api-request-cancellation`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-zero-cross-deps-at-l1`
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-api`

---

### DoD 2 — Shared QueryClient Runtime (queryCache / queryCacheShared)

- [x] `p2` - **ID**: `cpt-frontx-dod-request-lifecycle-query-provider`

The system **MUST** provide a `queryCache()` framework plugin at L2 that owns the shared `QueryClient`, and `HAI3Provider` at L3 that consumes that client internally. The client is shared across all MFEs even though each MFE renders in its own React root.

**Implementation details**:

- Plugin: `queryCache(config?)` in `packages/framework/src/plugins/queryCache.ts` — creates or joins the shared `QueryClient`, manages lifecycle, and attaches the client to the app instance for internal consumption
- Plugin: `queryCacheShared()` in `packages/framework/src/plugins/queryCache.ts` — joins the currently shared host runtime for MFE/local child apps without creating a second QueryClient
- Package: `@tanstack/query-core` added as peer dependency of `@gears-frontx/framework`
- Package: `@tanstack/react-query` added as peer dependency of `@gears-frontx/react`
- Config: Default `staleTime: 30_000`, `gcTime: 300_000`, `retry: 0`, `refetchOnWindowFocus: true` — overridable via `queryCache({ staleTime: 60_000 })`
- Plugin attaches the shared `QueryClient` to the app instance, registers event listeners for `MockEvents.Toggle`, `cache/invalidate`, `cache/set`, and `cache/remove`, and shared invalidation also clears the L1 `sharedFetchCache`
- Plugin is included in the `full()` preset
- Component: `HAI3Provider` in `packages/react/src/HAI3Provider.tsx` — resolves the attached `QueryClient` from the app instance and mounts `QueryClientProvider` directly around children
- Shared client join: `queryCache()` stores the host-owned `QueryClient` on a symbol-backed `globalThis` slot; `queryCacheShared()` joins that existing client for MFE/local child apps without creating a second client
- MFE lifecycle: MFE roots join the shared host client by building their local app with `queryCacheShared()` before rendering their own `HAI3Provider`

**Implements**:
- `cpt-frontx-flow-request-lifecycle-query-client-lifecycle`
- `cpt-frontx-algo-request-lifecycle-query-client-defaults`

**Covers (PRD)**:
- `cpt-frontx-fr-sdk-react-layer`
- `cpt-frontx-fr-react-query-client-sharing`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-react`

---

### DoD 3 — useApiQuery Hook

- [x] `p2` - **ID**: `cpt-frontx-dod-request-lifecycle-use-api-query`

The system **MUST** export a `useApiQuery` hook from `@gears-frontx/react` that accepts an `EndpointDescriptor` from a service class, delegates to the underlying caching library, and returns a HAI3-owned `ApiQueryResult<TData>`. The same declarative query surface **MUST** also export `useApiSuspenseQuery`, `useApiInfiniteQuery`, and `useApiSuspenseInfiniteQuery` for Suspense-driven single-page reads and descriptor-driven paginated reads.

**Implementation details**:

- Hook: `useApiQuery` in `packages/react/src/hooks/useApiQuery.ts`
- Hook: `useApiSuspenseQuery` in `packages/react/src/hooks/useApiSuspenseQuery.ts`
- Hook: `useApiInfiniteQuery` in `packages/react/src/hooks/useApiInfiniteQuery.ts`
- Hook: `useApiSuspenseInfiniteQuery` in `packages/react/src/hooks/useApiSuspenseInfiniteQuery.ts`
- `useApiQuery` signature: accepts `EndpointDescriptor<TData>` (from a declarative contract such as `RestEndpointProtocol.query()` / `queryWith()`) and optional per-call overrides `{ staleTime?, gcTime? }`
- `useApiSuspenseQuery` signature: accepts the same `EndpointDescriptor<TData>` plus optional per-call overrides, but requires a surrounding Suspense boundary for initial loading
- `useApiInfiniteQuery` signature: accepts `{ initialPage, getNextPage, getPreviousPage?, staleTime?, gcTime?, maxPages? }` where `initialPage` and every resolved adjacent page are `EndpointDescriptor<TPage>` instances
- `useApiSuspenseInfiniteQuery` signature: accepts the same descriptor-driven pagination options as `useApiInfiniteQuery`, but requires a surrounding Suspense boundary for initial-page loading
- `useApiQuery` internally extracts `descriptor.key` and `descriptor.fetch` and delegates to the caching library (e.g., TanStack Query's `useQuery`)
- `useApiSuspenseQuery` uses the same `descriptor.key` and `descriptor.fetch({ signal })` wiring as `useApiQuery`, but returns only the resolved Suspense-safe surface
- `useApiInfiniteQuery` uses `initialPage.key` as the shared cache identity, fetches each page through `descriptor.fetch({ signal })`, and resolves adjacent pages through descriptor-returning callbacks
- `useApiSuspenseInfiniteQuery` uses the same descriptor-driven pagination model as `useApiInfiniteQuery` while allowing the initial load/error path to flow through Suspense and error boundaries
- Returns `ApiQueryResult<TData>` — HAI3-owned type exposing only `data`, `error`, `isLoading`, `isFetching`, `isError`, `refetch`
- Returns `ApiSuspenseQueryResult<TData>` — HAI3-owned type exposing only `data`, `isFetching`, `refetch`
- Returns `ApiInfiniteQueryResult<TPage>` — HAI3-owned type exposing only `data`, `error`, `isLoading`, `isFetching`, `isError`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage`, `isFetchingPreviousPage`, `fetchNextPage`, `fetchPreviousPage`, `refetch`
- Returns `ApiSuspenseInfiniteQueryResult<TPage>` — HAI3-owned type exposing only `data`, `isFetching`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage`, `isFetchingPreviousPage`, `fetchNextPage`, `fetchPreviousPage`, `refetch`
- Does NOT re-export `queryOptions` or TanStack-specific types
- Cache configuration cascade: component call overrides > descriptor defaults > framework defaults
- `RestEndpointProtocol` consults the L1 `sharedFetchCache` when available so overlapping descriptor fetches across separate roots can reuse the same in-flight request/result window

**Implements**:
- `cpt-frontx-flow-request-lifecycle-use-api-query`

**Covers (PRD)**:
- `cpt-frontx-fr-react-query-hooks`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-react`

---

### DoD 4 — useApiMutation Hook

- [x] `p2` - **ID**: `cpt-frontx-dod-request-lifecycle-use-api-mutation`

The system **MUST** export a `useApiMutation` hook from `@gears-frontx/react` that accepts a `MutationDescriptor` from a service class, delegates to the underlying caching library, and supports optimistic updates, rollback, and cache invalidation via a restricted `QueryCache` interface.

**Implementation details**:

- Hook: `useApiMutation` in `packages/react/src/hooks/useApiMutation.ts`
- Type: `QueryCache` interface with `get<T>(descriptorOrKey)`, `getState<TData, TError>(descriptorOrKey)`, `set<T>(descriptorOrKey, dataOrUpdater)`, `cancel(descriptorOrKey)`, `invalidate(descriptorOrKey)`, `invalidateMany(filters)`, `remove(descriptorOrKey)` — accepts `EndpointDescriptor` (extracts `.key`) or raw `QueryKey`. Wraps the active shared `QueryClient` internally, never exposed to MFEs as a raw caching-library client. `set` accepts both a value and an updater function for atomic read-modify-write.
- Signature: accepts `{ endpoint: MutationDescriptor, onMutate?, onSuccess?, onError?, onSettled? }` — each callback receives `{ queryCache }` as an additional final parameter
- Returns `ApiMutationResult<TData>` — HAI3-owned type exposing `mutate`, `mutateAsync`, `isPending`, `error`, `data`, `reset`
- The caching library client is used internally only and is NOT re-exported from `@gears-frontx/react` — MFEs interact with the cache through `QueryCache` exposed by `useQueryCache()` and in mutation callbacks

**Implements**:
- `cpt-frontx-flow-request-lifecycle-use-api-mutation`
- `cpt-frontx-algo-request-lifecycle-optimistic-update`
- `cpt-frontx-algo-request-lifecycle-query-invalidation`

**Covers (PRD)**:
- `cpt-frontx-fr-react-query-hooks`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-react`

---

### DoD 5 — useApiStream Hook

- [x] `p2` - **ID**: `cpt-frontx-dod-request-lifecycle-use-api-stream`

The system **MUST** export a `useApiStream` hook from `@gears-frontx/react` that accepts a `StreamDescriptor<TEvent>` from a service class, manages the SSE connection lifecycle (connect on mount, disconnect on unmount), and returns a HAI3-owned `ApiStreamResult<TEvent>`.

**Implementation details**:

- Hook: `useApiStream` in `packages/react/src/hooks/useApiStream.ts`
- Signature: accepts `StreamDescriptor<TEvent>` (from a declarative contract such as `SseStreamProtocol.stream()`) and optional `ApiStreamOptions { mode?, enabled? }`
- `mode: 'latest'` (default) — `data` holds the most recent event; `mode: 'accumulate'` — `events` holds all received events in order
- `enabled: false` defers connection (status stays `'idle'`); when toggled to `true`, connects
- Returns `ApiStreamResult<TEvent>` — HAI3-owned type exposing `data`, `events`, `status`, `error`, `disconnect`
- `status` is a `StreamStatus`: `'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'`
- Cleans up (disconnects) on unmount and on descriptor key change
- Does NOT integrate with `QueryCache` (streaming data is not query-cached; see Known Gap in Additional Context)

**Implements**:
- `cpt-frontx-flow-request-lifecycle-use-api-stream`

**Covers (PRD)**:
- `cpt-frontx-fr-sse-stream-descriptors`
- `cpt-frontx-fr-react-query-hooks`

**Covers (DESIGN)**:
- `cpt-frontx-constraint-no-react-below-l3`
- `cpt-frontx-component-react`

---

## 6. Acceptance Criteria

- [x] `RestProtocol.get('/url', { signal })` cancels the in-flight request when `controller.abort()` is called; Axios throws `CanceledError`
- [x] Canceled requests do NOT enter the `onError` plugin chain and are NOT retried
- [x] Existing callers without `signal` option continue to work unchanged (backward compatible)
- [x] `queryCache()` framework plugin creates and owns a shared `QueryClient` with configurable defaults
- [x] `queryCache()` plugin is included in the `full()` preset
- [x] `queryCache()` plugin clears cache on `MockEvents.Toggle` (including `sharedFetchCache`), listens for `cache/invalidate`, `cache/set`, and `cache/remove`, mirrors them into the TanStack-backed runtime, and invalidates matching `sharedFetchCache` keys; on destroy it tears down queries and calls `releaseSharedFetchCache()`
- [x] `HAI3Provider` resolves the shared `QueryClient` from the app instance (not creating its own) and mounts `QueryClientProvider`
- [x] All MFEs share the host's `QueryClient` via `queryCache()` / `queryCacheShared()` shared-client reuse — overlapping descriptor keys are deduplicated across MFE boundaries, including cross-root in-flight fetch reuse through `sharedFetchCache`
- [x] For identical in-flight descriptor keys observed across host and child roots, exactly one underlying transport request executes; all observers resolve from the shared request/result window
- [x] `useApiQuery(service.endpoint)` accepts an `EndpointDescriptor` and returns `ApiQueryResult { data, isLoading, error }` with automatic cancellation on unmount
- [x] `useApiSuspenseQuery(service.endpoint)` supports the same descriptor-driven read model inside Suspense boundaries and returns `ApiSuspenseQueryResult`
- [x] `useApiInfiniteQuery({ initialPage, getNextPage, getPreviousPage? })` keeps paginated reads descriptor-driven, returns `ApiInfiniteQueryResult`, and never requires raw query keys in MFE code
- [x] `useApiSuspenseInfiniteQuery({ initialPage, getNextPage, getPreviousPage? })` supports the same descriptor-driven pagination model inside Suspense boundaries
- [x] Two components using the same endpoint descriptor result in a single HTTP request (deduplication)
- [x] A fresh cached descriptor read returns cached data on re-mount without an immediate duplicate request; once stale, mounted observers refetch in the background
- [x] Infinite-query page fetches are grouped under the initial descriptor key while adjacent-page resolution still flows through service-owned `EndpointDescriptor` objects
- [x] `useApiMutation({ endpoint: service.mutation, ... })` supports the full callback lifecycle: `onMutate` (optimistic), `onSuccess`, `onError` (rollback), `onSettled` — each callback receives `{ queryCache }` as an additional parameter
- [x] `QueryCache` interface exposes `get`, `getState`, `set` (with updater function support), `cancel`, `invalidate`, `invalidateMany`, `remove` — accepts `EndpointDescriptor` or raw `QueryKey` — wraps the caching library client internally
- [x] The caching library client is NOT re-exported from `@gears-frontx/react` — MFEs cannot access it directly
- [x] Optimistic updates apply immediately via `queryCache.set(service.endpoint, updater)` and rollback on error using the snapshot from `onMutate`
- [x] `queryCache.invalidate(service.endpoint)` triggers background refetch for mounted observers
- [x] Cache keys are derived automatically from `[baseURL, 'GET', path]` for static reads, `[baseURL, 'GET', resolvedPath, params]` for parameterized reads, and `[baseURL, method, path]` for writes via declarative contracts such as `RestEndpointProtocol.query()` / `queryWith()` / `mutation()` — no manual key factories
- [x] `SseStreamProtocol.stream<TEvent>(path)` returns a `StreamDescriptor<TEvent>` with key `[baseURL, 'SSE', path]` that routes through `SseProtocol` plugin chain
- [x] `useApiStream(service.streamDescriptor)` connects on mount, disconnects on unmount, and returns `ApiStreamResult { data, events, status, error, disconnect }`
- [x] `useApiStream` in `'latest'` mode updates `data` with each event; in `'accumulate'` mode appends to `events` array
- [x] `useApiStream` with `enabled: false` defers connection; toggling to `true` initiates connection
- [x] `SseMockPlugin` short-circuits `useApiStream` connections the same way it short-circuits direct `SseProtocol.connect()` calls
- [x] MFEs do not use standalone query key factories or `queryOptions()` outside descriptors — the service IS the data layer
- [x] Per-endpoint cache options (`staleTime`, `gcTime`) are set on the descriptor via the declarative REST contract (for example `this.protocol(RestEndpointProtocol).query('/path', { staleTime, gcTime })`)
- [x] Cache configuration follows three-tier cascade: component call overrides > descriptor defaults > framework defaults
- [x] `ApiQueryResult<TData>`, `ApiSuspenseQueryResult<TData>`, `ApiInfiniteQueryResult<TPage>`, `ApiSuspenseInfiniteQueryResult<TPage>`, and `ApiMutationResult<TData>` are HAI3-owned types — not TanStack-specific types
- [x] `queryOptions` is NOT re-exported from `@gears-frontx/react` — endpoint descriptors replace it
- [x] Cross-feature mutations use the Flux pattern with event-based cache updates at L2: Flux effects emit `cache/invalidate` (most common), or `cache/set` / `cache/remove` when imperative cache writes or evictions are required; the `queryCache()` framework plugin registers EventBus listeners during `onInit` (not in `HAI3Provider`) and keeps TanStack query state and L1 `sharedFetchCache` aligned for each payload
- [x] Mock mode continues to work: `RestMockPlugin` short-circuits regardless of `signal` presence
- [x] `MockEvents.Toggle` and `app.destroy()` teardown cancel in-flight work, clear runtime cache entries, clear matching `sharedFetchCache` windows, and release retained shared-cache coordination before the next root attaches
- [x] `@gears-frontx/api` remains at zero `@gears-frontx/*` dependencies (AbortSignal is a browser API)
- [x] `@tanstack/react-query` is a peer dependency of `@gears-frontx/react`, not bundled
- [x] This ticket's unit-test scope covers package-local behavior only: cancellation/plugin-bypass semantics, descriptor key derivation, `QueryCache` contract behavior, optimistic rollback, and SSE hook lifecycle
- [x] Deferred follow-up integration coverage MUST verify host/child shared-client join, cross-root request dedupe, Flux `cache/invalidate` / `cache/set` / `cache/remove` propagation, and mock-toggle / destroy teardown of shared cache state

---

## Non-Applicable Domains

- **Security**: No authentication, authorization, or sensitive data handling — this feature operates at the transport/caching layer using browser-standard APIs (`AbortSignal`, in-memory cache).
- **Data**: No database operations — cache is browser-side in-memory only.
- **UX**: No user-facing UI — developer-facing SDK hooks and framework plugin.
- **Compliance**: No regulatory data handling.
- **Operations**: No deployment, observability, or infrastructure changes.

---

## Additional Context

### TanStack Query Retry Disabled by Default

TanStack Query's built-in retry is set to 0 because HAI3 already provides retry via the `onError` plugin chain with `ApiPluginErrorContext.retry()`. Enabling both would cause double retries — the plugin retries the Axios call, and TanStack retries the entire `queryFn`. Consumers can re-enable TanStack retry per-query if they opt out of plugin-level retry.

### Event-Driven Pattern Coexistence

TanStack Query is the default mechanism for both **reads** (`useApiQuery`) and **writes** (`useApiMutation`) at the component level. This covers the vast majority of screen-set data operations: fetching lists, submitting forms, updating records, deleting items — all with automatic loading/error states, caching, and optimistic updates.

The existing event-driven Flux pattern (action → event → effect → reducer) is reserved as an **escape hatch for cross-feature orchestration** — cases where a mutation in one screen-set must trigger effects in another screen-set or update shared Redux state that multiple unrelated features observe. When using Flux for a mutation that affects data also tracked by TanStack queries, the effect drives cache updates via L2 EventBus contracts: **`cache/invalidate`** for stale marking / refetch, or **`cache/set`** / **`cache/remove`** when the new cache shape is known or an entry must be evicted; the `queryCache()` plugin applies those to the shared `QueryClient` and synchronously invalidates overlapping **`sharedFetchCache`** keys so separate React roots do not reuse stale in-flight windows. Effects do not touch the `QueryClient` directly.

**Decision rule**: If the mutation's effects are local to the component or screen-set, use `useApiMutation`. If the mutation must coordinate across feature boundaries via eventBus, use the Flux pattern.

### AbortSignal in Short-Circuit Path

When a mock plugin short-circuits a request, the `AbortSignal` is ignored because no HTTP call is made. This is correct behavior — there is nothing to abort. The short-circuit response is returned synchronously to the plugin chain.

### QueryCache Interface

MFEs and screen-set components interact with the cache through the `QueryCache` interface. It is injected into `useApiMutation` callbacks and returned by `useQueryCache()` for controlled imperative cache work. The underlying TanStack `QueryClient` is owned by the L2 `queryCache()` plugin; L3 only exposes `QueryCache` through hooks — no raw `QueryClient` to MFEs or re-exports.

All `QueryCache` methods accept either an `EndpointDescriptor` (extracting `.key`) or a raw `QueryKey` array for backward compatibility. The sanctioned surface is limited to `get`, `getState`, `set`, `cancel`, `invalidate`, `invalidateMany`, and `remove`.

Preferred optimistic-update flow with endpoint descriptors:

- `onMutate` cancels the affected descriptor, snapshots current data with `get`, applies the optimistic value through `set`, and returns the snapshot for rollback.
- `onError` restores the snapshot through `set` when the mutation fails.
- `onSettled` invalidates the descriptor so authoritative data is refetched through the normal observer lifecycle.

- `set` accepts both a value and an updater function for atomic read-modify-write. Returning `undefined` from the updater cancels the update.
- `getState` exposes query status metadata without exposing the full cache client API.
- `invalidateMany` supports namespace-wide invalidation in shared-cache scenarios.
- `remove` evicts a single cache entry (e.g., clearing a specific user's data).

**Rationale**: With a shared cache across MFEs, unrestricted access would allow any MFE to read, write, or invalidate any cache entry. The `QueryCache` interface constrains the API surface without limiting functionality — optimistic updates (`get`/`set` with updater), rollback (`set`), state inspection (`getState`), targeted invalidation (`invalidate`), namespace invalidation (`invalidateMany`), race condition prevention (`cancel`), and targeted cache eviction (`remove`) are all supported. Declarative reads still go through `useApiQuery()`, while imperative cache work uses `useQueryCache()`.

**Known gap**: SSE/WebSocket event handlers that push live data into the cache are not mutation callbacks and do not receive `{ queryCache }`. `useApiStream` provides reactive state (`data`, `events`) but does not write to `QueryCache` automatically. When SSE-to-cache integration is designed, a separate access path (event-based `cache/update` pattern, a dedicated `useCacheUpdater` hook, or combining `useApiStream` with `useQueryCache` in the component) will be needed.

### Shared QueryClient Across MFEs

All MFEs share the host's `QueryClient`, but not through React-context inheritance. Each MFE mounts in its own React root, so the host owns the shared `QueryClient` through `queryCache()` and MFE apps join that same client through `queryCacheShared()` before their provider tree renders. Cache is keyed by the endpoint descriptor's derived key and is decoupled from which service instance fetches the data. When two MFEs use service endpoints with the same derived key (for example the same `[baseURL, 'GET', path]` static read key or the same `[baseURL, 'GET', resolvedPath, params]` parameterized read key), only one HTTP request fires — the second MFE receives the cached result. Each MFE still uses its own `apiRegistry` and service instances. `MfeProvider` does not create its own `QueryClient`.

**Shared-cache contract**: MFEs whose services share the same `baseURL` and endpoint paths will produce identical cache keys. This is correct behavior for overlapping queries (e.g., both MFEs fetching current user from the same backend). If two MFEs use different service configurations (different baseURL) for the same logical entity, their cache keys will differ naturally, preventing cross-contamination.

### Endpoint Descriptors and Automatic Cache Keys

Cache keys are derived automatically from the service's `baseURL`, the HTTP method, and the endpoint path. No manual key factories are needed.

Representative descriptor patterns:

- A static read such as `getCurrentUser` produces a key shaped like `[baseURL, 'GET', '/user/current']`.
- A parameterized read such as `getUser({ id: '123' })` produces `[baseURL, 'GET', '/user/123', { id: '123' }]`.
- A descriptor may carry cache overrides such as longer `staleTime` or `gcTime` for slow-changing configuration reads.
- A mutation descriptor such as `updateProfile` uses `[baseURL, method, path]`.
- An SSE stream descriptor such as `activityStream` uses `[baseURL, 'SSE', path]`.

Representative consumer behavior:

- `useApiQuery(service.getCurrentUser)` performs a static descriptor read.
- `useApiQuery(service.getUser({ id: '123' }))` performs a parameterized descriptor read.
- Rare per-call cache overrides stay at the hook boundary and do not replace descriptor-owned key derivation.
- `useApiMutation` works with mutation descriptors plus `QueryCache` callbacks for optimistic updates and rollback.
- `useApiStream` consumes the stream descriptor in either latest-event or accumulate mode, with optional deferred connection through `enabled: false`.

`EndpointDescriptor` is defined at L1 (`@gears-frontx/api`) with zero caching library dependency. It is a plain object carrying `key`, `fetch`, and optional cache configuration. The React layer (L3) consumes descriptors and maps them to the underlying caching library.

For GraphQL or other protocols, the service would expose descriptors through its registered protocol adapter rather than through `BaseApiService` shortcuts, and the key would be derived from the operation shape and variables. Component code remains identical: `useApiQuery(service.endpoint)` for reads, `useApiStream(service.streamDescriptor)` for streams.

### Event-Based Cache Invalidation for Flux Effects

L2 Flux effects coordinate with the shared `QueryClient` (via the `queryCache()` / `queryCacheShared()` plugins) by emitting EventBus payloads the plugin subscribed to during `onInit`:

- **`cache/invalidate`** — forwarded to `QueryClient.invalidateQueries(...)` (with `queryKey` / `exact` / `refetchType` as scoped by the payload) and to the L1 **`sharedFetchCache`** invalidator for the same filters, so TanStack observers and cross-root fetch dedupe stay aligned.
- **`cache/set`** — applies a value or updater through `QueryClient.setQueryData(...)` (skipped for same-`source` local broadcasts) and invalidates that `queryKey` in **`sharedFetchCache`**.
- **`cache/remove`** — removes the entry via `QueryClient.removeQueries(...)` (same local-broadcast skip) and invalidates that key in **`sharedFetchCache`**.

This is handled entirely at L2 — no React listener needed. Previously, a synchronous listener inside `HAI3Provider` (L3) handled only invalidation. Centralizing **invalidate / set / remove** in the plugin eliminates bootstrap races and keeps descriptor-level dedupe coherent across MFE boundaries.

On **`MockEvents.Toggle`**, the plugin aborts in-flight queries, clears the runtime cache, and clears **`sharedFetchCache`**. On **`app.destroy()`**, it tears down the runtime and calls **`releaseSharedFetchCache()`** after cancel/clear completes, matching **`retainSharedFetchCache()`** at init.

### Test Coverage Scope (this ticket)

**Integration tests are out of scope of this feature.** This ticket ships **unit tests only**, repo-wide. Existing suites that crossed package boundaries (notably the shared-client bridging tests driving `BaseApiService` + `RestEndpointProtocol` through the plugin, and the `describeBootstrapMfeContract` invocations in `packages/framework/__tests__/testing.test.ts`) have been removed or reduced to unit coverage local to the package that owns the contract. Any future end-to-end or cross-package integration coverage belongs in a **separate ticket**.

This ticket's package-local unit coverage is expected to verify:

- cancellation reaches Axios through `AbortSignal` and bypasses the error plugin chain;
- descriptor key derivation stays stable for static, parameterized, mutation, and stream descriptors;
- `QueryCache` optimistic update / rollback / invalidate behavior remains deterministic;
- `useApiStream` covers connect, mode handling, enabled/disabled gating, and disconnect cleanup.

The deferred follow-up integration ticket is expected to verify:

- host `queryCache()` plus child `queryCacheShared()` share one runtime client before first render;
- identical descriptor keys deduplicate a single underlying request across separate React roots;
- Flux `cache/invalidate`, `cache/set`, and `cache/remove` events keep `QueryClient` and `sharedFetchCache` aligned;
- `MockEvents.Toggle` and `app.destroy()` cancel in-flight work, clear cache state, and release shared-fetch coordination without leaking stale windows.

The two MFE suites at `packages/framework/__tests__/plugins/microfrontends.test.ts` (Phase 7.9 — plugin propagation and schema loading) and `packages/framework/__tests__/plugins/microfrontends/plugin.test.ts` (Phase 13 — Flux wiring, slice, effects) are **deliberately split**: 7.9 exercises registry wiring; 13 exercises slice/effects/actions. Keep them separate so a Phase 7.9 regression does not have to read through Flux scaffolding to be understood. This note replaces the inline file-level prose that used to be the only signal for why the suites are split.
