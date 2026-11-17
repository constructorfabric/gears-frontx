---
status: accepted
date: 2026-11-17
description: "Decides that each microfrontend load discovers what it reads and fetches — its assets, its own chunks and the shared-dependency code its exposed module needs — from the registered MFE entry and the registered manifest it references, read from the registry, whose closed contract lists every field the runtime reads with its value format; the exposed module's fetch-list document is requested together with its entry module, then the shared units missing from the realm cache and the own chunks the list names in one flat batch, at most two rounds; shared text is reused under the content identity its producer declares."
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
  - [Manifest-referenced per-exposed-module fetch lists](#manifest-referenced-per-exposed-module-fetch-lists)
  - [Closed manifest schema](#closed-manifest-schema)
  - [Open manifest schema](#open-manifest-schema)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mfe-asset-discovery`

## Context and Problem Statement

To load a microfrontend, the runtime must discover where its chunk assets live, which file backs the exposed module being loaded, which stylesheets that module needs, and which shared-dependency code it depends on. That locating information can be read from a structured description the microfrontend publishes about itself, recovered by fetching and parsing the microfrontend's compiled output, or kept as bookkeeping outside the microfrontend.

Shared-dependency code is delivered as content-identified units, named on one fetch list per exposed module, under the unit of reuse and the format contract decided in `cpt-frontx-adr-shared-dep-reuse` (which also defines the terms *unit*, *own chunk*, *round*, *fetch list*, *fetch-list document*, *list item*, *lazy target*, *exposed module*, *shared entry* and *whole-package entry* used here). A load needs only the list items its exposed module's fetch list names. Fetching every declared shared entry transfers code the exposed module never uses. Discovering what it needs by fetching and scanning its chunks puts a further round of requests behind every level of the chunk graph. Either cost lands on the load-time budget and on the transfer the platform aims to keep minimal.

The description is also a contract between independent producers and the runtime. If the runtime reads a field that the contract does not list, producers cannot know the field exists, and a field can come into use without ever being part of the contract.

How should the runtime obtain the information it needs to locate a microfrontend's assets, and determine before fetching exactly which shared code one load must fetch — so that the source of that information is a stable, closed, declared contract rather than a bundler's internal artifact, and the shared code a load needs is known before any of it is fetched?

## Decision Drivers

* A declared, stable locating contract — the information the runtime needs to find a microfrontend's assets and shared code must come from an explicitly declared description, so it is durable against changes in how a microfrontend is compiled (anchors `cpt-frontx-fr-mfe-runtime-registration`).
* Substrate and bundler neutrality — discovery must not depend on the internal structure of any particular bundler's compiled output, so a microfrontend built with any conforming toolchain can be loaded (anchors `cpt-frontx-fr-mfe-runtime-registration`).
* Completeness for an isolated load — the description must carry everything an isolated load needs: the base location for assets, the file backing each exposed module, its stylesheet assets, the shared entries and the reference to the exposed module's fetch list.
* Resource efficiency — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once, that only what is required be fetched and evaluated, and that the outcome be observable.
* Load latency — `cpt-frontx-nfr-runtime-performance` sets the load-time budget; the number of rounds and the number and size of requests a load makes must stay within it.
* Declared sharing identity — text that independently built microfrontends share is keyed by the content identity its producer declares at build time, so loads that declare the same identity reuse one fetch, and a load reuses only text whose identity its own declaration names (`cpt-frontx-nfr-resource-efficiency`).
* Robust, low-ambiguity extraction — obtaining locating facts must not rely on pattern-matching compiled output, where minification or bundler-version drift can silently change the shapes being matched.
* Producer/consumer symmetry — producers and the runtime share one contract shape.
* A closed contract — every field the runtime reads must be listed in the contract, and the type system's manifest and MFE entry types must reject anything else, so a field cannot be in use without being in the contract.
* Contained public surface — discovery's public footprint is the one `cpt-frontx-adr-shared-dep-cache-reach` states (`cpt-frontx-constraint-mfes-realm-shared-dep-cache`).

## Considered Options

Discovery source:

* **Enriched-manifest-driven discovery** — the runtime locates and loads a microfrontend from its registered MFE entry and the registered manifest it references: the asset base location, per-module asset records, the shared entries, and a reference to each exposed module's fetch list. The entry and the manifest together are the single declared contract for discovery.
* **Runtime remote-entry parsing** — the runtime fetches the microfrontend's compiled remote-entry module at load time and recovers the locating facts by parsing that bundler-emitted output.
* **Host-maintained entry maps** — the host application carries a hardcoded map from each microfrontend to its asset locations, maintained outside any artifact the microfrontend itself publishes.

Shared-code reachability:

* **Fetch every declared shared entry** — the load fetches every shared entry its manifest declares, whatever its exposed module uses.
* **Runtime reachability discovery by chunk scanning** — the load first fetches the exposed module's chunks, scans them for the shared code they import, and then fetches what was found, level by level.
* **Manifest-referenced per-exposed-module fetch lists** — the manifest references, per exposed module, a content-addressed fetch-list document; the runtime reads the list and fetches what it names in one batch.

Manifest schema strictness:

* **Closed manifest schema** — the schema lists every field and rejects unknown properties on every object.
* **Open manifest schema** — the schema lists the required fields and tolerates further properties.

## Decision Outcome

Chosen options: **enriched-manifest-driven discovery**, with **manifest-referenced per-exposed-module fetch lists** for shared-code reachability and a **closed manifest schema**. Together they source every locating and reachability fact from a stable, declared contract owned by the microfrontend, let a load fetch only the shared code its exposed module's fetch list names, with that list known before any list item is fetched, and keep the contract complete by construction.

**Locating contract.** The locating contract is the MFE entry plus the manifest it references. Manifests are registered, and an MFE entry always references a registered manifest by its identifier. The runtime reads the manifest the MFE entry references from the registry where it was registered. The MFE entry names the exposed module, the file that backs it and its stylesheets; the manifest carries the asset base location, the shared entries and the fetch-list references. These two declared descriptions supply everything one isolated load requires, with no parsing of compiled output.

**Assets.** The runtime reads the manifest's asset base location (`metaData.publicPath`). It reads the entry module — the first element of the MFE entry's `exposeAssets.js.sync` — and the stylesheets (`exposeAssets.css.sync` and `exposeAssets.css.async`) from the MFE entry, and resolves them against the asset base location.

**Shared code.** The manifest's `entryLists` field references, per exposed module, that module's fetch-list document by location and content identity, in the format `cpt-frontx-adr-shared-dep-reuse` owns. The fetch list names the shared units the exposed module needs and, by location only, the microfrontend's own chunks the exposed module reaches statically. When the exposed module has a fetch list, a load runs this sequence:

1. The runtime reads the registered manifest the MFE entry references from the registry.
2. In the first round, it requests the exposed module's fetch-list document together with the entry module; both locations are known from the entry and the manifest. Both are requested at high fetch priority, because the fetch-list document opens the critical path to the extension's mount and the entry module is the last file the mount waits on; the second-round requests keep the default priority.
3. Once the fetch-list document has arrived, it requests the shared units missing from the realm cache and the own chunks the list names in one flat batch, the second round. The batch has no concurrency limit and relies on the platform's connection limits. Own-chunk requests never wait for minting.
4. It mints the shared units leaves-first and builds the microfrontend's own chunk graph over them, evaluating the entry module last. Minting is serialised per load.
5. A lazy target does the same with its own fetch list on first use, as `cpt-frontx-adr-lazy-import-resolution` decides: its fetch-list document and its own chunk in the first round, then the shared units missing from the load's map and the realm cache and the own chunks its list names in one flat batch. For a lazy target that is a shared unit, its list item joins the second round in place of an own chunk in the first. Distinct lazy targets of one load download in parallel.

A load with a fetch list therefore costs at most two rounds, and each lazy target at most two more on first use. Round counts cover only the requests the runtime issues. The fixed concurrency limit applies only to the path without a fetch list: to whole-package entries, and to own chunks the runtime finds by walking the chunk graph rather than from a fetch list.

Which cache holds shared text, under which key, and which cache holds the microfrontend's own code, is decided in `cpt-frontx-adr-shared-dep-cache-reach`, together with the reach and byte budget of the realm cache.

**Whole-package entries.** A manifest may declare shared entries without a fetch list for the exposed module. In that case the load uses whole-package entries: each `shared` entry names the one file that holds the package (`chunkPath`), and the runtime fetches every declared entry. This case exists because shared code can be described without fetch lists. It does not reverse the rejection of **fetch every declared shared entry** as the delivery model: when a fetch list exists, the runtime fetches only what it names. A `shared` entry may carry a `contentHash`, which keys whole-package entry reuse as `cpt-frontx-adr-shared-dep-reuse` decides.

**Unresolved specifiers.** This decision owns one rule for every load path — list items, own chunks and whole-package entries, on the exposed module's load and on a lazy target's first use alike. A declared shared-dependency name that survives rewriting fails the load — on a lazy target's first use, that lazy import — with an `MfeLoadError` naming the chunk, the specifier and the microfrontend. An undeclared bare specifier that survives rewriting produces a console warning naming the same three.

**Location.** Each location kind resolves against one base:

| Location kind | Resolves against | Relative location must stay inside the base | Absolute http(s) URL accepted |
|---|---|---|---|
| Fetch-list document | `metaData.sharedBase` when given, otherwise `metaData.publicPath` | yes | yes, under the location rules below |
| List item | `metaData.sharedBase` when given, otherwise `metaData.publicPath` | yes | yes, under the location rules below |
| Own chunk, including one a fetch list names | `metaData.publicPath` | no | yes |
| Entry module and stylesheets | `metaData.publicPath` | no | yes |
| `chunkPath` of a shared entry | `metaData.publicPath` | yes | yes, under the location rules below |

A relative `sharedBase` resolves against the resolved `publicPath` directory; once resolved, it must be an http(s) URL, and `sharedBase` never changes how an own chunk or a `chunkPath` resolves. For the kinds that must stay inside their base, every location, absolute or relative, fails the load before any request when it carries a percent-encoded dot, a backslash, a space or a control character, when it names a scheme other than http(s) or is protocol-relative (`//`), or when it names a directory rather than a file. A relative location also fails when it climbs out of the base (a `..` segment or a leading `/`). An absolute http(s) URL is exempt only from that stay-inside-the-base test. A lazy target's fetch list is keyed by the target's chunk location relative to the base that chunk resolves against: `publicPath` for an own chunk, `sharedBase` for a shared unit.

**Content identity.** A content identity is a declaration: the producer computes it at build time and declares it in the manifest and the fetch list — the `contentHash` of every fetch-list reference, of every list item, and of every whole-package entry that carries one. The runtime takes the declared identity as the key under which the text is shared, and admits the text fetched for it under that key as fetched. Like the locations beside it, the declared identity is part of the admitted manifest and fetch-list data; it is a sharing key, not a grant of trust in code. A whole-package entry without a `contentHash`, including one whose `chunkPath` is an absolute cross-origin URL, is shared under its absolute location, under the reuse scope `cpt-frontx-adr-shared-dep-reuse` decides.

**Trust.** The runtime treats a registered MFE entry and the manifest it references as admitted input; authenticating them is outside the package. The manifest names the origin of a microfrontend's code. A microfrontend's own code — its entry module, its stylesheets, its further chunks, its lazy chunks and the own chunks a fetch list names — carries no content identity, because it is not shared. It is trusted by the locations the MFE entry, the manifest and the fetch list name, with no origin or containment check, so absolute URLs are accepted.

**Closed contract.** The type system's manifest and MFE entry types accept exactly the fields listed below; any other property is rejected.

| Contract | Field | Required | Read by the runtime to |
|---|---|---|---|
| Manifest | `id` | yes | identify the manifest and name it in diagnostics |
| Manifest | `metaData` | yes | hold the asset base location and the shared base location |
| Manifest | `metaData.publicPath` | yes | resolve the entry module, its stylesheets, the own chunks and each `chunkPath`; and resolve fetch-list document and list-item locations when `metaData.sharedBase` is absent |
| Manifest | `metaData.sharedBase` | no | resolve fetch-list document and list-item locations |
| Manifest | `entryLists` | no | find each exposed module's fetch-list document, keyed by exposed module |
| Manifest | `entryLists.<module>.location` | yes, in each value | locate that exposed module's fetch-list document |
| Manifest | `entryLists.<module>.contentHash` | yes, in each value | key that fetch-list document's text |
| Manifest | `shared` | yes | declare the shared entries |
| Manifest | `shared[].name`, `shared[].version` | yes | name each shared entry, rewrite bare specifiers and key whole-package entry reuse |
| Manifest | `shared[].chunkPath` | yes | locate a whole-package entry |
| Manifest | `shared[].contentHash` | no | key a whole-package entry's reuse |
| MFE entry | `id` | yes | identify the entry and name it in diagnostics |
| MFE entry | `manifest` | yes | reference the registered manifest by its identifier |
| MFE entry | `exposedModule` | yes | name the exposed module, which keys `entryLists` |
| MFE entry | `exposeAssets` | yes | hold the entry module and stylesheet locations |
| MFE entry | `exposeAssets.js.sync` | yes, non-empty | locate the entry module; only its first element is read |
| MFE entry | `exposeAssets.css.sync`, `exposeAssets.css.async` | yes | locate the exposed module's stylesheets |

The MFE entry contract also includes the base entry fields it inherits, and they are part of the contract: `id` (required), `requiredProperties` (required), `optionalProperties` (optional), `actions` (required) and `domainActions` (required).

Value formats are part of the contract and are enforced by the type system: a package `name` contains no colon, a `version` contains neither `:` nor `@`, and every `contentHash` is 64 lowercase hexadecimal characters.

A manifest or MFE entry that carries any property outside this contract, lacks a required field or holds a value outside its format is rejected. The contract is stated by the table above and realized twice — by the runtime's manifest and MFE entry types and by the type system's manifest and MFE entry types — and the two list the same fields with the same required flags. A field enters the contract in one change that adds it to this table, to the runtime's types and to the type system's types; the runtime reads nothing else.

**Discovery path.** The manifest-driven path is the only discovery path, and code outside the package admits text to the realm cache only through the shared-unit fetcher on `./unit-loader`, as `cpt-frontx-adr-shared-dep-cache-reach` decides.

Because producers and the runtime share the contract, compatibility of its shape follows `cpt-frontx-nfr-evolvability`. While the project is at major version 0, a contract change — additive or not — takes no contract-version bump, and backward-incompatible changes are expected. A new field is accepted by the runtime before producers emit it. Handler selection — which handler services a given MFE entry — is decided separately in `cpt-frontx-adr-mfe-handler-resolution`; this decision fixes only that, whichever handler is selected, discovery is manifest-driven.

### Consequences

* Good, because the runtime depends on a declared contract rather than on bundler-internal output, so discovery survives changes in how a microfrontend is compiled.
* Good, because discovery is bundler- and substrate-neutral: any conforming toolchain that emits the entry and manifest shape can be loaded.
* Good, because the entry and manifest carry everything an isolated load needs, so a load requires no secondary parse.
* Good, because a load downloads only the list items its exposed module's fetch list names, which serves `cpt-frontx-nfr-resource-efficiency`.
* Good, because the fetch-list document is requested together with the entry module, and every shared unit and own chunk the list names is known before any of them is fetched, so a load with a fetch list costs at most two rounds.
* Good, because shared text is keyed by the content identity producers declare, so loads that declare the same identity reuse one fetch, and the text fetched for that identity is admitted as fetched.
* Good, because the closed contract types make the contract complete: a field that is used but absent from the contract is rejected at validation instead of being found in the field.
* Good, because producer and consumer share one shape, keeping the two sides symmetric.
* Bad, because each exposed module adds a fetch-list document fetch, although that document is content-addressed and held in the realm cache like any list item.
* Bad, because a manifest or MFE entry with a property outside the contract is rejected, so a new field must enter the contract — and be accepted by the runtime — before producers emit it.
* Bad, because every microfrontend must supply a conforming entry and manifest, so the contract is a precondition for loadability; while the project is at major version 0, a contract change, additive or not, needs no contract-version bump, so producers must follow contract changes as they land.
* Bad, because correct sharing rests on producers: the runtime reuses text under the content identity its producer declares, so a load relies on each producer declaring the identity of the file it publishes.
* Bad, because a microfrontend's own code carries no content identity and is trusted by the locations the MFE entry, the manifest and the fetch list name, with no origin or containment check.
* Bad, because the second-round batch has no concurrency limit, so a long fetch list relies on the platform's connection limits to pace its requests.
* Neutral, because a manifest whose exposed module has no fetch list uses its whole-package entries, which are fetched in full.

### Confirmation

The runtime package's own tests confirm runtime behaviour:

* a load resolves its asset base location and entry module from the MFE entry and the manifest it reads from the registry, and completes without fetching or parsing a compiled remote-entry module;
* the fetch-list document and the entry module are both requested before either response arrives, both at high fetch priority, while the second-round requests keep the default priority;
* once the fetch-list document arrives, every shared unit missing from the realm cache and every own chunk the list names is requested before any response of that batch arrives, with no limit on the number in flight, and before any shared unit is minted;
* shared units are minted leaves-first, and the entry module is evaluated after every shared unit it reaches is minted;
* with `metaData.sharedBase` set and different from `metaData.publicPath`, the fetch-list document and the list items are requested under `sharedBase`, while the own chunks, the entry module and stylesheets, and each `chunkPath` are requested under `publicPath`;
* a manifest without a fetch list for the exposed module falls back to its whole-package entries, issues no early entry-module request, and fetches those entries and the own chunks it finds by walking the chunk graph under the fixed concurrency limit;
* a fetch-list document, list-item or `chunkPath` location, absolute or relative, that carries a percent-encoded dot or a forbidden character, names another scheme or names a directory fails the load before any request, and so does a relative one that climbs out of its base; an absolute http(s) URL is accepted for every location kind; a `metaData.sharedBase` value that does not resolve to an http(s) URL fails the load before any request; and a relative `sharedBase` resolves against the resolved `publicPath` directory;
* on the exposed module's load and on a lazy target's first use, for list items, own chunks and whole-package entries alike, a declared shared name that survives rewriting fails the load naming the chunk, the specifier and the microfrontend, and an undeclared bare specifier that survives produces a warning naming the same three.

The type system's tests confirm that its manifest and MFE entry types accept every field in the table above, together with the inherited base entry fields, and reject a manifest or MFE entry that carries any other property, lacks a required field, has an empty `exposeAssets.js.sync`, or holds a `name`, `version` or `contentHash` outside its value format. A parity check confirms that the runtime's manifest and MFE entry types and the type system's types list the same fields with the same required flags. Absence of shared text from the handler's source-text cache, the per-load diagnostic and the retry behaviour are confirmed under `cpt-frontx-adr-shared-dep-cache-reach`. Conformance of fetch-list documents to the format contract is verified in each producer's own tests, as `cpt-frontx-adr-shared-dep-reuse` decides.

## Pros and Cons of the Options

### Enriched-manifest-driven discovery

The runtime locates and loads a microfrontend from its registered MFE entry and the registered manifest it references, which carry the asset base location, per-module asset records, the shared entries, and a reference to each exposed module's fetch list.

* Good, because it sources every locating fact from a stable, declared contract.
* Good, because it is bundler- and substrate-neutral.
* Good, because the entry and manifest are complete for an isolated load, with no secondary parse.
* Good, because reading declared fields is robust against minification and bundler-version drift.
* Neutral, because it introduces an entry and manifest shape that is a compatibility surface.
* Bad, because every microfrontend must supply a conforming entry and manifest as a precondition for loadability.

### Runtime remote-entry parsing

The runtime fetches a microfrontend's compiled remote-entry module at load time and recovers locating facts by parsing that bundler-emitted output.

* Good, because it needs no separately declared description — the facts are recovered from the shipped bundle.
* Good, because it reuses an artifact a federated build already emits.
* Bad, because it couples discovery to a bundler's internal output shape, which changes with minification and bundler version.
* Bad, because parsing compiled output to recover structured facts is ambiguity-prone and brittle compared with reading declared fields.
* Bad, because the parse is an extra fetch on the critical path of every load.

### Host-maintained entry maps

The host application carries a hardcoded map from each microfrontend to its asset locations, maintained outside any artifact the microfrontend publishes.

* Good, because the host has full, explicit control over where each microfrontend's assets are located.
* Bad, because the locating information lives with the host rather than the microfrontend, so it drifts from the microfrontend it describes and must be hand-maintained as microfrontends change.
* Bad, because it defeats runtime registration of independently developed microfrontends, since each addition requires editing host-side bookkeeping rather than honouring a declared contract.

### Fetch every declared shared entry

The load fetches every shared entry its manifest declares.

* Good, because it needs no fetch list in the manifest.
* Good, because the fetch set is known before any request, so it fits a single round.
* Bad, because it transfers shared code the exposed module never uses, contrary to `cpt-frontx-nfr-resource-efficiency`.
* Bad, because the bytes a load transfers grow with the microfrontend's declared shared entries rather than with what the exposed module uses.

### Runtime reachability discovery by chunk scanning

The load first fetches the exposed module's chunks, scans them for the shared code they import, and then fetches what was found, level by level.

* Good, because it needs no fetch list in the manifest.
* Good, because the fetch set matches what the exposed module's code imports.
* Bad, because shared code and further chunks are found only as the chunks that import them arrive, so the number of rounds grows with the depth of the chunk graph, where a fetch list fixes it at most two.
* Bad, because scanning compiled output for imports reintroduces the brittleness the discovery-source decision rejects.

### Manifest-referenced per-exposed-module fetch lists

The manifest references, per exposed module, a content-addressed fetch-list document; the runtime reads it and fetches what it names in one batch.

* Good, because only the list items the fetch list names are fetched.
* Good, because the fetch-list document's location is known from the manifest, so it is requested together with the entry module, and every list item is known before any of them is fetched.
* Good, because the fetch list is a declared document covered by the format contract of `cpt-frontx-adr-shared-dep-reuse`, shared under the content identity the manifest declares for it.
* Bad, because a producing build that wants list-driven loading must emit a fetch list per exposed module.

### Closed manifest schema

The schema lists every field and rejects unknown properties on every object.

* Good, because a field cannot be used without being in the contract.
* Good, because a misspelled or stale field is rejected instead of being ignored.
* Bad, because adding a field is a contract change that the runtime must accept before producers emit the field.

### Open manifest schema

The schema lists the required fields and tolerates further properties.

* Good, because producers can add fields without a contract change.
* Bad, because a field can be used by the runtime or by a producer without being in the contract, and the gap shows only when a producer omits it.
* Bad, because a misspelled field is silently ignored.

## More Information

The concrete field names and the asset-record shape are descriptive of the present instantiation. The durable decision is that what one load reads and fetches is discovered from a declared, closed contract — the registered MFE entry plus the registered manifest it references — rather than from parsing compiled output; that the shared fetch set is the exposed module's fetch list; and that shared text is reused under the content identity its producer declares. The semantics of the fields that carry the fetch lists (`entryLists`, `metaData.sharedBase`) and of the shared-entry content identity are decided in `cpt-frontx-adr-shared-dep-reuse`; the closure of the manifest and MFE entry contracts, their value formats and the location rules are decided here. How a load builds its isolated graph from the fetched sources, including how it handles cycles, is decided in `cpt-frontx-adr-mfe-load-isolation`. How far the source-text cache reaches and how it is bounded are decided in `cpt-frontx-adr-shared-dep-cache-reach`.

This record deliberately bundles three related choices — the discovery source, shared-code reachability and schema strictness — because each depends on the others: fetch lists are only reachable through the discovery contract, and the contract is only complete if its schema is closed.

In the present instantiation, the runtime's manifest type is defined in `packages/mfes/src/manifest/mf-manifest.ts` and its MFE entry type in `packages/mfes/src/types/mfe-entry-mf.ts`; the type system's manifest and MFE entry types realize the same contract.

**Scope of impact.** Decides the source of the information the runtime uses to locate and load a microfrontend's assets and shared code — the registered MFE entry and manifest — and which shared files one load fetches, when, from which base, under which location rules, and under which declared identity it is shared. It does not decide the unit of reuse, its identity or the format contract (decided in `cpt-frontx-adr-shared-dep-reuse`), which handler services a given MFE entry (decided in `cpt-frontx-adr-mfe-handler-resolution`), how a lazily loaded chunk is resolved into a load's isolated graph (decided in `cpt-frontx-adr-lazy-import-resolution`), nor how the manifest's type identifiers are validated (the type-system plugin's responsibility).

**Review trigger.** Revisit if the entry and manifest cannot carry everything an isolated load needs; if the project leaves major version 0, so that contract changes need a version policy under `cpt-frontx-nfr-evolvability`; if a substrate emerges for which a declared manifest cannot be produced; or if list-driven fetching exceeds the load-time budget of `cpt-frontx-nfr-runtime-performance` in compositions the platform must support.

**Checklist applicability.**

* ARCH — applicable and addressed above: the discovery-source and fetch-set decision affects every microfrontend load and the runtime's coupling to build output, and is hard to reverse once microfrontends conform to the contract.
* INT — applicable and addressed above (INT-ADR-001/002): the MFE entry and the manifest are the integration contract between a microfrontend and the runtime; compatibility follows `cpt-frontx-nfr-evolvability`, at major version 0 a contract change takes no contract-version bump, and a manifest or MFE entry carrying a field outside the contract is rejected. The type system's tests and the parity check confirm the manifest and MFE entry contracts; conformance to the fetch-list format owned by `cpt-frontx-adr-shared-dep-reuse` is verified in each producer's own tests.
* DATA — applicable and addressed above (DATA-ADR-001): the two closed contracts fix the shape of the discovery data; the field list, whether each field is required, its value format and the runtime's use of it are stated above, and the fetch-list format is decided in `cpt-frontx-adr-shared-dep-reuse`.
* SEC — applicable and addressed above: the runtime treats a registered MFE entry and its manifest as admitted input, and authenticating them is outside the package. The content identity of every fetch-list document and list item, and of every whole-package entry that declares a `contentHash`, is the producer's declaration, admitted with the manifest and fetch-list data and used as the sharing key; it is not a grant of trust in code. A microfrontend's own code is trusted by the locations the MFE entry, the manifest and the fetch list name, with no origin or containment check; shared-file locations that must stay inside their base are validated before any request (`cpt-frontx-nfr-security`); a whole-package entry without a `contentHash` is shared only under its absolute location. Code-admission trust and isolation are decided in `cpt-frontx-adr-mfe-load-isolation`.
* REL — applicable and addressed above: a manifest that carries no fetch list for an exposed module uses its whole-package entries rather than failing. A load that joins another load's in-flight fetch which then rejects retries once from its own URL, and a failed load admits no text after the failure and issues no further request, text admitted before the failure stays in the realm cache, and the in-flight entries it published are released under the identity check (`cpt-frontx-adr-shared-dep-cache-reach`).
* PERF — applicable and addressed above: a load with a fetch list costs at most two rounds — the fetch-list document together with the entry module, both at high fetch priority, then one flat batch of missing shared units and own chunks with no concurrency limit — and each lazy target at most two more on first use, within the budget of `cpt-frontx-nfr-runtime-performance`; transfer is governed by `cpt-frontx-nfr-resource-efficiency`, and the per-load diagnostic is decided in `cpt-frontx-adr-shared-dep-cache-reach`.
* OPS — Not applicable because this is a library mechanism; no deployed-service operational procedure is governed by this decision.
* MAINT — applicable and addressed above: the contract table, the runtime's types and the type system's types change together in one change and are held equal by a parity check, and the "read nothing outside the contract" rule keeps the contract from drifting.
* TEST — applicable and addressed above: the runtime package's tests, the type system's tests and the parity check listed under Confirmation are the verification this decision rests on.
* COMPL — Not applicable because no regulated or personal data is processed.
* UX — Not applicable because the decision shapes how code is located and fetched, not rendered output; its user-visible effect is load time, addressed under PERF.
* BIZ — Not applicable because this is a technical decision; product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)
- **FEATURE**: [mfe-loading FEATURE](../../packages/mfes/architecture/features/mfe-loading/FEATURE.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-runtime-registration` — manifest-driven discovery is how a registered microfrontend is located and loaded on demand without depending on a particular bundler's compiled output; this decision makes the registered MFE entry and manifest the runtime's discovery contract, including the per-exposed-module fetch-list references and the value formats, and closes both contracts so that no field is used without being in the contract.
* `cpt-frontx-nfr-resource-efficiency` — a load fetches only the list items its exposed module's fetch list names, and the per-load diagnostic decided in `cpt-frontx-adr-shared-dep-cache-reach` reports the bytes fetched.
* `cpt-frontx-nfr-runtime-performance` — the fetch-list document is requested together with the entry module, and the missing shared units and own chunks follow in one flat batch, at most two rounds, within this NFR's load-time budget.
* `cpt-frontx-nfr-security` — the registered MFE entry and its manifest are admitted input, shared-file locations that must stay inside their base are validated before any request, and the declared content identity is a sharing key rather than a grant of trust in code.
* `cpt-frontx-component-mfe-runtime` — this decision shapes how the MFE Runtime component discovers a microfrontend's assets and determines and fetches the shared code a load needs.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — text from outside the package enters the realm cache only through the shared-unit fetcher on `./unit-loader`, and discovery's public footprint is the one `cpt-frontx-adr-shared-dep-cache-reach` states.
* `cpt-frontx-feature-mfe-loading` — the FEATURE that specifies the manifest-discovery load path this decision fixes.
