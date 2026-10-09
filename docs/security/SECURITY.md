# Security in FrontX

> **Source of truth:** `develop` branch of [constructorfabric/gears-frontx](https://github.com/constructorfabric/gears-frontx/tree/develop)

FrontX takes a **defense-in-depth** approach to security, combining TypeScript's strict compile-time type system with layered static analysis, ecosystem boundary enforcement, dependency auditing and pinning, an audited trust kernel for microfrontend loading, and structured development processes. This document summarizes the security measures in place across the FrontX ecosystem repository.

---

## Table of Contents

- [1. TypeScript Strict Mode & Compile-Time Safety](#1-typescript-strict-mode--compile-time-safety)
- [2. Three-Layer Ecosystem & Boundary Enforcement](#2-three-layer-ecosystem--boundary-enforcement)
- [3. MFE Isolation Architecture (Blob URL Sandboxing)](#3-mfe-isolation-architecture-blob-url-sandboxing)
- [4. API Communication & Plugin Chain](#4-api-communication--plugin-chain)
- [5. Authentication Pattern](#5-authentication-pattern)
- [6. Data Handling, Cache & Telemetry Privacy](#6-data-handling-cache--telemetry-privacy)
- [7. XSS & Injection Prevention](#7-xss--injection-prevention)
- [8. Compile-Time Linting — ESLint](#8-compile-time-linting--eslint)
- [9. Architecture Boundary Enforcement — dependency-cruiser](#9-architecture-boundary-enforcement--dependency-cruiser)
- [10. Dependency Security — npm audit & Pinning](#10-dependency-security--npm-audit--pinning)
  - [Automated Auditing](#automated-auditing)
  - [Exact Pinning Policy](#exact-pinning-policy)
  - [Centralized Version Pinning](#centralized-version-pinning)
  - [Lockfile Integrity](#lockfile-integrity)
  - [Registry Configuration](#registry-configuration)
- [11. Package Publishing & Release Security](#11-package-publishing--release-security)
  - [Branching Model (Gitflow)](#branching-model-gitflow)
  - [Automated Publishing Pipeline](#automated-publishing-pipeline)
  - [Versioning Policy](#versioning-policy)
- [12. Content Security Policy Guidance](#12-content-security-policy-guidance)
  - [Required CSP Directives](#required-csp-directives)
  - [CSP Considerations](#csp-considerations)
- [13. Security Scanners in CI](#13-security-scanners-in-ci)
  - [Pre-Commit Hooks (prek)](#pre-commit-hooks-prek)
- [14. PR Review Bots](#14-pr-review-bots)
- [15. Specification Templates & SDLC](#15-specification-templates--sdlc)
- [16. Project Scaffolding — FrontX CLI](#16-project-scaffolding--frontx-cli)
- [17. Opportunities for Improvement](#17-opportunities-for-improvement)

---

## 1. TypeScript Strict Mode & Compile-Time Safety

> Source: [`tsconfig.json`](../../tsconfig.json) · [`packages/*/tsconfig.json`](../../packages/) · [`eslint.config.js`](../../eslint.config.js)

TypeScript's strict mode eliminates entire categories of runtime errors at compile time. FrontX enables the **full strict suite** in every member package:

| Vulnerability Class | How TypeScript Strict Mode Prevents It |
|---|---|
| Null/undefined dereference | `strictNullChecks` forces explicit `null`/`undefined` handling |
| Implicit type coercion | `noImplicitAny` requires explicit type annotations |
| Incorrect function signatures | `strictFunctionTypes` enforces contravariant parameter checking |
| Uninitialized class properties | `strictPropertyInitialization` requires definite assignment |
| Unsafe `this` binding | `noImplicitThis` prevents untyped `this` in functions |
| Incorrect `call`/`bind`/`apply` | `strictBindCallApply` enforces argument type checking |
| Dead code via switch fallthrough | `noFallthroughCasesInSwitch` requires explicit `break`/`return` |
| Missing return paths | `noImplicitReturns` (root `tsconfig.json`) requires every code path to return |
| Unused variables/imports | `noUnusedLocals` + `noUnusedParameters` flag dead code (all 9 member packages) |

Additional TypeScript-specific project practices:

- **`"strict": true`** in every package `tsconfig.json` — all 9 member packages (`api`, `cli`, `cyber-pilot-kit-frontx`, `gts-plugin`, `mfes`, `routing`, `routing-tanstack`, `telemetry`, `ui-kit` via `tsconfig.src.json`) and the `internal/` build packages enforce the strict suite; the root `tsconfig.json` also sets each strict flag explicitly over `packages/*/src`
- **Full type-check in CI** — `npm run type-check:all` checks package sources (root config), each package's own config, the per-package test configs, and `scripts/` (`tsconfig.scripts.json`)
- **`noImplicitAny`** — loose `any` types are banned at the ESLint level (`@typescript-eslint/no-explicit-any: error`), not just the compiler level
- **`@typescript-eslint/ban-ts-comment`** — `@ts-ignore`, `@ts-nocheck`, and `@ts-expect-error` directives are forbidden, preventing developers from silencing the type checker. Production package sources currently contain no such directive and no `eslint-disable` comment
- **`no-unsafe-function-type`** / **`no-wrapper-object-types`** — the loose `Function`, `Object`, `String`, `Number` types are banned; concrete types required
- **Zero-warning policy** — `eslint . --max-warnings 0` treats all warnings as errors in CI

## 2. Three-Layer Ecosystem & Boundary Enforcement

> Source: [`architecture/DESIGN.md`](../../architecture/DESIGN.md) §1.3 · [`architecture/ADR/0002-core-package-boundaries.md`](../../architecture/ADR/0002-core-package-boundaries.md) · [`packages/cyber-pilot-kit-frontx/guidelines/ecosystem-boundaries.md`](../../packages/cyber-pilot-kit-frontx/guidelines/ecosystem-boundaries.md)

The FrontX ecosystem is partitioned into **three layers**, each defined by the role its members fill. Membership is a property, not a list, and every cross-package edge is checked mechanically:

```
Projects orchestration   @gears-frontx/cli, @gears-frontx/cyber-pilot-kit-frontx
 │  acts on a project's lifecycle (scaffold, assemble, upgrade, AI tooling)
 │
Templates                externally hosted (constructorfabric/gears-frontx-templates),
 │                       resolved by versioned source-spec; no template payload in this repo
 │
Published libraries      core + standalone: @gears-frontx/api, gts-plugin, mfes, routing, telemetry
                         standalone, not core: @gears-frontx/ui-kit
                         neither: @gears-frontx/routing-tanstack (one edge to routing)
    ↓ single permitted core edge: gts-plugin → mfes (type-substrate port)
```

**Security implications of layered isolation:**

| Rule | What It Prevents |
|---|---|
| Core libraries have zero `@gears-frontx/*` imports, except the type-substrate port (`gts-plugin` → `mfes`) | Circular dependencies, uncontrolled coupling, hidden trust paths between packages |
| Core libraries cannot import React | UI-framework lock-in, unintended DOM coupling in the substrate |
| Only `@gears-frontx/routing-tanstack` may import a concrete router engine (`@tanstack/*`) | Engine dependencies leaking into the agnostic substrate |
| No ecosystem package depends on, or imports, template content | Template code (which consumers own and modify) entering the published supply chain |
| `@gears-frontx/cli` bundles no template (CLI-1) | Templates are fetched by explicit source-spec, never shipped as hidden payload |
| `@gears-frontx/mfes` barrel exports no concrete `Default*` implementation | Consumers reaching past the abstract facade into runtime internals |

**Enforcement mechanisms:**

- **ESLint `@typescript-eslint/no-restricted-imports`** — boundary violations are lint errors with descriptive messages (e.g. `SDK VIOLATION: @gears-frontx/mfes is the SDK foundation and cannot import other @gears-frontx packages.`)
- **dependency-cruiser** — the root [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) and the core-layer config [`internal/depcruise-config/core.cjs`](../../internal/depcruise-config/core.cjs) enforce the import graph (see [section 9](#9-architecture-boundary-enforcement--dependency-cruiser))
- **Manifest edge check** — `npm run arch:edges` verifies the `package.json` half of the model: declared `@gears-frontx/*` edges are a subset of the allowed set, required edges exist, and every workspace is accounted for
- **Guard self-verification** — `npm run arch:guards` asserts the boundary rules still exist by name, so a deleted or renamed rule fails instead of passing silently
- **CI and pre-commit** — `arch:check`, `arch:deps:core`, `arch:edges`, `arch:guards` and `policy:mfes-import-boundary` run in CI on every push and PR; the four `arch:*` checks also run as pre-commit hooks

## 3. MFE Isolation Architecture (Blob URL Sandboxing)

> Source: [`packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`](../../packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts) · [`packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts`](../../packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts) · [`architecture/ADR/0011-mfe-load-isolation.md`](../../architecture/ADR/0011-mfe-load-isolation.md)

FrontX uses a **per-load blob URL isolation** architecture for microfrontend (MFE) sandboxing. Each load builds a fresh isolated module graph covering its entire dependency chain, keyed by the extension instance identity, so no module state is shared between MFEs. One kind of state is shared on purpose: MFEs whose default type providers open the same store share type registrations (see the last row below and [ADR-0037](../../architecture/ADR/0037-realm-shared-gts-store.md)):

```
Host App
├── MFE A (instance #1) → blob URL graph A → own module instances → Shadow DOM A
├── MFE B (instance #2) → blob URL graph B → own module instances → Shadow DOM B
└── MFE C (instance #3) → blob URL graph C → own module instances → Shadow DOM C
    └── No shared module instances between A, B, C
```

**Per-load isolation guarantees:**

| Protection | Mechanism |
|---|---|
| **Module instance isolation** | Each load gets its own blob URL graph keyed by `extensionId`; two extensions sharing a definition still evaluate as distinct instances |
| **No cycle exception** | A dependency cycle that cannot be brought inside the load's own graph fails the load with a diagnostic naming the chunks — availability is what a cycle costs, never isolation |
| **Audited trust kernel** | Dynamic `import()` and dynamic `RegExp` construction may appear only in `mf-dynamic-module-ops.ts`, enforced by an ESLint `no-restricted-syntax` rule across `packages/mfes/src/**` |
| **Annotated kernel exports** | `scripts/check-trust-kernel-annotations.mjs` (via `arch:check`) fails closed unless every function-valued kernel export carries own-line `@safety-reviewed` and `@why` JSDoc tags |
| **Runtime input guard** | The kernel's import primitive and its generated lazy-loader stub reject any URL whose scheme is not in `inlineContentSchemes()` (`blob:`, `data:`) |
| **Shared-dependency reuse gate** | Cross-MFE reuse of shared-dependency source text is keyed on declared identity and falls back safely rather than evaluating another MFE's chunk ([ADR-0034](../../architecture/ADR/0034-shared-dep-dedup-key.md)) |
| **Style isolation** | Stylesheets injected into the container with the `__frontx-mfe-runtime-style-` id prefix, and removed on unmount |
| **DOM tree isolation** | `DefaultMountManager` mounts each extension into a `ShadowRoot` whose `:host { all: initial }` rule blocks inherited host styles |
| **Shared type registrations (deliberate exception)** | Copies of `@gears-frontx/gts-plugin` with the same store format, GTS library version and built-in schemas share one type store through a realm slot, so one runtime can rely on what another registered. The first definition of a type stands, conflicts and cross-runtime instance replacements are logged, and `new GtsPlugin({ isolated: true })` keeps a private store ([ADR-0037](../../architecture/ADR/0037-realm-shared-gts-store.md), amended [ADR-0011](../../architecture/ADR/0011-mfe-load-isolation.md)) |

**Known limitations:**

- Blob URLs share the browser's global scope — MFEs can access `window`, `document`, `fetch`, and other globals. Blob URL isolation is **module-level**, not **process-level**.
- JavaScript execution in the browser cannot be fully sandboxed without iframes. Blob URL isolation prevents cross-MFE module instance sharing but does not protect against intentionally malicious MFE code that already runs in the realm. The same-realm shared-dependency rendezvous slot authenticates no publisher; this is an explicitly accepted risk ([ADR-0035](../../architecture/ADR/0035-shared-dep-cache-reach.md)).
- The realm-shared GTS type store slot authenticates no publisher either. Any compatible copy of `@gears-frontx/gts-plugin` can write to it through the provider's own public methods. An MFE can register a type identifier before its rightful owner, and that definition then governs admission of that type in every runtime on the store. It can also replace an instance another runtime registered, such as a manifest that runtime later resolves by identifier. Both are accepted under the same-realm trust model; the provider logs conflicts and replacements so accidental cases are visible ([ADR-0037](../../architecture/ADR/0037-realm-shared-gts-store.md)).
- Blob URLs are not revoked after creation because modules with top-level `await` need continued access to their blob URLs during asynchronous initialization; per-instance memory is reclaimed only on page unload.
- Some kernel invariants are review-only: no mutable module state, no dangerous host-capability imports, and no semantic indirection that constructs `RegExp` without spelling it. No static check reaches these ([ADR-0011](../../architecture/ADR/0011-mfe-load-isolation.md)).

## 4. API Communication & Plugin Chain

> Source: [`packages/api/src/protocols/RestProtocol.ts`](../../packages/api/src/protocols/RestProtocol.ts) · [`packages/api/src/types.ts`](../../packages/api/src/types.ts) · [`architecture/ADR/0015-api-transport-bypass-and-fetch-sharing.md`](../../architecture/ADR/0015-api-transport-bypass-and-fetch-sharing.md)

`@gears-frontx/api` provides a **plugin-chain architecture** for all API communication. Every request passes through a configurable plugin pipeline, enabling centralized security controls:

```
Application Code → RestProtocol.get('/users')
                   → Plugin Chain (onRequest)
                     → Auth plugin (app-provided): inject Bearer token
                     → Logging plugin (app-provided): log method + URL
                     → Mock plugin (app-provided, MOCK_PLUGIN-marked): short-circuit if mock mode
                   → axios HTTP request
                   → Plugin Chain (onResponse)
                   → Application Code
```

**Security-relevant features:**

| Feature | Protection |
|---|---|
| **Plugin chain ordering** | Plugins run in registration order; register auth before logging so logs see the final request |
| **Short-circuit responses** | A plugin returning `ShortCircuitResponse` ends the chain — the request never reaches the network |
| **Retry with loop prevention** | `ApiPluginErrorContext.retry()` tracks `retryCount`; `maxRetryDepth` (default: 10) prevents infinite loops |
| **Shared fetch cache** | `getOrFetch()` deduplicates concurrent identical GET requests — prevents thundering herd |
| **REST CORS opt-in** | `RestProtocol` defaults `withCredentials` to `false` — credentialed cross-origin requests require explicit opt-in |
| **Abort signal threading** | `AbortSignal` propagated through the request chain and the shared cache for cancellation |
| **Error routing** | Request failures are routed through the protocol's `onError` plugin hooks, which may return the error or a recovery response |

**Default REST configuration:**

```typescript
const DEFAULT_REST_CONFIG: RestProtocolConfig = {
  withCredentials: false,    // No CORS cookies by default
  contentType: 'application/json',
};
```

> **Note:** `SseProtocol` defaults to `withCredentials: true` when no value is configured (`this.config.withCredentials ?? true`). Set it explicitly for SSE services that talk to third-party origins.

## 5. Authentication Pattern

> Source: [`packages/api/src/types.ts`](../../packages/api/src/types.ts) · [`packages/api/CLAUDE.md`](../../packages/api/CLAUDE.md)

FrontX is a **UI framework**, not an identity provider. Authentication is delegated to backend services, with `@gears-frontx/api` providing the **plugin infrastructure** for token injection and refresh. The package does not ship a concrete auth plugin — host applications implement their own using the base classes below.

**Canonical auth plugin pattern** (from the package's JSDoc examples — not a built-in class):

```typescript
// Host application implements this using RestPluginWithConfig base class
class AuthPlugin extends RestPluginWithConfig<AuthConfig> {
  async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
    const token = this.config.getToken();
    if (!token) return ctx;
    return {
      ...ctx,
      headers: { ...ctx.headers, Authorization: `Bearer ${token}` }
    };
  }

  async onError(context: ApiPluginErrorContext): Promise<Error | RestResponseContext> {
    if (this.is401Error(context.error) && context.retryCount === 0) {
      const newToken = await this.config.refreshToken();
      return context.retry({
        headers: { ...context.request.headers, Authorization: `Bearer ${newToken}` }
      });
    }
    return context.error;
  }
}
```

**Security safeguards:**

| Safeguard | Description |
|---|---|
| **Retry count check** | `context.retryCount === 0` prevents infinite token refresh loops |
| **Max retry depth** | Per-protocol `maxRetryDepth` (default: 10) hard-caps retry attempts |
| **No token storage in the library** | `@gears-frontx/api` does not store tokens — application code decides storage strategy |
| **Plugin-based injection** | Auth headers are injected per-request via plugin, not hardcoded in service configs |
| **REST CORS cookie opt-in** | `withCredentials: false` by default for REST — prevents accidental credential leakage to third-party origins |

**Guidance for host applications:** token storage strategy (localStorage vs. httpOnly cookies vs. in-memory) is the responsibility of the host application. FrontX provides the injection mechanism; the host application provides the credential source.

## 6. Data Handling, Cache & Telemetry Privacy

> Source: [`packages/api/src/sharedFetchCache.ts`](../../packages/api/src/sharedFetchCache.ts) · [`packages/telemetry/README.md`](../../packages/telemetry/README.md) · [`packages/telemetry/architecture/DESIGN.md`](../../packages/telemetry/architecture/DESIGN.md)

The ecosystem holds one protocol-level cache in `@gears-frontx/api`. React-level query caching and UI state stores now belong to the applied template, not to this repository.

**Cache layers:**

| Layer | Scope | Purpose |
|---|---|---|
| **Shared fetch cache** | `@gears-frontx/api` | Realm-scoped, retainer-counted reuse of in-flight and completed GET requests across independently bundled units |
| **Query cache / UI state** | Applied template | Owned by the template (e.g. a TanStack Query or Redux layer); outside this repository's scope |

**Security-relevant behaviors:**

- **Request-identity cache keys** — the shared GET key is derived from the plugin-processed request: method, URL, headers, params, body, and the effective `withCredentials` flag. Requests carrying different `Authorization` headers or credential modes never share an entry
- **Descriptor key derivation** — endpoint descriptors derive their keys from `[baseURL, method, path]` (plus params), so no manual key factories can collide
- **Explicit invalidation** — `invalidate()`, `invalidateMany()` and `clear()` drop entries on demand; `resetSharedFetchCache()` and retainer release reclaim the cache on teardown
- **Configurable staleness** — `staleTime` defaults to 30 seconds and is configurable per request or endpoint descriptor
- **No at-rest storage** — cached data is held in JavaScript memory on `globalThis` (keyed by `Symbol.for('frontx:fetch-cache')`), not persisted to disk. Any same-realm code can reach it; applications that cache sensitive data should implement appropriate application-level protections
- **Realm-shared type store** — a non-isolated `@gears-frontx/gts-plugin` instance on the shared store keeps its type definitions and validated instances in memory reachable from `globalThis`, under a `Symbol.for('@gears-frontx/gts-plugin:gts-store:…')` key. A private pair from `new GtsPlugin({ isolated: true })`, and the local pair a copy falls back to when the realm slot holds an entry it does not recognize, are held by the provider instance and by the copy's own module respectively, and are not reachable from `globalThis`. On the shared store, validated instances include the latest action payload and the latest value of each shared property, so that content stays reachable by any same-realm code until it is replaced or the page unloads. Nothing is persisted to disk. Applications should not pass secrets through actions or shared properties ([ADR-0037](../../architecture/ADR/0037-realm-shared-gts-store.md))
- **Mock identification** — mock plugins are marked with the `MOCK_PLUGIN` symbol (`isMockPlugin()`), so the applied template can activate or deactivate them as a group

**Telemetry privacy (`@gears-frontx/telemetry`):**

- **Redaction before recording** — autocapture drops the whole event when any element on the walked path is a `password`/`hidden` input or looks sensitive by `name`/`id` (`cvv`, `ssn`, `cardnum`, `pwd`, ...); values matching credit-card or US-SSN patterns are dropped. This is a safety net, **not** a compliance guarantee
- **Authoritative opt-outs** — a subtree opt-out attribute and element hooks with veto are the primary controls for subtrees that render personal data
- **Stored identifiers** — the SDK writes a persistent pseudonymous device id and a session record to `localStorage`. `enabled: false` skips delivery only, not collection or storage — gate `start()` itself on consent
- **Untrusted extension code** — consumer hooks are treated as untrusted: reserved-prefix keys are stripped from hook data, and a hook cannot override captured fields

## 7. XSS & Injection Prevention

FrontX production package sources contain **no instances** of dangerous DOM manipulation patterns:

| Dangerous Pattern | Status | Verification |
|---|---|---|
| `dangerouslySetInnerHTML` (as a sink) | **Not used** | `git grep` across `packages/*/src` (non-test); `ui-kit` chart components list it only to strip it from forwarded props |
| `innerHTML` / `outerHTML` / `insertAdjacentHTML` | **Not found** | `git grep` across `packages/*/src` (non-test) |
| `eval()` | **Not found** | `git grep` across `packages/*/src` and `scripts/` |
| `new Function()` | **Not found** | `git grep` across `packages/*/src` and `scripts/` |
| `document.write()` | **Not found** | `git grep` across `packages/*/src` (non-test) |

**Active protections:**

| Protection | Mechanism |
|---|---|
| **React text escaping** | React's JSX rendering automatically escapes text content in the React-bound packages (`ui-kit`, `routing-tanstack`) |
| **Safe `<style>` rendering** | `ui-kit`'s `ChartStyle` renders per-instance CSS as JSX children, not `dangerouslySetInnerHTML`, and drops `ChartConfig` colours containing declaration- or tag-ending characters |
| **Inline-content-only dynamic import** | The MFE trust kernel rejects any `import()` input that is not a `blob:`/`data:` URL (see [section 3](#3-mfe-isolation-architecture-blob-url-sandboxing)) |
| **Type admission at runtime** | The MFE runtime admits extensions and actions only after validation by the injected type-system provider (`@gears-frontx/gts-plugin`, backed by `@globaltypesystem/gts-ts`). The provider's type store is shared by compatible copies in the realm, so a verdict reflects definitions any runtime on that store registered first ([ADR-0037](../../architecture/ADR/0037-realm-shared-gts-store.md)) |
| **Template path and content validation** | The CLI rejects unsafe relative paths and template content whose path references resolve outside the template root (see [section 16](#16-project-scaffolding--frontx-cli)) |
| **TypeScript strict types** | `noImplicitAny` + `no-explicit-any` prevent untyped data from flowing through the codebase unchecked |
| **Shadow DOM encapsulation** | MFE content rendered inside Shadow DOM boundaries, preventing CSS injection from affecting the host application |

## 8. Compile-Time Linting — ESLint

> Source: [`eslint.config.js`](../../eslint.config.js) · [`internal/eslint-config/`](../../internal/eslint-config/)

The project enforces **more than 100 ESLint rules at `error` level** (including the `@eslint/js` and `typescript-eslint` recommended sets) with zero tolerance for warnings (`--max-warnings 0`).

**ESLint plugins:**

| Plugin | Package | Purpose |
|---|---|---|
| `typescript-eslint` | `typescript-eslint` | TypeScript-aware rules: strict typing, import restrictions, banned types |
| `react-hooks` | `eslint-plugin-react-hooks` | React hooks correctness (rules of hooks, exhaustive deps) |
| `unused-imports` | `eslint-plugin-unused-imports` | Detects and auto-removes unused imports and variables |

Security-relevant rule highlights:

| Rule | Why It Matters |
|---|---|
| `@typescript-eslint/no-explicit-any` | Prevents loose typing that hides data-flow bugs |
| `@typescript-eslint/ban-ts-comment` | Prevents silencing the type checker with `@ts-ignore` |
| `@typescript-eslint/no-unsafe-function-type` | Prevents the loose `Function` type (no argument/return checking) |
| `@typescript-eslint/no-wrapper-object-types` | Prevents `Object`/`String`/`Number` (autoboxing pitfalls) |
| `@typescript-eslint/no-restricted-imports` | Enforces package boundaries — wrong-layer, deep-path and router-engine imports are errors |
| `react-hooks/exhaustive-deps` | Prevents stale closure bugs in React hooks |
| `unused-imports/no-unused-imports` | Removes dead imports that could mask unused dependencies |
| `no-restricted-syntax` (MFE trust kernel) | Confines `ImportExpression` and every spelling of `RegExp` to the audited kernel file in `packages/mfes/src/**` |
| `no-restricted-syntax` (MFES-1/2/3) | Keeps type-format literals, solution shared-property ids and layout-domain values out of the agnostic runtime |

**Shared layered configs** ([`internal/eslint-config`](../../internal/eslint-config/), private) provide `base`, `sdk`, `framework`, `react` and `screenset` layers. The `screenset` layer sets `noInlineConfig: true` (no `/* eslint-disable */` comments) and Flux architecture rules for template code; `arch:guards` verifies these configs still build and carry their expected rules. Ecosystem CI does not lint template code.

## 9. Architecture Boundary Enforcement — dependency-cruiser

> Source: [`.dependency-cruiser.cjs`](../../.dependency-cruiser.cjs) · [`internal/depcruise-config/`](../../internal/depcruise-config/) · [`scripts/test-architecture.ts`](../../scripts/test-architecture.ts)

FrontX uses [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) with a **root ecosystem config** plus a shared config package (`base.cjs`, `core.cjs`, `layer-constants.cjs`, and an `index.cjs` aggregator) to enforce boundaries at the module import level:

| Config | Scope | Key Rules |
|---|---|---|
| `internal/depcruise-config/base.cjs` | All ecosystem code | No circular dependencies |
| `internal/depcruise-config/core.cjs` | Core libraries (`api`, `gts-plugin`, `mfes`, `routing`, `telemetry`) | Zero `@gears-frontx/*` imports except the type-substrate port; no React |
| `.dependency-cruiser.cjs` | Every `packages/*` source tree | MFES-4, GTS-PLUGIN-1/2, API-1, CLI-1, ROUTING-1..3, ROUTING-TANSTACK-1..3, telemetry/ui-kit isolation, single-intra-ecosystem-edge rules |

**Example enforcement (core isolation):**

```javascript
// internal/depcruise-config/core.cjs
{
  name: 'core-no-gears-frontx-imports',
  severity: 'error',
  from: { path: CORE_SRC_PATTERN, pathNot: PORT_SRC_PATTERN },
  to: { path: GEARS_FRONTX_TARGET_PATTERNS, pathNot: OWN_PACKAGE_PATTERN },
  comment:
    'CORE VIOLATION: core published libraries must have ZERO @gears-frontx imports. The only permitted cross-package edge is the type-substrate port (gts-plugin -> mfes).',
}
```

**Architecture validation scripts:**

- `arch:check` — clean build, lint, type-check, `arch:deps`, per-constraint boundary cruises, the MFES-5 and CLI-1 grep checks, the trust-kernel annotation check, and `arch:unused`
- `arch:deps` — full dependency-cruiser validation across `packages/`
- `arch:deps:core` — core-layer rules applied per package
- `arch:edges` — `package.json` manifest edges against the boundary model
- `arch:guards` — verifies the shared ESLint and dependency-cruiser configs still carry the rules the guards depend on
- `arch:unused` — detects unused exports via [knip](https://github.com/webpro/knip)

## 10. Dependency Security — npm audit & Pinning

> Source: [`package.json`](../../package.json) · [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml) · [`.github/workflows/main.yml`](../../.github/workflows/main.yml) · [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

FrontX enforces dependency security through multiple complementary mechanisms:

### Automated Auditing

`npm audit --audit-level=high --omit=dev` runs in three places:

1. **Pre-commit hook** — via [prek](https://github.com/j178/prek) (`audit-high`), audit runs before every commit
2. **CI pipeline** — the `Main CI` workflow runs audit on every push to `main`/`develop` and every PR targeting them
3. **Manual** — developers can run `npm run prek:run` (`prek run --all-files`) to execute all checks locally

### Exact Pinning Policy

Per [`CONTRIBUTING.md`](../../CONTRIBUTING.md#dependency-pinning):

- **Exact pins everywhere** — every non-`@gears-frontx` dependency in `packages/*` declares an exact version, never a range
- **21-day eligibility** — a version may only be pinned once it has been published for at least 21 days, so a just-released version is never pulled in before it has been vetted
- **One exception** — the `@gears-frontx/mfes` → `@gears-frontx/gts-plugin` peer edge stays a semver range; `policy:version-check` blocks publishing `mfes` if that range is an exact pin or unsatisfiable
- **Shared test tooling guard** — `npm run lint:deps` fails when a workspace's Vitest/Testing Library/jsdom version drifts from the root pin

### Centralized Version Pinning

The root `package.json` uses the `overrides` field to centralize version resolution for security-sensitive transitive dependencies, including:

| Dependency | Pinned Version | Reason |
|---|---|---|
| `axios` | 1.20.0 | HTTP client — pinned to prevent transitive downgrade |
| `lodash` | 4.18.1 | Utility library — pinned to patched version |
| `ajv` | 8.18.0 | JSON Schema validator — pinned for `@fastify/ajv-compiler`, `fast-json-stringify`, `@modelcontextprotocol/sdk` |
| `esbuild` | 0.25.12 | Build tool — pinned to prevent supply-chain tampering |
| `js-yaml` | 4.3.2 | YAML parser — pinned to version without prototype pollution |
| `picomatch` | 4.0.4 | Glob matcher — pinned to prevent ReDoS |
| `brace-expansion` | 5.0.12 | Brace expansion — pinned to prevent ReDoS |
| `fast-uri` | 3.1.7 | URI parser — pinned transitive version |
| `fastify` | 5.12.5 | Dev-tooling server — pinned transitive version |

### Lockfile Integrity

- **`package-lock.json` v3** — contains SHA-512 integrity hashes for dependencies
- **`npm ci`** in CI — installs from lockfile only, rejecting any drift between `package.json` and lockfile
- **`engine-strict=true`** in `.npmrc` — rejects installs on unsupported Node.js versions (requires `>=24.14.0`)

### Registry Configuration

```ini
# .npmrc
registry=https://registry.npmjs.org/
engine-strict=true
```

Only the official npm registry is configured. No private registries or mirrors that could serve compromised packages.

## 11. Package Publishing & Release Security

> Source: [`.github/workflows/publish-packages.yml`](../../.github/workflows/publish-packages.yml) · [`CONTRIBUTING.md`](../../CONTRIBUTING.md)

FrontX is a published npm package ecosystem under the `@gears-frontx` scope. The publishing pipeline enforces supply-chain integrity through automated controls — no manual `npm publish` is part of the release process.

### Branching Model (Gitflow)

The project follows a Gitflow branching model with permanent branches:

| Branch | Lifecycle | Purpose | Publishes to |
|---|---|---|---|
| `main` | Permanent | Current stable release | `latest` npm dist-tag |
| `develop` | Permanent | Active development | `alpha` npm dist-tag |
| `release/X.Y.Z` | Short-lived | Release preparation (from `develop` → `main`) | `next` npm dist-tag (per `CONTRIBUTING.md`; see note below) |
| `release/vN` | Long-lived | Maintenance line for major version N | `vN` npm dist-tag (e.g., `v1`) |
| `feature/*` | Short-lived | Feature branches (from `develop`) | — |
| `hotfix/*` | Short-lived | Hotfix branches (from `main` → `main` + `develop`) | — |

All changes flow through pull requests with review before merging to `develop` or `main`. Every commit carries a DCO `Signed-off-by` trailer, enforced locally by the `require-signoff` `commit-msg` hook and after push by CI's DCO check.

### Automated Publishing Pipeline

Publishing is triggered by CI on push to `main`, `develop`, or `release/v*` branches. The workflow detects version changes in `packages/*/package.json` and publishes only affected, non-private packages:

```
Push to publishing branch
  → Detect version changes (git diff against pre-push state; private packages skipped)
  → Edge-compatibility check (npm run policy:version-check)
  → Build all packages (npm run build:packages)
  → Publish independently, mfes first and gts-plugin last
  → Summary report (published + skipped packages)
```

**Supply-chain security controls:**

| Control | Mechanism | Source |
|---|---|---|
| **No manual publish** | Publishing happens via the CI workflow — no developer runs `npm publish` | `publish-packages.yml` |
| **Version change detection** | Only packages with actual version bumps in `package.json` are published | `publish-packages.yml:33-61` |
| **Private packages never publish** | `"private": true` packages are skipped before the matrix is built | `publish-packages.yml:44-49` |
| **Duplicate version guard** | `npm view $NAME@$VERSION` check before publish — prevents overwriting published versions | `publish-packages.yml:177-181` |
| **Dependency-safe publish order** | `@gears-frontx/mfes` publishes before `@gears-frontx/gts-plugin`, which pins it exactly — no window where a published tarball's dependency does not resolve | `publish-packages.yml:68-88` |
| **Edge-compatibility gate** | `policy:version-check` blocks publishing `mfes` when its `gts-plugin` range is an exact pin or unsatisfiable | `publish-packages.yml:115-121` |
| **Dist-tag routing** | Branch and version suffix determine the dist-tag (`develop`→`alpha`; `main`→`latest`, or `alpha`/`next` for `-alpha`/`-rc` versions; `release/vN`→`vN`) — prevents accidental promotion of pre-release code | `publish-packages.yml:135-148` |
| **Least-privilege CI permissions** | Workflow declares `permissions: contents: read` — cannot push code, only publish to npm | `publish-packages.yml:7-8` |
| **Scoped npm token** | `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`, set only on the publish step | `publish-packages.yml:128-129` |
| **Retry with exponential backoff** | 3 attempts with 5s → 10s delays for transient registry failures | `publish-packages.yml:150-162` |
| **Full history checkout** | `fetch-depth: 0` ensures accurate version comparison against pre-push state | `publish-packages.yml:31` |

> **Note:** the workflow does not trigger on `release/X.Y.Z` branches. A release candidate reaches the `next` dist-tag only when a `-rc` version lands on `main`.

### Versioning Policy

The project is **pre-1.0** — backward compatibility is not guaranteed. Each package is versioned independently:

| Version format | Channel | Branch |
|---|---|---|
| `0.y.z-alpha.N` | `alpha` | `develop` |
| `0.y.z-rc.N` | `next` | `release/X.Y.Z` |
| `0.y.z` | `latest` | `main` |
| `N.y.z` | `vN` | `release/vN` |

**Change-driven version guards (CI):**

- **`policy:version-bump-on-change`** (pull requests) — fails when a governed package's non-documentation `src/` or `package.json` dependency fields change without its own `version` changing
- **`policy:ecosystem-pin-drift`** — every exact pin on an ecosystem package across `packages/*` must match that package's on-disk version
- **`policy:contracts`** — `ui-kit` component-contract guard and compatibility checks against the base ref, plus enrollment, on pushes and PRs

## 12. Content Security Policy Guidance

FrontX's MFE isolation architecture fetches chunk source text and evaluates it via **blob URLs**, which has implications for Content Security Policy (CSP) headers in host applications.

### Required CSP Directives

Host applications using FrontX MFEs must include `blob:` in their CSP to allow blob URL evaluation:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' blob:;
  connect-src 'self' https://mfe.example.com;
  style-src 'self' 'unsafe-inline';
  worker-src 'self' blob:;
  img-src 'self' data: blob:;
```

| Directive | Requirement | Reason |
|---|---|---|
| `script-src blob:` | **Required** | MFE modules are loaded via blob URLs created from fetched bundle code |
| `connect-src <mfe origins>` | **Required** | The handler fetches remote chunk source text with `fetch()` before blob-URLing it |
| `style-src 'unsafe-inline'` | **Required** | MFE stylesheets and the Shadow DOM isolation rule are injected as `<style>` elements; `<link>` stylesheets also need their origin in `style-src` |
| `worker-src blob:` | **Recommended** | If MFEs use Web Workers, they will also use blob URLs |
| `img-src data: blob:` | **Recommended** | MFE content may include inline images or blob-generated assets |

### CSP Considerations

- **`blob:` in `script-src`** allows any JavaScript to be evaluated as a blob URL. This is required for MFE isolation but means CSP cannot distinguish between FrontX blob URLs and potentially malicious blob URLs created by injected scripts.
- **`'unsafe-inline'` in `style-src`** is required because MFE stylesheets are injected programmatically. `nonce`-based or `hash`-based alternatives are not currently supported for dynamically injected MFE styles.
- Host applications should combine CSP with other protections (Subresource Integrity for static assets, strict CORS headers, input validation) for defense in depth.

## 13. Security Scanners in CI

> Source: [`.github/workflows/main.yml`](../../.github/workflows/main.yml) · [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml)

Multiple automated scanners and validators run on every push and pull request to `main` and `develop`:

| Scanner | What It Checks | Trigger |
|---|---|---|
| **npm audit** | Known vulnerabilities in dependencies (high severity, production only) | Every commit (pre-commit hook) + every CI run |
| **Architecture validation** | `arch:check`, `arch:deps:core`, `arch:edges`, `arch:guards` — boundaries, trust kernel, guard integrity | Every commit (pre-commit hook) + every CI run |
| **MFE import boundary** | `policy:mfes-import-boundary` — no concrete `Default*` exports or deep imports past the `mfes` barrel | Every CI run |
| **Version and pin policies** | `policy:version-bump-on-change` (PRs), `policy:ecosystem-pin-drift`, `policy:contracts` | Every CI run |
| **Studio artifact validation** | Structural integrity and traceability of PRD, DESIGN, ADR, DECOMPOSITION, FEATURE documents (`studio.py validate`) | Every CI run |
| **Studio kit validation** | Installed kit consistency (`studio.py validate-kits`) | Every CI run |
| **Spec coverage** | Minimum 38% `@cpt-*` traceability coverage and 0.60 granularity between specs and code | Every CI run |
| **ESLint** | 100+ rules at error level, zero-warning policy, boundary enforcement | Every CI run |
| **TypeScript compiler** | Full strict mode type checking across packages, tests and scripts | Every CI run |
| **dependency-cruiser** | Module import graph validation against boundary rules | Every CI run (via `arch:check` and `arch:deps:core`) |
| **Unit tests with coverage** | `test:unit -- --coverage`, gating the thresholds declared in package Vitest configs (e.g. `api`, `ui-kit`) | Every CI run |
| **Packaging acceptance** | `ui-kit` tarball installs into a clean Vite consumer | Every CI run |

The CI token is least-privilege: `Main CI` declares `permissions: contents: read` and every checkout sets `persist-credentials: false`.

**Externally configured services.** Analysis-scope configuration is committed for [SonarCloud](https://sonarcloud.io/) automatic analysis ([`.sonarcloud.properties`](../../.sonarcloud.properties)) and [Codacy](https://www.codacy.com/) ([`.codacy.yaml`](../../.codacy.yaml)); both run outside the GitHub Actions workflows. Snyk, CodeQL and GitHub Secret Scanning, if enabled, are configured at the organization or repository-settings level and leave no trace in the tree. <!-- TODO: verify which external scanners are active on constructorfabric/gears-frontx -->

### Pre-Commit Hooks (prek)

[prek](https://github.com/j178/prek) (Rust-native, fast) runs the following hooks; `npm install` installs them via the `prepare` script:

| Hook | Stage | Purpose |
|---|---|---|
| `trailing-whitespace` | pre-commit | Prevents trailing whitespace (potential diff noise) |
| `end-of-file-fixer` | pre-commit | Ensures files end with newline |
| `check-yaml` | pre-commit | Validates YAML syntax |
| `check-json` | pre-commit | Validates JSON syntax |
| `check-toml` | pre-commit | Validates TOML syntax |
| `check-added-large-files` | pre-commit | Blocks files larger than 500 KB (prevents accidental binary commits) |
| `audit-high` | pre-commit | `npm audit --audit-level=high --omit=dev` |
| `arch-check` | pre-commit | Full architecture validation |
| `arch-deps-core` | pre-commit | Core layer rules (import graph) |
| `arch-edges` | pre-commit | Package edge check (`package.json` manifests) |
| `arch-guards` | pre-commit | Guard config verification |
| `require-signoff` | commit-msg | Rejects commits without a DCO `Signed-off-by` trailer matching the author or committer |

## 14. PR Review Bots

Every pull request is reviewed by an automated bot before human review:

| Bot | Mode | Purpose |
|---|---|---|
| **[CodeRabbit](https://coderabbit.ai/)** | Automatic on every PR | AI-powered code review with security awareness, architectural compliance checking |

> Source: [`.coderabbit.yaml`](../../.coderabbit.yaml) (`auto_review.enabled: true`, `base_branches: [main, develop]`)

Human review is routed by [`.github/CODEOWNERS`](../../.github/CODEOWNERS). Developers also have access to [Claude Code](https://docs.anthropic.com/) as a local development tool for on-demand code review via the `.claude/` configuration directory, but it is not integrated into CI as an automated PR reviewer.

## 15. Specification Templates & SDLC

> Source: [`.cf-studio/`](../../.cf-studio/) · [`architecture/`](../../architecture/)

FrontX follows a **spec-driven development** lifecycle via Constructor Studio, where architecture documents are written before implementation. Artifacts are federated: layer-level artifacts live in [`architecture/`](../../architecture/), and each member package owns its PRD, DESIGN and FEATUREs in `packages/<pkg>/architecture/`. Security is addressed at multiple points in the pipeline:

```
PRD (Product Requirements) → ADR (Architecture Decisions) + DESIGN (System Design)
    → DECOMPOSITION (Feature Plan) → FEATURE (Precise Behavior) → CODE (Implementation)
```

**Security-relevant SDLC practices:**

- **Architecture Decision Records (ADRs)** — 36 root ADRs, each with a SEC checklist entry stating whether security applies. Security-applicable decisions include action dispatch and chaining ([ADR-0007](../../architecture/ADR/0007-action-dispatch-and-chaining.md)), child MFE host access ([ADR-0008](../../architecture/ADR/0008-child-mfe-host-access.md)), MFE load isolation ([ADR-0011](../../architecture/ADR/0011-mfe-load-isolation.md)), the shared-dependency dedup key ([ADR-0034](../../architecture/ADR/0034-shared-dep-dedup-key.md)) and cache reach ([ADR-0035](../../architecture/ADR/0035-shared-dep-cache-reach.md)), the extension routing port ([ADR-0036](../../architecture/ADR/0036-extension-routing-port.md)), and the realm-shared type store ([ADR-0037](../../architecture/ADR/0037-realm-shared-gts-store.md))
- **`@cpt-*` traceability markers** — code annotated with `@cpt-dod`, `@cpt-flow`, `@cpt-algo`, `@cpt-state` markers that link implementation back to FEATURE specifications. CI enforces minimum 38% coverage and 0.60 granularity
- **Template territory is out of chain** — `@cpt-` markers in template territory bind nothing ([ADR-0033](../../architecture/ADR/0033-template-territory-traceability.md)); templates carry their own specifications in their own repository
- **Immutable audit trail** — all changes flow through PRs with review, DCO sign-off, and merge history preserved in Git
- **Artifact validation in CI** — Constructor Studio validates structural integrity and cross-references of all architecture documents on every push

## 16. Project Scaffolding — FrontX CLI

> Source: [`packages/cli/`](../../packages/cli/) · [`architecture/ADR/0016-template-acquisition-and-location.md`](../../architecture/ADR/0016-template-acquisition-and-location.md)

`@gears-frontx/cli` (the `frontx` executable) scaffolds and upgrades projects from templates. It bundles **no template** (CLI-1); templates are published from their own repository — the FrontX ones from [constructorfabric/gears-frontx-templates](https://github.com/constructorfabric/gears-frontx-templates) — and acquired by an explicit source-spec:

```bash
frontx install github:<owner>/<templates-repo>//<template>@<ref>
```

**CLI safeguards:**

| Safeguard | Description |
|---|---|
| **No bundled templates** | dependency-cruiser rule `frontx-cli-1-no-bundled-template-content` and a grep check in `arch:check` keep template packages and names out of the CLI |
| **Pinned source by ref** | A source-spec names repository, template directory and ref, so what is fetched is explicit and reproducible |
| **Safe relative paths** | Source-spec subtree segments and manifest-declared identities are checked by `isSafeRelativePath()`: no absolute paths, backslashes, `..`/`.` segments, colons or control characters |
| **Content self-containment** | `validate-content-self-containment` rejects template content whose `file:` specifiers, tsconfig paths or lockfile entries resolve outside the template root |
| **Regular files only** | The GitHub tarball adapter materializes only regular-file entries; symlinks and other entry types are skipped |
| **No subtree escape** | When a source-spec narrows to a template directory, any re-rooted entry that is absolute, carries a backslash or contains a `..` segment refuses the whole install |
| **Local-walk containment** | When reading a local template, declared content paths and symlinks resolving outside the template root are refused or skipped |
| **Occupied-ground guard** | Adding a template refuses to write where an unaccounted file, directory or dangling symlink already stands |
| **Optional authenticated fetch** | `GITHUB_TOKEN`, when set, is sent as a bearer token to GitHub only |
| **Reviewable upgrades** | Upgrades are computed as change sets with identity verification and a retained pre-upgrade snapshot for rollback |

The security baseline a scaffolded project inherits (TypeScript strictness, ESLint layers, import restrictions, build configuration) is defined by the applied template in the templates repository, not by this repository.

## 17. Opportunities for Improvement

The following areas have been identified for future hardening:

1. **SAST tooling integration** — integrate [SonarCloud](https://sonarcloud.io/) or equivalent static application security testing into CI for automated vulnerability detection beyond ESLint. `.sonarcloud.properties` and `.codacy.yaml` are present, but no workflow in `.github/workflows/` runs a SAST scanner or gates a PR on its result
2. **In-repo CodeQL and secret scanning** — no CodeQL workflow or secret-scanning configuration is committed; their status depends on organization and repository settings that cannot be audited from the tree
3. **Security-specific ADR** — create a dedicated Architecture Decision Record documenting the security architecture, threat model, and trust boundaries of FrontX as a whole; today the threat model is spread across the SEC entries of ADR-0007, 0008, 0011, 0034, 0035, 0036 and 0037
4. **OWASP dependency checking** — supplement `npm audit` with [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/) or [Socket.dev](https://socket.dev/) for deeper supply-chain analysis including typosquatting detection and behavioral analysis
5. **Automated pin enforcement** — the exact-pin and 21-day eligibility rules in `CONTRIBUTING.md` have no automated check (`lint:deps` covers only shared test tooling); `@gears-frontx/routing-tanstack` currently declares `@tanstack/react-router` and `@tanstack/router-core` as caret ranges
6. **MFE sandboxing limits documentation** — create developer-facing documentation explicitly stating what blob URL isolation does and does not protect against, with guidance for high-security deployments (e.g., iframe-based isolation for untrusted MFE code)
7. **Authentication patterns guide** — document recommended token storage strategies (httpOnly cookies vs. in-memory vs. localStorage) with security trade-offs for each approach
8. **SSE credential default** — `SseProtocol` defaults `withCredentials` to `true`, unlike `RestProtocol`; align the default or document the opt-out
9. **CSP header template** — provide a ready-to-use CSP configuration for new projects, with blob URL allowances pre-configured; this now belongs in the templates repository
10. **Dependency update SLA** — establish a security patch policy with defined response times for critical (24h), high (72h), and medium (1 week) severity advisories
11. **SBOM generation** — add Software Bill of Materials generation to CI for supply-chain transparency, following [CycloneDX](https://cyclonedx.org/) or [SPDX](https://spdx.dev/) standards
12. **npm provenance and action pinning** — `npm publish` runs without `--provenance` (the publish job has no `id-token: write`), publish checkouts keep default persisted credentials, and GitHub Actions are pinned by tag rather than commit SHA
13. **Subresource Integrity (SRI)** — implement SRI hash verification for fetched MFE chunks to detect tampering between build and runtime loading
14. **Security testing category** — add explicit security-focused test scenarios (XSS injection attempts, CSRF token validation, malicious MFE behavior) to the test suite

---

*This document is maintained alongside the codebase. For the overall system design, see [`architecture/DESIGN.md`](../../architecture/DESIGN.md). For architecture decisions, see [`architecture/ADR/`](../../architecture/ADR/). For the companion backend security document, see [cyberfabric-core/docs/security/SECURITY.md](https://github.com/cyberfabric/cyberfabric-core/blob/main/docs/security/SECURITY.md).* <!-- TODO: verify the companion backend document's current location -->
