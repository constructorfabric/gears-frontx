
# @gears-frontx/framework Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you modify core plugins or bypass plugin architecture.

## SCOPE
- Package: `packages/framework/`
- Layer: L2 Framework (depends on all L1 SDK packages)
- Peer dependencies: `@gears-frontx/state`, `@gears-frontx/screensets`, `@gears-frontx/api`, `@gears-frontx/i18n`, `@gears-frontx/auth`, `@tanstack/query-core`

## CRITICAL RULES
- Applications built by composing plugins via `createHAI3().use()`.
- Use presets for common configurations (full, minimal, headless).
- Access registries and actions through app instance.
- NO React code in this package (React bindings in @gears-frontx/react).
- Plugin dependencies auto-resolved (order doesn't matter).

## PLUGIN COMPOSITION
```typescript
// GOOD: Compose plugins
const app = createHAI3()
  .use(screensets())
  .use(themes())
  .use(layout())
  .use(microfrontends())
  .use(i18n())
  .build();

// GOOD: Use preset shorthand
const app = createHAI3App(); // Full preset

// BAD: Manual configuration without plugins
const store = configureStore({ ... }); // FORBIDDEN
```

## AVAILABLE PLUGINS

| Plugin | Provides | Dependencies |
|--------|----------|--------------|
| `screensets()` | `screenSlice` (active screen / loading), `setActiveScreen`, `setScreenLoading` | - |
| `themes()` | themeRegistry, changeTheme | - |
| `layout()` | header, footer, menu, sidebar, popup, overlay slices and layout actions | screensets |
| `microfrontends()` | `screensetsRegistry` (MFE-enabled), MFE actions, selectors, domain constants | screensets |
| `i18n()` | i18nRegistry, setLanguage | - |
| `effects()` | Core effect coordination | - |
| `auth()` | app.auth (AuthRuntime), transport binding into REST plugin chain | @gears-frontx/auth |
| `queryCache()` | Host-owned shared TanStack `QueryClient` (headless `@tanstack/query-core`), Flux `cache/*` bridge, mock teardown, L1 `sharedFetchCache` retain/release and invalidation sync | - |
| `queryCacheShared()` | Joins the host `QueryClient` from `queryCache()` for MFE or other child roots (no second client) | host `queryCache()` (child may `.build()` first; attaches when host runtime appears) |
| `mock()` | mockSlice, `toggleMockMode` | effects |

## AUTH PLUGIN

- `auth()` exposes `app.auth` runtime methods from the `AuthProvider`.
- Default transport binder: `hai3ApiTransport()` registers `AuthRestPlugin` via `apiRegistry.plugins.add(RestProtocol, plugin)`.
- Bearer sessions: inject `Authorization: Bearer <token>`.
- Cookie sessions: set `withCredentials: true` (+ optional CSRF header) for relative URLs and allowlisted origins.
- 401 retry: calls `provider.refresh()` once (`retryCount === 0`), deduplicates concurrent refreshes, retries with refreshed credentials.
- Custom transport: provide `transport` in `AuthPluginConfig` to override default REST binding.

Public helpers related to query cache: `subscribeQueryCacheRuntimeChanged` (observe when the shared runtime is attached or cleared).

## QUERY CACHE: HOST VS CHILD

- **Host app** (shell): include `queryCache()` once. It owns the shared `QueryClient`, wires `cache/invalidate`, `cache/set`, `cache/remove` to the client and transport dedup, and attaches the client to the built app for `@gears-frontx/react`.
- **Child root** (e.g. extension bundle with its own `createHAI3().build()`): use `queryCacheShared()` instead of a second `queryCache()`. It reuses the host client so observers and invalidation stay unified.
- **Load order:** The child app may be built before the host shell; the shared `QueryClient` is wired once the host initializes `queryCache()`. Use `subscribeQueryCacheRuntimeChanged` when you need to run logic on attach or clear.
- **Rule:** Do not stack two `queryCache()` instances for the same logical app; use `queryCache()` + `queryCacheShared()` for host/child splits.

## CUSTOM PLUGINS
```typescript
// GOOD: Follow plugin contract
export function myPlugin(): HAI3Plugin {
  return {
    name: 'my-plugin',
    dependencies: ['screensets'],
    provides: {
      registries: { myRegistry: createMyRegistry() },
      slices: [mySlice],
      effects: [initMyEffects],
      actions: { myAction: myActionHandler },  // Handwritten action function
    },
    onInit(app) { /* Initialize */ },
    onDestroy(app) { /* Cleanup */ },
  };
}
```

**NOTE:** Actions are handwritten functions in screensets that contain business logic and emit events via `eventBus.emit()`. The SDK does NOT export a `createAction` helper.

## STOP CONDITIONS
- Adding React components to this package.
- Modifying core plugin implementations.
- Bypassing plugin architecture for manual setup.
- Creating direct dependencies between plugins.

## PRE-DIFF CHECKLIST
- [ ] Using plugin composition (not manual setup).
- [ ] Custom plugins follow HAI3Plugin contract.
- [ ] Plugin dependencies declared (not implicit).
- [ ] No React code in framework package.
