# Feature: MFE Blob URL Isolation


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [MFE Load via Blob URL Isolation](#mfe-load-via-blob-url-isolation)
  - [MFE Build with Externalize Plugin](#mfe-build-with-externalize-plugin)
  - [MFE-Internal Bootstrap](#mfe-internal-bootstrap)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Build Share Scope](#build-share-scope)
  - [Blob URL Get Closure](#blob-url-get-closure)
  - [Fetch Source Text (with Cache)](#fetch-source-text-with-cache)
  - [Recursive Blob URL Chain](#recursive-blob-url-chain)
  - [Parse Static Import Filenames](#parse-static-import-filenames)
  - [Rewrite Module Imports](#rewrite-module-imports)
  - [Parse Expose Chunk Filename](#parse-expose-chunk-filename)
  - [Write Share Scope to Global](#write-share-scope-to-global)
  - [hai3-mfe-externalize: Rename Shared Chunks](#hai3-mfe-externalize-rename-shared-chunks)
  - [hai3-mfe-externalize: Map Bundled Sub-Chunks to Packages](#hai3-mfe-externalize-map-bundled-sub-chunks-to-packages)
  - [hai3-mfe-externalize: Rewrite Bundled Imports to importShared](#hai3-mfe-externalize-rewrite-bundled-imports-to-importshared)
- [4. States (CDSL)](#4-states-cdsl)
  - [LoadBlobState (Per-Load Isolation Map)](#loadblobstate-per-load-isolation-map)
  - [SourceTextCache (Handler-Level)](#sourcetextcache-handler-level)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Blob URL Isolation Core](#blob-url-isolation-core)
  - [hai3-mfe-externalize Vite Plugin](#hai3-mfe-externalize-vite-plugin)
  - [MFE-Internal Dataflow](#mfe-internal-dataflow)
  - [SharedDependencyConfig chunkPath Field](#shareddependencyconfig-chunkpath-field)
- [6. Acceptance Criteria](#6-acceptance-criteria)
- [Additional Context](#additional-context)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-hai3-featstatus-mfe-isolation`

- [x] `p2` - `cpt-hai3-feature-mfe-isolation`
---

## 1. Feature Context

### 1.1 Overview

MFE Blob URL Isolation delivers per-microfrontend JavaScript module isolation by evaluating each MFE bundle in a fresh module scope via the browser's blob URL mechanism. Without this, dynamically loaded MFE bundles share the same module registry as the host application: two MFEs that each depend on `react` would receive the same React instance, meaning their fiber trees, hooks state, and Redux stores bleed into each other.

The isolation is achieved through five coordinated responsibilities:

1. **Source text fetching and caching** — each MFE chunk is fetched once; subsequent loads reuse the cached text.
2. **Import rewriting** — relative specifiers in fetched source text are resolved to either existing blob URLs (from the per-load map) or absolute HTTP URLs, so blob-evaluated modules can locate their dependencies.
3. **Recursive blob URL chain** — the expose chunk and every static dependency it imports are processed depth-first; common transitive dependencies within one load are blob-URL'd once, then reused by the shared map.
4. **Share scope construction** — per-load `get()` closures written to `globalThis.__federation_shared__` intercept the federation runtime's `importShared()` and redirect it through the blob URL chain.
5. **Vite externalize plugin** — at build time, the `hai3-mfe-externalize` plugin transforms all bundled-package imports in code-split chunks to `importShared()` calls, and renames shared dependency chunks to deterministic filenames so manifest `chunkPath` values remain stable across rebuilds.

The MFE-internal dataflow completes the isolation: each MFE creates its own `HAI3App` with an isolated Redux store and EventBus via the blob-URL-evaluated `@gears-frontx/react`; no direct `react-redux` or `@reduxjs/toolkit` imports are permitted.

**Primary value**: MFEs maintain fully independent module-level state — React fiber trees, hooks, stores — regardless of shared dependencies.

**Key assumptions**: The host application runs in a browser with support for `Blob`, `URL.createObjectURL`, and dynamic `import()`. MFE builds use `@originjs/vite-plugin-federation` with the `hai3-mfe-externalize` plugin.

### 1.2 Purpose

Enable multiple independently deployed MFE bundles to coexist in the same browser page without module state leakage, while minimizing redundant network requests through source text caching.

**Success criteria**: `Object.is(mfeA_React, mfeB_React)` is `false` for any two concurrently loaded MFEs that both declare `react` in their `sharedDependencies`.

### 1.3 Actors

- `cpt-hai3-actor-microfrontend`
- `cpt-hai3-actor-build-system`
- `cpt-hai3-actor-host-app`
- `cpt-hai3-actor-runtime`

### 1.4 References

- Overall Design: [DESIGN.md](../../DESIGN.md)
- Decomposition entry: [DECOMPOSITION.md §2.3](../../DECOMPOSITION.md)
- PRD: [PRD.md](../../PRD.md) — sections 5.6 (MFE Blob URL Isolation), 5.7 (MFE Externalize Plugin), 5.8 (MFE Internal Dataflow), 5.9 (MFE Share Scope Management)
- ADR: `cpt-hai3-adr-blob-url-mfe-isolation`
- Depends on feature: `cpt-hai3-feature-screenset-registry`

---

## 2. Actor Flows (CDSL)

### MFE Load via Blob URL Isolation

- [x] `p1` - **ID**: `cpt-hai3-flow-mfe-isolation-load`

**Actors**:
- `cpt-hai3-actor-host-app`
- `cpt-hai3-actor-microfrontend`
- `cpt-hai3-actor-runtime`

1. [x] - `p1` - Host requests load of an `MfeEntryMF` through the screensets registry — `inst-host-request-load`
2. [x] - `p1` - `MfeHandlerMF.load()` delegates to `loadInternal()` wrapped in retry logic — `inst-retry-wrapper`
3. [x] - `p1` - `loadInternal()` resolves the `MfManifest` (inline object or cached by ID) — `inst-resolve-manifest`
4. [x] - `p1` - `loadExposedModuleIsolated()` derives `baseUrl` from `manifest.remoteEntry` (directory portion) — `inst-derive-base-url`
5. [x] - `p1` - A fresh `LoadBlobState` is created with an empty `blobUrlMap` and `visited` set scoped to this load — `inst-create-load-state`
6. [x] - `p1` - Algorithm: build share scope via `cpt-hai3-algo-mfe-isolation-build-share-scope` — `inst-build-share-scope`
7. [x] - `p1` - `writeShareScope()` writes the constructed entries to `globalThis.__federation_shared__['default']` — `inst-write-share-scope`
8. [x] - `p1` - Algorithm: fetch `remoteEntry.js` source text via `cpt-hai3-algo-mfe-isolation-fetch-source` — `inst-fetch-remote-entry`
9. [x] - `p1` - Algorithm: parse expose chunk filename via `cpt-hai3-algo-mfe-isolation-parse-expose-chunk` — `inst-parse-expose-chunk`
10. [x] - `p1` - **IF** expose chunk filename is null **RETURN** `MfeLoadError` — `inst-check-expose-chunk`
11. [x] - `p1` - Algorithm: build blob URL chain for expose chunk via `cpt-hai3-algo-mfe-isolation-blob-url-chain` — `inst-blob-url-chain`
12. [x] - `p1` - **IF** expose blob URL is absent from `blobUrlMap` **RETURN** `MfeLoadError` — `inst-check-expose-blob`
13. [x] - `p1` - Dynamic `import()` of the expose blob URL produces the expose module — `inst-import-expose-blob`
14. [x] - `p1` - Module factory extracted from expose module; result validated as `MfeEntryLifecycle` (must have `mount` and `unmount`) — `inst-validate-lifecycle`
15. [x] - `p1` - **IF** lifecycle interface not satisfied **RETURN** `MfeLoadError` — `inst-check-lifecycle`
16. [x] - `p1` - **RETURN** `MfeEntryLifecycle<ChildMfeBridge>` to caller — `inst-return-lifecycle`

### MFE Build with Externalize Plugin

- [x] `p2` - **ID**: `cpt-hai3-flow-mfe-isolation-build`

**Actors**:
- `cpt-hai3-actor-build-system`

1. [x] - `p1` - MFE `vite.config.ts` registers `federation()` plugin (expose entries, shared deps list) and `hai3MfeExternalize({ shared })` plugin — `inst-vite-config`
2. [x] - `p1` - On `vite build`, the `federation` plugin processes expose entry files, injecting `importShared()` calls for declared shared packages — `inst-federation-plugin-runs`
3. [x] - `p1` - `hai3-mfe-externalize` plugin (enforce: `'post'`) processes the generated bundle in `generateBundle` hook — `inst-externalize-hook`
4. [x] - `p1` - Algorithm: identify and rename shared chunks via `cpt-hai3-algo-mfe-isolation-rename-shared-chunks` — `inst-rename-chunks`
5. [x] - `p1` - Algorithm: map bundled sub-chunks to owning package via `cpt-hai3-algo-mfe-isolation-map-bundled-chunks` — `inst-map-bundled-chunks`
6. [x] - `p1` - Algorithm: rewrite bundled imports in non-infrastructure chunks via `cpt-hai3-algo-mfe-isolation-rewrite-imports` — `inst-rewrite-imports`
7. [x] - `p1` - Resulting bundle has deterministic shared chunk names and all bundled-package imports replaced with `importShared()` calls — `inst-build-output`

### MFE-Internal Bootstrap

- [x] `p1` - **ID**: `cpt-hai3-flow-mfe-isolation-mfe-bootstrap`

**Actors**:
- `cpt-hai3-actor-microfrontend`
- `cpt-hai3-actor-runtime`

1. [x] - `p1` - The MFE's `init.ts` module is evaluated as a module-level side effect when the expose chunk is first imported — `inst-init-side-effect`
2. [x] - `p1` - `init.ts` calls `apiRegistry.register()` and `apiRegistry.initialize()` to register API services before the store is built — `inst-register-api`
3. [x] - `p1` - `createHAI3().use(effects()).use(mock()).build()` creates a minimal `HAI3App` with an isolated store singleton — `inst-create-mfe-app`
4. [x] - `p1` - `registerSlice(slice, effectInitializer)` wires domain state into the MFE-local store — `inst-register-slice`
5. [x] - `p1` - `mfeApp` is exported for use by lifecycle React components as the `<HAI3Provider app={mfeApp}>` prop — `inst-export-mfe-app`
6. [x] - `p1` - **IF** any lifecycle component imports `react-redux`, `redux`, or `@reduxjs/toolkit` directly, the architecture constraint is violated — `inst-no-direct-redux`

---

## 3. Processes / Business Logic (CDSL)

### Build Share Scope

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-build-share-scope`

Constructs the `shareScope` object from `manifest.sharedDependencies`. Only dependencies that declare a `chunkPath` receive blob-URL-based `get()` closures; others are omitted.

1. [x] - `p1` - **IF** `manifest.sharedDependencies` is empty or absent **RETURN** empty `ShareScope` object — `inst-empty-deps`
2. [x] - `p1` - **FOR EACH** dependency in `sharedDependencies`:
   - **IF** `dep.chunkPath` is present: create a blob-URL `get()` closure via `createBlobUrlGet(dep.chunkPath, loadState)` and add `{ [dep.name]: { '*': { get: blobGet } } }` to the scope — `inst-create-blob-get`
   - **IF** `dep.chunkPath` is absent: skip this dependency (no entry added; MFE falls back to its own bundled copy via `getSharedFromLocal()`) — `inst-skip-no-chunk-path`
3. [x] - `p1` - **RETURN** the constructed `ShareScope` — `inst-return-share-scope`

### Blob URL Get Closure

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-blob-url-get`

The closure returned by `createBlobUrlGet` is stored in the share scope and invoked by the federation runtime's `importShared()` during MFE module evaluation.

1. [x] - `p1` - When invoked: call `createBlobUrlChain(loadState, chunkPath)` to ensure the chunk and its dependencies are blob-URL'd — `inst-trigger-chain`
2. [x] - `p1` - Retrieve the resulting blob URL from `loadState.blobUrlMap.get(chunkPath)` — `inst-get-blob-url`
3. [x] - `p1` - **IF** blob URL is absent **RETURN** `MfeLoadError` — `inst-missing-blob-url`
4. [x] - `p1` - Dynamic `import()` of the blob URL produces a fresh module evaluation — `inst-import-blob`
5. [x] - `p1` - **RETURN** a module factory `() => module` so the federation runtime receives the expected shape — `inst-return-factory`

### Fetch Source Text (with Cache)

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-fetch-source`

All source text fetches go through the `MfeHandlerMF`-level `sourceTextCache` (keyed by absolute URL), ensuring at most one network request per chunk across all loads.

1. [x] - `p1` - **IF** `sourceTextCache` contains an entry for `absoluteChunkUrl` **RETURN** the cached `Promise<string>` — `inst-cache-hit`
2. [x] - `p1` - **TRY**: issue `fetch(absoluteChunkUrl)` — `inst-fetch-request`
   - **IF** `response.ok` is false **RETURN** `MfeLoadError` with HTTP status and URL — `inst-http-error`
   - **RETURN** `response.text()` — `inst-return-text`
3. [x] - `p1` - **CATCH**: remove the failed entry from `sourceTextCache` (prevents a stuck negative cache entry), then **RETURN** `MfeLoadError` wrapping the original error — `inst-cache-evict-on-error`
4. [x] - `p1` - Store the `Promise<string>` in `sourceTextCache` keyed by `absoluteChunkUrl` before awaiting — `inst-cache-store`
5. [x] - `p1` - **RETURN** the stored promise — `inst-return-promise`

### Recursive Blob URL Chain

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-blob-url-chain`

Processes a chunk and all its static relative imports depth-first. Within a single load, each filename is processed at most once.

1. [x] - `p1` - **IF** `loadState.blobUrlMap` already has `filename` OR `loadState.visited` contains `filename` **RETURN** (already processed) — `inst-already-processed`
2. [x] - `p1` - Add `filename` to `loadState.visited` — `inst-mark-visited`
3. [x] - `p1` - Fetch source text for `loadState.baseUrl + filename` via `cpt-hai3-algo-mfe-isolation-fetch-source` — `inst-fetch-chunk`
4. [x] - `p1` - Parse static import filenames via `cpt-hai3-algo-mfe-isolation-parse-imports` — `inst-parse-deps`
5. [x] - `p1` - **FOR EACH** dependency filename: recursively call `createBlobUrlChain(loadState, dep)` — `inst-recurse-deps`
6. [x] - `p1` - Rewrite module imports in the source text via `cpt-hai3-algo-mfe-isolation-rewrite-module-imports`, using `loadState.blobUrlMap` for already-processed deps and `loadState.baseUrl` for the rest — `inst-rewrite-source`
7. [x] - `p1` - Create a `Blob` from the rewritten source with MIME type `text/javascript` — `inst-create-blob`
8. [x] - `p1` - Call `URL.createObjectURL(blob)` to produce a blob URL — `inst-create-object-url`
9. [x] - `p2` - Do NOT call `URL.revokeObjectURL()` at any point — modules with top-level `await` continue evaluating asynchronously after `import()` resolves, and premature revocation causes `ERR_FILE_NOT_FOUND` — `inst-no-revoke`
10. [x] - `p1` - Store the blob URL in `loadState.blobUrlMap` keyed by `filename` — `inst-store-blob-url`

### Parse Static Import Filenames

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-parse-imports`

Extracts normalized dependency filenames from a chunk's source text so the recursive chain knows which sub-chunks to process.

1. [x] - `p1` - Match all `from './...'` and `from '../...'` patterns in the source text — `inst-match-relative`
2. [x] - `p1` - **FOR EACH** match: resolve the relative specifier against `chunkFilename` using URL-based path resolution (synthetic `http://r/` base, then strip the leading `/`) — `inst-resolve-path`
3. [x] - `p1` - Deduplicate the resulting filename list — `inst-dedupe`
4. [x] - `p1` - **RETURN** the deduplicated list of resolved filenames — `inst-return-filenames`

### Rewrite Module Imports

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-rewrite-module-imports`

Replaces relative specifiers in a chunk's source text with either a blob URL (if the dependency has already been processed in the current load) or an absolute HTTP URL.

1. [x] - `p1` - For each relative specifier (both `./` and `../`) in static `from '...'` patterns: resolve the relative specifier against `chunkFilename`; look up the resolved key in `blobUrlMap`; if found, replace with the blob URL; otherwise replace with `baseUrl + resolvedKey` — `inst-static-imports`
2. [x] - `p1` - Apply the same resolution and replacement to dynamic `import('./...')` and `import('../...')` patterns — `inst-dynamic-imports`
3. [x] - `p1` - Non-relative specifiers (bare package names, absolute URLs) are not modified — `inst-skip-non-relative`
4. [x] - `p1` - **RETURN** the fully rewritten source text — `inst-return-rewritten`

### Parse Expose Chunk Filename

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-parse-expose-chunk`

Extracts the filename of the expose entry chunk from the remoteEntry source.

1. [x] - `p1` - Escape the `exposedModule` string for regex use — `inst-escape-module`
2. [x] - `p1` - Apply the pattern: `"<exposedModule>"[^}]*__federation_import\(['"]\.\/([^'"]+)['"]\)` against the remoteEntry source text — `inst-apply-regex`
3. [x] - `p1` - **IF** pattern matches **RETURN** the captured filename (group 1) — `inst-return-filename`
4. [x] - `p1` - **IF** no match **RETURN** null — `inst-return-null`

### Write Share Scope to Global

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-write-share-scope`

Writes the constructed share scope entries to `globalThis.__federation_shared__` so the federation runtime's `importShared()` can resolve them during MFE evaluation.

1. [x] - `p1` - Read or initialise `globalThis.__federation_shared__` as an object — `inst-init-global`
2. [x] - `p1` - **FOR EACH** `[packageName, versions]` in the share scope:
   - **FOR EACH** `[versionKey, versionValue]` in `versions`:
     - Derive `scope` as `versionValue.scope ?? 'default'` — `inst-derive-scope`
     - Ensure `globalThis.__federation_shared__[scope]` and `[scope][packageName]` exist — `inst-ensure-scope-keys`
     - Write `versionValue` to `globalThis.__federation_shared__[scope][packageName][versionKey]` — `inst-write-entry`
3. [x] - `p1` - Each `get()` closure already captures its own `LoadBlobState`; overwriting the global entry for a new load does not affect an earlier load's already-resolved `importShared()` calls — `inst-concurrent-safety`

### hai3-mfe-externalize: Rename Shared Chunks

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-rename-shared-chunks`

Renames `__federation_shared_<pkg>-<hash>.js` chunks to `__federation_shared_<pkg>.js`, making `chunkPath` values in MFE manifests stable across rebuilds.

1. [x] - `p1` - **FOR EACH** bundle entry whose key matches `__federation_shared_<pkg>-<8-char-hash>.js`: record `oldKey → newKey` in `renameMap`; record the chunk and its code length in `federationChunks` keyed by package name — `inst-identify-federation-chunks`
2. [x] - `p1` - Apply `renameMap`: set `chunk.fileName` to `newKey`, insert under `newKey`, delete `oldKey` — `inst-apply-rename`
3. [x] - `p1` - **FOR EACH** chunk in the bundle: update `imports`, `dynamicImports` arrays and inline code string references from old base filenames to new base filenames — `inst-update-refs`

### hai3-mfe-externalize: Map Bundled Sub-Chunks to Packages

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-map-bundled-chunks`

Determines which bundled sub-chunk is the primary bundle of each shared package, using a thin-wrapper heuristic.

1. [x] - `p1` - Collect the code length of every non-federation-infrastructure chunk keyed by base filename — `inst-collect-lengths`
2. [x] - `p1` - **FOR EACH** federation shared chunk (from `federationChunks`):
   - **FOR EACH** of its imports that is not federation infrastructure:
     - **IF** the federation chunk's code length is LESS THAN the imported chunk's code length (thin wrapper): this is a candidate claim — `inst-thin-wrapper-check`
     - **IF** `bundledChunkToPackage` already maps the imported filename: replace only if the current candidate's code length is smaller than the existing claimant (smallest thin wrapper wins) — `inst-conflict-resolution`
     - Otherwise record `importedBase → pkgName` in `bundledChunkToPackage` — `inst-record-mapping`

### hai3-mfe-externalize: Rewrite Bundled Imports to importShared

- [x] `p1` - **ID**: `cpt-hai3-algo-mfe-isolation-rewrite-imports`

Replaces direct imports of bundled sub-chunks in non-infrastructure MFE chunks with `importShared()` calls so all execution paths route through the federation runtime's per-load module cache.

1. [x] - `p1` - **IF** `bundledChunkToPackage` is empty **RETURN** (no rewrites needed) — `inst-early-exit`
2. [x] - `p1` - Locate the `__federation_fn_import` chunk filename in the bundle (provides the `importShared` function) — `inst-find-fn-import`
3. [x] - `p1` - **IF** federation fn import chunk not found **RETURN** — `inst-fn-import-missing`
4. [x] - `p1` - **FOR EACH** non-infrastructure chunk in the bundle:
   - **FOR EACH** imported key in the chunk's `imports` array that maps to a package in `bundledChunkToPackage`:
     - Replace named imports `{ a as b }` with `const __importShared_<pkg> = await importShared('<pkg>'); const b = () => __importShared_<pkg>;` — `inst-named-import`
     - Replace default imports `Foo` with `const Foo = await importShared('<pkg>');` — `inst-default-import`
     - Replace namespace imports `* as Foo` with `const Foo = await importShared('<pkg>');` — `inst-namespace-import`
   - **IF** any rewrites were made AND the chunk did not already import from the fn-import chunk: prepend `import { importShared } from './<fn-import-file>';` — `inst-add-import-shared`
   - Update `outputChunk.code` with the rewritten source — `inst-update-code`

---

## 4. States (CDSL)

### LoadBlobState (Per-Load Isolation Map)

- [x] `p1` - **ID**: `cpt-hai3-state-mfe-isolation-load-blob-state`

Tracks the blob URL map and visitation set for a single MFE load call. Created fresh for each `loadExposedModuleIsolated()` invocation.

1. [x] - `p1` - **FROM** INIT **TO** ACTIVE **WHEN** `loadExposedModuleIsolated()` creates a new `LoadBlobState` with empty `blobUrlMap` and `visited` set — `inst-state-init`
2. [x] - `p1` - **FROM** ACTIVE **TO** ACTIVE (VISITED) **WHEN** `createBlobUrlChain` adds a filename to `visited` — `inst-state-visited`
3. [x] - `p1` - **FROM** ACTIVE (VISITED) **TO** ACTIVE (MAPPED) **WHEN** a blob URL is inserted into `blobUrlMap` for the visited filename — `inst-state-mapped`
4. [x] - `p1` - **FROM** ACTIVE **TO** COMPLETE **WHEN** the expose blob URL is successfully imported and the lifecycle module is returned — `inst-state-complete`
5. [x] - `p1` - **FROM** ACTIVE **TO** FAILED **WHEN** any step throws `MfeLoadError` — `inst-state-failed`
6. [x] - `p2` - `LoadBlobState` instances are not retained after the load completes; blob URLs in `blobUrlMap` are never revoked and persist for the page lifetime — `inst-state-gc`

### SourceTextCache (Handler-Level)

- [x] `p1` - **ID**: `cpt-hai3-state-mfe-isolation-source-cache`

Tracks the fetch state of each chunk URL across all loads for the lifetime of the `MfeHandlerMF` instance.

1. [x] - `p1` - **FROM** ABSENT **TO** PENDING **WHEN** a fetch for `absoluteChunkUrl` is initiated and the `Promise<string>` is stored in `sourceTextCache` — `inst-cache-pending`
2. [x] - `p1` - **FROM** PENDING **TO** RESOLVED **WHEN** `fetch()` succeeds and the promise resolves with source text — `inst-cache-resolved`
3. [x] - `p1` - **FROM** PENDING **TO** ABSENT **WHEN** `fetch()` fails; the entry is removed from `sourceTextCache` to avoid a stuck negative cache — `inst-cache-evicted`
4. [x] - `p1` - **FROM** RESOLVED **TO** RESOLVED **WHEN** subsequent loads request the same URL (cache hit; no new fetch) — `inst-cache-hit-state`

---

## 5. Definitions of Done

### Blob URL Isolation Core

- [x] `p1` - **ID**: `cpt-hai3-dod-mfe-isolation-blob-core`

`MfeHandlerMF` achieves per-load module isolation through the blob URL chain mechanism. Each load produces independent module evaluations with no shared object references between MFEs.

**Implementation details**:
- File: `packages/screensets/src/mfe/handler/mf-handler.ts`
- Key types: `LoadBlobState` (per-load), `ManifestCache`, `MfeLoaderConfig`
- Constructor: `MfeHandlerMF(handledBaseTypeId: string, config?: MfeLoaderConfig)` — does NOT take `typeSystem`; the registry owns type hierarchy checks. Consumer passes the GTS base type ID constant (e.g., `HAI3_MFE_ENTRY_MF`) at instantiation.
- Public entry: `MfeHandlerMF.load(entry: MfeEntryMF): Promise<MfeEntryLifecycle<ChildMfeBridge>>`

**Implements**:
- `cpt-hai3-flow-mfe-isolation-load`
- `cpt-hai3-algo-mfe-isolation-build-share-scope`
- `cpt-hai3-algo-mfe-isolation-blob-url-get`
- `cpt-hai3-algo-mfe-isolation-fetch-source`
- `cpt-hai3-algo-mfe-isolation-blob-url-chain`
- `cpt-hai3-algo-mfe-isolation-parse-imports`
- `cpt-hai3-algo-mfe-isolation-rewrite-module-imports`
- `cpt-hai3-algo-mfe-isolation-parse-expose-chunk`
- `cpt-hai3-algo-mfe-isolation-write-share-scope`
- `cpt-hai3-state-mfe-isolation-load-blob-state`
- `cpt-hai3-state-mfe-isolation-source-cache`

**Covers (PRD)**:
- `cpt-hai3-fr-blob-fresh-eval`
- `cpt-hai3-fr-blob-no-revoke`
- `cpt-hai3-fr-blob-source-cache`
- `cpt-hai3-fr-blob-import-rewriting`
- `cpt-hai3-fr-blob-recursive-chain`
- `cpt-hai3-fr-blob-per-load-map`
- `cpt-hai3-fr-sharescope-construction`
- `cpt-hai3-fr-sharescope-concurrent`
- `cpt-hai3-nfr-perf-blob-overhead`
- `cpt-hai3-nfr-sec-csp-blob`

**Covers (DESIGN)**:
- `cpt-hai3-principle-mfe-isolation`
- `cpt-hai3-constraint-zero-cross-deps-at-l1`
- `cpt-hai3-component-screensets` (blob loader subsystem)
- `cpt-hai3-seq-mfe-loading`

### hai3-mfe-externalize Vite Plugin

- [x] `p1` - **ID**: `cpt-hai3-dod-mfe-isolation-externalize-plugin`

The `hai3MfeExternalize` Vite plugin produces MFE bundles where all shared dependency imports route through `importShared()`, and shared chunk filenames are deterministic.

**Implementation details**:
- File: `src/mfe_packages/shared/vite-plugin-hai3-externalize.ts`
- Export: `hai3MfeExternalize(options: Hai3MfeExternalizeOptions): Plugin`
- Consumed by each MFE's `vite.config.ts` alongside `@originjs/vite-plugin-federation`

**Implements**:
- `cpt-hai3-flow-mfe-isolation-build`
- `cpt-hai3-algo-mfe-isolation-rename-shared-chunks`
- `cpt-hai3-algo-mfe-isolation-map-bundled-chunks`
- `cpt-hai3-algo-mfe-isolation-rewrite-imports`

**Covers (PRD)**:
- `cpt-hai3-fr-externalize-transform`
- `cpt-hai3-fr-externalize-filenames`
- `cpt-hai3-fr-externalize-build-only`

**Covers (DESIGN)**:
- `cpt-hai3-principle-mfe-isolation` (build-side enforcement)
- `cpt-hai3-component-screensets` (shared Vite tooling)

### MFE-Internal Dataflow

- [x] `p1` - **ID**: `cpt-hai3-dod-mfe-isolation-internal-dataflow`

Each MFE package bootstraps its own isolated `HAI3App` and exposes it for use by lifecycle React components. No direct Redux imports appear in MFE source code.

**Implementation details**:
- Files: `src/mfe_packages/<mfe-name>/src/init.ts` (module-level bootstrap)
- Pattern: `createHAI3().use(effects()).use(mock()).build()` — only `effects()` and `mock()` plugins
- MFE lifecycle components wrap their React tree in `<HAI3Provider app={mfeApp}>`

**Implements**:
- `cpt-hai3-flow-mfe-isolation-mfe-bootstrap`

**Covers (PRD)**:
- `cpt-hai3-fr-dataflow-internal-app`
- `cpt-hai3-fr-dataflow-no-redux`

**Covers (DESIGN)**:
- `cpt-hai3-principle-mfe-isolation` (runtime-side enforcement)
- `cpt-hai3-constraint-zero-cross-deps-at-l1`

### SharedDependencyConfig chunkPath Field

- [x] `p1` - **ID**: `cpt-hai3-dod-mfe-isolation-chunk-path-type`

`SharedDependencyConfig` declares the optional `chunkPath` field used to derive the absolute chunk URL for blob URL isolation.

**Implementation details**:
- File: `packages/screensets/src/mfe/types/mf-manifest.ts`
- Interface: `SharedDependencyConfig { name: string; requiredVersion?: string; chunkPath?: string }`
- Absolute URL derived as `new URL(chunkPath, remoteEntryBaseUrl).href`

**Covers (PRD)**:
- `cpt-hai3-fr-blob-source-cache` (chunkPath enables cache keying)
- `cpt-hai3-fr-sharescope-construction` (chunkPath determines whether blob get() is created)

---

## 6. Acceptance Criteria

- [x] Two MFEs loaded sequentially with the same `react` `chunkPath` produce React instances where `Object.is(mfeA_React, mfeB_React)` is `false`
- [x] Two MFEs loaded with the same `chunkPath` result in at most one network fetch for that chunk URL (source text cache deduplication)
- [x] Two MFEs loaded concurrently each receive their own unique blob URL and fresh module evaluation; no `MfeLoadError` is thrown in the concurrent case
- [x] After `import(blobUrl)` resolves, `URL.revokeObjectURL` is never called for any blob URL created during an MFE load
- [x] A 404 or network error fetching any chunk source text throws `MfeLoadError` with the chunk URL and failure reason; the failed fetch is removed from the source text cache
- [x] The `hai3-mfe-externalize` plugin does not modify any imports during `vite dev` (build-only operation)
- [x] After `vite build`, all `__federation_shared_<pkg>-<hash>.js` chunks are renamed to `__federation_shared_<pkg>.js` and all referencing chunks are updated accordingly
- [x] After `vite build`, code-split chunks that previously imported from bundled CJS wrappers instead contain `importShared('<pkg>')` calls via the federation fn-import chunk
- [x] MFE `init.ts` files contain no direct imports from `react-redux`, `redux`, or `@reduxjs/toolkit`; all store access goes through `@gears-frontx/react` APIs

---

## Additional Context

**Never-revoke policy rationale**: The `import()` function resolves when a module is parsed and its top-level synchronous code has run. Modules that include `const dep = await importShared('react')` continue evaluating asynchronously after the `import()` promise resolves. If the blob URL is revoked at this point, the async continuation cannot fetch the already-queued sub-module evaluation and fails with `ERR_FILE_NOT_FOUND`. Blob URLs are cleaned up automatically by the browser on page unload; no manual revocation is needed.

**Per-load map vs. handler-level source cache**: The `blobUrlMap` is intentionally scoped to a single load because each MFE must get a unique `URL.createObjectURL()` result (even from the same source text) to achieve a fresh module evaluation. The `sourceTextCache` is intentionally handler-level to avoid redundant network fetches across multiple loads that share a dependency version.

**Thin-wrapper heuristic in the externalize plugin**: Federation shared chunks come in two shapes: (a) a thin re-export wrapper (e.g., `__federation_shared_react.js` at ~0.27 KB wrapping the ~100 KB React bundle), and (b) a large package chunk that happens to import a smaller sub-module (e.g., `__federation_shared_@gears-frontx/react.js` at 22 KB importing `jsx-runtime.js` at 5 KB). The heuristic — "thin wrapper wins ownership of bundled sub-chunks; when two thin wrappers compete, the smallest one wins" — correctly identifies the primary bundled copy of a shared package without AST parsing.

**CSP compatibility**: The isolation mechanism uses `Blob` objects and `URL.createObjectURL`, not `eval()` or `new Function()`. The only required CSP directive addition is `blob:` in `script-src`. The `cpt-hai3-nfr-sec-csp-blob` requirement is satisfied by construction.

**Concurrent write safety of `globalThis.__federation_shared__`**: `writeShareScope()` overwrites individual version entries per load. A later load's `writeShareScope` may overwrite the `get()` entry written by an earlier concurrent load before that earlier load's `importShared()` fires. This is safe because: (1) `importShared()` is called during `import(blobUrl)` evaluation, which happens after `writeShareScope` for that load; (2) each `get()` closure captures its own `LoadBlobState` so even if it is called from a later context it produces the correct isolation for its own load's blob map.
