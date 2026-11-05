---
status: accepted
date: 2026-11-03
description: "Decides that microfrontends reuse shared-dependency code as content-identified, consumer-independent units, one per strongly connected component of a package's own module graph with every bare import external, under an ecosystem-owned format contract."
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
  - [Module-level units with every bare import external](#module-level-units-with-every-bare-import-external)
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

The runtime behaviour that frames this is visible in the loading path of `packages/mfes/src/handler/mfe-handler-mf/`, where the shared-dependency blobs are built. Bare imports inside shared code are rewritten only against the loading microfrontend's own shared list, every declared shared entry is fetched, and each entry becomes one blob that is evaluated whole. Per-instance isolation, `cpt-frontx-adr-mfe-load-isolation`, is a given and is not reopened here: only source text is ever shared, and every load builds its own module instances over it.

How should microfrontends reuse shared-dependency code, so that reuse happens only between loads that agree on what is reused, the bytes for a package at a version are the same for every consumer, and a load evaluates only what it needs?

## Decision Drivers

* **Resource efficiency** — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once, that only what is required be evaluated, that memory stay bounded, and that the outcome be observable.
* **Load latency** — `cpt-frontx-nfr-runtime-performance` sets the load-time budget that any change in the number or size of fetched files must stay within.
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
* **Module-level units with every bare import external.**
* **A central used-exports service producing one union subset bundle per package** — the server-calculated mode of Module Federation's shared tree shaking.
* **Reuse of an already-loaded subset bundle when it covers the consumer's needs, with fallback otherwise** — the runtime-inferred mode of Module Federation's shared tree shaking.

FrontX microfrontends do not use Module Federation's own shared mechanism, so the last two options could only be adopted as borrowed ideas, not as configuration of an existing dependency. For completeness: `@module-federation/vite` does implement Module Federation Shared Tree Shaking (module-federation/vite#910) — the runtime-inferred mode infers at load time whether an already-loaded subset covers the consumer, and the server-calculated mode asks a central service for the covering bundle — but FrontX MFEs bypass MF sharing entirely, so adopting either mode means borrowing the idea, not enabling a flag. A hybrid of the two was not adopted either: any server-calculated element needs central infrastructure and couples releases across microfrontends.

## Decision Outcome

Chosen option: **module-level units with every bare import external**, because it is the only option that makes a package's bytes independent of the consumer without curation or a central service, rules out duplicate instances of a package inside one load, and allows evaluation to be limited to the units a load actually reaches. Reuse of those units is keyed on their content identity, so it happens only between loads that agree on the content being reused.

**Unit of reuse.** For an ESM package, one unit is one strongly connected component of the package's own module graph. That is a single module unless the module is part of an import cycle, in which case the whole cycle is one unit, because a cycle admits no order in which its members could be delivered separately. A CommonJS package, or a package published as one pre-bundled file, is one unit.

**Unit identity.** A unit is identified by the package name, the package version, and the module path or paths it contains.

**Externalization.** One rule covers every shared package: every bare import in a unit stays external, and nothing is inlined across a package boundary; there is no curated set of packages the rule does not reach. Within a side-effect-free package, meaning one that declares `sideEffects` accordingly, a producing build resolves the package's internal imports of its own barrel modules to the modules that define the imported bindings. For a package that does not declare it, internal imports stay as written. Both rules are properties of the package, so the bytes of a unit depend only on the package at that version, never on the consumer.

**Barrels.** The same barrel treatment applies on the consumer side: a consuming build rewrites a named import from a package's barrel module to the module that defines the imported binding, but only for packages that declare side-effect freedom — an explicit side-effect import is never rewritten. A per-package `exclude` escape hatch lets a producing or consuming build keep a named package's barrels as written, and the build report lists every barrel that was bypassed. There is no FrontX-specific side-effect rule or contract beyond this: every package is handled by the same barrel rule, and the obligation on FrontX's own packages is an implementation task — each publishes an accurate `sideEffects` field, an explicit file list where a module has import-time effects.

**Closure.** Every third-party dependency is shared by default; a consumer's shared set is formed as the closure of what its shared units import by bare name, so that every bare import a unit keeps external can be resolved from the loading microfrontend's own declarations. A `share: { exclude: [...] }` opt-out is the only shaping a consumer may apply, and the build rejects it — naming the dependents — when any shared package depends on the excluded one. Hand-written `sharedDeps` lists are not carried over: the set is derived, not curated. The build also fails when the bundled copy's `package.json` version differs from the version the manifest records, or when more than one version of a shared package is reachable from the shared closure.

**Consumer-scoped resolution.** The runtime resolves the bare imports of shared code only from the loading microfrontend's own declarations. Two alternatives are rejected. Realm-wide resolution of source text is rejected because its result would depend on load order. Sharing evaluated instances is rejected because it violates `cpt-frontx-adr-mfe-load-isolation`.

**Identity for reuse.** Reuse is keyed on the content identity of what is shared: the graph file, the unit, the pack or the whole-package entry that a manifest references. Two loads reuse source text only when the content identities they declare are identical, so a matching package name and version never authorizes reuse on its own. A key derived from bundling parameters is rejected as well, because it does not capture what a build actually inlines and would turn a mismatch into silently evaluated foreign code. Entries that carry no content identity, or carry one that is not well formed, are not reused across microfrontends: their reuse is scoped to the resolved absolute location of the entry, which is unique per microfrontend because each microfrontend's asset base location is unique. Such an entry is reused only by repeated loads of the same microfrontend, and the runtime emits a one-time notice naming the dependency and the manifest.

**Format contract.** The ecosystem owns the format a producing build emits and the runtime reads:

* There is one content-addressed graph file per package version. It expresses the package's units; each unit's content identity; each unit's bare imports and relative imports; which module paths belong to which unit; whether the package is split into units or delivered as a single unit, and why; the producer and its version; and, optionally, a whole-package pack with its own content identity.
* Units, packs and graph files are all content-addressed.
* A microfrontend's manifest references each shared package's graph file by location and content identity, and states that package's package-level bare requirements.
* The manifest records which production rule built its entries, and may give a base location for shared files. A manifest whose entries are whole-package entries is handled as one unit per entry, reused under that entry's content identity as stated above.
* The concrete schema, the content-identity algorithm and the naming of shared files are contract-shape choices left to the FEATUREs that own the manifest's concrete schema and the runtime's load path.

**Contract home and schema language.** The contract has one definition site: a subpath export `@gears-frontx/mfes/unit-format` of the runtime package, which both the runtime and any producing build import — there is no new ecosystem package for it, and the package DESIGN's API-contracts section records the subpath as sanctioned contract surface. Graph files are type-system-neutral JSON build artifacts, typed by TypeScript interfaces in that subpath as the single source. The runtime performs no structural validation of a graph file — its structural type guard on graph files is removed with validation — and there is no graph schema expressed in any type system: trust rests on hash verification plus build-time conformance. A required field missing at the point of use fails the load with an `MfeLoadError` naming the file and the producer name and version recorded in it. The `TypeSystemPlugin` mechanism and the type-system-agnostic driver this decision's format rests on are unchanged; the manifest schema `mf_manifest.v1.json` stays a type-system entity of the existing plugin and gains the fields `cpt-frontx-adr-mfe-asset-discovery` decides — a graph-file reference and package-level requirements per shared entry, roots per exposed entry and per lazily loaded chunk, the production-rule marker and the shared base location.

**Conformance.** The ecosystem ships a conformance suite together with the runtime's published contract, and any producer must pass it; producer CI runs it. The suite is a class, `UnitFormatConformance`, shipped in the same `./unit-format` subpath and bound to no test runner: it takes two independent output directories built by the same producer from the same inputs, and returns typed violations. Its checks cover the naming of units, packs and graph files; the hash chain from manifest to graph file to units and packs; the closure of each package's declared requirements; resolution of intra-package relative imports; and byte identity across the two builds. The runtime package ships fixture packages — an ESM package with an import cycle, a CommonJS package, a barrel package, a package imported by subpath — and its own tests check that the runtime loads conforming output. Producer implementations are template territory under `cpt-frontx-adr-template-territory-traceability`. No producer option may change unit bytes.

**Producers.** The producer implementation the templates ship is an esbuild-based, type-system-agnostic build published as its own package from template territory, while the contract and the suite stay ecosystem-owned here. A producer consumes the contract through type-only imports from `@gears-frontx/mfes/unit-format` — nothing from the runtime package is bundled into it — and pins an exact published version of it as a `devDependency` (a `peerDependency` where its published types expose contract types). Its tests build the fixtures twice and run `UnitFormatConformance`. Local development links the ecosystem checkout only through `npm run dev:template:link`; committed `file:` dependencies are forbidden.

**Fallbacks and reporting.** A package that cannot be split becomes one unit; a package whose barrel cannot be skipped is evaluated through it. Each producing build emits a per-microfrontend build report covering each shared package's unit mode and barrel mode, reachable bytes against total bytes, and the reason for every fallback; each unit's mode is recorded in the graph file for runtime diagnostics. Rollout is gated: unit delivery ships only behind a size gate comparing total shared bytes per microfrontend against the earlier rule, together with the load-time gate that `cpt-frontx-nfr-runtime-performance` requires.

**Byte agreement.** Deterministic output is the obligation of each producing build, and the remedy for disagreement is to make that build's output deterministic, never to weaken the key back toward package name and version. Where two builds meet, a cross-build check confirms that one package version has one content identity for each unit. At runtime, the runtime warns once per conflicting pair of content identities declared for the same package version and reports the conflict through its diagnostics, so the runtime is the measurer of last resort.

**Scope.** This decision fixes the unit, its identity, its externalization, the identity reuse is keyed on, and the contract that describes them. Which units a load reaches, and which files it reads and fetches, are decided in `cpt-frontx-adr-mfe-asset-discovery`. How far the source-text cache reaches, and how it is bounded, are decided in `cpt-frontx-adr-shared-dep-cache-reach`.

### Consequences

* Good, because reuse is provably safe rather than coincidentally safe: source text is shared only between loads that declare the same content identity for it.
* Good, because every consumer receives the same bytes for a package at a version, so content-keyed reuse takes effect across microfrontends.
* Good, because no package is inlined twice inside one load, so a load cannot end up with duplicate instances of one package's module-level state.
* Good, because a load can evaluate only the units it reaches instead of every package whole.
* Good, because one rule covers FrontX packages and third-party packages alike, and no microfrontend developer curates externals.
* Good, because the contract is type-system agnostic and usable by a producing build that is not one of FrontX's own.
* Good, because the runtime stays correct for entries that carry no content identity: they degrade to same-microfrontend reuse, never to unsafe reuse, and the browser's own location-keyed caching is unaffected.
* Bad, because a load fetches and prepares many more files than a load of whole-package entries does. The cost is gated by the load-time budget of `cpt-frontx-nfr-runtime-performance`, and the optional whole-package pack exists as a fallback where splitting does not pay.
* Bad, because CommonJS packages and pre-bundled packages stay whole, so they gain consumer independence but no reduction in evaluated code.
* Bad, because grouping by import cycle enlarges some units, in the worst case to the size of the whole package.
* Bad, because graph files add one fetch per package version, although that fetch is cached and content-addressed like any other shared file.
* Bad, because the chosen unit produces many small source-text entries per load, so the realm cache's bound must remain effective for many small entries.
* Bad, because every producer must implement the contract and pass the conformance suite before its unit output is admitted.
* Bad, because a package used by only one microfrontend can get larger in total, since its transitive dependencies become separate whole units instead of inlined subsets, until reachability limits what is evaluated; a size check therefore gates admission of unit output.
* Bad, because cross-microfrontend reuse is available only for entries whose producing build publishes a content identity; an entry without one costs one fetch per microfrontend.
* Neutral, because whole-package entries and unit entries coexist within one realm, each reused under its own content identity.

### Confirmation

Compliance is confirmed by contract checks, by producer conformance and by runtime behaviour. The conformance suite passes for each producer against the runtime's published contract. A cross-build check confirms that one package version has one content identity for each unit wherever two builds meet. The runtime warns once per conflicting pair of content identities declared for the same package version, which makes a non-conforming producer observable in the field. A size check compares the total shared bytes per microfrontend under unit delivery against whole-package delivery of the same packages, and unit output is admitted only where that check passes. A load-time check confirms that the larger number of units stays within the budget of `cpt-frontx-nfr-runtime-performance`.

A schema-conformance check on the published manifest confirms that a content identity on a shared-dependency entry is declared as an optional field, so a manifest that omits it still conforms. A runtime test confirms that two loads declaring a matching content identity for the same shared entry share cached source text, that two loads declaring different content identities for the same name and version do not, and that a load whose entry carries no content identity reuses cached text only against a prior load resolving the identical absolute location. A further test confirms that an unrewritten reference is never masked. When the surviving specifier is one the manifest declared, even a coincidental cross-microfrontend match on a resolved location surfaces as a diagnosed load failure naming the chunk and the microfrontend. Otherwise it surfaces as a diagnostic naming the chunk and the microfrontend alongside the browser's own instantiation failure.

In the present concrete instantiation, the content identity of a whole-package entry is grounded in three places. The published manifest's JSON Schema (`packages/gts-plugin/src/frontx.mfes/schemas/mfe/mf_manifest.v1.json`) declares `contentHash` on the shared-dependency item and omits it from that item's `required` list. The manifest type `MfManifest` (`packages/mfes/src/manifest/mf-manifest.ts`) carries the matching optional `contentHash` field. The two-tier key in `MfeHandlerMF` (`packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`) keys reuse on `name@version@contentHash` when the entry declares a well-formed hash, and on `name@version@<resolved chunk URL>` when it declares none or a malformed one.

## Pros and Cons of the Options

### Module-level units with every bare import external

One unit per strongly connected component of a package's own module graph, every bare import external, described by a content-addressed graph file per package version.

* Good, because unit bytes depend only on the package at that version, so content-keyed reuse works across consumers.
* Good, because no package is inlined anywhere, so no package can be evaluated twice inside one load.
* Good, because evaluation can be limited to the units a load reaches.
* Good, because it needs no curation and no central service, and it treats every package by one rule.
* Bad, because the number of units per load grows substantially, which costs fetches and preparation time.
* Bad, because CommonJS packages and import cycles limit how fine the split can be.

### Whole-package chunk per consumer, externals chosen by the consumer's shared list

Each microfrontend's build emits one chunk per shared package, inlining whatever that microfrontend does not itself share.

* Good, because it needs no graph file and no unit contract.
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
* Bad, because transitive dependencies become whole-package units of their own, so total size can grow for packages that only one microfrontend consumes, with no reachability to offset it.

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

`cpt-frontx-adr-mfe-load-isolation` is unaffected: a unit is inert source text that each load rewrites and evaluates for itself, exactly as a whole-package entry is, and every load mints its own isolated module graph whether its source text came from the cache or from a fresh fetch. `cpt-frontx-adr-lazy-import-resolution` governs a microfrontend's own lazily imported chunks; units are shared-dependency code and do not change how lazy chunks are resolved. `cpt-frontx-adr-mfe-asset-discovery` declares the published manifest's field names and shapes descriptive and non-binding, and the fields this decision relies on are additive and optional. `cpt-frontx-constraint-mfes-realm-shared-dep-cache` holds: the format contract is carried in manifest and graph-file data, and the runtime's public surface gains no exported symbol, capability method or constructor argument. The reach, the realm rendezvous, the lifetime and the bound of the source-text cache are those of `cpt-frontx-adr-shared-dep-cache-reach`, whose bound must remain effective for the many small entries units produce.

The contract is owned by the ecosystem under `cpt-frontx-adr-core-package-boundaries`, which keeps the runtime package free of any dependency on a producing build. Producer implementations are template territory under `cpt-frontx-adr-template-territory-traceability` and ship on their own release trains. The conformance suite, not a named producer, is what admits a producing build's output.

The published manifest's concrete field-level schema has no FEATURE that owns it by name under `cpt-frontx-adr-contract-schema-ownership`. This decision does not assign that ownership; closing that gap is a separate decision.

**Review trigger.** Revisit this decision if the conformance suite cannot be met by a widely used producer without changing unit bytes; if the size check shows sustained growth for single-consumer packages that reachability does not recover; if the load-time check shows the unit count exceeding the budget in compositions the platform must support; if independently produced builds of the same package version cannot be made to agree on content identity at a rate that makes content-keyed reuse worthwhile; or if the published manifest's shared-dependency shape changes backward-incompatibly.

**Checklist applicability.** ARCH — applicable and addressed above: this decision fixes the unit, the reuse identity and the producer contract that every composed application's loading path depends on, and reversing it after producers adopt the contract would be costly. INT — applicable and addressed above: the graph file and the manifest fields are the integration contract between a producing build and the runtime, they are additive and optional, and conformance is established by the ecosystem's suite rather than by a named producer. SEC — applicable and addressed above: reuse is keyed on declared content identity and fails safe to same-microfrontend scope where none is declared, so one microfrontend's declared trust boundary is never widened by evaluating another microfrontend's code; the conflicting-identity warning is fail-safe, and a load still resolves bare imports only from its own microfrontend's declarations. The runtime verifies every fetched graph file, unit and pack against its declared content identity before it is used or cached, as decided in `cpt-frontx-adr-mfe-asset-discovery`; a mismatch fails the load and is reported. REL — applicable and addressed above: isolation per load is preserved under `cpt-frontx-adr-mfe-load-isolation`, a wrong reuse surfaces as a diagnosed load failure rather than as silently evaluated foreign code, and whole-package entries and unit entries coexist within one realm. PERF — applicable and addressed above: the larger number of units per load is admitted only within the load-time budget of `cpt-frontx-nfr-runtime-performance`, and transfer, evaluation and memory are governed by `cpt-frontx-nfr-resource-efficiency`. DATA — Not applicable, because no durable data is stored and no complete schema is fixed by this decision. OPS — Not applicable, because no deployed-service operational procedure is governed by this decision. COMPL — Not applicable, because no regulated data is processed. UX — Not applicable, because this decision has no user interface; its consequence is a microfrontend mounting correctly, which is addressed under REL. BIZ — Not applicable, because no business rule changes.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-nfr-resource-efficiency` — consumer-independent units let shared code be transferred at most once and evaluated only where reached, and the conflicting-identity warning and the size check make the outcome observable.
* `cpt-frontx-nfr-runtime-performance` — the cross-microfrontend source-text cache this NFR's mechanism describes is keyed on content identity so that its benefit is safe, and the larger number of units per load is admitted only within this NFR's load-time budget, with the whole-package pack as fallback.
* `cpt-frontx-nfr-security` — the fail-safe scoping of entries that carry no content identity is the concrete instance, for this cache, of the default-deny posture this NFR requires: a microfrontend gains no capability to receive another microfrontend's code without a declared match.
* `cpt-frontx-fr-mfe-runtime-registration` — on-demand loading reads locating facts exclusively from the published manifest's declared fields; this decision extends that manifest-sourced posture to the reuse decision and to the graph files a manifest references.
* `cpt-frontx-component-mfe-runtime` — this decision constrains how the MFE Runtime component establishes the identity of the shared code it reuses and resolves the bare imports of that code.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — the realm cache shares only source text and the public surface does not grow; its bound, decided in `cpt-frontx-adr-shared-dep-cache-reach`, must remain effective for many small entries.
