# Feature: MFE Discovery & Lazy-Import Loading


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [On-Demand MFE Load via Manifest Discovery](#on-demand-mfe-load-via-manifest-discovery)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Manifest-Driven Discovery](#manifest-driven-discovery)
  - [Lazy-Import ABI Resolution](#lazy-import-abi-resolution)
- [4. States (CDSL)](#4-states-cdsl)
  - [MFE Load Lifecycle State Machine](#mfe-load-lifecycle-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Manifest Fields Drive Discovery — No Remote-Entry Parsing](#manifest-fields-drive-discovery--no-remote-entry-parsing)
  - [Lazy-Import ABI Inherits Parent Load Bindings](#lazy-import-abi-inherits-parent-load-bindings)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-mfe-loading`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-mfe-loading`

### 1.1 Overview

This feature drives microfrontend asset discovery from an enriched published manifest and resolves lazy dynamic imports through a per-load runtime ABI that inherits the parent load's shared-dependency bindings — so the runtime stays decoupled from template build internals and lazy chunks always join their parent load's isolated graph.

### 1.2 Purpose

The MFE Runtime must locate a microfrontend's chunks without parsing bundler-emitted output, and code-split MFEs must have their lazily reached chunks resolve inside the same isolated module graph as their parent load. This feature provides the manifest-driven discovery contract and the lazy-import ABI that together satisfy on-demand loading without coupling the runtime to any particular bundler or build substrate.

**Requirements**: `cpt-frontx-fr-mfe-runtime-registration`, `cpt-frontx-nfr-runtime-performance`

**Principles**: none owned by this feature

### 1.3 Actors

| Actor | Role in Feature |
|-------|-----------------|
| `cpt-frontx-actor-project-developer` | Registers a microfrontend entry (with its manifest) against the registry, triggering on-demand load when the extension is first needed |

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **ADRs**: `cpt-frontx-adr-mf-manifest-discovery`, `cpt-frontx-adr-lazy-import-abi`
- **Component**: `cpt-frontx-component-mfe-runtime` (shared with F4, F6, F7, F8)
- **Dependencies**: `cpt-frontx-feature-mfe-registry` (F4)

## 2. Actor Flows (CDSL)

User-facing interactions that start with an actor (human or external system) and describe the end-to-end flow of a use case. Each flow has a triggering actor and shows how the system responds to actor actions.

**Use cases**: `cpt-frontx-usecase-add-microfrontend-to-project`

### On-Demand MFE Load via Manifest Discovery

- [ ] `p1` - **ID**: `cpt-frontx-flow-mfe-loading-on-demand-load`

**Actor**: `cpt-frontx-actor-project-developer`

**Success Scenarios**:
- Developer registers an MFE entry with a conforming manifest; the registry loads it on demand when the extension is first exercised and returns a lifecycle module factory.

**Error Scenarios**:
- Manifest is absent or malformed — load fails at MANIFEST_RESOLVED, entry transitions to LOAD_FAILED.
- Expose chunk backing file is empty in the manifest — load fails at LOADING.
- A lazy chunk's relative path cannot be resolved within the load's chunk set — lazy resolution fails and the load transitions to LOAD_FAILED.

**Steps**:
1. [ ] - `p1` - Developer supplies a microfrontend entry to the registry, including the entry's manifest reference (`MfeEntry` with manifest field) — `inst-register-entry`
2. [ ] - `p1` - Registry triggers on-demand load for the entry when the extension is first needed — `inst-trigger-load`
3. [ ] - `p1` - System validates that the entry's manifest carries the required declared fields (`metaData.publicPath`, `exposeAssets`, `shared[]`) — `inst-validate-manifest-fields`
4. [ ] - `p1` - **IF** required manifest fields are absent or malformed — `inst-if-manifest-invalid`
   1. [ ] - `p1` - **RETURN** load failure; entry transitions to LOAD_FAILED — `inst-manifest-invalid-fail`
5. [ ] - `p1` - System derives the asset base URL from `manifest.metaData.publicPath` — `inst-derive-base-url`
6. [ ] - `p1` - System executes manifest-driven discovery (see §3 `cpt-frontx-algo-mfe-loading-manifest-discovery`) to build shared-dependency blob URLs and locate the expose chunk — `inst-run-manifest-discovery`
7. [ ] - `p1` - System mints a per-load lazy-import ABI resolver stub and registers it with the host-side registry (see §3 `cpt-frontx-algo-mfe-loading-lazy-import-abi`) — `inst-mint-lazy-stub`
8. [ ] - `p1` - System fetches and rewrites the expose chunk's bare specifiers to the per-load blob URLs, producing an isolated module blob URL — `inst-rewrite-expose-chunk`
9. [ ] - `p1` - System imports the expose chunk blob URL and extracts the lifecycle module factory — `inst-import-expose-chunk`
10. [ ] - `p1` - **IF** lazy chunks are exercised during mount — `inst-if-lazy-exercised`
    1. [ ] - `p1` - System resolves each `__frontx_lazy(path)` call via the per-load ABI resolver; each lazy chunk joins the same isolated graph and inherits the parent load's shared-dependency bindings — `inst-resolve-lazy-chunks`
11. [ ] - `p1` - System collects CSS paths from `exposeAssets.css.sync` and `exposeAssets.css.async` for stylesheet injection at mount — `inst-collect-css`
12. [ ] - `p1` - **RETURN** lifecycle module factory and stylesheet paths to the registry — `inst-return-lifecycle`

## 3. Processes / Business Logic (CDSL)

Internal system functions and procedures that do not interact with actors directly. These are reusable building blocks called by Actor Flows or other processes.

### Manifest-Driven Discovery

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-loading-manifest-discovery`

**Input**: `MfeEntry` with a resolved `MfManifest` (fields: `metaData.publicPath`, `shared[]` in dependency order, `exposeAssets` per entry)

**Output**: asset base URL, expose chunk filename, stylesheet paths, ordered shared-dependency blob URLs

**Steps**:
1. [ ] - `p1` - Read `manifest.metaData.publicPath` as the asset base URL for all chunk references in this MFE — `inst-md-read-public-path`
2. [ ] - `p1` - Read `exposeAssets.js.sync[0]` as the expose chunk filename; if empty, emit a load error — `inst-md-read-expose-chunk`
3. [ ] - `p1` - Read `exposeAssets.css.sync` and `exposeAssets.css.async` as the stylesheet asset paths — `inst-md-read-css`
4. [ ] - `p1` - **FOR EACH** entry in `manifest.shared[]` (leaves-first dependency order) — `inst-md-for-each-shared`
   1. [ ] - `p1` - Resolve `shared.chunkPath` against the asset base URL to form the standalone ESM fetch URL — `inst-md-resolve-chunk-path`
   2. [ ] - `p1` - Fetch the standalone ESM source text for this shared dependency — `inst-md-fetch-shared-dep`
   3. [ ] - `p1` - Rewrite bare specifiers in the fetched source to the already-resolved blob URLs of earlier (already processed) shared dependencies — `inst-md-rewrite-specifiers`
   4. [ ] - `p1` - Mint a blob URL for this shared dependency and record it in the per-load shared-dep blob URL map — `inst-md-mint-shared-blob`
5. [ ] - `p1` - **RETURN** asset base URL, expose chunk filename, stylesheet paths, and the completed shared-dep blob URL map — `inst-md-return`

### Lazy-Import ABI Resolution

- [ ] `p1` - **ID**: `cpt-frontx-algo-mfe-loading-lazy-import-abi`

**Input**: `LoadState` carrying the per-load shared-dep blob URL map, asset base URL, and entry chunk filename; a lazy chunk relative path emitted as `__frontx_lazy(path)` by the build-time transform

**Output**: a blob URL for the lazy chunk, joined to the parent load's isolated graph with its shared-dependency bindings inherited

**Steps**:
1. [ ] - `p1` - At load time, mint a per-load loader stub (tiny ESM blob) that re-exports `__frontx_lazy` as a function closed over this load's resolver identifier — `inst-lai-mint-stub`
2. [ ] - `p1` - Register the per-load resolver in the host-side `__FRONTX_LAZY__` global registry, keyed by the load's resolver identifier — `inst-lai-register-resolver`
3. [ ] - `p1` - Inject the loader stub's blob URL into every chunk in this load that references the `__frontx_lazy` identifier, so compiled lazy calls reach this load's resolver — `inst-lai-inject-stub`
4. [ ] - `p1` - **WHEN** `__frontx_lazy(path)` is first exercised in a loaded chunk — `inst-lai-when-exercised`
   1. [ ] - `p1` - Resolve the relative path against the entry chunk's directory to obtain a filename relative to the asset base URL — `inst-lai-resolve-relative-path`
   2. [ ] - `p1` - **IF** a blob URL for this filename already exists in the per-load blob URL map — `inst-lai-if-cached`
      1. [ ] - `p1` - **RETURN** the cached blob URL, skipping re-fetch and re-rewrite — `inst-lai-return-cached`
   3. [ ] - `p1` - Fetch the lazy chunk source from the asset base URL — `inst-lai-fetch-lazy-chunk`
   4. [ ] - `p1` - Rewrite bare specifiers in the lazy chunk source to the parent load's shared-dep blob URLs (inherited from the same `LoadState`) — `inst-lai-rewrite-lazy-specifiers`
   5. [ ] - `p1` - Rewrite any nested `__frontx_lazy` references in the lazy chunk to the same per-load loader stub URL — `inst-lai-rewrite-nested-lazy`
   6. [ ] - `p1` - Mint a blob URL for the lazy chunk and record it in the per-load blob URL map — `inst-lai-mint-lazy-blob`
   7. [ ] - `p1` - **RETURN** the lazy chunk's blob URL; the caller imports it, joining the parent load's isolated graph — `inst-lai-return-lazy-blob`
5. [ ] - `p1` - **IF** the relative path cannot be resolved to a known sibling chunk — `inst-lai-if-unknown`
   1. [ ] - `p1` - **RETURN** load failure — `inst-lai-unknown-fail`

## 4. States (CDSL)

### MFE Load Lifecycle State Machine

- [ ] `p1` - **ID**: `cpt-frontx-state-mfe-loading-load-lifecycle`

**States**: PENDING, MANIFEST_RESOLVED, LOADING, LOADED, LOAD_FAILED

**Initial State**: PENDING

**Transitions**:
1. [ ] - `p1` - **FROM** PENDING **TO** MANIFEST_RESOLVED **WHEN** the entry's manifest is present and all required fields (`metaData.publicPath`, `exposeAssets`, `shared[]`) are validated — `inst-lt-pending-to-resolved`
2. [ ] - `p1` - **FROM** PENDING **TO** LOAD_FAILED **WHEN** the manifest is absent, malformed, or required fields are missing — `inst-lt-pending-to-failed`
3. [ ] - `p1` - **FROM** MANIFEST_RESOLVED **TO** LOADING **WHEN** shared-dep blob URLs are built, expose chunk filename is confirmed, and the per-load lazy-import ABI resolver stub is minted — `inst-lt-resolved-to-loading`
4. [ ] - `p1` - **FROM** LOADING **TO** LOADED **WHEN** the expose chunk blob URL is minted, imported, and a valid lifecycle module factory is extracted — `inst-lt-loading-to-loaded`
5. [ ] - `p1` - **FROM** LOADING **TO** LOAD_FAILED **WHEN** any step in blob URL chain construction, expose chunk fetch, or lifecycle import fails — `inst-lt-loading-to-failed`

## 5. Definitions of Done

### Manifest Fields Drive Discovery — No Remote-Entry Parsing

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-loading-manifest-field-discovery`

The system **MUST** derive every locating fact needed for a microfrontend load exclusively from the declared fields of the published manifest (`metaData.publicPath`, `exposeAssets.js.sync[0]`, `exposeAssets.css.sync`, `exposeAssets.css.async`, `shared[]`) without fetching or parsing a compiled remote-entry module. The `shared[]` array **MUST** be processed in declared dependency order (leaves first) so each shared dependency's blob URL is available before the dependents that reference it as a bare specifier are processed.

**Implements**:
- `cpt-frontx-flow-mfe-loading-on-demand-load`
- `cpt-frontx-algo-mfe-loading-manifest-discovery`

**Addresses**:
- `cpt-frontx-fr-mfe-runtime-registration`
- `cpt-frontx-adr-mf-manifest-discovery`

**Constraints**: none owned — contract `template-manifest` is defined by F11 and consumed here

**Touches**:
- Entities: `MfeEntry`

### Lazy-Import ABI Inherits Parent Load Bindings

- [ ] `p1` - **ID**: `cpt-frontx-dod-mfe-loading-lazy-abi-isolation`

The system **MUST** resolve every `__frontx_lazy(path)` call emitted by the build-time transform through a per-load ABI resolver that is distinct for each concurrent load, routes the lazy chunk through the same blob URL chain as the parent load, and rewrites the lazy chunk's bare specifiers to the parent load's shared-dependency blob URLs — so a lazy chunk always evaluates inside its parent load's isolated graph and inherits its shared-dependency bindings without spawning a divergent second copy of any singleton dependency. Deferred resolution **MUST** be preserved: a lazy chunk is fetched and evaluated only on first exercise.

**Implements**:
- `cpt-frontx-flow-mfe-loading-on-demand-load`
- `cpt-frontx-algo-mfe-loading-lazy-import-abi`

**Addresses**:
- `cpt-frontx-fr-mfe-runtime-registration`
- `cpt-frontx-nfr-runtime-performance` — lazy deferral keeps the eager working set small; per-load inheritance avoids duplicating shared dependencies
- `cpt-frontx-adr-lazy-import-abi`

**Touches**:
- Entities: `MfeEntry`

## 6. Acceptance Criteria

- [ ] When the registry triggers an on-demand load, the system reads `manifest.metaData.publicPath`, `exposeAssets.js.sync[0]`, `exposeAssets.css.sync/async`, and `manifest.shared[]` to locate and load the expose chunk without fetching or parsing a compiled remote-entry module.
- [ ] Shared dependencies declared in `manifest.shared[]` are processed in declared dependency order (leaves first), and each dependency's bare specifier is rewritten to its per-load blob URL before dependents that reference it are processed.
- [ ] Each concurrent MFE load receives a distinct per-load `__frontx_lazy` resolver stub; a `__frontx_lazy(path)` call from load A routes to load A's resolver and not load B's.
- [ ] A lazy chunk resolved via `__frontx_lazy` inherits the parent load's shared-dependency blob URL map; the same shared dependency is not fetched or instantiated a second time within one load.
- [ ] Deferred resolution is preserved: a lazy chunk is fetched and its blob URL minted only when `__frontx_lazy(path)` is first exercised, not eagerly at parent-load time.
- [ ] A load whose manifest is missing or whose required fields are absent transitions to LOAD_FAILED and does not progress to LOADING.
- [ ] A lazy chunk whose relative path cannot be resolved within the load's known chunk set causes the load to transition to LOAD_FAILED with a diagnostic identifying the unresolvable path.
- [ ] The load lifecycle state machine transitions follow the sequence PENDING → MANIFEST_RESOLVED → LOADING → LOADED on the success path, and either PENDING → LOAD_FAILED or LOADING → LOAD_FAILED on error paths.
