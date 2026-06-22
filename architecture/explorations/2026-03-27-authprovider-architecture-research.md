# Exploration: AuthProvider Architecture For Gears FrontX

Date: 2026-03-27

## Research question

How should Gears FrontX implement an `AuthProvider` that is:

- plugin-first for Gears FrontX consumers
- minimal but sufficient for full authentication and future RBAC
- transport-agnostic
- compatible with `@gears-frontx/api` today
- compatible with the `feat/request-cancellation` branch where request cancellation and TanStack Query integration were added

## Scope

In scope:

- AuthProvider contract design
- Gears FrontX plugin integration shape
- transport integration strategy for `@gears-frontx/api` and custom developer-provided clients
- implications of the `feat/request-cancellation` branch
- developer experience for bearer token, cookie session, OAuth/OIDC, and custom auth flows

Out of scope:

- final implementation
- final ADR/FEATURE artifacts
- production auth backend selection
- hosted identity provider choice

## Findings

### 1. React-admin is a useful contract reference, not a direct template

Useful ideas from react-admin:

- required lifecycle methods: `login`, `checkAuth`, `logout`, auth failure handling
- optional methods: `getIdentity`, `getPermissions`, `canAccess`, `handleCallback`
- `canAccess` is the better long-term authorization API than `getPermissions`
- `supportAbortSignal` is a capability, not a different provider type

Not suitable to copy directly:

- router-coupled redirect semantics
- UI-coupled error payload semantics
- admin-resource-centric naming assumptions

### 2. Gears FrontX already has the right low-level extension points in `@gears-frontx/api`

Current `@gears-frontx/api` already supports:

- protocol-global plugins via `apiRegistry.plugins.add(...)`
- instance-local plugins per protocol instance
- service-level exclusion of global plugins
- retry-on-error patterns for token refresh
- cross-protocol auth behavior for REST and SSE

This means AuthProvider should not re-invent HTTP interception. It should own auth state and policy, then bind that policy into transport adapters.

### 3. `@gears-frontx/api` must remain token-agnostic

The architecture already states that `@gears-frontx/api` does not manage authentication tokens and relies on interceptors configured by the consumer. This boundary is correct and should be preserved.

Implication:

- session ownership belongs to AuthProvider
- request attachment belongs to a transport adapter
- domain services remain domain services, not auth state containers

### 4. The `feat/request-cancellation` branch adds a query layer, not a new transport

The branch was inspected directly. The key addition is:

- endpoint descriptors in `BaseApiService`
- `AbortSignal` threading through REST requests
- `queryCache()` plugin that owns a TanStack Query `QueryClient`
- React hooks (`useApiQuery`, `useApiMutation`) that consume descriptors

This is not TanStack Query "as HTTP client". The transport remains REST via axios and SSE via EventSource. TanStack Query is a query/cache layer on top.

Implication:

- AuthProvider core must not depend on TanStack Query
- optional query integration is valuable when available
- transport integration must still target `@gears-frontx/api` or a custom transport adapter

### 5. Current Gears FrontX framework extensibility is incomplete

`PluginProvides.registries` is generic, but `createGears FrontX().build()` materializes only hardcoded fields into the built `app`.

This means a new plugin-provided runtime surface such as `auth` is not naturally exposed on `app` today.

Current consequence:

- query integration became a special-case in the branch by explicitly adding `queryClient`
- auth would become another special-case if implemented the same way

Recommended direction:

- introduce a generic plugin-contributed app extension surface
- avoid hardcoding every new plugin runtime into framework core

### 6. Cookie-session support has a real limitation in current `frontx`

For REST, `withCredentials` is constructor-time protocol config, not a global plugin concern.

Implication:

- bearer token auth can be attached globally via plugins
- cookie-session for REST cannot be fully forced by AuthProvider alone today
- either services opt into `RestProtocol({ withCredentials: true })`
- or the API layer must grow a global protocol policy/factory mechanism

SSE is less problematic because `withCredentials` already defaults to `true`.

Confirmed v1 requirement:

- cookie-session must be turnkey for REST, so the "API layer must grow" option is required.
- the smallest viable change is request-level `withCredentials` support in the request context and axios config, so a global plugin can enable credentials without per-service construction.

## Recommended architecture

### Layer split

1. `AuthProvider` core
- headless
- framework-agnostic
- owns session lifecycle, identity, authz policy, callback handling

2. `TransportAdapter`
- binds the provider into request/connection transports
- Gears FrontX adapter for `@gears-frontx/api`
- custom adapter for developer-provided HTTP clients

3. `QueryAdapter` (optional)
- integrates with TanStack Query when `queryCache()` and descriptor-based APIs are used
- handles cache invalidation and cancellation-aware bootstrap/read patterns

4. `auth()` Gears FrontX plugin
- binds the provider into Gears FrontX runtime
- registers auth state slice and actions if needed
- exposes the auth runtime through a non-special-case extension surface

### Provider contract

Required:

- `getSession(ctx): Promise<AuthSession | null>`
- `checkAuth(ctx): Promise<AuthCheckResult>`
- `logout(ctx): Promise<AuthTransition>`

Optional:

- `login(input, ctx)`
- `handleCallback(input, ctx)`
- `refresh(ctx)`
- `getIdentity(ctx)`
- `getPermissions(ctx)`
- `canAccess(query, ctx)`
- `onTransportError(error, ctx)`
- `subscribe(listener)`
- `destroy()`

Capabilities:

- `abortSignal`
- `oauthCallback`
- `refresh`
- `permissions`
- `accessControl`

### Why `canAccess` should be primary

RBAC is not implemented yet, so the contract should not hardcode a roles-first model.

`canAccess(query)` lets Gears FrontX evolve toward:

- role-based checks
- permission-based checks
- claim-based checks
- record-aware checks
- remote authorization checks

`getPermissions()` can remain optional for inspection, debugging, and coarse UI branching.

## Developer-facing configuration model

Developers should configure three separate concerns:

1. Session acquisition
- password login
- OAuth/OIDC redirect
- existing session cookie
- custom SSO

2. Session persistence
- memory
- localStorage (explicit opt-in only)
- cookie-backed server session
- custom secure storage

3. Transport binding
- bearer `Authorization` header
- cookie credentials
- SSE header/cookie
- custom request signing

## Recommendations before implementation

1. Add a generic `Gears FrontXApp` extension surface before shipping AuthProvider.
2. Treat TanStack Query integration as optional.
3. Keep AuthProvider core independent from React.
4. Keep `@gears-frontx/api` token-agnostic.
5. Explicitly document the current cookie-session limitation for REST.

## Open questions

1. Should Gears FrontX standardize an auth runtime shape on `app.auth`, or expose plugin extensions through a generic `app.extensions` bag?
2. Should the first release support remote authorization checks in `canAccess`, or only local claim/role evaluation?

## Confirmed decisions

1. A dedicated package name `@gears-frontx/auth` is acceptable.
2. The first release must support the full cookie-session developer experience:
- no per-service manual `RestProtocol({ withCredentials: true })` requirement
- credentials policy must be enabled by the auth integration itself or by framework/API infrastructure added for that purpose

## Sources

- https://marmelab.com/react-admin/Authentication.html
- https://marmelab.com/react-admin/AuthProviderWriting.html
- https://marmelab.com/react-admin/AuthProviderList.html
- https://github.com/tscbmstubp/Gears FrontX/tree/feat/request-cancellation
- https://github.com/tscbmstubp/Gears FrontX/blob/feat/request-cancellation/packages/api/src/protocols/RestProtocol.ts
- https://github.com/tscbmstubp/Gears FrontX/blob/feat/request-cancellation/packages/api/src/BaseApiService.ts
- https://github.com/tscbmstubp/Gears FrontX/blob/feat/request-cancellation/packages/framework/src/plugins/queryCache.ts
- https://github.com/tscbmstubp/Gears FrontX/blob/feat/request-cancellation/packages/react/src/hooks/useApiQuery.ts
