---
version: 8
description: Specifies the ecosystem-owned shared-dependency format contract — consumer-independent content-identified chunks, a manifest-held unit table and one fetch list per exposed module and per lazy target, typed by the types exported from `./unit-format`, the naming of shared files, the value formats and the obligations any producer's output satisfies — the admission discipline that holds every fetched shared text in the realm cache under the content identity declared for it, and the `./unit-loader` surface of exactly the shared-unit fetcher and the location-to-URL resolver.
---

# Feature: Shared-Dependency Unit Format Contract

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Host Admission Through the Shared-Unit Fetcher](#host-admission-through-the-shared-unit-fetcher)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Fetch-List Contract](#fetch-list-contract)
  - [Shared-Text Admission Under the Declared Identity](#shared-text-admission-under-the-declared-identity)
  - [Sanctioned Loader Surface](#sanctioned-loader-surface)
- [4. States (CDSL)](#4-states-cdsl)
  - [None](#none)
- [5. Definitions of Done](#5-definitions-of-done)
  - [One Flat Fetch List per Exposed Module and Lazy Target](#one-flat-fetch-list-per-exposed-module-and-lazy-target)
  - [Shared Text Admitted Under Its Declared Identity](#shared-text-admitted-under-its-declared-identity)
  - [Loader Surface Limited to the Shared-Unit Fetcher and the Resolver](#loader-surface-limited-to-the-shared-unit-fetcher-and-the-resolver)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p1` - **ID**: `cpt-frontx-featstatus-unit-format-contract`

## 1. Feature Context

- [x] `p2` - `cpt-frontx-feature-unit-format-contract`

### 1.1 Overview

Defines the format a producing build emits and the runtime reads for shared-dependency reuse: consumer-independent chunks — a package's chunks do not depend on the consumer, and their bytes are fixed by `package@version` within one producer version — and, held in the registered manifest, a unit table and one precomputed flat fetch list per exposed module and per lazy target. A unit carries the chunk's location, its content identity, the specifiers it answers and every import edge it holds; a list references units by content identity, carries `ownChunks`, the locations of the microfrontend's own chunks the module or target reaches statically, and names, by key, the lazy-target and pattern-import lists it reaches, each held once in the manifest's `lists`. The unit table and the lists are fields of the closed manifest contract, typed by the types exported from `./unit-format`. Every fetched unit is admitted to the realm cache, as fetched, under the content identity declared for it, by one admission discipline, and `./unit-loader` exposes exactly the shared-unit fetcher and the location-to-URL resolver, so code outside the package admits text to the realm cache only under that discipline. This feature is the single owner of the realm cache key forms and of the admission discipline; the features that load microfrontends cite them by ID. Byte identity is guaranteed among builds of the same producer version, and the runtime trusts declared content identities. While the project is at major version 0, a change to the format, additive or not, takes no version bump, and the runtime accepts a new field before producers emit it (`cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-mfe-asset-discovery`).

### 1.2 Purpose

Content-keyed reuse across independently built and deployed microfrontends works only when every consumer receives the same bytes for a package at a version and when each producer declares the content identity of the file it publishes, so the runtime shares text under the identity its declaration names (`cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-mfe-asset-discovery`). That requires the emitted format — what a chunk is, what a fetch list states, how files are named and identified, how lazy and pattern imports are carried — to be owned by the ecosystem that owns the reader, not left to whichever producing build emitted it. This feature fixes that contract, the admission discipline and the subpath surfaces that publish them; how a load drives a fetch list through its round and reads the manifest's locating fields belongs to `cpt-frontx-feature-mfe-loading`, and how a load builds isolated module instances over the admitted text belongs to `cpt-frontx-feature-mfe-isolation`.

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-fr-mfe-load-failure-handling`, `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-resource-efficiency`, `cpt-frontx-nfr-security`

**Principles**: none owned by this feature

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Builds a microfrontend with a producer whose output satisfies the contract, and loads shared text outside a microfrontend load through the `./unit-loader` subpath |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Decomposition**: `cpt-frontx-feature-unit-format-contract` (DECOMPOSITION §2.8)
- **ADRs**: `cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-mfe-asset-discovery`, `cpt-frontx-adr-shared-dep-cache-reach`, `cpt-frontx-adr-lazy-import-resolution`
- **Component**: `cpt-frontx-component-mfe-runtime`
- **Dependencies**: this feature consumes no feature contract; the steps `cpt-frontx-algo-mfe-loading-attempt-timeout` (`inst-lto-release-generation-identity`) and `cpt-frontx-flow-mfe-isolation-load` (`inst-emit-load-diagnostic`) are cited as pointers, and `cpt-frontx-feature-mfe-loading` and `cpt-frontx-feature-mfe-isolation` consume this feature's contract

**Checklist applicability**:
- PERF — Addressed in §5 (One Flat Fetch List per Exposed Module and Lazy Target): precomputed lists let a load fetch only the shared units and `ownChunks` the module reaches with no runtime graph discovery; the round bounds are those of `cpt-frontx-dod-mfe-loading-one-round-load` (`cpt-frontx-nfr-runtime-performance`).
- SEC — Addressed in §3 (Shared-Text Admission Under the Declared Identity) and §5 (Shared Text Admitted Under Its Declared Identity): every fetched unit is admitted to the realm cache only under the key its declared content identity fixes, and code outside the package admits text only through the shared-unit fetcher; the declared identity is a sharing key, not a grant of trust in code.
- REL — Addressed in §3 (Shared-Text Admission Under the Declared Identity): a load that joined an in-flight fetch which rejects retries once from its own URL, a rejected fetch is evicted under an identity check, and a timed-out attempt releases every realm entry it waited on.
- DATA — Addressed in §3 (Fetch-List Contract) and §5 (One Flat Fetch List per Exposed Module and Lazy Target): the unit table and fetch-list format, the value formats and the format evolution rule are fixed here; nothing durable is stored, and admitted text is held in memory only.
- INT — Addressed in §3 (Fetch-List Contract; Sanctioned Loader Surface) and §5 (One Flat Fetch List per Exposed Module and Lazy Target; Loader Surface Limited to the Shared-Unit Fetcher and the Resolver): the unit and fetch-list types in `./unit-format`, the naming, identity and value-format rules, the manifest fields that carry the lists and the `./unit-loader` members are the boundary between producers, hosts and the runtime.
- OPS — Not applicable because this feature is library code with no deployed service; opaque-import reporting is an obligation on a producer's output.
- MAINT — Not applicable because this feature sets no maintainability target of its own; while the project is at major version 0 a format change takes no version bump (§1.1).
- TEST — Addressed in §6: the acceptance criteria are what the runtime package's tests check; the contract states what a producer's output must satisfy, and conformance of a given producer is that producer's concern.
- COMPL — Not applicable because this feature handles no regulated or personal data.
- UX — Not applicable because this feature renders no user interface.
- BIZ — Not applicable because this is an internal library feature; its requirements are cited by ID in §1.2.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Host Admission Through the Shared-Unit Fetcher

- [x] `p1` - **ID**: `cpt-frontx-flow-unit-format-contract-host-admission`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- A host outside a microfrontend load fetches a list item's text through `SharedUnitFetcher`; the text is admitted to the realm cache, as fetched, under the `chunk:` key the content identity the host supplies fixes, so a microfrontend load that needs the same item reuses it.
- A microfrontend load starts while the host's fetches are in flight: the load's list item whose key is in flight from the host's fetch joins that fetch rather than issuing its own, and a host that fills many items publishes every in-flight entry at once.

**Error Scenarios**:
- The fetch fails: the call rejects with an `MfeLoadError` carrying the fetcher's label and naming the file, and the rejected fetch is evicted from the realm cache, so a later call fetches the text again.

**Steps**:
1. [x] - `p1` - The host constructs `SharedUnitFetcher` with its fetch and a label, and resolves a location to an absolute URL with the location-to-URL resolver `SharedAssetUrlResolver` (`cpt-frontx-algo-unit-format-contract-loader-surface`) - `inst-host-construct`
2. [x] - `p1` - The host calls `fetch` with the URL and the content identity; the fetcher derives the `chunk:<contentHash>` key itself and runs `cpt-frontx-algo-unit-format-contract-shared-text-admission` against the realm cache - `inst-host-fetch`
3. [x] - `p1` - A microfrontend load whose list item's key is in flight from the host's fetch joins that fetch, as it joins any concurrent load's in-flight fetch, so the unit is fetched once - `inst-host-concurrent-join`
4. [x] - `p1` - **RETURN** the admitted text, or the rejection of the fetch - `inst-host-return`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. The first process below is the contract any producer's output satisfies and the runtime reads; the remaining ones are runtime behaviour over that contract.

### Fetch-List Contract

- [x] `p1` - **ID**: `cpt-frontx-algo-unit-format-contract-fetch-list-schema`

**Input**: The exposed modules and lazy targets of a microfrontend, the shared packages they reach and the own chunks they reach statically, as a producer's output declares them

**Output**: The format a producer's output satisfies and the runtime reads and validates: a unit table and one flat fetch list per exposed module and per lazy target — its units by content identity, its `ownChunks` and the keys of its lazy-target and pattern-import lists — plus the manifest-side facts

**Steps**:
1. [x] - `p1` - Units and lists, as the runtime reads them: each shared chunk is held once in the unit table (`units`), each unit carrying `location` (a path relative to the shared base or an absolute http(s) URL), `contentHash` (the SHA-256 digest of the file's text as 64 lowercase hexadecimal characters), `answers` (the bare specifiers it answers — package names and subpaths alike) and `imports` (every edge the runtime needs for dependency-order minting: a bare specifier, or an intra-package relative edge recorded as `{ unit: <contentHash> }` naming the unit that supplies it). Each exposed module's and each lazy target's fetch list carries `units`, the content identities of every shared chunk the module or target reaches, each held by the unit table and precomputed so the runtime requests every unit missing from the realm cache in one round; the runtime refuses a load whose list names a content identity the table does not hold. Every specifier a unit imports is answered by exactly one unit on the combined lists of the module or target and its parent chain, and the units of a load form no import cycle. Recorded edges determine minting order; specifier rewriting resolves the specifiers in the text against the list - `inst-emit-items`
2. [x] - `p1` - Own chunks, as the runtime reads them: each fetch list carries the field `ownChunks`, a string array listing every one of the microfrontend's own chunks the exposed module or lazy target reaches statically — each entry a path relative to `metaData.publicPath` or an absolute http(s) URL, with no content identity, because own chunks are not shared; the runtime refuses a load whose list holds an entry that is not a non-empty string - `inst-emit-own-chunks`
3. [x] - `p1` - Lazy targets and pattern lists, as the runtime reads them: every lazy target — an own lazy chunk, or the target of a literal dynamic import inside a shared chunk — is a fetch list of its own holding only what the target needs beyond its parent chain's lists, held once in `lists` under the target's chunk location relative to the base that chunk resolves against (`metaData.publicPath` for an own chunk, the shared base for a shared unit) and named by that key in the `lazy` array of every list that reaches it; every file matching a statically bounded pattern import inside a shared unit is a list of its own under the same base rule, named by that key in the `patterns` array of every list that reaches it, and the runtime refuses a load whose `lazy` or `patterns` array holds a key that is not a non-empty string - `inst-emit-lazy-lists`
4. [x] - `p1` - Validation: the unit table and the lists are validated as part of the manifest, under the closed manifest contract, when the manifest is registered: a unit or list that lacks a required field or carries any other property is rejected; the correctness of the declared identities rests on the producer's conformance - `inst-validate-manifest-units-lists`
5. [x] - `p1` - Value formats are part of the contract: a package `name` contains no colon, a `version` contains neither `:` nor `@`, and every `contentHash` is 64 lowercase hexadecimal characters; for the manifest's fields they are enforced by the type system's manifest and MFE entry types, and the runtime does not re-check them - `inst-value-formats`
6. [x] - `p1` - Location identity: unit locations and `ownChunks` entries are compared by their resolved URL, never by their spelling, so two spellings that resolve to one URL name one file - `inst-location-identity`
7. [x] - `p1` - **RETURN** the manifest-side facts the runtime reads: the unit table `units`, a top-level `lists` record keyed by exposed module, and optionally `metaData.sharedBase` as the base location for shared files; no `shared` entry is required of a producer - `inst-return-contract-output`

**Producer output obligations**: Any producer's output satisfies the following; the runtime depends on no specific producer and trusts what the output declares. A producer emits units and lists only, with no `shared` entry and no whole-package file. A shared package's chunks are independent of the consumer — the chunks of `package@version` do not depend on which consumers import it or which subset they use, so two consumers using different subsets get identical chunks — and their bytes are fixed by `package@version` within one producer version. Every bare import in every chunk stays external and nothing is inlined across a package boundary, so a chunk's bytes carry only text derived from the package. Every chunk is content-addressed, with the content hash in the file's location, or sits at an unhashed alias location — an alias file of a lazy-chunk cycle spelling — whose unit declares the same `contentHash` as the content-addressed file it aliases, so the alias resolves to the same text under the same content identity; every content identity a list names is held by the unit table. Lists are complete: every shared chunk reachable from an exposed module is on its fetch list, every own chunk it reaches statically is in `ownChunks` (an own chunk missing from `ownChunks` is a producer defect), and every import edge is answered, including through re-export chains, namespace imports, `as default` and side-effectful barrels; units are acyclic; lazy and pattern lists are delta lists. Every literal and pattern dynamic import in the microfrontend's own code is emitted as the `__frontx_lazy` call, with a fetch list per literal lazy target and per pattern-matching file inside a shared unit; for the microfrontend's own code no pattern list is required, and a call that matches no list takes the no-list rule (`cpt-frontx-adr-lazy-import-resolution`). A fully opaque `import(expr)` is reported with its file and line in the producer's own output, outside the manifest; an opaque call stays native, outside the load's isolated graph, and the project that uses a library containing one carries that risk.

### Shared-Text Admission Under the Declared Identity

- [x] `p1` - **ID**: `cpt-frontx-algo-unit-format-contract-shared-text-admission`

**Input**: A shared file to be fetched — a list unit or a whole-package entry — with its resolved URL and the content identity declared for it (by the unit table for each unit, and by `shared[].contentHash` for a whole-package entry), and a fetch function

**Output**: The fetched text, held in the realm cache under the key its declared data gives it, or a load failure naming the file

**Steps**:
1. [x] - `p1` - Derive the realm cache key from the declared data: `chunk:<contentHash>` for a list unit, `name@version@<contentHash>` for a whole-package entry that declares one, and `name@version@<absolute URL>` for a whole-package entry that declares none. Under the value formats (`inst-value-formats`) no two key forms collide; the keys are an internal protocol between copies of the package, and no public operation takes or exposes one - `inst-derive-key`
2. [x] - `p1` - Answer from the realm cache when it holds a resident or in-flight entry under that key, with no new request - `inst-reuse-resident`
   1. [x] - `p1` - **IF** the joined in-flight fetch rejects: retry once from this load's own URL — joining a replacement another load has published meanwhile, otherwise issuing its own fetch — and never more, unless the load has already failed, in which case it retries nothing - `inst-join-retry-once`
3. [x] - `p1` - On a miss, request the text through the supplied fetch with the resolved URL and publish the in-flight promise under the key before it settles, so a concurrent request for the same key joins it; a load that has already failed publishes no further in-flight entry; the fetch bypasses the handler's URL-keyed source-text cache - `inst-fetch-on-miss`
4. [x] - `p1` - When the file declares a content identity, **RETURN** the text as fetched, admitted to the realm cache under the key that declared identity fixes — the declared identity is the sharing key (`cpt-frontx-adr-mfe-asset-discovery`, `cpt-frontx-adr-shared-dep-cache-reach`) — and never to the handler's URL-keyed source-text cache; a load that has already failed admits no text after the failure, text admitted before the failure stays in the cache, and the in-flight entries the failed load published are released under the identity check of `inst-evict-on-reject` - `inst-admit-as-fetched`
5. [x] - `p1` - **IF** the file is a whole-package entry that declares no `contentHash` - `inst-if-no-identity`
   1. [x] - `p1` - **RETURN** the text as fetched, admitted to the realm cache under its `name@version@<absolute URL>` key and reused only by loads that resolve the identical absolute location; the notice naming the dependency and the manifest is `cpt-frontx-algo-mfe-isolation-build-shared-dep-blob-urls` (`inst-emit-adoption-notice`) - `inst-admit-whole-package-by-location`
6. [x] - `p1` - After the fetch settles, evict a rejected fetch from the realm cache only while the cache still holds that very promise under the key, so a replacement another load or copy published under the same key is never removed and a later call retries; a timed-out attempt releases every realm entry it waited on — `chunk:` and whole-package `name@version@…` entries — under the same identity check (`cpt-frontx-algo-mfe-loading-attempt-timeout`, `inst-lto-release-generation-identity`) - `inst-evict-on-reject`

### Sanctioned Loader Surface

- [x] `p1` - **ID**: `cpt-frontx-algo-unit-format-contract-loader-surface`

**Input**: A consumer outside the package importing the package's `./unit-loader` subpath

**Output**: Exactly the shared-unit fetcher and the location-to-URL resolver, converging on the realm cache handler loads use

**Steps**:
1. [x] - `p1` - Export exactly two classes and nothing else, no type among them. `SharedUnitFetcher` is constructed with a caller-supplied fetch, which turns a URL into a promise of its text, and a label its errors carry; its `fetch` member takes a URL and a content identity, fetches that unit's text and admits it through `cpt-frontx-algo-unit-format-contract-shared-text-admission` under the `chunk:<contentHash>` key it derives itself, using the realm cache — it takes no cache, no key and no attempt record. `SharedAssetUrlResolver` has one static `resolve` member that takes a location, a base and a label, applies the location rules for the kinds that must stay inside their base (`cpt-frontx-algo-mfe-loading-manifest-discovery`, `inst-md-resolve-location`), and returns the absolute URL or fails with an `MfeLoadError` carrying the label. The contract types come from `./unit-format` - `inst-loader-surface-classes`
2. [x] - `p1` - Reach no registry, orchestrating handler (`MfeHandlerMF`) or mediator module from the subpath's module graph, and add nothing to the root barrel - `inst-loader-surface-no-orchestration`
3. [x] - `p1` - Reach the realm cache through the package-internal accessor: adopt a realm rendezvous slot entry whose protocol version and shape this copy recognizes — **RETURN** the published realm cache, so every compatible copy, handler-driven or host-driven, dedupes admitted text by content identity (`cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous`) - `inst-loader-slot-adopt`
4. [x] - `p1` - On a malformed slot entry or one carrying a protocol version this copy does not recognize, **RETURN** a bounded cache local to this copy, logging a diagnostic and leaving the foreign entry untouched — a shape mismatch means do-not-share, never a thrown error (`cpt-frontx-adr-shared-dep-cache-reach`) - `inst-loader-slot-versioned`

## 4. States (CDSL)

### None

This FEATURE defines no state machines. The unit format contract is a static contract; its runtime behaviour — shared-text admission and the loader surface — is algorithmic, without state transitions.

## 5. Definitions of Done

### One Flat Fetch List per Exposed Module and Lazy Target

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-fetch-list-schema`

The ecosystem **MUST** own and publish the unit format contract: consumer-independent chunks (bytes fixed by `package@version` within one producer version, whichever consumer imports the package); the externalization rule (every bare import external, no cross-package inlining); the content-addressed naming of chunks with the content hash in the file's location, or an unhashed alias location whose unit declares the same content hash; the unit table `units`, each unit with `location`, `contentHash`, `answers` and `imports`; and the fetch-list fields — `units`, the content identities of the units the module or target needs, `ownChunks`, the string array of the locations of the own chunks the module or target reaches statically — each a path relative to `metaData.publicPath` or an absolute http(s) URL, with no content identity — and the `lazy` and `patterns` arrays of the keys of the lists a list reaches (`patterns` for shared units; the microfrontend's own code requires only the `__frontx_lazy` call for every literal and pattern import) — each such list held once in `lists` under its target's chunk location relative to the base that chunk resolves against (`metaData.publicPath` for an own chunk, the shared base for a shared unit). One flat list **MUST** exist per exposed module and per lazy target, and a lazy or pattern list **MUST** hold only what its target needs beyond its parent chain's lists. The `./unit-format` subpath **MUST** export the unit and fetch-list types and nothing else — `SharedDepUnit`, `SharedDepImportEdge` and `SharedDepFetchList` — as the single typing source for the unit table and the lists. The manifest **MUST** carry the unit table in `units` and each exposed module's list in `lists` and **MUST NOT** be required to carry `shared` entries or whole-package files from a producer, and the closed manifest contract and the type system **MUST** validate them with the manifest at registration; the runtime **MUST NOT** re-validate their field shapes or value formats, and refuses only a load whose list names a unit the unit table does not hold or holds an own-chunk location or list key that is not a non-empty string. Unit locations and `ownChunks` entries **MUST** be compared by their resolved URL, not by spelling. The value formats — a `name` without a colon, a `version` without `:` or `@`, a `contentHash` of 64 lowercase hexadecimal characters, in the unit table and in every list — **MUST** be part of the contract, enforced by the type system.

**Implements**:
- `cpt-frontx-algo-unit-format-contract-fetch-list-schema`

**Covers (PRD)**:
- `cpt-frontx-nfr-resource-efficiency`
- `cpt-frontx-fr-mfe-runtime-registration`

**Covers (DESIGN)**:
- `cpt-frontx-adr-shared-dep-reuse`
- `cpt-frontx-adr-mfe-asset-discovery`
- `cpt-frontx-adr-lazy-import-resolution`

**Constraints**: none owned

**Touches**:
- Entities: `MfManifest`
- Modules: `src/unit-format/index.ts`

### Shared Text Admitted Under Its Declared Identity

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-shared-text-admission`

The runtime **MUST** admit every fetched unit and every whole-package entry that declares a `contentHash` to the realm cache only, as fetched, under the key its declared data gives it (`chunk:` or `name@version@<contentHash>`), so the declared content identity is the key under which the text is shared. A load that joined another load's in-flight fetch which then rejects **MUST** retry once from its own URL and never more, unless the load has already failed; a load that has already failed **MUST** admit no text after the failure, text admitted before the failure stays, and the in-flight entries it published **MUST** be released under the identity check; and a rejected fetch **MUST** be evicted only while the cache still holds that very promise; a timed-out attempt **MUST** release every realm entry it waited on — `chunk:` and whole-package `name@version@…` entries — under the same identity check. A whole-package entry that declares no `contentHash` **MUST** be admitted under its `name@version@<absolute URL>` key and reused only by loads resolving the identical absolute location. A public operation **MUST NOT** take or expose a cache key.

**Implements**:
- `cpt-frontx-algo-unit-format-contract-shared-text-admission`

**Covers (PRD)**:
- `cpt-frontx-nfr-security`
- `cpt-frontx-fr-mfe-load-failure-handling`

**Covers (DESIGN)**:
- `cpt-frontx-adr-shared-dep-cache-reach`
- `cpt-frontx-adr-mfe-asset-discovery`

**Constraints**: `cpt-frontx-constraint-mfes-realm-shared-dep-cache`

**Touches**:
- Entities: `MfManifest`

### Loader Surface Limited to the Shared-Unit Fetcher and the Resolver

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-loader-surface`

The package **MUST** publish a `./unit-loader` subpath exporting exactly `SharedUnitFetcher` and `SharedAssetUrlResolver` and no type. `SharedUnitFetcher` **MUST** take only a fetch function and a label its errors carry, fetch and admit text under the same discipline a microfrontend load uses, use the realm cache, and derive the cache key itself from the content identity the caller declares for the text, so no cache, key or attempt record is a public parameter. It **MUST** admit units only, under the `chunk:` key. `SharedAssetUrlResolver` **MUST** apply the location rules of `cpt-frontx-adr-mfe-asset-discovery` for the location kinds that must stay inside their base. The subpath's module graph **MUST NOT** reach the registry, the orchestrating handler or the mediator, and the root barrel **MUST NOT** gain anything from it. Through the package-internal accessor the shared-unit fetcher **MUST** reach the versioned realm rendezvous: a slot entry whose protocol version or shape the copy does not recognize **MUST** be left untouched and never shared — the copy proceeds on its own bounded fallback cache and no error is thrown — while a recognized entry **MUST** be adopted so compatible copies dedupe admitted text by content identity.

**Implements**:
- `cpt-frontx-flow-unit-format-contract-host-admission`
- `cpt-frontx-algo-unit-format-contract-loader-surface`

**Covers (DESIGN)**:
- `cpt-frontx-adr-shared-dep-reuse`
- `cpt-frontx-adr-shared-dep-cache-reach`

**Constraints**: `cpt-frontx-constraint-mfes-realm-shared-dep-cache`

**Touches**:
- Modules: `src/unit-loader/index.ts`, `SharedUnitFetcher`, `SharedAssetUrlResolver`

## 6. Acceptance Criteria

- [x] A manifest whose unit or list carries a property outside the contract, lacks a required field or holds a value outside its format is rejected by the type system at registration.
- [x] Fetched units are admitted to the realm cache, as fetched, under their `chunk:` keys, and a whole-package entry that declares a `contentHash` under its `name@version@<contentHash>` key; none of them is held in the handler's source-text cache; a whole-package entry without a `contentHash` is held under its `name@version@<absolute URL>` key, and a URL-keyed entry never collides with a hash-keyed one.
- [x] A load that joined another load's in-flight fetch that then rejects issues one retry from its own URL unless the load has already failed, and a rejected fetch is evicted only while the cache still holds that promise.
- [x] A load that has already failed admits no text after the failure, text admitted before the failure stays in the realm cache, and the in-flight entries it published are released under the identity check.
- [x] A timed-out attempt releases every realm entry it waited on — `chunk:` and whole-package `name@version@…` entries — under the identity check, so a hung fetch on an expired attempt is fetched again by the retry.
- [x] A host that calls `SharedUnitFetcher.fetch` with a URL and a content identity receives the fetched text, admitted to the realm cache under the `chunk:` key that content identity fixes.
- [x] A microfrontend load that starts while a host's `SharedUnitFetcher` fetches are in flight joins the in-flight entry for each list item whose `chunk:` key the host has published and issues no second fetch for it.
- [x] The `./unit-format` subpath exports exactly the types `SharedDepUnit`, `SharedDepImportEdge` and `SharedDepFetchList`, and nothing else.
- [x] The `./unit-loader` subpath exports exactly `SharedUnitFetcher` and `SharedAssetUrlResolver`; the shared-unit fetcher takes only a fetch function and a label, admits only units it fetched, under the `chunk:` key derived from the content identity; the subpath's module graph reaches no registry, orchestrating handler or mediator module, and the root barrel gains nothing from either subpath.
- [x] A realm-slot entry whose protocol version or shape a copy does not recognize is left untouched and never shared — the copy proceeds on its own bounded fallback cache with no thrown error — while a recognized entry is adopted so compatible copies dedupe admitted text by content identity.
- [x] Unit locations and `ownChunks` entries are compared by their resolved URL, not by spelling: two spellings that resolve to one URL name one file.
