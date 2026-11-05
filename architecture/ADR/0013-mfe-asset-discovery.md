---
status: accepted
date: 2026-11-03
description: "Decides that each microfrontend load discovers what it reads and fetches — its assets and the shared-dependency units its entry reaches — from the published manifest the microfrontend owns, fetching only reachable units, in parallel with the entry's own chunks and verified against their declared content identity."
---

# MFE Asset Discovery


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Enriched-manifest-driven discovery](#enriched-manifest-driven-discovery)
  - [Runtime remote-entry parsing](#runtime-remote-entry-parsing)
  - [Host-maintained entry maps](#host-maintained-entry-maps)
  - [Fetch every declared shared entry](#fetch-every-declared-shared-entry)
  - [Runtime reachability discovery by chunk scanning](#runtime-reachability-discovery-by-chunk-scanning)
  - [Manifest-declared roots plus graph files](#manifest-declared-roots-plus-graph-files)
  - [Per-unit requests](#per-unit-requests)
  - [One whole-package pack per package, always](#one-whole-package-pack-per-package-always)
  - [Deployment-wide union packs](#deployment-wide-union-packs)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mfe-asset-discovery`
## Context and Problem Statement

To load a microfrontend the runtime must discover where its chunk assets live, which file backs each exposed entry, which stylesheets that entry needs, and which shared-dependency code the entry depends on. That locating information can be obtained by reading a structured description a microfrontend publishes about itself, by fetching and parsing the microfrontend's compiled output to recover the same facts, or by bookkeeping kept outside the microfrontend.

Shared-dependency code is delivered as content-identified units described by one graph file per package version, under the unit of reuse and the format contract decided in `cpt-frontx-adr-shared-dep-reuse`. A load needs only the units its entry actually reaches. Fetching every declared shared entry transfers code the entry never uses. Discovering reachability by first fetching and scanning the entry's chunks puts a second round of requests behind the first. Either cost lands on the load-time budget and on the transfer the platform aims to keep minimal.

How should the runtime obtain the information it needs to locate a microfrontend's assets and to determine, before fetching, exactly which shared code one load must fetch — so that the source of that information is a stable, declared contract rather than a bundler's internal artifact, and the load completes in a single fetch round?

## Decision Drivers

* A declared, stable locating contract — the information the runtime needs to find a microfrontend's assets and shared code must come from an explicitly published, versioned description, so it is durable against changes in how a microfrontend is compiled (anchors `cpt-frontx-contract-template-manifest`).
* Substrate and bundler neutrality — discovery must not depend on the internal structure of any particular bundler's compiled output, so a microfrontend built with any conforming toolchain can be loaded (anchors `cpt-frontx-fr-mfe-runtime-registration`).
* Completeness for an isolated load — the description must carry everything an isolated load needs: the base location for assets, the file backing each exposed entry, the entry's stylesheet assets, the full set of shared-dependency declarations in a stable **enumeration order**, and the facts that determine which shared code the entry reaches — so a load needs no out-of-band lookup. That enumeration order fixes only the sequence in which a consumer visits the declarations; it is neither a fetch order nor a dependency order. Resolving the declarations leaves-first is the consumer's own pass over the sources it fetches, which is where dependency-order correctness and circular-dependency handling are decided (`cpt-frontx-adr-mfe-load-isolation`).
* Resource efficiency — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once, that only what is required be fetched and evaluated, and that the outcome be observable.
* Load latency — `cpt-frontx-nfr-runtime-performance` sets the load-time budget; the number of fetch rounds and the number and size of requests a load makes must stay within it.
* Verifiable content — code fetched from origins the runtime does not control must match the content identity its description declares before it is used or cached (`cpt-frontx-nfr-security`).
* Robust, low-ambiguity extraction — obtaining locating facts must not rely on pattern-matching compiled output, where minification or bundler-version drift can silently change the shapes being matched.
* Producer/consumer symmetry — the same description is produced when a microfrontend is validated for publication and consumed when it is loaded, so producer and consumer share one versioned shape.
* Zero public-surface growth — discovery must not add an exported symbol, capability method or constructor argument to the runtime (`cpt-frontx-constraint-mfes-realm-shared-dep-cache`).

## Considered Options

Discovery source:

* **Enriched-manifest-driven discovery** — the runtime locates and loads a microfrontend from a published, enriched manifest that carries the asset base location, per-entry asset records, the shared-dependency declarations in the enumeration order the completeness driver fixes, and the shared-code reachability facts; the manifest is the single declared contract for discovery.
* **Runtime remote-entry parsing** — the runtime fetches the microfrontend's compiled remote-entry module at load time and recovers the locating facts by parsing that bundler-emitted output.
* **Host-maintained entry maps** — the host application carries a hardcoded map from each microfrontend to its asset locations, maintained outside any artifact the microfrontend itself publishes.

Shared-code reachability:

* **Fetch every declared shared entry** — the load fetches every shared entry its manifest declares, whatever its entry uses.
* **Runtime reachability discovery by chunk scanning** — the load first fetches the entry's chunks, scans them for the shared code they import, and then fetches what was found, in a two-step waterfall.
* **Manifest-declared roots plus graph files** — the manifest states which shared code each exposed entry and each lazily loaded chunk reaches directly, and the runtime closes that set over the packages' graph files before fetching.

Fetch granularity:

* **Per-unit requests** — one request per reachable unit.
* **One whole-package pack per package, always** — every package used by a load is fetched as its whole-package pack.
* **Deployment-wide union packs** — one pack per package covering the union of what the microfrontends deployed together reach.

## Decision Outcome

Chosen options: **enriched-manifest-driven discovery**, with **manifest-declared roots plus graph files** for shared-code reachability and **per-unit requests** as the fetch granularity, because together they source every locating and reachability fact from a stable, published, versioned contract owned by the microfrontend, let a load fetch only the shared code it reaches, and complete that fetch in a single round.

**Assets.** The runtime reads the manifest's asset base location and resolves every relative chunk reference against it, and reads the backing file and stylesheet assets for the exposed entry from the manifest's per-entry asset record. It reads the shared-dependency declarations the isolated load needs in the enumeration order the completeness driver fixes. A single declared description supplies everything one isolated load requires, with no parsing of compiled output and no out-of-band lookup.

**Shared code.** The manifest references each shared package's graph file by location and content identity — the graph-file path and its hash — as the format contract of `cpt-frontx-adr-shared-dep-reuse` provides. There is one content-addressed graph file per package version, located next to that package's units; the entry-level content identity a shared declaration carried moves into the graph file, which records each unit's hash. Each shared entry may also state a package-level `requires` list — the bare names its units import — taken from the build's module metadata. When `requires` is present the runtime checks closure before fetching: every name a package requires must itself be declared, and a miss fails the load with an error naming the missing packages. When it is absent the runtime falls back to the heuristic closure warning it issues for declared sets. The manifest states, per exposed entry, the shared code that entry's static imports reach directly — the entry's roots — and, separately, per lazily loaded chunk, the shared code that chunk reaches directly. The producing plugin derives each root from the bundler's output graph — the static imports after the barrel rewrite `cpt-frontx-adr-shared-dep-reuse` decides — and manifest aggregation carries the field through unchanged. Shared-file locations resolve against the manifest's optional shared base location `sharedBase` when one is given, and otherwise relative to the microfrontend.

**Location.** Each microfrontend ships its own copies of shared files by default. A deployment may instead publish them to a common content-addressed store — written put-if-absent and never overwritten — and record the store's location in the manifest's `sharedBase` ecosystem field; without it, every shared-file reference resolves relative to the microfrontend. The template shell's own deployment uses a `dist/frontx-shared/` store of that kind.

**Naming.** Shared files are named by content: units as `<package>@<version>/<unit-path>.<hash>.js`, packs as `<package>@<version>.pack.<hash>.js`, graph files as `<package>@<version>.graph.<hash>.json`. The hash chain runs manifest to graph file to units and packs: the manifest declares the graph file's identity, the graph file declares each unit's and the pack's, so no fetched byte is trusted beyond what the declared identity covers. Entries produced under the earlier production rule keep that rule's chunk naming, and the manifest records which rule built its entries in `sharedChunkRule`.

**Reachable set.** From an entry's roots and the graph files, the runtime determines the reachable units before fetching any of them, and fetches only those, in parallel with the entry's own chunks, one request per reachable unit. Units reached by a lazily loaded chunk are determined and fetched when that chunk loads; how a lazily loaded chunk binds into the load is decided in `cpt-frontx-adr-lazy-import-resolution`.

**Fallbacks.** When a manifest carries no roots, the runtime fetches every declared shared entry, as it does for entries without a graph file, and reports through its diagnostics that it did so. Where the per-unit strategy does not meet the load-time budget of `cpt-frontx-nfr-runtime-performance`, the runtime may fetch a package's whole-package pack instead of its units, chosen per package: the pack is the whole package, produced at build time next to the units and the graph file, its bytes depending only on the package at that version, and listed in the graph file with its hash. There are no deployment-wide union packs. Either way, only reached units are evaluated.

**Integrity.** Every fetched graph file, unit and pack is checked against its declared SHA-256 content identity before it is used or cached, regardless of which store served it. A mismatch fails the load with an error naming the file and both the declared and the computed hashes, is reported through the runtime's diagnostics, and mismatching text is never cached. Entries under the earlier production rule that carry no well-formed hash keep their unchecked behaviour, scoped as `cpt-frontx-adr-shared-dep-reuse` decides.

**Rollout compatibility.** The change is purely additive: `requires`, roots, the graph-file reference and `sharedBase` are optional, and the closure check runs only where `requires` is declared. `sharedChunkRule` lets the runtime compare like with like: content-identity mismatch warnings compare only entries built under the same rule, and a mismatch between an old-rule and a new-rule entry is summarized once per page rather than warned per pair. The producing plugins ship in minor versions and the runtime ships in a minor version of `@gears-frontx/mfes`, compatible in both directions.

**Early loading.** The manifest-driven path is the only discovery path. An extension that needs to load early dispatches its own load action at its init lifecycle stage; there is no separate prefetch interface, so the runtime's public surface does not grow (`cpt-frontx-constraint-mfes-realm-shared-dep-cache`).

Because the manifest is the contract published when a microfrontend is validated and consumed when it is loaded, producer and consumer share one versioned shape, and compatibility of that shape follows `cpt-frontx-nfr-evolvability`. Handler selection — which handler services a given microfrontend entry — is decided separately in `cpt-frontx-adr-mfe-handler-resolution`; this decision fixes only that, whichever handler is selected, discovery is manifest-driven.

### Consequences

* Good, because the runtime depends on a declared, versioned contract rather than on bundler-internal output, so discovery survives changes in how a microfrontend is compiled.
* Good, because discovery is bundler- and substrate-neutral: any conforming toolchain that emits the manifest shape can be loaded.
* Good, because the manifest carries everything an isolated load needs, so a load requires no secondary parse or out-of-band lookup.
* Good, because a load downloads no shared code its entry does not reach, which serves `cpt-frontx-nfr-resource-efficiency`.
* Good, because the reachable set is known before any fetch, so shared units and the entry's own chunks are fetched in a single parallel round with no waterfall.
* Good, because every graph file, unit and pack is verified against its declared content identity before use or caching, so mismatching content never runs and never enters the cache.
* Good, because producer and consumer share one versioned shape, keeping the publication and load paths symmetric.
* Bad, because a load makes more requests than one that fetches whole packages; the cost is gated by the load-time budget of `cpt-frontx-nfr-runtime-performance`, with the per-package whole-package pack as fallback.
* Bad, because each package version adds a graph-file fetch, although that fetch is content-addressed and cached like any other shared file.
* Bad, because manifests must carry roots per exposed entry and per lazily loaded chunk, which is an obligation on every producing build.
* Bad, because every microfrontend must publish a conforming manifest, so the contract is a precondition for loadability, and the manifest shape is a versioned compatibility surface that evolves under `cpt-frontx-nfr-evolvability`.
* Neutral, because a manifest that carries no roots behaves as fetch-all, so such manifests stay loadable and the fallback is visible in diagnostics.

### Confirmation

Compliance is confirmed by contract checks and by runtime behaviour. A schema/contract check confirms that a published manifest carries the required locating fields — asset base location, per-entry backing file and stylesheet assets, and the shared-dependency declarations in the enumeration order the completeness driver fixes — and rejects a manifest missing them. A conformance check confirms that the manifest's graph-file references, roots and optional shared base location conform to the format contract owned by `cpt-frontx-adr-shared-dep-reuse`.

An automated runtime test confirms that a load resolves its asset base location and per-entry backing file from the manifest alone and completes without fetching or parsing a compiled remote-entry module. Runtime tests confirm that a load fetches exactly the units reachable from its entry's roots, in a single round together with the entry's own chunks; that units reached by a lazily loaded chunk are fetched only when that chunk loads; that a manifest without roots is handled as fetch-all and reported as such; and that a graph file, unit or pack whose content does not match its declared identity fails the load, is reported, and is not cached. The runtime's diagnostics report, per load, the units fetched against the units reachable, so any over-fetch is observable. A load-time check confirms that per-unit fetching stays within the budget of `cpt-frontx-nfr-runtime-performance`.

## Pros and Cons of the Options

### Enriched-manifest-driven discovery

The runtime locates and loads a microfrontend from a published, enriched manifest carrying the asset base location, per-entry asset records, the shared-dependency declarations in the enumeration order the completeness driver fixes, and the shared-code reachability facts.

* Good, because it sources every locating fact from a stable, versioned, published contract.
* Good, because it is bundler- and substrate-neutral.
* Good, because the manifest is complete for an isolated load — no secondary parse, no out-of-band lookup.
* Good, because reading declared fields is robust against minification and bundler-version drift.
* Neutral, because it introduces a versioned manifest-shape compatibility surface.
* Bad, because every microfrontend must publish a conforming manifest as a precondition for loadability.

### Runtime remote-entry parsing

The runtime fetches a microfrontend's compiled remote-entry module at load time and recovers locating facts by parsing that bundler-emitted output.

* Good, because it needs no separately published description — the facts are recovered from the shipped bundle.
* Good, because it reuses an artifact a federated build already emits.
* Bad, because it couples discovery to a bundler's internal output shape, which changes with minification and bundler version.
* Bad, because parsing compiled output to recover structured facts is ambiguity-prone and brittle compared with reading declared fields.
* Bad, because the parse is an extra fetch on the critical path of every load.

### Host-maintained entry maps

The host application carries a hardcoded map from each microfrontend to its asset locations, maintained outside any artifact the microfrontend publishes.

* Good, because the host has full, explicit control over where each microfrontend's assets are located.
* Bad, because the locating information lives with the host rather than the microfrontend, so it drifts from the microfrontend it describes and must be hand-maintained as microfrontends change.
* Bad, because it defeats runtime registration of independently developed microfrontends, since each addition requires editing host-side bookkeeping rather than honoring a published contract.

### Fetch every declared shared entry

The load fetches every shared entry its manifest declares.

* Good, because it needs no reachability facts in the manifest and no graph-file traversal.
* Good, because the fetch set is known before any request, so it fits a single round.
* Bad, because it transfers shared code the entry never reaches, contrary to `cpt-frontx-nfr-resource-efficiency`.
* Bad, because the bytes a load transfers grow with the microfrontend's declared shared list rather than with what the entry uses.

### Runtime reachability discovery by chunk scanning

The load first fetches the entry's chunks, scans them for the shared code they import, and then fetches what was found.

* Good, because it needs no roots in the manifest.
* Good, because the fetch set matches what the entry's code imports.
* Bad, because shared code is fetched only after the entry's chunks arrive, a two-step waterfall that adds a full round to every load.
* Bad, because scanning compiled output for imports reintroduces the brittleness the discovery-source decision rejects.

### Manifest-declared roots plus graph files

The manifest states the roots per exposed entry and per lazily loaded chunk; the runtime closes them over the packages' graph files before fetching.

* Good, because only reachable units are fetched.
* Good, because the reachable set is known up front, so shared units and the entry's chunks are fetched in one parallel round.
* Good, because the facts it relies on are declared fields covered by the format contract of `cpt-frontx-adr-shared-dep-reuse`, verifiable against content identity.
* Bad, because each package version adds a graph-file fetch, cached and content-addressed.
* Bad, because every producing build must emit roots per exposed entry and per lazily loaded chunk.

### Per-unit requests

One request per reachable unit.

* Good, because a load transfers exactly the reachable units and nothing else.
* Good, because each unit is content-identified and cached independently, so a unit reached by several microfrontends is transferred once.
* Bad, because a load makes many more requests than one fetching whole packages.

### One whole-package pack per package, always

Every package used by a load is fetched as its whole-package pack.

* Good, because a load makes about one request per package.
* Good, because packs are content-identified, so cross-microfrontend reuse still holds.
* Bad, because every load transfers each package whole, including units it never reaches.

### Deployment-wide union packs

One pack per package covering the union of what the microfrontends deployed together reach.

* Good, because the request count is low and the pack excludes units no deployed microfrontend reaches.
* Bad, because the bytes depend on which microfrontends are deployed together, not on the package at a version, so content-keyed reuse and independent deployment both break.
* Bad, because every load transfers the union of everyone's needs rather than its own.

## More Information

The manifest's concrete field names, the asset-record shape, and the concrete schema for graph-file references and roots are descriptive and non-binding here; they are contract-shape choices owned as `cpt-frontx-adr-shared-dep-reuse` provides. The durable decision is that what one load reads and fetches — its assets and the shared units its entry reaches — is discovered from a published, versioned manifest contract rather than from parsing compiled output, and that shared code is fetched per reachable unit, verified against its declared content identity. How a load builds its isolated graph from the fetched sources, including how it handles circular declarations, is decided in `cpt-frontx-adr-mfe-load-isolation`. How far the source-text cache reaches and how it is bounded are decided in `cpt-frontx-adr-shared-dep-cache-reach`. The manifest shape's compatibility follows `cpt-frontx-nfr-evolvability`, and the fields this decision relies on for shared code are additive and optional.

In the present concrete instantiation, the ecosystem's manifest contract is defined in `packages/mfes/src/manifest/mf-manifest.ts`. The asset base location is `metaData.publicPath`; each exposed entry's backing chunk and stylesheets are its `exposeAssets` record, carried on the entry (`packages/mfes/src/types/mfe-entry-mf.ts`) in the `MfManifestAssets` shape that the manifest contract defines; and shared dependencies are declared as `shared` entries, each with `name`, `version`, `chunkPath`, `unwrapKey` and an optional `contentHash`. The fields that reference graph files, the roots per expose and per lazy chunk, the production-rule marker and the optional shared base location are contract-shape choices named by the owning FEATUREs.

**Scope of impact.** Decides the source of the information the runtime uses to locate and load a microfrontend's assets and shared code — a published, versioned manifest contract — and which shared files one load fetches, when, at what granularity, and under what integrity check. It does not decide the unit of reuse, its identity or the format contract (decided in `cpt-frontx-adr-shared-dep-reuse`), which handler services a given entry (decided in `cpt-frontx-adr-mfe-handler-resolution`), how a lazily loaded chunk is resolved into a load's isolated graph (decided in `cpt-frontx-adr-lazy-import-resolution`), nor how the manifest's type identifiers are validated (the type-system plugin's responsibility).

**Review trigger.** Revisit if a published, versioned discovery contract cannot carry everything an isolated load needs; if a backward-incompatible change to the manifest shape is required (handled under `cpt-frontx-nfr-evolvability`); if a substrate emerges for which a declared manifest cannot be produced; or if the load-time check shows per-unit fetching, with the per-package pack fallback, exceeding the budget of `cpt-frontx-nfr-runtime-performance` in compositions the platform must support.

**Checklist applicability.**

* ARCH — applicable and addressed above (the discovery-source and fetch-set decision affects every microfrontend load and the runtime's coupling to build output, and is hard to reverse once microfrontends publish to the contract).
* INT — applicable and addressed above (INT-ADR-001/002): the manifest is the integration contract between a microfrontend and the runtime; its shape is the versioned interface, its compatibility follows `cpt-frontx-nfr-evolvability`, a backward-incompatible change is a contract change governed by that rule, and conformance — including conformance to the format contract owned by `cpt-frontx-adr-shared-dep-reuse` — is the consumer-testing requirement confirmed by the contract checks. This anchors `cpt-frontx-contract-template-manifest`.
* SEC — applicable and addressed above: every fetched graph file, unit and pack is verified against its declared content identity before it is used or cached, and a mismatch fails the load without caching the text (`cpt-frontx-nfr-security`); code-admission trust and isolation are decided in `cpt-frontx-adr-mfe-load-isolation`.
* REL — applicable and addressed above: an integrity mismatch surfaces as a reported load failure rather than as silently evaluated content, and a manifest without roots degrades to fetch-all with a diagnostic rather than failing.
* PERF — applicable and addressed above: the reachable set is determined before fetching so a load completes in a single parallel round, per-unit fetching is admitted only within the budget of `cpt-frontx-nfr-runtime-performance` with the per-package pack as fallback, and transfer is governed by `cpt-frontx-nfr-resource-efficiency`.
* DATA — Not applicable because no persistent data store or schema definition is owned here; the manifest is an integration contract, not a stored data schema.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-runtime-registration` — manifest-driven discovery is how a registered microfrontend is located and loaded on demand without depending on a particular bundler's compiled output.
* `cpt-frontx-contract-template-manifest` — this decision makes the published manifest the runtime's discovery contract, the bidirectional shape produced at publication and consumed at load, including the shared-code reachability facts.
* `cpt-frontx-nfr-resource-efficiency` — a load fetches only the shared units its entry reaches, and diagnostics report fetched against reachable units.
* `cpt-frontx-nfr-runtime-performance` — the reachable set is known up front so a load fetches in a single parallel round, within this NFR's load-time budget, with the per-package pack as fallback.
* `cpt-frontx-nfr-security` — fetched graph files, units and packs are verified against their declared content identity before use or caching.
* `cpt-frontx-component-mfe-runtime` — this decision shapes how the MFE Runtime component discovers a microfrontend's assets and determines and fetches the shared code a load reaches.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — early loading uses the existing load action, so the runtime's public surface does not grow.
