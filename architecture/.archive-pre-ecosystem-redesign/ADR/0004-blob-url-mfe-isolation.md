---
status: accepted
date: 2026-03-03
decision-makers: FrontX core team
---

# Blob URL Isolation for Microfrontends


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Fetch source text and create a unique Blob URL per MFE load](#fetch-source-text-and-create-a-unique-blob-url-per-mfe-load)
  - [Module Federation singleton/shared mechanism](#module-federation-singletonshared-mechanism)
  - [Service Worker URL interception](#service-worker-url-interception)
  - [`Function()` re-evaluation of module source](#function-re-evaluation-of-module-source)
  - [Import maps with per-MFE scope overrides](#import-maps-with-per-mfe-scope-overrides)
- [Review Triggers](#review-triggers)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-blob-url-mfe-isolation`
## Context and Problem Statement

FrontX's multi-team MFE model requires that independently deployed MFE packages coexist in a single host without interference — independent team development and fault isolation are the core business drivers. Browsers cache ES modules by URL identity — when multiple MFEs share dependencies via Module Federation's shareScope, they receive the same module instance. This breaks per-MFE isolation: module-level state such as each MFE's EventBus instance and Redux store is shared rather than scoped. The previous approach using Module Federation's singleton/shared mechanism could not achieve true per-runtime isolation because it was designed to prevent duplicate instances, not to guarantee separate ones. This isolation requirement was identified during initial MFE framework design when prototype testing demonstrated shared module-level state across concurrent MFE loads. This decision affects MFE authors (whose bundles are evaluated through the blob URL chain), host application developers (who configure the registry and trust the isolation contract), and the FrontX core team (who maintain the isolation pipeline).

## Decision Drivers

* **(P0)** Each MFE load must produce its own module-level state instances (EventBus, store, i18n) regardless of caching — per-MFE isolation is non-negotiable
* **(P1)** The solution must not introduce `@gears-frontx/*` dependencies into L1 packages (zero-dependency constraint)
* **(P1)** The isolation mechanism must be compatible with top-level await and ES module parse-time resolution semantics — early resource revocation during async evaluation causes load failures

## Considered Options

* Fetch source text and create a unique Blob URL per MFE load via `URL.createObjectURL`
* Module Federation singleton/shared mechanism
* Service Worker URL interception
* `Function()` re-evaluation of module source
* Import maps with per-MFE scope overrides

## Decision Outcome

Chosen option: "Fetch source text and create a unique Blob URL per MFE load via `URL.createObjectURL`", because Blob URLs are unique by construction (`blob:<origin>/<uuid>`), forcing fresh module evaluation with its own module-level state per the ES module spec. Simple string replacement for import specifier rewriting respects the L1 zero-dependency constraint without introducing a parser dependency.

### Consequences

* Good, because each MFE load has true module-level isolation — EventBus instances, stores, and singletons are independent regardless of the number of MFEs loaded simultaneously
* Bad, because blob URLs accumulate (~30–40 per load) and source text is cached in memory. Mitigation: blob URLs are cleaned up automatically by the browser on page unload; for typical SPA lifecycles this is bounded. Source text cache can be cleared on MFE handler disposal
* Bad, because blob URL isolation with import specifier rewriting is a non-standard pattern requiring specialized debugging knowledge
* Neutral, because the MfeHandler abstraction encapsulates the complexity, limiting the maintenance surface
* Neutral, because if browsers add native module isolation scopes, the blob URL mechanism becomes unnecessary — the MfeHandler abstraction allows replacing the isolation strategy without affecting the registry, bridge, or mediator layers

### Confirmation

`MfeHandlerMF` in `packages/screensets/src/mfe/handler/mf-handler.ts` implements blob URL creation and import specifier rewriting with per-load source text caching. The MFE build plugin handles shared dependency transforms across all chunks in the bundle. See ADR-0019 (`cpt-frontx-adr-mf2-manifest-discovery`) for the build tooling and metadata discovery mechanism.

## Pros and Cons of the Options

### Fetch source text and create a unique Blob URL per MFE load

* Good, because the UUID embedded in every blob URL guarantees no two loads share a module instance, and no browser or bundler workaround is required
* Bad, because memory usage grows proportionally with the number of loaded MFEs and the size of their shared dependency graph

### Module Federation singleton/shared mechanism

* Good, because it is the built-in Module Federation solution with wide community documentation
* Bad, because singleton sharing is designed to prevent duplicate instances — it cannot produce isolated instances per MFE load by design

### Service Worker URL interception

* Good, because interception is transparent to the MFE bundle and requires no build-time changes
* Bad, because Module Federation's runtime never makes network requests for shared modules after the first load, so Service Worker interception has no opportunity to act

### `Function()` re-evaluation of module source

* Good, because `new Function(source)()` always produces a fresh evaluation
* Bad, because `Function()` does not support ES module syntax (`import`/`export`), making it incompatible with ESM-first packages

### Import maps with per-MFE scope overrides

* Good, because import maps are a web standard with clean URL remapping semantics
* Bad, because import maps are static after the first `<script type="importmap">` is parsed — dynamically adding per-MFE scopes at runtime is not supported

## Review Triggers

This decision should be revisited when:
* Browser platforms introduce native ES module isolation scopes (per-import evaluation contexts)
* Module Federation runtime adds per-load isolation as a built-in feature
* Memory profiling shows blob URL accumulation exceeds acceptable bounds for target deployment scenarios
* Calendar review: no later than 2027-Q1 or when any trigger fires, whichever comes first.

**Invalidation condition**: this decision becomes invalid if browsers implement native per-import module isolation scopes or if the FrontX architecture no longer requires per-MFE module-level state isolation.

## More Information

- Operational impact (OPS): Not applicable — client-side build output and in-browser runtime behavior.
- The never-revoke rule: `URL.createObjectURL` returns a URL that persists until explicitly revoked. Because `import()` with top-level await may parse (and cache the URL reference) before the module body executes, revoking the blob URL before all dependent modules finish loading causes `ERR_FAILED` on subsequent imports of the same specifier
- Related: ADR 0019 (`cpt-frontx-adr-mf2-manifest-discovery`) — governs the build plugin and metadata discovery mechanism that feeds chunk URLs into the blob URL isolation pipeline
- Related: ADR 0020 (`cpt-frontx-adr-mfe-state-lifecycle-boundary`) — extends this decision with the host/author state-lifecycle contract; narrows the "blob URLs accumulate" consequence to per-load (catalog-bounded) by ruling out per-mount fresh-load mechanisms
- Related: ADR 0022 (`cpt-frontx-adr-lazy-import-abi`) — extends the blob URL chain to dynamic `import()` calls via a plugin AST transform + handler runtime resolver (`__frontx_lazy`); lazy chunks inherit the parent load's `sharedDepBlobUrls`, preserving per-load isolation for lazy-loaded code
- Related: ADR 0001 (Four-Layer SDK Architecture) — blob loader lives in `packages/screensets` (L1) and must not import other `@gears-frontx/*` packages
- Related: ADR 0002 (Event-Driven Flux Data Flow) — EventBus isolation is the primary motivation for per-MFE module scope
- Learning curve: blob URL isolation with import specifier rewriting is a non-standard pattern; developers debugging MFE loading issues should understand that blob URLs produce opaque identifiers in browser DevTools and that source text is fetched separately from module evaluation
- Evolution path: if browsers add native module isolation scopes, the blob URL mechanism becomes unnecessary — the MfeHandler abstraction allows replacing the isolation strategy without affecting the registry, bridge, or mediator layers

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)
- **ADR-0019**: [0019-mf2-manifest-discovery.md](0019-mf2-manifest-discovery.md) — build tooling and manifest discovery mechanism that feeds chunk URLs into the blob URL isolation pipeline

This decision directly addresses:
* `cpt-frontx-fr-blob-fresh-eval` — fresh evaluation via unique blob URL per load
* `cpt-frontx-fr-blob-no-revoke` — prohibition on revoking blob URLs after import
* `cpt-frontx-fr-blob-source-cache` — source text caching strategy
* `cpt-frontx-fr-blob-import-rewriting` — string-based import specifier rewriting
* `cpt-frontx-fr-blob-recursive-chain` — recursive resolution of transitive shared dependencies
* `cpt-frontx-fr-blob-per-load-map` — per-load blob URL map preventing duplicate fetches within a single load
* `cpt-frontx-nfr-perf-blob-overhead` — accepted performance cost of blob URL accumulation
* `cpt-frontx-nfr-sec-csp-blob` — CSP configuration requirements for blob: URI scheme
* `cpt-frontx-principle-mfe-isolation` — architectural principle mandating per-MFE module scope
* `cpt-frontx-seq-mfe-loading` — sequence diagram for MFE load with blob URL resolution
