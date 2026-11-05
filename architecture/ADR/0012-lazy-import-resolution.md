---
status: accepted
date: 2026-11-03
description: "Decides that a lazily imported chunk resolves through a runtime lazy-import ABI inherited from its parent load and binds to that load's per-load map of shared-dependency units, into which the units it reaches and the map lacks are fetched, verified, minted and added on demand."
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

The runtime loads each microfrontend as an isolated module graph. A load fetches its chunks and the shared-dependency units its entry reaches, mints per-load module references for them, and rewrites each chunk's bare dependency specifiers to the references that load built, so distinct loads never share a module instance. What a unit is follows `cpt-frontx-adr-shared-dep-reuse`; which units a load reaches, including the roots a manifest declares per lazily loaded chunk, follows `cpt-frontx-adr-mfe-asset-discovery`; the per-load map from unit identity to inline-content reference, to which lazily reached units are added without ever replacing an existing entry, follows `cpt-frontx-adr-mfe-load-isolation`.

A microfrontend that code-splits also contains lazy chunks reached through dynamic imports that resolve only when first exercised. Those lazy chunks carry the same bare dependency specifiers as the eager chunks, and they may reach shared-dependency units that no eager chunk reaches. How should a lazy chunk be resolved at the moment it is first needed so that it joins the same isolated graph as the parent load that owns it, binds every unit it shares with the eager chunks to the same instance, and obtains the units only it reaches without transferring shared code ahead of need — rather than resolving against the origin with unrewritten specifiers and thereby evaluating a second, divergent copy of those dependencies?

## Decision Drivers

* Per-load isolation must extend to lazily reached code — a lazy chunk must evaluate inside the same isolated module graph as the load that triggered it, not as a separate graph (anchors `cpt-frontx-fr-mfe-runtime-registration`).
* Shared-dependency identity must be preserved across the eager/lazy boundary — a lazy chunk's bare specifiers must bind to the identical shared-dependency references the parent load holds, so a unit reached both eagerly and lazily stays a single instance within one load.
* Deferred resolution must stay deferred — the mechanism must preserve code-splitting so a lazy chunk is fetched and evaluated only when first exercised, not pulled into the eager graph.
* Resource efficiency — `cpt-frontx-nfr-resource-efficiency` asks that only what is required be fetched and evaluated, so a lazy chunk must cause the transfer of only the shared units it reaches and the load lacks, and only when that chunk loads.
* Separation of concerns between runtime and build — the obligation that lives in the running application (resolving a lazy reference into the parent load's graph) must be cleanly separable from the obligation that lives in how a microfrontend is compiled (emitting a lazy reference the runtime can recognize).
* Substrate neutrality — the contract must hold regardless of the bundler, UI framework, or type system a microfrontend adopts, exposing only a named, stable call shape rather than any bundler-internal artifact.
* Bounded, statically resolvable inputs — the argument identifying a lazy chunk must be resolvable to a concrete sibling reference, never an arbitrary runtime-computed value, so resolution stays predictable and within the load's known chunk set (anchors `cpt-frontx-nfr-runtime-performance`).

## Considered Options

Lazy chunk resolution:

* **A runtime lazy-import ABI inherited from the parent load** — define a named runtime contract (an Application Binary Interface, ABI: a stable call shape a compiled chunk targets in place of a raw dynamic import) for every lazy reference; at load time the runtime supplies a per-load resolver, bound to that one load, that maps the lazy reference into the parent load's isolated graph and binds it to that load's per-load map of shared-dependency units. The build-time act of emitting the ABI call in compiled chunks is a separate, consumer-side contract obligation owned by build tooling in template territory, outside the ecosystem runtime's scope.
* **Native dynamic-import resolution with no runtime contract** — leave each lazy reference as a native dynamic import that resolves against the chunk's origin, accepting that the lazily fetched chunk evaluates with its own dependency bindings rather than the parent load's.
* **Build-time-only lazy splitting with eager runtime collapse** — split lazily at build time but, at runtime, fold every lazy chunk into the parent load's eager graph as it is discovered, so there is no deferred resolution and no separate runtime contract.

Shared code reached by a lazy chunk:

* **Fetch up front everything any lazy chunk could reach** — when the load starts, fetch and mint every unit reachable from any lazy chunk's roots together with the entry's units, so a lazy chunk always finds its units already in the map.
* **On-demand fetching into the shared per-load map** — when a lazy chunk loads, determine the units its roots reach, fetch, verify and mint those the load's map lacks, add them to that same map, and reuse the units already in it.
* **Idle-time text prefetch with on-demand minting** — fetch the source text of lazily reachable units while the page is idle, but mint and add them to the load's map only when a lazy chunk that reaches them loads.

## Decision Outcome

Chosen options: **a runtime lazy-import ABI inherited from the parent load** for lazy chunk resolution and **on-demand fetching into the shared per-load map** for the shared code a lazy chunk reaches, because together they are the only combination that keeps a lazily reached chunk inside the same isolated graph and bound to the same unit instances as its parent load, defers the chunk's fetch and evaluation to first use, and transfers only the shared units the chunk reaches and the load lacks. **Idle-time text prefetch with on-demand minting** is recorded as a later optimisation: it changes only when source text arrives, not how a lazy chunk binds or which instances it binds to, so adopting it changes no contract this decision sets.

**Runtime/build boundary.** The decision draws an intrinsic boundary by concern: the **runtime ABI** — the named lazy-import call contract plus the per-load resolution that routes each lazy reference into the parent load's graph and binds it to that load's per-load map — is owned by the ecosystem runtime, because only the runtime holds the per-load graph and the map a lazy chunk must bind to. The **build-time transform** that rewrites a compiled chunk's dynamic imports into the ABI call shape is consumer-side build tooling in template territory, exercised as a contract obligation a conforming microfrontend's build satisfies; it is outside the ecosystem's scope. The two halves meet only at the ABI: the runtime guarantees that any chunk targeting the contract is resolved into its parent load's graph, and a conforming build guarantees that every lazy reference in a shipped chunk targets the contract. The ABI accepts only statically resolvable references so each lazy chunk maps to a known sibling within the load's chunk set; a reference that cannot be resolved to a concrete sibling is rejected rather than resolved unpredictably.

**Binding to the per-load map.** A lazily loaded chunk binds to its parent load's per-load map of shared-dependency units, decided in `cpt-frontx-adr-mfe-load-isolation`, not to a fixed set of bindings captured when the load started. The lazy chunk's bare specifiers are rewritten to the references that map holds for the units they name.

**Units a lazy chunk reaches.** When a lazy chunk loads, the units it reaches — its roots per `cpt-frontx-adr-mfe-asset-discovery`, closed over the packages' graph files — that are not yet in the load's map are fetched, verified against their declared content identity, minted leaves-first and added to that same map. Units already in the map are reused as they are and are neither fetched nor minted again, and an existing entry is never replaced, so a module reached both eagerly and lazily is one instance within the load. Lazy chunks of one load that reach the same missing unit share its single entry, so it is minted once. A unit that fails to fetch or verify fails that lazy import, is reported through the runtime's diagnostics, and adds no entry to the map.

### Consequences

* Good, because a lazily reached chunk evaluates inside the same isolated graph as the load that triggered it, so per-load isolation is not broken at the lazy boundary.
* Good, because a lazy chunk binds to the parent load's per-load map, so a unit reached both eagerly and lazily remains one instance within a load rather than splitting into a divergent second copy.
* Good, because deferred resolution is preserved — a lazy chunk is fetched and evaluated only on first use, keeping the eager path small.
* Good, because a load transfers the shared units a lazy chunk reaches only when that chunk loads, and only those the map lacks, so code a user never exercises is never fetched (`cpt-frontx-nfr-resource-efficiency`).
* Good, because lazily reached units pass the same content-identity check as eagerly reached ones before they are minted, so the lazy path opens no unverified admission route.
* Good, because the runtime/build split is clean and intrinsic: the runtime owns what only it can own (the per-load graph and map), and the build owns only the obligation to emit the agreed call shape.
* Good, because the contract is a named call shape rather than a bundler artifact, so it holds across bundlers and substrates.
* Good, because idle-time prefetch of source text remains available as a later optimisation without any change to the binding contract.
* Bad, because the first use of a lazy chunk that reaches units the load lacks waits for those units to be fetched, verified and minted, a latency on the lazy path that is gated by the on-demand-load target of `cpt-frontx-nfr-runtime-performance`.
* Bad, because the per-load map grows over the load's lifetime as lazy chunks add units, so the units a load holds depend on which lazy chunks were exercised.
* Bad, because correct end-to-end behavior depends on two cooperating halves owned by different parties (runtime and consumer build), so a conforming build is a precondition the runtime cannot itself produce.
* Bad, because restricting the ABI argument to statically resolvable references excludes fully runtime-computed lazy paths, which must be expressed within that constraint.

### Confirmation

A continuous-integration check confirms the ABI contract holds on both sides of the boundary. On the runtime side, automated tests confirm that a lazy reference exercised within a load resolves into that load's existing graph and binds to its per-load map: a unit reached both by an eager chunk and by a lazy chunk of one load is observed as one identical instance; a lazy chunk causes the fetch of exactly the units its roots reach that the map lacks, and no fetch or minting of units already in the map; an existing map entry is never replaced; two lazy chunks of one load that reach the same missing unit bind to one instance of it; a lazily reached unit whose content does not match its declared identity fails that lazy import, is reported, and adds no entry; and a distinct concurrent load resolves its own lazy references through its own resolver and its own map rather than a sibling's. On the consumer-contract side, a build-time check in the consumer-side build tooling rejects any lazy reference whose argument is not statically resolvable, with a diagnostic pointing at the offending reference; that half rewrites each statically resolvable dynamic import to the `__frontx_lazy` call after bundling, lives in template territory, and is therefore cited by construct rather than as authoritative grounding, per `cpt-frontx-adr-template-territory-traceability`. On the runtime side the grounding is the per-load resolution path: the per-load loader stub minted by `ensureLazyLoaderUrl` in `MfeHandlerMF` (`packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`), the host-side per-load resolver table `LazyLoaderRegistry` (`packages/mfes/src/lazy-loader/LazyLoaderRegistry.ts`), and `resolveLazyChunk`, which funnels a lazy reference back into the same load's graph and per-load map (`packages/mfes/src/handler/mfe-handler-mf/MfeHandlerMF.ts`).

## Pros and Cons of the Options

### A runtime lazy-import ABI inherited from the parent load

A named runtime call contract replaces each lazy reference; a per-load resolver maps it into the parent load's isolated graph and binds it to that load's per-load map. Emitting the call shape at build time is a separate, consumer-side obligation owned by build tooling in template territory.

* Good, because it extends per-load isolation across the lazy boundary.
* Good, because lazy chunks bind to the parent load's per-load map, preserving single-instance identity within a load.
* Good, because it preserves deferred resolution — lazy chunks load only on first use.
* Good, because it draws an intrinsic runtime/build boundary, each side owning only what it can own.
* Neutral, because it depends on a stable, versionable named contract that both halves target.
* Bad, because end-to-end correctness requires a conforming consumer build the runtime cannot itself guarantee.
* Bad, because the ABI argument is restricted to statically resolvable references.

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

Every unit reachable from any lazy chunk's roots is fetched and minted when the load starts, together with the entry's units.

* Good, because a lazy chunk's first use waits on no shared-unit fetch, since its units are already in the map.
* Good, because the map is complete before any lazy chunk loads, so it never grows during the load.
* Bad, because it transfers and mints shared code for lazy chunks a user may never exercise, contrary to `cpt-frontx-nfr-resource-efficiency`.
* Bad, because it enlarges the work done when the load starts, against the load-time budget of `cpt-frontx-nfr-runtime-performance`.

### On-demand fetching into the shared per-load map

When a lazy chunk loads, the units its roots reach that the load's map lacks are fetched, verified, minted and added to that map; units already in it are reused.

* Good, because only the shared units a lazy chunk reaches and the load lacks are transferred, and only when that chunk loads.
* Good, because a unit reached both eagerly and lazily is bound once, through the same map, so it stays one instance within the load.
* Good, because lazily reached units pass the same content-identity check as eagerly reached ones.
* Bad, because the first use of such a lazy chunk waits for the missing units to be fetched, verified and minted.
* Bad, because the map's contents depend on which lazy chunks were exercised during the load.

### Idle-time text prefetch with on-demand minting

The source text of lazily reachable units is fetched while the page is idle; units are minted and added to the load's map only when a lazy chunk that reaches them loads.

* Good, because it hides most of the fetch latency on a lazy chunk's first use.
* Good, because minting and binding remain on demand, so the map and instance identity behave exactly as with on-demand fetching.
* Neutral, because it changes no contract this decision sets, so it can be adopted later as an optimisation.
* Bad, because it transfers source text for lazy chunks a user may never exercise, trading part of the transfer saving for latency.
* Bad, because it needs an idle-scheduling policy that decides what to prefetch and when.

## More Information

The present concrete instantiation expresses the ABI as the named `__frontx_lazy` call. Consumer-side build tooling in template territory converts each statically resolvable dynamic `import('<rel>')` in a compiled chunk into a `__frontx_lazy('<rel>')` call after bundling, so code-splitting is preserved, and rejects a non-statically-resolvable argument with a build-time diagnostic. At load time the runtime injects a per-load loader stub that re-exports `__frontx_lazy` bound to that load's resolver; the stub reaches the host-side resolver table through a single narrow `resolve(id, path)` entry point, and the resolver funnels the lazy reference back into the same load's blob-URL chain, rewriting its bare specifiers against that load's `sharedDepBlobUrls` map. Sibling loads receive distinct resolvers so a lazy reference routes back to the load that owns it. The present instantiation maps each declared whole-package shared entry to one reference when the load starts — the single-unit case of `cpt-frontx-adr-shared-dep-reuse` and the fetch-all case of `cpt-frontx-adr-mfe-asset-discovery` — so a lazy chunk finds every unit it reaches already in the map and reuses it. The specific contract name, the bundler stage, and the per-load reference mechanism are descriptive of the current instantiation and non-binding; the durable decision is a runtime-resolved lazy-import ABI whose per-load resolution binds a lazy chunk to its parent load's per-load map, into which the units the chunk reaches and the map lacks are added on demand, with the build-time emission of the ABI owned as a consumer-side contract obligation.

This decision composes with `cpt-frontx-adr-mfe-load-isolation`, which decides the per-load isolated module graph and the per-load map this ABI extends to lazy chunks; with `cpt-frontx-adr-mfe-asset-discovery`, which decides that roots are declared per lazily loaded chunk and that the units a lazy chunk reaches are determined and fetched when it loads; and with `cpt-frontx-adr-shared-dep-reuse`, which decides what a unit is and how it is identified.

**Scope of impact.** Decides how a lazily reached chunk is resolved into its parent load's isolated graph, how it binds to that load's per-load map, how the units it reaches and the map lacks join that map, and where the runtime/build responsibility boundary falls for that mechanism. It does not decide how the parent load's isolated graph or per-load map are built in the first place (decided in `cpt-frontx-adr-mfe-load-isolation`), how a microfrontend is discovered and located for loading or which units a lazy chunk reaches (decided in `cpt-frontx-adr-mfe-asset-discovery`), nor what a unit is (decided in `cpt-frontx-adr-shared-dep-reuse`).

**Review trigger.** Revisit if a runtime mechanism makes a lazily fetched chunk bind to a parent load's units without a named ABI, if the constraint that lazy references be statically resolvable becomes untenable for conforming microfrontends, if the runtime/build ownership boundary must shift, or if the first-use latency of lazy chunks that reach missing units exceeds the on-demand-load target of `cpt-frontx-nfr-runtime-performance`, at which point idle-time text prefetch with on-demand minting is the first optimisation to adopt.

**Checklist applicability.**

* ARCH — applicable and addressed above (a runtime resolution contract affecting every code-split microfrontend, a binding rule between lazy chunks and the per-load map, and a deliberate runtime/build ownership boundary, hard to reverse once chunks and the runtime depend on the ABI).
* PERF — applicable and addressed above (PERF-ADR-001/002): the latency-relevant trade-off is preserving deferred resolution so the eager working set stays small, at the cost of a fetch, verify and mint step on the first use of a lazy chunk that reaches units the load lacks; this anchors `cpt-frontx-nfr-runtime-performance`, whose on-demand-load target gates that step, with idle-time text prefetch recorded as the optimisation that shortens it without changing the contract. Transfer is governed by `cpt-frontx-nfr-resource-efficiency`: a lazy chunk fetches only the units it reaches and the map lacks, and a unit reached both eagerly and lazily is held once. Verification is the runtime tests on the per-load map and the build check rejecting non-resolvable references; no separate load-test harness is mandated by this decision.
* SEC — Not applicable as a primary concern: the trust-surface and code-admission decision is made in `cpt-frontx-adr-mfe-load-isolation`, and content-identity verification of fetched units is decided in `cpt-frontx-adr-mfe-asset-discovery`, which this decision applies to lazily reached units before they are minted; it adds no new dynamic-code primitive and constrains the ABI argument to statically resolvable references.
* REL — Not applicable because it governs module resolution within a load, not service availability or fault tolerance; a lazily reached unit that fails to fetch or verify fails only that lazy import.
* DATA — Not applicable because no persistent data store or schema is involved.
* INT — Not applicable as a primary concern: the ABI is an internal runtime/build contract, not an external integration boundary; the external integration boundary, including the roots declared per lazily loaded chunk, is decided in `cpt-frontx-adr-mfe-asset-discovery`.
* OPS — Not applicable because no deployed-service operational procedure is governed by this decision.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements or design elements:

* `cpt-frontx-fr-mfe-runtime-registration` — the ABI is how a code-split microfrontend's lazily reached chunks are loaded on demand into the same isolated graph as the registered microfrontend.
* `cpt-frontx-nfr-runtime-performance` — preserving deferred resolution keeps the eager working set small and serves the on-demand-load target, which also gates the fetch of units a lazy chunk reaches and the load lacks.
* `cpt-frontx-nfr-resource-efficiency` — a lazy chunk fetches only the shared units it reaches and the load lacks, when it loads, and a unit reached both eagerly and lazily is held as one instance within the load.
* `cpt-frontx-component-mfe-runtime` — this decision shapes the lazy-chunk resolution behavior of the MFE Runtime component and bounds its responsibility against consumer-side build tooling in template territory.
