---
status: accepted
date: 2026-11-17
description: "Decides that microfrontends reuse shared-dependency code as content-identified, consumer-independent units — one chunk per package entry point with overlapping internals in shared internal chunks, every bare import external — listed, together with the microfrontend's own chunks by location, on precomputed per-exposed-module and per-lazy-target flat fetch lists under an ecosystem-owned format contract whose public surface is the ./unit-format types and the ./unit-loader shared-unit fetcher and location resolver."
---

# How Should Microfrontends Reuse Shared-Dependency Code?

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Consumer-independent entry-point chunks on per-exposed-module flat fetch lists](#consumer-independent-entry-point-chunks-on-per-exposed-module-flat-fetch-lists)
  - [Whole-package chunk per consumer, externals chosen by the consumer's shared list](#whole-package-chunk-per-consumer-externals-chosen-by-the-consumers-shared-list)
  - [Whole-package chunk, externals chosen by a curated canonical shared set published per framework version](#whole-package-chunk-externals-chosen-by-a-curated-canonical-shared-set-published-per-framework-version)
  - [Whole-package chunk with every bare import external](#whole-package-chunk-with-every-bare-import-external)
  - [A central used-exports service producing one union subset bundle per package](#a-central-used-exports-service-producing-one-union-subset-bundle-per-package)
  - [Reuse of an already-loaded subset bundle when it covers the consumer's needs, with fallback otherwise](#reuse-of-an-already-loaded-subset-bundle-when-it-covers-the-consumers-needs-with-fallback-otherwise)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-shared-dep-reuse`

## Context and Problem Statement

The runtime keeps a cross-microfrontend cache of shared-dependency source text, so that a second microfrontend declaring the same shared dependency need not fetch it again. Reuse of that text raises two linked questions: when two loads may safely reuse the same text, and in what unit the text must be produced so that reuse actually happens.

Safety comes first. A shared-dependency chunk that a producing build emits per consuming microfrontend is not a published package artifact. Which of the package's own dependencies stay external and which are inlined depends on the consumer's declared shared list at build time. Two microfrontends can therefore declare the same package at the same version and legitimately ship structurally different chunks. A reuse key built from the package name and version identifies the build's input, not its output. Under such a key, whichever load reaches the cache first hands its text to every later load declaring the same name and version, even when the later microfrontend's own shared list never authorized the externals that text assumes. The later microfrontend then meets an unrewritten reference it cannot resolve, and it fails to mount.

Effectiveness comes second. A key on content can only reuse what is byte-identical, and consumer-dependent production makes byte identity the exception rather than the rule. Cross-microfrontend reuse then rarely happens, even where two microfrontends depend on exactly the same package version. A chunk that is the whole package is also evaluated whole, so nothing a consumer does not use is skipped. A consumer that shares few of a package's siblings receives large chunks with those siblings inlined. Where two shared chunks of one load each inline the same third package, that package is evaluated twice inside one load, and its module-level state exists twice.

Per-instance isolation, `cpt-frontx-adr-mfe-load-isolation`, is a given and is not reopened here: only source text is ever shared, and every load builds its own module instances over it.

How should microfrontends reuse shared-dependency code, so that reuse happens only between loads that agree on what is reused, the bytes for a package at a version are the same for every consumer, and a load fetches and evaluates only what it needs — without the runtime having to discover the dependency graph at load time?

**Terms.** This record defines the following terms, and `cpt-frontx-adr-lazy-import-resolution`, `cpt-frontx-adr-mfe-asset-discovery` and `cpt-frontx-adr-shared-dep-cache-reach` use them with the same meaning:

* **Exposed module** — a module a microfrontend exposes for loading, named by an MFE entry; a load targets one exposed module.
* **Shared entry** — one declaration in the manifest's `shared` array: a package name, a version, a `chunkPath` and an optional `contentHash`.
* **Package entry point** — an `exports` subpath of a package, or a module its public barrel re-exports.
* **Lazy target** — a chunk reached through a literal or pattern dynamic import — an own lazy chunk, or the target of a literal or pattern import inside a shared chunk — which gets its own fetch list; a pattern import has one lazy target per matching file.
* **Fetch list** — the precomputed flat list of the shared chunks one exposed module or one lazy target needs, together with the locations of the microfrontend's own chunks it reaches statically. A **fetch-list document** is the content-addressed JSON file that carries a fetch list.
* **List item** — one shared chunk on a fetch list: its location, content identity, answered specifiers and import edges.
* **Whole-package entry** — a shared entry whose `chunkPath` names one file holding the whole package; a load uses whole-package entries when its exposed module has no fetch list.
* **Unit** — what reuse operates on: a list-item chunk or a whole-package entry.
* **Own chunk** — a chunk of a microfrontend's own code: the chunk that backs an exposed module or an own lazy target, and every chunk of its own code that these reach. An own chunk is not shared, carries no content identity and is never admitted to the realm cache.
* **Round** — a set of requests the runtime issues together; the runtime cannot issue the next round until a response from the current one tells it what to request. Round counts cover only the requests the runtime issues, and a round with nothing to request is not issued, so a stated count is an upper bound.

## Decision Drivers

* **Resource efficiency** — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once, that only what is required be evaluated, that memory stay bounded, and that the outcome be observable.
* **Load latency** — `cpt-frontx-nfr-runtime-performance` sets the load-time budget that any change in the number or size of fetched files must stay within; sequential fetch rounds per load count against it.
* **Isolation per load** — under `cpt-frontx-adr-mfe-load-isolation`, whatever unit is chosen, only inert source text is shared, never a module instance.
* **Reuse must fail safe** — where two loads do not declare the same content, the runtime must choose no reuse over reuse, because the alternative is code a microfrontend never declared evaluated inside it; a shared content identity is a declaration of what is shared, not a grant of trust in code.
* **Correctness must not rest on an unverifiable convention** — the runtime cannot assume that third-party producing builds behave identically, so reuse must be tied to something the declared description states about what is reused.
* **Independent deployment** — microfrontends ship on their own release trains; reuse must not require a central service or release coordination across microfrontends, and the runtime accepts a new manifest field before producers emit it.
* **No FrontX expertise required of microfrontend developers** — a microfrontend developer must not need to curate externals, and FrontX packages and third-party packages must be treated by one rule.
* **Consumer-independent bytes** — the bytes produced for a package at a version must not depend on which microfrontend consumes it, or content-keyed reuse cannot work.
* **Type-system agnostic contract** — the format a producing build emits and the runtime reads must not depend on any type system, schema language or registry.
* **Producer independence** — the runtime must not depend on any specific producer, and a third-party producer must be able to conform.

## Considered Options

* **Whole-package chunk per consumer, externals chosen by the consumer's shared list.**
* **Whole-package chunk, externals chosen by a curated canonical shared set published per framework version.**
* **Whole-package chunk with every bare import external** — one uniform rule, no inlining across a package boundary.
* **Consumer-independent entry-point chunks on per-exposed-module flat fetch lists** — bundler chunk splitting computed from each package's own complete entry set, with the chunks each exposed module and each lazy target needs listed ahead of time.
* **A central used-exports service producing one union subset bundle per package** — the server-calculated mode of Module Federation's shared tree shaking.
* **Reuse of an already-loaded subset bundle when it covers the consumer's needs, with fallback otherwise** — the runtime-inferred mode of Module Federation's shared tree shaking.

In the option names, a *whole-package chunk* is a build output that holds one whole package; it is distinct from a *whole-package entry*, the manifest declaration defined under Terms.

FrontX microfrontends do not use Module Federation's own shared mechanism, so the last two options could only be adopted as borrowed ideas, not as configuration of an existing dependency. For completeness: `@module-federation/vite` does implement Module Federation Shared Tree Shaking (module-federation/vite#910) — the runtime-inferred mode infers at load time whether an already-loaded subset covers the consumer, and the server-calculated mode asks a central service for the covering bundle — but FrontX microfrontends bypass Module Federation sharing entirely, so adopting either mode means borrowing the idea, not enabling a flag. A hybrid of the two was not adopted either: any server-calculated element needs central infrastructure and couples releases across microfrontends.

## Decision Outcome

Chosen option: **consumer-independent entry-point chunks on per-exposed-module flat fetch lists**, because it is the only option that makes a package's bytes independent of the consumer without curation or a central service, rules out duplicate instances of a package inside one load, lets a load fetch only the chunks it needs, and — unlike every coarser-grained split — does so with the bundler's own chunking, so on the fetch-list path a fetch list replaces runtime graph discovery. Reuse of those units is keyed on their content identity, so it happens only between loads that agree on the content being reused.

**Unit of reuse.** Shared packages are chunked the way Module Federation chunks package entries: one chunk per package entry point, with overlapping internals placed in shared internal chunks by deterministic bundler chunk splitting with fixed settings. A package's entry set is its `exports` subpaths plus every module a public barrel re-exports. Barrel members are split only when provably side-effect-free under the standard bundler semantics — the `sideEffects` field including its globs; when the field is absent, only a barrel proven to be a pure re-export list is split. Otherwise the whole entry's chunk is used, which is exactly what the consumer's own production build ships. One rule covers every package; there is no special case for FrontX packages.

**Consumer independence.** A package's chunk boundaries and bytes are computed from that package's own complete entry set, independent of any consumer, so every runtime's chunks of `package@version` are byte-identical. Each build's output contains only the chunks its own fetch lists reference, and a chunk's bytes never carry path comments or other build-environment text. No producer option changes chunk bytes.

**Unit identity and externalization.** A unit's reuse identity is its content identity. One rule covers every shared package: every bare import in a chunk stays external, and nothing is inlined across a package boundary. Because chunking is consumer-independent, the bytes of a chunk depend only on the package at that version, never on the consumer.

**Loading model — flat fetch lists.** Each build emits one precomputed flat fetch list for each exposed module and each lazy target. Each list item carries the chunk's location, its content identity, the specifiers it answers, and every import edge it carries — bare specifiers and intra-package relative edges, recorded as resolved item references. The recorded edges determine minting order; specifier rewriting resolves the specifiers in the text against the list. The fetch list also names the microfrontend's own chunks the exposed module or lazy target reaches statically, by location only, with no content identity. Content identity exists so that independently built microfrontends share matching chunks, so it applies to shared units only; own chunks are not shared and are not admitted to the realm cache. The runtime reads the fetch list referenced from the manifest and requests, in one flat batch with no concurrency limit, every list item missing from the realm cache together with the own chunks the list names, then mints per load in dependency order; the load sequence, at most two rounds, is the one `cpt-frontx-adr-mfe-asset-discovery` decides. When two locations on a load's lists carry the same content identity, the runtime requests one payload for that identity. A cycle among list items fails the load with an `MfeLoadError` naming the chunks on the cycle and the microfrontend. On the fetch-list path there is no runtime graph discovery: the structure matches Module Federation's `remoteEntry.js` plus precomputed chunk lists, with shared list items identified by content identity rather than resolved from a share scope by name and version.

**Lazy and pattern imports.** Every lazy target gets a precomputed fetch list of what it needs beyond its parent chain's lists. On first use, that fetch list and the target's own chunk are requested in one round, and its missing list items and the own chunks it names in one flat batch the next round; for a lazy target that is a shared unit, its list item joins that next round in place of an own chunk in the first. They are minted into the same load, with concurrent resolutions of one target deduplicated, as `cpt-frontx-adr-lazy-import-resolution` decides. A pattern import — a template literal with a statically bounded pattern — becomes one fetch list per matching file and reaches the lazy-import call everywhere: in a microfrontend's own code, the producer writes those fetch lists and emits the call; inside a shared unit, the runtime rewrites the import to the call at mint time. A fully opaque `import(expr)` — neither a literal nor a statically bounded pattern — stays native: it resolves through the browser's own module loading, outside the load's isolated graph, so isolation is not guaranteed for it. The project that uses a library containing one carries that risk, and producers report each occurrence with its file and line. The report entries are carried in the fetch list.

**Version matching.** Each runtime loads exactly the version it was built with. Identical versions share downloads through the content-identity cache; different versions coexist with their own instances per load. There are no version ranges and no singleton rules at runtime. This differs from Module Federation on purpose: Module Federation picks one compatible registered version and shares its instance, so code can run on a version it was not built against.

**Closure and consumer-scoped resolution.** A consumer's shared set is the closure of what its shared chunks import by bare name, so every bare import a chunk keeps external can be resolved from the loading microfrontend's own declarations. The set is derived, not curated; there is no hand-written shared list. The version a manifest records for a shared package is the version of the copy that was bundled, and at most one version of a shared package is reachable from the shared closure. The runtime resolves the bare imports of shared code only from the loading microfrontend's own declarations. Realm-wide resolution of source text is rejected, because its result would depend on load order; sharing evaluated instances is rejected, because it violates `cpt-frontx-adr-mfe-load-isolation`.

**Identity for reuse.** Reuse is keyed on the content identity of a unit: the list-item chunk or the whole-package entry that a fetch list or a manifest references. Two loads reuse source text only when the content identities they declare are identical, so a matching package name and version never authorizes reuse on its own. A key derived from bundling parameters is rejected, because it does not capture what a build actually inlines, so text another build inlined differently would be evaluated inside a load as silently foreign code. A whole-package entry that carries no content identity is held in the realm cache under a key built from its package name, version and resolved absolute location; under the value formats the manifest contract fixes, that key cannot collide with a content-identity key (`cpt-frontx-adr-shared-dep-cache-reach` states the key scheme). The runtime writes a notice naming the dependency and the manifest, bounded as `cpt-frontx-adr-shared-dep-cache-reach` states. Such text is reused only by loads that resolve the identical absolute location — repeated loads of the same microfrontend, or microfrontends that name the same absolute `chunkPath` — on the assumption that the content at a location does not change during the realm's lifetime. Which cache holds shared text is decided in `cpt-frontx-adr-shared-dep-cache-reach`.

**Format contract.** The ecosystem owns the format a producing build emits and the runtime reads:

* There is one content-addressed fetch-list document per exposed module and per lazy target. It carries the flat list of list items — each item's location, content identity, answered specifiers and import edges, carrying every edge needed for dependency-order minting — and `ownChunks`, a string array of the locations of the microfrontend's own chunks the module or target reaches statically, each a path relative to `publicPath` or an absolute http(s) URL, with no content identity. It also carries the lazy-target fetch lists as document references, keyed by the lazy target's chunk location relative to the base that chunk resolves against (`publicPath` for an own chunk, `sharedBase` for a shared unit) and each holding only what the target needs beyond its parent chain's lists; the pattern-import fetch lists keyed by matching file in the same way; the opaque-import report entries; and, optionally, the producer and its version.
* A content identity is the SHA-256 digest of a file's text, which the producer computes at build time and declares, written as 64 lowercase hexadecimal characters. The runtime takes each declared identity as the key under which the file's text is shared. Chunks and fetch-list documents are all content-addressed, so the content-identity chain runs manifest → fetch-list document → list items.
* A microfrontend's manifest references each exposed module's fetch-list document by location and content identity, in a top-level `entryLists` record keyed by exposed module, and may give a base location for shared files in `metaData.sharedBase`. Locations resolve by the rules `cpt-frontx-adr-mfe-asset-discovery` states: fetch-list documents and list items against `sharedBase` when given, otherwise against `publicPath`, with a relative `sharedBase` resolved against the resolved `publicPath` directory; the microfrontend's own chunks a fetch list names against `publicPath`; `chunkPath` against `publicPath`, or it is an absolute URL.
* A manifest whose exposed module has no fetch list uses whole-package entries, each handled as one unit and reused under the identity stated above.
* While the project is at major version 0, a change to the fetch-list format, additive or not, takes no version bump, and the runtime accepts a new field before producers emit it.
* The semantics of the manifest fields above are owned by this decision; their place in the closed manifest contract, and their value formats, are decided in `cpt-frontx-adr-mfe-asset-discovery`. The naming of shared files is detailed in `cpt-frontx-feature-unit-format-contract`.

**Contract home and schema language.** The contract has one definition site: the `@gears-frontx/mfes/unit-format` subpath of the runtime package, which carries the fetch-list contract types and nothing else. The runtime imports it, and a producer consumes it as types only, so nothing from the runtime package is bundled into a producer. A second subpath, `@gears-frontx/mfes/unit-loader`, carries the shared-unit fetcher `SharedUnitFetcher` and the location-to-URL resolver, which applies the location rules of `cpt-frontx-adr-mfe-asset-discovery`, and nothing else; it carries no contract types, which come from `./unit-format`. The public fetcher takes a fetch function and a label that its errors carry. It fetches a shared unit through the realm cache under the same discipline a microfrontend load uses, and derives the cache key itself from the unit's declared content identity, so no internal parameter is public; the key forms stay an internal protocol between copies of the package (`cpt-frontx-adr-shared-dep-cache-reach`). Neither subpath adds anything to the root barrel, and `./unit-loader` reaches no registry, orchestrating handler or mediator module. The surface follows interface segregation: a symbol is public only where a consumer outside the package uses it, a public class exposes only the members such consumers use, and a symbol only tests use is never public. The lazy-import resolver table and its resolver type (`LazyLoaderRegistry`, `LazyResolver`) are therefore internal. Fetch-list documents are type-system-neutral JSON, typed by the TypeScript interfaces in `./unit-format` as the single source. The runtime performs no content validation of a fetch-list document: correctness of its contents, like the content identity the manifest declares for it, rests on the producer's conformance. A fetch-list document that is not JSON, or carries no item list, fails the load with an `MfeLoadError` naming the file and, where the document records one, its producer name and version. The manifest is a type-system entity.

**Producer output obligations.** A producer is any build whose output satisfies the format contract; the runtime depends on no specific producer. The output must satisfy:

* content identity — every chunk and fetch-list document is content-addressed, and the manifest → fetch-list document → list items hash chain holds;
* complete fetch lists — every shared chunk reachable from an exposed module is on its fetch list, every own chunk it reaches statically is named by location, and every import edge is answered, including through re-export chains, namespace imports, `as default` and side-effectful barrels;
* acyclic list items — the list items of a load form no import cycle;
* delta lists — a lazy or pattern fetch list holds only what its target needs beyond its parent chain's lists;
* lazy-import calls — every literal and pattern dynamic import in the microfrontend's own code is emitted as the lazy-import call `cpt-frontx-adr-lazy-import-resolution` decides, with a fetch list per lazy target and per pattern-matching file;
* opaque-import report — every fully opaque `import(expr)` is reported with its file and line;
* consumer independence — two consumers using different subsets of a package produce identical chunks for it;
* byte identity across builds — rebuilding the same package version yields the same bytes, so one package version has one content identity for each chunk.

Deterministic output is each producer's obligation. The remedy for disagreement between builds is to make that build's output deterministic, never to key reuse on package name and version.

**Scope.** This decision fixes the unit, its consumer independence, its identity and externalization, the fetch-list loading model with its lazy, pattern and opaque imports, version-exact matching, closure and consumer-scoped resolution, the identity reuse is keyed on, the format contract with its home, its evolution and its public-surface rule, and the producer output obligations. How far the source-text cache reaches, and how it is bounded, are decided in `cpt-frontx-adr-shared-dep-cache-reach`; the manifest's locating fields and its closed contract are decided in `cpt-frontx-adr-mfe-asset-discovery`.

### Consequences

* Good, because reuse follows what microfrontends declare rather than coincidence: source text is shared only between loads that declare the same content identity for it, or resolve the identical absolute location for an entry that declares none.
* Good, because every consumer receives the same bytes for a package at a version, so content-keyed reuse takes effect across microfrontends.
* Good, because no package is inlined twice inside one load, so a load cannot end up with duplicate instances of one package's module-level state.
* Good, because a load fetches only the chunks its exposed module's fetch list names — the fetch-list document with the entry module, then one flat batch, at most two rounds, and at most two more on the first use of each lazy target — instead of discovering a graph at runtime.
* Good, because one rule covers FrontX packages and third-party packages alike, and no microfrontend developer curates externals.
* Good, because the contract is type-system agnostic and usable by any producer that satisfies it.
* Good, because the runtime is correct for whole-package entries that carry no content identity: they are reused only under their absolute location, never by name and version.
* Good, because a load runs each runtime on exactly the package versions it was built against, so code never executes on an unexpected version.
* Bad, because every producer implements the format contract and verifies its own output against it in its own tests.
* Bad, because correct sharing rests on producers: text is reused under the content identity its producer declares, so every producer must declare the identity of the file it publishes.
* Bad, because a package used by only one microfrontend can get larger in total, since its transitive dependencies become separate chunks instead of inlined subsets, until the fetch list limits what is fetched.
* Bad, because cross-microfrontend reuse of a whole-package entry needs a declared content identity; an entry without one costs one fetch per distinct absolute location.
* Bad, because different versions of one package coexist rather than sharing an instance, which is the deliberate cost of version-exact loading.
* Bad, and accepted: a fully opaque `import(expr)` stays native, outside the load's isolated graph, so isolation is not guaranteed for it; the project that uses a library containing one carries that risk, and producers report each occurrence with its file and line.
* Neutral, because whole-package entries and list items coexist within one realm cache, each reused under its own key.

### Confirmation

Compliance is confirmed in two places.

The runtime package's own tests confirm the runtime's behaviour:

* when two locations on a load's lists carry the same content identity, one payload is requested for that identity;
* it mints list items dependency-first, and a fetch list whose unminted items form an import cycle fails the load with an `MfeLoadError` naming the chunks on the cycle and the microfrontend;
* a fetch-list document that is not JSON, or carries no item list, fails the load with an `MfeLoadError` naming the file and, where the document records one, its producer name and version;
* own chunks a fetch list names are never admitted to the realm cache;
* two loads declaring a matching content identity for a whole-package entry share cached source text, two loads declaring different content identities for the same name and version do not, and an entry without a content identity reuses cached text only against a prior load resolving the identical absolute location, with one notice per handler for each dependency and manifest;
* two runtimes built with different versions of one package each load the version they were built with, as distinct instances, and the bare imports of shared code resolve only from the loading microfrontend's own declarations;
* a public-surface test confirms that the root barrel, `./unit-format` and `./unit-loader` export exactly what the API contracts of `packages/mfes/architecture/DESIGN.md` (§3.3) list — `./unit-loader` exporting the shared-unit fetcher and the location-to-URL resolver.

The load sequence, the rounds and the handling of unresolved specifiers are confirmed under `cpt-frontx-adr-mfe-asset-discovery`; the lazy path, including pattern imports, under `cpt-frontx-adr-lazy-import-resolution`; and admission to the realm cache under `cpt-frontx-adr-shared-dep-cache-reach`.

The producer output obligations — content identity, complete fetch lists, acyclic list items, delta lists, lazy-import calls, the opaque-import report, consumer independence and byte identity across builds — are verified in each producer's own tests: each producer implements the format contract and verifies its own output against it.

In the present instantiation, the fetch-list types live in `packages/mfes/src/unit-format/fetch-list.ts`. The content identity of a whole-package entry is the optional `contentHash` of the shared item in the manifest type `MfManifest` (`packages/mfes/src/manifest/mf-manifest.ts`) and in the type system's manifest type. `MfeHandlerMF` (`packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`) keys the realm cache on `name@version@contentHash` when the entry declares a hash, and on `name@version@<resolved chunk URL>` when it declares none.

## Pros and Cons of the Options

### Consumer-independent entry-point chunks on per-exposed-module flat fetch lists

One chunk per package entry point plus shared internal chunks, computed from the package's own complete entry set, every bare import external, described by a content-addressed flat fetch list per exposed module and per lazy target.

* Good, because chunk bytes depend only on the package at that version, so content-keyed reuse works across consumers.
* Good, because no package is inlined anywhere, so no package can be evaluated twice inside one load.
* Good, because a load fetches only the chunks its fetch list names, in one flat batch, with no runtime graph discovery.
* Good, because it needs no curation and no central service, and it treats every package by one rule.
* Good, because bundler chunk splitting is the same machinery the consumer's own production build already runs, so "provably side-effect-free" skips exactly what that build already skips.
* Bad, because splitting is bound by what the bundler can prove side-effect-free, so a package with an opaque barrel is delivered coarser than its used modules.
* Bad, because the fetch-list documents add a small typed surface the contract must fix and producers must emit.

### Whole-package chunk per consumer, externals chosen by the consumer's shared list

Each microfrontend's build emits one chunk per shared package, inlining whatever that microfrontend does not itself share.

* Good, because it needs no fetch list and no contract.
* Good, because a load fetches few files.
* Bad, because the bytes differ per consumer, so content-keyed reuse rarely occurs.
* Bad, because a package inlined into two shared chunks of one load is evaluated twice, producing duplicate instances.
* Bad, because every chunk is evaluated whole, so unused code is never skipped.

### Whole-package chunk, externals chosen by a curated canonical shared set published per framework version

A canonical list of shared packages published with each framework version decides what stays external, so every conforming consumer builds the same chunk.

* Good, because consumers that adopt the same canonical set produce the same bytes.
* Bad, because someone must curate the set, which requires FrontX expertise and couples microfrontends to a framework release.
* Bad, because a microfrontend's own packages outside the set are not covered, so FrontX and third-party packages are not treated by one rule.
* Bad, because packages outside the set are still inlined, and can still be inlined twice inside one load.

### Whole-package chunk with every bare import external

One chunk per package with no inlining across a package boundary.

* Good, because bytes are consumer-independent and no package is inlined twice inside one load.
* Good, because the number of files per load stays close to one per package.
* Bad, because every package is still evaluated whole, so unused code is never skipped.
* Bad, because transitive dependencies become whole-package chunks of their own, so total size can grow for packages that only one microfrontend consumes, with no reachability to offset it.

### A central used-exports service producing one union subset bundle per package

A central service aggregates the exports each consumer uses, and a secondary build produces one subset bundle per package covering their union.

* Good, because the subset excludes exports no consumer uses.
* Bad, because it requires a central service and couples releases across microfrontends, contradicting independent deployment.
* Bad, because the bytes depend on which microfrontends are deployed together, not on the package at a version.
* Bad, because every consumer evaluates the union of everyone's needs rather than its own.

### Reuse of an already-loaded subset bundle when it covers the consumer's needs, with fallback otherwise

At runtime, a consumer reuses a subset bundle another consumer already loaded if it covers the needed exports, and otherwise loads its own.

* Good, because it needs no central service.
* Bad, because whether reuse happens, and which bytes a load evaluates, depends on load order.
* Bad, because a consumer's subset bundle is still a consumer-dependent artifact, so content-keyed reuse remains the exception.

## More Information

Under `cpt-frontx-adr-mfe-load-isolation`, a unit is inert source text that each load rewrites and evaluates for itself, and every load mints its own isolated module graph whether its source text came from the cache or from a fresh fetch. `cpt-frontx-adr-lazy-import-resolution` governs how every lazy target resolves, in a microfrontend's own code and inside shared chunks: a literal or pattern `import()` inside a shared chunk is rewritten at mint time to the lazy-import call and served through its own nested fetch list. `cpt-frontx-adr-mfe-asset-discovery` fixes the locating contract, the load sequence, the location rules and the closed contract, with its value formats, that lists the manifest fields this decision gives meaning to. `cpt-frontx-constraint-mfes-realm-shared-dep-cache` holds: the format contract is carried in manifest and fetch-list data, and the public footprint is the one `cpt-frontx-adr-shared-dep-cache-reach` states. The reach, the realm rendezvous, the lifetime and the bound of the source-text cache are those of `cpt-frontx-adr-shared-dep-cache-reach`.

The contract is owned by the ecosystem under `cpt-frontx-adr-core-package-boundaries`, which keeps the runtime package free of any dependency on a producing build. Producers ship on their own release trains. The format contract, not a named producer, defines what the runtime accepts.

This record deliberately bundles the unit of reuse, its consumer independence, its identity and externalization, the fetch-list loading model with its lazy, pattern and opaque imports, version-exact matching, closure and consumer-scoped resolution, the reuse identity, the format contract with its home, its evolution and its public-surface rule, and the producer output obligations, because each depends on the others: the unit is only reusable under a content identity, the identity is only stable if the unit is consumer-independent, consumer-scoped resolution and version-exact matching decide which loads may reuse that identity, and the loading model, the contract and the obligations describe that same unit.

**Review trigger.** Revisit this decision if the format contract cannot be met by a widely used producer without changing chunk bytes; if single-consumer packages grow in total size in a way the fetch lists do not recover; if the loading model's rounds exceed the load-time budget of `cpt-frontx-nfr-runtime-performance` in compositions the platform must support; if independently produced builds of the same package version cannot be made to agree on content identity at a rate that makes content-keyed reuse worthwhile; or when the project leaves major version 0, so that changes to the fetch-list format and the shared-entry shape need a version policy.

**Checklist applicability.**

* ARCH — applicable and addressed above: this decision fixes the unit, the reuse identity, the fetch-list loading model and the producer contract that every composed application's loading path depends on, and reversing it after producers adopt the contract would be costly.
* INT — applicable and addressed above: the fetch list and the manifest fields are the integration contract between a producing build and the runtime, the manifest contract is closed as `cpt-frontx-adr-mfe-asset-discovery` decides, at major version 0 a fetch-list format change takes no version bump, and conformance is the format contract itself rather than a named producer.
* DATA — applicable and addressed above (DATA-ADR-001): the fetch-list format is a published data format — its fields, content-identity algorithm, hash chain and evolution at major version 0 are fixed here, and its full definition lives in `cpt-frontx-feature-unit-format-contract`.
* SEC — applicable and addressed above: reuse is keyed on declared content identity, and an entry without one is reused only under its absolute location, so a microfrontend evaluates shared text only under a content identity or location its own declaration names; a load resolves bare imports only from its own microfrontend's declarations. The declared content identity is the producer's declaration, used as the sharing key as decided in `cpt-frontx-adr-mfe-asset-discovery`, not a grant of trust in code. The runtime treats a registered MFE entry and its manifest as admitted input, and authenticating them is outside the package. A fully opaque `import(expr)` stays native and isolation is not guaranteed for it; that risk is accepted and carried by the project that uses such a library.
* REL — applicable and addressed above: isolation per load is preserved under `cpt-frontx-adr-mfe-load-isolation`, a declared name that survives rewriting surfaces as a load failure naming the chunk and the microfrontend rather than as silently evaluated foreign code, and whole-package entries and list items coexist within one realm cache.
* PERF — applicable and addressed above: a load requests its fetch-list document with its entry module and then one flat batch of missing list items and own chunks, at most two rounds, and at most two more on the first use of each lazy target, within `cpt-frontx-nfr-runtime-performance`; transfer, evaluation and memory are governed by `cpt-frontx-nfr-resource-efficiency`.
* OPS — Not applicable because this is a library mechanism; no deployed-service operational procedure is governed by this decision.
* MAINT — applicable and addressed above: the contract's single definition site keeps the runtime and every producer aligned on one published surface, and producers evolve on their own release trains behind the format contract.
* TEST — applicable and addressed above: the runtime package's own tests verify the runtime's behaviour, and each producer's own tests verify the producer output obligations; no test-only symbol is made public.
* COMPL — Not applicable because no regulated or personal data is processed.
* UX — Not applicable because this decision shapes how shared code is produced and reused, not rendered output; its user-visible effect is load time, addressed under PERF.
* BIZ — Not applicable because this is a technical decision; product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-nfr-resource-efficiency` — consumer-independent units let shared code be transferred at most once and fetched only where listed, and per-load diagnostics make the bytes fetched observable.
* `cpt-frontx-nfr-runtime-performance` — the cross-microfrontend source-text cache this NFR's mechanism describes is keyed on content identity so that its benefit is safe, and a load fetches its shared code and own chunks in one flat batch after the fetch-list document, at most two rounds, and at most two more on the first use of each lazy target.
* `cpt-frontx-nfr-security` — keying reuse on declared content identity, and scoping whole-package entries that carry no content identity to their absolute location, keep sharing within what each microfrontend declares: a microfrontend receives shared text only under a key its own declaration names; authenticating a registered entry and its manifest is outside the package.
* `cpt-frontx-fr-mfe-runtime-registration` — on-demand loading reads locating facts exclusively from the registered MFE entry and the registered manifest it references; this decision extends that manifest-sourced posture to the reuse decision and to the fetch lists a manifest references.
* `cpt-frontx-component-mfe-runtime` — this decision constrains how the MFE Runtime component establishes the identity of the shared code it reuses and resolves the bare imports of that code.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — the realm cache shares only source text, and the public surface grows only by the `./unit-format` and `./unit-loader` subpaths; its bound is decided in `cpt-frontx-adr-shared-dep-cache-reach`.
* `cpt-frontx-adr-mfe-asset-discovery` — the decision that fixes the locating contract, the load sequence, the location rules and the closed contract this decision's fields belong to.
* `cpt-frontx-feature-unit-format-contract` — the FEATURE that specifies the fetch-list format and the producer output obligations this decision fixes.
