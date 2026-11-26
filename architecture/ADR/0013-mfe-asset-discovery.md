---
status: accepted
date: 2026-11-17
description: "Decides that each microfrontend load discovers what it reads and fetches — its assets, its own chunks and the shared-dependency code its exposed module needs — from the registered MFE entry and the registered manifest it references, read from the registry, whose closed contract lists every field the runtime reads with its value format; the manifest holds every shared unit once and a fetch list per exposed module and per lazy target, so a load requests its entry module, the shared units missing from the realm cache and the own chunks its list names together in one round; shared text is reused under the content identity its producer declares; the contract accepts the fields older producers write as known-but-ignored, so a current shell loads microfrontends built by older producers, and a manifest or entry that fails registration or loading disables only its own microfrontend."
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
  - [Manifest-held fetch lists](#manifest-held-fetch-lists)
  - [Fetch lists as separate documents referenced from the manifest](#fetch-lists-as-separate-documents-referenced-from-the-manifest)
  - [Closed manifest schema](#closed-manifest-schema)
  - [Open manifest schema](#open-manifest-schema)
  - [Manifest referenced by identifier](#manifest-referenced-by-identifier)
  - [Manifest carried inline in the MFE entry](#manifest-carried-inline-in-the-mfe-entry)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mfe-asset-discovery`

## Context and Problem Statement

To load a microfrontend, the runtime must discover where its chunk assets live, which file backs the exposed module being loaded, which stylesheets that module needs, and which shared-dependency code it depends on. That locating information can be read from a structured description the microfrontend publishes about itself, recovered by fetching and parsing the microfrontend's compiled output, or kept as bookkeeping outside the microfrontend.

Shared-dependency code is delivered as content-identified units, named on one fetch list per exposed module held in the registered manifest, under the unit of reuse and the format contract decided in `cpt-frontx-adr-shared-dep-reuse` (which also defines the terms *unit*, *own chunk*, *round*, *fetch list*, *list item*, *lazy target*, *exposed module*, *shared entry* and *whole-package entry* used here). A load needs only the list items its exposed module's fetch list names. Fetching every declared shared entry transfers code the exposed module never uses. Discovering what it needs by fetching and scanning its chunks puts a further round of requests behind every level of the chunk graph. Either cost lands on the load-time budget and on the transfer the platform aims to keep minimal.

The description is also a contract between independent producers and the runtime. If the runtime reads a field that the contract does not list, producers cannot know the field exists, and a field can come into use without ever being part of the contract.

Producers and shells are built and updated independently. A product updates the runtime package in one shell or one microfrontend at a time, and microfrontends built by an older producer stay deployed beside a current shell. Updating one of them must not take the whole product down: a current shell has to register and load a microfrontend an older producer built, and a microfrontend whose description the contract rejects has to cost only itself.

How should the runtime obtain the information it needs to locate a microfrontend's assets, and determine before fetching exactly which shared code one load must fetch — so that the source of that information is a stable, closed, declared contract rather than a bundler's internal artifact, and the shared code a load needs is known before any of it is fetched?

## Decision Drivers

* A declared, stable locating contract — the information the runtime needs to find a microfrontend's assets and shared code must come from an explicitly declared description, so it is durable against changes in how a microfrontend is compiled (anchors `cpt-frontx-fr-mfe-runtime-registration`).
* Substrate and bundler neutrality — discovery must not depend on the internal structure of any particular bundler's compiled output, so a microfrontend built with any conforming toolchain can be loaded (anchors `cpt-frontx-fr-mfe-runtime-registration`).
* Completeness for an isolated load — the description must carry everything an isolated load needs: the base location for assets, the file backing each exposed module, its stylesheet assets, the shared entries and the fetch lists, with the units they reference.
* Resource efficiency — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once, that only what is required be fetched and evaluated, and that the outcome be observable.
* Load latency — `cpt-frontx-nfr-runtime-performance` sets the load-time budget; the number of rounds and the number and size of requests a load makes must stay within it.
* Declared sharing identity — text that independently built microfrontends share is keyed by the content identity its producer declares at build time, so loads that declare the same identity reuse one fetch, and a load reuses only text whose identity its own declaration names (`cpt-frontx-nfr-resource-efficiency`).
* Robust, low-ambiguity extraction — obtaining locating facts must not rely on pattern-matching compiled output, where minification or bundler-version drift can silently change the shapes being matched.
* Producer/consumer symmetry — producers and the runtime share one contract shape.
* A closed contract — every field the runtime reads must be listed in the contract, and the type system's manifest and MFE entry types must reject anything else, so a field cannot be in use without being in the contract.
* Older producers stay loadable — a current shell registers and loads microfrontends whose manifest and MFE entry an older producer wrote, and one microfrontend's failure never reaches the shell or the other microfrontends (`cpt-frontx-fr-mfe-load-failure-handling`).
* Contained public surface — discovery's public footprint is the one `cpt-frontx-adr-shared-dep-cache-reach` states (`cpt-frontx-constraint-mfes-realm-shared-dep-cache`).

## Considered Options

Discovery source:

* **Enriched-manifest-driven discovery** — the runtime locates and loads a microfrontend from its registered MFE entry and the registered manifest it references: the asset base location, per-module asset records, the shared entries, the table of shared units and the fetch lists of each exposed module and lazy target. The entry and the manifest together are the single declared contract for discovery.
* **Runtime remote-entry parsing** — the runtime fetches the microfrontend's compiled remote-entry module at load time and recovers the locating facts by parsing that bundler-emitted output.
* **Host-maintained entry maps** — the host application carries a hardcoded map from each microfrontend to its asset locations, maintained outside any artifact the microfrontend itself publishes.

Shared-code reachability:

* **Fetch every declared shared entry** — the load fetches every shared entry its manifest declares, whatever its exposed module uses.
* **Runtime reachability discovery by chunk scanning** — the load first fetches the exposed module's chunks, scans them for the shared code they import, and then fetches what was found, level by level.
* **Manifest-held fetch lists** — the manifest holds each shared unit once and, per exposed module and per lazy target, a fetch list that references units by content identity; the runtime reads the list from the registered manifest and fetches what it names in one round.
* **Fetch lists as separate documents referenced from the manifest** — the manifest references, per exposed module, a content-addressed fetch-list document; the runtime requests the document, reads it and then fetches what it names.

Manifest schema strictness:

* **Closed manifest schema** — the schema lists every field, including those older producers write and the runtime ignores, and rejects unknown properties on every object.
* **Open manifest schema** — the schema lists the required fields and tolerates further properties.

Manifest placement:

* **Manifest referenced by identifier** — the MFE entry names a registered manifest by its identifier, and the registry holds the manifest.
* **Manifest carried inline in the MFE entry** — the MFE entry embeds the manifest document itself.

## Decision Outcome

Chosen options: **enriched-manifest-driven discovery**, with **manifest-held fetch lists** for shared-code reachability, a **closed manifest schema** and the **manifest referenced by identifier**. Together they source every locating and reachability fact from a stable, declared contract owned by the microfrontend, let a load fetch only the shared code its exposed module's fetch list names, with that list known before any request, and keep the contract complete by construction, the lists included.

**Locating contract.** The locating contract is the MFE entry plus the manifest it references. Manifests are registered, and an MFE entry always references a registered manifest by its identifier and never embeds one, so each manifest is admitted once under its identifier and every entry that names it reads that one description. The runtime reads the manifest the MFE entry references from the registry where it was registered. The MFE entry names the exposed module, the file that backs it and its stylesheets; the manifest carries the asset base location, the shared entries, the shared-unit table and the fetch lists. These two declared descriptions supply everything one isolated load requires, with no parsing of compiled output.

**Assets.** The runtime reads the manifest's asset base location (`metaData.publicPath`). It reads the entry module — the first element of the MFE entry's `exposeAssets.js.sync` — and the stylesheets (`exposeAssets.css.sync` and `exposeAssets.css.async`) from the MFE entry, and resolves them against the asset base location.

**Shared code.** The manifest holds each shared unit once, in its unit table: the unit's location, its content identity (`contentHash`), the specifiers it answers and its import edges. For each exposed module and each lazy target the manifest holds a fetch list, in the format `cpt-frontx-adr-shared-dep-reuse` owns: the list references units by content identity and names, by location only, the microfrontend's own chunks the module or target reaches statically (`ownChunks`); a list also names, by key, the lazy targets and the pattern-import matching files it reaches, and each of those has a fetch list of its own held once in the same `lists` record under its key. The lists are fields of the manifest, validated with it when it is registered. Because every list is known before any request, a load runs this sequence:

1. The runtime reads the registered manifest the MFE entry references from the registry.
2. In one round it requests together: the entry module, at high fetch priority because it is the last file the mount waits on; every unit the exposed module's list names that the realm cache lacks; and the own chunks the list names. The round has no concurrency limit and relies on the platform's connection limits. Own-chunk requests never wait for minting.
3. It mints the shared units leaves-first and builds the microfrontend's own chunk graph over them, evaluating the entry module last. Minting is serialised per load.
4. A lazy target does the same on first use, as `cpt-frontx-adr-lazy-import-resolution` decides: its own chunk, the units its list names that the load's map and the realm cache lack, and the own chunks its list names, requested together in one round. For a lazy target that is a shared unit there is no own chunk: its unit joins that round. Distinct lazy targets of one load download in parallel.

A load with a fetch list therefore costs one round, and a lazy target costs one round on first use. Round counts cover only the requests the runtime issues. The fixed concurrency limit applies only to the whole-package path, a manifest that holds neither `units` nor `lists`: to whole-package entries, and to own chunks the runtime finds by walking the chunk graph rather than from a fetch list.

Which cache holds shared text, under which key, and which cache holds the microfrontend's own code, is decided in `cpt-frontx-adr-shared-dep-cache-reach`, together with the reach and byte budget of the realm cache.

**Whole-package entries.** A manifest that holds neither `units` nor `lists` loads through `shared[]` and the whole-package path (a manifest that holds either names a fetch list for every exposed module, and a load of an exposed module it names none for is refused as manifest data, naming the missing key): each `shared` entry names the one file that holds the package (`chunkPath`), and the runtime fetches every declared entry. `shared` is optional; a manifest without it declares no whole-package entries, and a load of a manifest that holds none of `shared`, `units` and `lists` fetches the entry module and the own chunks it finds by walking the chunk graph. This is the compatibility path for microfrontends built by older producers, which describe shared code only as whole-package entries. It does not reverse the rejection of **fetch every declared shared entry** as the delivery model: when a fetch list exists, the runtime fetches only what it names. A `shared` entry may carry a `contentHash`, which keys whole-package entry reuse as `cpt-frontx-adr-shared-dep-reuse` decides. The producer of this contract writes `units` and `lists` and writes no `shared` entries and no whole-package files.

**Compatibility scope.** The fields the contract accepts as known-but-ignored are the fields the manifests that older producers' builds actually write carry, checked against real build output as well as against the older contract's schema text. A current shell loads microfrontends built by older producers: their manifest and MFE entry register and load, and the fields they carry that the runtime does not read are accepted and ignored. A shell older than the producer is not supported: an older shell does not read `units` or `lists`, and the contract promises it nothing.

**Failure scope.** A manifest or MFE entry that the type system rejects at registration, or that fails the load, disables only that microfrontend: the extension is not registered or its `loadState` becomes `error`, and the shell, the domains and every other microfrontend keep working.

**Unresolved specifiers.** This decision owns one rule for every load path — list items, own chunks and whole-package entries, on the exposed module's load and on a lazy target's first use alike. A declared shared-dependency name that survives rewriting fails the load — on a lazy target's first use, that lazy import — with an `MfeLoadError` naming the chunk, the specifier and the microfrontend. An undeclared bare specifier that survives rewriting produces a console warning naming the same three.

**Location.** Each location kind resolves against one base:

| Location kind | Resolves against | Relative location must stay inside the base | Absolute http(s) URL accepted |
|---|---|---|---|
| Shared unit (`units[].location`) | `metaData.sharedBase` when given, otherwise `metaData.publicPath` | yes | yes, under the location rules below |
| Own chunk, including one a fetch list names | `metaData.publicPath` | no | yes |
| Entry module and stylesheets | `metaData.publicPath` | no | yes |
| `chunkPath` of a shared entry | `metaData.publicPath` | yes | yes, under the location rules below |

A relative `sharedBase` resolves against the resolved `publicPath` directory; once resolved, it must be an http(s) URL, and `sharedBase` never changes how an own chunk or a `chunkPath` resolves. For the kinds that must stay inside their base, every location, absolute or relative, fails the load before any request when it carries a percent-encoded dot, a backslash, a space or a control character, when it names a scheme other than http(s) or is protocol-relative (`//`), or when it names a directory rather than a file. A relative location also fails when it climbs out of the base (a `..` segment or a leading `/`). An absolute http(s) URL is exempt only from that stay-inside-the-base test. A lazy target's record is keyed by the target's chunk location relative to the base that chunk resolves against: `publicPath` for an own chunk, `sharedBase` for a shared unit; a lazy target reached by a bare dynamic import of a shared package is keyed by that bare specifier.

**Content identity.** A content identity is a declaration: the producer computes it at build time and declares it in the manifest — the `contentHash` of every shared unit and of every whole-package entry that carries one. The runtime takes the declared identity as the key under which the text is shared, and admits the text fetched for it under that key as fetched. Like the locations beside it, the declared identity is part of the admitted manifest data; it is a sharing key, not a grant of trust in code. A whole-package entry without a `contentHash`, including one whose `chunkPath` is an absolute cross-origin URL, is shared under its absolute location, under the reuse scope `cpt-frontx-adr-shared-dep-reuse` decides.

**Trust.** The runtime treats a registered MFE entry and the manifest it references as admitted input; authenticating them is outside the package. The manifest names the origin of a microfrontend's code. A microfrontend's own code — its entry module, its stylesheets, its further chunks, its lazy chunks and the own chunks a fetch list names — carries no content identity, because it is not shared. It is trusted by the locations the MFE entry and the manifest name, with no origin or containment check, so absolute URLs are accepted.

**Closed contract.** The type system's manifest and MFE entry types accept exactly the fields listed below; any other property is rejected. The fields marked as older-producer fields are part of the contract as known-but-ignored: the runtime reads none of them, and the closure still rejects every property the table does not list. A manifest without `units`, `lists` or `metaData.sharedBase` is valid.

| Contract | Field | Required | Read by the runtime to |
|---|---|---|---|
| Manifest | `id` | yes | identify the manifest and name it in diagnostics |
| Manifest | `metaData` | yes | hold the asset base location and the shared base location |
| Manifest | `metaData.publicPath` | yes | resolve the entry module, its stylesheets, the own chunks and each `chunkPath`; and resolve shared-unit locations when `metaData.sharedBase` is absent |
| Manifest | `metaData.sharedBase` | no | resolve shared-unit locations |
| Manifest | `units` | no | hold each shared unit once, as an array |
| Manifest | `units[].location` | yes, in each unit | locate the unit's text |
| Manifest | `units[].contentHash` | yes, in each unit | key the unit's text and let lists reference the unit |
| Manifest | `units[].answers` | yes, in each unit | rewrite the bare specifiers the unit answers |
| Manifest | `units[].imports` | yes, in each unit | order minting by the unit's import edges |
| Manifest | `lists` | no | hold every fetch list once: each exposed module's, keyed by exposed module, and each lazy target's or pattern-import matching file's, keyed by the target's chunk location, or by the bare specifier when the target is reached by a bare dynamic import of a shared package |
| Manifest | `lists.<module>.units` | yes, in each list | name the units, by `contentHash`, the module needs |
| Manifest | `lists.<module>.ownChunks` | yes, in each list | name the own chunks the module reaches statically |
| Manifest | `lists.<key>.lazy`, `lists.<key>.patterns` | no | name, as arrays of keys of `lists`, the lazy targets and the pattern-import matching files the list reaches; a key is the target's chunk location relative to the base that chunk resolves against, or, for a lazy target reached by a bare dynamic import of a shared package, that bare specifier |
| Manifest | `shared` | no | declare the shared entries of the whole-package path |
| Manifest | `shared[].name`, `shared[].version` | yes, in each entry | name each shared entry, rewrite bare specifiers and key whole-package entry reuse |
| Manifest | `shared[].chunkPath` | yes, in each entry | locate a whole-package entry |
| Manifest | `shared[].contentHash` | no | key a whole-package entry's reuse |
| Manifest | `name`, `remoteEntry`, `metaData.name`, `metaData.type`, `metaData.globalName` | no | none: older-producer fields, accepted and ignored; each a string |
| Manifest | `metaData.buildInfo` | no | none: an older-producer field, accepted and ignored; an object whose `buildVersion` and `buildName` are strings |
| Manifest | `metaData.remoteEntry` | no | none: an older-producer field, accepted and ignored; an object whose `name` and `path` are strings and whose `type` is `module` or `global` |
| Manifest | `shared[].unwrapKey` | no | none: an older-producer field, accepted and ignored; a string or null |
| MFE entry | `id` | yes | identify the entry and name it in diagnostics |
| MFE entry | `manifest` | yes | reference the registered manifest by its identifier |
| MFE entry | `exposedModule` | yes | name the exposed module, which keys `lists` |
| MFE entry | `exposeAssets` | yes | hold the entry module and stylesheet locations |
| MFE entry | `exposeAssets.js.sync` | yes, non-empty | locate the entry module; only its first element is read |
| MFE entry | `exposeAssets.js.async` | no | none: an older-producer field, accepted and ignored; an array of strings |
| MFE entry | `exposeAssets.css.sync`, `exposeAssets.css.async` | yes | locate the exposed module's stylesheets |

The MFE entry contract also includes the base entry fields it inherits, and they are part of the contract: `id` (required), `requiredProperties` (required), `optionalProperties` (optional), `actions` (required) and `domainActions` (required).

Value formats are part of the contract and are enforced by the type system: a package `name` contains no colon, a `version` contains neither `:` nor `@`, and every `contentHash`, in the unit table and in a list's `units`, is 64 lowercase hexadecimal characters.

A manifest or MFE entry that carries any property outside this contract, lacks a required field or holds a value outside its format is rejected, and the type system validates the whole manifest, the unit table and the lists included, when it is registered. The contract is stated by the table above and realized twice — by the runtime's manifest and MFE entry types and by the type system's manifest and MFE entry types — and the two list the same fields with the same required flags, the older-producer fields among them: the runtime's types carry them as optional fields they never read. A field enters the contract in one change that adds it to this table, to the runtime's types and to the type system's types; the runtime reads nothing else.

**Discovery path.** The manifest-driven path is the only discovery path, and code outside the package admits text to the realm cache only through the shared-unit fetcher on `./unit-loader`, as `cpt-frontx-adr-shared-dep-cache-reach` decides.

Because producers and the runtime share the contract, compatibility of its shape follows `cpt-frontx-nfr-evolvability`. While the project is at major version 0, a contract change — additive or not — takes no contract-version bump, and backward-incompatible changes are expected. A new field is accepted by the runtime before producers emit it. Handler selection — which handler services a given MFE entry — is decided separately in `cpt-frontx-adr-mfe-handler-resolution`; this decision fixes only that, whichever handler is selected, discovery is manifest-driven.

### Consequences

* Good, because the runtime depends on a declared contract rather than on bundler-internal output, so discovery survives changes in how a microfrontend is compiled.
* Good, because discovery is bundler- and substrate-neutral: any conforming toolchain that emits the entry and manifest shape can be loaded.
* Good, because the entry and manifest carry everything an isolated load needs, so a load requires no secondary parse.
* Good, because a load downloads only the units its exposed module's fetch list names, which serves `cpt-frontx-nfr-resource-efficiency`.
* Good, because every fetch list is part of the registered manifest, so every shared unit and own chunk a load needs is known before any request and a load with a fetch list costs one round.
* Good, because the lists are validated with the manifest under the closed contract, so no second, unvalidated contract exists outside the registered description.
* Good, because shared text is keyed by the content identity producers declare, so loads that declare the same identity reuse one fetch, and the text fetched for that identity is admitted as fetched.
* Good, because the closed contract types make the contract complete: a field that is used but absent from the contract is rejected at validation instead of being found in the field.
* Good, because producer and consumer share one shape, keeping the two sides symmetric.
* Bad, because the manifest grows with the unit table and the lists, so it is larger to register and to hold.
* Bad, because a manifest or MFE entry with a property outside the contract is rejected, so a new field must enter the contract — and be accepted by the runtime — before producers emit it.
* Bad, because every microfrontend must supply a conforming entry and manifest, so the contract is a precondition for loadability; while the project is at major version 0, a contract change, additive or not, needs no contract-version bump, so producers must follow contract changes as they land.
* Bad, because correct sharing rests on producers: the runtime reuses text under the content identity its producer declares, so a load relies on each producer declaring the identity of the file it publishes.
* Bad, because a microfrontend's own code carries no content identity and is trusted by the locations the MFE entry and the manifest name, with no origin or containment check.
* Bad, because the round has no concurrency limit, so a long fetch list relies on the platform's connection limits to pace its requests.
* Good, because the contract accepts the fields older producers write, so a current shell registers and loads microfrontends built by older producers and updating the runtime package in one shell or one microfrontend does not take the product down.
* Good, because a manifest or MFE entry that fails registration or loading disables only its own microfrontend.
* Bad, because the contract carries fields the runtime ignores, and a shell older than the producer is not supported.
* Neutral, because a manifest that holds neither `units` nor `lists` uses its whole-package entries, which are fetched in full, and a manifest may omit `shared`.

### Confirmation

The runtime package's own tests confirm runtime behaviour:

* a load resolves its asset base location and entry module from the MFE entry and the manifest it reads from the registry, and completes without fetching or parsing a compiled remote-entry module;
* the entry module, every shared unit the exposed module's list names that the realm cache lacks and every own chunk the list names are all requested before any response arrives, with no limit on the number in flight and before any shared unit is minted, the entry module at high fetch priority and the rest at the default priority;
* a lazy target's own chunk, its listed units that the load's map and the realm cache lack and its listed own chunks are all requested in one round on first use;
* shared units are minted leaves-first, and the entry module is evaluated after every shared unit it reaches is minted;
* with `metaData.sharedBase` set and different from `metaData.publicPath`, the shared units are requested under `sharedBase`, while the own chunks, the entry module and stylesheets, and each `chunkPath` are requested under `publicPath`;
* a manifest and MFE entry that carry the fields older producers write, and a manifest that omits `units`, `lists` and `metaData.sharedBase`, register and load through `shared[]` with none of those fields read;
* a manifest that omits `shared` and holds neither `units` nor `lists` loads its entry module and own chunks without whole-package entries;
* a load that fails leaves the shell and every other microfrontend working;
* a manifest that holds neither `units` nor `lists` uses its whole-package entries, issues no early entry-module request, and fetches those entries and the own chunks it finds by walking the chunk graph under the fixed concurrency limit;
* a shared-unit or `chunkPath` location, absolute or relative, that carries a percent-encoded dot or a forbidden character, names another scheme or names a directory fails the load before any request, and so does a relative one that climbs out of its base; an absolute http(s) URL is accepted for every location kind; a `metaData.sharedBase` value that does not resolve to an http(s) URL fails the load before any request; and a relative `sharedBase` resolves against the resolved `publicPath` directory;
* on the exposed module's load and on a lazy target's first use, for list items, own chunks and whole-package entries alike, a declared shared name that survives rewriting fails the load naming the chunk, the specifier and the microfrontend, and an undeclared bare specifier that survives produces a warning naming the same three.

The type system's tests confirm that its manifest and MFE entry types accept every field in the table above, the unit table, the lists and the older-producer fields included, together with the inherited base entry fields, and reject a manifest or MFE entry that carries any other property, lacks a required field, has an empty `exposeAssets.js.sync`, or holds a `name`, `version` or `contentHash` outside its value format. A parity check confirms that the runtime's manifest and MFE entry types and the type system's types list the same fields with the same required flags. Absence of shared text from the handler's source-text cache, the per-load diagnostic and the retry behaviour are confirmed under `cpt-frontx-adr-shared-dep-cache-reach`. Conformance of the manifest's unit table and lists to the format contract is verified in each producer's own tests, as `cpt-frontx-adr-shared-dep-reuse` decides.

## Pros and Cons of the Options

### Enriched-manifest-driven discovery

The runtime locates and loads a microfrontend from its registered MFE entry and the registered manifest it references, which carry the asset base location, per-module asset records, the shared entries, the shared units and the fetch lists.

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
* Bad, because shared code and further chunks are found only as the chunks that import them arrive, so the number of rounds grows with the depth of the chunk graph, where a fetch list fixes it at one.
* Bad, because scanning compiled output for imports reintroduces the brittleness the discovery-source decision rejects.

### Manifest-held fetch lists

The manifest holds each shared unit once and, per exposed module and per lazy target, a fetch list that references units by content identity; the runtime reads the list from the registered manifest and fetches what it names in one round.

* Good, because only the units the fetch list names are fetched.
* Good, because every list is known from the registered manifest, so the entry module, the missing units and the own chunks are requested together in one round.
* Good, because the lists are covered by the closed manifest contract and validated with the manifest at registration.
* Good, because holding each unit once keeps the manifest compact, however many lists reference it.
* Bad, because a producing build that wants list-driven loading must emit the unit table and a list per exposed module and lazy target.
* Bad, because the manifest is larger than one that only references lists.

### Fetch lists as separate documents referenced from the manifest

The manifest references, per exposed module, a content-addressed fetch-list document; the runtime requests the document, reads it and then fetches what it names.

* Good, because the manifest stays small.
* Bad, because the documents are not validated with the manifest, so their contents rest on the producer with no check at registration.
* Bad, because each exposed module and each lazy target costs an extra request, and the names in the document are known only after it arrives, which adds a round.
* Bad, because the documents form a second contract outside the registered description.

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

### Manifest referenced by identifier

The MFE entry names a registered manifest by its identifier, and the registry holds the manifest. An MFE entry carries no inline manifest, and the type system rejects one.

* Good, because the manifest is registered and validated once under its identifier and every entry of the microfrontend shares that one description, so the manifest the load reads is the manifest that was admitted.
* Good, because the closed MFE entry contract has a single `manifest` field, so one way to locate the manifest exists.
* Bad, because the manifest must be registered before an entry that references it.

### Manifest carried inline in the MFE entry

The MFE entry embeds the manifest document itself.

* Good, because the entry is self-contained.
* Bad, because the same manifest is repeated and validated once per entry, and two entries of one microfrontend can carry different copies of it.
* Bad, because the entry has two ways to locate a manifest, an identifier and an embedded document, and the contract must define which one wins.

## More Information

The concrete field names and the asset-record shape are descriptive of the present instantiation. The durable decision is that what one load reads and fetches is discovered from a declared, closed contract — the registered MFE entry plus the registered manifest it references — rather than from parsing compiled output; that the shared fetch set is the exposed module's fetch list, held in the manifest; and that shared text is reused under the content identity its producer declares. The semantics of the fields that carry the unit table and the fetch lists (`units`, `lists`, `metaData.sharedBase`) and of the shared-entry content identity are decided in `cpt-frontx-adr-shared-dep-reuse`; the closure of the manifest and MFE entry contracts, their value formats and the location rules are decided here. How a load builds its isolated graph from the fetched sources, including how it handles cycles, is decided in `cpt-frontx-adr-mfe-load-isolation`. How far the source-text cache reaches and how it is bounded are decided in `cpt-frontx-adr-shared-dep-cache-reach`.

This record deliberately bundles three related choices — the discovery source, shared-code reachability and schema strictness — because each depends on the others: fetch lists are reachable only as part of the discovery contract, and the contract is only complete if its schema is closed.

In the present instantiation, the runtime's manifest type is defined in `packages/mfes/src/manifest/mf-manifest.ts` and its MFE entry type in `packages/mfes/src/types/mfe-entry-mf.ts`; the type system's manifest and MFE entry types realize the same contract.

**Scope of impact.** Decides the source of the information the runtime uses to locate and load a microfrontend's assets and shared code — the registered MFE entry and manifest — and which shared files one load fetches, when, from which base, under which location rules, and under which declared identity it is shared. It does not decide the unit of reuse, its identity or the format contract (decided in `cpt-frontx-adr-shared-dep-reuse`), which handler services a given MFE entry (decided in `cpt-frontx-adr-mfe-handler-resolution`), how a lazily loaded chunk is resolved into a load's isolated graph (decided in `cpt-frontx-adr-lazy-import-resolution`), nor how the manifest's type identifiers are validated (the type-system plugin's responsibility).

**Review trigger.** Revisit if the entry and manifest cannot carry everything an isolated load needs; if the project leaves major version 0, so that contract changes need a version policy under `cpt-frontx-nfr-evolvability`; if a substrate emerges for which a declared manifest cannot be produced; or if list-driven fetching exceeds the load-time budget of `cpt-frontx-nfr-runtime-performance` in compositions the platform must support.

**Checklist applicability.**

* ARCH — applicable and addressed above: the discovery-source and fetch-set decision affects every microfrontend load and the runtime's coupling to build output, and is hard to reverse once microfrontends conform to the contract.
* INT — applicable and addressed above (INT-ADR-001/002): the MFE entry and the manifest are the integration contract between a microfrontend and the runtime; compatibility follows `cpt-frontx-nfr-evolvability`, at major version 0 a contract change takes no contract-version bump, and a manifest or MFE entry carrying a field outside the contract is rejected. The type system's tests and the parity check confirm the manifest and MFE entry contracts; conformance to the manifest's list format owned by `cpt-frontx-adr-shared-dep-reuse` is verified in each producer's own tests.
* DATA — applicable and addressed above (DATA-ADR-001): the two closed contracts fix the shape of the discovery data; the field list, whether each field is required, its value format and the runtime's use of it are stated above, and the fetch-list format is decided in `cpt-frontx-adr-shared-dep-reuse`.
* SEC — applicable and addressed above: the runtime treats a registered MFE entry and its manifest as admitted input, and authenticating them is outside the package. The content identity of every shared unit, and of every whole-package entry that declares a `contentHash`, is the producer's declaration, admitted with the manifest data and used as the sharing key; it is not a grant of trust in code. A microfrontend's own code is trusted by the locations the MFE entry and the manifest name, with no origin or containment check; shared-file locations that must stay inside their base are validated before any request (`cpt-frontx-nfr-security`); a whole-package entry without a `contentHash` is shared only under its absolute location. Code-admission trust and isolation are decided in `cpt-frontx-adr-mfe-load-isolation`.
* REL — applicable and addressed above: a manifest that holds neither `units` nor `lists` uses its whole-package entries, a manifest that holds either and no list for the exposed module is refused naming the key, and a microfrontend whose manifest or entry is rejected or whose load fails disables only itself. A load that joins another load's in-flight fetch which then rejects retries once from its own URL, and a failed load admits no text after the failure and issues no further request, text admitted before the failure stays in the realm cache, and the healthy in-flight entries it published stay in the realm cache, so the next attempt joins them (`cpt-frontx-adr-shared-dep-cache-reach`).
* PERF — applicable and addressed above: a load with a fetch list costs one round — the entry module at high fetch priority, the missing shared units and the own chunks together, with no concurrency limit — and each lazy target one more on first use, within the budget of `cpt-frontx-nfr-runtime-performance`; transfer is governed by `cpt-frontx-nfr-resource-efficiency`, and the per-load diagnostic is decided in `cpt-frontx-adr-shared-dep-cache-reach`.
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

* `cpt-frontx-fr-mfe-runtime-registration` — manifest-driven discovery is how a registered microfrontend is located and loaded on demand without depending on a particular bundler's compiled output; this decision makes the registered MFE entry and manifest the runtime's discovery contract, including the unit table, the fetch lists and the value formats, and closes both contracts so that no field is used without being in the contract.
* `cpt-frontx-nfr-resource-efficiency` — a load fetches only the units its exposed module's fetch list names, and the per-load diagnostic decided in `cpt-frontx-adr-shared-dep-cache-reach` reports the bytes fetched.
* `cpt-frontx-nfr-runtime-performance` — the entry module, the missing shared units and the own chunks are requested together in one round, within this NFR's load-time budget.
* `cpt-frontx-nfr-security` — the registered MFE entry and its manifest are admitted input, shared-file locations that must stay inside their base are validated before any request, and the declared content identity is a sharing key rather than a grant of trust in code.
* `cpt-frontx-component-mfe-runtime` — this decision shapes how the MFE Runtime component discovers a microfrontend's assets and determines and fetches the shared code a load needs.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — text from outside the package enters the realm cache only through the shared-unit fetcher on `./unit-loader`, and discovery's public footprint is the one `cpt-frontx-adr-shared-dep-cache-reach` states.
* `cpt-frontx-feature-mfe-loading` — the FEATURE that specifies the manifest-discovery load path this decision fixes.
