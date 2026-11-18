---
version: 4
description: Specifies isolation of each loaded microfrontend in its own module graph behind an audited trust kernel that concentrates all dynamic-code primitives.
---

# Feature: MFE Runtime Isolation

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Isolated MFE Load](#isolated-mfe-load)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Blob URL Chain Construction](#blob-url-chain-construction)
  - [Shared-Dependency Blob URL Construction](#shared-dependency-blob-url-construction)
  - [Per-Load Map and Unit Minting](#per-load-map-and-unit-minting)
  - [Realm Shared-Dependency Cache Rendezvous](#realm-shared-dependency-cache-rendezvous)
  - [Trust-Kernel Guarded Import](#trust-kernel-guarded-import)
- [4. States (CDSL)](#4-states-cdsl)
  - [Isolated Module Lifecycle](#isolated-module-lifecycle)
  - [Per-Load Blob State](#per-load-blob-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Audited Trust Kernel — Blob Core](#audited-trust-kernel--blob-core)
  - [Instance-Keyed Load Cache](#instance-keyed-load-cache)
  - [Realm-Shared Dependency Source-Text Cache](#realm-shared-dependency-source-text-cache)
  - [Handler Source-Text Cache](#handler-source-text-cache)
  - [Manifest Reference Resolution](#manifest-reference-resolution)
  - [Per-Load Map — Extendable, Never Rewritten](#per-load-map--extendable-never-rewritten)
  - [Shared-Dependency Diagnostics](#shared-dependency-diagnostics)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-mfe-isolation`

## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-mfe-isolation`

### 1.1 Overview

Isolates each loaded microfrontend in its own module graph behind an audited trust kernel — concentrating all dynamic-code primitives in one safety-annotated, contract-enforced file with a no-mutable-state invariant, retaining backing references for the realm's lifetime to support post-resolution evaluation. Across loads only source text is shared: shared text through one byte-budgeted realm cache, a microfrontend's own code through the handler cache. Each load records the blob URL it mints for every shared unit, whole-package entry and own chunk it reaches in its **per-load map**; lazy targets extend that map, and no entry in it is ever replaced.

### 1.2 Purpose

A registered microfrontend must evaluate as its own module instance so distinct occupants cannot couple through a shared module record: every specifier a load rewrites — static imports, bare shared-dependency specifiers, and literal and pattern dynamic imports — resolves inside that load's own graph, and a fully opaque `import(expr)` stays native as the one accepted exception (`cpt-frontx-adr-lazy-import-resolution`). At the same time, the dynamic-code primitives isolation requires (dynamic import of inline content, construction of specifier matchers) must be confined to one small, audited, lint-enforced location so the arbitrary-code-admission surface stays provably bounded. This feature defines how that isolation is achieved and how the trust kernel is structured and enforced.

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-nfr-security`, `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-resource-efficiency`

**Principles**: `cpt-frontx-principle-default-deny-admission`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Registers and loads a microfrontend into the running application; the isolation mechanism is transparent to this actor but guarantees their MFE evaluates as its own isolated instance |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-mfe-load-isolation`, `cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-shared-dep-cache-reach`, `cpt-frontx-adr-mfe-asset-discovery`, `cpt-frontx-adr-lazy-import-resolution`
- **Component**: `cpt-frontx-component-mfe-runtime`
- **Dependencies**: `cpt-frontx-feature-mfe-registry`, `cpt-frontx-feature-mfe-loading`, `cpt-frontx-feature-unit-format-contract`

**Checklist applicability**:
- PERF — Addressed in §5 (Realm-Shared Dependency Source-Text Cache; Handler Source-Text Cache; Shared-Dependency Diagnostics), which address `cpt-frontx-nfr-runtime-performance` and `cpt-frontx-nfr-resource-efficiency`: shared text is held in one cache per realm bounded by a byte budget, and each load reports the shared bytes it fetched and the realm cache's state.
- SEC — Addressed in §5 (Audited Trust Kernel — Blob Core; Instance-Keyed Load Cache), which address `cpt-frontx-nfr-security`: one audited file is the sole site of dynamic import of inline content and accepts only `blob:` or `data:` URLs, and each extension evaluates as its own module instance.
- REL — Addressed in §2 (Isolated MFE Load, Error Scenarios) and §4 (Isolated Module Lifecycle): a load that fails names its cause and its load-cache entry is removed, so a later load attempt starts fresh.
- DATA — Addressed in §3 (Realm Shared-Dependency Cache Rendezvous) and §5 (Realm-Shared Dependency Source-Text Cache; Handler Source-Text Cache; Instance-Keyed Load Cache): what each in-memory cache holds and under which keys (the key forms cite `cpt-frontx-algo-unit-format-contract-shared-text-admission`), the versioned realm entry `{ v: 1, cache }`, and each cache's lifetime — the realm's for the realm cache and the load cache, the handler's for the handler cache. Nothing is stored durably.
- INT — Addressed in §3 (Shared-Dependency Blob URL Construction; Realm Shared-Dependency Cache Rendezvous) and §5 (Manifest Reference Resolution): the manifest's shared-dependency list and the version-namespaced rendezvous are the contracts this feature reads and shares.
- OPS — Addressed in §5 (Realm-Shared Dependency Source-Text Cache; Shared-Dependency Diagnostics): the application sets the realm cache budget through the `sharedDepTextCacheMaxBytes` handler option, and each load on the fetch-list path writes one console diagnostic with the bytes it fetched and the realm cache's figures.
- MAINT — Not applicable because this feature sets no maintainability target of its own; the dynamic-code primitives stay in one lint-enforced file (§5, Audited Trust Kernel — Blob Core).
- TEST — Addressed in §6: the acceptance criteria an implementation is tested against.
- COMPL — Not applicable because this feature handles no regulated or personal data.
- UX — Not applicable because this feature renders no user interface.
- BIZ — Not applicable because this is an internal library feature; its requirements are cited by ID in §1.2.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Isolated MFE Load

- [ ] `p1` - **ID**: `cpt-frontx-flow-mfe-isolation-load`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer's MFE code is loaded and evaluated as a fresh isolated module instance keyed by the extension instance ID, then mounted into its target domain
- Two extensions sharing the same entry definition produce distinct isolated evaluations with no shared module state

**Error Scenarios**:
- The entry module's source cannot be fetched — load fails and its load-cache entry is removed for retry
- The import primitive receives a non-inline-content URL — guard rejects it with a type error before any dynamic import executes
- Neither the handler's own manifest cache nor the registry the handler was registered into holds the manifest the entry references, or the registry answers with a value that is not of manifest shape — load fails with an error naming the unresolved reference and nothing is cached; a handler that belongs to no registry has no registry to read from and fails the same way
- The manifest declares the same shared-dependency package name more than once — load fails with an error naming the duplicated package and the manifest, before any shared-dependency source is fetched
- A chunk's static dependency has no blob URL when that chunk is rewritten — load fails with an error naming the referring chunk and the unbuilt dependency, rather than emitting an origin URL for it
- The microfrontend's own chunks import one another in a cycle, whether closed within one branch or across two branches that fanned out independently — load fails with an `MfeLoadError` naming the chunks on the cycle and the microfrontend
- The manifest's whole-package entries import one another circularly — load fails with a diagnostic naming those dependencies and the imports among them, rather than minting a module whose bare specifiers are left unrewritten
- A declared shared-dependency name survives the rewrite as a bare specifier in an own chunk or a whole-package entry — load fails with an `MfeLoadError` naming the chunk, the surviving specifier, and the microfrontend

**Steps**:
1. [x] - `p1` - Actor registers the microfrontend entry with the registry - `inst-register`
2. [x] - `p1` - Actor triggers the load action for the microfrontend - `inst-trigger-load`
3. [x] - `p1` - System checks the instance-keyed load cache for an existing promise keyed by the extension instance ID - `inst-check-cache`
4. [x] - `p1` - **IF** a cached load promise exists for this instance ID - `inst-if-cached`
   1. [x] - `p1` - **RETURN** the cached lifecycle (same blob URLs, same module instance, same lifecycle reference) - `inst-return-cached`
5. [ ] - `p1` - **ELSE** - `inst-else-new-load`
   1. [x] - `p1` - System resolves the registered manifest the entry references by its identifier - `inst-resolve-manifest`
      1. [x] - `p1` - System reads the handler's manifest cache — keyed by manifest id, held by the handler for its lifetime and bounded by the manifests registered — and, on a miss, reads the manifest registered under that identifier from the registry the handler was registered into, through the type system that registry supplied to the handler at registration. It accepts the answer as a manifest only when it is an object carrying a string `id`, an object `metaData` and an array `shared`, and caches an accepted manifest under its `id` for later loads; any other answer is treated as a miss and cached nowhere - `inst-manifest-by-id`
      2. [x] - `p1` - **IF** neither source yields a manifest for the identifier, System raises an MFE load error naming the unresolved reference - `inst-manifest-unresolved-raise`
   2. [x] - `p1` - System verifies that every shared-dependency package name the manifest declares is unique within that manifest, before the fetch-list and whole-package paths divide and before any shared-dependency source is fetched - `inst-assert-unique-names`
      1. [x] - `p1` - **IF** the same package name is declared more than once, regardless of version - `inst-if-duplicate-name`
         1. [x] - `p1` - **RETURN** error — fail the load with a diagnostic naming the duplicated package and the manifest - `inst-raise-duplicate-name`
   3. [x] - `p1` - System builds the load's shared-dependency blob URLs: **IF** the exposed module has a fetch list, from the shared units that list names, fetched under `cpt-frontx-algo-mfe-loading-manifest-discovery` and minted via `cpt-frontx-algo-mfe-isolation-unit-memo-minting`; **ELSE** from every whole-package entry the manifest declares, via `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`, which decides their construction order itself from the fetched sources - `inst-build-shared-blobs`
   4. [ ] - `p1` - **IF** the exposed module has a fetch list, once the fetch-list document and the list items it names are fetched and minted, System writes exactly one diagnostic for the load at `console.warn` level naming the manifest: the bytes of the fetch-list document and list items this load itself fetched — excluding the microfrontend's own code, requests it joined and lazy batches — and the realm cache's held bytes, entry count, budget and evictions, read through the cache's `getDiagnostics` operation; **IF** the adopted realm cache has no `getDiagnostics` operation, the diagnostic states that the figures are unavailable. The diagnostic is written before the microfrontend's own chunks are minted and does not wait on them: a load that fails before its list items are minted — its fetch-list document, a list item, the entry module or an entry of the list's `ownChunks` failing — writes no diagnostic, and a load whose own code fails after the diagnostic is written keeps it - `inst-emit-load-diagnostic`
   5. [x] - `p1` - System builds the blob URL chain for the entry module and the own chunks of its full static-dependency graph via `cpt-frontx-algo-mfe-isolation-blob-url-chain`, so the own chunks are minted leaves-first after the shared units and the entry module last - `inst-build-expose-chain`
   6. [x] - `p1` - System imports the entry module's blob URL through the trust-kernel guarded import primitive - `inst-import-expose`
   7. [x] - `p1` - System validates that the imported module implements the lifecycle contract (mount and unmount functions) - `inst-validate-lifecycle`
   8. [x] - `p1` - **IF** lifecycle contract not satisfied - `inst-if-bad-lifecycle`
      1. [x] - `p1` - System removes the load-cache entry and raises an MFE load error; a load that fails at any earlier step has its load-cache entry removed the same way - `inst-evict-raise`
   9. [x] - `p1` - System wraps the lifecycle with stylesheet injection logic and records the load promise in the instance-keyed cache - `inst-cache-promise`
      1. [x] - `p1` - The stylesheet wrapper's `mount` passes every argument it receives to the microfrontend's own `mount`, `mountContext` included. It calls that `mount` within the same synchronous call and returns its result. It may insert the stylesheets first, but it never awaits before the call. This keeps open the synchronous window in which the mount manager records the mounting bridge (`cpt-frontx-algo-mfe-host-communication-registration-propagation`) - `inst-wrap-mount-synchronous`
      2. [x] - `p1` - The stylesheet wrapper's `unmount` awaits the microfrontend's own `unmount` first. It removes the injected stylesheets afterwards, in a `finally`. The microfrontend stays styled while its asynchronous unmount is pending, and the stylesheets are removed even when that unmount throws - `inst-wrap-unmount-styles-last`
6. [x] - `p1` - Actor mounts the returned lifecycle into the target domain container - `inst-actor-mount`
7. [x] - `p1` - **RETURN** the mounted lifecycle instance - `inst-return-lifecycle`

## 3. Processes / Business Logic (CDSL)

Internal system functions that implement the isolation mechanism.

### Blob URL Chain Construction

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-blob-url-chain`

**Input**: A chunk filename — the entry module's on the initial build, a lazy chunk's on a lazy build — the requesting lineage (ancestor filenames whose construction transitively awaits this one), a build-scoped failure signal, and per-load state (base URL, entry ID, an in-flight construction registry — a transient join point that lets concurrent requesters for one filename share a single construction — and the per-load map, which holds the shared-dependency blob URLs and is the one durable record of completed constructions)

**Output**: The per-load map extended with the requested chunk and every chunk of its transitive static-dependency graph, or a failure of the chain build

**Steps**:
1. [x] - `p1` - Operate under a failure signal created fresh for each chain build — the initial entry-module build, or one lazy-chunk resolution — and shared only by the recursive constructions of that same build, so a failed build never suppresses or fails a later independent build within the same load - `inst-build-failure-scope`
2. [x] - `p1` - Check whether the chunk filename is already present in the per-load map - `inst-check-map`
3. [x] - `p1` - **IF** chunk already mapped - `inst-if-mapped`
   1. [x] - `p1` - **RETURN** immediately (already computed for this load) - `inst-return-mapped`
4. [x] - `p1` - Check whether the requested filename already appears in the lineage carried by this request, which would make its own construction depend on itself — a cycle this load's graph cannot express - `inst-check-ancestor-cycle`
5. [x] - `p1` - **IF** the filename is present in its own lineage - `inst-if-ancestor-cycle`
   1. [x] - `p1` - **RETURN** error — fail this chain build with a diagnostic naming the chunk and the lineage that closes the cycle, without constructing and **without awaiting**, so no circular wait is created - `inst-raise-ancestor-cycle`
6. [x] - `p1` - **WHEN** a cycle is detected — in a construction's own lineage or in a joined lineage — emit the diagnostic as the raised `MfeLoadError` itself, once per chunk per chain build, naming the chunk, the lineage that closes the cycle — the own chunks on the cycle — the microfrontend, and the remedy (rebuild the microfrontend so its chunk graph is acyclic), rather than as a warning alongside a degraded resolution - `inst-diagnose-cycle`
7. [x] - `p1` - Check whether a construction promise for this filename is already in flight in the per-load in-flight construction registry - `inst-check-inflight`
8. [x] - `p1` - **IF** an in-flight promise exists - `inst-if-inflight`
   1. [x] - `p1` - Form the union of this request's own lineage and the lineage recorded on the in-flight entry - `inst-join-lineage-union`
   2. [x] - `p1` - **IF** that union already names the requested filename — awaiting it would close a cycle across two branches that fanned out independently, which is the cross-branch circular wait this check exists to prevent - `inst-if-join-cycle`
      1. [x] - `p1` - **RETURN** error — fail this chain build with the same diagnostic as `inst-raise-ancestor-cycle`, without awaiting, so no circular wait is created across the two branches - `inst-raise-join-cycle`
   3. [x] - `p1` - **ELSE** contribute this request's own lineage into the in-flight entry's lineage before awaiting it, so that a later request issued by the joined construction back into this branch is detectable as the cycle it is - `inst-contribute-lineage`
   4. [x] - `p1` - **RETURN** the existing in-flight promise (concurrent callers share one construction) - `inst-return-inflight`
9. [x] - `p1` - Register an in-flight entry for this filename carrying a lineage seeded from the requesting lineage, and thread that lineage — live, not a snapshot — through this construction and into every dependency it recurses into - `inst-register-inflight`
10. [x] - `p1` - **IF** the build's failure signal is already raised when this construction begins - `inst-if-failed-at-entry`
    1. [x] - `p1` - **RETURN** without fetching, abandoning work this build will never use - `inst-return-failed-at-entry`
11. [ ] - `p1` - Obtain the own chunk's source text through the handler source-text cache, keyed by the chunk's absolute URL: on the fetch-list path an own chunk the list's `ownChunks` names joins the request the load's second-round batch already issued, so its fetch never waits for minting; otherwise the text is fetched from that URL. An own chunk the build reaches that the list's `ownChunks` omits is a producer defect (`cpt-frontx-dod-unit-format-contract-producer-obligations`); the runtime still fetches it from its URL when the chain build reaches it, outside the two-round bound of `cpt-frontx-dod-mfe-loading-two-round-load`. The text is held in the handler source-text cache only and is never admitted to the realm cache; that cache never evicts an in-flight entry (`cpt-frontx-dod-mfe-isolation-handler-source-text-cache`) - `inst-fetch-source`
12. [x] - `p1` - **IF** the build's failure signal was raised by another branch while this fetch was in flight - `inst-if-failed-after-fetch`
    1. [x] - `p1` - **RETURN** without minting a blob URL - `inst-return-failed-after-fetch`
13. [x] - `p1` - Parse all relative static import filenames from the chunk source - `inst-parse-static-imports`
14. [x] - `p1` - Fan the sibling dependency recursions out concurrently rather than awaiting each sibling's entire subtree before starting the next, admitting them through a single concurrency budget shared by the whole chain build so that the number of source fetches in flight for that build stays within one fixed width of six, a constant of the runtime, regardless of graph depth or the number of sibling groups. The width applies only to the path without a fetch list; the fetch-list batch has no concurrency limit (`cpt-frontx-adr-mfe-asset-discovery`) - `inst-fanout-bounded`
15. [x] - `p1` - **FOR EACH** dependency filename in the parsed static imports - `inst-for-each-dep`
    1. [x] - `p1` - Recursively build the blob URL chain for the dependency, passing a lineage extended with this chunk's own filename - `inst-recurse-dep`
16. [x] - `p1` - Await every sibling recursion and scan the outcomes in declaration order — not completion order — for the first failure, so the reported error is deterministic regardless of which sibling lost the wall-clock race - `inst-first-failure-declaration-order`
17. [x] - `p1` - **IF** a sibling recursion failed - `inst-if-sibling-failed`
    1. [x] - `p1` - Raise this build's failure signal and propagate that first failure to the caller - `inst-raise-build-failure`
18. [x] - `p1` - **IF** the build's failure signal was raised by a branch outside this construction's own subtree - `inst-if-failed-elsewhere`
    1. [x] - `p1` - **RETURN** without minting a blob URL - `inst-return-failed-elsewhere`
19. [x] - `p1` - Rewrite all relative static import specifiers to their resolved blob URLs from the per-load map - `inst-rewrite-static`
20. [x] - `p1` - Raise an MFE load error for any static dependency that has no entry in the per-load map when its referrer is rewritten, naming the referring chunk and the dependency, rather than emitting an origin URL for it - `inst-raise-unbuilt-dep`
21. [x] - `p1` - Rewrite all bare shared-dependency specifiers to their shared-dependency blob URLs in the per-load map - `inst-rewrite-shared`
22. [ ] - `p1` - Assert that no shared-dependency name the manifest declares survives the rewrite as a bare specifier in the own chunk's rewritten source, checked in the same two import forms and by the same rule `inst-assert-shared-dep-no-bare-specifier` applies to whole-package entries - `inst-assert-own-no-bare-specifier`
23. [ ] - `p1` - **IF** a declared shared-dependency name survives that assertion - `inst-if-own-bare-specifier`
    1. [ ] - `p1` - **RETURN** error — fail this chain build with an `MfeLoadError` naming the chunk, the surviving specifier, and the microfrontend - `inst-raise-own-bare-specifier`
24. [ ] - `p1` - **IF** the rewritten source still carries an undeclared, well-formed package module specifier, by the rule `inst-if-undeclared-specifier` applies to whole-package entries, emit a console warning naming the chunk, that specifier, and the microfrontend, and proceed - `inst-warn-own-undeclared-specifier`
25. [x] - `p1` - Replace `import.meta.url` occurrences with the chunk's real HTTP base URL to preserve relative URL resolution under blob evaluation - `inst-rewrite-meta-url`
26. [x] - `p1` - **IF** the rewritten source references the lazy-import ABI entry point - `inst-if-lazy-ref`
    1. [x] - `p1` - Mint or reuse the per-load lazy-loader stub blob URL and inject its import at the top of the source - `inst-inject-lazy-stub`
27. [x] - `p1` - Wrap the fully rewritten source in a blob, create a blob URL, and record it in the per-load map - `inst-create-blob`
28. [x] - `p1` - **RETURN** with the blob URL present in the per-load map, which is the durable record of this construction - `inst-return-complete`
29. [x] - `p1` - **WHEN** a construction settles — fulfilled or rejected — without a blob URL recorded for its filename (abandonment because another branch of the same build failed, or its own failure — including a detected cycle), remove its in-flight registry entry, so a later request re-attempts construction instead of joining a settled promise that produced nothing - `inst-settle-drop-inflight`

### Shared-Dependency Blob URL Construction

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`

**Input**: MFE manifest whose exposed module has no fetch list and whose shared-dependency names `inst-assert-unique-names` of `cpt-frontx-flow-mfe-isolation-load` has found unique, containing the whole-package entries (name, version, chunk path, and an optional content hash of the entry's file) in the manifest's published enumeration order, which fixes only the sequence in which the declarations are visited (`cpt-frontx-adr-mfe-asset-discovery`)

**Output**: The per-load map holding one blob URL per whole-package entry declared in the manifest, keyed by package name

**Steps**:
1. [ ] - `p1` - **FOR EACH** shared dependency declared in the manifest, visited in the manifest's enumeration order — which governs only the sequence of visits, so the enumeration may issue its fetches concurrently, admitted through the same fixed width `inst-fanout-bounded` names; this phase completes before the load's entry-module chain build begins, so the two phases never contribute to one another's in-flight count - `inst-for-each-shared-dep`
   1. [x] - `p1` - Derive the absolute chunk URL from the load's absolute asset base URL (the manifest's `publicPath` resolved against the host document's base URL) and the dependency's `chunkPath` - `inst-derive-url`
   2. [x] - `p1` - **IF** the whole-package entry declares a content identity (`contentHash`) - `inst-if-hash-declared`
      1. [x] - `p1` - Take the realm cache key `cpt-frontx-algo-unit-format-contract-shared-text-admission` derives for a whole-package entry that declares one (`inst-derive-key`), so reuse is scoped to loads whose declared content identity agrees - `inst-compute-key-hash`
   3. [x] - `p1` - **ELSE** - `inst-else-no-hash`
      1. [x] - `p1` - Take the location key `cpt-frontx-algo-unit-format-contract-shared-text-admission` derives for a whole-package entry that declares none (`inst-derive-key`), so reuse is confined to loads that resolve the identical absolute location (`inst-admit-whole-package-by-location`) - `inst-compute-key-fallback`
      2. [x] - `p1` - Emit an adoption notice naming the dependency, the manifest it came from, and that cross-MFE reuse is disabled for that dependency, once per handler for each package `name@version` and manifest id pair, not per load; the handler remembers the 64 most recently noticed pairs, so its memory stays bounded and a pair older than those may be noticed again; the load proceeds on the location key rather than failing - `inst-emit-adoption-notice`
   4. [x] - `p1` - **IF** the realm cache this copy resolved through the realm rendezvous (`cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`) — the realm-shared cache every compatible independently loaded copy converges on, or this copy's own local fallback — already holds a promise for this key - `inst-if-cache-hit`
      1. [x] - `p1` - Retrieve the cached source text promise - `inst-retrieve-cached`
   5. [ ] - `p1` - **ELSE** - `inst-else-fetch`
      1. [x] - `p1` - Fetch the source text from the absolute chunk URL derived earlier, publishing the in-flight promise in the realm cache under the key before awaiting it and evicting it on rejection under the identity check, as `cpt-frontx-algo-unit-format-contract-shared-text-admission` specifies (`inst-fetch-on-miss`, `inst-evict-on-reject`) - `inst-fetch-and-cache`
      2. [ ] - `p1` - Issue that fetch as a request of its own that neither reads nor populates the handler source-text cache, so the realm cache alone holds the entry's text and the realm byte budget bounds it - `inst-whole-package-bypass-handler-cache`
2. [x] - `p1` - Resolve the collected sources in dependency order — the sole source of dependency-order correctness for blob construction, derived from the fetched sources themselves and not from the manifest's enumeration order — processing each dependency only after all dependencies it imports have been resolved - `inst-resolve-order`
3. [x] - `p1` - **IF** a pass over the pending shared dependencies resolves none of them, the remaining set imports one another circularly and no dependency order over it exists - `inst-if-shared-cycle`
   1. [x] - `p1` - **RETURN** error — fail the load with a diagnostic naming the shared dependencies that remain unresolved and the imports among them that form the cycle, rather than minting a module whose bare specifiers are left unrewritten - `inst-raise-shared-cycle`
4. [ ] - `p1` - **FOR EACH** dependency in resolved order - `inst-for-each-resolved`
   1. [x] - `p1` - Rewrite bare shared-dep specifiers in the source to the already-resolved blob URLs - `inst-rewrite-specifiers`
   2. [ ] - `p1` - Rewrite every literal and every pattern dynamic import in the entry's text to the lazy-import call `cpt-frontx-algo-mfe-loading-lazy-import-abi` specifies; only a fully opaque `import(expr)` stays native (`cpt-frontx-adr-lazy-import-resolution`). At run time the call's target and the chunks it reaches are found by walking the chunk graph from that target (`cpt-frontx-algo-mfe-isolation-blob-url-chain`) and bind to the whole-package entries already in the per-load map, so a whole-package load resolves a lazy target with no fetch list for it - `inst-rewrite-whole-package-dynamic-imports`
   3. [x] - `p1` - Assert that no shared-dependency name the manifest declares survives the rewrite as a bare specifier in the rewritten source, checked in the two static import forms the specifier rewrite handles — `from "x"` and `import "x"` — while a dynamic import has become the lazy-import call (`inst-rewrite-whole-package-dynamic-imports`) and stays outside this check (`cpt-frontx-adr-mfe-asset-discovery`) - `inst-assert-shared-dep-no-bare-specifier`
   4. [x] - `p1` - **IF** a declared shared-dependency name survives that assertion - `inst-if-shared-dep-bare-specifier`
      1. [x] - `p1` - **RETURN** error — fail the load with a diagnostic naming the chunk, the surviving specifier, and the microfrontend - `inst-raise-shared-dep-bare-specifier`
   5. [x] - `p1` - **IF** the rewritten source still carries, in those same two import forms, a specifier the manifest never declared which is well-formed as a package module specifier — an optionally scoped package name with an optional subpath, carrying no whitespace, quote, parenthesis, colon or line break - `inst-if-undeclared-specifier`
      1. [x] - `p1` - Emit a diagnostic naming the chunk, that specifier, and the microfrontend, and proceed with the load (`cpt-frontx-adr-mfe-asset-discovery`) - `inst-warn-undeclared-specifier`
   6. [x] - `p1` - Wrap the rewritten source in a blob, create a fresh blob URL, and record it in the per-load map under the dependency's package name - `inst-create-dep-blob`
5. [x] - `p1` - **RETURN** the shared-dependency blob URLs recorded in the per-load map - `inst-return-map`

### Per-Load Map and Unit Minting

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-unit-memo-minting`

**Input**: The load's reachable unit set — unit ids and their source text admitted to the realm cache under `cpt-frontx-algo-unit-format-contract-shared-text-admission` — and the load's per-load map

**Output**: The per-load map extended to one blob URL per unit the load reaches; raw unit text cached realm-wide, blob URLs minted once per unit per load

**Steps**:
1. [ ] - `p1` - Walk the load's reachable units leaves-first, processing each unit only after every unit it depends on has a blob URL in this load's per-load map, so a unit's specifiers are always rewritten to minted URLs - `inst-umm-leaves-first`
2. [ ] - `p1` - **FOR EACH** unit, resolve every intra-package relative import against the member module that carries it — in a multi-module unit each member's relative specifier resolves against that member's own module path, never against the unit's first member alone — so a unit built from an import cycle still mints working specifier edges - `inst-umm-per-member-relative`
3. [ ] - `p1` - Rewrite every bare specifier to this load's blob URL for the shared-dependency unit it names, including subpath specifiers: a specifier such as `react/jsx-runtime` resolves to the unit of the package's subpath module, not to the package root alone, so no bare specifier survives into a minted blob - `inst-umm-subpath-rewrite`
   1. [ ] - `p1` - **IF** a declared shared-dependency name nevertheless survives the rewrite as a bare specifier, checked by the rule `inst-assert-shared-dep-no-bare-specifier` applies, **RETURN** error — fail the load, or on a lazy target's first use that lazy import, with an `MfeLoadError` naming the unit, the surviving specifier and the microfrontend; an undeclared, well-formed package module specifier that survives produces a console warning naming the same three and the load proceeds - `inst-umm-unresolved-specifiers`
   2. [ ] - `p1` - Rewrite every literal and every pattern dynamic import in the unit's text to the lazy-import call `cpt-frontx-algo-mfe-loading-lazy-import-abi` specifies, at mint time — a pattern import with the path computed at runtime and resolved through the fetch list's pattern records; only a fully opaque `import(expr)` stays native, as the one accepted exception to isolation (`cpt-frontx-adr-lazy-import-resolution`). At run time on a fetch-list load, a call from a shared unit whose target has no fetch list fails the load with an `MfeLoadError` and a call from the microfrontend's own code whose target has none is warned about and loads (`cpt-frontx-algo-mfe-loading-lazy-import-abi`); a whole-package load resolves its lazy targets by walking the chunk graph (`inst-rewrite-whole-package-dynamic-imports`) - `inst-umm-dynamic-import-rewrite`
4. [ ] - `p1` - Mint exactly one blob URL per unit for this load and record it in the per-load map under the unit id, so two dependents of one unit share its module record inside this load's graph while a different load mints its own - `inst-umm-one-blob-per-unit`
5. [ ] - `p1` - Extend the per-load map, never rewrite it: a lazily reached unit set adds entries to the same map (`cpt-frontx-algo-mfe-loading-lazy-import-abi`, `inst-lai-lazy-roots`) and no entry is replaced, so a specifier rewritten earlier always names a live blob URL - `inst-umm-memo-extendable`
6. [ ] - `p1` - Keep raw unit text in the realm cache under the key `cpt-frontx-algo-unit-format-contract-shared-text-admission` derives for it (`inst-derive-key`), shared across loads, while the minted blob URLs stay per-load (`cpt-frontx-adr-shared-dep-cache-reach`) - `inst-umm-text-realm-blob-perload`
7. [ ] - `p1` - **RETURN** the extended per-load map - `inst-umm-return`

### Realm Shared-Dependency Cache Rendezvous

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`

**Input**: The realm's global object, and the protocol version this evaluated copy of the package speaks

**Output**: The bounded shared-dependency source-text cache this copy's loads consult — the one cache compatible copies in the realm converge on, or a cache local to this copy where the realm's entry cannot be understood

**Steps**:
1. [x] - `p1` - Read the realm-global slot `Symbol.for('@gears-frontx/mfes:shared-dep-text-cache:1')`, whose description carries the protocol version this copy speaks, and expect an entry of shape `{ v: 1, cache }` — `v` the protocol version, compared by equality, and `cache` an object exposing the operations `get`, `set` and `delete` as functions, plus an optional `getDiagnostics` operation returning `{ bytes, entries, budget, evictions }` — the held bytes, entry count, budget and evictions; the accessor is internal, and the shared-unit fetcher on `./unit-loader` reaches the cache only through it, so obtaining the cache adds no exported symbol and no consumer-visible operation (`cpt-frontx-constraint-mfes-realm-shared-dep-cache`) - `inst-rsdc-read-slot`
2. [x] - `p1` - **IF** the slot holds nothing - `inst-rsdc-if-empty`
   1. [x] - `p1` - Create the cache with the byte budget this handler's configuration sets, or the default budget when it sets none, with the `getDiagnostics` operation, and publish the entry `{ v: 1, cache }` into the slot synchronously, before returning it, so two copies initializing in one realm cannot each end up holding a cache of their own; the first handler that publishes the cache therefore sets the realm's budget - `inst-rsdc-publish`
3. [ ] - `p1` - **ELSE IF** the entry carries the protocol version this copy speaks - `inst-rsdc-if-version-known`
   1. [ ] - `p1` - Adopt the cache the entry carries unchanged, recognizing it by `get`, `set` and `delete` being functions rather than by class identity; an adopted cache without `getDiagnostics` is used all the same, and the per-load diagnostic then states that the figures are unavailable (`inst-emit-load-diagnostic`); a budget this handler's configuration sets does not alter the adopted cache, so a configured budget never multiplies the realm's footprint - `inst-rsdc-adopt`
   2. [x] - `p1` - Adopt a structurally conforming entry whichever same-realm code published it: the slot is trusted same-realm coordination state, not an authenticity or confidentiality boundary, so the version and structural checks guard against accidental incompatibility and neither establish publisher identity nor prevent a same-realm publisher from observing or substituting cached source text; no cross-copy authentication is attempted (`cpt-frontx-adr-shared-dep-cache-reach`) - `inst-rsdc-trusted-coordination`
4. [x] - `p1` - **ELSE** the entry is malformed, or carries a protocol version this copy does not recognize - `inst-rsdc-else-version-unknown`
   1. [x] - `p1` - Treat the slot as absent, emit a diagnostic naming the unrecognized entry, and neither read, mutate, replace nor delete it — a copy that cannot establish the entry's semantics must not act on them, and an incompatible future protocol occupies a slot of its own rather than contending for this one - `inst-rsdc-leave-unknown`
   2. [x] - `p1` - Fall back to a cache local to this evaluated copy, bounded by the same byte budget and shared by every handler of that copy, so reuse degrades to copy scope rather than failing the load - `inst-rsdc-fallback-local`
5. [x] - `p1` - Hold the resulting cache per handler as a reference obtained here rather than as a field static to this copy, so the reference is instance-held while the cache it names is realm-shared and the scope stays legible where it is read - `inst-rsdc-hold-reference`
6. [x] - `p1` - **RETURN** that cache, which every shared text this copy loads is looked up in and published into for the realm's lifetime; it is bounded by a byte budget with least-recently-used eviction, a resident fulfilled value stays strongly reachable until evicted, and no handler discard, registry disposal, extension unmount or extension unregistration clears or releases it - `inst-rsdc-return-cache`

### Trust-Kernel Guarded Import

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-trust-kernel-import`

**Input**: URL string provided as the target for dynamic module import

**Output**: Evaluated ES module record, or a type error if the URL does not begin with an inline-content scheme

**Steps**:
1. [x] - `p1` - Inspect the leading scheme of the URL - `inst-inspect-scheme`
2. [x] - `p1` - **IF** URL does not begin with `blob:` or `data:` - `inst-if-invalid-scheme`
   1. [x] - `p1` - **RETURN** error — reject with a type error identifying the non-conforming URL - `inst-reject-scheme`
3. [x] - `p1` - Execute the dynamic import of the inline-content URL through the trust kernel - `inst-exec-import`
4. [x] - `p1` - **RETURN** the evaluated module record - `inst-return-module`

## 4. States (CDSL)

### Isolated Module Lifecycle

- [ ] `p2` - **ID**: `cpt-frontx-state-mfe-isolation-module-lifecycle`

**States**: UNLOADED, ISOLATED, ACTIVE, DISPOSED

**Initial State**: UNLOADED

**Transitions**:
1. [x] - `p1` - **FROM** UNLOADED **TO** ISOLATED **WHEN** the blob URL chain is successfully built and the entry module is imported through the trust kernel, with the load promise recorded in the instance-keyed cache - `inst-to-isolated`
2. [x] - `p1` - **FROM** ISOLATED **TO** ACTIVE **WHEN** the lifecycle's mount operation is invoked and the MFE is rendered into the target domain container - `inst-to-active`
3. [x] - `p1` - **FROM** ACTIVE **TO** DISPOSED **WHEN** the lifecycle's unmount operation is invoked and the MFE is removed from the domain container - `inst-to-disposed`
4. [x] - `p1` - **FROM** UNLOADED **TO** UNLOADED **WHEN** a load attempt fails, including one whose own chunks import one another in a cycle; the load-cache entry is removed so a subsequent load attempt starts fresh - `inst-load-failed-retry`
5. [ ] - `p1` - **FROM** DISPOSED **TO** ACTIVE **WHEN** the lifecycle's mount operation is invoked again for the same extension instance; the load-cache entry is reused, so no module is re-evaluated and no blob URL is minted - `inst-remount`

### Per-Load Blob State

- [ ] `p2` - **ID**: `cpt-frontx-state-mfe-isolation-load-blob-state`

**States**: INITIALIZING, BUILDING, COMPLETE, FAILED

**Initial State**: INITIALIZING

**Transitions**:
1. [x] - `p1` - **FROM** INITIALIZING **TO** BUILDING **WHEN** the shared-dependency blob URLs are constructed and the entry module's chain build begins - `inst-blob-building`
2. [x] - `p1` - **FROM** BUILDING **TO** COMPLETE **WHEN** all chunks in the dependency graph have blob URLs recorded in the per-load map - `inst-blob-complete`
3. [ ] - `p1` - **FROM** COMPLETE **TO** BUILDING **WHEN** a lazy target's first use starts a chain build that extends the per-load map - `inst-blob-lazy-extend`
4. [ ] - `p1` - **FROM** BUILDING **TO** COMPLETE **WHEN** a lazy target's chain build fails; only that lazy import fails, and the per-load map keeps every entry it held - `inst-blob-lazy-failed`
5. [ ] - `p1` - **FROM** INITIALIZING **TO** FAILED **WHEN** building the shared-dependency blob URLs fails; the load fails and its load-cache entry is removed (`inst-load-failed-retry`) - `inst-blob-shared-failed`
6. [ ] - `p1` - **FROM** BUILDING **TO** FAILED **WHEN** the entry module's chain build fails; the load fails and its load-cache entry is removed (`inst-load-failed-retry`) - `inst-blob-failed`

## 5. Definitions of Done

### Audited Trust Kernel — Blob Core

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-blob-core`

The system **MUST** maintain a single audited trust-kernel file that is the sole site of dynamic import of inline content and dynamic construction of specifier matchers. Every exported function in this file **MUST** carry a safety rationale, the file **MUST** declare no mutable module-level state, it **MUST** import no dangerous host capabilities, and the dynamic-import function **MUST** guard its input to accept only scheme-prefixed inline-content URLs (`blob:` or `data:`). A custom lint rule **MUST** enforce that these dynamic-code primitives appear only in this file.

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`
- `cpt-frontx-algo-mfe-isolation-trust-kernel-import`

**Constraints**: none owned

**Covers (PRD)**: `cpt-frontx-nfr-security`

**Touches**:
- Entities: `MfeEntry`

### Instance-Keyed Load Cache

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-handler-load-cache`

The system **MUST** key the load cache by the extension instance ID (not the entry definition ID) so that two extensions sharing the same entry definition produce distinct blob URL chains and distinct module evaluations. The cache **MUST** retain load promises for the realm's lifetime and **MUST NOT** revoke blob URLs after the import resolves, because a module may continue evaluating after its import promise settles. A re-load or re-registration of the same extension instance **MUST** reuse its existing entry and mint nothing new, so the cache is bounded by the extension instances registered and **MUST** have no capacity-driven eviction. A failed load's entry **MUST** be removed, including a load whose own chunks import one another in a cycle, so a later attempt starts fresh.

The load cache **MUST** remain class-static within one evaluated copy of the package, so every handler that copy constructs recognizes a repeat load of the same extension instance, and it **MUST NOT** be reached through the realm shared-dependency cache protocol (`cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`) or shared with any other evaluated copy by any other means (`cpt-frontx-adr-mfe-load-isolation`, `cpt-frontx-adr-shared-dep-cache-reach`).

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`
- `cpt-frontx-algo-mfe-isolation-blob-url-chain`

**Constraints**: none owned

**Covers (PRD)**: `cpt-frontx-nfr-security`

**Touches**:
- Entities: `MfeEntry`

### Realm-Shared Dependency Source-Text Cache

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache`

The system **MUST** hold shared text in one cache per JavaScript realm, the realm cache, which every compatible independently loaded copy of the package in that realm converges on through the version-namespaced rendezvous `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous` specifies. The realm cache **MUST** hold only shared text — fetch-list documents, list items and whole-package entries — each admitted as fetched under the key `cpt-frontx-algo-unit-format-contract-shared-text-admission` derives for it (`inst-derive-key`). A microfrontend's own code — its entry module, its further and lazy chunks, and the own chunks a fetch list's `ownChunks` names — **MUST NOT** be admitted to the realm cache.

The realm entry **MUST** have the shape `{ v: 1, cache }`: `v` is the protocol version, and `cache` exposes the operations `get`, `set` and `delete`, and optionally `getDiagnostics`, returning `{ bytes, entries, budget, evictions }` — the held bytes, entry count, budget and evictions. A cache this package creates **MUST** carry `getDiagnostics`; an adopted cache without it **MUST** still be used, and the per-load diagnostic then states that the figures are unavailable.

The realm cache **MUST** be bounded by a byte budget on the source text it retains, once for the whole realm: the budget **MUST NOT** multiply by handler count or by compatible package-copy count, and admitting text that would exceed it **MUST** evict least-recently-used entries until the retained bytes fit. Bytes **MUST** be accounted as the UTF-8 byte length of the text when the text is fulfilled, since an in-flight fetch has no size yet. The default budget is 4 MiB (4 × 1024 × 1024 = 4,194,304 bytes). An application sets its own budget through the `sharedDepTextCacheMaxBytes` field of the handler configuration `MfeLoaderConfig`. The budget **MUST** be the one set by the first handler that publishes the realm cache, or the default when that handler sets none; later handlers **MUST** adopt the published cache unchanged. A single text larger than the whole budget **MUST NOT** be retained: it is evicted as soon as its size is known, and the load that fetched it proceeds with the text it already holds.

Every test that touches the realm slot **MUST** clear the slot before and after it runs, so no test observes a realm cache another test published.

Code outside the package **MUST** admit text to the realm cache only through the shared-unit fetcher on `./unit-loader`, which fetches and admits under the same discipline as a microfrontend load and derives the cache key itself. Convergence **MUST** add no other public surface: no exported symbol, no capability method on any type in the DESIGN's API Contracts table, and no constructor argument, so the cache is reached only through an internal accessor (`cpt-frontx-constraint-mfes-realm-shared-dep-cache`). The cache **MUST** retain both in-flight and fulfilled source-text promises, holding a resident fulfilled value strongly until eviction so that a later compatible handler in that realm still receives the hit, and **MUST** share source text only: every load **MUST** still construct its own isolated module graph over the text it retrieves.

Its lifetime **MUST** be the realm's. The system **MUST NOT** count retainers on it, and **MUST NOT** clear or release it when a handler is discarded, a registry is disposed, an extension is unmounted, or an extension is unregistered; no expiry window applies. Eviction **MUST** be capacity-driven or identity-checked only, so a caller already holding an evicted promise proceeds unaffected and a rejection can never remove a promise a later load published under the same key.

On meeting a realm entry that is malformed or carries a protocol version it does not recognize, a copy **MUST** treat the entry as absent, emit a diagnostic, leave the entry unread, unmutated, unreplaced and undeleted, and serve that copy's loads from a cache local to itself, bounded by the same byte budget and shared by every handler of that copy; an incompatible future protocol **MUST** occupy a rendezvous slot of its own rather than this one.

A structurally conforming protocol entry **MUST** be adopted whichever same-realm code published it. The rendezvous is trusted same-realm coordination state, not an authenticity or confidentiality boundary: the version and structural checks guard against accidental incompatibility and **MUST NOT** be presented as publisher authentication or as preventing a same-realm publisher from observing or substituting cached source text, which `cpt-frontx-adr-shared-dep-cache-reach` records as an accepted consequence.

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`
- `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`
- `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`

**Constraints**: `cpt-frontx-constraint-mfes-realm-shared-dep-cache`

**Covers (PRD)**: `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-security`

**Touches**:
- Entities: `MfeEntry`

### Handler Source-Text Cache

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-handler-source-text-cache`

Each handler **MUST** hold a microfrontend's own code — its entry module, its further and lazy chunks, and the own chunks a fetch list's `ownChunks` names — in a source-text cache of its own, keyed by absolute URL and holding the in-flight or fulfilled text promise. The handler cache **MUST** hold only that own code: fetch-list documents, list items and whole-package entries **MUST NOT** pass through it, so the realm byte budget bounds all retained shared text. It **MUST NOT** evict an in-flight entry; its bound of 256 entries with least-recently-used eviction applies to settled entries. Its lifetime is the handler's, and it sits outside the realm byte budget.

**Implements**:
- `cpt-frontx-algo-mfe-isolation-blob-url-chain`
- `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`

**Constraints**: none owned

**Covers (PRD)**: `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-resource-efficiency`

**Touches**:
- Entities: `MfeEntry`

### Manifest Reference Resolution

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-manifest-reference-resolution`

An entry references a registered manifest by its identifier. The handler **MUST** read its own manifest cache first and, on a miss, read the manifest registered under that identifier from the registry the handler was registered into, through the type system that registry supplied to it at registration. The handler **MUST** accept the answer as a manifest only when it is an object carrying a string `id`, an object `metaData` and an array `shared`, and **MUST** treat any other answer as a miss and cache it nowhere. The manifest cache **MUST** be keyed by manifest id, live with the handler, and hold only manifests the registry yielded, so it is bounded by the manifests registered. The handler **MUST** carry the type system the registry supplied, and a handler registered into no registry carries none. When no source yields a manifest for the identifier, the system **MUST** fail the load with an error naming the unresolved reference rather than proceeding with an absent or foreign manifest.

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`

**Constraints**: none owned

**Touches**:
- Entities: `MfeEntry`

### Per-Load Map — Extendable, Never Rewritten

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-unit-memo`

Each load **MUST** mint its units leaves-first — every unit after the units it depends on — rewriting each unit's bare and relative specifiers to this load's own blob URLs, one blob URL per unit, recorded in the per-load map under each unit id. Relative imports inside a multi-module unit **MUST** resolve against the member module that carries them, never against the unit's first member alone, and a subpath bare specifier (such as `react/jsx-runtime`) **MUST** resolve to the unit of the package's subpath module rather than the package root. The per-load map **MUST** be extendable — a lazily reached unit set adds entries — and **MUST NOT** be rewritten, so an earlier rewrite never names a dead blob URL. Every literal and every pattern dynamic import in a shared unit **MUST** be rewritten to the lazy-import call at mint time; only a fully opaque `import(expr)` stays native. At run time on a fetch-list load, a call from a shared unit whose target has no fetch list **MUST** fail the load with an `MfeLoadError` and a call from the microfrontend's own code whose target has none **MUST** be warned about and load (`cpt-frontx-algo-mfe-loading-lazy-import-abi`). On a whole-package load, every literal and every pattern dynamic import in a whole-package entry **MUST** be rewritten to the lazy-import call at mint time, and a lazy target **MUST** be resolved by walking the chunk graph from it and bound to the whole-package entries already in the per-load map. A declared shared-dependency name that survives the rewrite **MUST** fail the load with an `MfeLoadError` naming the unit, the specifier and the microfrontend, and a surviving undeclared, well-formed specifier **MUST** produce a console warning naming the same three. Raw unit text **MUST** be cached in the realm cache while blob URLs stay per-load.

**Implements**:
- `cpt-frontx-algo-mfe-isolation-unit-memo-minting`
- `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`
- `cpt-frontx-flow-mfe-isolation-load`

**Covers (PRD)**: `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-security`

**Constraints**: none owned

**Touches**:
- Entities: `MfeEntry`

### Shared-Dependency Diagnostics

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-shared-dep-diagnostics`

On the fetch-list path, each load **MUST** write exactly one diagnostic at `console.warn` level, once the fetch-list document and the list items it names are fetched and minted, naming the manifest and giving the bytes of the fetch-list document and list items that load itself fetched — excluding the microfrontend's own code, requests it joined and lazy batches — together with the realm cache's held bytes, entry count, budget and evictions as its `getDiagnostics` operation returns them, each figure matching the cache's state. The diagnostic **MUST NOT** wait on the microfrontend's own chunks: a load that fails before its list items are minted — its fetch-list document, a list item, the entry module or an entry of the list's `ownChunks` failing — **MUST NOT** write it, and a load whose own code fails after it is written keeps it. When the adopted realm cache has no `getDiagnostics` operation, the diagnostic **MUST** state that the figures are unavailable. The retained-memory threshold of `cpt-frontx-nfr-resource-efficiency` is thereby checkable from the runtime's own output.

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`

**Covers (PRD)**: `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-resource-efficiency`

**Constraints**: none owned

**Touches**:
- Entities: `MfeEntry`

## 6. Acceptance Criteria

- [x] Each loaded microfrontend evaluates as its own isolated module instance; two extensions sharing the same entry definition receive distinct instance-keyed cache entries and distinct module evaluations
- [x] All dynamic-code primitives (dynamic import of inline content, dynamic construction of specifier matchers) are confined to the single audited trust-kernel file; a lint rule enforces this boundary
- [x] The trust-kernel import primitive rejects any input URL that does not begin with `blob:` or `data:` before any import executes
- [x] All blob URLs in the instance-keyed load cache are retained for the realm's lifetime and are never revoked after the import resolves
- [ ] Re-loading, unmounting and re-mounting, or re-registering the same extension instance reuses its load-cache entry and mints no new blob URL; the load cache never evicts an entry for capacity
- [x] Whole-package entry text is fetched once for the realm and reused by every later load whose realm cache key for it agrees (`cpt-frontx-algo-unit-format-contract-shared-text-admission`, `inst-derive-key`); an entry whose fetch failed is fetched again by a later load
- [ ] Fetch-list documents, list items and whole-package entry text are held in the realm cache and never in the handler source-text cache; the entry module and every own chunk, including the own chunks a fetch list's `ownChunks` names, are never admitted to the realm cache
- [x] On load failure, the load-cache entry for the failed extension instance is removed so a subsequent call can attempt a fresh load
- [x] Compatible independently loaded copies of the package in one realm converge on a single shared-dependency source-text cache — bounded by a byte budget with least-recently-used eviction — through a version-namespaced rendezvous of its own, so a dependency whose key agrees across copies is fetched once for the realm; an unrecognized rendezvous entry is left untouched and the copy serves its loads from a local cache bounded by the same byte budget; the cache survives handler discard and registry disposal; and every load still evaluates its own isolated module graph over the text it reuses
- [ ] Each load mints its reachable units leaves-first into its per-load map; a lazily reached unit set extends the same map and no entry is ever rewritten.
- [ ] A multi-module unit resolves each member's relative imports against that member's own module path, so a unit built from an import cycle mints working specifier edges.
- [ ] A subpath bare specifier such as `react/jsx-runtime` is rewritten to the blob URL of the unit carrying the package's subpath module; no bare specifier survives into a minted blob.
- [ ] A load on the fetch-list path writes exactly one `console.warn` diagnostic naming the manifest once its fetch-list document and list items are fetched and minted; its fetched-byte figure counts the fetch-list document and list-item bytes that load itself fetched and excludes the microfrontend's own code, joined requests and lazy batches, and its held bytes, entry count, budget and evictions match what the realm cache's `getDiagnostics` returns; a load whose fetch-list document, a list item, the entry module or an entry of `ownChunks` fails before its list items are minted writes none, while a load whose own chunk fails after the diagnostic is written keeps it; when the adopted realm cache has no `getDiagnostics` operation, the diagnostic states that the figures are unavailable.
- [ ] Admitting text beyond the byte budget evicts least-recently-used entries until the retained UTF-8 bytes fit; without a configured budget the default of 4 MiB (4,194,304 bytes) is enforced, and a `sharedDepTextCacheMaxBytes` value replaces it.
- [ ] The budget of the first handler that publishes the realm cache applies; a later handler configured with a different budget adopts the published cache unchanged, so the bound multiplies by neither handler nor compatible package-copy count.
- [ ] A single text larger than the whole budget is not retained in the realm cache, and the load that fetched it still completes.
- [ ] Every test that touches the realm slot clears the slot before and after it runs, so no test observes a realm cache another test published.
- [ ] The handler source-text cache holds at most 256 settled entries, evicting the least recently used, and never evicts an in-flight entry; it holds only the microfrontend's own code.
- [ ] Admission to the realm cache from code outside the package is tested by the acceptance criteria `cpt-frontx-feature-unit-format-contract` gives for `cpt-frontx-dod-unit-format-contract-loader-surface`.
- [ ] Every literal and every pattern dynamic import inside a shared unit is rewritten to the lazy-import call at mint time, and only a fully opaque `import(expr)` stays native; at run time on a fetch-list load, a call from a shared unit whose target has no fetch list fails the load with an `MfeLoadError`, while a call from the microfrontend's own code whose target has no fetch list is warned about and loads.
- [ ] On a whole-package load, every literal and every pattern dynamic import in a whole-package entry is rewritten to the lazy-import call at mint time, and on first use its target and the chunks that target reaches are found by walking the chunk graph and bind to the whole-package entries already in the per-load map, with no fetch list for the target.
- [ ] Every specifier a load rewrites — static imports, bare shared-dependency specifiers, and literal and pattern dynamic imports — names an inline-content URL that load minted or the lazy-import call; a fully opaque `import(expr)` is the one specifier left native.
- [ ] Own chunks whose static-dependency graph closes a cycle — including one that closes across two branches that fanned out independently — fail the load without a circular wait, with an `MfeLoadError` naming the chunks on the cycle and the microfrontend, and no module of that load is requested from its origin as a module.
- [ ] Whole-package entries that import one another circularly fail the load with a diagnostic naming them, rather than producing a module whose bare specifiers are left unrewritten.
- [ ] A static dependency absent from the per-load map when its referrer is rewritten fails the load with a diagnostic naming the referring chunk and the dependency.
- [x] A chain build that fails does not affect any later independent chain build of the same load: a lazy import that follows a failed one re-attempts construction of every chunk the failed build abandoned, including chunks the two builds share.
- [x] Sibling static-import dependencies are fetched concurrently, and the number of chunk-source fetches in flight for one chain build never exceeds the runtime's fixed width no matter how deep or how wide the dependency graph is; the failure reported for a group of siblings is still the first in declaration order regardless of completion order.
- [x] A manifest declaring the same shared-dependency package name more than once fails the load with a diagnostic naming that package, before any shared-dependency source is fetched, whether or not the exposed module has a fetch list.
- [x] A declared shared-dependency name that survives the rewrite of a whole-package entry as a bare specifier fails the load with a diagnostic naming the chunk, the surviving specifier, and the microfrontend.
- [x] An undeclared, well-formed specifier that survives the rewrite of a whole-package entry is reported in a diagnostic naming the chunk, the specifier, and the microfrontend, and the load completes rather than failing.
- [ ] On the exposed module's load and on a lazy target's first use, for list items and own chunks alike, a declared shared-dependency name that survives the rewrite fails the load with an `MfeLoadError` naming the chunk, the specifier and the microfrontend, and a surviving undeclared bare specifier produces a console warning naming the same three.
- [x] The adoption notice emitted when a whole-package entry carries no content identity is emitted once per handler for each package `name@version` and manifest id pair, not per load, so distinct manifests declaring the same name and version each surface exactly one notice while repeated loads of the same manifest surface none after the first; the handler remembers the 64 most recently noticed pairs.
- [x] For an entry that declares stylesheets, the wrapped lifecycle's `mount` delivers the shadow root, the child bridge and `mountContext` to the microfrontend's `mount` unchanged and calls it within the same synchronous call, after the stylesheets are in the shadow root, so a registry the microfrontend constructs during its mount adopts the mounting bridge instead of coming up as a root
- [x] For an entry that declares stylesheets, the wrapped lifecycle's `unmount` leaves the stylesheets in the shadow root while the microfrontend's own `unmount` is pending and removes them once it settles, whether it resolves or rejects
- [ ] An entry loads when the manifest it references is registered with the registry the handler was registered into, without that manifest ever being cached by an earlier load
- [ ] An entry whose referenced manifest no source resolves fails the load with a diagnostic naming that reference, both when the handler belongs to a registry and when it belongs to none
- [ ] An entry whose registry answers the manifest lookup with a value lacking a string `id`, an object `metaData` or an array `shared` fails the load with a diagnostic naming the reference, and that value is not cached, so a later load reads the registry again
- [ ] A realm entry `{ v: 1, cache }` whose `cache` exposes `get`, `set` and `delete` is adopted whether or not it has `getDiagnostics`; a load served by an adopted cache without it completes and its diagnostic states that the figures are unavailable; an entry with another `v`, or a `cache` lacking one of the three operations, is left untouched and the copy serves its loads from its local fallback cache
