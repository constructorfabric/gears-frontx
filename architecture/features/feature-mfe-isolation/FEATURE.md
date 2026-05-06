# Feature: MFE Blob URL Isolation

<!-- version: 1.12 -->


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [MFE Load via Blob URL Isolation](#mfe-load-via-blob-url-isolation)
  - [MFE Build with Module Federation Plugin](#mfe-build-with-module-federation-plugin)
  - [MFE-Internal Bootstrap](#mfe-internal-bootstrap)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Build Shared Dep Blob URLs](#build-shared-dep-blob-urls)
  - [Rewrite Bare Specifiers](#rewrite-bare-specifiers)
  - [Fetch Source Text (with Cache)](#fetch-source-text-with-cache)
  - [Recursive Blob URL Chain](#recursive-blob-url-chain)
  - [Parse Static Import Filenames](#parse-static-import-filenames)
  - [Rewrite Module Imports](#rewrite-module-imports)
  - [Read Entry Expose Assets](#read-entry-expose-assets)
  - [Wrap Lifecycle With Remote Stylesheets](#wrap-lifecycle-with-remote-stylesheets)
  - [Inject Remote Stylesheets](#inject-remote-stylesheets)
  - [Remove Injected Stylesheets](#remove-injected-stylesheets)
  - [Upsert Mount Style Element](#upsert-mount-style-element)
  - [Build Standalone ESM Shared Dependencies](#build-standalone-esm-shared-dependencies)
  - [Enrich mfe.json with Manifest Metadata](#enrich-mfejson-with-manifest-metadata)
- [4. States (CDSL)](#4-states-cdsl)
  - [LoadBlobState (Per-Load Isolation Map)](#loadblobstate-per-load-isolation-map)
  - [SourceTextCache (Handler-Level)](#sourcetextcache-handler-level)
  - [SharedDepTextCache (Handler-Level)](#shareddeptextcache-handler-level)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Blob URL Isolation Core](#blob-url-isolation-core)
  - [Module Federation Vite Plugin and frontx-mf-gts](#module-federation-vite-plugin-and-frontx-mf-gts)
  - [MFE-Internal Dataflow](#mfe-internal-dataflow)
  - [MfManifest Type and GTS Schema Update](#mfmanifest-type-and-gts-schema-update)
  - [ChildMfeBridge Abstract Class Contract](#childmfebridge-abstract-class-contract)
  - [MFE Author State Lifecycle Boundary](#mfe-author-state-lifecycle-boundary)
- [6. Acceptance Criteria](#6-acceptance-criteria)
  - [Behavioral (verified in browser)](#behavioral-verified-in-browser)
  - [Structural (verified by code/tests)](#structural-verified-by-codetests)
- [7. State Lifecycle](#7-state-lifecycle)
- [Additional Context](#additional-context)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-mfe-isolation`

- [x] `p2` - `cpt-frontx-feature-mfe-isolation`
---

## 1. Feature Context

### 1.1 Overview

MFE Blob URL Isolation delivers per-microfrontend JavaScript module isolation by evaluating each MFE bundle in a fresh module scope via the browser's blob URL mechanism. Without this, dynamically loaded MFE bundles share the same module registry as the host application: two MFEs that each depend on `react` would receive the same React instance, meaning their fiber trees, hooks state, and Redux stores bleed into each other.

The isolation is achieved through five coordinated responsibilities:

1. **Manifest resolution and source text fetching** — the handler resolves the `MfManifest` GTS entity (registered before load) to extract expose chunk paths, shared dependency info, and CSS asset paths; shared dependencies are standalone ESM modules fetched from `shared/` URLs; source text is fetched at most once per `name@version` across ALL runtimes (host and MFEs) and cached in the handler-level `sharedDepTextCache`; each subsequent runtime that declares the same `name@version` gets a `sharedDepTextCache` hit and pays zero network cost.
2. **Import rewriting** — BOTH relative specifiers (`./dep.js`, `../dep.js`) AND bare specifiers (`from "react"`, `from "react-dom"`) in fetched source text are rewritten to blob URLs, so blob-evaluated modules can locate their dependencies; relative specifiers are resolved to existing blob URLs or absolute HTTP URLs; bare specifiers are resolved from the per-load shared dep blob URL map.
3. **Recursive blob URL chain** — the expose chunk and every static dependency it imports are processed depth-first; common transitive dependencies within one load are blob-URL'd once, then reused by the per-load map.
4. **Per-load shared dep blob URLs** — shared deps are blob-URL'd BEFORE the expose chain; for each shared dep declared in the manifest, the cached source text has its bare specifiers rewritten to other shared dep blob URLs (respecting dependency order), then a fresh blob URL is created; each load creates fresh blob URLs from cached source text, producing unique module evaluations.
5. **Build-time standalone ESM generation and mfe.json enrichment** — at build time, `@module-federation/vite` is used ONLY for expose compilation and `mf-manifest.json` generation (CSS assets, expose chunk paths); shared dependency handling is disabled (`shared: {}`); shared deps are externalized via `build.rollupOptions.external` so bare specifiers are preserved in output; the `frontx-mf-gts` Vite plugin builds standalone ESM modules for each shared dep (from `node_modules` via esbuild) and enriches `mfe.json` in-place with manifest metadata, shared dep info (`chunkPath`, `version`, `unwrapKey`), and per-entry `exposeAssets`; enriched `mfe.json` is the complete self-contained contract per MFE — no intermediate build artifacts.

The MFE-internal dataflow completes the isolation: each MFE creates its own `HAI3App` with an isolated store via the blob-URL-evaluated `@cyberfabric/react`; no direct `react-redux` or `@reduxjs/toolkit` imports are permitted.

**Primary value**: MFEs maintain fully independent module-level state — React fiber trees, hooks, stores — regardless of shared dependencies.

**Key assumptions**: The host application runs in a browser with support for `Blob`, `URL.createObjectURL`, and dynamic `import()`. MFE builds use `@module-federation/vite` solely for expose compilation and `mf-manifest.json` generation; shared dependency isolation is handled by the `frontx-mf-gts` plugin and the blob URL handler independently of MF 2.0 runtime.

### 1.2 Purpose

Enable multiple independently deployed MFE bundles to coexist in the same browser page without module state leakage, while minimizing redundant network requests through source text caching.

**Success criteria**: `Object.is(mfeA_React, mfeB_React)` is `false` for any two concurrently loaded MFEs that both declare `react` in their shared dependency list.

### 1.3 Actors

- `cpt-frontx-actor-microfrontend`
- `cpt-frontx-actor-build-system`
- `cpt-frontx-actor-host-app`
- `cpt-frontx-actor-runtime`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition entry: [DECOMPOSITION.md §2.3](../../DECOMPOSITION.md)
- PRD: [PRD.md](../../PRD.md) — sections 5.6 (MFE Blob URL Isolation), 5.7 (MFE Build Plugin), 5.8 (MFE Internal Dataflow)
- ADR: `cpt-frontx-adr-blob-url-mfe-isolation`
- ADR: `cpt-frontx-adr-mf2-manifest-discovery`
- ADR: `cpt-frontx-adr-mfe-state-lifecycle-boundary`
- Depends on feature: `cpt-frontx-feature-mfe-registry`

#### Non-Applicable Domains

- **OPS**: Client-side library, no server deployment
- **COMPL**: No regulatory data handling
- **UX**: Infrastructure capability, no direct user interface
- **DATA**: No database persistence (client-side state only)
- **INT**: No external service integrations (browser APIs only)
- **BIZ**: Infrastructure capability; business value derived transitively through consuming applications
- **MAINT**: No formal SLA or support tier — maintained under FrontX iterative development model
- **SEC**: No authentication or authorization implementation; CSP configuration (`blob:` in `script-src`) is the sole security-adjacent concern and is documented in `cpt-frontx-nfr-sec-csp-blob`

---

## 2. Actor Flows (CDSL)

### MFE Load via Blob URL Isolation

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-isolation-load`

**Actors**:
- `cpt-frontx-actor-host-app`
- `cpt-frontx-actor-microfrontend`
- `cpt-frontx-actor-runtime`

1. [x] - `p1` - Host requests load of an `MfeEntryMF` through the screensets registry — `inst-host-request-load`
2. [x] - `p1` - `MfeHandlerMF.load()` delegates to `loadInternal()` wrapped in retry logic — `inst-retry-wrapper`
3. [x] - `p1` - `loadInternal()` resolves the `MfManifest` from the entry's `manifest` field (inline object validated and cached, or string GTS ID looked up in ManifestCache); the manifest is a pre-registered GTS entity populated from enriched `mfe.json` at bootstrap time — it is never fetched from the network at load time; **IF** not found **RETURN** `MfeLoadError` — `inst-resolve-manifest`
4. [x] - `p1` - Schema registration happens at bootstrap time (not per-load): the host collects action IDs declared in each entry's `actions` and `domainActions`, locates the matching schemas in package-level `config.schemas[]` (by `$id` matching action ID with `gts://` prefix), and calls `typeSystem.registerSchema(schema)` only for matched schemas. Unreferenced schemas are never registered. See mfe-registry FEATURE DoD `cpt-frontx-dod-mfe-registry-mfe-schema-registration` — `inst-register-mfe-schemas`
5. [x] - `p1` - Read expose chunk path and CSS asset paths from `entry.exposeAssets` (per-module data, set at registration time from `mf-manifest.json`'s `exposes[]`); **IF** `exposeAssets` is absent or expose chunk path is empty **RETURN** `MfeLoadError` — `inst-read-expose-assets`
6. [x] - `p1` - `loadExposedModuleIsolated()` derives `baseUrl` from `manifest.metaData.publicPath` for chunk URL resolution — `inst-derive-base-url`
7. [x] - `p1` - A fresh `LoadBlobState` is created with an empty `blobUrlMap` and `visited` set scoped to this load — `inst-create-load-state`
8. [x] - `p1` - Algorithm: build shared dep blob URLs via `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls` — fetches standalone ESMs (sharedDepTextCache deduplicates by `name@version`), rewrites bare specifiers between deps, blob-URLs each dep per load (fresh evaluation = isolation), produces `sharedDepBlobUrls` map; this MUST complete before the expose chain so bare specifiers in expose chunks can be resolved — `inst-build-shared-dep-blob-urls`
9. [x] - `p1` - Algorithm: build blob URL chain for expose chunk via `cpt-frontx-algo-mfe-isolation-blob-url-chain`, passing `sharedDepBlobUrls` for bare specifier resolution — `inst-blob-url-chain`
10. [x] - `p1` - **IF** expose blob URL is absent from `blobUrlMap` **RETURN** `MfeLoadError` — `inst-check-expose-blob`
11. [x] - `p1` - Dynamic `import()` of the expose blob URL produces the expose module — `inst-import-expose-blob`
12. [x] - `p1` - Read the lifecycle from the expose module's default export; result validated as `MfeEntryLifecycle` (must have `mount` and `unmount`) — `inst-validate-lifecycle`
13. [x] - `p1` - **IF** lifecycle interface not satisfied **RETURN** `MfeLoadError` — `inst-check-lifecycle`
14. [x] - `p1` - Algorithm: when stylesheet paths are non-empty, wrap lifecycle so `mount` injects remote CSS (`cpt-frontx-algo-mfe-isolation-wrap-lifecycle-stylesheets`) and `unmount` removes injected `<link>` / `<style>` nodes — `inst-wrap-stylesheets`
15. [x] - `p1` - **RETURN** `MfeEntryLifecycle<ChildMfeBridge>` to caller — `inst-return-lifecycle`

### MFE Build with Module Federation Plugin

- [x] `p2` - **ID**: `cpt-frontx-flow-mfe-isolation-build-v2`

**Actors**:
- `cpt-frontx-actor-build-system`

1. [x] - `p1` - MFE `vite.config.ts` registers the `@module-federation/vite` plugin with expose entries and `shared: {}` (empty — shared dependency mechanism disabled); shared deps are externalized via `build.rollupOptions.external` so bare specifiers are preserved in the expose output — `inst-vite-config`
2. [x] - `p1` - On `vite build`, the plugin processes expose entry files and all code-split chunks; bare specifiers for externalized shared deps pass through to the output as-is — `inst-federation-plugin-runs`
3. [x] - `p1` - The plugin emits `mf-manifest.json` alongside the built chunk files; the manifest declares each expose entry with its primary JS chunk path in `exposes[].assets.js.sync` and CSS asset paths in `exposes[].assets.css.sync` and `exposes[].assets.css.async` — `inst-manifest-emitted`
4. [x] - `p1` - Expose chunk paths in `mf-manifest.json` are stable across rebuilds; the manifest is the authoritative source of expose chunk paths and CSS assets — `inst-stable-chunk-paths`
5. [x] - `p1` - Resulting bundle contains expose chunks with preserved bare specifiers and `mf-manifest.json` with expose metadata — `inst-build-output`
6. [x] - `p1` - The `frontx-mf-gts` Vite plugin runs in the `closeBundle` hook (after `@module-federation/vite`): Algorithm: build standalone ESM shared deps via `cpt-frontx-algo-mfe-isolation-build-standalone-esm` — builds a standalone ESM module for each shared dep from `node_modules` using esbuild, outputting to `dist/shared/` — `inst-frontx-mf-gts-build-shared`
7. [x] - `p1` - The `frontx-mf-gts` plugin enriches `mfe.json` in-place via `cpt-frontx-algo-mfe-isolation-enrich-mfe-json`: reads `dist/mf-manifest.json` for expose assets, adds `manifest.metaData`, `manifest.shared[]` (with `chunkPath`, `version`, `unwrapKey` per dep), and `entries[].exposeAssets`; enriched `mfe.json` is the complete self-contained contract per MFE — no intermediate `mfe.gts-manifest.json` artifact — `inst-frontx-mf-gts-enrich`
8. [x] - `p1` - `mf-manifest.json` is NOT imported or fetched by the host at runtime; the `frontx-mf-gts` plugin is the sole consumer of `mf-manifest.json` — `inst-manifest-not-runtime`
9. [x] - `p1` - The generation script is a temporary static substitute for a future backend API; it aggregates `mfe.json` locations (pointers to enriched `mfe.json` files per MFE) so the host bootstrap can fetch each `mfe.json`, register the `MfManifest` GTS entity, register MFE entries/extensions, and perform scoped schema registration (only schemas matching action IDs declared in any entry's `actions`/`domainActions` are registered); when the backend is ready, the static import is replaced with a fetch call — same `mfe.json` shape, different transport — `inst-gen-script-aggregates`

### MFE-Internal Bootstrap

> **Cross-reference**: The formal algorithm for bootstrap pre-registration (registering the `MfManifest` GTS entity and MFE entries before load) is described in the mfe-registry FEATURE DoD (`cpt-frontx-dod-mfe-registry-mfe-schema-registration`). That feature owns the registration protocol; this flow covers only MFE-internal state bootstrapping after the expose chunk is evaluated.

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-isolation-mfe-bootstrap`

**Actors**:
- `cpt-frontx-actor-microfrontend`
- `cpt-frontx-actor-runtime`

1. [x] - `p1` - The MFE's `init.ts` module is evaluated as a module-level side effect when the expose chunk is first imported — `inst-init-side-effect`
2. [x] - `p1` - `init.ts` calls `apiRegistry.register()` and `apiRegistry.initialize()` to register API services before the store is built — `inst-register-api`
3. [x] - `p1` - `createHAI3().use(effects()).use(queryCacheShared()).use(mock()).build()` creates a minimal `HAI3App` with an isolated store singleton and joins the host-owned QueryClient — `inst-create-mfe-app`
4. [x] - `p1` - `registerSlice(slice, effectInitializer)` wires domain state into the MFE-local store — `inst-register-slice`
5. [x] - `p1` - `mfeApp` is exported for use by lifecycle React components as the `<HAI3Provider app={mfeApp}>` prop — `inst-export-mfe-app`
6. [x] - `p1` - **IF** any lifecycle component imports `react-redux`, `redux`, or `@reduxjs/toolkit` directly, the architecture constraint is violated — `inst-no-direct-redux`

---

## 3. Processes / Business Logic (CDSL)

### Build Shared Dep Blob URLs

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`

Builds per-load blob URLs for all shared dependencies declared in the manifest. Processes deps in dependency order (leaves first) so that bare specifiers between shared deps can be rewritten to already-created blob URLs. Uses the handler-level `sharedDepTextCache` (keyed by `name@version`) to avoid redundant fetches — source text is fetched once per `name@version` across all loads; each load creates fresh blob URLs from the cached text to achieve unique module evaluations.

**Inputs**: `MfManifest.shared[]` array, `sharedDepTextCache` (handler-level, keyed by `name@version`), `baseUrl` (string)
**Outputs**: `sharedDepBlobUrls` map (package name → blob URL)

1. [x] - `p1` - **IF** the manifest shared dependency list is empty or absent **RETURN** an empty `sharedDepBlobUrls` map — `inst-empty-shared-deps`
2. [x] - `p1` - Sort shared deps in dependency order: deps that import other shared deps are processed AFTER their dependencies (leaves first) so that blob URLs for transitive shared deps are available during bare specifier rewriting — `inst-sort-dep-order`
3. [x] - `p1` - **FOR EACH** shared dep in dependency order:
   - Read `dep.chunkPath` from the manifest entry — `inst-read-shared-chunk-path`
   - **IF** `dep.chunkPath` is absent: skip (MFE falls back to its own bundled copy) — `inst-skip-no-shared-chunk`
   - Fetch source text for `dep.chunkPath` URL via `cpt-frontx-algo-mfe-isolation-fetch-source` (sharedDepTextCache deduplicates across loads by `name@version`) — `inst-fetch-shared-source`
   - Rewrite bare specifiers in the source text via `cpt-frontx-algo-mfe-isolation-rewrite-bare-specifiers`, using the `sharedDepBlobUrls` map built so far (deps already processed in this load) — `inst-rewrite-shared-bare`
   - Create a `Blob` from the rewritten source with MIME type `text/javascript` — `inst-create-shared-blob`
   - Call `URL.createObjectURL(blob)` to produce a blob URL — `inst-create-shared-object-url`
   - Store the blob URL in `sharedDepBlobUrls` keyed by package name — `inst-store-shared-blob-url`
4. [x] - `p1` - **RETURN** the `sharedDepBlobUrls` map (package name → blob URL) for use by the expose chain's bare specifier rewriting — `inst-return-shared-blob-urls`

### Rewrite Bare Specifiers

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-rewrite-bare-specifiers`

Replaces bare specifiers (non-relative, non-absolute import paths like `"react"`, `"react-dom"`, `"react/jsx-runtime"`) in source text with blob URLs from the shared dep blob URL map. Applied to both shared dep source text (during `buildSharedDepBlobUrls`) and expose chain source text (during `createBlobUrlChain`).

**Inputs**: `sourceText` (string), `sharedDepBlobUrls` (Map<string, string>)
**Outputs**: rewritten source text (string)

1. [x] - `p1` - **FOR EACH** static `from '...'` pattern where the specifier is a bare package name (not starting with `.`, `..`, `/`, or `http`): look up the specifier in `sharedDepBlobUrls`; if found, replace with the blob URL — `inst-rewrite-bare-static`
2. [x] - `p1` - Apply the same resolution and replacement to dynamic `import('...')` patterns with bare specifiers — `inst-rewrite-bare-dynamic`
3. [x] - `p1` - Bare specifiers not found in `sharedDepBlobUrls` are left unmodified — the module will resolve them through its own bundled copy — `inst-bare-fallback`
4. [x] - `p1` - **RETURN** the rewritten source text — `inst-return-bare-rewritten`

### Fetch Source Text (with Cache)

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-fetch-source`

All source text fetches go through the `MfeHandlerMF`-level `sourceTextCache` (keyed by absolute URL), ensuring at most one in-flight network request per chunk while the entry remains cached. The cache is bounded via a least-recently-used eviction policy (`SOURCE_TEXT_CACHE_CAPACITY`); when the cap is reached, the least-recently-accessed URL is dropped and a subsequent access re-fetches. Eviction is correctness-safe — each cache miss triggers a fresh fetch.

**Inputs**: `absoluteChunkUrl` (string), `sourceTextCache` (handler-level `LruCache<string, Promise<string>>`)
**Outputs**: `Promise<string>` (source text) or `MfeLoadError`

1. [x] - `p1` - **IF** `sourceTextCache` contains an entry for `absoluteChunkUrl` **RETURN** the cached `Promise<string>` — `inst-cache-hit`
2. [x] - `p1` - Store a new `Promise<string>` in `sourceTextCache` keyed by `absoluteChunkUrl` before awaiting — this ensures concurrent callers for the same URL share a single in-flight fetch — `inst-cache-store`
3. [x] - `p1` - **TRY**: issue `fetch(absoluteChunkUrl)` — `inst-fetch-request`
   - **IF** `response.ok` is false **RETURN** `MfeLoadError` with HTTP status and URL — `inst-http-error`
   - **RETURN** `response.text()` — `inst-return-text`
4. [x] - `p1` - **CATCH**: remove the failed entry from `sourceTextCache` (prevents a stuck negative cache entry), then **RETURN** `MfeLoadError` wrapping the original error — `inst-cache-evict-on-error`
5. [x] - `p1` - **RETURN** the stored promise — `inst-return-promise`

### Recursive Blob URL Chain

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-blob-url-chain`

Processes a chunk and all its static relative imports depth-first. Within a single load, each filename is processed at most once. Bare specifiers in each chunk are rewritten to blob URLs from the per-load `sharedDepBlobUrls` map (built by `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls` before this chain runs).

**Inputs**: `loadState` (LoadBlobState), `filename` (string), `sourceTextCache` (handler-level `LruCache<string, Promise<string>>`)
**Outputs**: populates `loadState.blobUrlMap` with blob URLs for all processed chunks

1. [x] - `p1` - **IF** `loadState.blobUrlMap` already has `filename` OR `loadState.visited` contains `filename` **RETURN** (already processed) — `inst-already-processed`
2. [x] - `p1` - Add `filename` to `loadState.visited` — `inst-mark-visited`
3. [x] - `p1` - Fetch source text for `loadState.baseUrl + filename` via `cpt-frontx-algo-mfe-isolation-fetch-source` — `inst-fetch-chunk`
4. [x] - `p1` - Parse static import filenames via `cpt-frontx-algo-mfe-isolation-parse-imports` — `inst-parse-deps`
5. [x] - `p1` - **FOR EACH** dependency filename: recursively call `createBlobUrlChain(loadState, dep)` — `inst-recurse-deps`
6. [x] - `p1` - Rewrite module imports in the source text via `cpt-frontx-algo-mfe-isolation-rewrite-module-imports`, using `loadState.blobUrlMap` for already-processed relative deps, `loadState.baseUrl` for unprocessed relative deps, and `loadState.sharedDepBlobUrls` for bare specifiers — `inst-rewrite-source`
7. [x] - `p1` - Create a `Blob` from the rewritten source with MIME type `text/javascript` — `inst-create-blob`
8. [x] - `p1` - Call `URL.createObjectURL(blob)` to produce a blob URL — `inst-create-object-url`
9. [x] - `p2` - Do NOT call `URL.revokeObjectURL()` at any point — modules with top-level `await` continue evaluating asynchronously after `import()` resolves, and premature revocation causes `ERR_FILE_NOT_FOUND` — `inst-no-revoke`
10. [x] - `p1` - Store the blob URL in `loadState.blobUrlMap` keyed by `filename` — `inst-store-blob-url`

### Parse Static Import Filenames

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-parse-imports`

Extracts normalized dependency filenames from a chunk's source text so the recursive chain knows which sub-chunks to process.

**Inputs**: `sourceText` (string), `chunkFilename` (string)
**Outputs**: deduplicated list of resolved relative filenames

1. [x] - `p1` - Match all `from './...'` and `from '../...'` patterns in the source text — `inst-match-relative`
2. [x] - `p1` - **FOR EACH** match: resolve the relative specifier against `chunkFilename` using URL-based path resolution (synthetic `http://r/` base, then strip the leading `/`) — `inst-resolve-path`
3. [x] - `p1` - Deduplicate the resulting filename list — `inst-dedupe`
4. [x] - `p1` - **RETURN** the deduplicated list of resolved filenames — `inst-return-filenames`

### Rewrite Module Imports

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-rewrite-module-imports`

Replaces relative specifiers in a chunk's source text with either a blob URL (if the dependency has already been processed in the current load) or an absolute HTTP URL. Also rewrites bare specifiers to shared dep blob URLs and `import.meta.url` occurrences to the real base URL.

**Inputs**: `sourceText` (string), `chunkFilename` (string), `blobUrlMap` (Map), `baseUrl` (string), `sharedDepBlobUrls` (Map)
**Outputs**: fully rewritten source text (string)

1. [x] - `p1` - For each relative specifier (both `./` and `../`) in static `from '...'` patterns: resolve the relative specifier against `chunkFilename`; look up the resolved key in `blobUrlMap`; if found, replace with the blob URL; otherwise replace with `baseUrl + resolvedKey` — `inst-static-imports`
2. [x] - `p1` - Apply the same resolution and replacement to dynamic `import('./...')` and `import('../...')` patterns — `inst-dynamic-imports`
3. [x] - `p1` - For each bare specifier (non-relative, non-absolute) in static `from '...'` and dynamic `import('...')` patterns: look up the specifier in `sharedDepBlobUrls`; if found, replace with the blob URL via `cpt-frontx-algo-mfe-isolation-rewrite-bare-specifiers` — `inst-rewrite-bare-imports`
4. [x] - `p1` - Absolute URL specifiers (`http://`, `https://`, `blob:`) are not modified — `inst-skip-absolute`
5. [x] - `p1` - Replace all occurrences of `import.meta.url` with the string literal of `baseUrl` so that preload helper code inside the blob-evaluated chunk resolves absolute URLs against the real deployment origin rather than the blob URL — `inst-rewrite-import-meta-url`
6. [x] - `p1` - **RETURN** the fully rewritten source text — `inst-return-rewritten`

### Read Entry Expose Assets

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-parse-manifest-expose-metadata`

Reads the expose chunk path and CSS asset paths from `entry.exposeAssets`. This data is set at registration time — the registration code splits `mf-manifest.json`'s `exposes[]` array so that per-module assets travel with the entry, not the manifest.

**Inputs**: `entry` (MfeEntryMF with `exposeAssets`)
**Outputs**: `{ chunkPath, stylesheetPaths }` or `null`

1. [x] - `p1` - Read `entry.exposeAssets.js.sync[0]` as the primary expose chunk path — `inst-read-chunk-path`
2. [x] - `p1` - Read `entry.exposeAssets.css.sync` and `entry.exposeAssets.css.async` as CSS asset paths for mount-time injection — `inst-read-css-paths`
3. [x] - `p1` - **IF** chunk path is absent or empty **RETURN** null — `inst-no-chunk-path`
4. [x] - `p1` - **RETURN** `{ chunkPath, stylesheetPaths }` — `inst-return-metadata`

### Wrap Lifecycle With Remote Stylesheets

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-wrap-lifecycle-stylesheets`

When the remote emitted CSS paths, returns a lifecycle proxy that injects styles before `mount` and removes them on `unmount`.

1. [x] - `p1` - **IF** `stylesheetPaths` is empty **RETURN** the original lifecycle — `inst-no-css-proxy`
2. [x] - `p1` - **ELSE** **RETURN** object whose `mount` awaits `cpt-frontx-algo-mfe-isolation-inject-remote-stylesheets` then delegates — `inst-proxy-mount`
3. [x] - `p1` - `unmount` calls `cpt-frontx-algo-mfe-isolation-remove-injected-stylesheets` then delegates — `inst-proxy-unmount`

### Inject Remote Stylesheets

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-inject-remote-stylesheets`

For each path, resolves absolute URL with `baseUrl` and upserts a `<link rel="stylesheet">` under the mount container with a deterministic id prefix.

1. [x] - `p1` - **FOR EACH** path: `cpt-frontx-algo-mfe-isolation-upsert-mount-style-element` with `href` — `inst-inject-each-link`

### Remove Injected Stylesheets

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-remove-injected-stylesheets`

Queries `link[id^=prefix], style[id^=prefix]` within the mount container and removes each node.

1. [x] - `p1` - **RETURN** after removal (idempotent) — `inst-cleanup-styles`

### Upsert Mount Style Element

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-upsert-mount-style-element`

Creates or updates a `<link rel="stylesheet">` (href) or `<style>` (inline css) under `Element` or `ShadowRoot`, keyed by id.

1. [x] - `p1` - Locate existing node by id (`getElementById` or `querySelector`) — `inst-find-existing`
2. [x] - `p1` - **IF** href: ensure `LINK` element; set `href` — `inst-upsert-link`
3. [x] - `p1` - **ELSE** ensure `STYLE` element; set `textContent` — `inst-upsert-inline`

### Build Standalone ESM Shared Dependencies

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-build-standalone-esm`

The `frontx-mf-gts` Vite plugin builds a standalone ESM module for each entry declared in `rollupOptions.external` using esbuild. Each string in the externals list is treated as a distinct shared dep — whether a package root (e.g., `react`) or a subpath entry (e.g., `react-dom/client`, `@scope/pkg/sub`). The output is a self-contained ESM file per declared entry that can be fetched and blob-URL'd at runtime. CJS packages (react, react-dom) are converted to ESM with named re-exports. For a subpath entry, esbuild resolves the entry point via the parent package's `exports` field (native esbuild behavior — the plugin implements no subpath resolution), and the parent package is included in that entry's externals so internal parent-package references are preserved as bare specifiers and rewritten to the parent's blob URL at runtime.

**Inputs**: Build externals (`rollupOptions.external`) from the resolved Vite config (may include package roots and subpath entries), `node_modules/` (resolved packages)

1. [x] - `p1` - Derive the shared dep list from `rollupOptions.external` in the resolved Vite config; each entry (package root or subpath) becomes a distinct standalone ESM target — `inst-read-shared-deps-list`
2. [x] - `p1` - **FOR EACH** declared entry, resolve the parent package name: if the entry contains a `/` after the package scope (e.g., `react-dom/client` → parent `react-dom`, `@scope/pkg/sub` → parent `@scope/pkg`), strip the subpath to obtain the parent name; otherwise the entry is its own parent. The parent name locates the package's `package.json` (for transitive dep reading and version resolution) and ensures the parent is in the externals set when bundling that subpath — `inst-resolve-parent-package`
3. [x] - `p1` - Sort shared deps in dependency order (leaves first, then packages that import them) so that transitive shared deps can be externalized — `inst-sort-build-order`
4. [x] - `p1` - **FOR EACH** shared dep in dependency order: invoke esbuild with the declared entry name as input (esbuild resolves subpath entries via the parent package's `exports` field — no plugin-side subpath resolution), `format: 'esm'`, `bundle: true`, and all OTHER declared shared deps marked as `external` so their bare specifiers are preserved in output; for a subpath entry, the parent package is part of that externals set so internal parent-package references remain as bare specifiers; CJS packages are automatically converted to ESM by esbuild — `inst-esbuild-shared`
5. [x] - `p1` - **FOR EACH** CJS-origin shared dep: patch the esbuild output to add explicit named re-exports (e.g., `export { useState, useEffect, ... }` for react) so consuming modules can use named imports — `inst-patch-cjs-exports`
6. [x] - `p1` - Write each standalone ESM to `dist/shared/{normalizedName}.js`, where `normalizedName` replaces `/` with `-` (e.g., `react` → `shared/react.js`, `react-dom/client` → `shared/react-dom-client.js`) via the `normalizeDepName` rule — `inst-write-standalone-esm`

### Enrich mfe.json with Manifest Metadata

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-enrich-mfe-json`

The `frontx-mf-gts` Vite plugin enriches the human-authored `mfe.json` in-place with build-time metadata. After enrichment, `mfe.json` is the complete self-contained contract per MFE — no intermediate artifacts (`mfe.gts-manifest.json`) are produced.

**Inputs**: `mfe.json` (human-authored: entries, extensions, schemas), `dist/mf-manifest.json` (from `@module-federation/vite`: expose chunk paths, CSS assets), standalone ESM build output (from `cpt-frontx-algo-mfe-isolation-build-standalone-esm`)

1. [x] - `p1` - Read `dist/mf-manifest.json`: extract `exposes[]` array with per-module JS chunk paths and CSS asset paths; **IF** absent or unreadable **FAIL** with descriptive error — `inst-read-mf-manifest`
2. [x] - `p1` - Build `manifest.metaData`: set `publicPath`, `name`, and other top-level metadata from the build context — `inst-build-metadata`
3. [x] - `p1` - Build `manifest.shared[]` array: **FOR EACH** shared dep derived from build externals (entries treated as distinct — both package roots and subpath entries), set `chunkPath` to the normalized standalone ESM path (slashes replaced with hyphens via `normalizeDepName`; e.g., `react` → `shared/react.js`, `react-dom/client` → `shared/react-dom-client.js`), `version` from the parent package's `package.json` in `node_modules` (for a subpath entry, resolve version from the parent package's `package.json` — the subpath shares the parent's version; there is no subpath-specific `package.json`), and `unwrapKey` (the export key to access the module, or `null` for default export) — `inst-build-shared-entries`
4. [x] - `p1` - **FOR EACH** entry in `mfe.json`: resolve `entry.exposedModule` against `mf-manifest.json`'s `exposes[]` array by matching against each `exposes[].path`; **IF** no match is found **FAIL** with the unmatched expose name; inject the matched expose's `assets` as `entry.exposeAssets` — `inst-inject-expose-assets`
5. [x] - `p1` - Write the enriched `mfe.json` back in-place with the added `manifest` object (containing `metaData` and `shared[]`) and per-entry `exposeAssets` — `inst-write-enriched`

**Cross-runtime source text sharing**: the enriched `mfe.json` sets `shared[].chunkPath` to MFE-relative paths (e.g., `shared/react.js`); the handler resolves these against `publicPath` to fetch source text. The handler deduplicates shared dep source text via `sharedDepTextCache` keyed by `name@version` — regardless of origin server or absolute URL, the same `name@version` produces a cache hit. Result: one download per `name@version`, N isolated blob URL evaluations. Different versions produce separate downloads — this is correct behavior.

---

## 4. States (CDSL)

### LoadBlobState (Per-Load Isolation Map)

- [x] `p1` - **ID**: `cpt-frontx-state-mfe-isolation-load-blob-state`

Tracks the blob URL map, visitation set, and shared dep blob URLs for a single MFE load call. Created fresh for each `loadExposedModuleIsolated()` invocation. The initial metadata is sourced from the resolved `MfManifest` GTS entity.

1. [x] - `p1` - **FROM** INIT **TO** ACTIVE **WHEN** the `MfManifest` has been resolved and `loadExposedModuleIsolated()` creates a new `LoadBlobState` with empty `blobUrlMap`, `visited` set, and `sharedDepBlobUrls` map — `inst-state-init`
2. [x] - `p1` - **FROM** ACTIVE **TO** ACTIVE (VISITED) **WHEN** `createBlobUrlChain` adds a filename to `visited` — `inst-state-visited`
3. [x] - `p1` - **FROM** ACTIVE (VISITED) **TO** ACTIVE (MAPPED) **WHEN** a blob URL is inserted into `blobUrlMap` for the visited filename — `inst-state-mapped`
4. [x] - `p1` - **FROM** ACTIVE **TO** COMPLETE **WHEN** the expose blob URL is successfully imported and the lifecycle module is returned — `inst-state-complete`
5. [x] - `p1` - **FROM** ACTIVE **TO** FAILED **WHEN** any step throws `MfeLoadError` — `inst-state-failed`
6. [x] - `p2` - `LoadBlobState` instances are not retained after the load completes; blob URLs in `blobUrlMap` are never revoked and persist for the page lifetime — `inst-state-gc`

### SourceTextCache (Handler-Level)

- [x] `p1` - **ID**: `cpt-frontx-state-mfe-isolation-source-cache`

Tracks the fetch state of each individual chunk URL for the lifetime of the `MfeHandlerMF` instance. The cache stores source text for chunk files (JS modules in the blob URL chain). Manifest content is resolved from GTS entities and cached in the handler's `ManifestCache`, not in this source text cache.

The cache is bounded via an `LruCache<string, Promise<string>>` wrapper with a fixed capacity (`SOURCE_TEXT_CACHE_CAPACITY`). When the capacity is reached, the least-recently-accessed URL is evicted. A subsequent access to an evicted URL re-fetches and re-caches; eviction is correctness-safe because the blob URL chain builds from fresh source text on each access path.

1. [x] - `p1` - **FROM** ABSENT **TO** PENDING **WHEN** a fetch for `absoluteChunkUrl` is initiated and the `Promise<string>` is stored in `sourceTextCache` — `inst-cache-pending`
2. [x] - `p1` - **FROM** PENDING **TO** RESOLVED **WHEN** `fetch()` succeeds and the promise resolves with source text — `inst-cache-resolved`
3. [x] - `p1` - **FROM** PENDING **TO** ABSENT **WHEN** `fetch()` fails; the entry is removed from `sourceTextCache` to avoid a stuck negative cache — `inst-cache-evicted`
4. [x] - `p1` - **FROM** RESOLVED **TO** RESOLVED **WHEN** subsequent loads request the same URL and the entry is still cached (cache hit; no new fetch; entry moves to most-recently-used position) — `inst-cache-hit-state`
5. [x] - `p1` - **FROM** RESOLVED **TO** ABSENT **WHEN** the cache reaches `SOURCE_TEXT_CACHE_CAPACITY` and this URL is the least-recently-accessed entry; the entry is dropped to admit a new URL; a later access re-fetches — `inst-cache-lru-evicted`

### SharedDepTextCache (Handler-Level)

- [x] `p1` - **ID**: `cpt-frontx-state-mfe-isolation-shared-dep-cache`

Tracks the fetch state of each shared dependency's standalone ESM source text for the lifetime of the `MfeHandlerMF` instance. Keyed by `name@version` (e.g. `react@19.2.4`), so the first MFE to load a given shared dep caches its source text and subsequent MFEs declaring the same `name@version` get a cache hit regardless of which origin server serves the chunk.

The cache is bounded via an `LruCache<string, Promise<string>>` wrapper with a fixed capacity (`SHARED_DEP_TEXT_CACHE_CAPACITY`). When the capacity is reached, the least-recently-accessed `name@version` entry is evicted. A subsequent access to an evicted key re-fetches and re-caches; eviction is correctness-safe because per-load blob URLs are built from whatever source text is returned (cached or freshly fetched), and isolation is provided by the per-load blob URL creation, not by cache residency.

1. [x] - `p1` - **FROM** ABSENT **TO** PENDING **WHEN** a fetch for a `name@version` not currently cached is initiated and the `Promise<string>` is stored in `sharedDepTextCache` — `inst-shared-cache-pending`
2. [x] - `p1` - **FROM** PENDING **TO** RESOLVED **WHEN** `fetch()` succeeds and the promise resolves with source text — `inst-shared-cache-resolved`
3. [x] - `p1` - **FROM** PENDING **TO** ABSENT **WHEN** `fetch()` fails; the identity-guarded `.catch` removes the failed entry from `sharedDepTextCache` so a later load can retry without receiving the cached rejection — `inst-shared-cache-evicted`
4. [x] - `p1` - **FROM** RESOLVED **TO** RESOLVED **WHEN** subsequent loads request the same `name@version` and the entry is still cached (cache hit; no new fetch; entry moves to most-recently-used position) — `inst-shared-cache-hit-state`
5. [x] - `p1` - **FROM** RESOLVED **TO** ABSENT **WHEN** the cache reaches `SHARED_DEP_TEXT_CACHE_CAPACITY` and this `name@version` is the least-recently-accessed entry; the entry is dropped to admit a new one; a later access re-fetches — `inst-shared-cache-lru-evicted`

---

## 5. Definitions of Done

### Blob URL Isolation Core

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-blob-core`

`MfeHandlerMF` achieves per-load module isolation through the blob URL chain mechanism. Each load produces independent module evaluations with no shared object references between MFEs.

**Implementation details**:
- File: `packages/screensets/src/mfe/handler/mf-handler.ts`
- Key types: `LoadBlobState` (per-load, includes `sharedDepBlobUrls`), `ManifestCache`, `MfeLoaderConfig`
- Constructor: `MfeHandlerMF(handledBaseTypeId: string, config?: MfeLoaderConfig)` — does NOT take `typeSystem`; the registry owns type hierarchy checks. Consumer passes the GTS base type ID constant (e.g., `HAI3_MFE_ENTRY_MF`) at instantiation.
- Public entry: `MfeHandlerMF.load(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>>`
- Shared dep isolation is achieved through blob URL evaluation of standalone ESMs

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`
- `cpt-frontx-algo-mfe-isolation-parse-manifest-expose-metadata`
- `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`
- `cpt-frontx-algo-mfe-isolation-rewrite-bare-specifiers`
- `cpt-frontx-algo-mfe-isolation-fetch-source`
- `cpt-frontx-algo-mfe-isolation-blob-url-chain`
- `cpt-frontx-algo-mfe-isolation-parse-imports`
- `cpt-frontx-algo-mfe-isolation-rewrite-module-imports`
- `cpt-frontx-algo-mfe-isolation-wrap-lifecycle-stylesheets`
- `cpt-frontx-algo-mfe-isolation-inject-remote-stylesheets`
- `cpt-frontx-algo-mfe-isolation-remove-injected-stylesheets`
- `cpt-frontx-algo-mfe-isolation-upsert-mount-style-element`
- `cpt-frontx-state-mfe-isolation-load-blob-state`
- `cpt-frontx-state-mfe-isolation-source-cache`

**Covers (PRD)**:
- `cpt-frontx-fr-blob-fresh-eval`
- `cpt-frontx-fr-blob-no-revoke`
- `cpt-frontx-fr-blob-source-cache`
- `cpt-frontx-fr-blob-import-rewriting`
- `cpt-frontx-fr-blob-recursive-chain`
- `cpt-frontx-fr-blob-per-load-map`
- `cpt-frontx-fr-sharescope-construction` (standalone ESM blob URLs with bare specifier rewriting)
- `cpt-frontx-fr-sharescope-concurrent`
- `cpt-frontx-nfr-perf-blob-overhead`
- `cpt-frontx-nfr-sec-csp-blob`

**Covers (DESIGN)**:
- `cpt-frontx-principle-mfe-isolation`
- `cpt-frontx-constraint-zero-cross-deps-at-l1`
- `cpt-frontx-component-screensets` (blob loader subsystem)
- `cpt-frontx-seq-mfe-loading`

### Module Federation Vite Plugin and frontx-mf-gts

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-mf-vite-plugin`

`@module-federation/vite` handles expose compilation and `mf-manifest.json` generation (CSS assets, expose chunk paths). Shared deps are externalized via `build.rollupOptions.external`, preserving bare specifiers in output. The `frontx-mf-gts` Vite plugin runs in `closeBundle` and performs two tasks: (1) builds standalone ESM modules for each shared dep from `node_modules` using esbuild, and (2) enriches `mfe.json` in-place with manifest metadata, shared dep info, and per-entry `exposeAssets`.

**Implementation details**:
- `@module-federation/vite`: expose compilation, `mf-manifest.json` generation
- `frontx-mf-gts` Vite plugin: reads `mf-manifest.json` and `mfe.json`; builds standalone ESMs into `dist/shared/` — each entry in `rollupOptions.external` (including subpath entries like `react-dom/client`) becomes a distinct standalone ESM, and when building a subpath entry the parent package is added to that entry's externals so internal parent-package references are rewritten to the parent's blob URL at runtime; subpath imports NOT declared in `rollupOptions.external` remain bundled inline into their consuming dep's standalone ESM, with the declared parent-package externals preserved; enriches `mfe.json` in-place with `manifest.metaData`, `manifest.shared[]` (with `chunkPath`/`version`/`unwrapKey`), and `entries[].exposeAssets`
- Both plugins registered in each MFE's `vite.config.ts`; enriched `mfe.json` is the sole output artifact

**Implements**:
- `cpt-frontx-flow-mfe-isolation-build-v2` (steps 1-9)
- `cpt-frontx-algo-mfe-isolation-build-standalone-esm`
- `cpt-frontx-algo-mfe-isolation-enrich-mfe-json`

**Covers (PRD)**:
- `cpt-frontx-fr-externalize-filenames`
- `cpt-frontx-fr-externalize-build-only`

**Covers (DESIGN)**:
- `cpt-frontx-principle-mfe-isolation` (build-side enforcement)
- `cpt-frontx-component-screensets` (shared Vite tooling)

### MFE-Internal Dataflow

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-internal-dataflow`

Each MFE package bootstraps its own isolated `HAI3App` and exposes it for use by lifecycle React components. No direct Redux imports appear in MFE source code.

**Implementation details**:
- Files: `src/mfe_packages/<mfe-name>/src/init.ts` (module-level bootstrap)
- Pattern: `createHAI3().use(effects()).use(queryCacheShared()).use(mock()).build()` — `queryCacheShared()` joins the host `queryCache()` runtime; do not use `queryCache()` in MFE `init.ts`
- MFE lifecycle components wrap their React tree in `<HAI3Provider app={mfeApp}>`

**Implements**:
- `cpt-frontx-flow-mfe-isolation-mfe-bootstrap`

**Covers (PRD)**:
- `cpt-frontx-fr-dataflow-internal-app`
- `cpt-frontx-fr-dataflow-no-redux`

**Covers (DESIGN)**:
- `cpt-frontx-principle-mfe-isolation` (runtime-side enforcement)
- `cpt-frontx-constraint-zero-cross-deps-at-l1`

### MfManifest Type and GTS Schema Update

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-mfmanifest-type`

The `MfManifest` TypeScript interface and the GTS schema `mf_manifest.v1.json` (registered as `gts://gts.hai3.mfes.mfe.mf_manifest.v1~`) are updated to include the fields produced by the `frontx-mf-gts` Vite plugin. There is no envelope field, no version detection, and no backward compatibility path. The GTS schema `mf_manifest.v1.json` keeps its current identifier — "v1" is simply the schema's stable ID, not a version in a backward-compat sense.

Key fields set by the `frontx-mf-gts` plugin (from the handler's perspective):
- `metaData.publicPath: string` — the base URL for resolving chunk paths at runtime
- Per-shared-dep: `chunkPath: string` — MFE-relative path to the standalone ESM (e.g., `shared/react.js`); the handler resolves against `publicPath`; `version: string` — semver version from `node_modules`; and `unwrapKey: string | null` — the export key to access the module inside the standalone ESM (`null` means `'default'` is used)

> **Cross-reference**: The authoritative field listing for `MfManifest` (including `shared`, `metaData`, `exposes`, and their sub-fields) is maintained in the mfe-registry FEATURE DoD `cpt-frontx-dod-mfe-registry-mfmanifest-schema-update`. This isolation FEATURE DoD covers only the runtime handler's perspective on the type.

**Implementation details**:
- File: `packages/screensets/src/mfe/types/mf-manifest.ts`
- The `GtsPlugin` registers `mf_manifest.v1.json` as a first-class schema alongside all other built-in schemas
- All runtime code (`MfeHandlerMF`, `ManifestCache`, `resolveManifest()`) works exclusively with the `MfManifest` TypeScript interface; no runtime code imports or references GTS schemas directly

**Covers (PRD)**:
- `cpt-frontx-fr-blob-source-cache` (chunk paths from manifest enable cache keying)
- `cpt-frontx-fr-sharescope-construction` (chunk path determines whether shared dep blob URL is created)
- `cpt-frontx-fr-externalize-filenames` (manifest provides stable chunk paths)

**Covers (DESIGN)**:
- `cpt-frontx-contract-mfe-manifest`

---

### ChildMfeBridge Abstract Class Contract

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-child-bridge-contract`

`ChildMfeBridge` is the object passed to the MFE by the host when `MfeEntryLifecycle.mount(bridge)` is called. The MFE receives it and may use it to communicate back with the host. It is an abstract class (consistent with all other public abstractions: `MfeHandler`, `MfeBridgeFactory`, `MfeRegistry`, `ActionsChainsMediator`, `RuntimeCoordinator`) — concrete implementations are `@internal`. The abstract class defines six members:

- `domainId` — the ID of the domain this extension belongs to; provided by the registry at bridge creation
- `instanceId` — the extension instance ID; used as the routing key for extension-level action delivery
- `executeActionsChain` — allows the child MFE to send actions back to the host mediator
- `subscribeToProperty` / `getProperty` — read-only access to shared property values broadcast by the host
- `registerActionHandler(actionTypeId, handler)` — registers an `ActionHandler` abstract class instance for a specific action type so the mediator can route actions targeted at `instanceId` and `actionTypeId`; the bridge wires each call to `mediator.registerHandler(extensionId, actionTypeId, handler)`; all handlers are automatically unregistered when the bridge is disposed. The MFE may call this multiple times — once per action type it handles.

`ActionHandler` is an abstract class: `abstract handleAction(actionTypeId: string, payload: Record<string, unknown> | undefined): Promise<void>`. It is the only handler contract — no `ActionHandlerFn` function alias, no `ActionHandler` interface. The MFE subclasses `ActionHandler` for each action type it wishes to handle; the system manages routing and lifecycle. Handlers are invoked by the mediator via `handler.handleAction(actionTypeId, payload)` when an actions chain targets this extension.

**Entry action field semantics**: The `actions` array on `MfeEntry` declares the action types this entry is capable of **receiving and executing** — the mediator dispatches an extension-targeted action to the entry only when `action.type` appears in this array. Lifecycle actions targeting the domain are routed by the domain's per-action-type `ActionHandler` instances to all mounted extensions independently of `entry.actions`. The `domainActions` array on `MfeEntry` declares the action types the **parent domain must support** for this entry to be injectable — it is consulted by contract validation at registration time (Rule 3: `entry.domainActions ⊆ domain.actions`, with infrastructure lifecycle actions exempt), not at dispatch time.

Action target contract enforcement is two-layered: (1) **GTS schema validation** — each action schema constrains its `target` field via `x-gts-ref`; lifecycle action schemas restrict `target` to domain IDs only; custom MFE action schemas restrict `target` to specific extension IDs; the mediator validates each action instance against its schema before routing, and invalid targets are rejected by the type system. (2) **Runtime entry declaration validation** — before dispatching an extension-targeted action, the mediator confirms that the target entry's `actions` array contains the action type; undeclared actions fail the chain with an error naming the action type and entry ID. This ensures an entry receives only the actions it explicitly opts into, even when the enclosing domain supports a broader action set. Infrastructure lifecycle actions (`HAI3_ACTION_LOAD_EXT`, `HAI3_ACTION_MOUNT_EXT`, `HAI3_ACTION_UNMOUNT_EXT`) target domains, not extensions, and are exempt from this runtime check. GTS alone is NOT sufficient — schema validation enforces schema/target shape; runtime entry validation enforces per-entry opt-in.

**Implements**:
- `cpt-frontx-flow-mfe-registry-register-extension-handler`

**Covers (DESIGN)**:
- `cpt-frontx-interface-child-mfe-bridge`
- `cpt-frontx-seq-extension-action-delivery`

---

### MFE Author State Lifecycle Boundary

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-author-state-lifecycle`

The MFE entry's `mount(container, bridge, mountContext?)` is the only place per-instance state is constructed; the matching `unmount(container)` is the only place that state is torn down. Module-scope state established when the bundle first evaluates (the `HAI3App` instance built in `init.ts`, plugin registrations, module-level singletons and caches) persists for the lifetime of the load — the host neither resets it nor offers an API to reset it, because never-revoke (`cpt-frontx-fr-blob-no-revoke`) makes any such reset unsafe.

**Implementation details**:
- Each `mount()` call creates an independent set of resources: React root via `createRoot(container)`, `bridge.subscribeToProperty()` subscriptions, `bridge.registerActionHandler()` registrations, timers, `MutationObserver` / `IntersectionObserver` instances, DOM nodes attached to `container`.
- The matching `unmount()` call MUST tear those resources down: unsubscribe property subscriptions, cancel timers, call `root.unmount()` on the React root, disconnect observers, remove DOM nodes from `container`, drop references to the bridge.
- `unmount()` MUST NOT touch module-level singletons (the `HAI3App` instance, plugin registrations, blob URLs, module-scope caches).
- An MFE that needs fresh module-scope state per use case keeps that state at instance scope inside `mount()`, not at module scope in `init.ts`. "Cycle the MFE" is therefore an MFE-author operation realised by unregistering and re-registering with a fresh ID — this triggers a new load and a new module evaluation — not a host-side reset hook.

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-author-state-lifecycle`

**Covers (DESIGN)**:
- `cpt-frontx-principle-mfe-isolation` (instance-scope cleanup boundary)

---

## 6. Acceptance Criteria

### Behavioral (verified in browser)

- [x] **AC-1: Source text sharing** — shared dep source text is fetched at most once per `name@version` across ALL runtimes (host and MFEs), in any load order; the browser Network tab shows a single request for each shared dep regardless of how many runtimes consume it
- [x] **AC-2: Instance isolation** — each runtime gets its own isolated instance of every shared library; `Object.is(runtimeA_React, runtimeB_React)` is `false` for any two runtimes that both load `react`
- [x] **AC-3: Manifest as source of truth** — enriched `mfe.json` (registered as `gts.hai3.mfes.mfe.mf_manifest.v1~` GTS entities) declares shared dependencies with their versions; the handler reads `shared[].name`, `shared[].version`, `shared[].chunkPath`, and `shared[].unwrapKey` from the manifest to drive source text sharing and blob URL evaluation
- [x] **AC-4: GTS validation** — manifest instances are validated by the GTS plugin; MFEs render with correct GTS type IDs (domain ID, instance ID) visible in the runtime Bridge Info
- [x] **AC-5: Version separation** — different versions of the same shared package produce separate downloads and separate isolated instances; `react@18` and `react@19` from different MFEs are NOT shared
- [x] **AC-6: Shared properties** — shared properties (theme, language) reach child runtimes via the bridge; child MFE components display the host-set theme and language values
- [x] **AC-7: Actions chain routing** — `mount_ext` actions chain works across package switches in any order (MFE A → MFE B → MFE A), including programmatic navigation via `executeActionsChain`; zero `OperationTimeout` errors during cross-package mount/unmount cycles
- [x] **AC-8: Mount/unmount instance hygiene** — repeatedly mounting and unmounting the same MFE entry on the same container leaves no leaked instance-scope resources: after `unmount()` returns, prior-mount property subscriptions emit no further callbacks, prior-mount action handlers no longer receive routed actions, and the React root attached by the prior mount is gone from the DOM

### Structural (verified by code/tests)

- [x] Two MFEs loaded concurrently each receive their own unique blob URL and fresh module evaluation; no `MfeLoadError` is thrown in the concurrent case
- [x] `import.meta.url` occurrences in blob-URL'd chunk source text are replaced with the manifest base URL before the blob is created
- [x] Shared dep standalone ESMs are fetched once via `sharedDepTextCache` (keyed by `name@version`) and converted to fresh blob URLs per load; the handler's `buildSharedDepBlobUrls` processes deps in dependency order (leaves first) to ensure all bare specifiers are rewritten before blob URL creation
- [x] Bare specifiers in expose chunks are rewritten to blob URLs from the per-load `sharedDepBlobUrls` map; unrecognized bare specifiers (not in shared deps) are left unmodified
- [x] Shared dep isolation is handled entirely by the handler's blob URL mechanism (standalone ESMs → per-load blob URLs → bare specifier rewriting)
- [x] Blob URLs are never revoked (`URL.revokeObjectURL` is never called)
- [x] A missing manifest, missing fields, or network error throws `MfeLoadError` with descriptive message
- [x] Shared deps are built as standalone ESMs by the `frontx-mf-gts` plugin (via esbuild) into `dist/shared/`; CJS packages (react, react-dom) are patched with named re-exports; subpath entries declared in `rollupOptions.external` (e.g., `react-dom/client`) each get their own standalone ESM with the parent package added to that entry's externals so internal parent-package references are rewritten to the parent's blob URL at runtime; subpath imports NOT declared in `rollupOptions.external` remain bundled inline into their consuming dep's standalone ESM with declared parent-package externals preserved
- [x] The `frontx-mf-gts` plugin enriches `mfe.json` in-place: `manifest.shared[].chunkPath` set to MFE-relative paths (`shared/{name}.js`); the handler resolves against `publicPath` and deduplicates via `sharedDepTextCache` keyed by `name@version`; no intermediate `mfe.gts-manifest.json` artifact
- [x] MFE `vite.config.ts` uses `shared: {}` (empty) and `build.rollupOptions.external` for shared deps; expose chunks contain bare specifiers for shared deps
- [x] MFE `init.ts` files contain no direct imports from `react-redux`, `redux`, or `@reduxjs/toolkit`
- [x] Each MFE entry's `mount()` and `unmount()` are paired: every resource created in `mount()` (React root, `bridge.subscribeToProperty` returns, `bridge.registerActionHandler` registrations, timers, observers, DOM nodes) is disposed in the matching `unmount()`; no `unmount()` mutates module-level singletons (`HAI3App`, plugin registrations, module-scope caches)

---

## 7. State Lifecycle

The loader and the MFE entry sit on opposite sides of a single, sharp responsibility boundary. The host owns module-scope lifetime (load → page unload, no revocation); the MFE author owns instance-scope lifetime (mount → unmount).

**Host loader (`MfeHandlerMF`) owns module-scope lifetime.**

- The host fetches source text, builds blob URLs, evaluates the bundle, and returns the lifecycle. From the moment a load completes, every blob URL produced for that load is live for the page lifetime — including transitive shared dep blob URLs, the expose chunk blob URL, and any chunks reached through the recursive chain.
- The host does NOT call `URL.revokeObjectURL()`. Ever. This is a correctness invariant of the loader: ES module evaluation is deferred and asynchronous, and the only safe lower bound for "this URL is no longer needed" is page unload, which the browser handles automatically. See FR `cpt-frontx-fr-blob-no-revoke`.
- Module-scope state established during evaluation (the React module instance, store singletons declared at module scope, plugin registrations performed in `init.ts`, registered effects, entries pushed into module-level caches) therefore persists for the lifetime of the load. The host treats this state as immutable from its perspective — it neither resets it nor offers an API to reset it.
- The `sharedDepTextCache` keyed by `name@version` is host-managed and shared across all runtimes; the `sourceTextCache` keyed by absolute URL is host-managed and bounded via LRU. Neither is touched on unmount.

**MFE author owns instance-scope lifetime.**

- The lifecycle's `mount(container, bridge, mountContext?)` is called once per mount and is the only place per-instance state may be created: React roots, subscriptions, timers, MutationObservers, IntersectionObservers, action handlers registered through `bridge.registerActionHandler()`, listeners registered with `bridge.subscribeToProperty()`, DOM nodes attached to the mount container.
- The lifecycle's `unmount(container)` is called once per mount and MUST tear those resources down. The MFE author MUST NOT rely on `unmount()` to reset module-level singletons or to drop blob URLs — it is purely an instance-lifecycle hook. See FR `cpt-frontx-fr-mfe-author-state-lifecycle`.
- An MFE that wants fresh module state per use case (a wizard that should reset on every open, a modal that should not preserve form data across opens) MUST keep that state at instance scope, not at module scope. The boundary is enforceable by the author at the source level — no host-side flag can simulate it without breaking the never-revoke invariant.
- Any module-scope cache the MFE chooses to keep is the MFE's contract with itself — the host treats it as opaque and durable.

**What this rules out.**

- The loader does NOT expose a "clear cached lifecycle" or "revoke this extension's blob URLs" hook. Any such hook would have to either violate `cpt-frontx-fr-blob-no-revoke` or pretend to clean up while leaking — neither is acceptable.
- The host does NOT trigger a fresh `handler.load()` on remount. Remount reuses the existing lifecycle reference returned by the original load, calling its `mount()` again. The MFE author sees mount/unmount cycles, not load/load cycles.
- "Cycle the MFE" is therefore an MFE-author operation, not a host operation. An MFE that needs to be reset MUST be unregistered and re-registered with a fresh ID; this triggers a new load and a new evaluation.

---

## Additional Context

**Never-revoke is a top-level-await correctness invariant**: The `import()` function resolves when a module is parsed and its top-level synchronous code has run. Modules with top-level `await` or dynamic `import()` internally continue evaluating asynchronously after the outer `import()` promise resolves. If the blob URL is revoked at this point, the async continuation cannot fetch the already-queued sub-module evaluation and fails with `ERR_FILE_NOT_FOUND` — nondeterministically, depending on scheduler timing. Never-revoke is therefore a correctness rule for the loader, not a memory-hygiene policy. Blob URLs are cleaned up automatically by the browser on page unload.

**Decision rationale and rejected alternatives**: The host/author state-lifecycle boundary documented in §7 is recorded as ADR-0020 (`cpt-frontx-adr-mfe-state-lifecycle-boundary`), which captures the full pros/cons analysis of the alternatives evaluated and rejected (`persistAcrossMounts: false` flag with revocation on unmount, per-mount fresh `load()` with force-reload, iframe-per-instance, `new Function`-based runtime instantiation, build-time whitelist enforcement on expose chains). Future revisits should start there rather than re-deriving the analysis.

**Open follow-up — heap snapshot validation**: A single DevTools heap-snapshot run on a representative session remains useful as a sanity check on the per-load bound — does the retained set per load match the static prediction? Lower priority than the artifact updates, runs whenever a mount-heavy regression is suspected.

**Per-load isolation mechanism**: Each load creates fresh blob URLs for ALL shared deps from the handler-level `sharedDepTextCache` (keyed by `name@version`). Even though the source text is identical (same `name@version`), each `URL.createObjectURL()` call produces a unique blob URL that the browser evaluates as a fresh module — independent state, independent closures. The `sharedDepBlobUrls` map and `blobUrlMap` are scoped to a single load; the `sharedDepTextCache` is handler-level (keyed by `name@version`) to avoid redundant fetches across runtimes.

**Shared dependency resolution**: Enriched `mfe.json` (produced by the `frontx-mf-gts` plugin) provides `chunkPath`, `version`, and `unwrapKey` directly on each shared dependency entry. The handler reads these fields from the `MfManifest` GTS entity; any dependency without a `chunkPath` is skipped and the MFE falls back to its own bundled copy. `unwrapKey` identifies the exact module export key — no heuristics are applied at runtime.

**Bare specifier rewriting**: Shared deps are externalized via `build.rollupOptions.external`, so expose chunks contain bare specifiers (`from "react"`, `from "react-dom"`). The handler's blob URL chain rewrites these bare specifiers to the per-load shared dep blob URLs built by `buildSharedDepBlobUrls`. This is the key mechanism that connects expose chunks to isolated shared dep instances.

**CSP compatibility**: The isolation mechanism uses `Blob` objects and `URL.createObjectURL`, not `eval()` or `new Function()`. The only required CSP directive addition is `blob:` in `script-src`. The `cpt-frontx-nfr-sec-csp-blob` requirement is satisfied by construction.

**Per-load isolation for concurrent loads**: Each load creates its own `LoadBlobState` with independent `sharedDepBlobUrls` and `blobUrlMap`. Concurrent loads for different MFEs produce completely independent blob URL sets. Isolation is guaranteed by the blob URL mechanism itself: each `URL.createObjectURL()` produces a unique URL that evaluates as an independent module.

**`import.meta.url` rewriting**: The blob URL mechanism assigns blob URLs as the module's `import.meta.url`, not the original deployment origin. MFE chunks produced by `@module-federation/vite` may include preload helper code that constructs absolute URLs from `import.meta.url`. To fix this, the handler replaces every `import.meta.url` occurrence in the source text with the resolved absolute base URL (from `manifest.metaData.publicPath`) before creating the `Blob`. This is applied in the same rewriting pass as relative and bare import specifier replacement.

**mfe.json as the complete contract**: The enriched `mfe.json` is the sole artifact the host/backend needs per MFE. It contains: human-authored entries, extensions, and schemas, plus plugin-enriched `manifest.metaData`, `manifest.shared[]` (with `chunkPath`/`version`/`unwrapKey`), and per-entry `exposeAssets`. No intermediate artifacts (`mfe.gts-manifest.json`) are produced. The generation script is a temporary aggregator that will be replaced by a backend API returning the same `mfe.json` content.
