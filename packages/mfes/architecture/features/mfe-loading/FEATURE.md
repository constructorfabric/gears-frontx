---
version: 5
description: Specifies microfrontend loading from the registered MFE entry and the registered manifest it references — the entry module, the missing shared units and the list's `ownChunks` requested together in one round from the manifest-held fetch list, admission of shared text under its declared content identity, per-load serialised minting, a per-attempt timeout with bounded retries — and lazy dynamic-import resolution through a per-load runtime ABI that binds every literal and pattern import to its parent load's per-load map.
---

# Feature: MFE Discovery & Lazy-Import Loading


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [On-Demand MFE Load via Manifest Discovery](#on-demand-mfe-load-via-manifest-discovery)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Manifest-Driven Discovery](#manifest-driven-discovery)
  - [Lazy-Import ABI Resolution](#lazy-import-abi-resolution)
  - [Per-Attempt Load Timeout](#per-attempt-load-timeout)
- [4. States (CDSL)](#4-states-cdsl)
  - [MFE Load Lifecycle State Machine](#mfe-load-lifecycle-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Registered Entry and Manifest Drive Discovery](#registered-entry-and-manifest-drive-discovery)
  - [Fetch-List Load in One Round](#fetch-list-load-in-one-round)
  - [Shared Text Admitted Under Its Declared Content Identity](#shared-text-admitted-under-its-declared-content-identity)
  - [Lazy-Import ABI Inherits Parent Load Bindings](#lazy-import-abi-inherits-parent-load-bindings)
  - [Per-Attempt Load Timeout Budget](#per-attempt-load-timeout-budget)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-mfe-loading`

## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-mfe-loading`

### 1.1 Overview

This feature loads a microfrontend from the registered MFE entry and the registered manifest it references, read from the registry where they were registered. When the exposed module has a fetch list, a load costs one round: the entry module, the shared units the realm cache lacks and the list's `ownChunks`, requested together, because the registered manifest holds every list. Shared text is admitted to the realm cache under the content identity declared for it, and each load mints its own references serialised per load. Each load attempt is raced against a per-attempt timeout; an attempt that fails on the network or on its budget is retried a bounded number of times, and a failure decided by declared data is not retried. Every literal and pattern dynamic import resolves through a per-load runtime ABI that binds the lazy target to its parent load's **per-load map** (the term of `cpt-frontx-feature-mfe-isolation` §1.1); on a fetch-list load it fetches what the load lacks in one further round on first use, and on a whole-package load it walks the chunk graph from the target.

### 1.2 Purpose

The MFE Runtime must locate everything one load needs from declared data rather than from bundler-emitted output, fetch only the shared code the exposed module uses in one round, share that code across microfrontends under the content identity its producer declares, and keep code-split microfrontends' lazily reached chunks inside the same isolated module graph as their parent load. This feature specifies the load sequence, the location rules, where in that sequence shared text is admitted under its declared content identity, the per-attempt timeout and retries, and the lazy-import ABI that together satisfy on-demand loading without coupling the runtime to any particular bundler or producer.

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-fr-mfe-load-failure-handling`, `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-resource-efficiency`, `cpt-frontx-nfr-security`

**Principles**: none owned by this feature

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Registers a microfrontend's MFE entry and the manifest it references with the registry, triggering on-demand load when the extension is first needed |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADRs**: `cpt-frontx-adr-mfe-asset-discovery`, `cpt-frontx-adr-lazy-import-resolution`, `cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-shared-dep-cache-reach`, `cpt-frontx-adr-mfe-load-isolation`
- **Component**: `cpt-frontx-component-mfe-runtime`
- **Dependencies**: `cpt-frontx-feature-mfe-registry` (on-demand loading is orchestrated from the registry); `cpt-frontx-feature-unit-format-contract` (the unit table and fetch-list format, the realm cache key forms and the admission discipline). References to steps and definitions of done of `cpt-frontx-feature-mfe-isolation` are pointers, not a dependency: that feature depends on this one.

**Checklist applicability**:
- PERF — Addressed in §3 (Manifest-Driven Discovery; Lazy-Import ABI Resolution) and §5 (Fetch-List Load in One Round; Lazy-Import ABI Inherits Parent Load Bindings; Per-Attempt Load Timeout Budget). The round and request criteria — one round per load and one per lazy target on first use, one request per content identity, no request for a list item the realm cache holds — are the package-level proxy for the load-time threshold of `cpt-frontx-nfr-runtime-performance`; transfer is governed by `cpt-frontx-nfr-resource-efficiency`.
- SEC — Addressed in §3 (`inst-md-admit-under-declared-identity`, `inst-md-resolve-location`) and §5 (Shared Text Admitted Under Its Declared Content Identity): shared text is admitted only under the content identity declared for it, a sharing key rather than a grant of trust in code, and every location of a kind that must stay inside its base is validated before its request; isolated evaluation of loaded units belongs to `cpt-frontx-feature-mfe-isolation`.
- REL — Addressed in §3 (Per-Attempt Load Timeout) and §5 (Per-Attempt Load Timeout Budget): every attempt is raced against its own budget, an expired attempt fails with a diagnostic naming the entry and releases the cache entries it waited on, a failure decided by declared data is not retried, and a failed lazy import leaves later lazy imports of the load unaffected.
- DATA — Not applicable because this feature stores nothing durable; manifests, fetched text and minted references are held in memory.
- INT — Addressed in §3 (`inst-read-contract-fields`, `inst-md-resolve-location`) and §5 (Registered Entry and Manifest Drive Discovery): the closed MFE entry and manifest contracts and the location rules are the contract this feature reads.
- OPS — Addressed in §3 (Per-Attempt Load Timeout) and §5 (Per-Attempt Load Timeout Budget): the handler options `timeout` and `retries` of `MfeLoaderConfig` and their defaults; the per-load console diagnostic is owned by `cpt-frontx-dod-mfe-isolation-shared-dep-diagnostics`.
- MAINT — Not applicable because this feature sets no maintainability target of its own.
- TEST — Addressed in §6: the acceptance criteria an implementation is tested against.
- COMPL — Not applicable because this feature handles no regulated or personal data.
- UX — Not applicable because this feature renders no user interface.
- BIZ — Not applicable because this is an internal library feature; its requirements are cited by ID in §1.2.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### On-Demand MFE Load via Manifest Discovery

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-loading-on-demand-load`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer registers an MFE entry and the manifest it references; the registry loads the entry on demand when the extension is first exercised and returns a lifecycle module factory.

**Error Scenarios**:
- The manifest the MFE entry references is not registered, or the registry answers with a value that is not of manifest shape: the load fails before any request, is not retried, and the extension's `loadState` becomes `error` (`cpt-frontx-flow-mfe-isolation-load`, `inst-manifest-by-id`, `inst-manifest-unresolved-raise`).
- The manifest declares a shared-dependency name more than once, or a declared shared-dependency name survives the rewrite as a bare specifier in a list item, an own chunk or a whole-package entry: the load fails as `cpt-frontx-feature-mfe-isolation` specifies and is not retried (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-if-deterministic-failure`).
- A `metaData.publicPath`, a `metaData.sharedBase`, a shared-unit location, or a `chunkPath` the handler refuses fails the load before the request it would locate and is not retried.
- The MFE entry's `exposeAssets.js.sync` is empty: the load fails before any request and is not retried.
- The entry module request fails: the load fails with an `MfeLoadError` naming that file and the entry, and the attempt issues no further request.
- A request of the load's round — the entry module, a list unit or an entry of the list's `ownChunks` — fails: the load fails with an `MfeLoadError` naming that file and the entry, the round's other outcomes are discarded, and the attempt admits no text to the realm cache after the failure and issues no further request; text admitted before the failure stays in the realm cache, and the healthy in-flight entries the attempt published stay in the realm cache, so the next attempt joins them, while only a timeout releases an attempt's entries (`cpt-frontx-adr-shared-dep-cache-reach`).
- A manifest whose unit table or lists carry a property outside the contract, lack a required field or hold a value outside its format is rejected by the type system when the manifest is registered (`cpt-frontx-feature-unit-format-contract`).
- A load attempt fails on a dependency cycle among its list items or its own chunks — the load fails with an `MfeLoadError` naming the chunks on the cycle and the microfrontend and is not retried.
- A lazy target's fetch fails: that lazy import fails with an `MfeLoadError`, adds no entry to the load's per-load map, and later, independent lazy imports of the same load are unaffected.
- On a fetch-list load, a lazy call from the microfrontend's own code whose target matches no lazy-target fetch list in the load's lists produces one console warning per handler for that chunk and entry and loads with the units the load's per-load map already holds.
- On a fetch-list load, a lazy call from a shared unit whose target matches no lazy-target fetch list in the load's lists fails the lazy load with an `MfeLoadError` naming the target and the MFE entry.
- A manifest or an MFE entry of the load fails registration or the load for any reason above: only that microfrontend is disabled — its extension is not registered, or its `loadState` becomes `error` — and the shell, the domains and every other microfrontend keep working (`cpt-frontx-adr-mfe-asset-discovery`).
- A load attempt does not settle within the per-attempt timeout budget — that attempt fails with a diagnostic naming the entry and the elapsed budget, its abandoned in-flight work is left running, every cache entry it waited on is released under the identity check (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-release-abandoned-source-text`), and any retry is raced against its own fresh budget.

**Steps**:
1. [x] - `p1` - Registry holds the registered MFE entry; at load start the system reads the manifest the entry references by its identifier from the registry where it was registered, as `cpt-frontx-flow-mfe-isolation-load` step `inst-manifest-by-id` specifies - `inst-resolve-registered-manifest`
2. [x] - `p1` - Registry triggers on-demand load for the entry when the extension is first needed - `inst-trigger-load`
3. [x] - `p1` - System reads only fields of the closed MFE entry and manifest contracts of `cpt-frontx-adr-mfe-asset-discovery`: from the MFE entry `id`, `manifest` (the reference to the registered manifest), `exposedModule`, the first element of `exposeAssets.js.sync`, and the synchronous and the asynchronous lists of the `css` entry of `exposeAssets`; from the manifest `id`, `metaData.publicPath`, `metaData.sharedBase`, `units`, `lists` and, per `shared[]` entry of a manifest that carries `shared`, `name`, `version`, `chunkPath` and `contentHash`. The fields of an older producer that the contract accepts as known-but-ignored are never read, and a manifest or MFE entry carrying them loads exactly as one without them. Required fields, the absence of any other property and the value formats are enforced by the type system's manifest and MFE entry types; beyond the manifest-shape acceptance of `cpt-frontx-flow-mfe-isolation-load` step `inst-manifest-by-id`, the runtime itself checks only the location rules of `cpt-frontx-algo-mfe-loading-manifest-discovery` - `inst-read-contract-fields`
4. [x] - `p1` - **IF** the handler refuses a location value under the rules of `cpt-frontx-algo-mfe-loading-manifest-discovery` (`inst-md-read-public-path`, `inst-md-resolve-shared-base`, `inst-md-resolve-location`) — a `metaData.publicPath`, a `metaData.sharedBase`, a shared-unit location, or a `chunkPath` — whatever produced the declared data - `inst-if-manifest-invalid`
   1. [x] - `p1` - **RETURN** load failure naming the refused field or location (and, for a `chunkPath`, the dependency), before any request for the file it would locate — for a manifest field, before any request of the load; the extension's `loadState` becomes `error`. The refusal is not retried (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-if-deterministic-failure`) - `inst-manifest-invalid-fail`
5. [x] - `p1` - System derives the absolute asset base URL from `manifest.metaData.publicPath` once per load, by the rule of `cpt-frontx-algo-mfe-loading-manifest-discovery` (`inst-md-read-public-path`), so the entry module, its stylesheets, the own chunks and every `chunkPath` resolve against that one base and none of them depends on the document URL at fetch or mount time - `inst-derive-base-url`
6. [x] - `p1` - System executes manifest-driven discovery (see §3 `cpt-frontx-algo-mfe-loading-manifest-discovery`): when the manifest holds `units` or `lists`, the entry module, the shared units missing from the realm cache and the exposed module's list's `ownChunks` together in one round, and a manifest holding either with no list for the exposed module fails the load; when it holds neither, the whole-package entries and the own chunks found by walking the chunk graph under the fixed concurrency limit - `inst-run-manifest-discovery`
7. [x] - `p1` - System mints a per-load lazy-import ABI resolver stub and registers it with the package-internal resolver table (see §3 `cpt-frontx-algo-mfe-loading-lazy-import-abi`) - `inst-mint-lazy-stub`
8. [x] - `p1` - System mints the load's isolated graph serialised per load (`inst-md-mint-serialised`): shared units leaves-first, then the own chunks with their bare and relative imports rewritten to this load's references, the entry module last, once every shared unit it reaches is minted - `inst-rewrite-expose-chunk`
9. [x] - `p1` - System imports the entry module's inline-content reference and extracts the lifecycle module factory - `inst-import-expose-chunk`
10. [x] - `p1` - **IF** a literal or pattern dynamic import is exercised in a loaded chunk - `inst-if-lazy-exercised`
    1. [x] - `p1` - System resolves each `__frontx_lazy` call via the per-load ABI resolver (`cpt-frontx-algo-mfe-loading-lazy-import-abi`); each lazy target joins the same isolated graph and binds to the parent load's per-load map - `inst-resolve-lazy-chunks`
11. [x] - `p1` - System collects the stylesheet paths from the synchronous and the asynchronous lists of the `css` entry of the MFE entry's `exposeAssets`, resolved against the asset base URL, for stylesheet injection at mount - `inst-collect-css`
12. [x] - `p1` - **IF** the load of this entry fails for any reason, set the `loadState` of this extension to `error` and fail the load to its caller, leaving every other extension, every domain and the shell as they were; a manifest or MFE entry that the type system rejected at registration never reaches a load (`cpt-frontx-flow-mfe-registry-register-validate-mount`, `inst-flow-rvm-rejection-isolated`) - `inst-load-failure-isolated`
13. [x] - `p1` - **RETURN** lifecycle module factory and stylesheet paths to the registry - `inst-return-lifecycle`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. These are reusable building blocks called by Actor Flows or other processes.

### Manifest-Driven Discovery

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-loading-manifest-discovery`

**Input**: The registered MFE entry (`exposedModule`, `exposeAssets`) and the registered manifest it references (`metaData.publicPath`, `metaData.sharedBase`, `units`, `lists`, and `shared[]` in the manifest's published enumeration order when the manifest carries it), read from the registry

**Output**: Asset base URL, shared base URL, entry module location, stylesheet paths, and the fetched texts of the load — shared units admitted under their declared content identities, own chunks and the entry module — minted into the load's isolated graph

**Steps**:
1. [x] - `p1` - Resolve `manifest.metaData.publicPath` once per load to the asset base URL for all chunk references in this MFE: standard URL resolution against the host document's base URL (`document.baseURI`), so an absolute value resolves to itself without reading the document, while a relative one (`/`, a document-relative path, or the empty string, which names the document's own directory) needs a host document; the result is normalised to a directory (a missing trailing `/` is added, query and hash are dropped) and must be an http(s) URL. The unresolved Module Federation placeholder `auto` (or `auto/`), a value that is not a string, a value that does not parse, a relative value with no host document, and a value that resolves to any other scheme (such as `data:`, `blob:`, `javascript:` or `file:`) fail the load (`cpt-frontx-flow-mfe-loading-on-demand-load`, `inst-if-manifest-invalid`) - `inst-md-read-public-path`
2. [x] - `p1` - Resolve the shared base: **WHEN** `metaData.sharedBase` is given, resolve it against the resolved asset base directory — an absolute value resolves to itself — normalise it to a directory as the asset base is, and require an http(s) URL; a value that is not a string, is protocol-relative (`//`), carries a backslash, a space or a control character, or does not resolve to an http(s) URL fails the load before any request (`cpt-frontx-flow-mfe-loading-on-demand-load`, `inst-if-manifest-invalid`); when it is absent, the shared base is the asset base. The shared base governs only shared-unit locations and never changes how an own chunk, the entry module, a stylesheet or a `chunkPath` resolves - `inst-md-resolve-shared-base`
3. [x] - `p1` - Resolve every location by its kind: a shared unit against the shared base and a `chunkPath` against the asset base — the kinds that must stay inside their base —; an own chunk (including an entry of a fetch list's `ownChunks`), the entry module and a stylesheet against the asset base, with no containment or origin check. An absolute http(s) URL is accepted for every kind and fetched at its parsed form. A location of a kind that must stay inside its base, absolute or relative, fails the load before its request (`cpt-frontx-flow-mfe-loading-on-demand-load`, `inst-if-manifest-invalid`) when it carries a percent-encoded dot, a backslash, a space or a control character (C0, DEL or C1), names a scheme other than http(s) or is protocol-relative (`//`), or names a directory rather than a file (for a relative location, `/`, `.`, `?v=1` and `#x` all name the base itself); a relative location also fails when it climbs out of its base (a `..` segment or a leading `/`). An absolute http(s) URL is exempt only from that stay-inside-the-base test - `inst-md-resolve-location`
4. [x] - `p1` - Read the MFE entry's `exposedModule` and, **WHEN** the manifest's `lists` holds a fetch list keyed by it, take that list as the exposed module's fetch list; the read decides nothing else, and what follows from a manifest that holds `units` or `lists` and no list for the exposed module is `inst-md-if-fetch-list` - `inst-md-read-unit-fields`
5. [x] - `p1` - Read the first element of the MFE entry's `exposeAssets.js.sync` as the entry module; if the list is empty, emit a load error before any request of the load; the refusal is not retried (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-if-deterministic-failure`) - `inst-md-read-expose-chunk`
6. [x] - `p1` - Read the synchronous and the asynchronous lists of the `css` entry of the MFE entry's `exposeAssets` as the stylesheet asset paths - `inst-md-read-css`
7. [x] - `p1` - Admit shared text to the realm cache, as fetched, under the content identity declared for it, through `cpt-frontx-algo-unit-format-contract-shared-text-admission`, which fixes the cache keys, the admission and the eviction on rejection: every list unit (under the `contentHash` the manifest's unit table declares) and every whole-package entry that declares a `contentHash`; a whole-package entry without a `contentHash` is admitted under its absolute location (`cpt-frontx-algo-unit-format-contract-shared-text-admission`, `inst-admit-whole-package-by-location`). The microfrontend's own code carries no content identity and is never admitted to the realm cache. Which cache holds shared text and which holds own code is `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache` and `cpt-frontx-dod-mfe-isolation-handler-source-text-cache` - `inst-md-admit-under-declared-identity`
8. [x] - `p1` - **IF** the manifest holds `units` or `lists`, the exposed module's fetch list is the entry of `lists` under its name; a manifest that holds either and no list for the exposed module fails the load before any request as manifest data (`cpt-frontx-flow-mfe-loading-on-demand-load`, `inst-if-manifest-invalid`), naming the missing key - `inst-md-if-fetch-list`
   1. [x] - `p1` - Request the entry module's source (the first element of `exposeAssets.js.sync` resolved against the asset base URL) at the start of the load, in the same round as the list's units and own chunks, through the handler source-text cache; the entry request waits for neither another request nor any minting. An entry text already resident in that cache is not requested again. The entry module is requested at high fetch priority and the units and own chunks at the default priority (`cpt-frontx-adr-mfe-asset-discovery`). The load hands that one request's text to the build of the entry module, so the entry is downloaded once per load. The entry source is rewritten and minted only after every shared unit it reaches is minted, and evaluated only after that - `inst-md-fetch-entry-concurrent`
      1. [x] - `p1` - **IF** the entry module request fails — a network failure or a non-success status: the load fails with an `MfeLoadError` naming that file and the entry. Once the load has failed, it admits no text to the realm cache and issues no further request; text admitted before the failure stays in the realm cache, and the healthy in-flight entries the load published stay in the realm cache, so the next attempt joins them, while only a timeout releases an attempt's entries (`cpt-frontx-adr-shared-dep-cache-reach`). A joined unit fetch that rejects retries as `cpt-frontx-algo-unit-format-contract-shared-text-admission` step `inst-join-retry-once` specifies, and the entry request joins the handler's in-flight request without a retry of the join. After a failure other than a timeout, the next attempt per `cpt-frontx-algo-mfe-loading-attempt-timeout` joins the realm cache's healthy in-flight entries, a failed fetch already being evicted, and only a timeout releases the attempt's entries - `inst-md-concurrent-failure`
   2. [x] - `p1` - In the same round, request in one flat batch every list unit missing from the realm cache together with every entry of the list's `ownChunks`, the own chunks by location only, resolved against the asset base URL. The batch has no concurrency limit and relies on the platform's connection limits; it is issued in full before any of its responses arrives and never waits on the entry module's response or on any rewriting or minting. The list is in the manifest before the round begins, so no chunk is fetched speculatively and none is fetched twice: the realm cache answers an already-resident unit without a request, and two locations on the load's lists carrying the same content identity are served by one request for that identity. A failed request of the round — a unit or an own chunk — fails the load with an `MfeLoadError` naming that file and the entry; the round's other outcomes are discarded, the attempt admits no text to the realm cache after the failure and issues no further request, text admitted before the failure stays in the realm cache, and the healthy in-flight entries the attempt published stay in the realm cache, so the next attempt joins them, while only a timeout releases an attempt's entries (`cpt-frontx-adr-shared-dep-cache-reach`) - `inst-md-fetch-reachable-units`
   3. [x] - `p1` - Mint the fetched list units per load in dependency order, taking the order's edges only from each unit's `imports` and `answers` as the manifest's unit table records them, so every bare specifier an item imports resolves to the reference of the item answering it; a cycle among unminted items admits no order and fails the load deterministically with an `MfeLoadError` naming the chunks on the cycle and the microfrontend. Each unit is admitted as it arrives; rewriting and minting run once the round has settled, and neither is a precondition for issuing any request of the load - `inst-md-mint-list-items`
   4. [x] - `p1` - Once the listed units are fetched and minted, write the load's console diagnostic as `cpt-frontx-flow-mfe-isolation-load` step `inst-emit-load-diagnostic` specifies (`cpt-frontx-dod-mfe-isolation-shared-dep-diagnostics`) - `inst-md-load-diagnostic`
9. [x] - `p1` - **ELSE** the manifest holds neither `units` nor `lists`: the load uses its whole-package entries — the compatibility path for microfrontends built by older producers, which describe shared code only through `shared[]` — and a manifest that carries no `shared` has none, issues no early entry-module request, and fetches the whole-package entries and the own chunks it finds by walking the chunk graph from the entry module (`cpt-frontx-algo-mfe-isolation-blob-url-chain`) under a fixed concurrency limit of six requests in flight - `inst-md-whole-package-path`
   1. [x] - `p1` - **FOR EACH** entry in `manifest.shared[]`, when the manifest carries `shared`, visited in the manifest's enumeration order, which fixes the sequence of visits and not the order in which the fetches are issued or completed (`cpt-frontx-adr-mfe-asset-discovery`) - `inst-md-for-each-shared`
      1. [x] - `p1` - Resolve `shared.chunkPath` against the asset base URL by the `chunkPath` rule of `inst-md-resolve-location` to form the fetch URL of the file that holds the package - `inst-md-resolve-chunk-path`
      2. [x] - `p1` - Fetch the whole-package entry's source text - `inst-md-fetch-shared-dep`
      3. [x] - `p1` - Rewrite bare specifiers in the fetched source to the already-resolved references of the shared dependencies it imports, in the leaves-first order the consumer derives from the fetched sources themselves (`cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`, step `inst-resolve-order`) - `inst-md-rewrite-specifiers`
      4. [x] - `p1` - Mint a reference for this shared dependency and record it in the per-load map - `inst-md-mint-shared-blob`
10. [x] - `p1` - Mint serialised per load: one load's minting — its shared units, its own chunks, its entry module, and every lazy target it resolves later — runs one mint at a time, shared units leaves-first, each own chunk after the units and own chunks it imports with its bare and relative imports rewritten to this load's references, and the entry module last; fetching is never serialised by it - `inst-md-mint-serialised`
11. [x] - `p1` - **RETURN** asset base URL, entry module location, stylesheet paths, and the load's completed per-load map - `inst-md-return`

### Lazy-Import ABI Resolution

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-loading-lazy-import-abi`

**Input**: The parent load's state — its per-load map, its fetch lists, the asset base URL, the shared base URL and the entry module's location — and a `__frontx_lazy` call with its argument: a literal path, or the computed path of a pattern import

**Output**: A reference for the lazy target, joined to the parent load's isolated graph and bound to its per-load map

**Steps**:
1. [x] - `p1` - At load time, mint a per-load loader stub (tiny ESM blob) that re-exports `__frontx_lazy` as a callable closed over this load's resolver identifier - `inst-lai-mint-stub`
2. [x] - `p1` - Register the per-load resolver in this copy's resolver table, reached by the loader stub through a `resolve(id, path)` operation that the copy publishes under a global key unique to it — a random id generated once per copy and embedded in the stubs it mints — keyed by the load's resolver identifier, unique within the copy; sibling loads receive distinct resolvers, two copies never share a table, and an older copy's `__FRONTX_LAZY__` is never read or written - `inst-lai-register-resolver`
3. [x] - `p1` - Inject the loader stub's reference into every chunk in this load that references the `__frontx_lazy` identifier, so every ABI call reaches this load's resolver - `inst-lai-inject-stub`
4. [x] - `p1` - Reach the ABI from every literal and pattern dynamic import: in the microfrontend's own chunks the call is build-emitted, `__frontx_lazy('<rel>')` for a literal and a `__frontx_lazy` call with the computed path for a pattern import; inside a shared unit — a list item or a whole-package entry — rewrite at mint time every literal dynamic import and every pattern import — a template literal with a statically bounded pattern — to a `__frontx_lazy` call, the pattern call passing its runtime-computed path; the unit's fetched and cached bytes stay unchanged. Only a fully opaque `import(expr)` — neither a literal nor a statically bounded pattern — stays native and unchanged, outside the load's isolated graph (`cpt-frontx-adr-lazy-import-resolution`) - `inst-lai-rewrite-shared-dynamic-imports`
5. [x] - `p1` - **WHEN** a `__frontx_lazy` call is first exercised in a loaded chunk - `inst-lai-when-exercised`
   1. [x] - `p1` - Classify the ABI argument: a relative argument is resolved against the base of the chunk that makes the call — the asset base for the microfrontend's own code and for a whole-package entry, whose `chunkPath` resolves against the asset base, and the shared base for a list item — to obtain the target's location relative to that base; a bare argument, one naming a shared package or one of its subpaths, is its own key and no base applies to it - `inst-lai-resolve-relative-path`
   2. [x] - `p1` - **IF** a reference for this target already exists in the load's per-load map - `inst-lai-if-cached`
      1. [x] - `p1` - **RETURN** the existing reference, with no request and no minting - `inst-lai-return-cached`
   3. [x] - `p1` - **IF** the load uses whole-package entries, its manifest holding neither `units` nor `lists` - `inst-lai-if-whole-package`
      1. [x] - `p1` - Find the target and the own chunks it reaches by walking the chunk graph from the target through `cpt-frontx-algo-mfe-isolation-blob-url-chain`, under the fixed concurrency limit of six requests in flight; their bare specifiers bind to the whole-package units already in the per-load map, and their `__frontx_lazy` references to the same per-load loader stub. A call made by a whole-package entry resolves the same way - `inst-lai-walk-chunk-graph`
      2. [x] - `p1` - **RETURN** the target's reference; the caller imports it, joining the parent load's isolated graph - `inst-lai-return-whole-package`
   4. [x] - `p1` - Find the target's fetch list among the manifest's lists: the list named by key in the `lazy` array of a list the load holds for a literal target, and the one named in a `patterns` array for the concrete file a pattern's computed path names; a list is keyed by the target's chunk location relative to the base that chunk resolves against — the asset base for an own chunk, the shared base for a shared unit — or, for a bare argument naming a shared package, by that bare specifier - `inst-lai-find-target-list`
      1. [x] - `p1` - **IF** the argument is bare and the per-load map already holds a unit answering that specifier, **RETURN** that unit's reference, with no request and no minting - `inst-lai-bare-cached`
      2. [x] - `p1` - **IF** the argument is bare and a list is held under that specifier, request in one round the list's missing units and its `ownChunks` as in `inst-lai-fetch-lazy-chunk`, with no own chunk of the target, and **RETURN** the reference of the unit answering the specifier, for a call made by a shared unit and by the microfrontend's own code alike; the bare argument is never resolved as an own chunk - `inst-lai-resolve-bare-specifier`
   5. [x] - `p1` - **IF** the target's location matches no lazy-target fetch list in the load's lists - `inst-lai-if-no-list`
      1. [x] - `p1` - **IF** the call is made by a shared unit - `inst-lai-if-shared-caller`
         1. [x] - `p1` - **RETURN** load failure — an `MfeLoadError` naming the target and the MFE entry; the load's per-load map gains no entry - `inst-lai-shared-no-list-fail`
      2. [x] - `p1` - **ELSE** the call is made by the microfrontend's own code - `inst-lai-else-own-caller`
         1. [x] - `p1` - Write one console warning per handler for that chunk and MFE entry, naming both - `inst-lai-no-list-warning`
         2. [x] - `p1` - **RETURN** the target's reference, its chunks minted with the units the load's per-load map already holds and no fetch round - `inst-lai-return-no-list`
   6. [x] - `p1` - Request in one round, with no concurrency limit, the target's own chunk, resolved against the asset base (`metaData.publicPath`), every shared unit the target's list names that is missing from both the load's per-load map and the realm cache, resolved against the shared base (`metaData.sharedBase`, or `metaData.publicPath` when it is absent), and the list's `ownChunks`; for a lazy target that is a shared unit, there is no own chunk and its unit joins this round - `inst-lai-fetch-lazy-chunk`
   7. [x] - `p1` - Admit every shared unit fetched in that round under its declared content identity (`inst-md-admit-under-declared-identity`); the round issues in full before any of its responses arrives and before any of its units is minted - `inst-lai-admit-fetched-units`
   8. [x] - `p1` - Extend the parent load's per-load map, never rewrite it: a unit already in it is reused as it is and is neither fetched nor minted again, an existing entry is never replaced, and concurrent resolutions of one target share the same rounds, so a missing unit is fetched and minted once; a unit that fails to fetch fails that lazy import with an `MfeLoadError`, adds no entry to the per-load map, and its failed fetch is evicted so a later, independent lazy import of the same load is unaffected and may retry (`cpt-frontx-adr-lazy-import-resolution`) - `inst-lai-lazy-roots`
   9. [x] - `p1` - Download distinct lazy targets of one load in parallel; their minting is serialised per load (`inst-md-mint-serialised`) - `inst-lai-parallel-targets`
   10. [x] - `p1` - Rewrite bare specifiers in the target's chunks to the references the parent load's per-load map holds for the units they name - `inst-lai-rewrite-lazy-specifiers`
   11. [x] - `p1` - Rewrite any nested `__frontx_lazy` references in the target's chunks to the same per-load loader stub - `inst-lai-rewrite-nested-lazy`
   12. [x] - `p1` - Mint the target's units leaves-first and its own chunks after them, recording each reference in the per-load map - `inst-lai-mint-lazy-blob`
   13. [x] - `p1` - **RETURN** the target's reference; the caller imports it, joining the parent load's isolated graph - `inst-lai-return-lazy-blob`
6. [x] - `p1` - **IF** a `__frontx_lazy` call reaches the resolver table under a loader identifier for which no resolver is registered - `inst-lai-if-unknown`
   1. [x] - `p1` - **RETURN** a rejection of that call naming the loader identifier, with no request and no minting - `inst-lai-unknown-fail`

### Per-Attempt Load Timeout

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-loading-attempt-timeout`

**Input**: One load attempt in progress for an entry, and the handler options `timeout` and `retries` of `MfeLoaderConfig`

**Output**: The attempt's own outcome when it settles within the budget, or a diagnostic load error naming the entry and the elapsed budget; and, for a failed attempt, whether a further attempt may follow

**Steps**:
1. [x] - `p1` - Read the per-attempt budget from the handler option `timeout`, in milliseconds; when the option is absent, the budget is the default of 30000 ms - `inst-lto-read-budget`
2. [x] - `p1` - **IF** the budget is non-positive - `inst-lto-if-disabled`
   1. [x] - `p1` - **RETURN** the attempt unraced; it settles on its own - `inst-lto-return-unraced`
3. [x] - `p1` - Race the attempt against the budget, so whichever settles first determines this attempt's outcome, and release the timer once either side settles - `inst-lto-race-attempt`
4. [x] - `p1` - **IF** the budget elapses before the attempt settles - `inst-lto-if-elapsed`
   1. [x] - `p1` - **RETURN** error - raise a load error naming the entry and the elapsed budget - `inst-lto-raise-timeout`
   2. [x] - `p1` - Leave the abandoned attempt's in-flight work running: the race abandons the attempt's result and does not cancel the work in progress, and anything that work goes on to produce stays subject to the retention invariant of `cpt-frontx-adr-mfe-load-isolation` - `inst-lto-no-cancel`
   3. [x] - `p1` - Release every cache entry the abandoned attempt was waiting on — the handler source-text cache entries of its own chunks (`cpt-frontx-algo-mfe-isolation-blob-url-chain`, step `inst-fetch-source`) and every realm cache entry it fetched or joined: the `chunk:` entries of its list units and the `name@version@…` entries of its whole-package entries (`cpt-frontx-algo-unit-format-contract-shared-text-admission`, step `inst-derive-key`; `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`, step `inst-fetch-and-cache`) — so that a subsequent attempt issues its own fetch instead of resolving to the abandoned attempt's in-flight one - `inst-lto-release-abandoned-source-text`
      1. [x] - `p1` - Record, per entry, the cache object the attempt actually used together with the key and the promise: a realm-cache entry may live in the cache the realm shares across compatible independently loaded copies or in the copy-local fallback that copy took instead (`cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`), and the release removes it only from the cache that received that exact promise - `inst-lto-release-record-cache`
   4. [x] - `p1` - Make each release identity-checked against the recorded cache object: remove the mapping only while that cache still holds, under that key, the very promise the abandoned attempt recorded, and never one a concurrent load has since registered under the same key — the same check that eviction on rejection applies (`cpt-frontx-algo-unit-format-contract-shared-text-admission`, `inst-evict-on-reject`) - `inst-lto-release-identity-checked`
      1. [x] - `p1` - Treat the recorded promise as the generation the release may remove: where two copies joined one promise and the first copy's attempt expired and released its mapping, a retry may publish a replacement promise under the same key, and the second copy's later release, still carrying the promise it joined, leaves the replacement mapped; only an attempt that joined the replacement and then exhausted its own budget releases the replacement. A fetch's eviction of its own rejected entry follows the same generation rule, so the late rejection of an abandoned attempt's request never removes a retry's replacement - `inst-lto-release-generation-identity`
   5. [x] - `p1` - Release an entry by removing its mapping only, never by cancelling the work behind it: `inst-lto-no-cancel` holds unchanged, and the abandoned fetch and the retry's own fetch may be in flight for the same source at once - `inst-lto-release-not-cancel`
      1. [x] - `p1` - Where the released entry lived in the realm-shared cache, leave a waiter in another copy that already holds the promise undisturbed, while a caller arriving after the release finds no entry and starts its own fetch; such a duplicate fetch arises only across retry generations, which `inst-lto-release-generation-identity` bounds. No waiter count is recorded in this release path (`cpt-frontx-adr-shared-dep-cache-reach`) - `inst-lto-release-realm-shared`
5. [x] - `p1` - Keep the attempt's record of the cache entries it waits on only while the attempt is unsettled: once the attempt settles, whether it succeeded or failed, drop the record and accept nothing further into it, so the record never keeps fetched text reachable beyond the bounded caches that hold it. Work that runs after the attempt has settled — a lazy target resolved later through `cpt-frontx-algo-mfe-loading-lazy-import-abi` — records into nothing, and a release after the record is dropped removes nothing - `inst-lto-drop-record-on-settle`
6. [x] - `p1` - Apply the budget to one attempt and not to the load as a whole: an attempt that fails on the network — a request that fails or answers a non-success status — or on an expired budget is retried up to the handler option `retries` times — default 2, so up to three attempts — after an exponential backoff starting at 1000 ms (1000 ms before the first retry, 2000 ms before the second, doubling for each further one), and every retry is raced against its own fresh budget; only a network failure or an expired budget is retried, and every other failure fails the load at once - `inst-lto-per-attempt-budget`
7. [x] - `p1` - **IF** an attempt fails on a failure decided by declared data, which a repeat attempt cannot change — the manifest the MFE entry references is not registered, or the registry answers with a value that is not of manifest shape (`cpt-frontx-flow-mfe-isolation-load`, `inst-manifest-by-id`, `inst-manifest-unresolved-raise`); the manifest declares a shared-dependency name more than once (`cpt-frontx-flow-mfe-isolation-load`, `inst-raise-duplicate-name`); a declared shared-dependency name survives the rewrite as a bare specifier in a whole-package entry (`cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`, `inst-raise-shared-dep-bare-specifier`), an own chunk (`cpt-frontx-algo-mfe-isolation-blob-url-chain`, `inst-raise-own-bare-specifier`) or a list item (`cpt-frontx-algo-mfe-isolation-unit-memo-minting`, `inst-umm-unresolved-specifiers`); a dependency cycle among own chunks (`cpt-frontx-algo-mfe-isolation-blob-url-chain`, `inst-raise-ancestor-cycle`, `inst-raise-join-cycle`), whole-package entries (`cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`, `inst-raise-shared-cycle`) or list items (`cpt-frontx-algo-mfe-loading-manifest-discovery`, `inst-md-mint-list-items`); a location or other declared value the handler refuses (`cpt-frontx-flow-mfe-loading-on-demand-load`, `inst-manifest-invalid-fail`); an empty `exposeAssets.js.sync` (`cpt-frontx-algo-mfe-loading-manifest-discovery`, `inst-md-read-expose-chunk`); or a manifest holding `units` or `lists` with no list for the exposed module (`inst-md-if-fetch-list`) — and any other failure that is neither a network failure nor an expired budget - `inst-lto-if-deterministic-failure`
   1. [x] - `p1` - **RETURN** that failure to the caller without a further attempt and without waiting out any backoff - `inst-lto-no-retry-deterministic`
8. [x] - `p1` - **RETURN** the attempt's own outcome when it settles within the budget - `inst-lto-return-attempt`

## 4. States (CDSL)

### MFE Load Lifecycle State Machine

- [x] `p1` - **ID**: `cpt-frontx-state-mfe-loading-load-lifecycle`

**States**: `idle`, `loading`, `loaded`, `error` — the extension's observable `loadState`

**Initial State**: `idle`

The machine is stated over the `loadState` the registry holds for each registered extension. The attempts of one load, their per-attempt timeouts and the backoff between them (`cpt-frontx-algo-mfe-loading-attempt-timeout`) run inside `loading`: an expired or failed attempt that is retried does not leave `loading`. A load requested while the extension is `loading` joins the load in flight, and a load requested while it is `loaded` returns without a request; neither is a transition.

**Transitions**:
1. [x] - `p1` - **FROM** `idle` **TO** `loading` **WHEN** the registry starts the extension's first load - `inst-lt-idle-to-loading`
2. [x] - `p1` - **FROM** `loading` **TO** `loaded` **WHEN** the handler's load returns a lifecycle module factory: the entry module's reference is minted and imported, and a valid lifecycle module factory is extracted - `inst-lt-loading-to-loaded`
3. [x] - `p1` - **FROM** `loading` **TO** `error` **WHEN** the handler's load fails: a failure decided by declared data on its one attempt (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-if-deterministic-failure`), a network failure or an expired budget on the last attempt (`inst-lto-per-attempt-budget`), or any other failure on the attempt it occurs in - `inst-lt-loading-to-failed`
4. [x] - `p1` - **FROM** `error` **TO** `loading` **WHEN** a later load of the extension is requested; that load issues its requests afresh - `inst-lt-error-to-loading`

## 5. Definitions of Done

### Registered Entry and Manifest Drive Discovery

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-loading-manifest-field-discovery`

The system **MUST** derive every locating fact a microfrontend load needs from the registered MFE entry and the registered manifest it references, read from the registry where they were registered, as declared data and never recovered by parsing compiled output. It **MUST** read only fields of the closed contracts of `cpt-frontx-adr-mfe-asset-discovery` — the MFE entry's `id`, `manifest` (the reference to the registered manifest), `exposedModule`, the first element of `exposeAssets.js.sync`, `exposeAssets.css.sync` and `exposeAssets.css.async`; the manifest's `id`, `metaData.publicPath`, `metaData.sharedBase`, `units`, `lists` and, when the manifest carries `shared`, each `shared[]` entry's `name`, `version`, `chunkPath` and `contentHash` — leaving required fields, closure and value formats to the type system's manifest and MFE entry types. Each location kind **MUST** resolve against its one base: shared units against `metaData.sharedBase` when given, otherwise `metaData.publicPath`; own chunks, the entry module, stylesheets and each `chunkPath` against `metaData.publicPath`; a relative `sharedBase` against the resolved `publicPath` directory, required to be an http(s) URL once resolved. A shared-unit or `chunkPath` location, absolute or relative, that carries a percent-encoded dot, a backslash, a space or a control character, names a scheme other than http(s) or is protocol-relative, or names a directory **MUST** fail the load before its request without a retry, and a relative one that climbs out of its base **MUST** fail the same way; an absolute http(s) URL **MUST** be accepted for every location kind and is exempt only from the stay-inside-the-base test. The fields of older producers that the contract accepts as known-but-ignored **MUST NOT** be read, and a manifest or MFE entry that carries them **MUST** load as one without them. The `shared[]` array's published order **MUST** be treated as an enumeration order only. A load that fails **MUST** disable only its own microfrontend: its `loadState` becomes `error`, and the shell, the domains and every other microfrontend **MUST** keep working.

**Implements**:
- `cpt-frontx-flow-mfe-loading-on-demand-load`
- `cpt-frontx-algo-mfe-loading-manifest-discovery`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-runtime-registration`

**Covers (DESIGN)**:
- `cpt-frontx-adr-mfe-asset-discovery`

**Constraints**: none owned — the MFE entry and the manifest read here are the microfrontend's own registered contracts (`cpt-frontx-adr-mfe-asset-discovery`)

**Touches**:
- Entities: `MfeEntry`, `MfManifest`

### Fetch-List Load in One Round

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-loading-one-round-load`

When the manifest holds `units` or `lists`, the system **MUST** take the exposed module's list from `lists`, **MUST** fail the load before any request, naming the missing key, when the manifest holds either and no list for the exposed module, and **MUST** request the entry module, every list unit missing from the realm cache and every entry of the list's `ownChunks` together in one round with no concurrency limit, issued in full before any of its responses arrives and before any shared unit is minted, the entry module at high fetch priority (`cpt-frontx-adr-mfe-asset-discovery`); own chunks **MUST** be requested by location only, against `metaData.publicPath`. Two locations on a load's lists carrying the same content identity **MUST** be served by one request. Minting **MUST** be serialised per load — units leaves-first in the order their recorded `imports`/`answers` edges give, own chunks after what they import, the entry module last — and a cycle among units **MUST** fail the load naming the chunks on the cycle and the microfrontend. When the manifest holds neither `units` nor `lists`, the system **MUST** use the whole-package entries, issue no early entry-module request, and fetch those entries and the own chunks found by walking the chunk graph under the fixed concurrency limit of six requests in flight; that limit **MUST NOT** apply to the round of a fetch-list load. A failure of the entry module request or of any request of the round **MUST** fail the load with an `MfeLoadError` naming that file and the entry and discard the other outcomes; once the load has failed it **MUST** admit no text to the realm cache and issue no further request, while text admitted before the failure stays in the realm cache and the healthy in-flight entries the load published stay in the realm cache, so the next attempt joins them, while only a timeout releases an attempt's entries (`cpt-frontx-adr-shared-dep-cache-reach`); a joined unit fetch retries as `cpt-frontx-dod-unit-format-contract-shared-text-admission` specifies. On the fetch-list path the load's diagnostic is written as `cpt-frontx-dod-mfe-isolation-shared-dep-diagnostics` specifies.

**Implements**:
- `cpt-frontx-flow-mfe-loading-on-demand-load`
- `cpt-frontx-algo-mfe-loading-manifest-discovery`

**Covers (PRD)**:
- `cpt-frontx-nfr-runtime-performance`
- `cpt-frontx-nfr-resource-efficiency`

**Covers (DESIGN)**:
- `cpt-frontx-adr-mfe-asset-discovery`
- `cpt-frontx-adr-shared-dep-reuse`

**Constraints**: none owned

**Touches**:
- Entities: `MfeEntry`, `MfManifest`

### Shared Text Admitted Under Its Declared Content Identity

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-loading-content-identity`

The load **MUST** admit shared text as `cpt-frontx-dod-unit-format-contract-shared-text-admission` defines, at the points `inst-md-admit-under-declared-identity` names, on the exposed module's load and on a lazy target's first use alike. The microfrontend's own code **MUST NOT** be admitted to the realm cache. The acceptance criteria of `cpt-frontx-feature-unit-format-contract` for admission are this definition's criteria; where shared text and own code are held is `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache` and `cpt-frontx-dod-mfe-isolation-handler-source-text-cache`.

**Implements**:
- `cpt-frontx-algo-mfe-loading-manifest-discovery`
- `cpt-frontx-algo-mfe-loading-lazy-import-abi`

**Covers (PRD)**:
- `cpt-frontx-nfr-security`

**Covers (DESIGN)**:
- `cpt-frontx-adr-mfe-asset-discovery`
- `cpt-frontx-adr-shared-dep-cache-reach`

**Constraints**: `cpt-frontx-constraint-mfes-realm-shared-dep-cache`

**Touches**:
- Entities: `MfManifest`

### Lazy-Import ABI Inherits Parent Load Bindings

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-loading-lazy-abi-isolation`

The system **MUST** resolve every `__frontx_lazy` call through a per-load ABI resolver that is distinct for each concurrent load and registered in the table of the copy that minted it, reached through a global key unique to that copy, resolve a relative argument against the base of the chunk that makes the call (`publicPath` for the microfrontend's own code and for a whole-package entry, `sharedBase` for a list item), take a bare argument naming a shared package as its own key, and bind the lazy target to the parent load's per-load map — so a lazy target always evaluates inside its parent load's isolated graph and a unit reached both eagerly and lazily stays one instance within the load. The build emits the call for every literal and pattern dynamic import in a microfrontend's own chunks; the system **MUST** rewrite every literal and every pattern dynamic import inside a shared unit — a list item or a whole-package entry — to the call at mint time, leaving only a fully opaque `import(expr)` native. On a whole-package load the system **MUST** find a lazy target and the own chunks it reaches by walking the chunk graph from the target under the fixed concurrency limit of six requests in flight, binding them to the whole-package units already in the per-load map. On a fetch-list load, a call from a shared unit whose target matches no lazy-target fetch list **MUST** fail the lazy load with an `MfeLoadError` naming the target and the MFE entry; a call from the microfrontend's own code whose target matches none **MUST** produce one console warning per handler for that chunk and entry and load with the units the per-load map already holds. On a fetch-list load, a lazy target's first use **MUST** cost one round — the target's own chunk, against `publicPath`, the shared units missing from the load's per-load map and the realm cache, against the shared base, and the list's `ownChunks`, requested together with no concurrency limit, a shared-unit target's unit joining the round in place of an own chunk — with each target's list found under its chunk location relative to the base that chunk resolves against, or under the bare specifier for a bare argument naming a shared package, which resolves through that list to the unit answering the specifier and never as an own chunk. Distinct lazy targets of one load **MUST** download in parallel while minting stays serialised per load, concurrent resolutions of one target **MUST** share its rounds, an existing per-load map entry **MUST NOT** be replaced, and a failed unit **MUST** fail only that lazy import. Deferred resolution **MUST** be preserved: a lazy target is fetched and evaluated only on first exercise.

**Implements**:
- `cpt-frontx-flow-mfe-loading-on-demand-load`
- `cpt-frontx-algo-mfe-loading-lazy-import-abi`

**Covers (PRD)**:
- `cpt-frontx-fr-mfe-runtime-registration`
- `cpt-frontx-nfr-runtime-performance` — lazy deferral keeps the eager working set small; per-load inheritance avoids duplicating shared dependencies

**Covers (DESIGN)**:
- `cpt-frontx-adr-lazy-import-resolution`

**Touches**:
- Entities: `MfeEntry`

### Per-Attempt Load Timeout Budget

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-loading-attempt-timeout`

The system **MUST** race every individual load attempt against the per-attempt budget set by the handler option `timeout` of `MfeLoaderConfig`, 30000 ms when the option is absent, giving each retry of a failed attempt its own fresh budget rather than a share of the first attempt's; a non-positive `timeout` **MUST** leave the attempt unraced rather than expire it immediately. An attempt that fails on the network — a request that fails or answers a non-success status — or on an expired budget **MUST** be retried up to the handler option `retries` times, 2 when the option is absent, after an exponential backoff starting at 1000 ms (1000 ms, 2000 ms, …); only network failures and expired budgets are retried, and every other failure **MUST** fail the load at once. An attempt that exceeds its budget **MUST** fail with a diagnostic load error naming the entry and the elapsed budget, and the abandoned attempt's in-flight work **MUST NOT** be treated as cancelled; anything it goes on to produce remains subject to the retention invariant of `cpt-frontx-adr-mfe-load-isolation`. On expiry the system **MUST** also release, under an identity check against the promise the abandoned attempt recorded, every cache entry that attempt was awaiting — its own chunks' handler cache entries and every realm cache entry it fetched or joined: the `chunk:` and whole-package `name@version@…` entries of its list units and whole-package entries — so a retry issues its own fetch rather than rejoining the abandoned one. The attempt's record of those entries **MUST** exist only while the attempt is unsettled and **MUST** be dropped once the attempt settles, so it never retains fetched source text beyond the bounded caches. An attempt that fails on a failure decided by declared data **MUST NOT** be retried: an unregistered manifest or a registry answer that is not of manifest shape, a shared-dependency name declared more than once, a declared shared-dependency name surviving as a bare specifier in a list item, an own chunk or a whole-package entry, a dependency cycle, a location or other declared value the handler refuses, or an empty `exposeAssets.js.sync` (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-if-deterministic-failure`).

**Implements**:
- `cpt-frontx-flow-mfe-loading-on-demand-load`
- `cpt-frontx-algo-mfe-loading-attempt-timeout`

**Covers (PRD)**:
- `cpt-frontx-nfr-runtime-performance` — a bounded per-attempt budget keeps a stalled fetch from holding a load open indefinitely
- `cpt-frontx-fr-mfe-load-failure-handling`

**Constraints**: none owned

**Touches**:
- Entities: `MfeEntry`

## 6. Acceptance Criteria

The admission of shared text, the one retry of a joined fetch and the release of realm cache entries on timeout are accepted against the criteria of `cpt-frontx-feature-unit-format-contract`.

- [x] A load reads its asset base location, entry module, stylesheets and fetch lists from the registered MFE entry and the manifest it references, read from the registry, with no parse of compiled output to locate them.
- [x] A load whose MFE entry references a manifest that is not registered, or for which the registry answers with a value that is not of manifest shape, fails after one attempt, the extension's `loadState` becomes `error`, and no request of the load is issued.
- [x] For a fetch-list load, the entry module, every list unit missing from the realm cache and every entry of the list's `ownChunks` are all requested before any response arrives, with no limit on the number in flight and before any shared unit is minted, the entry module at high fetch priority and the rest at the default priority; units already in the realm cache are not requested; an entry text already resident in the handler source-text cache is not requested again, and the entry is downloaded once per load.
- [x] A fetch-list load issues no request whose location is learned from an earlier response: the whole round is requested before any response arrives.
- [x] A failed request of the round — the entry module, a unit or an entry of `ownChunks` — fails the load with an `MfeLoadError` naming that file and the entry; the round's other outcomes are discarded, the attempt admits no text to the realm cache after the failure and issues no further request, text admitted before the failure stays in the realm cache, and the healthy in-flight entries the attempt published stay in the realm cache, so the next attempt joins them, while only a timeout releases an attempt's entries.
- [x] Two locations on a load's lists carrying the same content identity are served by one request.
- [x] List items are minted leaves-first from their recorded `imports`/`answers` edges, the entry module is evaluated only after every shared unit it reaches is minted, each load mints its own references, and one load's minting never runs two mints at once.
- [x] A fetch list whose unminted items form an import cycle fails the load with an `MfeLoadError` naming the chunks on the cycle and the microfrontend, after one attempt.
- [x] With `metaData.sharedBase` set and different from `metaData.publicPath`, the shared units are requested under `sharedBase`, while the own chunks, the entry module, the stylesheets and each `chunkPath` are requested under `publicPath`; a relative `sharedBase` resolves against the resolved `publicPath` directory.
- [x] A shared-unit or `chunkPath` location that carries a percent-encoded dot or a forbidden character, names another scheme or names a directory fails the load before any request for it, after one attempt, whether it is absolute or relative; a relative one that climbs out of its base fails the same way; an absolute http(s) URL is accepted for every location kind; and a `metaData.sharedBase` value that is protocol-relative, carries a forbidden character or does not resolve to an http(s) URL fails the load before any request.
- [x] A manifest that holds `units` or `lists` but no list for the exposed module fails the load before any request, naming the missing key, and takes no whole-package path.
- [x] A manifest that holds neither `units` nor `lists` uses its whole-package entries, issues no early entry-module request, and fetches those entries and the own chunks it finds by walking the chunk graph with at most six requests in flight.
- [x] A failure of the entry module request fails the load with an `MfeLoadError`, with the other requests' results discarded and no further request issued for the attempt; after a failure other than a timeout, the next attempt joins the realm cache's healthy in-flight entries, a failed fetch is already evicted, and only a timeout releases the attempt's entries.
- [x] A manifest and an MFE entry that carry the fields an older producer writes — `name`, `remoteEntry`, `metaData.name`, `metaData.type`, `metaData.buildInfo`, `metaData.remoteEntry`, `metaData.globalName`, `shared[].unwrapKey` and `exposeAssets.js.async` — and no `units`, `lists` or `metaData.sharedBase` register and load through `shared[]`, with none of those fields read.
- [x] A manifest without `shared`, `units` and `lists` loads its entry module and the own chunks it finds by walking the chunk graph, with no whole-package entry fetched.
- [x] A load that fails — an unregistered manifest, a refused location, a failed request, a cycle or an expired budget — sets the `loadState` of that extension to `error` and leaves the shell, every domain and every other extension working, including another extension loading at the same time.
- [x] An empty `exposeAssets.js.sync` is refused before any request of the load, not retried.
- [x] Loads driven by different copies of the package in one realm each register their per-load resolvers in their own copy's table, reached through a global key unique to that copy, so a `__frontx_lazy` call from a load reaches that load's resolver and two copies never misroute; a copy never reads or writes the `__FRONTX_LAZY__` global of an older copy.
- [x] Each concurrent MFE load receives a distinct per-load `__frontx_lazy` resolver stub; a `__frontx_lazy` call from load A routes to load A's resolver and not load B's.
- [x] On a fetch-list load, a lazy target's first use requests its own chunk, its listed shared units missing from the load's per-load map and the realm cache and its list's `ownChunks` before any response arrives, with no limit on the number in flight and before any of them is minted; a lazy target that is a shared unit has its unit in that round and no own chunk.
- [x] On a fetch-list load, a lazy target's first use costs one round.
- [x] On a fetch-list load, an own lazy chunk finds the fetch list recorded under its location relative to `publicPath`, and a lazy target that is a shared unit finds the one recorded under its location relative to `sharedBase`.
- [x] A unit already in the load's per-load map is neither fetched nor minted again for a lazy target, its entry is not replaced, and concurrent resolutions of the same lazy target issue each request once and mint each missing unit once.
- [x] Two distinct lazy targets first used together have their requests in flight at the same time, and their minting does not overlap.
- [x] On a fetch-list load, a lazy call from the microfrontend's own code whose target matches no lazy-target fetch list produces one console warning per handler for that chunk and entry, naming both, and the chunk loads with the units already in the per-load map.
- [x] On a fetch-list load, a lazy call from a shared unit whose target matches no lazy-target fetch list fails the lazy load with an `MfeLoadError` naming the target and the MFE entry, and the load's per-load map gains no entry.
- [x] Minting a shared unit — a list item or a whole-package entry — rewrites every literal and every pattern dynamic import in it to the `__frontx_lazy` call, and leaves a fully opaque `import(expr)` unchanged.
- [x] On a whole-package load, a lazy target and the own chunks it reaches are found by walking the chunk graph from the target with at most six requests in flight and bind to the whole-package units already in the per-load map; a call made by a whole-package entry resolves the same way, and neither produces the warning or the failure of a target without a fetch list.
- [x] A lazily reached unit that fails to fetch fails that lazy import, adds no entry to the per-load map, and does not block a later, independent lazy import on the same load.
- [x] Deferred resolution is preserved: a lazy target is fetched and its reference minted only when its `__frontx_lazy` call is first exercised, not eagerly at parent-load time.
- [x] Each load attempt is raced against the configured timeout budget; a retry of a failed attempt receives its own fresh budget rather than sharing the first attempt's.
- [x] With no `timeout` option each attempt is raced against a budget of 30000 ms; a non-positive `timeout` leaves the attempt unraced, and it settles on its own.
- [x] With no `retries` option a load whose attempts keep failing on the network makes three attempts, waiting 1000 ms before the second and 2000 ms before the third; an attempt whose failure is neither a network failure nor an expired budget is not retried.
- [x] An attempt that fails on a failure decided by declared data — an unregistered manifest or a registry answer that is not of manifest shape, a shared-dependency name declared more than once, a declared shared-dependency name surviving as a bare specifier in a list item, an own chunk or a whole-package entry, a dependency cycle, a refused location or other declared value, an empty `exposeAssets.js.sync`, a manifest holding `units` or `lists` with no list for the exposed module, or any other failure that is neither a network failure nor an expired budget — is not retried: the load rejects with that failure after one attempt, issuing no further source fetches and waiting out no backoff.
- [x] An attempt that exceeds its budget fails with a diagnostic naming the entry and the elapsed budget, while the abandoned attempt's in-flight work is left to run rather than cancelled.
- [x] When an attempt whose source fetch never settles expires, the retry issues its own fetch for that source instead of resolving to the abandoned attempt's in-flight one, so a retry that can succeed does succeed; the release is identity-checked and therefore leaves untouched any entry a concurrent load registered under the same key after the abandoned attempt registered its own.
- [x] Once a load attempt settles, its record of the source-text entries it waited on holds no entry and accepts none; a lazy target resolved after the load settled leaves that record empty, so no fetched source text stays reachable through the load beyond the bounded caches.
- [x] An extension's `loadState` goes `idle` → `loading` → `loaded` when its load succeeds, and `loading` → `error` once the load fails; it stays `loading` while attempts, their timeouts and the backoff between them run; a later load requested from `error` returns it to `loading` and issues its requests afresh.
