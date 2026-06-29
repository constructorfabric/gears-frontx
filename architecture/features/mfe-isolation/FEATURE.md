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
  - [Trust-Kernel Guarded Import](#trust-kernel-guarded-import)
- [4. States (CDSL)](#4-states-cdsl)
  - [Isolated Module Lifecycle](#isolated-module-lifecycle)
  - [Per-Load Blob State](#per-load-blob-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Audited Trust Kernel — Blob Core](#audited-trust-kernel--blob-core)
  - [Instance-Keyed Load Cache](#instance-keyed-load-cache)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-mfe-isolation`

## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-mfe-isolation`

### 1.1 Overview

Isolates each loaded microfrontend in its own module graph behind an audited trust kernel — concentrating all dynamic-code primitives in one safety-annotated, contract-enforced file with a no-mutable-state invariant, retaining backing references for the page lifetime to support post-resolution evaluation.

### 1.2 Purpose

A registered microfrontend must evaluate as its own module instance so distinct occupants cannot couple through a shared module record. At the same time, the dynamic-code primitives isolation requires (dynamic import of inline content, construction of specifier matchers) must be confined to one small, audited, lint-enforced location so the arbitrary-code-admission surface stays provably bounded. This feature defines how that isolation is achieved and how the trust kernel is structured and enforced.

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-nfr-security`

**Principles**: `cpt-frontx-principle-default-deny-admission`

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Registers and loads a microfrontend into the running application; the isolation mechanism is transparent to this actor but guarantees their MFE evaluates as its own isolated instance |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADR**: `cpt-frontx-adr-blob-url-mfe-isolation`
- **Component**: `cpt-frontx-component-mfe-runtime` (shared with F4, F5, F6, F7)
- **Dependencies**: `cpt-frontx-feature-mfe-registry` (F4), `cpt-frontx-feature-mfe-loading` (F5)

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Isolated MFE Load

- [x] `p1` - **ID**: `cpt-frontx-flow-mfe-isolation-load`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer's MFE code is loaded and evaluated as a fresh isolated module instance keyed by the extension instance ID, then mounted into its target domain
- Two extensions sharing the same entry definition produce distinct isolated evaluations with no shared module state

**Error Scenarios**:
- The expose chunk source cannot be fetched — load fails and the cache entry is evicted for retry
- The import primitive receives a non-inline-content URL — guard rejects it with a type error before any dynamic import executes

**Steps**:
1. [x] - `p1` - Actor registers the microfrontend entry with the registry - `inst-register`
2. [x] - `p1` - Actor triggers the load action for the microfrontend - `inst-trigger-load`
3. [x] - `p1` - System checks the instance-keyed load cache for an existing promise keyed by the extension instance ID - `inst-check-cache`
4. [x] - `p1` - **IF** a cached load promise exists for this instance ID - `inst-if-cached`
   1. [x] - `p1` - **RETURN** the cached lifecycle (same blob URLs, same module instance, same lifecycle reference) - `inst-return-cached`
5. [x] - `p1` - **ELSE** - `inst-else-new-load`
   1. [x] - `p1` - System resolves the MFE manifest from the entry's manifest reference - `inst-resolve-manifest`
   2. [x] - `p1` - System builds shared-dependency blob URLs in dependency order (leaves first) via the build-shared-dep-blobs algorithm - `inst-build-shared-blobs`
   3. [x] - `p1` - System builds the blob URL chain for the expose chunk and its full static-dependency graph via the blob-url-chain algorithm - `inst-build-expose-chain`
   4. [x] - `p1` - System imports the expose blob URL through the trust-kernel guarded import primitive - `inst-import-expose`
   5. [x] - `p1` - System validates that the imported module implements the lifecycle contract (mount and unmount functions) - `inst-validate-lifecycle`
   6. [x] - `p1` - **IF** lifecycle contract not satisfied - `inst-if-bad-lifecycle`
      1. [x] - `p1` - System evicts the cache entry and raises an MFE load error - `inst-evict-raise`
   7. [x] - `p1` - System wraps the lifecycle with stylesheet injection logic and records the load promise in the instance-keyed cache - `inst-cache-promise`
6. [x] - `p1` - Actor mounts the returned lifecycle into the target domain container - `inst-actor-mount`
7. [x] - `p1` - **RETURN** the mounted lifecycle instance - `inst-return-lifecycle`

## 3. Processes / Business Logic (CDSL)

Internal system functions that implement the isolation mechanism.

### Blob URL Chain Construction

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-blob-url-chain`

**Input**: Expose chunk filename, per-load state (base URL, entry ID, shared-dep blob URL map, in-flight map, blob URL map)

**Output**: Per-load blob URL map updated with the expose chunk and all transitive static-dependency blob URLs

**Steps**:
1. [x] - `p1` - Check whether the chunk filename is already present in the per-load blob URL map - `inst-check-map`
2. [x] - `p1` - **IF** chunk already mapped - `inst-if-mapped`
   1. [x] - `p1` - **RETURN** immediately (already computed for this load) - `inst-return-mapped`
3. [x] - `p1` - Check whether a construction promise for this filename is already in-flight in the per-load in-flight map - `inst-check-inflight`
4. [x] - `p1` - **IF** an in-flight promise exists - `inst-if-inflight`
   1. [x] - `p1` - **RETURN** the existing in-flight promise (concurrent callers share one construction) - `inst-return-inflight`
5. [x] - `p1` - Fetch the chunk source text from the absolute chunk URL using the LRU source-text cache for URL-level deduplication - `inst-fetch-source`
6. [x] - `p1` - Parse all relative static import filenames from the chunk source - `inst-parse-static-imports`
7. [x] - `p1` - **FOR EACH** dependency filename in the parsed static imports - `inst-for-each-dep`
   1. [x] - `p1` - Recursively build the blob URL chain for the dependency - `inst-recurse-dep`
8. [x] - `p1` - Rewrite all relative static import specifiers to their resolved blob URLs from the per-load blob URL map - `inst-rewrite-static`
9. [x] - `p1` - Rewrite all bare shared-dependency specifiers to their pre-built shared-dep blob URLs - `inst-rewrite-shared`
10. [x] - `p1` - Replace `import.meta.url` occurrences with the chunk's real HTTP base URL to preserve relative URL resolution under blob evaluation - `inst-rewrite-meta-url`
11. [x] - `p1` - **IF** the rewritten source references the lazy-import ABI function - `inst-if-lazy-ref`
    1. [x] - `p1` - Mint or reuse the per-load lazy-loader stub blob URL and inject its import at the top of the source - `inst-inject-lazy-stub`
12. [x] - `p1` - Wrap the fully rewritten source in a blob, create a blob URL, and record it in the per-load blob URL map - `inst-create-blob`
13. [x] - `p1` - **RETURN** with the blob URL present in the per-load map - `inst-return-complete`

### Shared-Dependency Blob URL Construction

- [x] `p1` - **ID**: `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls`

**Input**: MFE manifest containing the shared-dependency list (name, version, chunk path) in dependency order (leaves first)

**Output**: Map of shared-dependency package name to blob URL, covering all shared dependencies declared in the manifest

**Steps**:
1. [x] - `p1` - **FOR EACH** shared dependency declared in the manifest, in declaration order - `inst-for-each-dep`
   1. [x] - `p1` - Compute the deduplication cache key as `name@version` - `inst-compute-key`
   2. [x] - `p1` - **IF** the cross-MFE shared-dep text cache already holds a promise for this key - `inst-if-cache-hit`
      1. [x] - `p1` - Retrieve the cached source text promise - `inst-retrieve-cached`
   3. [x] - `p1` - **ELSE** - `inst-else-fetch`
      1. [x] - `p1` - Derive the absolute chunk URL from the manifest's `publicPath` and the dependency's `chunkPath` - `inst-derive-url`
      2. [x] - `p1` - Fetch the source text and store the promise in the cross-MFE cache; on rejection, evict the entry to permit retry - `inst-fetch-and-cache`
2. [x] - `p1` - Resolve the collected sources in dependency order, processing each dependency only after all dependencies it imports have been resolved; fall back to partial rewrites on circular dependencies - `inst-resolve-order`
3. [x] - `p1` - **FOR EACH** dependency in resolved order - `inst-for-each-resolved`
   1. [x] - `p1` - Rewrite bare shared-dep specifiers in the source to the already-resolved blob URLs - `inst-rewrite-specifiers`
   2. [x] - `p1` - Wrap the rewritten source in a blob, create a fresh blob URL, and add it to the shared-dep blob URL map - `inst-create-dep-blob`
4. [x] - `p1` - **RETURN** the complete shared-dep blob URL map - `inst-return-map`

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

- [x] `p2` - **ID**: `cpt-frontx-state-mfe-isolation-module-lifecycle`

**States**: UNLOADED, ISOLATED, ACTIVE, DISPOSED

**Initial State**: UNLOADED

**Transitions**:
1. [x] - `p1` - **FROM** UNLOADED **TO** ISOLATED **WHEN** the blob URL chain is successfully built and the expose module is imported through the trust kernel, with the load promise recorded in the instance-keyed cache - `inst-to-isolated`
2. [x] - `p1` - **FROM** ISOLATED **TO** ACTIVE **WHEN** the lifecycle's mount function is called and the MFE is rendered into the target domain container - `inst-to-active`
3. [x] - `p1` - **FROM** ACTIVE **TO** DISPOSED **WHEN** the lifecycle's unmount function is called and the MFE is removed from the domain container - `inst-to-disposed`
4. [x] - `p1` - **FROM** UNLOADED **TO** UNLOADED **WHEN** a load attempt fails; the cache entry is evicted so a subsequent load attempt starts fresh - `inst-load-failed-retry`

### Per-Load Blob State

- [x] `p2` - **ID**: `cpt-frontx-state-mfe-isolation-load-blob-state`

**States**: INITIALIZING, BUILDING, COMPLETE

**Initial State**: INITIALIZING

**Transitions**:
1. [x] - `p1` - **FROM** INITIALIZING **TO** BUILDING **WHEN** the shared-dep blob URLs are constructed and the expose chunk construction begins - `inst-blob-building`
2. [x] - `p1` - **FROM** BUILDING **TO** COMPLETE **WHEN** all chunks in the dependency graph have blob URLs recorded in the per-load map - `inst-blob-complete`

## 5. Definitions of Done

### Audited Trust Kernel — Blob Core

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-blob-core`

The system **MUST** maintain a single audited trust-kernel file that is the sole site of dynamic import of inline content and dynamic construction of specifier matchers. Every exported function in this file **MUST** carry a safety rationale, the file **MUST** declare no mutable module-level state, it **MUST** import no dangerous host capabilities, and the dynamic-import function **MUST** guard its input to accept only scheme-prefixed inline-content URLs (`blob:` or `data:`). A custom lint rule **MUST** enforce that these dynamic-code primitives appear only in this file.

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`
- `cpt-frontx-algo-mfe-isolation-trust-kernel-import`

**Constraints**: none owned (F8 owns no DESIGN constraint per DECOMPOSITION 2.7)

**Addresses (NFR)**: `cpt-frontx-nfr-security`

**Touches**:
- Entities: `MfeEntry`

### Instance-Keyed Load Cache

- [x] `p1` - **ID**: `cpt-frontx-dod-mfe-isolation-handler-load-cache`

The system **MUST** key the load cache by the extension instance ID (not the entry definition ID) so that two extensions sharing the same entry definition produce distinct blob URL chains and distinct module evaluations. The cache **MUST** retain load promises for the page lifetime and **MUST NOT** revoke blob URLs after the import resolves, because a module may continue evaluating after its import promise settles. Cache entries **MUST** be evicted only on load failure, to permit retry.

**Implements**:
- `cpt-frontx-flow-mfe-isolation-load`
- `cpt-frontx-algo-mfe-isolation-blob-url-chain`

**Constraints**: none owned (F8 owns no DESIGN constraint per DECOMPOSITION 2.7)

**Addresses (NFR)**: `cpt-frontx-nfr-security`

**Touches**:
- Entities: `MfeEntry`

## 6. Acceptance Criteria

- [ ] Each loaded microfrontend evaluates as its own isolated module instance; two extensions sharing the same entry definition receive distinct instance-keyed cache entries and distinct module evaluations
- [ ] All dynamic-code primitives (dynamic import of inline content, dynamic construction of specifier matchers) are confined to the single audited trust-kernel file; a lint rule enforces this boundary
- [ ] The trust-kernel import primitive rejects any input URL that does not begin with `blob:` or `data:` before any import executes
- [ ] All blob URLs in the instance-keyed load cache are retained for the page lifetime and are never revoked after the import resolves
- [ ] Shared-dependency source text is deduplicated across MFE loads using a cross-MFE LRU cache keyed by `name@version`; cache entries for failed fetches are evicted to permit retry
- [ ] On load failure, the cache entry for the failed extension instance is evicted so a subsequent call can attempt a fresh load
