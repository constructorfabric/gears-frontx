---
status: accepted
date: 2026-05-11
decision-makers: FrontX core team
---

# MFE State Lifecycle Boundary


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Host owns module-scope, author owns instance-scope (no host-side reset hook)](#host-owns-module-scope-author-owns-instance-scope-no-host-side-reset-hook)
  - [`persistAcrossMounts: false` flag with blob URL revocation on unmount](#persistacrossmounts-false-flag-with-blob-url-revocation-on-unmount)
  - [Per-mount fresh `load()` (force-reload, fresh URL minting)](#per-mount-fresh-load-force-reload-fresh-url-minting)
  - [Iframe-per-instance](#iframe-per-instance)
  - [`new Function`-based runtime instantiation](#new-function-based-runtime-instantiation)
  - [Build-time whitelist enforcement on expose chains](#build-time-whitelist-enforcement-on-expose-chains)
- [Review Triggers](#review-triggers)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-mfe-state-lifecycle-boundary`

## Context and Problem Statement

ADR-0004 (`cpt-frontx-adr-blob-url-mfe-isolation`) establishes per-MFE isolation by minting a fresh blob URL per `load()`. That decision is silent on what happens *after* load: the same loaded lifecycle is cached on `extensionState` and reused across `mount() / unmount() / mount()` cycles, so module-scope state (the `Gears FrontXApp` instance, plugin registrations, store singletons, registered effects) survives every remount within a session. `MountExtSwapHandler`'s A→B→A path makes this concrete and reproducible — the second mount of A reuses the same module graph and only gets a fresh React tree in a new Shadow DOM container.

Two product-shaped expectations land on this single mechanism:

1. *Persist across mounts* — screens whose navigation/edit state should survive a tab swap (most dashboard widgets, list-detail flows).
2. *Fresh state per mount* — wizards, one-off flows, ephemeral modals that should not preserve form data or scroll position across opens.

CodeRabbit raised this on PR #276 (MF 2.0 migration) as a memory-lifecycle concern. The original spinout proposed a per-extension `persistAcrossMounts` flag whose `false` setting would revoke blob URLs on unmount and force a fresh `load()` on the next mount. After working through MF 2.0 runtime semantics, the HTML module-table behaviour, and the dashboard-domain blast radius, the proposal collapses into two distinguishable findings: (i) URL revocation does not produce module-state freshness, and (ii) per-mount fresh evaluation grows unboundedly because the HTML module table has no JS-accessible eviction. Both findings push the decision away from a host-managed per-mount mechanism and toward a written contract owned by the MFE author.

## Decision Drivers

* **(P0)** No correctness regression of `cpt-frontx-fr-blob-no-revoke` — the never-revoke rule must continue to hold for every load that reaches `import()`.
* **(P0)** Bounded host memory growth across long-lived sessions — the dashboard-domain pattern (each widget = an MFE instance, mounted and remounted as the user navigates) puts mount-driven growth in the hot path.
* **(P1)** Per-mount module-state freshness must be expressible by an MFE author who needs it (wizards, one-off flows), without requiring host changes.
* **(P1)** No introduction of `eval()` / `new Function()` / CSP `unsafe-eval` to the host's CSP profile (`cpt-frontx-nfr-sec-csp-blob`).

## Considered Options

* Host owns module-scope, author owns instance-scope — written contract on the MFE entry; no host-side reset hook.
* `persistAcrossMounts: false` flag with blob URL revocation on unmount — original spinout proposal.
* Per-mount fresh `load()` (force-reload, fresh URL minting, fresh evaluation) — same flag, but with the revocation step replaced by a correctly-implemented fresh-load mechanism.
* Iframe-per-instance — render every mount in its own `<iframe>`.
* `new Function`-based runtime instantiation — build-time ESM-to-factory transform, host invokes `new Function(source)()` per mount.
* Build-time whitelist enforcement on expose chains — build plugin errors on module-level mutable state in MFE source.

## Decision Outcome

Chosen option: **"Host owns module-scope, author owns instance-scope"**, expressed as a written contract on the MFE entry (`cpt-frontx-fr-mfe-author-state-lifecycle`).

The host commits to: one fresh `load()` per MFE per session (today's behaviour), per-load isolation via blob URL minting + source-text LRU caches, and no `URL.revokeObjectURL()` ever (`cpt-frontx-fr-blob-no-revoke`, narrowed to TLA + lazy-import correctness).

The MFE author commits to: constructing per-instance state inside `mount(container, bridge, mountContext?)`, disposing of it inside `unmount(container)`, and not relying on `unmount()` to reset module-level singletons or to drop blob URLs. Authors who want fresh module state per use case keep that state at instance scope, not at module scope.

This boundary is recorded in `architecture/features/feature-mfe-isolation/FEATURE.md` §7 ("State Lifecycle") and as DoD `cpt-frontx-dod-mfe-isolation-author-state-lifecycle`.

### Consequences

* Good, because per-mount state freshness is fully expressible by authors at the source level — the boundary is enforceable without a host-side flag and without breaking `cpt-frontx-fr-blob-no-revoke`.
* Good, because host memory growth stays catalog-bounded (one load per MFE per session, modulo retries) — the dashboard-domain pattern remains tolerable.
* Good, because no new public API surface on `MfeHandlerMF` or `DefaultMountManager`; no GTS schema change for `Extension`/`MfeEntry`.
* Bad, because authors who put state at module scope expecting `unmount()` to reset it will be surprised. Mitigation: contract is documented in FEATURE §7 and called out in FR rationale; failure mode is silent-stale-state, the same failure mode that any flag-based approach would also have for shared-dep singletons.
* Bad, because "cycle the MFE" becomes an MFE-author operation (unregister + re-register with a fresh ID), not a host primitive — inconvenient if a host-driven reset turns out to be needed.
* Neutral, because this decision strictly extends ADR-0004; it adds no new mechanism, only a written contract on top of an existing one.

### Confirmation

* `MfeHandlerMF` and `DefaultMountManager` remain unchanged — no new API for cache clear / blob URL release / fresh-load-on-unmount.
* MFE entries pair every resource constructed in `mount()` with a teardown in `unmount()`, including: React root, `bridge.subscribeToProperty` returns, `bridge.registerActionHandler` registrations, timers, observers, DOM nodes attached to `container`. Verified by AC-8 (Mount/unmount instance hygiene) in feature-mfe-isolation.
* No `unmount()` mutates module-level singletons (the `Gears FrontXApp` instance, plugin registrations, blob URLs, module-scope caches) — verified by structural acceptance criterion in feature-mfe-isolation.

## Pros and Cons of the Options

### Host owns module-scope, author owns instance-scope (no host-side reset hook)

* Good, because it preserves `cpt-frontx-fr-blob-no-revoke` correctness exactly and adds no new failure mode.
* Good, because it requires zero handler / mount manager / type changes.
* Good, because per-load growth is finite and catalog-bounded, fitting long-lived dashboard-domain sessions.
* Bad, because authors keeping state at module scope must learn the contract; default behaviour can surprise on first encounter.
* Bad, because there is no host-driven "cycle this MFE" primitive — the only way to force a fresh module evaluation is to re-register with a new ID.

### `persistAcrossMounts: false` flag with blob URL revocation on unmount

* Good, because it offers a per-extension knob aligned with author intent on paper.
* Bad, because **revocation does not produce freshness**: `URL.createObjectURL()` is what mints a unique URL and forces a fresh module evaluation; `URL.revokeObjectURL()` only releases the URL→Blob bytes mapping. The parsed module record stays pinned in the HTML module table by URL string, with no JS-accessible eviction API. The flag as written would silently fail to deliver the semantics it advertises — module-scope state would persist regardless.
* Bad, because revoking before all queued sub-module fetches complete reintroduces the `ERR_FILE_NOT_FOUND` failure mode that `cpt-frontx-fr-blob-no-revoke` exists to prevent. There is no observable safe moment to revoke (TLA, lazy `import()`, deferred MF runtime fetches all defer past `unmount()`).

### Per-mount fresh `load()` (force-reload, fresh URL minting)

* Good, because it would deliver true fresh module evaluation for the MFE's own expose graph (same mechanism as the initial load).
* Bad, because **per-mount growth is unbounded**: every fresh evaluation creates a permanent HTML module-table entry keyed by URL string, with no JS-accessible eviction. Per-mount growth scales with mount count × (shared deps + expose chunks); rough estimate ~2–5 MB per mount, no in-realm recovery. Per-load growth is finite and catalog-bounded; per-mount growth is not.
* Bad, because the dashboard-domain pattern (each widget is an MFE instance, mounted and remounted as the user navigates) makes this load-bearing rather than tolerable.
* Bad, because the cost is paid at every mount (full re-fetch + re-parse), not just on cold load.

### Iframe-per-instance

* Good, because it gives an OS-level fresh Realm per mount, with no contract burden on the MFE author.
* Bad, because the dashboard-domain pattern makes per-instance Realm isolation overhead unacceptable.
* Bad, because the cross-document boundary breaks the existing direct-call `ChildMfeBridge` contract — would have to be re-plumbed over `postMessage`.

### `new Function`-based runtime instantiation

* Good, because `new Function(source)()` always produces a fresh evaluation closure.
* Bad, because `new Function` does not accept ES module syntax — every expose chunk would need a build-time ESM-to-factory transform, requiring a complete handler rewrite.
* Bad, because it requires CSP `script-src 'unsafe-eval'`, incompatible with the host's CSP profile (`cpt-frontx-nfr-sec-csp-blob` builds on `blob:` precisely to avoid `unsafe-eval`).

### Build-time whitelist enforcement on expose chains

* Good, because a build-time check would catch problems before runtime if it could be made reliable.
* Bad, because the host has no analogous guarantee for third-party shared deps reached through the expose chain — the rule reduces to author convention for everything outside the MFE's own source, defeating the value of a build-time check.
* Bad, because the boundary is more honestly expressed as a written contract (`cpt-frontx-fr-mfe-author-state-lifecycle`) than as a partial compile-time gate.

## Review Triggers

This decision should be revisited when:

* Browsers add a JS-accessible eviction API for HTML module-table entries — would change the per-mount growth bound.
* MF 2.0 (or whatever shared-deps mechanism FrontX uses at the time) introduces native per-load isolation that subsumes the blob URL chain — in which case the "host owns module-scope" half of the boundary may shift.
* The deferred heap-snapshot study (open follow-up in feature-mfe-isolation) measures per-load retained set materially diverging from the static prediction — would invalidate the catalog-bounded claim and force a different bound argument.
* Authors report that the silent-stale-state surprise is a recurring source of bugs in production despite the contract being documented — would prompt a revisit of cheaper partial-reset options (the `lifecycle.reset()` hook from the original CodeRabbit §1 Option B).
* Calendar review: when any of the above triggers fires, or alongside ADR-0004's next review (currently 2027-Q1), whichever comes first.

**Invalidation condition**: this decision becomes invalid if FrontX abandons the never-revoke invariant, or if browsers expose a JS-accessible eviction primitive that lets per-mount fresh load become a bounded operation.

## More Information

- Operational impact (OPS): Not applicable — purely an in-browser host/author contract.
- Origin: CodeRabbit comment on PR #276 (MF 2.0 migration) in `gears-frontx/gears-frontx`; the resolution thread captures the full analysis including the §1a / §1b / §1c argument from the original CodeRabbit response and the per-mount-growth counter from the resolution. Canonical write-up adopted into mfe-implementation from upstream PR #285 (`gears-frontx/gears-frontx`).
- Heap-snapshot study (deferred follow-up): a single DevTools heap-snapshot run on a representative session, intended as a sanity check on the per-load bound rather than as sizing input for an opt-in flag. Lower priority than the artifact updates; runs whenever a mount-heavy regression is suspected.
- FrontX shared-deps note: FrontX does not use MF 2.0's `singleton: true` shared-scope sharing — the standard MF runtime caveat that "shared singletons survive a force-reload" does not apply here; FrontX shared deps are externalized at build time and re-minted as fresh blob URLs per load (`cpt-frontx-fr-blob-fresh-eval`).
- Related: ADR-0004 (`cpt-frontx-adr-blob-url-mfe-isolation`) — establishes the per-load blob URL mechanism that this decision builds on. The "Bad, because blob URLs accumulate" consequence in ADR-0004 is narrowed by this decision: per-load growth is the only growth dimension, and it is catalog-bounded.
- Related: ADR-0019 (`cpt-frontx-adr-mf2-manifest-discovery`) — feeds chunk URLs into the blob URL pipeline that this decision constrains.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)
- **FEATURE**: [features/feature-mfe-isolation/FEATURE.md](../features/feature-mfe-isolation/FEATURE.md) — §7 State Lifecycle, DoD `cpt-frontx-dod-mfe-isolation-author-state-lifecycle`, AC-8
- **ADR-0004**: [0004-blob-url-mfe-isolation.md](0004-blob-url-mfe-isolation.md) — establishes the blob URL isolation mechanism this decision constrains

This decision directly addresses:
* `cpt-frontx-fr-mfe-author-state-lifecycle` — written contract on per-mount state lifecycle
* `cpt-frontx-fr-blob-no-revoke` — preserved unchanged; rationale narrowed to TLA + lazy-import correctness
* `cpt-frontx-principle-mfe-isolation` — instance-scope cleanup boundary
