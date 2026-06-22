---
status: accepted
date: 2026-04-08
decision-makers: FrontX core team
---

# Module Federation 2.0 Build Tooling with Blob URL Runtime Isolation


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [`@originjs/vite-plugin-federation` with `remoteEntry.js` source text parsing](#originjsvite-plugin-federation-with-remoteentryjs-source-text-parsing)
  - [Module Federation 2.0 standard runtime (`loadRemote` / `registerRemotes`) with shared instances](#module-federation-20-standard-runtime-loadremote--registerremotes-with-shared-instances)
  - [`@module-federation/vite` with `mf-manifest.json` declarative discovery and blob URL runtime isolation](#module-federationvite-with-mf-manifestjson-declarative-discovery-and-blob-url-runtime-isolation)
- [Review Triggers](#review-triggers)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mf2-manifest-discovery`
## Context and Problem Statement

MFE bundles are built with Module Federation and loaded at runtime through a blob URL isolation pipeline (ADR-0004, `cpt-frontx-adr-blob-url-mfe-isolation`). The handler needs to discover which chunks an MFE exposes, what shared dependencies it declares, and which CSS assets accompany its modules. Two approaches exist for this metadata discovery: parsing the federation runtime's generated `remoteEntry.js` as source text, or reading a declarative `mf-manifest.json` file that the build plugin produces alongside `remoteEntry.js`. The choice of build plugin determines which discovery mechanism is available and how shared dependency transforms are applied across the MFE bundle. The `@originjs/vite-plugin-federation` plugin's stalled development (last release April 2025) and the minification constraint create urgency for this decision. This decision affects MFE authors (who configure `vite.config.ts` and run the generation script), host application developers (who consume `generated-mfe-manifests.json` at bootstrap), and the FrontX core team (who maintain `MfeHandlerMF` and the blob URL isolation pipeline).

## Decision Drivers

* **(P0)** The blob URL isolation mechanism (ADR-0004) must remain fully functional — per-MFE module-level state isolation is non-negotiable
* **(P1)** The metadata discovery mechanism must reliably provide expose chunk paths, shared dependency declarations, and CSS asset paths regardless of minification settings or code-split chunk structure
* **(P1)** Shared dependency resolution must work across all chunks in the MFE bundle, not only the expose entry files — whether via build-time transforms or runtime specifier rewriting
* **(P1)** The build plugin must be actively maintained with a stable output contract
* **(P2)** Shared dependency metadata should include version information to enable meaningful version negotiation rather than wildcard matching
* **(P2)** The build output must support both `remoteEntry.js` and declarative manifest formats

## Considered Options

* `@originjs/vite-plugin-federation` with `remoteEntry.js` source text parsing
* Module Federation 2.0 standard runtime (`loadRemote` / `registerRemotes`) with shared instances
* `@module-federation/vite` with `mf-manifest.json` declarative discovery and blob URL runtime isolation

## Decision Outcome

Chosen option: "`@module-federation/vite` with `mf-manifest.json` declarative discovery and blob URL runtime isolation", with a hybrid approach: `@module-federation/vite` is used ONLY for expose compilation and `mf-manifest.json` generation (configured with `shared:{}` and `rollupOptions.external` to externalize shared dependencies). Shared dependencies are derived from `rollupOptions.external` in the resolved Vite config, built as standalone ESM modules by the `frontx-mf-gts` Vite plugin, and written to `{outDir}/mfe-manifest.json` (source `mfe.json` is never modified by the build). At runtime, the handler fetches standalone ESM source text (deduplicated via `sharedDepTextCache` keyed by `name@version`), rewrites bare specifiers to per-load blob URLs, and constructs the expose blob URL chain — preserving the isolation guarantee from ADR-0004 without using `@module-federation/runtime`, `FederationHost`, or any MF 2.0 shared dep mechanism.

**Aggregated-manifest transport.** The temporary generation script reads `{outDir}/mfe-manifest.json` from each MFE and writes the aggregated `generated-mfe-manifests.json` to a public-asset path at build time. The host bootstrap (and any nested FrontX app instance) fetches the aggregated manifest at runtime from that public-asset URL — script builds json, json is read at runtime. Framework code is decoupled from build-time `import` semantics, the same fetch path serves both the root host and any nested FrontX app instance, and the eventual backend API swap is a one-line URL change in the host bootstrap fetch (same enriched manifest shape, different transport). The runtime-fetch contract is codified by the framework-composition FEATURE DoD `cpt-frontx-dod-framework-composition-mfe-plugin`, which describes how `MfManifest` entities reach the GTS runtime store via this fetch.

### Consequences

* Good, because expose chunk paths and CSS assets are available via `JSON.parse()` of `mf-manifest.json` — no source text parsing or format-dependent regex required
* Good, because MFE builds can enable minification and CSS code splitting since metadata discovery does not depend on JavaScript syntax patterns
* Good, because shared dependency source text is downloaded once per `name@version` across ALL runtimes (host and MFEs) via `sharedDepTextCache` keyed by `name@version` deduplication — zero duplicate network fetches
* Good, because no `@module-federation/runtime` dependency in the handler — no `FederationHost`, no `__loadShare__` proxy chains, no `__mf_init__` globals (~70KB runtime removed)
* Good, because `{outDir}/mfe-manifest.json` is the complete self-contained build-output contract per MFE — produced by the `frontx-mf-gts` plugin with manifest metadata, shared dep info, and expose assets; source `mfe.json` keeps only authored metadata (`manifest.id`, `manifest.remoteEntry`) and is never modified; no intermediate artifacts at runtime
* Good, because the aggregated `generated-mfe-manifests.json` is fetched at runtime from a public-asset URL — framework code is decoupled from build-time `import` semantics, the same fetch path serves both the root host and any nested FrontX app instance, and the eventual backend API swap is a one-line URL change in the host bootstrap fetch (same enriched manifest shape, different transport)
* Good, because the manifest contract carries an optional `domains[]` array of MFE-declared `ExtensionDomain` instances alongside the existing `schemas[]` / `entries[]` / `extensions[]` arrays — MFEs that own one or more `ExtensionDomain` instances declare them in `domains[]` and the host bootstrap registers each into the GTS runtime store opaquely between the `MfManifest` entity and entries; the registration sequence (schemas → manifest → domains → entries → extensions) is codified by the framework-composition FEATURE DoD `cpt-frontx-dod-framework-composition-mfe-plugin`; the aggregator passes `domains[]` through verbatim (transport-only, no enrichment), preserving the runtime-fetch invariant — same enriched manifest shape regardless of transport
* Good, because `@module-federation/vite` is the official, actively maintained Vite integration for Module Federation 2.0
* Bad, because the blob URL isolation layer is a custom mechanism outside the standard MF 2.0 runtime — it consumes MF 2.0 build output as data but does not use the MF 2.0 runtime loading API (`loadRemote`, `init`)
* Bad, because the handler must rewrite bare specifiers in shared dependency source text at runtime to construct per-load blob URLs (added complexity compared to MF 2.0's built-in share scope resolution)
* Bad, because shared dependencies require a separate build step (standalone ESM via esbuild) managed by the `frontx-mf-gts` Vite plugin
* Bad, because the `mf-manifest.json` formal specification is still being finalized ([module-federation/core#2496](https://github.com/module-federation/core/issues/2496)). Mitigation: the manifest reader is isolated behind the MfeHandler abstraction — schema changes only require updating the manifest parsing logic, not the blob URL isolation pipeline
* Good, because the custom `frontx-mfe-externalize` plugin (374 lines) is replaced by `frontx-mf-gts` which handles both standalone ESM builds and manifest enrichment (output to `{outDir}/mfe-manifest.json`) in a single `closeBundle` hook
* Neutral, because MF 2.0's shared dep mechanism (share scopes, version-first strategy, singleton mode) is unused — the plugin and handler implement their own sharing/isolation via standalone ESMs and blob URLs
* Neutral, because `@module-federation/vite` configuration is similar to the previous plugin, limiting the learning curve
* Neutral, because if `@module-federation/vite` is deprecated or the manifest schema changes incompatibly, the MfeHandler abstraction allows creating a new handler implementation without affecting the registry, bridge, or mediator layers

### Confirmation

The decision is confirmed when: (1) MFE `vite.config.ts` files use `@module-federation/vite` with `shared:{}` and `rollupOptions.external` to externalize shared dependencies, (2) MFE builds produce `mf-manifest.json` for expose chunk paths alongside `remoteEntry.js`, (3) the `frontx-mf-gts` Vite plugin builds standalone ESM modules for shared dependencies and writes the enriched manifest to `{outDir}/mfe-manifest.json` with manifest metadata, shared dep info (`chunkPath`/`version`/`unwrapKey`), and expose assets (source `mfe.json` is unchanged), (4) `MfeHandlerMF.load()` builds shared dep blob URLs by fetching standalone ESMs and rewriting bare specifiers — no `createInstance()`, no `FederationHost`, no `__mf_init__`, (5) blob URL isolation tests pass — `Object.is(mfeA_React, mfeB_React)` remains `false` for concurrent loads, and (6) MFE builds succeed with `minify: true`.

## Pros and Cons of the Options

### `@originjs/vite-plugin-federation` with `remoteEntry.js` source text parsing

Use the community Vite MF 1.0 plugin. Metadata discovery requires fetching `remoteEntry.js` as text and parsing it with regex to extract the `moduleMap` callback body, expose chunk filenames, and CSS paths. A custom build-time plugin (`frontx-mfe-externalize`) is needed to transform shared imports in code-split chunks.

* Good, because it is a proven approach with existing test coverage
* Neutral, because blob URL isolation works correctly with this approach
* Bad, because metadata discovery depends on matching specific JavaScript syntax patterns in generated code — minification, formatting changes, or plugin updates break discovery silently
* Bad, because shared dependency transforms only apply to expose entry files, requiring a 374-line custom Vite plugin to handle code-split chunks
* Bad, because `@originjs/vite-plugin-federation` is a community project with stalled development (last release April 2025)
* Bad, because shared dependency declarations lack version metadata — the handler uses wildcard `'*'` keys, making version negotiation non-functional

### Module Federation 2.0 standard runtime (`loadRemote` / `registerRemotes`) with shared instances

Use MF 2.0's runtime API for module loading and shared dependency resolution. Standard `loadRemote()` calls handle metadata discovery, chunk loading, and share scope initialization.

* Good, because full alignment with the MF 2.0 ecosystem — standard API, standard tools, standard debugging
* Good, because no custom loading code is needed
* Bad, because MF 2.0's runtime produces shared module instances (singleton/versioned), not per-load isolated instances — multiple MFEs would share React, Redux, and EventBus state
* Bad, because shared instances violate the per-MFE isolation requirement from ADR-0004, which is the foundation of the MFE state management and communication model

### `@module-federation/vite` with `mf-manifest.json` declarative discovery and blob URL runtime isolation

Use MF 2.0's build plugin for expose compilation and manifest generation only (`shared:{}`, `rollupOptions.external`). The `frontx-mf-gts` Vite plugin derives shared dependencies from `rollupOptions.external` in the resolved Vite config, builds standalone ESM modules for them via esbuild, and writes the enriched manifest to `{outDir}/mfe-manifest.json` (source `mfe.json` is never modified). At runtime, the handler fetches standalone ESM source text (deduplicated via `sharedDepTextCache` keyed by `name@version`), rewrites bare specifiers to per-load blob URLs, and constructs the expose blob URL chain from ADR-0004. A temporary generation script reads `{outDir}/mfe-manifest.json` from each MFE for host bootstrap.

* Good, because `mf-manifest.json` is declarative JSON — reliable regardless of minification or code structure
* Good, because `{outDir}/mfe-manifest.json` is the complete self-contained build-output contract per MFE — no intermediate artifacts at runtime
* Good, because shared dep source text is downloaded once per `name@version` across all runtimes (`sharedDepTextCache` keyed by `name@version` deduplication)
* Good, because blob URL isolation is preserved — the pipeline receives chunk URLs from the enriched `{outDir}/mfe-manifest.json` instead of from regex, and shared deps get per-load blob URLs via bare specifier rewriting
* Good, because `@module-federation/vite` is actively maintained with regular releases
* Good, because no `@module-federation/runtime` in the handler — simpler loading code with no `FederationHost`, `__loadShare__`, or `__mf_init__` globals
* Neutral, because MF 2.0's shared dep mechanism (share scopes, version-first strategy) is unused — the plugin and handler implement their own sharing/isolation
* Bad, because the approach diverges from the MF 2.0 standard loading path, reducing the benefit of ecosystem tooling (e.g., Chrome DevTools module graph requires standard runtime)
* Bad, because the handler must rewrite bare specifiers at runtime (added complexity) and shared deps require a standalone ESM build step

## Review Triggers

This decision should be revisited when:
* `@module-federation/vite` introduces a breaking change to `mf-manifest.json` format
* The Module Federation project releases a formal manifest specification that diverges from the current runtime types
* A Vite-native alternative to `@module-federation/vite` emerges with better isolation support
* Browser platforms introduce native module isolation scopes that could replace blob URL evaluation
* Calendar review: no later than 2027-Q1 or when any trigger fires, whichever comes first.
* Invalidation condition: this decision becomes invalid if `@module-federation/vite` is abandoned with no maintained fork or if the blob URL isolation mechanism is no longer required.

## More Information

* Operational impact (OPS): Not applicable — client-side build output and in-browser runtime behavior.
* ADR-0004 (`cpt-frontx-adr-blob-url-mfe-isolation`) — establishes the blob URL isolation mechanism that this decision preserves
* `@module-federation/vite` — official Vite plugin for Module Federation 2.0
* `mf-manifest.json` specification tracking: [module-federation/core#2496](https://github.com/module-federation/core/issues/2496)
* Issues addressed by this decision: #249 (build plugin coupling), #250 (minification constraint), #251 (CSS discovery), #252 (shared dependency contract), #253 (concurrent load race condition)
* Learning curve: `@module-federation/vite` configuration is similar to `@originjs/vite-plugin-federation` — the primary learning investment is understanding the hybrid approach: `mf-manifest.json` for expose metadata, standalone ESMs for shared deps, and bare specifier rewriting in the handler
* Evolution path: if `@module-federation/vite` is deprecated or the manifest schema changes incompatibly, the MfeHandler abstraction allows creating a new handler implementation without affecting the registry, bridge, or mediator layers

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)
- **ADR-0004**: [0004-blob-url-mfe-isolation.md](0004-blob-url-mfe-isolation.md)

This decision directly addresses the following design elements:

* `cpt-frontx-seq-mfe-loading` — MFE loading sequence uses pre-registered GTS entities (sourced from `generated-mfe-manifests.json`) for metadata discovery
* `cpt-frontx-contract-federation-runtime` — federation build contract: `@module-federation/vite` producing `mf-manifest.json` for expose chunk paths; `frontx-mf-gts` plugin building standalone ESMs and writing enriched manifest to `{outDir}/mfe-manifest.json`; handler building shared dep blob URLs with bare specifier rewriting
* `cpt-frontx-contract-mfe-manifest` — MFE manifest contract: `mfe.json` as human-authored source, `{outDir}/mfe-manifest.json` produced by plugin as the complete self-contained build-output contract per MFE; `mf-manifest.json` as build-time intermediate consumed by plugin only
* `cpt-frontx-principle-mfe-isolation` — isolation principle preserved; blob URL mechanism from ADR-0004 consumes manifest metadata
