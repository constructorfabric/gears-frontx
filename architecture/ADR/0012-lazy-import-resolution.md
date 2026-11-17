---
status: accepted
date: 2026-11-17
description: "Decides that every literal and pattern dynamic import resolves through a runtime lazy-import ABI inherited from its parent load and binds to that load's per-load map of shared-dependency units, into which the units a lazy target reaches and the map lacks are minted on demand after at most two rounds, fetching only those the realm cache lacks; a fully opaque import(expr) stays native as the one accepted exception."
---

# Lazy Dynamic Import Resolution

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A runtime lazy-import ABI inherited from the parent load](#a-runtime-lazy-import-abi-inherited-from-the-parent-load)
  - [Native dynamic-import resolution with no runtime contract](#native-dynamic-import-resolution-with-no-runtime-contract)
  - [Build-time-only lazy splitting with eager runtime collapse](#build-time-only-lazy-splitting-with-eager-runtime-collapse)
  - [Fetch up front everything any lazy chunk could reach](#fetch-up-front-everything-any-lazy-chunk-could-reach)
  - [On-demand fetching into the shared per-load map](#on-demand-fetching-into-the-shared-per-load-map)
  - [Idle-time text prefetch with on-demand minting](#idle-time-text-prefetch-with-on-demand-minting)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-lazy-import-resolution`

## Context and Problem Statement

The runtime loads each microfrontend as an isolated module graph. A load fetches its chunks and the shared-dependency units its exposed module reaches, mints per-load module references for them, and rewrites each chunk's bare dependency specifiers to the references that load built, so distinct loads never share a module instance. What a unit, an own chunk and a round are, and which units a load reaches — including the fetch list a lazy target carries — follow `cpt-frontx-adr-shared-dep-reuse`. How the manifest locates the fetch-list documents follows `cpt-frontx-adr-mfe-asset-discovery`. The per-load map from unit identity to inline-content reference follows `cpt-frontx-adr-mfe-load-isolation`; lazily reached units are added to that map and never replace an existing entry.

A microfrontend that code-splits also contains lazy chunks, reached through dynamic imports that resolve only when first exercised. Those lazy chunks carry the same bare dependency specifiers as the eager chunks, and they may reach shared-dependency units that no eager chunk reaches. How should a lazy chunk be resolved when it is first needed, so that it joins the same isolated graph as the parent load that owns it, binds every unit it shares with the eager chunks to the same instance, and obtains the units only it reaches without transferring shared code ahead of need — rather than resolving against the origin with unrewritten specifiers and evaluating a second, divergent copy of those dependencies?

## Decision Drivers

* Per-load isolation must extend to lazily reached code — a lazy chunk must evaluate inside the same isolated module graph as the load that triggered it, not as a separate graph (anchors `cpt-frontx-fr-mfe-runtime-registration`).
* Shared-dependency identity must be preserved across the eager/lazy boundary — a lazy chunk's bare specifiers must bind to the identical shared-dependency references the parent load holds, so a unit reached both eagerly and lazily stays a single instance within one load.
* Deferred resolution must stay deferred — the mechanism must preserve code-splitting, so a lazy chunk is fetched and evaluated only when first exercised, not pulled into the eager graph.
* Resource efficiency — `cpt-frontx-nfr-resource-efficiency` asks that only what is required be fetched and evaluated, so a lazy chunk must cause the transfer of only the shared units it reaches and the load lacks, and only when that chunk loads.
* Separation of concerns between runtime and build — the obligation that lives in the running application (resolving a lazy reference into the parent load's graph) must be cleanly separable from the obligation a microfrontend's build output carries (a lazy reference the runtime can recognize).
* Substrate neutrality — the contract must hold regardless of the bundler, UI framework or type system a microfrontend adopts, exposing only a named, stable call shape rather than any bundler-internal artifact.
* Statically resolvable or statically bounded references — producers emit the ABI call for every dynamic import whose target is statically resolvable (a literal) or statically bounded (a pattern), and report each fully opaque import, so each lazy target and its fetch list are known when the microfrontend is built (anchors `cpt-frontx-nfr-runtime-performance`).

## Considered Options

Lazy chunk resolution:

* **A runtime lazy-import ABI inherited from the parent load** — define a named runtime contract (an Application Binary Interface, ABI: a stable call shape a compiled chunk targets in place of a raw dynamic import) for every lazy reference. At load time the runtime supplies a per-load resolver, bound to that one load, that maps the lazy reference into the parent load's isolated graph and binds it to that load's per-load map of shared-dependency units. A conforming build's output carries the ABI call in place of each lazy reference.
* **Native dynamic-import resolution with no runtime contract** — leave each lazy reference as a native dynamic import that resolves against the chunk's origin, accepting that the lazily fetched chunk evaluates with its own dependency bindings rather than the parent load's.
* **Build-time-only lazy splitting with eager runtime collapse** — split lazily at build time but, at runtime, fold every lazy chunk into the parent load's eager graph as it is discovered, so there is no deferred resolution and no separate runtime contract.

Shared code reached by a lazy chunk:

* **Fetch up front everything any lazy chunk could reach** — when the load starts, fetch and mint every unit named by any lazy chunk's fetch list together with the exposed module's units, so a lazy chunk always finds its units already in the map.
* **On-demand fetching into the shared per-load map** — when a lazy chunk loads, read the fetch list of the units it needs, fetch and mint those the load's map lacks, add them to that same map, and reuse the units already in it.
* **Idle-time text prefetch with on-demand minting** — fetch the source text of lazily reachable units while the page is idle, but mint and add them to the load's map only when a lazy chunk that reaches them loads.

## Decision Outcome

Chosen options: **a runtime lazy-import ABI inherited from the parent load** for lazy chunk resolution and **on-demand fetching into the shared per-load map** for the shared code a lazy chunk reaches. Together they are the only combination that keeps a lazily reached chunk inside the same isolated graph as its parent load, binds it to the same unit instances, defers its fetch and evaluation to first use, and transfers only the shared units it reaches and the load lacks. **Idle-time text prefetch with on-demand minting** is rejected, because it transfers source text for lazy chunks a user may never exercise.

**Runtime/build boundary.** The decision draws a boundary by concern. The **runtime ABI** — the named lazy-import call contract plus the per-load resolution that routes each lazy reference into the parent load's graph and binds it to that load's per-load map — is owned by the ecosystem runtime, because only the runtime holds the per-load graph and the map a lazy chunk must bind to. Code reaches the ABI in two ways. In a microfrontend's own chunks, the **build output obligation** is that producers emit the ABI call for every statically resolvable or statically bounded dynamic import and report each fully opaque import; for a pattern import, the producer also writes a fetch list per matching file. Inside a shared unit — a list item or a whole-package entry — the build emits nothing runtime-specific: when the runtime mints the unit for a load, it rewrites every literal and every pattern dynamic import to the ABI call. A rewritten pattern import passes its runtime-computed path, which the runtime resolves through the pattern records of the load's fetch lists on a load that has them, and by walking the chunk graph on a whole-package load. The unit's bytes therefore stay the same for every consumer. The two halves meet only at the ABI: the runtime guarantees that any call targeting the contract is resolved into its parent load's graph, and a conforming build's output guarantees that every literal and pattern dynamic import in its own chunks targets the contract. The runtime resolves the ABI argument against the base of the chunk that makes the call: `publicPath` for the microfrontend's own code and for a whole-package entry, whose `chunkPath` resolves against `publicPath`; `sharedBase` for a list item.

**Binding to the per-load map.** A lazily loaded chunk binds to its parent load's per-load map of shared-dependency units, decided in `cpt-frontx-adr-mfe-load-isolation`, not to a fixed set of bindings captured when the load started. The lazy chunk's bare specifiers are rewritten to the references that map holds for the units they name.

**Units a lazy chunk reaches.** On a load whose exposed module has a fetch list, a lazy target behaves like an exposed module. Its first use always waits for its fetch-list document. In the first round, the runtime requests that document together with the target's own chunk; for a lazy target that is a shared unit, its list item comes in the second round instead. The list names the shared units the target needs beyond its parent chain's lists and, by location only, the microfrontend's own chunks the target reaches statically (`cpt-frontx-adr-shared-dep-reuse`). In the second round, the runtime requests the shared units missing from both the load's map and the realm cache, together with the own chunks the list names, as one flat batch with no concurrency limit. A first use therefore costs at most two rounds. The fetched units are minted leaves-first and added to that same map. Units already in the map are reused as they are and are neither fetched nor minted again, and an existing entry is never replaced, so a module reached both eagerly and lazily is one instance within the load. Concurrent resolutions of one lazy target share the same rounds, so a missing unit is fetched and minted once. Distinct lazy targets of one load download in parallel; minting is serialised per load. A unit that fails to fetch fails that lazy import with an `MfeLoadError`, adds no entry to the map, and leaves later, independent lazy imports of the same load unaffected.

**Lazy target without a fetch list.** On a load whose exposed module has a fetch list, what happens when a lazy target's location matches no lazy-target fetch list in the load's lists depends on the code that makes the call. A call from a shared unit fails the lazy load with an `MfeLoadError` naming the target and the MFE entry. A shared unit's lazy target is shared code, which the runtime admits only as a list item under its declared content identity; with no fetch list there is nothing declared to fetch, so the call fails rather than loading shared text no declaration names. A call from the microfrontend's own code produces one console warning per handler for each chunk and entry, naming the chunk and the MFE entry, and loads with the units the load's map already holds: own code carries no content identity and is trusted by its location, as `cpt-frontx-adr-mfe-asset-discovery` decides.

**Whole-package loads.** A load whose exposed module has no fetch list uses whole-package entries, each minted once when the load starts, and carries no lazy-target fetch lists, so the rule for a lazy target without a fetch list applies only to fetch-list loads. On a whole-package load the runtime finds a lazy target and the own chunks it reaches by walking the chunk graph from the target, and binds them to the whole-package units already in the map. Every literal and pattern dynamic import inside a whole-package entry is rewritten to the ABI call at mint time, as in any shared unit, and the call resolves by that same graph walk.

**Unresolved specifiers.** On the lazy path, a declared shared-dependency name or an undeclared bare specifier that survives rewriting is handled as `cpt-frontx-adr-mfe-asset-discovery` decides for every load path.

**Opaque dynamic imports.** The ABI covers every literal and every pattern dynamic import, in a microfrontend's own chunks and in shared units alike, and one exception is accepted. A fully opaque `import(expr)` — neither a literal nor a statically bounded pattern — stays native: it resolves through the browser's own module loading, outside the load's isolated graph, so isolation is not guaranteed for it. The project that uses a library containing one carries that risk, and producers report each occurrence with its file and line.

### Consequences

* Good, because a lazily reached chunk evaluates inside the same isolated graph as the load that triggered it, so per-load isolation is not broken at the lazy boundary.
* Good, because a lazy chunk binds to the parent load's per-load map, so a unit reached both eagerly and lazily remains one instance within a load rather than splitting into a divergent second copy.
* Good, because deferred resolution is preserved — a lazy chunk is fetched and evaluated only on first use, keeping the eager path small.
* Good, because a load transfers the shared units a lazy chunk reaches only when that chunk loads, and only those the map lacks, so code a user never exercises is never fetched (`cpt-frontx-nfr-resource-efficiency`).
* Good, because lazily reached units are shared under the content identity their fetch list declares, as eagerly reached ones are, so the lazy path reuses the same realm-cache entries.
* Good, because the runtime/build split follows ownership: the runtime owns what only it can own (the per-load graph and map), and the build output carries only the agreed call shape.
* Good, because the contract is a named call shape rather than a bundler artifact, so it holds across bundlers and substrates.
* Bad, because the first use of a lazy target waits for its fetch-list document and for the units the load lacks to be fetched and minted — at most two rounds on the lazy path, bounded by the on-demand-load target of `cpt-frontx-nfr-runtime-performance`.
* Bad, because the per-load map grows over the load's lifetime as lazy chunks add units, so the units a load holds depend on which lazy chunks were exercised.
* Bad, because correct end-to-end behaviour depends on two cooperating halves owned by different parties (runtime and build), so conforming build output is a precondition the runtime cannot itself produce.
* Bad, and accepted: a fully opaque `import(expr)` stays native, outside the load's isolated graph, so isolation is not guaranteed for it; the project that uses a library containing one carries that risk, and producers report each occurrence with its file and line.

### Confirmation

The runtime package's own tests confirm the runtime half of the contract:

* on first use, a lazy target's fetch-list document and its own chunk are both requested before either response arrives, and a lazy target that is a shared unit has its list item requested with the second round;
* once the target's fetch-list document arrives, every shared unit missing from the load's map and the realm cache and every own chunk the list names is requested before any response of that batch arrives, with no limit on the number in flight, and before any of them is minted;
* a unit already in the load's map is neither fetched nor minted again, and its entry is not replaced;
* concurrent resolutions of the same lazy target issue each request once and mint each missing unit once;
* two distinct lazy targets first used together have their requests in flight at the same time, and their minting does not overlap;
* when `metaData.sharedBase` differs from `metaData.publicPath`, an own lazy chunk finds the fetch list recorded under its location relative to `publicPath`, and a lazy target that is a shared unit finds the one recorded under its location relative to `sharedBase`;
* on a fetch-list load, a call from the microfrontend's own code whose target matches no lazy-target fetch list produces one console warning per handler for that chunk and entry, naming both, and the chunk loads with the units already in the map;
* sibling loads receive distinct resolvers, so a lazy reference routes back to the load that owns it;
* minting a shared unit rewrites every literal and every pattern dynamic import in it to the ABI call, and leaves a fully opaque `import(expr)` unchanged;
* on a fetch-list load, a call from a shared unit whose target matches no lazy-target fetch list fails the lazy load with an `MfeLoadError` naming the target and the MFE entry;
* a lazily reached unit that fails to fetch fails that lazy import, adds no entry to the map, and does not block a later, independent lazy import on the same load;
* on a whole-package load, a lazy target and the own chunks it reaches are found by walking the chunk graph and bind to the whole-package units in the map, and a dynamic import inside a whole-package entry is rewritten to the ABI call and resolved the same way.

The runtime half is realized by the lazy-import resolution path in `MfeHandlerMF` (`packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`): `resolveLazyChunk` routes a lazy reference back into the same load's graph, `ensureLazySharedDepList` loads the lazy target's fetch list into the load's map, and `resolveListImport` resolves the ABI calls inside list items. The per-load resolvers are held in the package-internal resolver table `LazyLoaderRegistry` (`packages/mfes/src/lazy-loader/LazyLoaderRegistry.ts`). The build half is an obligation on producer output and is verified in each producer's own tests.

## Pros and Cons of the Options

### A runtime lazy-import ABI inherited from the parent load

A named runtime call contract replaces each lazy reference; a per-load resolver maps it into the parent load's isolated graph and binds it to that load's per-load map. A conforming build's output carries the call shape.

* Good, because it extends per-load isolation across the lazy boundary.
* Good, because lazy chunks bind to the parent load's per-load map, preserving single-instance identity within a load.
* Good, because it preserves deferred resolution — lazy chunks load only on first use.
* Good, because it draws a runtime/build boundary by ownership, each side owning only what it can own.
* Neutral, because it depends on a stable named contract that both halves target.
* Bad, because end-to-end correctness requires conforming build output the runtime cannot itself guarantee.
* Bad, because a fully opaque `import(expr)` cannot target the ABI and stays native, outside the load's isolated graph.

### Native dynamic-import resolution with no runtime contract

Each lazy reference stays a native dynamic import resolving against the chunk's origin, with no runtime mediation.

* Good, because it requires no contract and no per-load resolver, keeping the mechanism minimal.
* Good, because it relies only on native module-loading semantics.
* Bad, because the lazily fetched chunk resolves with its own dependency bindings, so a singleton dependency can split into a divergent second instance within one logical load.
* Bad, because the lazy chunk escapes the parent load's isolated graph, breaking per-load isolation at the lazy boundary.

### Build-time-only lazy splitting with eager runtime collapse

Code is split lazily at build time, but at runtime every lazy chunk is folded into the parent load's eager graph as it is discovered.

* Good, because every chunk shares the parent load's bindings and isolated graph by construction.
* Good, because there is no separate runtime contract to define or version.
* Bad, because folding lazy chunks into the eager graph defeats deferred resolution, pulling code into the eager path that was meant to load on demand.
* Bad, because discovering and eagerly resolving the full lazy set enlarges the eager working set against the runtime-performance targets.

### Fetch up front everything any lazy chunk could reach

Every unit named by any lazy chunk's fetch list is fetched and minted when the load starts, together with the exposed module's units.

* Good, because a lazy chunk's first use waits on no shared-unit fetch, since its units are already in the map.
* Good, because the map is complete before any lazy chunk loads, so it never grows during the load.
* Bad, because it transfers and mints shared code for lazy chunks a user may never exercise, contrary to `cpt-frontx-nfr-resource-efficiency`.
* Bad, because it enlarges the work done when the load starts, against the load-time budget of `cpt-frontx-nfr-runtime-performance`.

### On-demand fetching into the shared per-load map

When a lazy chunk loads, the units its fetch list names that the load's map lacks are fetched, minted and added to that map; units already in it are reused.

* Good, because only the shared units a lazy chunk reaches and the load lacks are transferred, and only when that chunk loads.
* Good, because a unit reached both eagerly and lazily is bound once, through the same map, so it stays one instance within the load.
* Good, because lazily reached units are shared under their declared content identity, as eagerly reached ones are.
* Bad, because the first use of such a lazy chunk waits for the missing units to be fetched and minted.
* Bad, because the map's contents depend on which lazy chunks were exercised during the load.

### Idle-time text prefetch with on-demand minting

The source text of lazily reachable units is fetched while the page is idle; units are minted and added to the load's map only when a lazy chunk that reaches them loads.

* Good, because it hides most of the fetch latency on a lazy chunk's first use.
* Good, because minting and binding remain on demand, so the map and instance identity behave exactly as with on-demand fetching.
* Bad, because it transfers source text for lazy chunks a user may never exercise, contrary to `cpt-frontx-nfr-resource-efficiency`.
* Bad, because it needs an idle-scheduling policy that decides what to prefetch and when.

## More Information

The present instantiation expresses the ABI as the named `__frontx_lazy` call, reached in two ways. In a microfrontend's own chunks, a conforming build's output carries `__frontx_lazy('<rel>')` in place of each literal dynamic `import('<rel>')`, and a `__frontx_lazy` call with the computed path in place of each pattern import — a template literal with a statically bounded pattern — so code-splitting is preserved; the runtime resolves the argument against the base of the chunk that makes the call. Inside a list item, the runtime rewrites every literal dynamic import at mint time to a `__frontx_lazy` call whose argument names its target — a target with its own fetch list, an item already on the load's lists, or a bare specifier the load answers — and every pattern import to a `__frontx_lazy` call with the runtime-computed path; a call whose target the load's lists do not resolve fails with an `MfeLoadError`. Inside a whole-package entry, the runtime rewrites every literal and pattern dynamic import to a `__frontx_lazy` call with the target's path, which the resolver follows by walking the chunk graph. For a pattern import, the runtime resolves the computed path to its concrete file and loads the fetch list recorded for that file as it loads a lazy target's. At load time the runtime injects a per-load loader stub that exports `__frontx_lazy` bound to that load's resolver. The stub reaches the package-internal resolver table through a realm-global entry point with a single `resolve(id, path)` operation, and the resolver routes the lazy reference back into the same load's chain of inline-content references, rewriting its bare specifiers against that load's map. Sibling loads receive distinct resolvers, so a lazy reference routes back to the load that owns it. The realm-global entry point is a same-realm coordination point, not an isolation boundary: code already running in the realm can reach it, the same trust model `cpt-frontx-adr-shared-dep-cache-reach` states for the realm cache.

The on-demand list path is the present instantiation of how a lazy chunk obtains its units: the exposed module's fetch list carries, per lazy target, a reference to that target's own fetch list, keyed by the lazy target's chunk location relative to the base that chunk resolves against: `publicPath` for an own chunk, `sharedBase` for a shared unit (`cpt-frontx-adr-shared-dep-reuse`, `cpt-frontx-adr-mfe-asset-discovery`). A load whose exposed module has no fetch list uses whole-package entries: each declared whole-package entry is minted once when the load starts, so a lazy chunk, found with the own chunks it reaches by walking the chunk graph from it, finds every unit it reaches already in the map and reuses it. The contract name, the stub mechanism and the per-load reference mechanism are descriptive of the present instantiation; the durable decision is a runtime-resolved lazy-import ABI whose per-load resolution binds a lazy chunk to its parent load's per-load map, into which the units the chunk reaches and the map lacks are added on demand, with the ABI call carried by conforming build output.

This decision composes with `cpt-frontx-adr-mfe-load-isolation`, which decides the per-load isolated module graph and the per-load map this ABI extends to lazy chunks; with `cpt-frontx-adr-mfe-asset-discovery`, which decides that the manifest is the discovery contract for a load; and with `cpt-frontx-adr-shared-dep-reuse`, which decides what a unit is, how it is identified and how fetch lists name the units a lazy chunk needs.

**Scope of impact.** Decides how a lazily reached chunk is resolved into its parent load's isolated graph, how it binds to that load's per-load map, how the units it reaches and the map lacks join that map, and where the runtime/build responsibility boundary falls for that mechanism. It does not decide how the parent load's isolated graph or per-load map are built (decided in `cpt-frontx-adr-mfe-load-isolation`), how a microfrontend is discovered and located for loading (decided in `cpt-frontx-adr-mfe-asset-discovery`), nor what a unit is and which units a lazy chunk needs (decided in `cpt-frontx-adr-shared-dep-reuse`).

**Review trigger.** Revisit if a runtime mechanism makes a lazily fetched chunk bind to a parent load's units without a named ABI; if the constraint that lazy references be statically resolvable or statically bounded becomes untenable for conforming microfrontends; if fully opaque `import(expr)` calls in libraries that conforming microfrontends use cause isolation failures that their projects cannot accept; if the runtime/build ownership boundary must shift; or if the first-use latency of lazy chunks that reach missing units exceeds the on-demand-load target of `cpt-frontx-nfr-runtime-performance`.

**Checklist applicability.**

* ARCH — applicable and addressed above: a runtime resolution contract affecting every code-split microfrontend, a binding rule between lazy chunks and the per-load map, and a deliberate runtime/build ownership boundary, hard to reverse once chunks and the runtime depend on the ABI.
* PERF — applicable and addressed above (PERF-ADR-001/002): deferred resolution keeps the eager working set small, at the cost of at most two rounds and a mint step on the first use of a lazy target; distinct lazy targets of one load download in parallel. The on-demand-load target of `cpt-frontx-nfr-runtime-performance` bounds that step. Transfer is governed by `cpt-frontx-nfr-resource-efficiency`: a lazy chunk fetches only the units it reaches and the map lacks, and a unit reached both eagerly and lazily is held once. Verification is the runtime tests listed under Confirmation.
* SEC — applicable and addressed above: lazily reached units are shared under the content identity their fetch list declares, as `cpt-frontx-adr-mfe-asset-discovery` decides, and a shared unit's lazy target without a fetch list fails rather than loading shared text no declaration names; a fully opaque `import(expr)` stays native and is the one accepted exception to isolation, with its risk carried by the project that uses such a library; the resolver table's realm-global entry point is a same-realm coordination point, not an isolation boundary; code-admission trust is decided in `cpt-frontx-adr-mfe-load-isolation`, and this decision adds no new dynamic-code primitive.
* REL — applicable and addressed above: a lazily reached unit that fails to fetch fails only that lazy import and adds no entry to the map, and a later, independent lazy import on the same load is unaffected; on a fetch-list load, a call from a shared unit whose target has no fetch list fails with an `MfeLoadError` rather than loading shared text no declaration names.
* DATA — Not applicable because no persistent data store or schema is defined here; the fetch-list format the lazy lists use is decided in `cpt-frontx-adr-shared-dep-reuse`.
* INT — applicable and addressed above (INT-ADR-001/002): the `__frontx_lazy` call shape and the convention that a lazy target's fetch list is keyed by its chunk location relative to the base that chunk resolves against are the contract between a producing build's output and the runtime; a change to either is a contract change for every producer.
* OPS — Not applicable because this is a library mechanism; no deployed-service operational procedure is governed by this decision.
* MAINT — applicable and addressed above: the ABI is a single named call shape, so the runtime resolver and every producer evolve against one stable contract; the resolver table stays internal to the package.
* TEST — applicable and addressed above: the runtime package's own tests listed under Confirmation verify the runtime half, and each producer's own tests verify that its output targets the ABI.
* COMPL — Not applicable because no regulated or personal data is processed.
* UX — Not applicable because the decision shapes module resolution, not rendered output; its user-visible effect is first-use latency, addressed under PERF.
* BIZ — Not applicable because this is a technical decision; product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-runtime-registration` — the ABI is how a code-split microfrontend's lazily reached chunks are loaded on demand into the same isolated graph as the registered microfrontend.
* `cpt-frontx-nfr-runtime-performance` — preserving deferred resolution keeps the eager working set small and serves the on-demand-load target, which also bounds the fetch of units a lazy chunk reaches and the load lacks.
* `cpt-frontx-nfr-resource-efficiency` — a lazy chunk fetches only the shared units it reaches and the load lacks, when it loads, and a unit reached both eagerly and lazily is held as one instance within the load.
* `cpt-frontx-component-mfe-runtime` — this decision shapes the lazy-chunk resolution behaviour of the MFE Runtime component and bounds its responsibility against the output of the build that produces a microfrontend.
* `cpt-frontx-adr-mfe-load-isolation` — the decision that builds the per-load graph and map this ABI extends to lazy chunks.
* `cpt-frontx-adr-shared-dep-reuse` — the decision that defines units, own chunks, rounds and the fetch lists a lazy target carries.
* `cpt-frontx-adr-mfe-asset-discovery` — the decision that fixes the load sequence, the location rules and the handling of unresolved specifiers on every load path.
