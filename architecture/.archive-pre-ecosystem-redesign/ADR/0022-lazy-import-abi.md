---
status: accepted
date: 2026-05-12
decision-makers: FrontX core team
---

# Lazy-Import Resolution via Plugin AST Transform + Handler Runtime ABI


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Plugin AST transform of dynamic `import()` + handler runtime resolver (`__frontx_lazy`)](#plugin-ast-transform-of-dynamic-import--handler-runtime-resolver-frontxlazy)
  - [Handler-side regex rewriting of dynamic `import()` calls in compiled output](#handler-side-regex-rewriting-of-dynamic-import-calls-in-compiled-output)
  - [Plugin inlining of all lazy chunks into the entry chunk](#plugin-inlining-of-all-lazy-chunks-into-the-entry-chunk)
  - [Service Worker URL interception for lazy chunks](#service-worker-url-interception-for-lazy-chunks)
  - [Module Federation 2.0 native runtime for lazy resolution](#module-federation-20-native-runtime-for-lazy-resolution)
- [Review Triggers](#review-triggers)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-lazy-import-abi`

## Context and Problem Statement

ADR-0004 (`cpt-frontx-adr-blob-url-mfe-isolation`) establishes per-MFE module isolation by minting unique blob URLs for each load and rewriting bare specifiers in the entry chunk's source text against the per-load `sharedDepBlobUrls` map. ADR-0019 (`cpt-frontx-adr-mf2-manifest-discovery`) governs the build plugin's role in supplying that pipeline with `mf-manifest.json` metadata. Both decisions are silent on what happens when a vendor MFE uses dynamic `import('<relative-path>')` inside its source — the lazy-chunk path. The QA verdict for plan `fix-mfe-lifecycle-and-load-cache` (archived 2026-05-12) made the gap concrete: the UIKit Elements demo MFE's `lifecycle-uikit` chunk lazy-imports `./LayoutElements-*.js`, the browser fetches the lazy sub-chunk directly from the deployment origin, and the sub-chunk contains an unresolved bare `import "react"` because the handler's bare-specifier rewriter only ran on the entry chunk.

FrontX is a meta-framework for SaaS platforms extensible by external vendor MFEs at runtime. Vendors cannot be told to avoid lazy loading — route-level code splitting and on-demand component imports are standard patterns in modern React/Vue/Solid app architecture. Whatever mechanism FrontX uses to resolve lazy imports MUST preserve lazy semantics (chunks fetched on demand, not eagerly) AND per-load isolation (lazy chunks inherit the parent load's `sharedDepBlobUrls` so `import "react"` inside a lazy chunk resolves to the same React module instance as the entry chunk's `import "react"`).

The question is where the rewriting responsibility lives: in the build plugin (AST-level transform on vendor source before compilation), in the handler (regex rewriting on compiled output before evaluation), or outside the isolation pipeline entirely (service worker, MF 2.0 native runtime). The choice affects the build plugin's surface area, the handler's runtime complexity, the stability of the contract that vendor MFEs depend on, and whether new vendor MFEs need to know about FrontX-specific internals.

This decision affects MFE vendors (whose source is transformed at build time and whose lazy imports resolve through a FrontX-owned runtime ABI), the FrontX core team (who maintain both halves of the contract), and host application developers (who trust that vendor MFEs ship with working lazy loading regardless of where the MFE is hosted).

## Decision Drivers

* **(P0)** Per-MFE isolation invariant from ADR-0004 must extend to lazy chunks — `Object.is(mfeA_React_inside_lazy_chunk, mfeA_React_inside_entry_chunk) === true` while remaining `false` against any other MFE's React; sibling extensions sharing an entry get distinct lazy-chunk blob URLs.
* **(P0)** Lazy semantics must be preserved — chunks fetched on demand at first invocation, not eagerly at parent load time.
* **(P0)** The build-time transform must use stable, public Vite APIs — no reliance on Vite or Rollup internals that change between minor releases.
* **(P1)** Vendor MFEs must be able to use ordinary dynamic `import()` calls without learning a FrontX-specific source-level API — the build pipeline owns compliance, not the vendor author.
* **(P1)** The mechanism must not introduce `@gears-frontx/*` runtime dependencies into vendor MFEs at runtime; the runtime ABI is host-injected, not imported by the MFE.
* **(P1)** The never-revoke invariant (`cpt-frontx-fr-blob-no-revoke`) must hold for lazy-chunk blob URLs as it does for entry-chunk blob URLs.
* **(P2)** The mechanism must work alongside `@module-federation/vite`'s `closeBundle` output without requiring changes to MF 2.0 build internals.

## Considered Options

* Plugin AST transform of dynamic `import()` + handler runtime resolver (`__frontx_lazy`).
* Handler-side regex rewriting of dynamic `import()` calls in compiled output.
* Plugin inlining of all lazy chunks into the entry chunk (eager bundling).
* Service Worker URL interception for lazy chunks.
* Module Federation 2.0 native runtime for lazy resolution.

## Decision Outcome

Chosen option: **"Plugin AST transform of dynamic `import()` + handler runtime resolver (`__frontx_lazy`)"**.

The `frontx-mf-gts` Vite plugin uses Vite's `transform` hook (a stable public API operating on the module AST, not on compiled output) to rewrite every dynamic `import('<relative-path>')` call in vendor MFE source to `__frontx_lazy('<relative-path>')`. `MfeHandlerMF` provides a runtime function `__frontx_lazy.load(relativePath)` bound into the per-load scope that resolves the relative path against the manifest's `publicPath`, fetches the lazy chunk's source text through the existing URL-keyed `sourceTextCache`, recursively rewrites bare specifiers AND nested `__frontx_lazy()` calls against the parent load's `sharedDepBlobUrls`, creates a per-load blob URL within the parent load's `LoadBlobState.blobUrlMap`, and returns the blob URL string — the caller's transformed code resolves that string via `import()` and gets a `Promise<Module>` with the parent load's shared modules already wired.

The contract is recorded as DoD `cpt-frontx-dod-mfe-isolation-lazy-import-abi` in `architecture/features/feature-mfe-isolation/FEATURE.md`.

### Consequences

* Good, because per-MFE isolation extends to lazy chunks by construction — each lazy chunk's blob URL is owned by the parent load's `LoadBlobState.blobUrlMap`, inherits the parent load's `sharedDepBlobUrls`, and is therefore sibling-isolated for free (sibling extensions sharing an entry get distinct parent loads per `cpt-frontx-dod-mfe-isolation-handler-load-cache`, so they also get distinct lazy-chunk blob URLs).
* Good, because lazy semantics are preserved — `__frontx_lazy.load(path)` returns a blob URL, and the caller's transformed `import(blobUrl)` produces a `Promise<Module>` exactly like the original `import(relativePath)` would have; chunks are fetched on demand, not eagerly.
* Good, because vendors write ordinary dynamic `import()` calls in source; the plugin transforms them at build time without the vendor knowing about FrontX internals. The vendor contract is "build with `frontx-mf-gts`" — it does not extend to learning a new source-level API.
* Good, because the build-time transform uses Vite's `transform` hook on the AST — a stable public API. The handler's runtime ABI uses ordinary JavaScript function calls injected through the existing blob URL scope plumbing — also stable, since the handler owns its own runtime surface.
* Good, because `sourceTextCache` reuse extends to lazy chunks for free (URL-keyed; one fetch per URL across all loads).
* Bad, because the handler's runtime now owns a small public-shape ABI (`__frontx_lazy`) that vendor MFEs depend on through their compiled output. Mitigation: the ABI is host-injected at evaluation time, not part of any vendor-import-able package; changes to the resolver's internals are invisible to the vendor as long as the call shape (`__frontx_lazy('<path>')` returns a `Promise<blobUrlString>` or equivalent) stays stable.
* Bad, because the build-time transform must detect dynamic `import()` patterns reliably; fully runtime-computed paths (e.g., `import(somePathBuiltFromRequestData)`) can't be statically rewritten. Mitigation: the plugin errors at build time on patterns it can't handle, forcing the vendor to refactor rather than silently emitting broken output.
* Neutral, because the transform applies only to vendor MFE source under the MFE's `src/`; the plugin's own standalone-ESM shared dep bundles (built by esbuild in `closeBundle`) and host source are unaffected.

### Confirmation

The decision is confirmed when: (1) the `frontx-mf-gts` plugin's `transform` hook rewrites `import('<relative-path>')` → `__frontx_lazy('<relative-path>')` in vendor MFE source; (2) `MfeHandlerMF` exposes a `__frontx_lazy.load(path)` runtime resolver bound into the per-load scope; (3) a vendor MFE built with the plugin and loaded through the handler can dynamically import a lazy chunk that contains `import "react"`, and that `import "react"` resolves to the parent load's React blob URL — verified by `Object.is(React_inside_lazy, React_inside_entry) === true`; (4) the UIKit Elements demo MFE renders correctly (the historical failure mode that prompted this decision is resolved); (5) `sourceTextCache` shows the lazy chunk URL is fetched at most once across multiple parent loads of the same MFE.

## Pros and Cons of the Options

### Plugin AST transform of dynamic `import()` + handler runtime resolver (`__frontx_lazy`)

* Good, because the responsibility split is clean: the plugin owns build-time AST rewrites (a build-system concern), the handler owns runtime resolution (a runtime-system concern), and the connection between them is a single named ABI.
* Good, because Vite's `transform` hook is a stable public API operating on the AST — robust against minification, code-style changes, and Rollup internals.
* Good, because the handler reuses the existing `sourceTextCache`, `sharedDepBlobUrls`, `blobUrlMap`, and rewrite plumbing — no new caches, no new isolation primitives.
* Good, because the ABI is small and host-injected — no vendor-import-able package, no version skew, no client-side compatibility shim required.
* Bad, because two systems (plugin + handler) must stay in sync on the ABI shape — `__frontx_lazy` is a contract surface that both sides depend on.

### Handler-side regex rewriting of dynamic `import()` calls in compiled output

* Good, because it requires no build-plugin work — the handler intercepts dynamic `import()` after the bundle is compiled.
* Bad, because dynamic `import()` after Vite/Rollup compilation appears in many shapes (`__vite_dynamic_import__`, helper wrappers, glob-import expansions) that vary across Vite versions and across the consuming code's optimization settings. Regex-matching all of them is fragile and silently breaks on Vite updates.
* Bad, because regex on compiled output cannot distinguish vendor source from compiled helper code — false positives risk corrupting the runtime helpers themselves.
* Bad, because relying on compiled-output shape contradicts the lesson from `@originjs/vite-plugin-federation` (ADR-0019, rejected option) — metadata discovery via source-text parsing breaks under minification and across plugin updates. Lazy-import rewriting via regex on compiled output would have the same brittleness.

### Plugin inlining of all lazy chunks into the entry chunk

* Good, because the entry chunk becomes a single self-contained bundle — no lazy resolution needed at runtime, no `__frontx_lazy` ABI.
* Bad, because it defeats the purpose of lazy loading — chunks that should be fetched on demand become part of the entry chunk's initial download.
* Bad, because the entry chunk grows monotonically with the size of the lazy-loaded surface; a route-level code-split app would download every route on entry-chunk load.
* Bad, because vendor MFEs that rely on lazy loading for memory or startup-time reasons (large component libraries, heavy charting libs, conditional dashboards) would regress materially compared to their stand-alone deployment.

### Service Worker URL interception for lazy chunks

* Good, because URL interception is transparent to the MFE bundle and requires no build-time changes — the SW intercepts lazy-chunk fetches and rewrites their bodies on the fly.
* Bad, because the SW's lifecycle is independent of the per-load `LoadBlobState` — wiring the SW to a parent load's `sharedDepBlobUrls` would require encoding the parent load ID in every lazy-chunk URL, which the SW can't do without cooperation from the bundler (defeating the "transparent" claim).
* Bad, because SW installation and activation timing is asynchronous and uneven across browsers — a load racing the SW would see unintercepted requests. The handler's blob URL chain has no such race because it owns the entire fetch and evaluation pipeline.
* Bad, because the SW would need to fetch, rewrite, AND serve back a synthetic response for every lazy-chunk request; the request-response cycle adds latency that the in-process handler path does not.

### Module Federation 2.0 native runtime for lazy resolution

* Good, because MF 2.0's runtime supports dynamic remote loading natively via `loadRemote`.
* Bad, because the FrontX architecture explicitly rejected the MF 2.0 runtime in ADR-0019 — its shared-deps mechanism produces shared module instances, not isolated ones, breaking the ADR-0004 isolation invariant. Re-introducing MF 2.0 runtime for lazy chunks alone would re-introduce the same isolation regression at the lazy-chunk layer.
* Bad, because MF 2.0's `loadRemote` is designed for entry-point loading of separately deployed remotes — it is not the right API for intra-MFE lazy chunks. Using it would be an architectural mis-fit.

## Review Triggers

This decision should be revisited when:

* Vite's `transform` hook changes shape or stability guarantees in a future major release — would require evaluating an alternative AST-level entry point.
* MF 2.0 (or whatever shared-deps mechanism FrontX uses) introduces native per-load isolation that subsumes the blob URL chain — would also subsume the lazy-import ABI, since the half of the contract that wires lazy chunks to `sharedDepBlobUrls` would become unnecessary.
* Browsers introduce a JS-accessible primitive for scoped dynamic imports (per-realm import maps reachable at runtime, or a new `ImportScope` API) — would offer a native alternative to the per-load blob URL chain for both entry and lazy chunks.
* The plugin transform's build-time error rate (patterns it cannot handle) becomes a recurring vendor friction — would prompt revisiting whether the transform pattern coverage should be widened or whether a runtime fallback path is warranted.
* Calendar review: when any trigger fires, or alongside ADR-0004's / ADR-0019's next review (currently 2027-Q1), whichever comes first.

**Invalidation condition**: this decision becomes invalid if FrontX abandons the blob URL isolation mechanism, or if the plugin/handler split becomes architecturally unsupportable (e.g., if a future build pipeline collapses plugin and handler into a single component).

## More Information

- Operational impact (OPS): Not applicable — purely an in-browser build-and-runtime contract.
- Origin: QA verdict for plan `fix-mfe-lifecycle-and-load-cache` (archived 2026-05-12) surfaced the UIKit Elements `import "react"` failure inside a lazy sub-chunk; the resolution thread in plan `fix-handler-isolation-fallback-lazy` analyzed the responsibility-split alternatives and chose the plugin-AST + handler-ABI option for the reasons documented above.
- Vendor contract: "build with `frontx-mf-gts` (or equivalent)" — vendors do not need to learn the runtime ABI; the plugin enforces the contract at build time. New vendors integrating FrontX-compatible MFEs only need to install the plugin and follow the standard Vite config pattern.
- Related: ADR-0004 (`cpt-frontx-adr-blob-url-mfe-isolation`) — establishes the per-load blob URL mechanism that this decision extends to lazy chunks.
- Related: ADR-0019 (`cpt-frontx-adr-mf2-manifest-discovery`) — governs the build plugin that this decision extends with the `transform` hook.
- Related: ADR-0020 (`cpt-frontx-adr-mfe-state-lifecycle-boundary`) — the host-owns-module-scope half of the lifecycle boundary; this decision is fully compatible (the lazy-import ABI is host-side runtime infrastructure, not an author-facing API).

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)
- **FEATURE**: [features/feature-mfe-isolation/FEATURE.md](../features/feature-mfe-isolation/FEATURE.md) — DoD `cpt-frontx-dod-mfe-isolation-lazy-import-abi`
- **ADR-0004**: [0004-blob-url-mfe-isolation.md](0004-blob-url-mfe-isolation.md) — establishes the blob URL isolation mechanism this decision extends to lazy chunks
- **ADR-0019**: [0019-mf2-manifest-discovery.md](0019-mf2-manifest-discovery.md) — governs the `frontx-mf-gts` plugin extended by this decision

This decision directly addresses:
* `cpt-frontx-fr-blob-no-revoke` (lazy-chunk blob URLs participate in the never-revoke invariant)
* `cpt-frontx-fr-blob-import-rewriting` (bare-specifier rewriting extends to lazy chunks)
* `cpt-frontx-fr-blob-recursive-chain` (lazy chunks join the recursive blob URL chain on demand)
* `cpt-frontx-fr-blob-source-cache` (`sourceTextCache` reused for lazy chunks)
* `cpt-frontx-fr-blob-per-load-map` (lazy-chunk blob URLs are owned by the parent load's `LoadBlobState.blobUrlMap`)
* `cpt-frontx-principle-mfe-isolation` (isolation invariant holds for lazy-loaded chunks as well as the entry chunk)
