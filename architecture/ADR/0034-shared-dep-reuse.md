---
status: accepted
date: 2026-11-03
description: "Decides that microfrontends reuse shared-dependency code as content-identified, consumer-independent chunks — one per package entry point with overlapping internals in shared internal chunks, every bare import external — listed on precomputed per-entry flat fetch lists under an ecosystem-owned format contract."
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
  - [Consumer-independent entry-point chunks on per-entry flat fetch lists](#consumer-independent-entry-point-chunks-on-per-entry-flat-fetch-lists)
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

Effectiveness comes second. A key on content can only reuse what is byte-identical, and consumer-dependent production makes byte identity the exception rather than the rule. Cross-microfrontend reuse then rarely happens, even where two microfrontends depend on exactly the same package version. A chunk that is the whole package is also evaluated whole, so nothing a consumer does not use is skipped. A consumer that shares few of a package's siblings receives large chunks with those siblings inlined; one observed case is an unminified chunk of roughly 1.6 MB for an extension that used a handful of hooks. Where two shared chunks of one load each inline the same third package, that package is evaluated twice inside one load, and its module-level state exists twice.

Per-instance isolation, `cpt-frontx-adr-mfe-load-isolation`, is a given and is not reopened here: only source text is ever shared, and every load builds its own module instances over it.

How should microfrontends reuse shared-dependency code, so that reuse happens only between loads that agree on what is reused, the bytes for a package at a version are the same for every consumer, and a load fetches and evaluates only what it needs — without the runtime having to discover the dependency graph at load time?

## Decision Drivers

* **Resource efficiency** — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once, that only what is required be evaluated, that memory stay bounded, and that the outcome be observable.
* **Load latency** — `cpt-frontx-nfr-runtime-performance` sets the load-time budget that any change in the number or size of fetched files must stay within; sequential fetch rounds per load count against it.
* **Isolation per load is unchanged** — `cpt-frontx-adr-mfe-load-isolation` holds as written: whatever unit is chosen, only inert source text is shared, never a module instance.
* **Reuse must fail safe** — the runtime consumes published descriptions from origins it does not control; where it cannot establish that two loads share the same content, it must choose no reuse over reuse, because the alternative is foreign code evaluated inside a microfrontend that never declared it.
* **Correctness must not rest on an unverifiable convention** — the runtime cannot assume that third-party producing builds behave identically, so reuse must be tied to something the published description states about what is reused.
* **Independent deployment** — microfrontends ship on their own release trains; reuse must not require a central service or release coordination across microfrontends, and the published manifest contract evolves additively.
* **No FrontX expertise required of microfrontend developers** — a microfrontend developer must not need to curate externals, and FrontX packages and third-party packages must be treated by one rule.
* **Consumer-independent bytes** — the bytes produced for a package at a version must not depend on which microfrontend consumes it, or content-keyed reuse cannot work.
* **Type-system agnostic contract** — the format a producing build emits and the runtime reads must not depend on any type system, schema language or registry.
* **Producer independence** — producing builds are template territory under `cpt-frontx-adr-template-territory-traceability`; the runtime must not depend on any specific producer, and a third-party producer must be able to conform.

## Considered Options

* **Whole-package chunk per consumer, externals chosen by the consumer's shared list.**
* **Whole-package chunk, externals chosen by a curated canonical shared set published per framework version.**
* **Whole-package chunk with every bare import external** — one uniform rule, no inlining across a package boundary.
* **Consumer-independent entry-point chunks on per-entry flat fetch lists** — bundler chunk splitting computed from each package's own complete entry set, with the chunks each entry needs listed ahead of time.
* **A central used-exports service producing one union subset bundle per package** — the server-calculated mode of Module Federation's shared tree shaking.
* **Reuse of an already-loaded subset bundle when it covers the consumer's needs, with fallback otherwise** — the runtime-inferred mode of Module Federation's shared tree shaking.

FrontX microfrontends do not use Module Federation's own shared mechanism, so the last two options could only be adopted as borrowed ideas, not as configuration of an existing dependency. For completeness: `@module-federation/vite` does implement Module Federation Shared Tree Shaking (module-federation/vite#910) — the runtime-inferred mode infers at load time whether an already-loaded subset covers the consumer, and the server-calculated mode asks a central service for the covering bundle — but FrontX MFEs bypass MF sharing entirely, so adopting either mode means borrowing the idea, not enabling a flag. A hybrid of the two was not adopted either: any server-calculated element needs central infrastructure and couples releases across microfrontends.

## Decision Outcome

Chosen option: **consumer-independent entry-point chunks on per-entry flat fetch lists**, because it is the only option that makes a package's bytes independent of the consumer without curation or a central service, rules out duplicate instances of a package inside one load, lets a load fetch only the chunks it needs, and — unlike every finer- or coarser-grained split — does so with the bundler's own chunking so a fetch list replaces runtime graph discovery entirely. Reuse of those chunks is keyed on their content identity, so it happens only between loads that agree on the content being reused.

**Chunk of reuse.** Shared packages are chunked the way Module Federation chunks package entries: one chunk per entry point, with overlapping internals placed in shared internal chunks by deterministic, fixed-setting bundler chunk splitting. A package's entry set is its `exports` subpaths plus every module a public barrel re-exports. Barrel members are split only when provably side-effect-free under the standard bundler semantics — the `sideEffects` field including its globs; when the field is absent, only a barrel proven to be a pure re-export list is split — and otherwise the whole entry's chunk is used, exactly what the consumer's own production build ships, and the build report names the package, the reason and the one-line fix. One rule covers every package; there is no special case for FrontX packages.

**Consumer independence.** A package's chunk boundaries and bytes are computed from that package's own complete entry set, independent of any consumer, so every runtime's chunks of `package@version` are byte-identical. Each build writes into its own `dist` only the chunks its own lists reference; a chunk's bytes never carry path comments or other build-environment text.

**Unit identity and externalization.** A chunk's reuse identity is its content identity. One rule covers every shared package: every bare import in a chunk stays external, and nothing is inlined across a package boundary. Because chunking is consumer-independent, the bytes of a chunk depend only on the package at that version, never on the consumer.

**Loading model — flat fetch lists.** Each build emits one precomputed flat fetch list per entry: each expose, each lazy target, and the shell boot. Each list item carries the chunk's URL, its content identity, the specifiers it answers, and every import edge it carries — bare specifiers and intra-package relative edges recorded as resolved item references, so no edge is derived from source text at mint time. The runtime reads the list — from the manifest, or from boot data embedded inline in the shell boot chunk — fetches every item missing from the realm text cache in one parallel batch, then mints per load in dependency order. There is no runtime graph discovery: the same structure as Module Federation's `remoteEntry.js` plus precomputed chunk lists, with shared items listed by content identity rather than resolved from a share scope by name and version.

**Lazy and pattern imports.** Every literal dynamic-import target — an MFE lazy chunk, a shell lazy chunk, a literal `import()` inside a shared chunk — gets a precomputed fetch list of what it needs beyond its parent chain's lists; on first use that list is fetched and its missing items fetched in one parallel batch and minted into the same load, with concurrent resolutions of one target deduplicated. A pattern import — a template literal with a statically bounded pattern — becomes one list per matching file. Only a fully opaque `import(expr)` stays native; it never fails the build, and it is recorded in the list document's report entries and in the build report with file and line. There is no prefetching by default.

**Version matching.** Each runtime loads exactly the `package@version` it was built with. Identical versions share downloads through the content-identity cache; different versions coexist with their own instances per load. There are no version ranges and no singleton rules at runtime; version drift across runtimes is shown in the build report and the size metric. This differs from Module Federation on purpose: MF picks one compatible registered version and shares its instance, so code can run on a version it was not built against.

**Closure and consumer-scoped resolution.** Every third-party dependency is shared by default; a consumer's shared set is formed as the closure of what its shared chunks import by bare name, so that every bare import a chunk keeps external can be resolved from the loading microfrontend's own declarations. A `share: { exclude: [...] }` opt-out is the only shaping a consumer may apply, and the build rejects it — naming the dependents — when any shared package depends on the excluded one. Hand-written `sharedDeps` lists are not carried over: the set is derived, not curated. The build also fails when the bundled copy's `package.json` version differs from the version the manifest records, or when more than one version of a shared package is reachable from the shared closure. The runtime resolves the bare imports of shared code only from the loading microfrontend's own declarations; realm-wide resolution of source text is rejected because its result would depend on load order, and sharing evaluated instances is rejected because it violates `cpt-frontx-adr-mfe-load-isolation`.

**Identity for reuse.** Reuse is keyed on the content identity of what is shared: the chunk or the whole-package entry that a list item or a manifest references. Two loads reuse source text only when the content identities they declare are identical, so a matching package name and version never authorizes reuse on its own. A key derived from bundling parameters is rejected, because it does not capture what a build actually inlines and would turn a mismatch into silently evaluated foreign code. Entries that carry no content identity, or carry one that is not well formed, are not reused across microfrontends: their reuse is scoped to the resolved absolute location of the entry, which is unique per microfrontend because each microfrontend's asset base location is unique. Such an entry is reused only by repeated loads of the same microfrontend, and the runtime emits a one-time notice naming the dependency and the manifest.

**Format contract.** The ecosystem owns the format a producing build emits and the runtime reads:

* There is one content-addressed fetch-list document per entry. It expresses the entry's flat item list — each item's location, content identity, answered specifiers and import edges carrying every edge needed for dependency-order minting; its lazy-target lists as document references keyed by the lazy target's chunk location, each holding only what the target needs beyond its parent chain's lists; its pattern-import lists keyed by matching file; its opaque-import report entries; and, optionally, the producer and its version.
* Chunks and list documents are all content-addressed, so the content-identity chain runs manifest → list document → chunks.
* A microfrontend's manifest references each entry's fetch-list document by location and content identity. A shell emits no manifest: `vite-plugin-shell` derives the shell's shared set, emits the shell's shared chunks into its own `dist`, and emits a small native boot chunk containing the unit loader plus the inline boot list and the lazy lists embedded in it.
* The manifest records which production rule built its entries, and may give a base location for shared files. A manifest whose entries are whole-package entries is handled as one chunk per entry, reused under that entry's content identity as stated above.
* The concrete schema, the content-identity algorithm and the naming of shared files are contract-shape choices left to the FEATUREs that own the manifest's concrete schema and the runtime's load path.

**Contract home and schema language.** The contract has one definition site: a subpath export `@gears-frontx/mfes/unit-format` of the runtime package, which both the runtime and any producing build import — there is no new ecosystem package for it, and the package DESIGN's API-contracts section records the subpath as sanctioned contract surface. A second sanctioned subpath, `@gears-frontx/mfes/unit-loader`, exposes the runtime's own unit loader — the fetch, verify, realm-cache and mint classes `MfeHandlerMF` itself orchestrates — for a host that loads its shared set the same way a microfrontend does; it reaches no registry, orchestrating handler or mediator module and adds nothing to the root barrel. Fetch-list documents are type-system-neutral JSON build artifacts, typed by TypeScript interfaces in that subpath as the single source. The runtime performs no structural validation of a list document: trust rests on hash verification plus build-time conformance. A required field missing at the point of use fails the load with an `MfeLoadError` naming the file and the producer name and version recorded in it. The `TypeSystemPlugin` mechanism is unchanged; the manifest schema `mf_manifest.v1.json` stays a type-system entity of the existing plugin and gains the fields `cpt-frontx-adr-mfe-asset-discovery` decides.

**Conformance.** The ecosystem ships a conformance suite together with the runtime's published contract, and any producer must pass it; producer CI runs it. The suite is a class, `UnitFormatConformance`, shipped in the same `./unit-format` subpath and bound to no test runner: it takes independent output directories built by the same producer from the same inputs, and returns typed violations. Its checks cover the manifest → list → chunks hash chain; list completeness — every chunk reachable from an entry is on its list and every import edge is answered; the delta property of lazy and pattern lists; consumer independence — two consumers using different subsets of a package produce identical chunks for it; the barrel edge cases — re-export chains, namespace imports, `as default`, side-effectful barrels; and byte identity across the builds. The runtime package ships fixture packages — an ESM package with an import cycle, a CommonJS package, a barrel package, a package imported by subpath — and its own tests check that the runtime loads conforming output. Producer implementations are template territory under `cpt-frontx-adr-template-territory-traceability`. No producer option may change chunk bytes.

**Producers.** The producer implementation the templates ship is an esbuild-based, type-system-agnostic build published as its own package from template territory, while the contract and the suite stay ecosystem-owned here. A producer consumes the contract through type-only imports from `@gears-frontx/mfes/unit-format` — nothing from the runtime package is bundled into it — and pins an exact published version of it as a `devDependency` (a `peerDependency` where its published types expose contract types). Its tests build the fixtures twice and run `UnitFormatConformance`. Local development links the ecosystem checkout only through `npm run dev:template:link`; committed `file:` dependencies are forbidden.

**Fallbacks and reporting.** A barrel that cannot be proven side-effect-free is shipped whole in its entry's chunk — matching what the consumer's own production build already ships — never a build failure. Each producing build emits a per-microfrontend build report covering each shared package's barrel decisions, version drift across runtimes, and every opaque `import(expr)` with file and line. Rollout is gated: a size check compares total shared bytes per microfrontend against the earlier rule, and the load-time behaviour is checked by the gates `cpt-frontx-nfr-runtime-performance` requires — build-time list completeness, a browser round-count gate on the designed sequential rounds, and a relative-timing check under a pinned throttled profile, with failure messages naming the entry, the round count and the item that broke it.

**Byte agreement.** Deterministic output is the obligation of each producing build, and the remedy for disagreement is to make that build's output deterministic, never to weaken the key back toward package name and version. Where two builds meet, a cross-build check confirms that one package version has one content identity for each chunk. At runtime, the runtime warns once per conflicting pair of content identities declared for the same package version and reports the conflict through its diagnostics, so the runtime is the measurer of last resort.

**Scope.** This decision fixes the chunk, its identity, its externalization, the fetch-list loading model, the identity reuse is keyed on, and the contract that describes them. How far the source-text cache reaches, and how it is bounded, are decided in `cpt-frontx-adr-shared-dep-cache-reach`; the published manifest's locating fields are decided in `cpt-frontx-adr-mfe-asset-discovery`.

### Consequences

* Good, because reuse is provably safe rather than coincidentally safe: source text is shared only between loads that declare the same content identity for it.
* Good, because every consumer receives the same bytes for a package at a version, so content-keyed reuse takes effect across microfrontends.
* Good, because no package is inlined twice inside one load, so a load cannot end up with duplicate instances of one package's module-level state.
* Good, because a load fetches only the chunks its entry's list names — one parallel batch, plus one round per lazy target — instead of discovering a graph at runtime.
* Good, because one rule covers FrontX packages and third-party packages alike, and no microfrontend developer curates externals.
* Good, because the contract is type-system agnostic and usable by a producing build that is not one of FrontX's own.
* Good, because the runtime stays correct for entries that carry no content identity: they degrade to same-microfrontend reuse, never to unsafe reuse, and the browser's own location-keyed caching is unaffected.
* Good, because a load runs each runtime on exactly the package versions it was built against, so code never executes on an unexpected version.
* Bad, because every producer must implement the contract and pass the conformance suite before its output is admitted.
* Bad, because a package used by only one microfrontend can get larger in total, since its transitive dependencies become separate chunks instead of inlined subsets, until the list's reach limits what is fetched; a size check therefore gates admission.
* Bad, because cross-microfrontend reuse is available only for entries whose producing build publishes a content identity; an entry without one costs one fetch per microfrontend.
* Bad, because different versions of one package coexist rather than sharing an instance, which is the deliberate cost of version-exact loading.
* Neutral, because whole-package entries and chunked entries coexist within one realm, each reused under its own content identity.

### Confirmation

Compliance is confirmed by contract checks, by producer conformance and by runtime behaviour. The conformance suite passes for each producer against the runtime's published contract. A cross-build check confirms that one package version has one content identity for each chunk wherever two builds meet. The runtime warns once per conflicting pair of content identities declared for the same package version, which makes a non-conforming producer observable in the field. A size check compares the total shared bytes per microfrontend against whole-package delivery of the same packages, and output is admitted only where that check passes. A browser check confirms the designed fetch rounds per entry — data, then one parallel batch, one round per lazy target — and that load to mount stays within the relative-timing gate on the pinned throttled profile.

A schema-conformance check on the published manifest confirms that a content identity on a shared-dependency entry is declared as an optional field, so a manifest that omits it still conforms. A runtime test confirms that two loads declaring a matching content identity for the same shared entry share cached source text, that two loads declaring different content identities for the same name and version do not, and that a load whose entry carries no content identity reuses cached text only against a prior load resolving the identical absolute location. A further test confirms that an unrewritten reference is never masked. When the surviving specifier is one the manifest declared, even a coincidental cross-microfrontend match on a resolved location surfaces as a diagnosed load failure naming the chunk and the microfrontend. Otherwise it surfaces as a diagnostic naming the chunk and the microfrontend alongside the browser's own instantiation failure.

In the present concrete instantiation, the content identity of a whole-package entry is grounded in three places. The published manifest's JSON Schema (`packages/gts-plugin/src/frontx.mfes/schemas/mfe/mf_manifest.v1.json`) declares `contentHash` on the shared-dependency item and omits it from that item's `required` list. The manifest type `MfManifest` (`packages/mfes/src/manifest/mf-manifest.ts`) carries the matching optional `contentHash` field. The two-tier key in `MfeHandlerMF` (`packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`) keys reuse on `name@version@contentHash` when the entry declares a well-formed hash, and on `name@version@<resolved chunk URL>` when it declares none or a malformed one. The fetch-list types live in `packages/mfes/src/unit-format/fetch-list.ts`.

## Pros and Cons of the Options

### Consumer-independent entry-point chunks on per-entry flat fetch lists

One chunk per package entry point plus shared internal chunks, computed from the package's own complete entry set, every bare import external, described by a content-addressed flat fetch list per entry.

* Good, because chunk bytes depend only on the package at that version, so content-keyed reuse works across consumers.
* Good, because no package is inlined anywhere, so no package can be evaluated twice inside one load.
* Good, because a load fetches only the chunks its list names, in one parallel batch, with no runtime graph discovery.
* Good, because it needs no curation and no central service, and it treats every package by one rule.
* Good, because bundler chunk splitting is the same machinery the consumer's own production build already runs, so "provably side-effect-free" skips exactly what that build already skips.
* Bad, because splitting is bound by what the bundler can prove side-effect-free, so a package with an opaque barrel is delivered coarser than its used modules.
* Bad, because the list documents add a small typed surface the contract must fix and producers must emit.

### Whole-package chunk per consumer, externals chosen by the consumer's shared list

Each microfrontend's build emits one chunk per shared package, inlining whatever that microfrontend does not itself share.

* Good, because it needs no list and no contract.
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

`cpt-frontx-adr-mfe-load-isolation` is unaffected: a chunk is inert source text that each load rewrites and evaluates for itself, exactly as a whole-package entry is, and every load mints its own isolated module graph whether its source text came from the cache or from a fresh fetch. `cpt-frontx-adr-lazy-import-resolution` governs a microfrontend's own lazily imported chunks; shared chunks are shared-dependency code and do not change how lazy chunks are resolved — a literal `import()` inside a shared chunk is served through its own nested fetch list. `cpt-frontx-adr-mfe-asset-discovery` declares the published manifest's field names and shapes descriptive and non-binding, and the fields this decision relies on are additive and optional. `cpt-frontx-constraint-mfes-realm-shared-dep-cache` holds: the format contract is carried in manifest and list-document data, and the runtime's public surface gains no exported symbol, capability method or constructor argument. The reach, the realm rendezvous, the lifetime and the bound of the source-text cache are those of `cpt-frontx-adr-shared-dep-cache-reach`.

The contract is owned by the ecosystem under `cpt-frontx-adr-core-package-boundaries`, which keeps the runtime package free of any dependency on a producing build. Producer implementations are template territory under `cpt-frontx-adr-template-territory-traceability` and ship on their own release trains. The conformance suite, not a named producer, is what admits a producing build's output.

The published manifest's concrete field-level schema has no FEATURE that owns it by name under `cpt-frontx-adr-contract-schema-ownership`. This decision does not assign that ownership; closing that gap is a separate decision.

**Review trigger.** Revisit this decision if the conformance suite cannot be met by a widely used producer without changing chunk bytes; if the size check shows sustained growth for single-consumer packages that the lists' reach does not recover; if the round-count or relative-timing gates show the loading model exceeding its designed behaviour in compositions the platform must support; if independently produced builds of the same package version cannot be made to agree on content identity at a rate that makes content-keyed reuse worthwhile; or if the published manifest's shared-dependency shape changes backward-incompatibly.

**Checklist applicability.** ARCH — applicable and addressed above: this decision fixes the chunk, the reuse identity, the fetch-list loading model and the producer contract that every composed application's loading path depends on, and reversing it after producers adopt the contract would be costly. INT — applicable and addressed above: the fetch list and the manifest fields are the integration contract between a producing build and the runtime, they are additive and optional, and conformance is established by the ecosystem's suite rather than by a named producer. SEC — applicable and addressed above: reuse is keyed on declared content identity and fails safe to same-microfrontend scope where none is declared, so one microfrontend's declared trust boundary is never widened by evaluating another microfrontend's code; the conflicting-identity warning is fail-safe, and a load still resolves bare imports only from its own microfrontend's declarations. The runtime verifies every fetched list document and chunk against its declared content identity before it is used or cached, as decided in `cpt-frontx-adr-mfe-asset-discovery`; a mismatch fails the load and is reported. REL — applicable and addressed above: isolation per load is preserved under `cpt-frontx-adr-mfe-load-isolation`, a wrong reuse surfaces as a diagnosed load failure rather than as silently evaluated foreign code, and whole-package entries and chunked entries coexist within one realm. PERF — applicable and addressed above: the loading model's designed rounds are gated explicitly, and transfer, evaluation and memory are governed by `cpt-frontx-nfr-resource-efficiency`. DATA — Not applicable, because no durable data is stored and no complete schema is fixed by this decision. OPS — Not applicable, because no deployed-service operational procedure is governed by this decision. COMPL — Not applicable, because no regulated data is processed. UX — Not applicable, because this decision shapes no rendered output. MAINT — applicable and addressed above: the contract's single definition site keeps the reader and every producer aligned on one published surface, and template-territory producers evolve on their own release trains behind the conformance suite. TEST — applicable and addressed above: the conformance suite, the cross-build byte check, the runtime conflict warning and the load gates are the verification this decision rests on. BIZ — Not applicable, because no product requirement is decided here.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-nfr-resource-efficiency` — consumer-independent chunks let shared code be transferred at most once and fetched only where listed, and the conflicting-identity warning and the size check make the outcome observable.
* `cpt-frontx-nfr-runtime-performance` — the cross-microfrontend source-text cache this NFR's mechanism describes is keyed on content identity so that its benefit is safe, and the loading model's fetch rounds are admitted only within the round-count and relative-timing gates.
* `cpt-frontx-nfr-security` — the fail-safe scoping of entries that carry no content identity is the concrete instance, for this cache, of the default-deny posture this NFR requires: a microfrontend gains no capability to receive another microfrontend's code without a declared match.
* `cpt-frontx-fr-mfe-runtime-registration` — on-demand loading reads locating facts exclusively from the published manifest's declared fields; this decision extends that manifest-sourced posture to the reuse decision and to the fetch lists a manifest references.
* `cpt-frontx-component-mfe-runtime` — this decision constrains how the MFE Runtime component establishes the identity of the shared code it reuses and resolves the bare imports of that code.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — the realm cache shares only source text and the public surface does not grow; its bound is decided in `cpt-frontx-adr-shared-dep-cache-reach`.
