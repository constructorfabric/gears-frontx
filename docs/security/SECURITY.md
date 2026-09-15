# Security in FrontX

> **Source of truth:** `develop` branch of [constructorfabric/gears-frontx](https://github.com/constructorfabric/gears-frontx/tree/develop)

FrontX takes a **defense-in-depth** approach to security, combining TypeScript's strict compile-time type system with layered static analysis, architecture boundary enforcement, dependency auditing, and structured development processes. This document summarizes the security measures in place across the project.

---

## Table of Contents

- [1. TypeScript Strict Mode & Compile-Time Safety](#1-typescript-strict-mode--compile-time-safety)
- [2. Four-Layer Architecture & Boundary Enforcement](#2-four-layer-architecture--boundary-enforcement)
- [3. MFE Isolation Architecture (Blob URL Sandboxing)](#3-mfe-isolation-architecture-blob-url-sandboxing)
- [4. API Communication & Plugin Chain](#4-api-communication--plugin-chain)
- [5. Authentication Pattern](#5-authentication-pattern)
- [6. Data Handling & Cache Security](#6-data-handling--cache-security)
- [7. XSS & Injection Prevention](#7-xss--injection-prevention)
- [8. Compile-Time Linting — ESLint](#8-compile-time-linting--eslint)
- [9. Architecture Boundary Enforcement — dependency-cruiser](#9-architecture-boundary-enforcement--dependency-cruiser)
- [10. Dependency Security — npm audit](#10-dependency-security--npm-audit)
- [11. Package Publishing & Release Security](#11-package-publishing--release-security)
- [12. Content Security Policy Guidance](#12-content-security-policy-guidance)
- [13. Security Scanners in CI](#13-security-scanners-in-ci)
- [14. PR Review Bots](#14-pr-review-bots)
- [15. Specification Templates & SDLC](#15-specification-templates--sdlc)
- [16. Repository Scaffolding — FrontX CLI](#16-repository-scaffolding--frontx-cli)
- [17. Opportunities for Improvement](#17-opportunities-for-improvement)

---

## 1. TypeScript Strict Mode & Compile-Time Safety

TypeScript's strict mode eliminates entire categories of runtime errors at compile time. FrontX enables **all strict flags** across every package:

| Vulnerability Class | How TypeScript Strict Mode Prevents It |
|---|---|
| Null/undefined dereference | `strictNullChecks` forces explicit `null`/`undefined` handling |
| Implicit type coercion | `noImplicitAny` requires explicit type annotations |
| Incorrect function signatures | `strictFunctionTypes` enforces contravariant parameter checking |
| Uninitialized class properties | `strictPropertyInitialization` requires definite assignment |
| Unsafe `this` binding | `noImplicitThis` prevents untyped `this` in functions |
| Incorrect `call`/`bind`/`apply` | `strictBindCallApply` enforces argument type checking |
| Dead code via switch fallthrough | `noFallthroughCasesInSwitch` requires explicit `break`/`return` |
| Unused variables/imports | `noUnusedLocals` + `noUnusedParameters` flag dead code (7 of 9 packages; `cli` and `docs` rely on `strict` defaults only) |

Additional TypeScript-specific project practices:

- **`"strict": true`** in every package `tsconfig.json` — all 9 packages enforce the full strict suite
- **`noImplicitAny`** — loose `any` types are banned at the ESLint level (`@typescript-eslint/no-explicit-any: error`), not just the compiler level
- **`@typescript-eslint/ban-ts-comment`** — `@ts-ignore`, `@ts-nocheck`, and `@ts-expect-error` directives are forbidden, preventing developers from silencing the type checker
- **`no-unsafe-function-type`** / **`no-wrapper-object-types`** — the loose `Function`, `Object`, `String`, `Number` types are banned; concrete types required
- **Zero-warning policy** — `eslint --max-warnings 0` treats all warnings as errors in CI

> Source: [`packages/*/tsconfig.json`](../../packages/), [`eslint.config.js`](../../eslint.config.js)

## 2. Four-Layer Architecture & Boundary Enforcement

> Source: [`architecture/ADR/0001-four-layer-sdk-architecture.md`](../../architecture/ADR/0001-four-layer-sdk-architecture.md) · [`architecture/DESIGN.md`](../../architecture/DESIGN.md)

FrontX implements a **four-layer architecture** with compile-time dependency enforcement. Each layer can only depend on layers below it — upward imports are build errors:

```
L4  App Layer (src/app/, src/screensets/)
 │  ↓ imports only from L3
L3  React Bindings (@cyberfabric/react)
 │  ↓ imports only from L2
L2  Framework (@cyberfabric/framework)
 │  ↓ imports only from L1
L1  SDK (@cyberfabric/state, @cyberfabric/api, @cyberfabric/screensets, @cyberfabric/i18n)
    ↓ ZERO inter-package dependencies
```

**Security implications of layered isolation:**

| Rule | What It Prevents |
|---|---|
| SDK packages have zero `@cyberfabric/*` imports | Circular dependencies, uncontrolled coupling |
| SDK packages cannot import React | Framework lock-in, unintended DOM access |
| App code cannot import L1/L2 directly | Bypassing framework safety wrappers (e.g., auth plugin chain) |
| Framework cannot import React bindings | Circular dependency, rendering in non-React contexts |

**Enforcement mechanisms:**
- **ESLint `@typescript-eslint/no-restricted-imports`** — layer violations are lint errors with descriptive messages (`LAYER VIOLATION: App-layer code must import from @cyberfabric/react, not directly from @cyberfabric/api (Layer 1).`)
- **dependency-cruiser** — per-layer configs (`internal/depcruise-config/sdk.cjs`, `framework.cjs`, `react.cjs`, `screenset.cjs`) enforce structural boundaries
- **CI architecture check** — `npm run arch:check` runs in CI on every push and PR

## 3. MFE Isolation Architecture (Blob URL Sandboxing)

> Source: [`packages/screensets/src/mfe/handler/mf-handler.ts`](../../packages/screensets/src/mfe/handler/mf-handler.ts) · [`architecture/ADR/0004-blob-url-mfe-isolation.md`](../../architecture/ADR/0004-blob-url-mfe-isolation.md)

FrontX uses a **per-load blob URL isolation** architecture for microfrontend (MFE) sandboxing. Each `load()` call creates a fully isolated module evaluation chain, preventing cross-MFE state leakage:

```
Host App
├── MFE A (load #1) → blob URL chain A → fresh moduleCache A → Shadow DOM A
├── MFE B (load #2) → blob URL chain B → fresh moduleCache B → Shadow DOM B
└── MFE C (load #3) → blob URL chain C → fresh moduleCache C → Shadow DOM C
    └── No shared module instances between A, B, C
```

**Per-load isolation guarantees:**

| Protection | Mechanism |
|---|---|
| **Module instance isolation** | Each `load()` gets a fresh `moduleCache` — no shared federation runtime state |
| **Dependency isolation** | `buildShareScope()` creates isolated `get()` closures per shared dependency |
| **Blob URL chain** | `createBlobUrlChain()` generates unique blob URLs for all chunks within a load |
| **Style isolation** | Stylesheets injected into `ShadowRoot` with `__hai3-mfe-runtime-style-` prefix |
| **DOM tree isolation** | Shadow DOM encapsulation prevents CSS/DOM leakage between MFEs |
| **Per-load state tracking** | `LoadBlobState` tracks `blobUrlMap` and `inFlight` promises per load |

**Common transitive dependency deduplication:** within a single `load()` call, shared dependencies (e.g., React) are blob-URL'd once and reused by all modules in that load — reducing memory without breaking isolation between different loads.

**Known limitations:**

- Blob URLs share the browser's global scope — MFEs can access `window`, `document`, `fetch`, and other globals. Blob URL isolation is **module-level**, not **process-level**.
- JavaScript execution in the browser cannot be fully sandboxed without iframes. Blob URL isolation prevents accidental cross-MFE module instance sharing but does not protect against intentionally malicious MFE code.
- Blob URLs are not revoked after creation because modules with top-level `await` need continued access to their blob URLs during asynchronous initialization.

## 4. API Communication & Plugin Chain

> Source: [`packages/api/src/protocols/RestProtocol.ts`](../../packages/api/src/protocols/RestProtocol.ts) · [`packages/api/src/types.ts`](../../packages/api/src/types.ts)

FrontX provides a **plugin-chain architecture** for all API communication. Every HTTP request passes through a configurable plugin pipeline, enabling centralized security controls:

```
Application Code → RestProtocol.get('/users')
                   → Plugin Chain (onRequest)
                     → Auth plugin (app-provided): inject Bearer token
                     → Logging plugin (app-provided): log method + URL
                     → MockPlugin (built-in): short-circuit if mock mode
                   → axios HTTP request
                   → Plugin Chain (onResponse)
                     → LoggingPlugin: log status
                     → Transform: normalize response
                   → Application Code
```

**Security-relevant features:**

| Feature | Protection |
|---|---|
| **Plugin chain ordering** | Plugins run in registration order; auth always runs before logging |
| **Short-circuit responses** | Mock plugins return `ShortCircuitResponse` — request never reaches network |
| **Retry with loop prevention** | `ApiPluginErrorContext.retry()` tracks `retryCount`; `maxRetryDepth` (default: 10) prevents infinite loops |
| **Shared fetch cache** | `peekSharedFetchCache()` deduplicates concurrent identical GET requests — prevents thundering herd |
| **CORS opt-in** | `withCredentials` defaults to `false` — credentialed cross-origin requests require explicit opt-in |
| **Abort signal threading** | `AbortSignal` propagated through the full request chain for cancellation support |
| **Error isolation** | Plugin errors are caught and surfaced via `onError` hooks without crashing the chain |

**Default REST configuration:**

```typescript
const DEFAULT_REST_CONFIG: RestProtocolConfig = {
  withCredentials: false,    // No CORS cookies by default
  contentType: 'application/json',
};
```

## 5. Authentication Pattern

> Source: [`packages/api/src/types.ts`](../../packages/api/src/types.ts) · [`packages/api/CLAUDE.md`](../../packages/api/CLAUDE.md)

FrontX is a **UI framework**, not an identity provider. Authentication is delegated to backend services, with FrontX providing the **plugin infrastructure** for token injection and refresh. FrontX does not ship a concrete auth plugin — host applications implement their own using the base classes below.

**Canonical auth plugin pattern** (from framework JSDoc examples — not a built-in class):

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
| **Max retry depth** | Global `maxRetryDepth` (default: 10) hard-caps retry attempts |
| **No token storage in framework** | FrontX does not store tokens — application code decides storage strategy |
| **Plugin-based injection** | Auth headers are injected per-request via plugin, not hardcoded in service configs |
| **CORS cookie opt-in** | `withCredentials: false` by default — prevents accidental credential leakage to third-party origins |

**Guidance for host applications:** token storage strategy (localStorage vs. httpOnly cookies vs. in-memory) is the responsibility of the host application. FrontX provides the injection mechanism; the host application provides the credential source.

## 6. Data Handling & Cache Security

> Source: [`packages/api/src/sharedFetchCache.ts`](../../packages/api/src/sharedFetchCache.ts) · [`packages/framework/`](../../packages/framework/)

FrontX implements a multi-layer caching architecture with explicit invalidation and mock-mode safety:

**Cache layers:**

| Layer | Scope | Purpose |
|---|---|---|
| **Shared fetch cache** | `@cyberfabric/api` (L1) | Deduplicates concurrent identical GET requests at the protocol level |
| **TanStack Query cache** | `@cyberfabric/react` (L3) | React-level data caching with configurable `staleTime` and `gcTime` |
| **Redux store** | `@cyberfabric/framework` (L2) | UI state management (not API data) |

**Security-relevant behaviors:**

- **Mock mode cache clearing** — toggling mock mode via `toggleMockMode()` clears all caches to prevent stale mock data from leaking into production requests (and vice versa)
- **Event bus-driven invalidation** — `eventBus.emit('cache/invalidate', { queryKey })` provides explicit cache invalidation without relying on stale timeouts
- **Configurable staleness** — `staleTime` and `gcTime` are configurable per endpoint descriptor, with sensible defaults
- **No at-rest encryption** — cached data is held in JavaScript memory (not persisted to disk). Applications that cache sensitive data should implement appropriate application-level protections
- **Automatic cache key derivation** — cache keys are derived from `[baseURL, method, path]`, preventing key collision attacks from mismatched URL/method combinations

## 7. XSS & Injection Prevention

FrontX has been verified to contain **zero instances** of dangerous DOM manipulation patterns:

| Dangerous Pattern | Status | Verification |
|---|---|---|
| `dangerouslySetInnerHTML` | **Not found** | `grep` across all `.ts`/`.tsx` files |
| `innerHTML` | **Not found** | `grep` across all `.ts`/`.tsx` files |
| `eval()` | **Not found** | `grep` across all `.ts`/`.tsx` files |
| `new Function()` | **Not found** | `grep` across all `.ts`/`.tsx` files |
| `document.write()` | **Not found** | `grep` across all `.ts`/`.tsx` files |

**Active protections:**

| Protection | Mechanism |
|---|---|
| **React text escaping** | React's JSX rendering automatically escapes text content, preventing XSS via data injection |
| **Zod runtime validation** | `zod` v4 provides runtime schema validation for API inputs and form data |
| **Template sanitization** | `sanitizeMainTemplateContent()` in the CLI processes generated templates to prevent code generation vulnerabilities |
| **TypeScript strict types** | `noImplicitAny` + `no-explicit-any` prevent untyped data from flowing through the codebase unchecked |
| **No inline styles** | ESLint `local/no-inline-styles` rule prevents style injection via inline `style` attributes (Studio package exempted — dev-only) |
| **Shadow DOM encapsulation** | MFE content rendered inside Shadow DOM boundaries, preventing CSS injection from affecting the host application |

## 8. Compile-Time Linting — ESLint

> Source: [`eslint.config.js`](../../eslint.config.js) · [`packages/cli/template-sources/project/configs/eslint.config.js`](../../packages/cli/template-sources/project/configs/eslint.config.js)

The project enforces **30+ ESLint rules at `error` level** with zero tolerance for warnings (`--max-warnings 0`).

**ESLint plugins:**

| Plugin | Package | Purpose |
|---|---|---|
| `typescript-eslint` | `typescript-eslint` | TypeScript-aware rules: strict typing, import restrictions, banned types |
| `react-hooks` | `eslint-plugin-react-hooks` | React hooks correctness (rules of hooks, exhaustive deps) |
| `unused-imports` | `eslint-plugin-unused-imports` | Detects and auto-removes unused imports and variables |
| `local` | `eslint-plugin-local` (in-repo) | 9 project-specific rules for FrontX architecture enforcement |

Security-relevant rule highlights:

| Rule | Why It Matters |
|---|---|
| `@typescript-eslint/no-explicit-any` | Prevents loose typing that hides data-flow bugs |
| `@typescript-eslint/ban-ts-comment` | Prevents silencing the type checker with `@ts-ignore` |
| `@typescript-eslint/no-unsafe-function-type` | Prevents the loose `Function` type (no argument/return checking) |
| `@typescript-eslint/no-wrapper-object-types` | Prevents `Object`/`String`/`Number` (autoboxing pitfalls) |
| `@typescript-eslint/no-restricted-imports` | Enforces layer boundaries — wrong-layer imports are errors |
| `react-hooks/exhaustive-deps` | Prevents stale closure bugs in React hooks |
| `unused-imports/no-unused-imports` | Removes dead imports that could mask unused dependencies |
| `local/no-inline-styles` | Prevents style injection via inline `style` attributes |
| `local/no-barrel-exports-events-effects` | Prevents barrel re-exports that break tree-shaking and leak internals |
| `local/no-coordinator-effects` | Prevents anti-pattern where effects orchestrate other effects (coupling) |
| `no-restricted-syntax` (Flux rules) | Prevents direct `store.dispatch()` and slice reducer calls from components |
| `noInlineConfig: true` | Prevents `/* eslint-disable */` comments in screenset code (L4) |

**Custom ESLint local plugin** (`eslint-plugin-local`) provides domain-specific rules:

- `no-barrel-exports-events-effects` — prevents barrel re-exports in events/effects directories
- `no-coordinator-effects` — prevents effect-to-effect orchestration
- `no-missing-domain-id` — enforces domain ID presence in screenset definitions
- `domain-event-format` — enforces domain event naming conventions
- `no-inline-styles` — prevents inline style attributes
- `uikit-no-business-logic` — prevents business logic in UI kit components
- `screen-inline-components` — prevents inline component definitions in screen files
- `no-direct-tanstack-hooks` — enforces use of FrontX wrappers instead of raw TanStack Query hooks
- `no-manual-query-keys` — prevents manual query key construction (keys are auto-derived from endpoint descriptors)

## 9. Architecture Boundary Enforcement — dependency-cruiser

> Source: [`internal/depcruise-config/`](../../internal/depcruise-config/) · [`scripts/test-architecture.ts`](../../scripts/test-architecture.ts)

FrontX uses [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) with **5 per-layer configuration files** (plus an `index.cjs` aggregator) to enforce architectural boundaries at the module import level:

| Config | Layer | Key Rules |
|---|---|---|
| `base.cjs` | All | Shared rules (no circular deps, no orphan modules) |
| `sdk.cjs` | L1 SDK | Zero `@cyberfabric/*` imports, no React |
| `framework.cjs` | L2 Framework | No `@cyberfabric/react`, no direct React imports |
| `react.cjs` | L3 React | No direct SDK imports (must go through Framework) |
| `screenset.cjs` | L4 Screenset | Domain isolation, no cross-screenset imports |

**Example enforcement (SDK isolation):**

```javascript
// internal/depcruise-config/sdk.cjs
{
  name: 'sdk-no-cyberfabric-imports',
  severity: 'error',
  from: { path: '^packages/(state|screensets|api|i18n)/src' },
  to: { path: 'node_modules/@cyberfabric/' },
  comment: 'SDK VIOLATION: SDK packages must have ZERO @cyberfabric dependencies.',
}
```

**Additional architecture validation scripts:**

- `arch:check` — runs all architecture tests (SDK layer, plugin system, layered configs)
- `arch:sdk` — validates SDK layer isolation specifically
- `arch:layers` — verifies layered configuration consistency
- `arch:plugins` — validates plugin system architecture
- `arch:deps` — full dependency-cruiser validation across all packages
- `arch:unused` — detects unused exports via [knip](https://github.com/webpro/knip)

## 10. Dependency Security — npm audit

> Source: [`package.json`](../../package.json) · [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml) · [`.github/workflows/main.yml`](../../.github/workflows/main.yml)

FrontX enforces dependency security through multiple complementary mechanisms:

### Automated Auditing

`npm audit --audit-level=high --omit=dev` runs in three places:

1. **Pre-commit hook** — via `prek` (Rust-native git hooks), audit runs before every commit
2. **CI pipeline** — GitHub Actions workflow runs audit on every push to `main`/`develop` and every PR
3. **Manual** — developers can run `npx prek run --all-files` to execute all checks locally

### Centralized Version Pinning

The root `package.json` uses the `overrides` field to centralize version resolution for security-sensitive transitive dependencies:

| Dependency | Pinned Version | Reason |
|---|---|---|
| `axios` | 1.14.0 | HTTP client — pinned to prevent transitive downgrade |
| `lodash` | 4.18.1 | Utility library — pinned to patched version |
| `ajv` | 8.18.0 | JSON Schema validator — pinned across multiple consumers |
| `esbuild` | 0.25.12 | Build tool — pinned to prevent supply-chain tampering |
| `js-yaml` | 4.1.1 | YAML parser — pinned to version without prototype pollution |
| `picomatch` | 4.0.4 | Glob matcher — pinned to prevent ReDoS |
| `brace-expansion` | 2.0.3 | Brace expansion — pinned to prevent ReDoS |
| `@swc/core` | 1.15.7 | SWC compiler — native binary pinned to prevent supply-chain attack |

### Lockfile Integrity

- **`package-lock.json` v3** — contains SHA-512 integrity hashes for all dependencies
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

FrontX is a published npm package ecosystem. The publishing pipeline enforces supply-chain integrity through automated controls — no manual `npm publish` is permitted.

### Branching Model (Gitflow)

The project follows a Gitflow branching model with protected permanent branches:

| Branch | Lifecycle | Purpose | Publishes to |
|---|---|---|---|
| `main` | Permanent | Current stable release | `latest` npm dist-tag |
| `develop` | Permanent | Active development | `alpha` npm dist-tag |
| `release/X.Y.Z` | Short-lived | Release preparation (from `develop` → `main`) | `next` npm dist-tag |
| `release/vN` | Long-lived | Maintenance line for major version N | `vN` npm dist-tag (e.g., `v1`) |
| `feature/*` | Short-lived | Feature branches (from `develop`) | — |
| `hotfix/*` | Short-lived | Hotfix branches (from `main` → `main` + `develop`) | — |

All changes flow through pull requests with review gates before merging to `develop` or `main`.

### Automated Publishing Pipeline

Publishing is triggered by CI on push to `main`, `develop`, or `release/v*` branches. The workflow detects version changes in `packages/*/package.json` and publishes only affected packages:

```
Push to publishing branch
  → Detect version changes (git diff against pre-push state)
  → Build all packages (npm run build:packages)
  → Publish in layer order (L1 SDK → L2 Framework → L3 React → L4 Studio → L5 CLI)
  → Summary report (published + skipped packages)
```

**Supply-chain security controls:**

| Control | Mechanism | Source |
|---|---|---|
| **No manual publish** | Publishing only happens via CI workflow — no developer runs `npm publish` | `publish-packages.yml` |
| **Version change detection** | Only packages with actual version bumps in `package.json` are published | `publish-packages.yml:33-48` |
| **Duplicate version guard** | `npm view $NAME@$VERSION` check before publish — prevents overwriting published versions | `publish-packages.yml:180-183` |
| **Layer-ordered publishing** | L1 → L2 → L3 → L4 → L5 ensures consumers always resolve valid dependency versions | `publish-packages.yml:154-159` |
| **Dist-tag routing** | Branch determines dist-tag (`main`→`latest`, `develop`→`alpha`, `release/vN`→`vN`) — prevents accidental promotion of pre-release code | `publish-packages.yml:101-126` |
| **Least-privilege CI permissions** | Workflow declares `permissions: contents: read` — cannot push code, only publish to npm | `publish-packages.yml:7-8` |
| **Scoped npm token** | `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN` — token never exposed in logs or to other jobs | `publish-packages.yml:92` |
| **Retry with exponential backoff** | 3 attempts with 5s → 10s → 20s delays for transient registry failures | `publish-packages.yml:129-151` |
| **Full history checkout** | `fetch-depth: 0` ensures accurate version comparison against pre-push state | `publish-packages.yml:19-20` |

### Versioning Policy

The project is **pre-1.0** — backward compatibility is not guaranteed. Each package is versioned independently:

| Version format | Channel | Branch |
|---|---|---|
| `0.y.z-alpha.N` | `alpha` | `develop` |
| `0.y.z-rc.N` | `next` | `release/X.Y.Z` |
| `0.y.z` | `latest` | `main` |
| `N.y.z` | `vN` | `release/vN` |

## 12. Content Security Policy Guidance

FrontX's MFE isolation architecture uses **blob URLs** for module loading, which has implications for Content Security Policy (CSP) headers in host applications.

### Required CSP Directives

Host applications using FrontX MFEs must include `blob:` in their CSP to allow blob URL evaluation:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  worker-src 'self' blob:;
  img-src 'self' data: blob:;
```

| Directive | Requirement | Reason |
|---|---|---|
| `script-src blob:` | **Required** | MFE modules are loaded via blob URLs created from fetched bundle code |
| `style-src 'unsafe-inline'` | **Required** | MFE stylesheets are injected into Shadow DOM via `<style>` elements |
| `worker-src blob:` | **Recommended** | If MFEs use Web Workers, they will also use blob URLs |
| `img-src data: blob:` | **Recommended** | MFE content may include inline images or blob-generated assets |

### CSP Considerations

- **`blob:` in `script-src`** allows any JavaScript to be evaluated as a blob URL. This is required for MFE isolation but means CSP cannot distinguish between FrontX blob URLs and potentially malicious blob URLs created by injected scripts.
- **`'unsafe-inline'` in `style-src`** is required because MFE stylesheets are injected programmatically. `nonce`-based or `hash`-based alternatives are not currently supported for dynamically injected MFE styles.
- Host applications should combine CSP with other protections (Subresource Integrity for static assets, strict CORS headers, input validation) for defense in depth.

## 13. Security Scanners in CI

> Source: [`.github/workflows/main.yml`](../../.github/workflows/main.yml) · [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml)

Multiple automated scanners and validators run on every push and pull request:

| Scanner | What It Checks | Trigger |
|---|---|---|
| **npm audit** | Known vulnerabilities in dependencies (high severity, production only) | Every commit (pre-commit hook) + every CI run |
| **Architecture validation** | Layer boundary compliance, SDK isolation, plugin system integrity | Every commit (pre-commit hook) + every CI run |
| **Cypilot artifact validation** | Structural integrity of PRD, DESIGN, ADR, FEATURE documents | Every CI run |
| **Cypilot kit validation** | Installed kit template/example consistency | Every CI run |
| **Spec coverage** | Minimum 58% traceability coverage between design specs and code (`@cpt-*` markers) | Every CI run |
| **ESLint** | 30+ rules at error level, zero-warning policy, layer enforcement | Every CI run |
| **TypeScript compiler** | Full strict mode type checking across all packages | Every CI run |
| **dependency-cruiser** | Module import graph validation against per-layer rules | Every CI run (via `arch:check`) |
| **[Snyk](https://snyk.io/)** | Dependency vulnerability scanning, license compliance, container security | Continuous (configured at organization level) |
| **[CodeQL](https://codeql.github.com/)** | Static analysis for security vulnerabilities (JavaScript, TypeScript) | Configured at repository level |
| **[GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)** | Detects committed secrets (API keys, tokens, credentials) and blocks pushes containing known secret patterns | Continuous (configured at repository level) |

### Pre-Commit Hooks (prek)

[prek](https://github.com/j178/prek) (Rust-native, fast) runs the following hooks before every commit:

| Hook | Purpose |
|---|---|
| `trailing-whitespace` | Prevents trailing whitespace (potential diff noise) |
| `end-of-file-fixer` | Ensures files end with newline |
| `check-yaml` | Validates YAML syntax |
| `check-json` | Validates JSON syntax |
| `check-toml` | Validates TOML syntax |
| `check-added-large-files` | Blocks files larger than 500 KB (prevents accidental binary commits) |
| `audit-high` | `npm audit --audit-level=high --omit=dev` |
| `arch-check` | Full architecture validation |

## 14. PR Review Bots

Every pull request is reviewed by an automated bot before human review:

| Bot | Mode | Purpose |
|---|---|---|
| **[CodeRabbit](https://coderabbit.ai/)** | Automatic on every PR | AI-powered code review with security awareness, architectural compliance checking |

> Source: [`.coderabbit.yaml`](../../.coderabbit.yaml) (`auto_review.enabled: true`, `base_branches: [main, develop]`)

Developers also have access to [Claude Code](https://docs.anthropic.com/) as a local development tool for on-demand code review via the `.claude/` configuration directory, but it is not integrated into CI as an automated PR reviewer.

## 15. Specification Templates & SDLC

> Source: [`.cypilot/`](../../.cypilot/) · [`architecture/`](../../architecture/)

FrontX follows a **spec-driven development** lifecycle via [Cypilot](https://github.com/constructorfabric/cyber-pilot) where architecture documents are written before implementation. Security is addressed at multiple points in the pipeline:

```
PRD (Product Requirements) → ADR (Architecture Decisions) + DESIGN (System Design)
    → DECOMPOSITION (Feature Plan) → FEATURE (Precise Behavior) → CODE (Implementation)
```

**Security-relevant SDLC practices:**

- **Architecture Decision Records (ADRs)** — 18+ ADRs document security-relevant decisions including blob URL isolation (ADR-0004), ESM-first module format (ADR-0005), screenset vertical-slice isolation (ADR-0006), protocol-separated API architecture (ADR-0010), and per-action type handler routing (ADR-0018)
- **`@cpt-*` traceability markers** — code annotated with `@cpt-dod`, `@cpt-flow`, `@cpt-algo`, `@cpt-state` markers that link implementation back to FEATURE specifications. CI enforces minimum 58% coverage
- **Immutable audit trail** — all changes flow through PRs with review and merge history preserved in Git
- **Artifact validation in CI** — Cypilot validates structural integrity and cross-references of all architecture documents on every push

## 16. Repository Scaffolding — FrontX CLI

> Source: [`packages/cli/`](../../packages/cli/)

FrontX provides the `@cyberfabric/cli` tool for scaffolding new projects that automatically inherit the platform's security posture:

| Inherited Configuration | Description |
|---|---|
| **TypeScript strict mode** | Full strict suite (`strict: true`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`) |
| **ESLint configuration** | 30+ rules at error level, layer enforcement, Flux architecture rules, zero-warning policy, `noInlineConfig: true` for screensets |
| **Layer enforcement** | App-layer code restricted to `@cyberfabric/react` imports only — cannot bypass to L1/L2 |
| **TanStack Query restriction** | Direct `@tanstack/react-query` imports banned — must use `useApiQuery`/`useApiMutation`/`useApiStream` wrappers |
| **Redux term bans** | `useDispatch`/`useSelector` from `react-redux` banned — must use FrontX-wrapped `useAppDispatch`/`useAppSelector` |
| **Template sanitization** | `sanitizeMainTemplateContent()` processes all generated template content |
| **Vite configuration** | Chunk splitting for vendors, path alias resolution, development-mode optimizations |

This ensures every new FrontX project starts with the same security baseline described in this document, eliminating configuration drift across applications built on the platform.

## 17. Opportunities for Improvement

The following areas have been identified for future hardening:

1. **SAST tooling integration** — integrate [SonarCloud](https://sonarcloud.io/) or equivalent static application security testing for automated vulnerability detection beyond ESLint. A `.sonarcloud.properties` file is present but the scanning workflow is not yet active in CI
2. **Security-specific ADR** — create a dedicated Architecture Decision Record documenting the security architecture, threat model, and trust boundaries of FrontX as a framework
3. **OWASP dependency checking** — supplement `npm audit` with [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/) or [Socket.dev](https://socket.dev/) for deeper supply-chain analysis including typosquatting detection and behavioral analysis
4. **MFE sandboxing limits documentation** — create developer-facing documentation explicitly stating what blob URL isolation does and does not protect against, with guidance for high-security deployments (e.g., iframe-based isolation for untrusted MFE code)
5. **Authentication patterns guide** — document recommended token storage strategies (httpOnly cookies vs. in-memory vs. localStorage) with security trade-offs for each approach
6. **CSP header template** — provide a ready-to-use CSP configuration in the CLI scaffolding for new projects, with blob URL allowances pre-configured
7. **Dependency update SLA** — establish a security patch policy with defined response times for critical (24h), high (72h), and medium (1 week) severity advisories
8. **SBOM generation** — add Software Bill of Materials generation to CI for supply-chain transparency, following [CycloneDX](https://cyclonedx.org/) or [SPDX](https://spdx.dev/) standards
9. **Subresource Integrity (SRI)** — implement SRI hash generation for MFE bundles to detect tampering between build and runtime loading
10. **Security testing category** — add explicit security-focused test scenarios (XSS injection attempts, CSRF token validation, malicious MFE behavior) to the test suite

---

*This document is maintained alongside the codebase. For the overall system design, see [`architecture/DESIGN.md`](../../architecture/DESIGN.md). For architecture decisions, see [`architecture/ADR/`](../../architecture/ADR/). For the companion backend security document, see [gears-rust/docs/security/SECURITY.md](https://github.com/constructorfabric/gears-rust/blob/main/docs/security/SECURITY.md).*
