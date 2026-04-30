# Technical Design — FrontX Dev Kit

<!-- artifact-version: 1.4 -->

<!-- toc -->

- [1. Architecture Overview](#1-architecture-overview)
  - [1.1 Architectural Vision](#11-architectural-vision)
  - [1.2 Architecture Drivers](#12-architecture-drivers)
  - [1.3 Architecture Layers](#13-architecture-layers)
- [2. Principles & Constraints](#2-principles--constraints)
  - [2.1 Design Principles](#21-design-principles)
  - [2.2 Constraints](#22-constraints)
- [3. Technical Architecture](#3-technical-architecture)
  - [3.1 Domain Model](#31-domain-model)
  - [3.2 Component Model](#32-component-model)
  - [3.3 API Contracts](#33-api-contracts)
  - [3.4 Internal Dependencies](#34-internal-dependencies)
  - [3.5 External Dependencies](#35-external-dependencies)
  - [3.6 Interactions & Sequences](#36-interactions--sequences)
  - [3.7 Database schemas & tables](#37-database-schemas--tables)
- [3.8 Publishing Pipeline Architecture](#38-publishing-pipeline-architecture)
- [4. Additional context](#4-additional-context)
  - [4.5 Security Considerations](#45-security-considerations)
  - [4.6 Error Handling Strategy](#46-error-handling-strategy)
  - [4.7 API Evolution](#47-api-evolution)
  - [4.7b Documentation Strategy](#47b-documentation-strategy)
  - [4.8 Known Limitations](#48-known-limitations)
  - [4.9 Non-Applicable Domains](#49-non-applicable-domains)
- [5. Traceability](#5-traceability)

<!-- /toc -->

## 1. Architecture Overview

### 1.1 Architectural Vision

FrontX is a four-layer monorepo architecture that separates concerns vertically by abstraction level and horizontally by domain. The lowest layer (L1 SDK) provides framework-agnostic primitives for state, API communication, localization, and screen-set contracts. The middle layer (L2 Framework) composes these primitives through a plugin system. The upper layer (L3 React) binds the framework to React 19. Standalone packages (`@cyberfabric/studio`, `@cyberfabric/cli`) operate outside the layer hierarchy with minimal coupling, while UI implementation remains app-owned.

This layering enforces a strict dependency direction: higher layers depend on lower layers, never the reverse. L1 packages have zero cross-dependencies, meaning any SDK package can be used in isolation — in a Node.js CLI, a web worker, or a non-React rendering engine. The plugin architecture at L2 means the framework never needs modification to add capabilities; all extensions compose through `createHAI3().use(plugin).build()`.

The architecture is event-driven throughout. Components communicate exclusively through a typed event bus. The data flow follows a fixed sequence — Action → Event → Effect → Reducer → Store — enforced by convention and tooling. This eliminates ad-hoc state mutations, makes the system traceable, and enables microfrontend isolation where each MFE has its own internal data flow that connects to the host only through declared shared properties and events.

### 1.2 Architecture Drivers

Requirements that significantly influence architecture decisions.

**ADRs**:
`cpt-frontx-adr-four-layer-sdk-architecture`,
`cpt-frontx-adr-event-driven-flux-dataflow`,
`cpt-frontx-adr-plugin-based-framework-composition`,
`cpt-frontx-adr-blob-url-mfe-isolation`,
`cpt-frontx-adr-esm-first-module-format`,
`cpt-frontx-adr-screenset-vertical-slice-isolation`,
`cpt-frontx-adr-mandatory-screen-lazy-loading`,
`cpt-frontx-adr-hybrid-namespace-localization`,
`cpt-frontx-adr-standalone-studio-dev-conditional`,
`cpt-frontx-adr-protocol-separated-api-architecture`,
`cpt-frontx-adr-react-19-ref-as-prop`,
`cpt-frontx-adr-automated-layer-ordered-publishing`,
`cpt-frontx-adr-symbol-based-mock-plugin-identification`,
`cpt-frontx-adr-global-shared-property-broadcast`,
`cpt-frontx-adr-cli-template-based-code-generation`,
`cpt-frontx-adr-two-tier-cli-e2e-verification`,
`cpt-frontx-adr-channel-aware-version-locking`,
`cpt-frontx-adr-per-action-type-handler-routing`,
`cpt-frontx-adr-tanstack-query-data-management`,
`cpt-frontx-adr-mf2-manifest-discovery`,
`cpt-frontx-adr-mfe-state-lifecycle-boundary`,
`cpt-frontx-adr-domain-implementation-mount-strategies`

#### Functional Drivers

| Requirement | Design Response |
|-------------|------------------|
| `cpt-frontx-fr-sdk-flat-packages` | Four separate L1 packages with independent `package.json`; npm workspaces for monorepo orchestration |
| `cpt-frontx-fr-sdk-layer-deps` | Strict layer dependency graph enforced by `dependency-cruiser` rules: L3→L2→L1 only |
| `cpt-frontx-fr-sdk-plugin-arch` | `createHAI3()` builder at L2 with `use()` chaining; each plugin receives `HAI3PluginContext` |
| `cpt-frontx-fr-sdk-action-pattern` | All mutations flow through `createAction()` → eventBus dispatch → effect handler → Redux reducer |
| `cpt-frontx-fr-mfe-dynamic-registration` | Runtime MFE registration via `mfeRegistryFactory.build()` with handler injection |
| `cpt-frontx-fr-blob-fresh-eval` | Blob URL isolation: each MFE bundle fetched, rewritten, and evaluated in a fresh blob context |
| `cpt-frontx-fr-blob-import-rewriting` | Import specifiers in MFE bundles rewritten to blob URLs via `importRewriter` before evaluation; `import.meta.url` references rewritten to the real base URL |
| `cpt-frontx-fr-dataflow-no-redux` | MFEs use internal `useReducer`/`useState`; no access to host Redux store |
| `cpt-frontx-fr-broadcast-write-api` | Shared properties bridge host↔MFE via `setSharedProperty()`/`useSharedProperty()` |
| `cpt-frontx-fr-appconfig-event-api` | Application-level config changes propagated via `app/*` events, not direct store mutations |
| `cpt-frontx-fr-sse-protocol` | `@cyberfabric/api` abstracts REST and SSE behind `createApiService()` with protocol-specific adapters |
| `cpt-frontx-fr-i18n-lazy-chunks` | Namespace-based lazy loading: translation chunks loaded on demand per screen-set |
| `cpt-frontx-fr-externalize-transform` | `@module-federation/vite` configured with `shared:{}` and `rollupOptions.external` to externalize all declared shared dependencies (both `@cyberfabric/*` and third-party packages like `react`, `react-dom`); `frontx-mf-gts` plugin builds standalone ESM modules for each shared dep via esbuild and enriches `mfe.json` in-place with per-dep `chunkPath`/`version`/`unwrapKey`; handler constructs per-load shared dep blob URLs with bare specifier rewriting at runtime |
| `cpt-frontx-fr-mfe-plugin` | `microfrontends()` plugin integrates MFE lifecycle, theme propagation, i18n, and shared property bridging into framework |
| `cpt-frontx-fr-mock-toggle` | `mock()` plugin with `toggleMockMode` action enabling runtime switch between real and mock API responses |
| `cpt-frontx-fr-sdk-state-interface` | `@cyberfabric/state` exports EventBus, `createStore`, slice management APIs, and all associated types |
| `cpt-frontx-fr-sdk-flux-terminology` | FrontX Flux terms (Action, Event, Effect, Reducer, Slice) used consistently; Redux terms excluded from public API |
| `cpt-frontx-fr-sdk-screensets-package` | `@cyberfabric/screensets` exports full MFE type system, registry, handler, bridge, and constants with zero `@cyberfabric/*` deps |
| `cpt-frontx-fr-sdk-api-package` | `@cyberfabric/api` exports `BaseApiService`, REST/SSE protocols, mock plugins, `apiRegistry`, and type guards; only `axios` as peer dep |
| `cpt-frontx-fr-sdk-i18n-package` | `@cyberfabric/i18n` exports I18nRegistry, Language enum, formatters, and metadata utilities with zero dependencies |
| `cpt-frontx-fr-sdk-framework-layer` | `@cyberfabric/framework` wires SDK capabilities; depends only on SDK packages, provides `createHAI3()` and `createHAI3App()` |
| `cpt-frontx-fr-sdk-react-layer` | `@cyberfabric/react` depends only on `@cyberfabric/framework`; provides `HAI3Provider` and typed hooks; no layout components |
| `cpt-frontx-fr-sdk-module-augmentation` | TypeScript module augmentation for `EventPayloadMap` and `RootState` extensibility; custom events type-safe |
| `cpt-frontx-fr-appconfig-tenant` | `Tenant` type with `{ id: string }`; tenant change events via event bus (`app/tenant/changed`, `app/tenant/cleared`) |
| `cpt-frontx-fr-appconfig-router-config` | `HAI3Config.routerMode` supporting `'browser'`, `'hash'`, `'memory'` routing strategies |
| `cpt-frontx-fr-appconfig-layout-visibility` | Imperative actions (`setFooterVisible`, `setMenuVisible`, `setSidebarVisible`) control layout region visibility |
| `cpt-frontx-fr-sse-mock-mode` | `SseMockPlugin` short-circuits `EventSource` creation; returns `MockEventSource` for dev/test environments |
| `cpt-frontx-fr-sse-protocol-registry` | `BaseApiService` uses protocol registry; protocols registered by constructor name via type-safe `protocol<T>()` |
| `cpt-frontx-fr-sse-type-safe-events` | SSE events typed via `EventPayloadMap` module augmentation for compile-time safety |
| `cpt-frontx-fr-sse-stream-descriptors` | `SseStreamProtocol.stream<TEvent>()` returns `StreamDescriptor` with `connect`/`disconnect`; `useApiStream` hook manages lifecycle |
| `cpt-frontx-fr-mfe-entry-types` | `MfeEntry`, `MfeEntryMF`, `Extension`, `ScreenExtension` types define MFE communication contracts |
| `cpt-frontx-fr-mfe-ext-domain` | `ExtensionDomain` type defines id, sharedProperties, actions, extensionsActions, defaultActionTimeout, lifecycleStages, extensionsLifecycleStages, and optional extensionsTypeId |
| `cpt-frontx-fr-mfe-shared-property` | `SharedProperty` type with `id: string` and `value: unknown`; constants are GTS type IDs |
| `cpt-frontx-fr-mfe-action-types` | `Action` and `ActionsChain` types enable chain-based MFE action execution with fallback support; action `type` values are GTS schema type IDs (trailing `~`); extension references in payloads use `subject` field |
| `cpt-frontx-fr-mfe-theme-propagation` | `themes()` plugin propagates theme changes to all MFE extensions via `mfeRegistry.updateSharedProperty()` |
| `cpt-frontx-fr-mfe-i18n-propagation` | `i18n()` plugin propagates language changes to all MFE extensions via `mfeRegistry.updateSharedProperty()` |
| `cpt-frontx-fr-blob-no-revoke` | Blob URLs kept alive for page lifetime; `URL.revokeObjectURL()` never called after `import()` resolves — top-level-await correctness invariant of the loader |
| `cpt-frontx-fr-mfe-author-state-lifecycle` | MFE entry constructs per-mount state in `mount()` and disposes it in `unmount()`; module-scope state survives across mount cycles within a single load (host owns module-scope lifetime, author owns instance-scope lifetime) |
| `cpt-frontx-fr-blob-source-cache` | In-memory cache of fetched source text keyed by chunk URL; at most one network fetch per chunk across all loads |
| `cpt-frontx-fr-blob-recursive-chain` | MFE handler recursively creates blob URLs for chunk and all static dependencies |
| `cpt-frontx-fr-blob-per-load-map` | Blob URL mapping scoped per MFE load; different loads have independent instances preventing cross-load reuse |
| `cpt-frontx-fr-externalize-filenames` | Shared dependency standalone ESM files use deterministic filenames without content hashes for stable MFE manifests |
| `cpt-frontx-fr-externalize-build-only` | `rollupOptions.external` externalizes shared dependencies at `vite build` only; during `vite dev`, imports resolve through standard Vite dev server resolution; `frontx-mf-gts` plugin builds standalone ESMs only in the `closeBundle` production hook |
| `cpt-frontx-fr-dataflow-internal-app` | Each MFE creates isolated `HAI3App` via `createHAI3().use(effects()).use(queryCacheShared()).use(mock()).build()` with `HAI3Provider` (shared QueryClient owned by host) |
| `cpt-frontx-fr-sharescope-construction` | `MfeHandlerMF` fetches standalone ESM source text for each shared dep (deduplicated via `sharedDepTextCache` keyed by `name@version` across all runtimes), rewrites bare specifiers between shared deps to blob URLs, and creates per-load blob URLs for isolation; no `createInstance()`, no `FederationHost`, no `__mf_init__` globals, no `globalThis.__federation_shared__` |
| `cpt-frontx-fr-sharescope-concurrent` | Each load creates independent shared dep blob URLs captured by its own `LoadBlobState`; `sharedDepTextCache` deduplicates source text (keyed by `name@version`); per-load blob URLs ensure concurrent loads get isolated module evaluations with no cross-load reuse |
| `cpt-frontx-fr-broadcast-matching` | `updateSharedProperty()` propagates only to domains declaring the property in their `sharedProperties` array |
| `cpt-frontx-fr-broadcast-validate` | GTS validation occurs before propagation; invalid values never stored or broadcast to any domain |
| `cpt-frontx-fr-validation-gts` | `typeSystem.register()` validates shared property values against their GTS schema in a single call and throws with a rich diagnostic (instance JSON, resolved schema JSON, failure reason) on non-conformance |
| `cpt-frontx-fr-validation-reject` | `updateSharedProperty()` throws with validation details on failure; value not stored or propagated |
| `cpt-frontx-fr-i18n-formatters` | Locale-aware formatters (`formatDate`, `formatNumber`, `formatCurrency`, etc.) using `Intl.*` APIs |
| `cpt-frontx-fr-i18n-formatter-exports` | Formatters exported from `@cyberfabric/i18n`, re-exported from `@cyberfabric/framework`, accessible via `useFormatters()` |
| `cpt-frontx-fr-i18n-graceful-invalid` | All formatters return `''` for null, undefined, or invalid inputs; never throw |
| `cpt-frontx-fr-i18n-hybrid-namespace` | Two-tier namespaces: `screenset.<id>` for shared content, `screen.<setId>.<screenId>` for screen-specific |
| `cpt-frontx-fr-studio-panel` | `StudioPanel` floating overlay: draggable, resizable, collapsible; visible only in dev mode; state in localStorage |
| `cpt-frontx-fr-studio-controls` | StudioPanel provides: theme selector, MFE package selector, language selector, mock/real API toggle |
| `cpt-frontx-fr-studio-persistence` | Theme, language, mock API state, GTS package persisted to localStorage; restored on Studio mount |
| `cpt-frontx-fr-studio-viewport` | Studio button and panel clamped to viewport (20px margin) on load and window resize |
| `cpt-frontx-fr-studio-independence` | `@cyberfabric/studio` standalone package; `"sideEffects": false`; excluded from production via `import.meta.env.DEV` |
| `cpt-frontx-fr-cli-package` | `@cyberfabric/cli` workspace package with binary `frontx`; ESM (Node 18+) and programmatic API |
| `cpt-frontx-fr-cli-commands` | CLI commands: create, update, scaffold layout/screenset, validate components, ai sync, migrate. `frontx validate components` is structural only and does not run the unit-test suite by default. `frontx create` scaffolds the standard Vitest workflow by default, and code-generation commands emit starter unit tests when a stable template exists |
| `cpt-frontx-fr-cli-templates` | Template system with `copy-templates.ts` build script, `manifest.json`; templates are user-owned and include test assets plus editable project-level testing guidance for generated apps and screensets |
| `cpt-frontx-fr-cli-skills` | CLI build generates IDE guidance files and command adapters for Claude, Cursor, Windsurf, and GitHub Copilot. Generated AI guidance routes agents to project testing guidance and the standard unit-test workflow under tiered triggers, and clarifies that `frontx validate components` does not run unit tests by default |
| `cpt-frontx-fr-cli-e2e-verification` | Two-tier CI verification: required PR workflow (`cli-pr-e2e`) validates the critical scaffold path, including install, build, type-check, and the standard unit-test workflow; nightly workflow covers broader scenarios; shared scripted harness with artifact upload |
| `cpt-frontx-fr-ai-agent-integration` | Generated project AI context carries machine-readable FrontX guidance plus project-level testing guidance so agents know when to add or update unit tests, run the standard unit-test command as a separate step from `frontx validate components` when tiered triggers apply, and run `type-check` and `arch:check` after applicable tests |
| `cpt-frontx-fr-pub-metadata` | All `@cyberfabric/*` packages include complete NPM metadata: author, license, repository, engines, exports |
| `cpt-frontx-fr-pub-versions` | All `@cyberfabric/*` packages use aligned (same) version numbers |
| `cpt-frontx-fr-pub-esm` | ESM-first module format: `"type": "module"`, dual exports (ESM + CJS), TypeScript declarations |
| `cpt-frontx-fr-pub-ci` | CI auto-publishes affected packages to NPM in layer order on version change merge; stops on first failure |
| `cpt-frontx-fr-api-request-cancellation` | `RestProtocol` HTTP methods accept optional `AbortSignal` via `RestRequestOptions`; aborted requests bypass `onError` plugin chain |
| `cpt-frontx-fr-api-endpoint-descriptors` | `BaseApiService` exposes registered protocols via `protocol()`. `RestEndpointProtocol` provides `query()`, `queryWith()`, `mutation()`, and `SseStreamProtocol` provides `stream()` returning descriptor objects; cache keys derive from `[baseURL, 'GET', path]` for static reads, `[baseURL, 'GET', resolvedPath, params]` for parameterized reads, `[baseURL, method, path]` for writes, and `[baseURL, 'SSE', path]` for streams |
| `cpt-frontx-fr-framework-query-cache-plugin` | `queryCache(config?)` owns the host shared `QueryClient`; `queryCacheShared()` joins it for child apps; cache clears on mock toggle, handles `cache/invalidate`/`cache/set`/`cache/remove`, and keeps `sharedFetchCache` in sync |
| `cpt-frontx-fr-react-query-hooks` | `useApiQuery`, `useApiMutation`, `useApiStream`, `useQueryCache` hooks consume descriptors; HAI3-owned result types; no `queryOptions` re-export |
| `cpt-frontx-fr-react-query-client-sharing` | `HAI3Provider` resolves the shared `QueryClient` from the app instance; separately mounted MFEs receive the same host client through `queryCache()` / `queryCacheShared()` shared-client reuse rather than L1 token plumbing, and expose only the restricted `QueryCache` interface |
| `cpt-frontx-fr-manifest-generation-script` | Generation script is a temporary static aggregator that produces pointers to `mfe.json` files with `--base-url` for environment-specific `publicPath`; `mfe.json` is already enriched in-place by the `frontx-mf-gts` plugin (manifest metadata, shared dep info, expose assets); when a backend API is ready, the static import is replaced with a fetch call — same `mfe.json` shape, different transport |

#### NFR Allocation

| NFR ID | NFR Summary | Allocated To | Design Response | Verification Approach |
|--------|-------------|--------------|-----------------|----------------------|
| `cpt-frontx-nfr-perf-lazy-loading` | Screensets and MFE code loaded on demand | `cpt-frontx-component-screensets`, `cpt-frontx-component-framework` | Dynamic `import()` per screen-set; MFE bundles fetched at registration time | Bundle analysis; network waterfall in DevTools |
| `cpt-frontx-nfr-perf-treeshake` | Unused SDK exports eliminated at build | `cpt-frontx-component-state`, all L1 packages | ESM-only output via tsup; no side-effect barrel files | `knip` unused-export detection in CI |
| `cpt-frontx-nfr-perf-blob-overhead` | Blob URL creation < 50ms for typical MFE | `cpt-frontx-component-screensets` | Source text cached after first fetch; import rewriting operates on string, not AST | Performance benchmark in test suite |
| `cpt-frontx-nfr-perf-action-timeout` | Actions complete or timeout within defined bounds | `cpt-frontx-component-state` | Effect handlers responsible for timeout; framework does not enforce global timeout | Unit tests with async action scenarios |
| `cpt-frontx-nfr-rel-error-handling` | Plugin/MFE errors do not crash host | `cpt-frontx-component-framework`, `cpt-frontx-component-react` | React error boundaries per MFE; plugin `init()` failures logged, not thrown | Integration tests with failing plugins |
| `cpt-frontx-nfr-rel-api-retry` | API calls support retry with backoff | `cpt-frontx-component-api` | Axios interceptor layer; retry configuration per service instance | Unit tests with mock server |
| `cpt-frontx-nfr-rel-serialization` | State serializable for persistence/debugging | `cpt-frontx-component-state` | Redux Toolkit enforces serializable state by default; custom middleware logs violations | Redux DevTools inspection |
| `cpt-frontx-nfr-sec-shadow-dom` | MFE CSS isolated from host | `cpt-frontx-component-react` | Shadow DOM wrapper for MFE render containers | Visual regression tests |
| `cpt-frontx-nfr-sec-csp-blob` | Blob URLs compatible with CSP policies | `cpt-frontx-component-screensets` | `blob:` scheme added to `script-src`; no `eval()` or `new Function()` used | CSP violation reporting in staging |
| `cpt-frontx-nfr-sec-type-validation` | Shared properties and actions validated at boundary | `cpt-frontx-component-framework` | GTS plugin validates shared property values against declared schemas; actions validated as anonymous instances (no `id`, schema resolved from `type` field) | Unit tests with invalid payloads and malformed actions |
| `cpt-frontx-nfr-compat-node` | Packages installable on Node ≥ 18 | All packages | `engines` field in each `package.json`; CI matrix tests Node 18/20/22 | CI build matrix |
| `cpt-frontx-nfr-compat-typescript` | TypeScript ≥ 5.5 | All packages | `tsconfig.json` targets ES2022; strict mode enabled | CI type-check step |
| `cpt-frontx-nfr-compat-esm` | ESM-first output | All packages | tsup configured with `format: ['esm']`; `"type": "module"` in `package.json` | Import resolution tests |
| `cpt-frontx-nfr-compat-react` | Compatible with React 19 | `cpt-frontx-component-react` | React 19 as peer dependency; `ref` as prop (no `forwardRef`) | CI tests against React 19 |
| `cpt-frontx-nfr-maint-zero-crossdeps` | L1 packages have zero cross-dependencies | All L1 packages | Each L1 `package.json` lists no `@cyberfabric/*` dependencies; `dependency-cruiser` rule blocks violations | CI dependency-cruiser check |
| `cpt-frontx-nfr-maint-event-driven` | Cross-domain communication via events only | `cpt-frontx-component-state`, `cpt-frontx-component-framework` | `eventBus` is the sole cross-domain channel; no direct store imports across domains | Architecture lint rules |
| `cpt-frontx-nfr-maint-arch-enforcement` | Layer violations detected automatically | Build system, `cpt-frontx-component-cli` | `dependency-cruiser` config with forbidden dependency rules and `knip` for unused exports remain the hard architecture gates; generated AI guidance keeps `arch:check` in the default verification loop after applicable standard unit-test runs pass | CI gate on lint failure; scaffolded workflow verification in CLI CI |

### 1.3 Architecture Layers

- [x] `p1` - **ID**: `cpt-frontx-tech-layer-architecture`

```
┌─────────────────────────────────────────────────────┐
│                    Application                       │
│          (Host app using @cyberfabric/* packages)           │
├─────────────────────────────────────────────────────┤
│ L3  @cyberfabric/react                                      │
│     HAI3Provider · hooks · MFE components            │
├─────────────────────────────────────────────────────┤
│ L2  @cyberfabric/framework                                  │
│     createHAI3() · plugins · layout slices           │
├────────┬────────┬──────────┬────────────────────────┤
│ L1     │ L1     │ L1       │ L1                      │
│ state  │ screen │ api      │ i18n                    │
│        │ sets   │          │                         │
├────────┴────────┴──────────┴────────────────────────┤
│ Standalone: @cyberfabric/studio · @cyberfabric/cli                            │
└─────────────────────────────────────────────────────┘
```

| Layer | Responsibility | Technology |
|-------|---------------|------------|
| L1 SDK | Framework-agnostic primitives: state management, screen-set contracts, API protocols, i18n infrastructure | TypeScript, Redux Toolkit, Axios, i18next |
| L2 Framework | Plugin composition, layout orchestration, configuration management, re-exports SDK surface | TypeScript, Redux Toolkit (slices) |
| L3 React | React bindings, provider tree, hooks, MFE rendering components | React 19, Shadow DOM |
| Standalone — Studio | Development overlay for theme/i18n/state inspection | React 19, localStorage |
| Tooling — CLI | Scaffolding, code generation, AI skill integration | Node.js, Commander |

**Build order**: SDK (L1) → Framework (L2) → React (L3) → Studio → CLI (`npm run build:packages`)

**MFE package build pipeline**: `vite build` with `@module-federation/vite` (`shared: {}`, `rollupOptions.external`; produces chunks + `mf-manifest.json`) → `frontx-mf-gts` plugin `closeBundle` (reads `mf-manifest.json` and `mfe.json`; builds standalone ESM modules for shared deps into `dist/shared/`; enriches `mfe.json` in-place with `manifest.metaData`, `manifest.shared[]` with per-dep `chunkPath`/`version`/`unwrapKey`, and `entries[].exposeAssets`) → generation script with `--base-url` (aggregates pointers to enriched `mfe.json` files, writes `generated-mfe-manifests.json`) → host dev server / deployment. The generation script is a temporary aggregator — it will be replaced by a backend API returning the same `mfe.json` content. `mf-manifest.json` does not leave the build stage; enriched `mfe.json` is the complete self-contained contract per MFE.

## 2. Principles & Constraints

### 2.1 Design Principles

#### Event-Driven Architecture

- [x] `p1` - **ID**: `cpt-frontx-principle-event-driven-architecture`

**ADRs**: `cpt-frontx-adr-event-driven-flux-dataflow`

All cross-domain communication flows through a typed event bus (`eventBus` in `@cyberfabric/state`). No component may directly call methods on or import internal state from another domain. This ensures loose coupling, enables replay/debugging of all system interactions, and allows MFE extensions to participate in host events without tight integration.

The event bus uses a publish/subscribe model with typed event names and payloads. Framework plugins subscribe to events during initialization. Effects listen for specific events and dispatch state changes through reducers.

#### Layer Isolation

- [x] `p1` - **ID**: `cpt-frontx-principle-layer-isolation`

**ADRs**: `cpt-frontx-adr-four-layer-sdk-architecture`

Dependencies flow strictly downward: L3 → L2 → L1. No upward or lateral dependencies are permitted within the layer hierarchy. L1 packages have zero `@cyberfabric/*` dependencies. L2 depends only on L1 packages. L3 depends only on L2 (which re-exports L1 surface). This enables each layer to be tested, built, and versioned independently.

Standalone packages (`@cyberfabric/studio`, `@cyberfabric/cli`) exist outside the layer hierarchy and do not depend on framework or SDK packages, ensuring they can evolve independently. UI components are generated into or authored within application code rather than shipped as a shared workspace package.

#### Plugin-First Composition

- [x] `p1` - **ID**: `cpt-frontx-principle-plugin-first-composition`

**ADRs**: `cpt-frontx-adr-plugin-based-framework-composition`

All framework capabilities are delivered through plugins. The framework core (`createHAI3()`) is a minimal builder that assembles a plugin chain. Each plugin implements the `HAI3Plugin` interface with an `init(context: HAI3PluginContext)` method. Plugins register slices, effects, event listeners, and UI extensions through the context object.

The host application composes its feature set by chaining `.use()` calls: `createHAI3().use(microfrontends()).use(myDomainPlugin()).build()`. No framework source code needs modification to add capabilities.

#### Self-Registering Registries

- [x] `p2` - **ID**: `cpt-frontx-principle-self-registering-registries`

Registries (screensets, themes, API services, routes, i18n namespaces) populate themselves at import time through side-effect registrations. Consumers never edit a central registry file to add entries. Each screen-set, component, or service registers itself in its own module. The registry root file only provides the registry factory/accessor — it never contains an item list.

This eliminates merge conflicts on registry files and enables tree-shaking of unused registrations.

#### Action → Event → Effect → Reducer Flux

- [x] `p1` - **ID**: `cpt-frontx-principle-action-event-effect-reducer-flux`

**ADRs**: `cpt-frontx-adr-event-driven-flux-dataflow`

All state mutations follow a fixed sequence: (1) Component calls `createAction()`, (2) action dispatches an event via `eventBus`, (3) registered effects handle the event (API calls, validation, side effects), (4) effects dispatch Redux actions, (5) reducers produce new state. Components never dispatch Redux actions directly. This ensures every state change is traceable and debuggable.

The terminology follows Redux Toolkit conventions: slices, reducers, selectors, thunks — but wrapped in FrontX's action/event abstraction to enforce the data flow pattern.

#### MFE Isolation

- [x] `p1` - **ID**: `cpt-frontx-principle-mfe-isolation`

**ADRs**: `cpt-frontx-adr-blob-url-mfe-isolation`, `cpt-frontx-adr-mf2-manifest-discovery`

Microfrontend extensions execute in an isolated context. JavaScript isolation is achieved through blob URL evaluation: each MFE bundle is fetched, its import specifiers are rewritten to point to blob URLs of shared dependencies, and the rewritten bundle is evaluated in a new module scope. CSS isolation uses Shadow DOM containers. MFEs have no access to the host Redux store; they communicate with the host exclusively through shared properties and the event bus.

### 2.2 Constraints

#### No React Below L3

- [x] `p1` - **ID**: `cpt-frontx-constraint-no-react-below-l3`

**ADRs**: `cpt-frontx-adr-four-layer-sdk-architecture`

L1 SDK and L2 Framework packages SHALL NOT import React or any React-specific APIs. This ensures the SDK and framework are usable in non-React environments (Node.js scripts, web workers, alternative renderers). React appears only in L3 (`@cyberfabric/react`) and standalone packages (`@cyberfabric/studio`).

**Enforcement**: `dependency-cruiser` rules flag any `react` import in `packages/state/`, `packages/screensets/`, `packages/api/`, `packages/i18n/`, or `packages/framework/`.

#### Zero Cross-Dependencies at L1

- [x] `p1` - **ID**: `cpt-frontx-constraint-zero-cross-deps-at-l1`

**ADRs**: `cpt-frontx-adr-four-layer-sdk-architecture`

No L1 SDK package may depend on another L1 SDK package. `@cyberfabric/state` SHALL NOT import from `@cyberfabric/api`, `@cyberfabric/i18n`, or `@cyberfabric/screensets`, and vice versa. This keeps each SDK package independently deployable and prevents coupling between orthogonal concerns.

**Enforcement**: Each L1 `package.json` is verified in CI to contain zero `@cyberfabric/*` entries in `dependencies` or `devDependencies`.

#### No Package Internals Imports

- [x] `p2` - **ID**: `cpt-frontx-constraint-no-package-internals-imports`

Consumers SHALL NOT import from sub-paths of workspace packages (e.g., `@cyberfabric/state/src/eventBus`). All public API is exported through the package entry point. Internal module structure is an implementation detail that may change without notice.

**Enforcement**: ESLint rule + `dependency-cruiser` forbidden path pattern `@cyberfabric/*/src/*`.

#### No Barrel Exports for Registries

- [x] `p2` - **ID**: `cpt-frontx-constraint-no-barrel-exports-for-registries`

Registry root files SHALL NOT re-export individual registry items. Each registered item (screen-set, component, service) self-registers via side-effect import. The registry file provides only the factory, accessor, or type — never the item list. This prevents barrel files from defeating tree-shaking and eliminates merge conflicts on central export lists.

#### TypeScript Strict Mode

- [x] `p1` - **ID**: `cpt-frontx-constraint-typescript-strict-mode`

All packages compile with `"strict": true` in `tsconfig.json`. Use of `any`, `as unknown as`, or `@ts-ignore` is forbidden. Type safety is enforced at compile time across all layers. Module augmentation (`declare module`) is the approved mechanism for extending framework types from plugins.

**Enforcement**: CI type-check step with `tsc --noEmit`; ESLint `@typescript-eslint/no-explicit-any` rule.

#### ESM-First Module Format

- [x] `p1` - **ID**: `cpt-frontx-constraint-esm-first-module-format`

**ADRs**: `cpt-frontx-adr-esm-first-module-format`

All packages output ESM as the primary module format. `package.json` files include `"type": "module"` and `"exports"` field with ESM entry points. CJS is not supported. This ensures compatibility with modern bundlers, enables tree-shaking, and aligns with the platform direction of Node.js and browsers.

**Enforcement**: tsup build configuration with `format: ['esm']`; `package.json` validation in CI.

#### Dependency Licensing

- [x] `p2` - **ID**: `cpt-frontx-constraint-oss-licensing`

All direct runtime dependencies MUST use MIT, Apache-2.0, or BSD-compatible licenses. Copyleft licenses (GPL, AGPL) are prohibited for runtime dependencies.

## 3. Technical Architecture

### 3.1 Domain Model

**Technology**: TypeScript interfaces and types

**Core Entities**:

| Entity | Description | Location |
|--------|-------------|----------|
| ScreenSet | A named collection of screens registered at runtime; the primary unit of UI composition | `packages/screensets/src/types.ts` |
| Screen | A single view within a screen-set; may contain components and MFE slots | `packages/screensets/src/types.ts` |
| Component | A React UI element authored in app-owned UI folders such as `components/ui/` | Per-MFE/screenset or generated app source |
| Microfrontend | An externally-built UI bundle loaded at runtime via blob URL isolation | `packages/screensets/src/mfe/` |
| ExtensionDomain | GTS-validated declaration of a domain (id, sharedProperties, actions, lifecycleStages, etc.); behavior-free | `packages/screensets/src/types.ts` |
| ExtensionDomainImplementation | Abstract behavior class for a registered domain; the framework owns construction via a factory and supplies it with a per-registration context | `packages/screensets/src/mfe/runtime/` |
| ExtensionMounter | Per-domain abstract mount facade owned by the registry; provides the implementation with the primitives needed to drive mount and unmount transitions and to read the current mount-set | `packages/screensets/src/mfe/runtime/` |
| DomainContext | Construction-time bundle exposing the mount facade and per-action-type handler registration; the framework owns its lifetime so post-registration access is mechanically scoped | `packages/screensets/src/mfe/runtime/` |
| ContainerHooks | Implementation-supplied lifecycle for per-extension DOM containers, kept on the implementation side because container shape is domain-specific and outside the framework's responsibility | `packages/screensets/src/mfe/runtime/` |
| ConcurrentMountStrategy | Shipped strategy class for multi-mount domains (append-mount, no displacement) | `packages/screensets/src/mfe/runtime/` |
| OptionalMountStrategy | Shipped strategy class for 0-or-1 cardinality domains with explicit unmount | `packages/screensets/src/mfe/runtime/` |
| ExclusiveMountStrategy | Shipped strategy class for pre-emptive single-mount domains; declarations using this strategy must omit the unmount action | `packages/screensets/src/mfe/runtime/` |
| State (Store) | Redux Toolkit store composed from plugin-registered slices | `packages/state/src/store.ts` |
| Event | A typed message on the event bus; carries a name and payload | `packages/state/src/eventBus.ts` |
| Action | A domain operation that dispatches events; created via `createAction()` | `packages/state/src/actions.ts` |
| Effect | An event handler that performs side effects and dispatches reducers | `packages/state/src/effects.ts` |
| Plugin | A framework extension implementing `HAI3Plugin` interface | `packages/framework/src/plugin.ts` |
| SharedProperty | A typed value bridging host and MFE state; validated at boundaries | `packages/framework/src/sharedProperty.ts` |
| ProjectTestingConvention | Generated project contract that defines the canonical unit-test command and baseline Vitest scaffold expectations | Generated `package.json`, Vitest config, and CLI template metadata |
| ProjectTestingGuidance | Editable project AI guidance describing when generated code needs unit tests and how the standard workflow is executed | Generated `.ai/project/GUIDELINES.md` and `.ai/project/targets/UNIT_TESTING.md` |

**Relationships**:
- ScreenSet → Screen: contains one or more
- Screen → Component: renders zero or more
- Screen → Microfrontend: hosts zero or more as extension slots
- Plugin → State: registers slices and effects during init
- Plugin → Event: subscribes to and publishes events
- Microfrontend → SharedProperty: reads/writes declared shared values
- ProjectTestingConvention → ProjectTestingGuidance: standard test command and scaffold expectations are referenced by generated AI instructions
- Action → Event → Effect → State: fixed data flow sequence

### 3.2 Component Model

```
┌───────────────────────────────────────────────────────────┐
│                      Host Application                      │
│                                                           │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ @cyberfabric/  │  │  @cyberfabric/react │  │  app-owned UI        │ │
│  │ studio  │  │  HAI3Provider │  │  components          │ │
│  └─────────┘  │  hooks        │  └──────────────────────┘ │
│               │  ExtensionDomainSlot │                   │
│               └──────┬───────┘                            │
│                      │ depends on                         │
│               ┌──────▼───────┐                            │
│               │ @cyberfabric/       │                            │
│               │ framework    │                            │
│               │ createHAI3() │                            │
│               │ plugins      │                            │
│               └──┬──┬──┬──┬─┘                            │
│           depends│  │  │  │on                             │
│     ┌────────┬──┘  │  │  └──┬────────┐                   │
│     ▼        ▼     ▼  ▼     ▼        │                   │
│  ┌──────┐ ┌──────┐ ┌────┐ ┌─────┐   │                   │
│  │state │ │screen│ │api │ │i18n │   │                   │
│  │      │ │sets  │ │    │ │     │   │                   │
│  └──────┘ └──────┘ └────┘ └─────┘   │                   │
│    L1       L1       L1     L1       │                   │
│  (no cross-dependencies)      ┌──────▼─┐                 │
│                               │@cyberfabric/  │                 │
│                               │cli     │                 │
│                               └────────┘                 │
└───────────────────────────────────────────────────────────┘
```

#### @cyberfabric/state (L1)

- [x] `p1` - **ID**: `cpt-frontx-component-state`

##### Why this component exists

Provides the foundational state management and event infrastructure that all other packages build upon. Without a shared event bus and store abstraction, each package would implement its own state patterns, leading to fragmented debugging and untraceable data flow.

##### Responsibility scope

- **Event bus**: Typed publish/subscribe messaging (`eventBus.publish()`, `eventBus.subscribe()`) for all cross-domain communication
- **Store factory**: Creates and configures Redux Toolkit store with dynamically registered slices
- **Action factory**: `createAction()` produces typed action creators that dispatch events
- **Effect system**: Registers effect handlers that respond to events and produce state changes
- **Flux terminology**: Enforces Action → Event → Effect → Reducer naming and flow conventions
- **Module augmentation**: Supports `declare module '@cyberfabric/state'` for type-safe slice extensions

##### Responsibility boundaries

- Does NOT provide UI bindings (React hooks, components) — delegated to `cpt-frontx-component-react`
- Does NOT define domain-specific slices — each plugin registers its own slices
- Does NOT depend on any other `@cyberfabric/*` package
- Does NOT implement persistence or devtools — relies on Redux Toolkit's built-in middleware

##### Related components (by ID)

- `cpt-frontx-component-framework` — depends on: framework registers slices and effects via plugin context
- `cpt-frontx-component-react` — depends on: provides hooks (`useAppSelector`, `useAppDispatch`) over this store

#### @cyberfabric/screensets (L1)

- [x] `p1` - **ID**: `cpt-frontx-component-screensets`

##### Why this component exists

Defines the contract between the host application and microfrontend extensions. Manages the screen-set registry, MFE lifecycle, and blob URL isolation mechanism. Separating this from `@cyberfabric/state` keeps MFE concerns (loading, isolation, source caching) orthogonal to state management.

##### Responsibility scope

- **Screen-set registry**: `mfeRegistryFactory` for registering/querying screen-sets with handler injection
- **MFE type contracts**: Entry types (component, screen, extension), domain declarations, shared property schemas, action schema type definitions (GTS schema type IDs with trailing `~`; payloads use `subject` for extension references)
- **Domain implementation contract**: domain authors register an `ExtensionDomainImplementation` whose construction-time context (`DomainContext`) carries the framework primitives the implementation needs; the framework owns the lifetime of that context so post-registration access is mechanically scoped
- **Per-domain mount facade**: `ExtensionMounter` abstract class; the registry constructs one instance per registered domain and exposes it to the implementation through `DomainContext` for the duration of registration
- **Mount strategies**: the framework ships a small set of concrete strategy classes (concurrent, optional, exclusive). The choice of cardinality is made by the implementation when it picks a strategy — there is no framework heuristic over `domain.actions`
- **Mount-set query**: `ScreensetsRegistry.getMountedExtensions(domainId)` returns the current insertion-ordered set of mounted extension IDs for the domain (plural). The scalar `getMountedExtension` does not exist
- **Blob URL isolation**: Fetches MFE bundles, rewrites import specifiers to blob URLs, caches source text, manages per-load import maps
- **Import rewriting**: Transforms bare import specifiers for all declared shared dependencies (both `@cyberfabric/*` and third-party) in MFE bundles to blob URL references for runtime resolution
- **Recursive chain loading**: Resolves transitive dependencies by recursively blob-loading imported modules

##### Responsibility boundaries

- Does NOT render MFE content (React mounting) — delegated to `cpt-frontx-component-react`
- Does NOT manage theme or i18n propagation into MFEs — delegated to `cpt-frontx-component-framework`
- Does NOT depend on any other `@cyberfabric/*` package
- Does NOT handle CSS isolation (Shadow DOM) — delegated to rendering layer
- Does NOT know how containers are created, positioned, or styled — container lifecycle lives on the implementation side; the framework receives opaque `Element` references through the mounter and uses them as host elements only
- Does NOT expose `ContainerProvider`, `MountExtSwapHandler`, `MountExtToggleHandler`, or `MountManager` — `ContainerProvider` is removed; the framework-side mount handlers are replaced by the three strategy classes; `MountManager` becomes strictly internal behind `DefaultExtensionMounter`

##### Related components (by ID)

- `cpt-frontx-component-framework` — depends on: framework's `microfrontends()` plugin orchestrates MFE lifecycle using screensets API
- `cpt-frontx-component-react` — depends on: `ExtensionDomainSlot` mounts a singleton root for a domain via the implementation's structural opt-in; multi-mount children are managed imperatively under that root by the implementation's container hooks

#### @cyberfabric/api (L1)

- [x] `p1` - **ID**: `cpt-frontx-component-api`

##### Why this component exists

Provides a unified API service layer that abstracts protocol differences (REST, SSE) behind a consistent interface. Developers create services without coupling to a specific transport; the protocol adapter handles serialization, connection management, and error recovery.

##### Responsibility scope

- **Service factory**: `createApiService()` produces typed API service instances
- **Protocol registry**: Registers protocol adapters (REST via Axios, SSE via EventSource) that can be switched at runtime
- **REST adapter**: Standard HTTP operations with Axios; interceptors for auth, retry, error mapping
- **SSE adapter**: Server-Sent Events connection management with typed event streams
- **Stream descriptors**: `this.protocol(SseStreamProtocol).stream<TEvent>(path)` returns `StreamDescriptor` routing through `SseProtocol` plugin chain; consumed by `useApiStream` at L3
- **Mock mode**: `RestMockPlugin` and `SseMockPlugin` provide mock responses; `toggleMockMode` action switches at runtime
- **Type-safe events**: SSE event types are generic-parameterized for compile-time safety

##### Responsibility boundaries

- Does NOT define business-domain API endpoints — each domain plugin defines its own services
- Does NOT manage authentication tokens — relies on interceptors configured by the consumer
- Does NOT depend on any other `@cyberfabric/*` package
- Axios is a peer dependency, not bundled

##### Related components (by ID)

- `cpt-frontx-component-framework` — depends on: framework plugins use `createApiService()` to register domain APIs
- `cpt-frontx-component-state` — publishes to: API effects dispatch events on the event bus for state updates

#### @cyberfabric/i18n (L1)

- [x] `p1` - **ID**: `cpt-frontx-component-i18n`

##### Why this component exists

Provides internationalization infrastructure with support for 36 languages, locale-aware formatting, and namespace-based lazy loading. Centralizes i18n concerns so that screen-sets, MFEs, and host app share consistent translation patterns without monolithic language bundles.

##### Responsibility scope

- **Language support**: 36 built-in language configurations with locale metadata
- **Formatter exports**: Date, number, currency, relative-time formatters exported individually for tree-shaking
- **Namespace management**: Hybrid namespace model — global keys for shared translations, screen-set-scoped keys for domain-specific content
- **Lazy chunk loading**: Translation files loaded on demand per namespace; reduces initial bundle size
- **Graceful fallback**: Invalid format inputs return fallback strings rather than throwing

##### Responsibility boundaries

- Does NOT provide React hooks for translation — delegated to `cpt-frontx-component-react` (which wraps i18next React bindings)
- Does NOT contain translation content — only infrastructure; content provided by consuming applications
- Does NOT depend on any other `@cyberfabric/*` package

##### Related components (by ID)

- `cpt-frontx-component-framework` — depends on: framework initializes i18n and propagates language changes to MFEs
- `cpt-frontx-component-react` — depends on: provides `useTranslation()` hook wrapping i18n infrastructure

#### @cyberfabric/framework (L2)

- [x] `p1` - **ID**: `cpt-frontx-component-framework`

##### Why this component exists

Composes L1 SDK packages into a cohesive application framework through a plugin architecture. Without this layer, each application would need to manually wire state, API, i18n, and screensets together — a complex, error-prone process that would lead to inconsistent patterns across projects.

##### Responsibility scope

- **Builder API**: `createHAI3()` returns a builder with `.use(plugin)` chaining and `.build()` finalization
- **Plugin system**: `HAI3Plugin` interface with `init(context: HAI3PluginContext)`; context provides access to store, event bus, registries
- **Layout orchestration**: Layout slices (menu, header, footer, sidebars, overlay, popups) managed as Redux state
- **Configuration management**: `AppConfig` with tenant settings, router config, layout visibility, theme — propagated via `app/*` events
- **MFE lifecycle plugin**: `microfrontends()` plugin handles MFE registration, theme propagation, i18n forwarding, shared property bridge, and per-domain mount-state mirroring. The plugin's MFE slice tracks the per-domain set of currently mounted extensions and exposes a typed selector for it. The plugin's chain-completion sync wrapper reconciles the slice against the registry's mount-set after each lifecycle action chain by emitting per-extension state events. There is no scalar mount slot
- **Shared property system**: `setSharedProperty()` / `getSharedProperty()` with validation via GTS plugin
- **SDK re-exports**: Re-exports L1 public API so consumers can import from `@cyberfabric/framework` as a convenience

##### Responsibility boundaries

- Does NOT provide React components or hooks — delegated to `cpt-frontx-component-react`
- Does NOT define UI components — delegated to application/screenset local UI
- Does NOT implement blob URL isolation — uses `cpt-frontx-component-screensets` API
- Does NOT bundle L1 packages — re-exports only; each L1 remains independently installable

##### Related components (by ID)

- `cpt-frontx-component-state` — depends on: uses store, event bus, action/effect system
- `cpt-frontx-component-screensets` — depends on: uses registry factory and MFE contracts
- `cpt-frontx-component-api` — depends on: initializes API services and protocol adapters
- `cpt-frontx-component-i18n` — depends on: initializes i18n and manages language lifecycle
- `cpt-frontx-component-react` — depended on by: React layer consumes framework's builder output

#### @cyberfabric/react (L3)

- [x] `p1` - **ID**: `cpt-frontx-component-react`

##### Why this component exists

Bridges the framework layer to React 19, providing the provider tree, hooks, and MFE rendering components that application developers use directly. Separating React bindings into L3 allows the framework and SDK to remain framework-agnostic.

##### Responsibility scope

- **HAI3Provider**: Root provider component that wraps the application with Redux store, i18n context, theme, framework context, and an internal `QueryClientProvider` bridge. `HAI3Provider` does not create a TanStack client; `queryCache()` is the sole owner of the host shared `QueryClient`, while `queryCacheShared()` lets child apps join that client. The provider resolves the client from the app instance so every root reuses the plugin-owned cache, while `sharedFetchCache` deduplicates overlapping descriptor fetches across roots before React observers attach.
- **Hooks**: `useHAI3()` for the app instance; `useAppSelector()` / `useAppDispatch()` for typed Redux bindings; `useTranslation()`, `useScreenTranslations()`, `useFormatters()`, `useTheme()` for i18n and presentation; MFE hooks including `useMfeBridge`, `useSharedProperty`, `useHostAction`, `useDomainExtensions`, `useRegisteredPackages`, `useMountedExtensions` (per-domain mount-state subscription), and `useActivePackage` (screen-domain active package binding) — typed wrappers over framework primitives
- **Query hooks**: `useApiQuery()` for single-page declarative reads, `useApiSuspenseQuery()` for Suspense-driven single-page reads, `useApiInfiniteQuery()` for descriptor-driven paginated reads, `useApiSuspenseInfiniteQuery()` for Suspense-driven paginated reads, `useApiMutation()` for writes with optimistic updates via `QueryCache`, and `useQueryCache()` as the sanctioned imperative cache API. `QueryCache` exposes `get`, `getState`, `set`, `cancel`, `invalidate`, `invalidateMany`, and `remove`. The raw `QueryClient` stays internal, `useQueryClient` is NOT exported from `@cyberfabric/react`, and app/MFE code uses `QueryCache` rather than raw TanStack APIs.
- **Service descriptors**: Service descriptors are the only sanctioned source of query keys and cache metadata. `BaseApiService` descriptors feed `useApiQuery()`, `useApiMutation()`, and `QueryCache` directly, so per-domain query key factories and `queryOptions()` are no longer part of the public model.
- **MFE rendering**: `ExtensionDomainSlot` mounts a singleton root per domain and offers a structural opt-in for the implementation to receive the rooted element. The opt-in interface is owned by `@cyberfabric/react`, keeping the framework free of DOM references. Multi-mount layouts are managed by the implementation imperatively under that root. Host bootstrap registers domains/extensions/shared properties and returns screen extensions for route selection; the host screen container renders `ExtensionDomainSlot`, and MFE roots join the same `queryCache()`-owned host `QueryClient` via `queryCacheShared()` without leaking cache metadata into L1 contracts. MFEs still render inside Shadow DOM and do not inherit host React context directly.
- **Error boundaries**: Per-MFE error boundaries preventing extension failures from crashing the host
- **Initialization sequence**: Orchestrates `themeRegistry → mfeRegistryFactory.build() → domain registration → HAI3Provider`

##### Responsibility boundaries

- Does NOT define the store, event bus, or action system — uses `cpt-frontx-component-framework`
- Does NOT define UI component implementations — uses application/screenset local UI
- Does NOT manage MFE loading or blob URL creation — uses `cpt-frontx-component-screensets` via framework
- Does NOT own the caching library — declarative API contracts at L1 carry endpoint descriptors with transport metadata and cache hints; the `queryCache()` plugin (L2) owns the `QueryClient`; `@cyberfabric/react` (L3) maps descriptors to library-specific hooks.

##### Related components (by ID)

- `cpt-frontx-component-framework` — depends on: consumes builder output and plugin registrations
- `cpt-frontx-component-studio` — used by: studio panel renders inside the provider tree


##### Related components (by ID)

- `cpt-frontx-component-react` — used by: application renders UI within HAI3Provider
- `cpt-frontx-component-studio` — uses: studio panel uses local UI primitives for its controls

#### @cyberfabric/studio (Standalone)

- [x] `p1` - **ID**: `cpt-frontx-component-studio`

##### Why this component exists

Provides a development-time overlay for inspecting and tweaking theme, i18n, viewport, and state without leaving the running application. Accelerates the design iteration loop for screen-set authors.

##### Responsibility scope

- **Dev panel**: Toggleable overlay with sections for theme, i18n, state, and viewport inspection
- **Controls**: Theme switching, language selection, viewport size simulation
- **Persistence**: Panel state (open/closed, section visibility, preferences) stored in `localStorage`
- **Viewport simulation**: Responsive preview at configurable breakpoints
- **Build independence**: Excluded from production builds; no impact on production bundle

##### Responsibility boundaries

- Does NOT modify framework state directly — dispatches actions through the standard event flow
- Does NOT affect production builds — tree-shaken out when `process.env.NODE_ENV === 'production'`
- Minimal coupling: reads from store selectors, does not import framework internals

##### Related components (by ID)

- `cpt-frontx-component-react` — used by: renders inside HAI3Provider context

#### @cyberfabric/cli (Tooling)

- [x] `p2` - **ID**: `cpt-frontx-component-cli`

##### Why this component exists

Reduces boilerplate and enforces conventions by generating screen-sets, MFE packages, components, configuration, and testing baseline assets through interactive scaffolding commands. Integrates AI skills for assisted code generation and keeps the generated verification workflow consistent across projects.

##### Responsibility scope

- **Package**: Standalone npm package with `frontx` binary entry point
- **Commands**: `create` (project), `generate` (screen-set, MFE, component), `dev` (development server), `ai sync`, `update`, and validation/migration flows
- **Templates**: EJS-based templates for projects, screen-sets, MFE packages, components, `_blank-mfe`, and related guidance assets — each follows FrontX conventions
- **Test scaffolding**: `frontx create` emits Vitest config, `test`/`test:unit`/`test:unit:watch` scripts, starter tests, and `_blank-mfe` baseline tests; code generators add companion tests when a stable pattern exists
- **AI skills**: Embedded skill definitions and generated assistant guidance route agents to project testing guidance and require the standard unit-test workflow during development for touched generated code

##### Responsibility boundaries

- Does NOT depend on runtime `@cyberfabric/*` packages — generates code that imports them
- Does NOT run at application runtime — CLI tool only
- Does NOT execute app business logic — it generates project assets and verification contracts, then delegates runtime execution to scaffolded package-manager scripts, Vitest, and CI
- Does NOT manage build or deployment — delegates to Vite, package-manager scripts, and GitHub Actions

##### Related components (by ID)

- All packages — generates for: CLI templates produce code that imports from L1/L2/L3 packages

### 3.3 API Contracts

FrontX is a frontend framework; all API contracts are TypeScript interfaces consumed at build time. There are no REST/GraphQL server endpoints defined by FrontX itself.

> **Note**: Interface signatures below are structural summaries for architecture reference. The canonical source is the TypeScript source file listed in each `Location` field.

- [x] `p1` - **ID**: `cpt-frontx-interface-plugin`
- **Contract**: cpt-frontx-contract-hai3-plugin
- **Technology**: TypeScript interface
- **Location**: `packages/framework/src/plugin.ts`

```typescript
interface HAI3Plugin {
  name: string;
  init(context: HAI3PluginContext): void | Promise<void>;
}

interface HAI3PluginContext {
  store: HAI3Store;
  eventBus: EventBus;
  registerSlice(slice: Slice): void;
  registerEffect(effect: Effect): void;
}
```

- [x] `p1` - **ID**: `cpt-frontx-interface-event-bus`
- **Contract**: cpt-frontx-contract-event-bus
- **Technology**: TypeScript interface
- **Location**: `packages/state/src/eventBus.ts`

```typescript
interface EventBus {
  publish<T>(event: string, payload: T): void;
  subscribe<T>(event: string, handler: (payload: T) => void): Unsubscribe;
}
```

- [x] `p1` - **ID**: `cpt-frontx-interface-mfe-registry`
- **Contract**: cpt-frontx-contract-mfe-registry
- **Technology**: TypeScript abstract class
- **Location**: `packages/screensets/src/mfe/runtime/MfeRegistry.ts`

```typescript
abstract class MfeRegistry {
  abstract readonly typeSystem: TypeSystemPlugin;
  abstract registerDomain(domain: ExtensionDomain, containerProvider: ContainerProvider, options?: RegisterDomainOptions): void;
  abstract unregisterDomain(domainId: string): Promise<void>;
  abstract registerExtension(extension: Extension): Promise<void>;
  abstract unregisterExtension(extensionId: string): Promise<void>;
  abstract updateSharedProperty(propertyId: string, value: unknown): void;
  abstract getDomainProperty(domainId: string, propertyTypeId: string): unknown;
  abstract executeActionsChain(chain: ActionsChain): Promise<void>;
  abstract triggerLifecycleStage(extensionId: string, stageId: string): Promise<void>;
  abstract triggerDomainLifecycleStage(domainId: string, stageId: string): Promise<void>;
  abstract triggerDomainOwnLifecycleStage(domainId: string, stageId: string): Promise<void>;
  abstract getExtension(extensionId: string): Extension | undefined;
  abstract getDomain(domainId: string): ExtensionDomain | undefined;
  abstract getExtensionsForDomain(domainId: string): Extension[];
  abstract getMountedExtension(domainId: string): string | undefined;
  abstract getRegisteredPackages(): string[];
  abstract getExtensionsForPackage(packageId: string): Extension[];
  abstract getParentBridge(extensionId: string): ParentMfeBridge | null;
  abstract setTheme(cssVars: Record<string, string>): void;
  abstract dispose(): void;
}
```

- [x] `p1` - **ID**: `cpt-frontx-interface-api-service`
- **Contract**: cpt-frontx-contract-api-service
- **Technology**: TypeScript interface
- **Location**: `packages/api/src/service.ts`

```typescript
interface ApiService<T> {
  get(url: string, config?: RequestConfig): Promise<T>;
  post(url: string, data: unknown, config?: RequestConfig): Promise<T>;
  stream(url: string, config?: SseConfig): EventSource;
}
```

Stream descriptors extend the service interface to SSE:

```typescript
interface StreamDescriptor<TEvent> {
  readonly key: readonly unknown[];   // [baseURL, 'SSE', path]
  connect(onEvent: (event: TEvent) => void, onComplete?: () => void): Promise<string>;
  disconnect(connectionId: string): void;
}
```

Stream descriptors extend the service interface to SSE:

```typescript
interface StreamDescriptor<TEvent> {
  readonly key: readonly unknown[];   // [baseURL, 'SSE', path]
  connect(onEvent: (event: TEvent) => void, onComplete?: () => void): Promise<string>;
  disconnect(connectionId: string): void;
}
```

- [x] `p1` - **ID**: `cpt-frontx-interface-shared-property`
- **Contract**: cpt-frontx-contract-shared-property
- **Technology**: TypeScript interface
- **Location**: `packages/framework/src/sharedProperty.ts`

```typescript
interface SharedPropertyBridge {
  setSharedProperty(key: string, value: unknown): void;
  getSharedProperty<T>(key: string): T | undefined;
  onSharedPropertyChange<T>(key: string, handler: (value: T) => void): Unsubscribe;
}
```

- [ ] `p1` - **ID**: `cpt-frontx-interface-child-mfe-bridge`
- **Contract**: `cpt-frontx-interface-child-mfe-bridge`
- **Technology**: TypeScript abstract class
- **Location**: `packages/screensets/src/mfe/handler/types.ts`

```typescript
abstract class ChildMfeBridge {
  abstract readonly domainId: string;
  abstract readonly instanceId: string;
  abstract executeActionsChain(chain: ActionsChain): Promise<void>;
  abstract subscribeToProperty(propertyTypeId: string, callback: (value: SharedProperty) => void): () => void;
  abstract getProperty(propertyTypeId: string): SharedProperty | undefined;
  abstract registerActionHandler(actionTypeId: string, handler: ActionHandler): void;
}
```

- [ ] `p1` - **ID**: `cpt-frontx-interface-parent-mfe-bridge`
- **Contract**: `cpt-frontx-interface-parent-mfe-bridge`
- **Technology**: TypeScript abstract class
- **Location**: `packages/screensets/src/mfe/handler/types.ts`

```typescript
abstract class ParentMfeBridge {
  abstract readonly instanceId: string;
  abstract dispose(): void;
}
```

- [ ] `p1` - **ID**: `cpt-frontx-interface-action-handler`
- **Contract**: `cpt-frontx-interface-action-handler`
- **Technology**: TypeScript abstract class
- **Location**: `packages/screensets/src/mfe/mediator/types.ts`

```typescript
abstract class ActionHandler {
  abstract handleAction(actionTypeId: string, payload: Record<string, unknown> | undefined): Promise<void>;
}
```

`ActionHandler` is the single public handler contract for both domain-side and extension-side action routing. Consistent with every other public component in `@cyberfabric/screensets` (`MfeHandler`, `MfeBridgeFactory`, `RuntimeCoordinator`, `ChildMfeBridge`): it is an abstract class, not a function type. Consumers extend it to implement specific action type behavior. No `CustomActionHandler` callback type or `ActionHandlerFn` alias exists in the public API.

- [ ] `p1` - **ID**: `cpt-frontx-interface-actions-chains-mediator`
- **Contract**: `cpt-frontx-interface-actions-chains-mediator`
- **Technology**: TypeScript abstract class
- **Location**: `packages/screensets/src/mfe/mediator/actions-chains-mediator.ts`

```typescript
abstract class ActionsChainsMediator {
  abstract executeActionsChain(chain: ActionsChain): Promise<ActionChainResult>;
  abstract registerHandler(targetId: string, actionTypeId: string, handler: ActionHandler): void;
  abstract unregisterAllHandlers(targetId: string): void;
}
```

Handler storage uses a unified two-level map: `Map<targetId, Map<actionTypeId, ActionHandler>>`. A single `registerHandler(targetId, actionTypeId, handler)` covers both domain-side and extension-side registration. `unregisterAllHandlers(targetId)` removes the entire inner map entry, covering both bridge dispose and domain unregister. There is no `registerDomainHandler`, `registerExtensionHandler`, or `unregisterDomainHandler` on the abstract class.

**`registerDomain` signature** (per the domain-implementation-mount-strategies ADR):
```typescript
registerDomain(
  declaration: ExtensionDomain,
  factory: (ctx: DomainContext) => ExtensionDomainImplementation
): void

interface DomainContext {
  readonly mounter: ExtensionMounter;                            // accessor; throws after registration completes
  registerHandler(actionType: string, handler: ActionHandler): void; // throws after registration completes
}

abstract class ExtensionMounter {
  abstract mount(extensionId: string, container: Element): Promise<void>;
  abstract unmount(extensionId: string): Promise<void>;
  abstract getMounted(): readonly string[];
}

interface ContainerHooks {
  create(extensionId: string): Element;
  destroy(extensionId: string): void;
}
```

During `registerDomain()`, the registry: (1) GTS-validates the declaration via `typeSystem.register(declaration)`; (2) constructs a `DefaultExtensionMounter` for the domain; (3) builds a `DomainContext` exposing the mounter accessor and `registerHandler`; (4) invokes `factory(ctx)` synchronously — the implementation's constructor instantiates its strategy classes, capturing `ctx.mounter` privately, and pushes per-action-type `ActionHandler` instances via `ctx.registerHandler` for the lifecycle action types it intends to service; (5) in a `finally` block, invalidates `ctx` so subsequent `ctx.mounter` access throws and `ctx.registerHandler` rejects further registrations — strategy-captured references survive because they hold the mounter privately, not via `ctx`; (6) cross-validates that the registered handler set covers every action type listed in `declaration.actions` and rejects any handler for an action type not in the declaration; (7) for `ExclusiveMountStrategy`-backed implementations, the cross-validation also rejects declarations that include `unmount_ext`, since the strategy has no public unmount path.

`ContainerProvider` is removed from the public surface. Containers are an implementation concern: the implementation supplies a `ContainerHooks` instance, the strategy uses it for container lifecycle, and the framework receives only opaque `Element` references through `mounter.mount(extId, container)`.

- [ ] `p1` - **ID**: `cpt-frontx-interface-mfe-json-schemas`
- **Contract**: `cpt-frontx-interface-mfe-json-schemas`
- **Technology**: JSON / TypeScript interface
- **Location**: `mfe.json` (MFE package root), bootstrap loader (`src/app/mfe/bootstrap.ts`)

`mfe.json` carries an optional top-level `schemas` array of inline GTS JSON Schema objects. Each element is a standard JSON Schema with a GTS `$id` (e.g., `gts://gts.hai3.mfes.comm.action.v1~vendor.action.refresh.v1~`). The parent registers all schemas with `typeSystem.registerSchema()` before registering any entries or extensions, ensuring GTS validation is available for all action types declared in `actions`.

```json
{
  "schemas": [
    {
      "$id": "gts://gts.hai3.mfes.comm.action.v1~vendor.action.refresh.v1~",
      "type": "object",
      "properties": { "..." : "..." }
    }
  ],
  "entries": [ { "..." : "..." } ],
  "extensions": [ { "..." : "..." } ]
}
```

`mfe.json` is human-authored and environment-independent: it contains entries (without `exposeAssets`), extensions, and schemas. There is no `manifest` section, no URLs, and no chunk paths. The `frontx-mf-gts` plugin derives shared dependencies automatically from `rollupOptions.external` in the resolved Vite config, matches them against `mf-manifest.json` shared entries, and errors if an external is not found. The plugin enriches `mfe.json` in-place with `manifest.metaData`, `manifest.shared[]` (with `chunkPath`/`version`/`unwrapKey` per dep), and `entries[].exposeAssets`. Enriched `mfe.json` is the complete self-contained contract per MFE — no intermediate artifacts are produced. The generation script (see `cpt-frontx-fr-manifest-generation-script`) is a temporary aggregator that produces pointers to enriched `mfe.json` files with environment-specific `--base-url`; when a backend API is ready, the static import is replaced with a fetch call — same `mfe.json` shape, different transport. `mf-manifest.json` is consumed by the plugin only and never reaches runtime.

**Registration flow** (parent side):
1. Import `generated-mfe-manifests.json` (produced by the generation script with environment-specific `--base-url`).
2. FOR EACH schema in `mfe.json.schemas` (present in the generated config if authored in `mfe.json`): call `typeSystem.registerSchema(schema)`. Deduplication is automatic — GTS overwrites any existing entry with the same `$id`.
3. Register the `MfManifest` GTS entity from the generated config.
4. Register entries (with `exposeAssets` populated from the generated config) and extensions as normal.

The CLI package exposes a command-and-generated-files contract to scaffolded projects. `frontx create` and code-generation commands leave behind a canonical test contract (`test`, `test:unit`, `test:unit:watch`), Vitest configuration, starter tests, and project testing guidance that AI tools can consume without inspecting CLI internals. `frontx ai sync` extends that contract by projecting the same testing convention into generated assistant files and project-level guidance targets.

**Public Package Interfaces**

| Interface | Package | Description |
|-----------|---------|-------------|
| `cpt-frontx-interface-state` | `@cyberfabric/state` | Event-driven state management with EventBus, Redux-backed store, dynamic slice registration, and type-safe module augmentation |
| `cpt-frontx-interface-screensets` | `@cyberfabric/screensets` | MFE type system, MfeRegistry, MfeHandler, MfeBridge, ExtensionDomainImplementation / DomainContext / ExtensionMounter / ContainerHooks, ConcurrentMountStrategy / OptionalMountStrategy / ExclusiveMountStrategy, Shadow DOM utilities, GTS validation plugin, action/property constants |
| `cpt-frontx-interface-api` | `@cyberfabric/api` | Protocol-agnostic API layer with REST and SSE protocols, plugin chain, mock mode, type guards, endpoint/stream descriptors |
| `cpt-frontx-interface-i18n` | `@cyberfabric/i18n` | 36-language i18n registry, locale-aware formatters, RTL support, language metadata |
| `cpt-frontx-interface-framework` | `@cyberfabric/framework` | Plugin architecture with `createHAI3()` builder, presets, layout domain slices, effect coordination, re-exports all L1 APIs |
| `cpt-frontx-interface-react` | `@cyberfabric/react` | HAI3Provider, typed hooks, MFE hooks (`useMfeBridge`, `useSharedProperty`, `useHostAction`, `useDomainExtensions`, `useRegisteredPackages`, `useMountedExtensions`, `useActivePackage`), ExtensionDomainSlot (singleton-root via `RootAttachable` structural opt-in), `RootAttachable` interface, re-exports all L2 APIs |
| `cpt-frontx-interface-studio` | `@cyberfabric/studio` | Dev-only floating overlay with MFE package selector, theme/language/mock controls, persistence, viewport clamping |
| `cpt-frontx-interface-cli` | `@cyberfabric/cli` | Project scaffolding, code generation, migration runners, AI tool configuration sync, unit-test scaffold contract, and generated testing guidance |

**External Integration Contracts**

| Contract | Description |
|----------|-------------|
| `cpt-frontx-contract-mfe-manifest` | MFE packages provide `mfe.json` — human-authored base (entries, extensions, schemas) enriched in-place by the `frontx-mf-gts` plugin at build time with manifest metadata, shared dep info (`chunkPath`/`version`/`unwrapKey`), and `exposeAssets`. The plugin derives shared dependencies from build externals (`rollupOptions.external`). `mfe.json` is the complete self-contained contract per MFE. `mf-manifest.json` is a build-time intermediate consumed by the plugin only and never reaches runtime. A temporary generation script aggregates pointers to `mfe.json` files for host bootstrap. ADR: `cpt-frontx-adr-mf2-manifest-discovery` |
| `cpt-frontx-contract-federation-runtime` | The handler resolves the `MfManifest` GTS entity for package-level metadata (shared deps with `chunkPath`/`version`/`unwrapKey`, base URL) and reads per-module chunk paths from `entry.exposeAssets`. The handler builds shared dep blob URLs by fetching standalone ESM source text (deduplicated via `sharedDepTextCache` keyed by `name@version`), rewriting bare specifiers between deps, and creating per-load blob URLs. The expose blob URL chain rewrites both relative and bare specifiers. No `createInstance()`, no `FederationHost`, no `__mf_init__` — no MF 2.0 runtime interaction. ADR: `cpt-frontx-adr-mf2-manifest-discovery` |

### 3.4 Internal Dependencies

| Source Package | Target Package | Interface Used | Purpose |
|----------------|----------------|----------------|----------|
| `@cyberfabric/framework` | `@cyberfabric/state` | Store, EventBus, Action, Effect APIs | State management and event-driven communication |
| `@cyberfabric/framework` | `@cyberfabric/screensets` | MfeRegistry, MFE contracts | MFE registration and lifecycle management |
| `@cyberfabric/framework` | `@cyberfabric/api` | ApiService factory, protocol registry | API service initialization and protocol adapter setup |
| `@cyberfabric/framework` | `@cyberfabric/i18n` | i18n init, namespace loader, formatters | Internationalization setup and language management |
| `@cyberfabric/react` | `@cyberfabric/framework` | Builder output, plugin context, layout slices | Provider tree construction and hook bindings |

**Dependency Rules**:
- No circular dependencies (enforced by `dependency-cruiser`)
- L1 packages have zero `@cyberfabric/*` dependencies
- L2 depends only on L1; L3 depends only on L2
- Standalone packages (`@cyberfabric/studio`, `@cyberfabric/cli`) sit outside the L1/L2/L3 dependency chain
- Cross-package imports use workspace names (`@cyberfabric/…`), never `../packages/*/src/*`

### 3.5 External Dependencies

#### React Ecosystem

| Dependency | Version | Used By | Purpose |
|-----------|---------|---------|---------|
| `react` | ^19.0.0 | `@cyberfabric/react`, `@cyberfabric/studio` | UI rendering, hooks, concurrent features |
| `react-dom` | ^19.0.0 | `@cyberfabric/react` | DOM mounting, Shadow DOM for MFE isolation |

#### State Management

| Dependency | Version | Used By | Purpose |
|-----------|---------|---------|---------|
| `@reduxjs/toolkit` | ^2.x | `@cyberfabric/state`, `@cyberfabric/framework` | Store creation, slice management, middleware |
| `react-redux` | ^9.x | `@cyberfabric/react` | React bindings for Redux store |

#### Build Toolchain

| Dependency | Version | Used By | Purpose |
|-----------|---------|---------|---------|
| `vite` | ^6.x | Build system | Development server, production bundling |
| `@module-federation/vite` | ^0.x | MFE packages (build) | Expose compilation and `mf-manifest.json` generation (`shared:{}`, build-only) |
| `tsup` | ^8.x | All packages | TypeScript compilation to ESM |
| `typescript` | ^5.5 | All packages | Type checking, declaration generation |
| `tailwindcss` | ^3.x | Local MFE/screenset | Utility-first CSS |

#### UI Foundation

| Dependency | Version | Used By | Purpose |
|-----------|---------|---------|---------|
| `@radix-ui/*` | various | Local UI | Accessible headless UI primitives |
| `lucide-react` | ^0.x | Local UI | Icon system |
| `recharts` | ^2.x | Local UI | Chart components |
| `i18next` | ^23.x | `@cyberfabric/i18n` | Translation runtime |

#### HTTP & Networking

| Dependency | Version | Used By | Purpose |
|-----------|---------|---------|---------|
| `axios` | ^1.x | `@cyberfabric/api` (peer) | HTTP client for REST protocol adapter |

### 3.6 Interactions & Sequences

#### Application Bootstrap

**ID**: `cpt-frontx-seq-app-bootstrap`

**Use cases**: `cpt-frontx-usecase-mfe-load`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-runtime`

```mermaid
sequenceDiagram
    participant App as Host App
    participant Builder as createHAI3()
    participant Plugin as Plugins
    participant Registry as Registries
    participant Provider as HAI3Provider

    App->>Builder: createHAI3()
    App->>Builder: .use(microfrontends())
    App->>Builder: .use(domainPlugin())
    App->>Builder: .build()
    Builder->>Plugin: plugin.init(context)
    Plugin->>Registry: registerSlice(), registerEffect()
    Plugin->>Registry: mfeRegistry.register()
    Builder-->>App: { store, config, registries }
    App->>Provider: <HAI3Provider config={...}>
    Provider->>Registry: themeRegistry init
    Provider->>Registry: mfeRegistryFactory.build()
    Provider-->>App: Application rendered
```

**Description**: The host application creates a framework instance via the builder, chains plugins, and calls `.build()`. Each plugin initializes by registering its slices, effects, and registry entries through the context. The built configuration is passed to `HAI3Provider`, which orchestrates the initialization sequence: theme registry → screen-sets registry (with MFE handlers) → domain registration → render.

#### Screen-Set Data Flow

**ID**: `cpt-frontx-seq-screenset-data-flow`

**Use cases**: `cpt-frontx-usecase-mfe-load`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-runtime`

```mermaid
sequenceDiagram
    participant C as Component
    participant A as Action
    participant EB as EventBus
    participant E as Effect
    participant R as Reducer
    participant S as Store
    participant V as View

    C->>A: createAction(payload)
    A->>EB: publish(eventName, payload)
    EB->>E: notify subscriber
    E->>E: Side effects (API, validation)
    E->>R: dispatch(reducerAction)
    R->>S: new state
    S->>V: useAppSelector() re-render
```

**Description**: A component triggers an action via `createAction()`. The action publishes a typed event on the event bus. Registered effects handle the event, perform side effects (API calls, validation), and dispatch Redux actions. Reducers produce new state, which triggers re-renders in subscribed components via `useAppSelector()`.

#### MFE Extension Loading

**ID**: `cpt-frontx-seq-mfe-loading`

**Use cases**: `cpt-frontx-usecase-mfe-load`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`

```mermaid
sequenceDiagram
    participant Host as Host App
    participant FW as Framework
    participant SS as Screensets
    participant Handler as MFE Handler
    participant Remote as MFE Remote

    Host->>FW: microfrontends() plugin init
    FW->>SS: register MFE handler
    Host->>SS: load MFE by name
    SS->>Handler: load(entry)
    Handler->>Handler: resolve MfManifest GTS entity (shared deps, base URL)
    Handler->>Handler: read entry.exposeAssets (chunk paths, CSS)
    Handler->>Remote: fetch shared dep standalone ESMs (sharedDepTextCache dedup by name@version)
    Handler->>Handler: build shared dep blob URLs (bare specifier rewriting)
    Handler->>Remote: fetch expose chunk source text
    Handler->>Handler: rewrite imports → per-load blob URLs (relative + bare)
    Handler->>Handler: recursive blob URL chain (transitive deps)
    Handler-->>SS: blob URL module + lifecycle
    SS-->>FW: MFE module loaded
    FW->>FW: propagate theme
    FW->>FW: propagate i18n
    FW->>Host: MFE ready
    Host->>Host: ExtensionDomainSlot renders in host screen container
```

**Description**: The `microfrontends()` plugin registers an MFE handler with the screen-sets registry. When a screen-set requests an MFE, the handler resolves the `MfManifest` GTS entity for package-level metadata (shared dependencies with `chunkPath`/`version`/`unwrapKey`, base URL) and reads per-module chunk paths and CSS assets from `entry.exposeAssets` (ADR: `cpt-frontx-adr-mf2-manifest-discovery`). The `MfManifest` GTS entity is pre-registered at bootstrap time — it is not fetched at runtime. The handler then builds shared dep blob URLs: it fetches standalone ESM source text for each shared dep (deduplicated via `sharedDepTextCache` keyed by `name@version` across all runtimes), rewrites bare specifiers between shared deps to per-load blob URLs, and creates a blob URL per shared dep per load for isolation. Next, the handler fetches the expose chunk source text, rewrites both relative and bare import specifiers to per-load blob URLs (ADR: `cpt-frontx-adr-blob-url-mfe-isolation`), recursively resolves transitive dependencies through the blob URL chain, and returns the loaded module with its lifecycle. No MF 2.0 runtime interaction — no `FederationHost`, no `__loadShare__`, no `__mf_init__`. The framework propagates theme and i18n settings. Mount/unmount semantics are owned by the registered domain implementation through one of the shipped strategy classes (ADR: `cpt-frontx-adr-domain-implementation-mount-strategies`): when a mount action is dispatched the registry resolves the per-action-type handler the implementation registered, the handler delegates to the strategy, the strategy uses `ContainerHooks.create(extId)` to materialize a host element, and finally calls `mounter.mount(extId, container)`; the framework receives only the opaque `Element` reference and uses it as a host. The React layer's `ExtensionDomainSlot` mounts a singleton root per domain via the `RootAttachable.setRoot(element)` structural opt-in — multi-mount children live under that root, managed imperatively by the implementation's hooks — inside a Shadow DOM container for CSS isolation. CDN hosting for MFE bundles with appropriate cache headers is a deployment concern owned by the consuming application.

#### Shared Property Broadcast

**ID**: `cpt-frontx-seq-shared-property-broadcast`

**Use cases**: `cpt-frontx-usecase-mfe-load`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`, `cpt-frontx-actor-gts-plugin`

```mermaid
sequenceDiagram
    participant Host as Host Plugin
    participant SP as SharedProperty Bridge
    participant GTS as GTS Validator
    participant MFE as MFE Component

    Host->>SP: setSharedProperty(key, value)
    SP->>GTS: validate(key, value, schema)
    alt valid
        GTS-->>SP: OK
        SP->>SP: store value
        SP->>MFE: notify onChange(key, value)
        MFE->>MFE: useSharedProperty(key) re-render
    else invalid
        GTS-->>SP: reject(reason)
        SP->>SP: throw error with validation details
    end
```

**Description**: When a host plugin sets a shared property, the value passes through GTS validation against the declared schema. Valid values are stored and broadcast to all subscribed MFE components via change notifications. Invalid values cause a synchronous throw with validation failure details. MFE components read shared properties through `useSharedProperty()` which re-renders on changes.

#### Extension Action Delivery

**ID**: `cpt-frontx-seq-extension-action-delivery`

**Use cases**: `cpt-frontx-usecase-mfe-load`

**Actors**: `cpt-frontx-actor-host-app`, `cpt-frontx-actor-microfrontend`, `cpt-frontx-actor-runtime`

```mermaid
sequenceDiagram
    participant Host as Host / MFE
    participant Bridge as ChildMfeBridge
    participant Mediator as ActionsChainsMediator
    participant Handler as ActionHandler (MFE)

    Host->>Bridge: executeActionsChain(chain targeting extension ID)
    Bridge->>Mediator: executeActionsChain(chain)
    Mediator->>Mediator: resolveHandler(action.target, action.type)
    alt handler registered for (extensionId, actionTypeId)
        Mediator->>Handler: handler(actionTypeId, payload)
        Handler-->>Mediator: resolve
        Mediator-->>Bridge: chain complete
    else no handler registered
        Mediator->>Mediator: no-op (successful return)
        Mediator-->>Bridge: chain complete
    end
    Bridge-->>Host: Promise resolves
```

**Description**: When a host or MFE calls `executeActionsChain` with an action whose `target` is an extension ID (rather than a domain ID), the mediator resolves the handler registered for the `(extensionId, actionTypeId)` pair. Handlers are `ActionHandler` abstract class instances — one small class per action type, consistent with the class-based architecture of the entire package. A handler is registered per action type via `ChildMfeBridge.registerActionHandler(actionTypeId, handler)`, which wires it to `mediator.registerHandler(extensionId, actionTypeId, handler)`. Domain-side lifecycle handlers are also small `ActionHandler` subclasses registered per action type during `registerDomain()` — the mediator stores all handlers in a unified `Map<targetId, Map<actionTypeId, ActionHandler>>`. On bridge dispose, all handlers for the extension are unregistered. This allows child MFEs to receive typed actions from the host or peer MFEs without any direct coupling, and eliminates the need for a monolithic switch in any handler class.

#### CLI Project Scaffold with Unit Test Baseline

**ID**: `cpt-frontx-seq-cli-project-scaffold`

**Use cases**: `cpt-frontx-usecase-scaffold`

**Actors**: `cpt-frontx-actor-developer`, `cpt-frontx-actor-cli`, `cpt-frontx-actor-ai-agent`

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant CLI as frontx CLI
    participant Templates as Templates
    participant Project as Generated Project
    participant AiSync as AI Sync

    Dev->>CLI: frontx create or scaffold command
    CLI->>Templates: resolve template manifest
    Templates-->>CLI: app, screenset, _blank-mfe, guidance assets
    CLI->>Project: write package.json scripts, Vitest config, starter tests
    CLI->>Project: write project testing guidance
    CLI->>AiSync: sync assistant files
    AiSync->>Project: write tool-specific testing instructions
    Project-->>Dev: scaffold with passing unit-test baseline
```

**Description**: Project and screenset scaffolding begin with the CLI resolving the template manifest for application files, `_blank-mfe` baseline tests, and guidance assets. The generated project receives the canonical `test`, `test:unit`, and `test:unit:watch` scripts, Vitest configuration, starter tests, and editable project testing guidance. That guidance carries only the compact Vitest subset FrontX agents need constantly: scaffold command usage, focused test-structure primitives, mocking, environment selection, and targeted filtering. `frontx ai sync` then projects the same testing convention into generated assistant files so later edits follow the scaffolded verification contract.

#### AI Agent Verification Workflow

**ID**: `cpt-frontx-seq-ai-agent-verification`

**Use cases**: `cpt-frontx-usecase-scaffold`

**Actors**: `cpt-frontx-actor-ai-agent`, `cpt-frontx-actor-developer`

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant Rules as Project Guidance
    participant Code as Generated Code
    participant Tests as Unit Tests
    participant Verify as Verification Commands

    Agent->>Rules: read .ai/GUIDELINES.md and project testing guidance
    Agent->>Code: modify generated source
    Agent->>Tests: add or update unit tests when coverage guidance requires them
    Agent->>Rules: resolve whether tiered unit-test triggers apply
    alt tiered triggers apply
        Agent->>Verify: run the standard unit-test command
        Verify-->>Agent: passing test feedback
    else no unit-test run required
        Rules-->>Agent: guidance allows direct final checks
    end
    Agent->>Verify: run type-check and arch:check
    Verify-->>Agent: final validation status
```

**Description**: AI-assisted development starts by loading the generated project guidance, including the project-level testing instructions that describe when code changes require unit-test updates and when the standard unit-test command must run. Those instructions intentionally stay compact and avoid full Vitest reference coverage so agents load FrontX-specific testing rules instead of a broad upstream manual. The agent updates source and test files together, resolves whether the tiered triggers require the standard unit-test workflow, and runs the project-standard unit-test command against the scaffolded Vitest baseline only when those triggers apply. The agent advances to `type-check` and `arch:check` after applicable unit tests pass, or immediately when the guidance says no unit-test run is required. This keeps the generated-project verification loop aligned with the tiered test policy while preserving final architecture enforcement for every change.

### 3.7 Database schemas & tables

Not applicable — FrontX is a frontend framework with no server-side database.

## 3.8 Publishing Pipeline Architecture

**ADR**: `cpt-frontx-adr-automated-layer-ordered-publishing`, `cpt-frontx-adr-channel-aware-version-locking`

#### Gitflow Branching Model

The monorepo follows a gitflow branching strategy:
- `main` — stable releases, published with `latest` dist-tag
- `develop` — integration branch, published with `alpha` dist-tag
- `release/X.Y.Z` — short-lived release candidates, published with `next` dist-tag
- `release/vN` — long-lived maintenance lines for previous major versions, published with `vN` dist-tag
- `feature/*` — feature branches, no publishing
- `hotfix/*` — urgent fixes targeting `main` or `release/vN`

#### Branch-to-Dist-Tag Mapping

| Branch | Dist-Tag | Version Format |
|--------|----------|---------------|
| `develop` | `alpha` | `0.x.y-alpha.N` |
| `release/X.Y.Z` | `next` | `0.x.y-rc.N` |
| `main` | `latest` | `0.x.y` |
| `release/vN` | `vN` | `N.y.z` (maintenance patches) |

#### Version Injection Mechanism

The CLI scaffolds projects with exact dependency versions matching its publication channel. A build-time script (`packages/cli/scripts/generate-versions.ts`) reads all monorepo `packages/*/package.json` files, extracts `name` + `version`, and writes `src/generated/versions.ts` as a TypeScript constants file. CLI generators import these locked versions instead of hardcoded strings. Since develop builds carry alpha versions and main builds carry stable versions, the generated file naturally matches the channel.

#### Layer-Ordered Publishing

Packages are published in strict layer order to maintain registry consistency:
1. **L1 SDK**: `@cyberfabric/state`, `@cyberfabric/screensets`, `@cyberfabric/api`, `@cyberfabric/i18n`
2. **L2 Framework**: `@cyberfabric/framework`
3. **L3 React**: `@cyberfabric/react`
4. **Standalone**: `@cyberfabric/studio`, `@cyberfabric/cli`

This ensures consumers can always resolve lower-layer dependencies before higher-layer packages that depend on them.

#### Independent Versioning

Packages are versioned independently within the `0.x` major. Each package can be bumped and published independently, though coordinated bumps across layers are common for breaking changes.

## 4. Additional context

**Initialization Sequence Detail**: The initialization follows a strict order to ensure registries are populated before consumers access them:

1. `themeRegistry` — theme tokens resolved
2. `mfeRegistryFactory.build()` — screen-set definitions with MFE handlers wired
3. Domain registration — domain plugins call `registerDomain(declaration, factory)`; the factory's constructor instantiates an `ExtensionDomainImplementation` that picks one of the shipped strategies (`Concurrent` / `Optional` / `Exclusive`) and supplies a `ContainerHooks` instance scoped to the domain's layout
4. Extension registration — MFE extensions registered and loaded
5. `HAI3Provider` mounts — React tree renders with all contexts available

**Module Augmentation Pattern**: Plugins extend framework types without modifying source files:

```typescript
declare module '@cyberfabric/state' {
  interface StoreState {
    myDomain: MyDomainState;
  }
}
```

This provides type-safe access to `store.getState().myDomain` across the entire application while keeping the state package unaware of domain-specific slices.

**Build Orchestration**: The monorepo uses npm workspaces. Build order matters because higher layers import from lower layers' built output: `npm run build:packages` executes SDK → Framework → React → Studio → CLI sequentially.

### 4.5 Security Considerations

MFE bundles are fetched from remote URLs and evaluated via blob URLs — the primary security surface.

**Trust boundary**: MFE remotes are configured by the host application. The host trusts the configured remote origins to serve legitimate bundles. Remote URLs MUST use HTTPS in production.

**Threat vectors and mitigations**:
- *Malicious MFE bundle*: mitigated by HTTPS-only fetch, CSP `blob:` in `script-src` (no `eval()` or `new Function()`), GTS schema validation of manifest structure
- *MITM on manifest/bundle fetch*: mitigated by HTTPS transport; no fallback to HTTP
- *Supply chain compromise of MFE remote*: mitigated by host-controlled remote URL configuration + GTS schema validation; the host decides which remotes to trust

**Consumer responsibilities**: configure trusted MFE remote origins, enforce HTTPS, review CSP policy, audit MFE packages before deployment.

### 4.6 Error Handling Strategy

Errors are classified by origin: **MFE loading** (`MfeLoadError` with typed causes — manifest fetch failure, JSON parse error, missing expose metadata, blob URL creation failure, lifecycle validation failure), **plugin initialization** (caught and logged per plugin; never crashes the host), **action chains** (timeout after configurable duration, fallback branch on failure), **shared property validation** (GTS validation rejects invalid values before propagation; error includes validation details). Each error class carries structured metadata for debugging. Unhandled errors in MFE extensions are caught by per-MFE error boundaries at the React layer.

### 4.7 API Evolution

All `@cyberfabric/*` packages follow semver within the 0.x major version. Breaking changes require a minor version bump with migration guidance. Deprecated APIs are annotated with `@deprecated` JSDoc and retained for at least one minor version before removal.

### 4.7b Documentation Strategy

API documentation is generated from TypeScript source via the `docs/` VitePress package. CLI help text is inline. Architecture documentation lives in `architecture/`.

### 4.8 Known Limitations

- Blob URLs accumulate for the page lifetime (~30-40 per MFE load) and cannot be revoked due to top-level await module evaluation semantics. Memory grows proportionally with loaded MFEs.
- The `mf-manifest.json` schema is stable but not formally versioned by the Module Federation project. Schema changes may require `frontx-mf-gts` plugin updates (the handler does not consume `mf-manifest.json` directly — the plugin reads it at build time to extract expose chunk paths).

### 4.9 Non-Applicable Domains

The following architecture domains are not applicable to FrontX as a client-side npm library:

- **Server-side scalability** (PERF): FrontX runs in the browser. Concurrent users, throughput, and capacity planning are application/server concerns.
- **Operations** (OPS): FrontX is distributed via npm, not deployed as a service. Deployment, monitoring, alerting, SLOs, and infrastructure-as-code are consumer responsibilities.
- **Compliance** (COMPL): FrontX does not process PII, financial data, or healthcare data. Regulatory and privacy compliance are application-level concerns.
- **Authentication/Authorization ownership** (SEC): FrontX provides extension points for auth plugins but does not implement auth. Authentication and authorization are application-level concerns.
- **Data recovery/DR** (REL): No server-side state. Client-side state is ephemeral (Redux store, blob URLs) and does not require backup or disaster recovery.
- **Resource constraints and team capabilities**: Not explicitly scoped — FrontX is developed iteratively with priority-based phasing (p1/p2/p3). Technology choices (TypeScript, React, Redux Toolkit, Vite) reflect established team expertise.
- **Progressive enhancement / offline support** (UX): FrontX is an online-only framework library. Progressive enhancement and offline support are application-level concerns.
- **Contract testing** (TEST): TypeScript's strict type-checking across workspace packages serves as the contract testing mechanism — all packages are built and type-checked together in CI, catching interface drift at compile time.

## 5. Traceability

- **PRD**: [PRD.md](./PRD.md)
- **ADRs**: [ADR/](./ADR/)
- **Features**: [features/](./features/)
- **Unit-test feature**: [features/feature-unit-test-generation-and-agent-verification/FEATURE.md](./features/feature-unit-test-generation-and-agent-verification/FEATURE.md)
- **Allocated requirements in this DESIGN update**: `cpt-frontx-fr-cli-commands`, `cpt-frontx-fr-cli-templates`, `cpt-frontx-fr-cli-skills`, `cpt-frontx-fr-cli-e2e-verification`, `cpt-frontx-fr-ai-agent-integration`
- **Primary design owners for the test workflow contract**: `cpt-frontx-component-cli`, `cpt-frontx-interface-cli`, `cpt-frontx-seq-cli-project-scaffold`, `cpt-frontx-seq-ai-agent-verification`
