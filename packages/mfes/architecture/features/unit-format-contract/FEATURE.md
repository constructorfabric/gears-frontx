---
version: 5
description: Specifies the ecosystem-owned unit format contract for shared-dependency output — type-system-neutral JSON fetch-list documents typed by TypeScript interfaces exported from `./unit-format`, content-identified chunks emitted under consumer-independent entry-point chunking, the manifest and boot-data fields that carry the lists — the integrity verification every fetched file passes before cache admission, the byte-agreement measurement across builds, and the `UnitFormatConformance` suite every producing build must pass.
---

# Feature: Shared-Dependency Unit Format Contract

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Producer Conformance Verification](#producer-conformance-verification)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Fetch-List Contract](#fetch-list-contract)
  - [Fetched-File Integrity Verification](#fetched-file-integrity-verification)
  - [Byte-Agreement Measurement](#byte-agreement-measurement)
  - [Sanctioned Loader Surface](#sanctioned-loader-surface)
- [4. States (CDSL)](#4-states-cdsl)
  - [None](#none)
- [5. Definitions of Done](#5-definitions-of-done)
  - [One Flat Fetch List Per Entry](#one-flat-fetch-list-per-entry)
  - [Integrity Verification Before Cache Admission](#integrity-verification-before-cache-admission)
  - [Byte-Agreement Measurement — Runtime and Cross-Build](#byte-agreement-measurement--runtime-and-cross-build)
  - [Producer Conformance Suite Shipped With the Contract](#producer-conformance-suite-shipped-with-the-contract)
  - [Loader Surface Limited to Fetch, Verify, Cache and Mint](#loader-surface-limited-to-fetch-verify-cache-and-mint)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-unit-format-contract`

## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-unit-format-contract`

### 1.1 Overview

Defines the format a producing build emits and the runtime reads for shared-dependency reuse: consumer-independent chunks — one chunk per package entry point with overlapping internals in shared internal chunks, each package's chunk boundaries and bytes computed from that package's own complete entry set — and the per-entry flat fetch list that is the loading contract. Each build emits one precomputed fetch list per entry: each expose, each lazy target, the shell boot. A list item carries the chunk's URL, its content identity, the specifiers it answers and every import edge it holds — bare specifiers and intra-package relative edges recorded as resolved item references, so no edge is derived from source text at mint time; a list document nests the lazy-target lists — each holding only what the target needs beyond its parent chain's lists — the pattern-import lists keyed by matching file, and the opaque-import report entries naming each `import(expr)` call site with file and line. The manifest carries each entry's list by location and content identity; the shell boot chunk embeds the shell's boot list inline together with the lazy-target lists the boot list references. Fetch-list documents are type-system-neutral JSON build artifacts; the TypeScript interfaces exported from the package's `./unit-format` entry are their single typing source, and no list schema exists in any type system. The runtime reads a list, fetches every item missing from the realm text cache in one parallel batch, and mints per load in dependency order — there is no runtime graph discovery. The ecosystem owns this contract and ships, beside those interfaces, a `UnitFormatConformance` suite that any producing build must pass; the producer implementation itself is template territory and no producer option may change chunk bytes. Beside the contract subpath, the package ships a `./unit-loader` subpath exposing exactly the fetch, verify, realm-cache and mint classes — the surface a host's own unit loading (the shell boot chunk a producing build emits) consumes without reaching the registry, orchestrating handler or mediator. The same contract carries the integrity verification every fetched list document and chunk passes before it enters the realm cache and the byte-agreement measurement that makes a non-deterministic producer observable in the field and fails builds that disagree where they meet.

### 1.2 Purpose

Content-keyed reuse across independently built and deployed microfrontends works only when every consumer receives the same bytes for a package at a version and when the runtime can verify that it does (`cpt-frontx-adr-shared-dep-reuse`). That requires the emitted format — what a chunk is, what a fetch list states, how files are named and identified, how lazy and pattern imports are carried — to be owned by the ecosystem that owns the reader, not left to whichever producing build emitted it, and verified mechanically so a producer that is not the ecosystem's own can still be trusted to emit conforming output. This feature fixes that contract and its conformance suite; how a load drives a list through fetch, verify and mint, and how the manifest's locating fields are read, belong to `cpt-frontx-feature-mfe-loading`, and how a load builds isolated module instances over the verified text belongs to `cpt-frontx-feature-mfe-isolation`.

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-nfr-runtime-performance`, `cpt-frontx-nfr-resource-efficiency`

**Principles**: none owned by this feature

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Builds a microfrontend with consumer-side build tooling that produces conforming output, and runs the shipped `UnitFormatConformance` suite against a producer's output before relying on it |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Decomposition**: `cpt-frontx-feature-unit-format-contract` (DECOMPOSITION §2.8)
- **ADRs**: `cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-mfe-asset-discovery`, `cpt-frontx-adr-shared-dep-cache-reach`
- **Component**: `cpt-frontx-component-mfe-runtime` (shared with F4, F5, F6, F7, F8)
- **Dependencies**: `cpt-frontx-feature-mfe-loading`, `cpt-frontx-feature-mfe-isolation`

**Checklist applicability**:
- PERF — Addressed in §5 (One Flat Fetch List Per Entry): precomputed per-entry lists let a load fetch only the chunks the entry reaches, in one parallel batch, with one further round per lazy target, and no runtime graph discovery (`cpt-frontx-nfr-runtime-performance`).
- SEC — Addressed in §3 (Fetched-File Integrity Verification) and §5 (Integrity Verification Before Cache Admission): every fetched list document and chunk is verified against its declared content identity before it is used or admitted to the realm cache, and a mismatch is never cached, so no unverified text can be evaluated inside a microfrontend's isolated graph.
- REL — Addressed in §3 (Fetch-List Contract) and §5 (Byte-Agreement Measurement — Runtime and Cross-Build): a barrel that cannot be proven side-effect-free is shipped whole in its entry's chunk — matching what the consumer's own production build already ships — and hash conflicts surface as one warning per conflicting pair plus a diagnostics event rather than silent reuse.
- DATA — Not applicable because this feature stores nothing durable; the contract describes published files and in-memory verification.
- INT — Addressed in §3 (Fetch-List Contract) and §5 (Producer Conformance Suite Shipped With the Contract): the TypeScript interfaces in `./unit-format`, the naming and identity rules, and the list-carrying manifest and boot-data fields are the boundary between template-territory producers and the ecosystem runtime.
- OPS — Addressed in §3 (Byte-Agreement Measurement): hash conflicts and opaque dynamic imports are reported through the runtime's diagnostics and the build report for the host to surface.
- MAINT — Not applicable because this feature sets no maintainability target of its own; the contract is a published interface surface whose evolution is governed by the manifest contract's additive-compatibility rules.
- TEST — Addressed in §5 (Producer Conformance Suite Shipped With the Contract) and §6: `UnitFormatConformance` is itself the mechanical check a producer passes, and the acceptance criteria are what an implementation of the reader side is tested against.
- COMPL — Not applicable because this feature handles no regulated or personal data.
- UX — Not applicable because this feature renders no user interface.
- BIZ — Not applicable because this is an internal library feature; its requirements are cited by ID in §1.2.

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor and describe the end-to-end flow of a use case.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### Producer Conformance Verification

- [ ] `p1` - **ID**: `cpt-frontx-flow-unit-format-contract-producer-conformance-v2`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- The consumer-side build tooling produces shared-dependency output that passes the shipped `UnitFormatConformance` suite: every entry is described by one flat fetch list whose items close over every specifier the listed chunks import, each chunk's bytes depend only on `package@version`, and the runtime admits the output for content-keyed reuse.

**Error Scenarios**:
- The produced output violates the contract — a malformed list document, a chunk whose declared content identity does not match its bytes, an item's import edge no item answers, a lazy or pattern list that carries chunks its parent chain's lists already carry — and the conformance suite reports typed violations naming the violated rule and the offending file.
- Two producing builds emit different chunk bytes for the same `package@version`; the conformance suite's byte-identity check across the two output directories fails, and at runtime each conflict is warned once per pair of content identities and reported through diagnostics.

**Steps**:
1. [ ] - `p1` - The consumer-side build tooling produces, for each entry, the shared chunks and the fetch-list document that describes them, following the contract of `cpt-frontx-algo-unit-format-contract-fetch-list-schema-v2`; chunk bytes depend only on `package@version` and no producer option may change them - `inst-produce-output`
2. [ ] - `p1` - The build records each entry's fetch-list document in the microfrontend's manifest by location and content identity (`cpt-frontx-feature-mfe-loading`), forming the manifest → list → chunks content-identity chain - `inst-record-manifest-entries`
3. [ ] - `p1` - The project developer — in the producer's CI — runs `UnitFormatConformance`, shipped from the package's `./unit-format` entry, against independent output directories of the same producer and the same inputs, built under different install layouts or consumer configs - `inst-run-conformance`
4. [ ] - `p1` - **IF** the suite returns any typed violation - `inst-if-contract-violated`
   1. [ ] - `p1` - **RETURN** conformance failure naming the violated rule and the offending file; the output is not admitted for reuse - `inst-conformance-fail`
5. [ ] - `p1` - **RETURN** conforming output admitted for content-keyed reuse; at load time every fetched list document and chunk is verified against its declared content identity before entering the realm cache (`cpt-frontx-algo-unit-format-contract-integrity-verification`) - `inst-return-admitted`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. The first process below is the contract the producer satisfies and the runtime reads; the remaining ones are runtime behaviour over that contract.

### Fetch-List Contract

- [ ] `p1` - **ID**: `cpt-frontx-algo-unit-format-contract-fetch-list-schema-v2`

**Input**: The entries a build emits (each expose, each lazy target, the shell boot), the shared packages they reach, and each package's declared side-effect freedom

**Output**: One flat fetch-list document per entry — its items, its nested lazy-target and pattern-import lists and its opaque-import report entries — all content-addressed, plus the manifest-side facts the build records (each entry's list location and content identity) or the inline boot data the shell boot chunk embeds

**Steps**:
1. [ ] - `p1` - Determine each shared package's chunks by entry-point chunking: one chunk per entry point, with overlapping internals in shared internal chunks by deterministic, fixed-setting bundler chunk splitting. A package's entry set is its `exports` subpaths plus every module a public barrel re-exports; barrel members are split only when provably side-effect-free under the standard bundler semantics (the `sideEffects` field including its globs; when absent, a barrel proven to be a pure re-export list), and otherwise the whole entry's chunk is used and the build report names the package, the reason and the one-line fix - `inst-determine-chunks`
2. [ ] - `p1` - Keep every bare import in every chunk external and inline nothing across a package boundary: a package's chunk boundaries and bytes are computed from that package's own complete entry set, independent of any consumer, so every runtime's chunks of `package@version` are byte-identical and no producer option may change them - `inst-externalize-imports`
3. [ ] - `p1` - Write each entry's fetch list as a flat item list: every shared chunk the entry reaches, precomputed so the runtime fetches every item missing from the realm text cache in one parallel batch — each item carrying its URL (`location`, relative to the shared base or absolute), its content identity (`contentHash`, a SHA-256 hex digest), the specifiers it answers (`answers` — bare specifiers, package names and subpaths alike) and its import edges (`imports` — every edge the runtime needs for dependency-order minting: bare specifiers its source carries and intra-package relative edges recorded as resolved item references, with no edge derived from source text at mint time). Every specifier an item imports is answered by exactly one item on the entry's combined lists - `inst-emit-items`
4. [ ] - `p1` - Carry every literal dynamic-import target as a nested list: each MFE lazy chunk, shell lazy chunk and literal `import()` inside a shared chunk gets its own fetch-list document holding only what the target needs beyond its parent chain's lists, referenced from the parent's `lazy` record keyed by the target's chunk location relative to the shared base - `inst-emit-lazy-lists`
5. [ ] - `p1` - Carry every statically bounded pattern import — a template literal with a fixed prefix and suffix — as one list document per matching file, recorded in the parent's `patterns` record keyed by the matching file's location, and record every fully opaque `import(expr)` in the parent's `opaqueImports` with file and line; an opaque call stays native at runtime and never fails the build - `inst-emit-pattern-and-opaque`
6. [ ] - `p1` - Emit the files content-addressed: list documents and chunks carry their content identity so the content-identity chain runs manifest → list document → chunks; a producing build may record the producer and its version on a list document for runtime diagnostics - `inst-emit-content-addressed`
7. [ ] - `p1` - Read the list at the point of use only: the runtime performs no structural validation of list documents — trust rests on hash verification plus build-time conformance — and a required field that is absent where the runtime needs it fails the load with an `MfeLoadError` naming the file and the producer name and version the file itself records - `inst-read-point-of-use`
8. [ ] - `p1` - **RETURN** the entry list documents and their chunks, and the manifest-side facts — each entry's list location and content identity — for the producing build to record in the manifest; a shell's boot list and the lazy-target lists it references are embedded inline in the shell boot chunk as its boot data - `inst-return-contract-output`

### Fetched-File Integrity Verification

- [ ] `p1` - **ID**: `cpt-frontx-algo-unit-format-contract-integrity-verification`

**Input**: A fetched list document or chunk and the content identity declared for it (a SHA-256 declared by the manifest for each entry's list document, and by the list document for each chunk and each nested list document it references)

**Output**: Admission of the verified text to the realm cache, or a load failure naming the file and both hashes

**Steps**:
1. [ ] - `p1` - Compute the fetched text's SHA-256 and compare it against the content identity declared for the file, regardless of the source the text was fetched from — every fetched list document and chunk is checked before it is used or cached - `inst-compute-and-compare`
2. [ ] - `p1` - **IF** the hashes match - `inst-if-hash-match`
   1. [ ] - `p1` - **RETURN** admission of the text to the realm cache keyed by that content identity (`cpt-frontx-adr-shared-dep-cache-reach`) - `inst-admit-verified`
3. [ ] - `p1` - **IF** the hashes differ - `inst-if-hash-mismatch`
   1. [ ] - `p1` - **RETURN** load failure with an error naming the file and both hashes, reported through the runtime's diagnostics hook; the mismatching text is never cached - `inst-mismatch-fail`
4. [ ] - `p1` - **IF** the entry is an old-rule chunk carrying no well-formed content identity - `inst-if-old-rule`
   1. [ ] - `p1` - **RETURN** the behaviour in force for such entries: no verification against a declared hash, and never an admission to the realm cache under a `contentHash` key — an entry without a well-formed hash is deduplicated by its resolved URL so unverified text can never occupy a verified slot - `inst-old-rule-behaviour`

### Byte-Agreement Measurement

- [ ] `p1` - **ID**: `cpt-frontx-algo-unit-format-contract-byte-agreement`

**Input**: Content identities declared for the same `package@version` by different manifests or builds, naming the producer versions involved

**Output**: One runtime warning per conflicting pair plus a diagnostics event; a conformance-suite failure across two output directories of the same producer

**Steps**:
1. [ ] - `p1` - Compare the output directories `UnitFormatConformance` receives — two or more independent outputs of the same producer and the same inputs, built under different install layouts or consumer configs — byte for byte: one producer with one set of inputs must emit byte-identical files regardless of layout or consumer, and a disagreement is a typed violation that fails the producer's conformance run - `inst-cross-build-check`
2. [ ] - `p1` - At runtime, when manifests declare differing content identities for the same `package@version` under the same `sharedChunkRule`, warn once per pair of conflicting identities — naming the producer versions involved — and emit a diagnostics event, so the conflict is observable without depending on build-time checks; mismatches between old-rule and new-rule entries are summarized once per page rather than warned per pair - `inst-runtime-warn-once`
3. [ ] - `p1` - Treat the runtime measurement as the measurer of last resort: deterministic output stays the producing build's obligation, and the remedy for disagreement is determinism in that build, never a weaker reuse key - `inst-determinism-obligation`

### Sanctioned Loader Surface

- [x] `p1` - **ID**: `cpt-frontx-algo-unit-format-contract-loader-surface`

**Input**: A consumer — the orchestrating handler or a host loading its own shared set — importing the package's `./unit-loader` subpath

**Output**: Exactly the fetch, verify, realm-cache and mint capabilities as classes, converging on the versioned realm content-identity cache — enough for a host to run `loadGraph` → `buildPlan` → `mint` with no hand-written fetch or URL logic

**Steps**:
1. [x] - `p1` - Export exactly the loader capability classes — `SharedDepListLoader` for list read, one-parallel-batch fetch, dependency-order mint and lazy/pattern dependent-list resolution, `RealmSharedDepTextCacheProvider` for the realm cache, `VerifiedUnitFetcher` for the fetch/verify/cache-admit/evict-on-reject discipline, `SharedAssetUrlResolver` for shared-file location validation — with the supporting types (`SharedDepListContext`, `SharedDepTextCache`, `RealmSharedDepTextCacheDiagnostics`, `AttemptSourceTextLedger`, the fetch-list types and `MfManifest`) as type-only exports; nothing else crosses the subpath - `inst-loader-surface-classes`
2. [x] - `p1` - Reach no registry, orchestrating handler (`MfeHandlerMF`) or mediator module from the subpath's module graph, and add nothing to the root barrel — a host's own loader imports the same collaborator classes the handler orchestrates, never the orchestration itself - `inst-loader-surface-no-orchestration`
3. [x] - `p1` - Adopt a realm rendezvous slot entry whose protocol version and shape this copy recognizes — **RETURN** the published realm cache, so every compatible copy, handler-driven or host-driven, dedupes verified text by content identity - `inst-loader-slot-adopt`
4. [x] - `p1` - On a malformed slot entry or one carrying a protocol version this copy does not recognize, **RETURN** a bounded cache local to this copy, logging a diagnostic and leaving the foreign entry untouched — a shape mismatch means do-not-share, never a thrown error (`cpt-frontx-adr-shared-dep-cache-reach`) - `inst-loader-slot-versioned`

## 4. States (CDSL)

### None

This FEATURE defines no state machines. The unit format contract is a static contract and conformance suite; its behaviour is algorithmic (chunking, verification, measurement) without state transitions.

## 5. Definitions of Done

### One Flat Fetch List Per Entry

- [ ] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-fetch-list-schema-v2`

The ecosystem **MUST** own and publish the unit format contract: the chunk of sharing (consumer-independent entry-point chunking — one chunk per package entry point with overlapping internals in shared internal chunks, each package's boundaries and bytes computed from its own complete entry set: `exports` subpaths plus every module a public barrel re-exports, barrel members split only when provably side-effect-free under the standard bundler `sideEffects` semantics); the externalization rule (every bare import external, no cross-package inlining, so no producer option may change chunk bytes); the content-addressed naming for chunks and list documents — as emitted today, every file sits under a `<pkg>@<version>` directory: chunks `<pkg>@<version>/<path>.<sha256>.js`, fetch-list documents `<pkg>@<version>/<entry>.list.<sha256>.json`, and pattern-matched files `<pkg>@<version>/pattern/<name>.<sha256>.<ext>` — and the fetch-list fields — each item's `location`, `contentHash`, `answers` and `imports`, the nested `lazy` record of delta lists keyed by lazy-target chunk location, the `patterns` record keyed by matching file, the `opaqueImports` report entries with file and line, and the optional producer identity — with `imports` carrying every edge the runtime needs for dependency-order minting (bare specifiers and intra-package relative edges recorded as resolved item references) so no edge is derived from source text at mint time. One flat list **MUST** be emitted per entry — each expose, each lazy target, the shell boot — and a lazy or pattern list **MUST** hold only what its target needs beyond its parent chain's lists. The TypeScript interfaces exported from `./unit-format` **MUST** be the single typing source for list documents, which are type-system-neutral JSON: no list schema **MUST** exist in any type system and the `TypeSystemPlugin` surface **MUST** stay unchanged for them. The runtime **MUST NOT** perform structural validation of list documents; a required field absent at the point of use **MUST** fail the load with an `MfeLoadError` naming the file and the producer it records. The manifest **MUST** carry each entry's list by location and content identity, and the shell boot chunk **MUST** embed the shell's boot list inline together with the lazy-target lists the boot list references.

**Implements**:
- `cpt-frontx-flow-unit-format-contract-producer-conformance-v2`
- `cpt-frontx-algo-unit-format-contract-fetch-list-schema-v2`

**Addresses**:
- `cpt-frontx-adr-shared-dep-reuse`
- `cpt-frontx-adr-mfe-asset-discovery`
- `cpt-frontx-nfr-resource-efficiency`

**Constraints**: none owned

**Touches**:
- Entities: `MfManifest`

### Integrity Verification Before Cache Admission

- [ ] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-integrity-verification`

The runtime **MUST** check every fetched list document and chunk against its expected SHA-256 — declared by the manifest for each entry's list document and by the list document for each chunk and nested list it references — before the text is used or admitted to the realm cache, regardless of the source it was fetched from. A mismatch **MUST** fail the load with an error naming the file and both hashes, **MUST** be reported through the runtime's diagnostics hook, and the mismatching text **MUST NOT** be cached. An old-rule chunk carrying no well-formed content identity **MUST** keep the behaviour in force for such entries and **MUST NOT** be admitted to the realm cache under a `contentHash` key, so unverified text can never occupy a slot keyed by a hash it did not verify against.

**Implements**:
- `cpt-frontx-algo-unit-format-contract-integrity-verification`
- `cpt-frontx-flow-unit-format-contract-producer-conformance-v2`

**Addresses**:
- `cpt-frontx-adr-shared-dep-cache-reach`
- `cpt-frontx-adr-mfe-asset-discovery`
- `cpt-frontx-fr-mfe-load-failure-handling`

**Constraints**: none owned

**Touches**:
- Entities: `MfManifest`

### Byte-Agreement Measurement — Runtime and Cross-Build

- [ ] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-byte-agreement`

The runtime **MUST** warn once per pair of conflicting content identities declared for the same `package@version` under the same `sharedChunkRule`, naming the producer versions involved, and **MUST** emit a diagnostics event for each conflict; mismatches between old-rule and new-rule entries **MUST** be summarized once per page. `UnitFormatConformance` **MUST** compare the output directories it receives — two or more independent outputs of the same producer and inputs, built under different install layouts or consumer configs — byte for byte and report a violation on any disagreement. The runtime measurement is the measurer of last resort; deterministic output **MUST** remain the producing build's obligation, and a disagreement **MUST NOT** be remedied by weakening the reuse key.

**Implements**:
- `cpt-frontx-algo-unit-format-contract-byte-agreement`

**Addresses**:
- `cpt-frontx-adr-shared-dep-reuse`
- `cpt-frontx-nfr-resource-efficiency`

**Constraints**: none owned

**Touches**:
- Entities: `MfManifest`

### Producer Conformance Suite Shipped With the Contract

- [ ] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-conformance-suite-v2`

The package **MUST** ship `UnitFormatConformance` from its `./unit-format` entry: a class that takes two or more independent output directories of the same producer and the same inputs — built under different install layouts or consumer configs — and no type system — and returns typed violations with no test-runner dependency. Its checks **MUST** cover: the content-identity chain manifest → list document → chunks; list completeness — every chunk reachable from an entry is on its list and every specifier an item imports is answered by an item on the entry's combined lists; the delta property of lazy and pattern lists — no chunk a parent chain's lists already carry; consumer independence — two consumers using different subsets of a package produce identical chunks for it; the barrel edge cases — re-export chains, namespace imports, `as default`, side-effectful barrels; and byte identity across all compared builds. Every producing build's CI **MUST** run it before its output is admitted for reuse. The package **MUST** ship fixture packages — an ESM package with an import cycle, a CommonJS package, a package with a barrel, and a package imported through a subpath — and its own tests **MUST** check that the runtime loads conforming output. `UnitFormatConformance` ships in a `@gears-frontx/mfes` minor version compatible in both directions; producer implementations are template territory and are never copied into this package.

**Implements**:
- `cpt-frontx-flow-unit-format-contract-producer-conformance-v2`
- `cpt-frontx-algo-unit-format-contract-fetch-list-schema-v2`

**Addresses**:
- `cpt-frontx-adr-shared-dep-reuse`
- `cpt-frontx-fr-mfe-runtime-registration`

**Constraints**: none owned

**Touches**:
- Entities: `MfManifest`

### Loader Surface Limited to Fetch, Verify, Cache and Mint

- [x] `p1` - **ID**: `cpt-frontx-dod-unit-format-contract-loader-surface`

The package **MUST** publish a `./unit-loader` subpath exposing exactly the fetch/verify class `SharedUnitGraphLoader`, the mint class `UnitBlobMinter`, the realm-cache accessor `RealmSharedDepTextCacheProvider`, the verified-fetch class `VerifiedUnitFetcher`, the shared-asset URL validator `SharedAssetUrlResolver` and `PackFallbackPolicy` (whose `DEFAULT_BUDGET_MS` static is the documented `buildPlan` budget default) — the same collaborator classes `MfeHandlerMF` orchestrates, so a host runs `loadGraph` → `buildPlan` → `mint` with no hand-written fetch or URL logic. The exported type-only surface is exactly `SharedDepSourceRecord`, `SharedUnitGraphPlan`, `SharedUnitReach`, `LoadedGraph`, `SharedDepTextCache`, `RealmSharedDepTextCacheDiagnostics`, `AttemptSourceTextLedger`, `MfManifest`, `MfManifestShared` and `MfManifestRoot` — the types the capability classes' signatures require. The subpath's module graph **MUST NOT** reach the registry, the orchestrating handler or the mediator, and the root barrel **MUST NOT** gain implementation exports from it. Through the accessor a consumer **MUST** reach the versioned realm rendezvous: a slot entry whose protocol version or shape the copy does not recognize **MUST** be left untouched and never shared — the copy proceeds on its own bounded fallback cache and no error is thrown — while a recognized entry **MUST** be adopted so compatible copies dedupe verified text by content identity.

**Implements**:
- `cpt-frontx-algo-unit-format-contract-loader-surface`

**Addresses**:
- `cpt-frontx-adr-shared-dep-reuse`
- `cpt-frontx-adr-shared-dep-cache-reach`

**Constraints**: none owned

**Touches**:
- Entities: `MfManifest`, `MfManifestShared`, `MfManifestRoot`
- Modules: `src/unit-loader/index.ts`, `SharedUnitGraphLoader`, `UnitBlobMinter`, `RealmSharedDepTextCacheProvider`, `VerifiedUnitFetcher`, `SharedAssetUrlResolver`, `PackFallbackPolicy`, `AttemptSourceTextLedger`, `ByteBudgetLruCache`

## 6. Acceptance Criteria

- [ ] Shared packages are chunked by consumer-independent entry-point chunking: one chunk per entry point, overlapping internals in shared internal chunks; a package's chunk boundaries and bytes are computed from its own complete entry set (`exports` subpaths plus every module a public barrel re-exports), so every runtime's chunks of `package@version` are byte-identical.
- [ ] Every bare import in a chunk is external and no package is inlined across a package boundary; barrel members are split only when provably side-effect-free under the standard bundler `sideEffects` semantics, and a barrel kept whole is reported with the package, the reason and the one-line fix; chunk bytes are identical for every consumer and no producer option changes them.
- [ ] Exactly one flat fetch-list document exists per entry — each expose, each lazy target, the shell boot — each item carrying `location`, `contentHash`, `answers` and `imports` (every edge needed for dependency-order minting, none derived from source text at mint time), with nested `lazy` lists keyed by lazy-target chunk location, `patterns` lists keyed by matching file, and `opaqueImports` entries naming each `import(expr)` call site with file and line.
- [ ] A lazy-target or pattern list holds only what its target needs beyond its parent chain's lists, and every specifier an item imports is answered by exactly one item on the entry's combined lists — the build-time list-completeness gate fails a build whose lists do not close.
- [ ] The manifest carries each entry's list by location and content identity, and the shell boot chunk embeds the shell's boot list inline together with the lazy-target lists the boot list references; list documents and chunks are content-addressed so the identity chain runs manifest → list document → chunks.
- [ ] List documents are read at the point of use with no structural validation; a required field absent where the runtime needs it fails the load with an `MfeLoadError` naming the file and the producer name and version the file records.
- [ ] Every fetched list document and chunk is verified against its declared SHA-256 before use or cache admission; a mismatch fails the load naming the file and both hashes, is reported through diagnostics, and is never cached; old-rule chunks without a well-formed identity keep their existing behaviour and are never cached under a `contentHash` key.
- [ ] Two manifests declaring different content identities for the same `package@version` under the same `sharedChunkRule` produce exactly one warning per conflicting pair naming the producer versions, plus a diagnostics event; old-rule versus new-rule mismatches are summarized once per page.
- [ ] `UnitFormatConformance` compares two or more independent output directories of the same producer and inputs — built under different install layouts or consumer configs — returning typed violations covering the identity chain, list completeness, the lazy/pattern delta property, consumer independence, the barrel edge cases and byte identity, each named with the offending file, and a producer CI run fails on any violation.
- [ ] The shipped fixture packages (ESM with an import cycle, CommonJS, barrel, subpath import) produce conforming output that the package's own tests show the runtime loading.
- [x] The `./unit-loader` subpath exports exactly `SharedDepListLoader`, `RealmSharedDepTextCacheProvider`, `VerifiedUnitFetcher` and `SharedAssetUrlResolver` (plus the type-only supporting types the loader-surface DoD records), its module graph reaches no registry, orchestrating handler or mediator module, and the root barrel is unchanged.
- [x] A realm-slot entry whose protocol version or shape a copy does not recognize is left untouched and never shared — the copy proceeds on its own bounded fallback cache with no thrown error — while a recognized entry is adopted so compatible copies dedupe verified text by content identity.
