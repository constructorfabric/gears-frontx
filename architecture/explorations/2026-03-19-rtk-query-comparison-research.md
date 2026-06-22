# Exploration: RTK Query as a Considered Option for Data Management at L3

Date: 2026-03-19

## Research question

How does RTK Query (`@reduxjs/toolkit/query`) compare with TanStack Query v5 across the decision drivers identified in [ADR-0017](../ADR/0017-tanstack-query-data-management.md)? Specifically: incremental bundle cost (given RTK is already a dependency), caching and deduplication, request cancellation via AbortSignal, optimistic updates, boilerplate/code generation, Redux store coupling in a micro-frontend architecture, and notable drawbacks.

## Scope

**In scope:** RTK Query features, bundle size, MFE isolation, cancellation support, optimistic update patterns, and direct feature-by-feature comparison with TanStack Query v5 as evaluated in ADR-0017.

**Out of scope:** SWR, Apollo Client, other data-fetching libraries. Implementation details of how either library would integrate with `BaseApiService` (covered in the [existing TanStack exploration](./2026-03-17-tanstack-query-integration-research.md)).

**Constraints:** Gears FrontX uses `@reduxjs/toolkit@2.11.2` as a devDependency in `@gears-frontx/state` and `@gears-frontx/react`. The store is a single global instance created via `createStore()` in `@gears-frontx/state` with dynamic slice registration. All MFEs share the host's `QueryClient` for cross-MFE cache deduplication (see `Gears FrontXProvider.tsx` and `MfeProvider.tsx`). Redux state uses a `screensetId/domain` namespace convention for MFE isolation.

## Findings

### 1. Bundle size: incremental cost when RTK is already present

RTK Query is included in the `@reduxjs/toolkit` package and exposed via two entry points:

- `@reduxjs/toolkit/query` -- UI-agnostic core (createApi, fetchBaseQuery, etc.)
- `@reduxjs/toolkit/query/react` -- adds auto-generated React hooks

The [official RTK Query overview](https://redux-toolkit.js.org/rtk-query/overview) states the incremental cost when already using Redux Toolkit: **~9 kB for RTK Query core + ~2 kB for the React hooks** (minified + gzipped). Adding endpoint definitions contributes only the code inside the definition itself, typically a few bytes per endpoint.

For comparison, TanStack Query v5 (`@tanstack/react-query`) adds ~13-14 kB minified + gzipped as a new dependency. Since Gears FrontX already ships `@reduxjs/toolkit`, RTK Query would add zero new packages -- only the additional entry point import (~11 kB incremental). TanStack Query adds a new package dependency (~13 kB) but has zero runtime dependencies of its own.

The difference is small in absolute terms (~2 kB). The meaningful distinction is dependency count: RTK Query adds zero new dependencies; TanStack Query adds one.

**Confidence:** Substantiated -- the ~9 kB + ~2 kB figure comes from official Redux Toolkit documentation. TanStack Query figures are from community measurements (see [prior exploration](./2026-03-17-tanstack-query-integration-research.md)).

### 2. Caching, deduplication, stale-while-revalidate, and background refetching

Both libraries provide automatic caching and request deduplication. The mechanisms differ:

**Caching strategy.** TanStack Query uses a hierarchical key-to-value cache where query keys are JSON-serialized arrays. RTK Query uses a unique key-to-value cache where cache entries are keyed by endpoint name + serialized arguments. Both support configurable stale time and garbage collection.

**Deduplication.** TanStack Query deduplicates by sharing a single in-flight promise across all observers of the same query key. RTK Query deduplicates by tracking subscription counts per cache entry -- if multiple components subscribe to the same endpoint+args, only one request fires.

**Stale-while-revalidate.** Both support this pattern. TanStack Query defaults to `staleTime: 0` (data is stale immediately). RTK Query defaults to `keepUnusedDataFor: 60` seconds (cache entries persist for 60 seconds after the last subscriber unsubscribes).

**Background refetching.** TanStack Query automatically refetches on window focus, network reconnect, and component mount (all configurable). RTK Query supports `refetchOnFocus` and `refetchOnReconnect` but both default to `false` and require calling `setupListeners(store.dispatch)` to enable. RTK Query also supports `refetchOnMountOrArgChange` (defaults to `false`).

**Data change detection.** TanStack Query uses [structural sharing](https://tanstack.com/query/latest/docs/framework/react/overview) (`replaceEqualDeep`) to preserve referential equality of unchanged nested objects, reducing unnecessary React re-renders. RTK Query uses identity comparison (`===`) -- if the response JSON differs at all, the entire cached value is replaced, potentially causing more re-renders.

**Tag-based invalidation.** RTK Query provides a [declarative tag invalidation system](https://redux-toolkit.js.org/rtk-query/usage/manual-cache-updates) where queries declare which "tags" they provide, and mutations declare which tags they invalidate. This triggers automatic refetching of affected queries. TanStack Query uses imperative `queryClient.invalidateQueries({ queryKey })` calls, typically in `onSettled` mutation callbacks.

**Confidence:** Corroborated -- feature matrix verified against the [official TanStack comparison table](https://tanstack.com/query/v5/docs/framework/react/comparison) and RTK Query documentation. Structural sharing behavior verified from TanStack Query source code in the prior exploration.

### 3. AbortSignal and request cancellation

**TanStack Query.** Creates an `AbortController` internally per query fetch. The signal is exposed on `QueryFunctionContext` via a lazy getter. If the `queryFn` reads `context.signal`, TanStack Query will call `abort()` on component unmount, query key change, or manual `cancelQueries()`. Cancellation is automatic and transparent.

**RTK Query.** The [`BaseQueryApi` object](https://redux-toolkit.js.org/rtk-query/api/createApi) includes a `signal` property (an `AbortSignal`) and an `abort()` method. These are available inside both `baseQuery` and `queryFn` implementations. Developers can pass `signal` to `fetch()` or axios calls for cancellation. However, [the TanStack comparison table](https://tanstack.com/query/v5/docs/framework/react/comparison) marks RTK Query as lacking "Query Cancellation" support, and [GitHub issue #3218](https://github.com/reduxjs/redux-toolkit/issues/3218) requested exposing `abort` from the `useQuery` hook, indicating that consumer-side cancellation (from the component) is not as straightforward as in TanStack Query. The signal exists at the `baseQuery` level, but auto-cancellation on unmount is not built in.

The distinction: TanStack Query auto-cancels in-flight requests when a component unmounts or a query key changes. RTK Query exposes the signal for manual use but does not auto-cancel on unmount.

**Confidence:** Substantiated -- RTK Query `signal` in `BaseQueryApi` is confirmed from official docs. The "no auto-cancel on unmount" claim is supported by the TanStack comparison table (maintained by the TanStack team, which may carry bias) and the GitHub issue requesting the feature. This should be verified with a prototype if it is a critical decision factor.

### 4. Optimistic updates

**TanStack Query.** Uses the `onMutate` / `onError` / `onSettled` callback pattern on `useMutation`:

1. `onMutate` -- cancel in-flight queries, snapshot current cache, write optimistic data via `queryClient.setQueryData()`
2. `onError` -- receives the snapshot from `onMutate` context, restores previous cache state
3. `onSettled` -- invalidates queries to ensure server consistency

**RTK Query.** Uses the [`onQueryStarted` lifecycle](https://redux-toolkit.js.org/rtk-query/usage/manual-cache-updates) on mutation endpoints:

1. `onQueryStarted` fires when mutation begins. Dispatch `api.util.updateQueryData()` to write optimistic data to the cache. This returns a `patchResult` with an `undo()` method.
2. `await queryFulfilled` -- waits for the server response.
3. On catch, call `patchResult.undo()` to roll back.

Both patterns achieve the same outcome. The difference is ergonomic:

- TanStack Query separates the lifecycle into three named callbacks (`onMutate`, `onError`, `onSettled`), making the flow explicit.
- RTK Query uses a single `onQueryStarted` callback with `try/catch` around `queryFulfilled`, which is more compact but puts all logic in one function. The `undo()` method on `patchResult` is convenient.
- RTK Query's `updateQueryData` dispatches a Redux action, which appears in Redux DevTools and can be traced. TanStack Query's `setQueryData` is an in-memory cache operation outside Redux.

**Confidence:** Corroborated -- both patterns verified from official documentation.

### 5. Code generation and boilerplate

**RTK Query.** Endpoint definitions are centralized in a `createApi` call with a builder pattern:

```typescript
const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: (builder) => ({
    getUser: builder.query({ query: (id) => `users/${id}` }),
    updateUser: builder.mutation({ query: ({ id, ...body }) => ({ url: `users/${id}`, method: 'PATCH', body }) }),
  }),
});
export const { useGetUserQuery, useUpdateUserMutation } = api;
```

RTK Query auto-generates hooks named `use[EndpointName]Query` and `use[EndpointName]Mutation`. It also supports [OpenAPI and GraphQL code generation](https://redux-toolkit.js.org/rtk-query/usage/code-splitting) to produce the entire API layer from a schema.

The `createApi` call also generates a `reducer` and `middleware` that must be added to the Redux store configuration. This is one-time setup but adds coupling between the API definition and the store.

**TanStack Query.** No centralized API definition. Each query is defined at the point of use (or in a shared `queryOptions` factory):

```typescript
useQuery({ queryKey: ['user', id], queryFn: () => userService.getUser(id) });
```

No generated hooks -- you call `useQuery` or `useMutation` directly with options. The `queryOptions` helper provides type-safe reusable definitions but is not code generation.

**Trade-off.** RTK Query's `createApi` produces a single source of truth for all endpoints with auto-generated hooks. This is more structured but requires all endpoints to be defined upfront (or injected via `injectEndpoints`). TanStack Query is more flexible -- queries can be defined anywhere -- but lacks a centralized endpoint registry.

In Gears FrontX's context, the existing `BaseApiService` / `RestProtocol` layer already serves as the centralized API definition. Both libraries would wrap these service methods. RTK Query's `fetchBaseQuery` would need to be replaced with a custom `baseQuery` that delegates to the existing service layer, or each endpoint would use `queryFn` instead of `query`.

**Confidence:** Substantiated -- based on official documentation for both libraries.

### 6. Redux store coupling

RTK Query requires a Redux store. Each `createApi` call generates:

- A `reducer` that must be added to the store (at `state[api.reducerPath]`)
- A `middleware` that must be added to the store's middleware chain

This means RTK Query's cache lives inside the Redux store. All cache reads and writes are Redux actions visible in Redux DevTools. This is an advantage for debugging and for code that already interacts with Redux state.

In Gears FrontX, the store is created via `createStore()` in `@gears-frontx/state` (L1). Adding RTK Query's reducer and middleware would require modifying the store creation logic. Since `@gears-frontx/state` is an L1 package with zero `@gears-frontx` dependencies, adding RTK Query integration here would keep it at L1 (RTK is already a peer dependency). However, RTK Query's `createApi` with React hooks comes from `@reduxjs/toolkit/query/react`, which has a React dependency -- this would need to live at L3.

**Coupling concern.** RTK Query tightly couples data fetching to the Redux store. If Gears FrontX ever moved away from Redux for client state, RTK Query would also need to be replaced. TanStack Query is independent of the client state manager -- it can coexist with Redux, Zustand, or no state manager at all.

**Gears FrontX-specific observation.** The current store uses dynamic slice registration (`registerSlice`). RTK Query's reducer would need to be registered as a static reducer during store creation, or the store creation logic would need modification to accommodate the API slice's reducer and middleware. The current `createStore` function accepts `initialReducers` but does not expose middleware configuration.

**Confidence:** Substantiated -- based on RTK Query architecture and reading the Gears FrontX `@gears-frontx/state` store implementation.

### 7. MFE isolation

This is where the architectural fit diverges significantly.

**TanStack Query.** All MFEs share the host's `QueryClient` from `Gears FrontXProvider`. Cache is keyed by query key, decoupled from which service instance fetches the data. When two MFEs use the same query key, only one HTTP request fires. Each MFE still uses its own `apiRegistry` and service instances in `queryFn` — the shared cache works because all MFEs share the same auth and base URL for overlapping endpoints. This is the current Gears FrontX architecture: shared cache with separated API services.

**RTK Query.** Cache lives in the Redux store. RTK Query's `createApi` requires defining all endpoints statically with a single `baseQuery` function. In Gears FrontX, each MFE has its own isolated `apiRegistry` and service instances (via Module Federation bundle isolation). To share a cache across MFEs with RTK Query, all endpoint definitions would need to live in a shared `createApi` — but the `baseQuery` can only delegate to one service layer. Since each MFE has its own service instances, a service-bridge abstraction would be needed to resolve the correct service instance per request context. This negates RTK Query's simplicity.

Alternative approaches have their own issues:

1. **Per-MFE `createApi` instances.** Each MFE defines its own `createApi` wrapping its own services. This works for separated API, but the cache is no longer shared — each `createApi` has its own reducer in its own store. The [official guidance is to use one `createApi` per base URL](https://redux-toolkit.js.org/rtk-query/api/createApi), and [multiple instances cause middleware duplication](https://redux-toolkit.js.org/rtk-query/api/createApi).

2. **Single `createApi` with `injectEndpoints`.** MFEs inject endpoints at runtime. Cache is shared, but the `baseQuery` problem remains — a single `baseQuery` cannot resolve per-MFE service instances without a bridge.

The [GitHub discussion on RTK Query with micro-frontends](https://github.com/reduxjs/redux-toolkit/discussions/2298) confirms there is no built-in MFE support. The RTK maintainer (Mark Erikson) stated there is "no specific support" for this pattern.

**Confidence:** Corroborated -- RTK Query's store coupling and MFE limitations are confirmed by official docs, the GitHub discussion, and the `createApi` documentation's explicit warning about multiple instances.

### 8. Feature gaps: what RTK Query lacks relative to TanStack Query v5

The [TanStack comparison table](https://tanstack.com/query/v5/docs/framework/react/comparison) (maintained by the TanStack team; potential bias toward TanStack Query) identifies these gaps in RTK Query:

| Feature | TanStack Query v5 | RTK Query |
|---------|-------------------|-----------|
| Infinite queries | Yes | No |
| Bi-directional infinite queries | Yes | No |
| Infinite query refetching | Yes | No |
| Query cancellation (auto on unmount) | Yes | No |
| Offline mutation support | Yes | No |
| React Suspense integration | Yes | No |
| Structural sharing (data memoization) | Yes | No (identity ===) |
| Render optimization (field tracking) | Yes | No |

RTK Query has one feature TanStack Query does not: **automatic refetch after mutation via tag-based invalidation**. TanStack Query requires imperative `invalidateQueries` calls in `onSettled`.

Additional gaps not in the comparison table:

- **Framework agnosticism.** TanStack Query supports React, Vue, Svelte, Solid, and vanilla JS via `@tanstack/query-core`. RTK Query's UI-agnostic entry point (`@reduxjs/toolkit/query`) exists but still requires a Redux store, limiting framework flexibility.
- **Background refetch defaults.** TanStack Query enables `refetchOnWindowFocus` by default. RTK Query requires explicit opt-in plus `setupListeners()`.

**Confidence:** Substantiated -- the comparison table is from the TanStack team's official docs, which may favor TanStack Query. The RTK Query gaps for infinite queries, Suspense, and offline mutations are consistent across multiple independent sources. The structural sharing difference is verified from source code analysis in the prior exploration.

## Comparison

Summary matrix against ADR-0017 decision drivers:

| Decision Driver | TanStack Query v5 | RTK Query |
|----------------|-------------------|-----------|
| Reduce per-endpoint boilerplate | Single `useQuery`/`useMutation` call | Single `createApi` + auto-generated hooks |
| Request deduplication | Automatic (shared promise) | Automatic (subscription count) |
| Caching + stale-while-revalidate | Yes, structural sharing | Yes, identity comparison |
| Optimistic updates with rollback | `onMutate`/`onError` pattern | `onQueryStarted` + `patchResult.undo()` |
| Preserve L1 plugin chain | Yes (wraps service methods as queryFn) | Yes (custom baseQuery or queryFn) |
| Layer hierarchy (no deps below L3) | Yes (React-only at L3, core is standalone) | Partial (store coupling touches L1) |
| Bundle size (incremental) | ~13 kB new dependency | ~11 kB (no new dependency) |
| MFE shared cache with separated API | Trivial (shared QueryClient, per-MFE queryFn, restricted QueryCache interface) | No built-in support; static baseQuery conflicts with per-MFE services |
| Infinite queries | Yes | No |
| Auto request cancellation on unmount | Yes | No |
| React Suspense | Yes | No |
| Redux DevTools visibility | No (separate cache) | Yes (cache is Redux state) |
| Tag-based auto-invalidation | No (imperative invalidation) | Yes |

## Key takeaways

- RTK Query's incremental bundle cost (~11 kB) is comparable to TanStack Query (~13 kB), with the advantage of adding zero new package dependencies since `@reduxjs/toolkit` is already present. (Substantiated)
- RTK Query and TanStack Query have near-parity on core data-fetching features: caching, deduplication, stale-while-revalidate, polling, prefetching, and optimistic updates. The approaches differ in API design but achieve equivalent outcomes. (Corroborated)
- RTK Query lacks infinite queries, automatic request cancellation on unmount, React Suspense integration, offline mutation support, and structural sharing -- all present in TanStack Query v5. (Substantiated -- based on TanStack's comparison table, cross-referenced with RTK Query docs)
- RTK Query's most significant gap for Gears FrontX is the conflict between its static `createApi`/`baseQuery` model and Gears FrontX's per-MFE separated API services. Gears FrontX needs shared cache with separated API — TanStack Query achieves this trivially because `queryFn` is per-call (each MFE wraps its own service), while the `QueryClient` cache is shared. RTK Query's `baseQuery` is defined once per `createApi`, making it impossible to route to per-MFE service instances without a custom bridge. (Corroborated)
- RTK Query's cache lives in the Redux store, providing Redux DevTools visibility and traceability. This is an advantage for debugging but creates tight coupling between data fetching and the state management layer. (Substantiated)

## Open questions

1. **Auto-cancellation verification.** The TanStack comparison table marks RTK Query as lacking "Query Cancellation." RTK Query does expose `AbortSignal` in `BaseQueryApi`. The exact behavior on component unmount (whether in-flight requests are auto-aborted) should be verified with a prototype, as the comparison table may be referring specifically to auto-cancellation rather than signal availability.
2. **Store modification scope.** If RTK Query were adopted, how much modification to `@gears-frontx/state`'s `createStore()` would be needed to accommodate the API reducer and middleware? The current API does not expose middleware configuration.
3. **Tag invalidation cross-MFE.** If a shared `createApi` with `injectEndpoints` were used, would tag invalidation from one MFE unintentionally refetch queries in another MFE? This would need testing.
4. **OpenAPI codegen value.** RTK Query supports generating endpoint definitions from OpenAPI schemas. If Gears FrontX's backend exposes OpenAPI specs, this could reduce boilerplate significantly. The value depends on whether such specs exist.
5. **TanStack comparison table bias.** The feature comparison table is maintained by the TanStack team. Independent verification of each "No" for RTK Query would strengthen confidence, particularly for query cancellation and offline mutations.

## Sources

1. [RTK Query Overview -- Redux Toolkit docs](https://redux-toolkit.js.org/rtk-query/overview) -- bundle size (~9 kB + ~2 kB), entry points, feature overview
2. [createApi -- Redux Toolkit docs](https://redux-toolkit.js.org/rtk-query/api/createApi) -- AbortSignal in BaseQueryApi, multiple instance warnings, store integration
3. [Manual Cache Updates -- Redux Toolkit docs](https://redux-toolkit.js.org/rtk-query/usage/manual-cache-updates) -- optimistic update pattern via `onQueryStarted` and `patchResult.undo()`
4. [TanStack Query Comparison Table](https://tanstack.com/query/v5/docs/framework/react/comparison) -- feature-by-feature matrix (maintained by TanStack team)
5. [RTK Query with micro frontends -- GitHub Discussion #2298](https://github.com/reduxjs/redux-toolkit/discussions/2298) -- maintainer confirmation of no built-in MFE support
6. [Expose "abort" from useQuery hook -- GitHub Issue #3218](https://github.com/reduxjs/redux-toolkit/issues/3218) -- request for component-level cancellation API
7. [TanStack Query vs RTK Query comparison gist](https://gist.github.com/mptorz/eacb002c6584e0b0ab3f55194d11ac29) -- community-maintained feature matrix
8. [Code Splitting -- Redux Toolkit docs](https://redux-toolkit.js.org/rtk-query/usage/code-splitting) -- `injectEndpoints` pattern for code splitting
9. [2026-03-17 TanStack Query Integration Research](./2026-03-17-tanstack-query-integration-research.md) -- prior Gears FrontX exploration covering TanStack Query v5 architecture and bundle size
10. [ADR-0017: Adopt TanStack Query for Declarative Data Management](../ADR/0017-tanstack-query-data-management.md) -- the decision record this exploration supports
