---
status: accepted
date: 2026-11-03
description: "Decides that verified, content-identified source text is reused across independently loaded copies of the runtime through one dedicated, version-namespaced realm-global rendezvous, in a realm cache bounded by an application-configurable byte budget with least-recently-used eviction."
---

# How Far Should the Shared-Dependency Source-Text Cache Reach?

<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [A dedicated, version-namespaced realm-global cache rendezvous](#a-dedicated-version-namespaced-realm-global-cache-rendezvous)
  - [Host the cache at the existing mount-context rendezvous](#host-the-cache-at-the-existing-mount-context-rendezvous)
  - [Reach the cache through the inbound bridge link or a child bridge capability](#reach-the-cache-through-the-inbound-bridge-link-or-a-child-bridge-capability)
  - [Attach the cache to the bridge object handed across the nesting boundary](#attach-the-cache-to-the-bridge-object-handed-across-the-nesting-boundary)
  - [Inject the ancestor host's handler instance into the nested host](#inject-the-ancestor-hosts-handler-instance-into-the-nested-host)
  - [Keep the cache handler-local](#keep-the-cache-handler-local)
  - [A fixed entry count with least-recently-used eviction](#a-fixed-entry-count-with-least-recently-used-eviction)
  - [A byte budget on retained source text with least-recently-used eviction](#a-byte-budget-on-retained-source-text-with-least-recently-used-eviction)
  - [Unbounded retention for the realm's lifetime](#unbounded-retention-for-the-realms-lifetime)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-shared-dep-cache-reach`

## Context and Problem Statement

`cpt-frontx-adr-shared-dep-reuse` fixes *what identity* reuse of shared-dependency source text is keyed on: the content identity of the fetch-list document, chunk or whole-package entry a manifest or a list references. That decision leaves open *how far* the cache holding that text reaches, and *how it is bounded*. A composed application does not have one handler: a mounted microfrontend may itself host a further registry, and when it does, that nested host constructs its own handler from its own independently loaded copy of the runtime package — the copy boundary `cpt-frontx-adr-mfe-load-isolation` guarantees. A cache held per handler, or per copy, therefore stops at that handler or copy. Two copies in one browser realm would keep disjoint caches, and text whose declared content identity is identical on both sides would be fetched once per copy rather than once per realm, even though the identity already proves the two loads want the same bytes.

The bound is the second half of the problem. Under `cpt-frontx-adr-shared-dep-reuse` a load reaches many content-identified chunks of widely varying size, and `cpt-frontx-adr-mfe-asset-discovery` verifies each fetched fetch-list document and chunk against its declared content identity before it is used or cached. A long-lived page accumulates such text from arbitrarily many builds, and `cpt-frontx-nfr-resource-efficiency` requires the shared source text the runtime retains to stay within an application-configurable byte budget and to be observable. A bound on the number of entries says nothing about bytes when entry sizes range from a few hundred bytes to a whole package.

How far should verified source text be reusable, through which mechanism should independently loaded copies converge on it, and how should the cache that holds it be bounded?

## Decision Drivers

* **Reuse must follow the identity the key already proves** — where two loads agree on the content identity of what they fetch, the second fetch buys nothing; a reach that stops short of that agreement discards a benefit `cpt-frontx-adr-shared-dep-reuse` establishes as safe (`cpt-frontx-nfr-runtime-performance`).
* **Retained memory is bounded in bytes and observable** — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once per page, that retained shared source text stay within an application-configurable byte budget, and that the runtime report the figures needed to check that bound.
* **Load latency stays within budget** — `cpt-frontx-nfr-runtime-performance` sets the load-time budget; eviction must cost hit rate, not correctness, and a refetch after eviction must not reopen a network transfer the browser can already serve.
* **Module isolation is not negotiable** — whatever is shared must be source text and never a module record: each load continues to mint its own isolated module graph, as `cpt-frontx-adr-mfe-load-isolation` requires, so sharing is confined to inert bytes that a load rewrites and evaluates for itself.
* **Only verified text is shared** — text fetched from origins the runtime does not control is shared across microfrontends only after its content identity has been verified, so the realm cache can never hand one load bytes another load's declaration did not establish.
* **No public-surface growth** — the mechanism adds no exported symbol, no capability method and no constructor argument, because `cpt-frontx-constraint-mfes-cross-nesting-reachability` and `cpt-frontx-constraint-mfes-realm-shared-dep-cache` hold the package's published contract closed against exactly this kind of incremental widening.
* **No application wiring** — a composed application obtains the benefit by composing microfrontends, not by threading an implementation object from an ancestor host into a descendant; a mechanism that only works when the application cooperates does not hold for the independently authored hosts the runtime admits.
* **Independently evaluated copies must not misread one another's state** — two copies in one realm may be different package versions, so a convergence point must let an incompatible copy recognize that it does not understand what it found, and back away, rather than operate on it.
* **No lifecycle contract invented to serve a cache** — the runtime has no handler disposal contract and registries do not own handler lifetime, so a release discipline must not be conjured for the sole benefit of reclaiming a bounded cache.

## Considered Options

Reach — how independently loaded copies converge on one cache:

* **A dedicated, version-namespaced realm-global cache rendezvous** — a new `Symbol.for` slot on the realm's global object, distinct from every existing rendezvous, holding a version-tagged entry that carries the one cache compatible copies converge on.
* **Host the cache at the existing mount-context rendezvous** — reuse the realm-global slot the nesting composition uses to hand a bridge down and a relink callback back up.
* **Reach the cache through the inbound bridge link or a child bridge capability** — add a source-text or cache operation to the channel that crosses a nesting boundary.
* **Attach the cache to the bridge object handed across the nesting boundary** — carry it as a property on the bridge instance a parent hands to a child.
* **Inject the ancestor host's handler instance into the nested host** — have the composed application pass the outer handler down and let the nested registry reuse it rather than constructing its own.
* **Keep the cache handler-local** — treat per-copy refetching as the cost of copy isolation.

Bound — how the realm cache limits what it retains:

* **A fixed entry count with least-recently-used eviction.**
* **A byte budget on retained source text with least-recently-used eviction.**
* **Unbounded retention for the realm's lifetime.**

## Decision Outcome

Chosen options: **a dedicated, version-namespaced realm-global cache rendezvous** for reach, because it is the only option that lets independently loaded compatible copies converge without an exported symbol, without application wiring, and without borrowing a channel whose own contract forbids holding long-lived state; and **a byte budget on retained source text with least-recently-used eviction** for the bound, because it is the only option that bounds what `cpt-frontx-nfr-resource-efficiency` measures, whatever the mix of entry sizes.

**Reach.** Verified source text is reusable across independently loaded compatible copies of the runtime package within one JavaScript realm. The cache represents immutable, content-addressed source text, not handler state and not registry state, and the realm's global object is the only location independently evaluated copies reliably share. Sharing it shares no module record: every load still constructs its own isolated graph over that text.

**Contents and admission.** The realm cache holds every source text whose content identity has been verified on fetch: shared-dependency chunks, fetch-list documents, and a microfrontend's own content-identified chunks. Verification itself is decided in `cpt-frontx-adr-mfe-asset-discovery`; text that fails it is never cached. Entries are keyed by content identity, the key `cpt-frontx-adr-shared-dep-reuse` fixes, which derives from declared manifest data and is already free of package-copy, handler, registry and object identity. Entries that carry no content identity are never admitted to the realm cache: they are held only in a cache scoped to one handler (the per-handler cache), keyed by their resolved absolute location, so their reuse stays confined to repeated loads of the same microfrontend as `cpt-frontx-adr-shared-dep-reuse` requires.

**Host participation.** The host takes part through the browser, not through an interface. Text the host has already downloaded reaches the realm cache when the first load that needs it fetches the same content-addressed location: the browser's HTTP cache serves that fetch without a new download, and the text is verified and admitted like any other. The host gets no API for seeding the cache, so the runtime's public surface does not grow (`cpt-frontx-constraint-mfes-realm-shared-dep-cache`). An extension that wants its text loaded early dispatches its own load action; there is no prefetch interface.

**Protocol.** Convergence happens at one realm-global symbol carrying an explicit protocol version in its description, whose value is an entry tagged with that same version and holding the cache. The cache is reached behind an accessor that is also the realm-cache surface of the package's `./unit-loader` subpath — reachable so a host loading its own shared set converges on the same cache — and exposes only the operations the loading path needs, described structurally rather than by class identity, because class identity cannot be relied on across copies. A copy that finds no entry creates the cache and publishes the entry synchronously before returning it. A copy that finds an entry of the version it understands adopts that cache. A copy that finds a malformed entry or a version it does not recognize treats the realm entry as absent, logs a diagnostic, neither reads, mutates, replaces nor deletes what it found, and proceeds on its own copy-local fallback cache, bounded by the same byte budget and shared by every handler of that copy. A future incompatible protocol takes a new symbol suffix so that old and new protocols coexist rather than compete for one slot. Any incompatible change to the meaning of the cache key requires a protocol-version bump here.

**Trust.** The realm slot is a trusted same-realm coordination point, not an authenticity or confidentiality boundary. A structurally conforming entry of the understood version is adopted regardless of which same-realm code published it. Version and structural checks protect against accidental incompatibility; they do not establish publisher identity or prevent a same-realm publisher from observing or substituting cached source text. No cross-copy authentication is available to change this: independently loaded copies share no prior secret, no unforgeable common object identity and no class identity, and a brand, a frozen wrapper, an extra symbol, an embedded key or a structural method set can each be reproduced or captured by code already executing in the realm. Verification on fetch narrows what the protocol's honest participants can admit — no declared identity places mismatching text in the cache — but it does not defend against code that already executes in the realm.

**Bound.** The realm cache is bounded by a byte budget on the source text it retains, once for the whole realm rather than per handler or per copy, and evicts least-recently-used entries when admitting text would exceed the budget. Bytes are accounted when text is fulfilled and verified, since an in-flight fetch has no size yet. The default budget is set from measurement of representative compositions, and an application configures its own budget through runtime configuration (`MfeLoaderConfig`). Which copy's configuration sets the budget at runtime, how a single text exceeding the whole budget is handled, and the per-handler cache's bound are left to the owning DESIGN and FEATUREs. Eviction only drops text. A later load that needs evicted text refetches it from an immutable content-addressed location, which the browser's HTTP cache ordinarily serves without a new download, and verifies it again before it is admitted again; a caller already holding the evicted text proceeds unaffected. A weakly held design is rejected: a JavaScript string cannot itself be weakly referenced, so it would need boxed values and rehydration after a miss, while collection would be nondeterministic and could destroy the sequential cross-copy reuse this decision exists to create.

**Lifetime.** The cache's lifetime is the realm's. It is **not** retainer-counted: handler destruction, registry disposal, extension unmount and extension unregistration neither clear nor release it, and no expiry window applies; only the byte budget removes entries. This deliberately diverges from `cpt-frontx-adr-api-transport-bypass-and-fetch-sharing`, which retainer-counts a structurally similar realm-global cache. Retainer counting is right there because that cache has explicit holders, a freshness and invalidation contract, and a retain/release lifecycle to hang release on. None of those exist here: the handler has no disposal contract, a registry receives handlers rather than owning them, and source-text reuse is independent of extension registration — so retainer counting would have to invent the ownership boundary it depends on, and would risk clearing entries another live handler still benefits from. The inline-content references each load mints over the text are owned by that load under `cpt-frontx-adr-mfe-load-isolation`, not by this cache, so eviction of text never touches a reference a load holds.

**Timeout release.** The per-attempt ledger that releases source-text entries an abandoned attempt was waiting on records the actual cache object, key and promise the attempt used. Release remains identity-checked against the promise it recorded, removes only the mapping and never cancels the work behind it, and leaves an existing waiter undisturbed because that waiter already holds the promise. Eviction on rejection uses the same cache reference and the same identity check, on the cache that received that exact promise rather than on whichever cache the handler would select later.

Recording the promise, and not merely the cache and key, is what makes the identity check a generation check. Where two copies joined one promise and the first copy's attempt times out and deletes that promise's mapping, a retry may publish a replacement promise under the same key; the second copy's later release still carries the promise it joined, so the identity check fails against the replacement and the release cannot remove it. Only an attempt that actually joined the replacement, and then exhausted its own budget, can release the replacement. An old waiter therefore cannot successively evict replacement generations, and duplicate fetches arise across genuine retry generations — the intended recovery when a fetch exceeds an attempt budget — rather than from the number of copies that originally joined one promise. Releasing only when the timing-out attempt is an entry's sole recorded waiter is rejected: while any other waiter remained, the timed-out attempt's retry would rejoin the same possibly hung promise and could never recover, and staggered retries could hold the count above zero indefinitely. No cross-copy waiter count is introduced, so no shared count is left behind when a copy or handler is discarded.

**Diagnostics.** The runtime reports the bytes the realm cache holds, its entry count, its budget and the evictions it has performed, so the retained-memory threshold of `cpt-frontx-nfr-resource-efficiency` can be checked without browser developer tools.

**Field scoping.** The caches in the loading path have deliberately different scopes, and the asymmetry is part of this decision rather than an accident of it.

| Cache | Scope | Bound | Lifetime | Why |
|---|---|---|---|---|
| Realm source-text cache | One JavaScript realm, across compatible independently loaded copies | Byte budget on retained text, least-recently-used eviction | Realm | Holds verified, content-identified source text only |
| Per-handler source-text cache | One handler; entries without a content identity | Left to the DESIGN/FEATURE layer | Handler | Holds source text that carries no content identity, reusable only by repeated loads of the same microfrontend |
| Load cache | One evaluated package copy | Catalog-bounded, no eviction pressure | Realm | Holds extension-instance load results and their isolated module graphs |

The realm cache is held per handler as a reference obtained from the realm accessor, not as a copy-static field: the reference is instance-held while the cache it names is realm-shared, and a static field would share only within one evaluated copy while obscuring the actual scope. The load cache stays class-static within an evaluated copy and must not use this protocol: sharing it across copies would conflate extension identity and, decisively, would share lifecycle and module-evaluation results across the boundary `cpt-frontx-adr-mfe-load-isolation` requires separate isolated loads for.

### Consequences

* Good, because reuse reaches as far as the content identity's safety argument does: two loads that agree on the identity of what they fetch transfer it once per realm rather than once per copy.
* Good, because retained source text is bounded in bytes, the measure `cpt-frontx-nfr-resource-efficiency` sets, and the bound holds whether a page's entries are many small chunks or a few whole packages.
* Good, because the bound applies once per realm, independent of how many handlers or copies a composition constructs.
* Good, because eviction costs at most a refetch from an immutable content-addressed location, which the browser's HTTP cache ordinarily serves, followed by verification; correctness never depends on what the cache still holds.
* Good, because only verified text enters the realm cache, so no declared identity can place mismatching bytes where another copy's load would reuse them.
* Good, because the host's own downloads benefit the realm cache through the browser's HTTP cache, with no seeding API and no prefetch interface.
* Good, because the mechanism is invisible to consumers — no exported symbol, no capability method, no constructor argument and no application wiring — so a composed application gains the benefit by composing.
* Good, because the version-tagged entry lets an incompatible copy recognize that it does not understand what it found and fall back locally, instead of operating on state whose semantics it cannot establish.
* Good, because the reported bytes held, entry count, budget and evictions make the bound and its pressure observable.
* Bad, because realm-global state is deliberate global coupling: a copy that publishes a malformed entry, or a future copy that reuses this slot with different semantics, degrades every compatible copy to its local fallback.
* Bad, and accepted: any code already executing in the realm can pre-occupy or mutate the well-known rendezvous slot and thereby observe or substitute cached source text. This is accepted because the JavaScript realm is already the trusted coordination domain: `cpt-frontx-adr-mfe-load-isolation` controls how microfrontend code is admitted and evaluated through the audited loading path, but does not provide isolation from arbitrary code that has already obtained same-realm execution. This protocol creates no new admission path and grants no code execution capability to an otherwise unadmitted party.
* Bad, because the runtime must account the size of every retained text, which an entry-count bound would not require.
* Bad, because one budget serves every composition in the page, so a page whose working set exceeds it trades hit rate for the bound rather than growing to fit.
* Bad, because a timeout in one copy may release a realm entry another copy is awaiting; the waiter is unaffected, but a later caller for that key may start a duplicate fetch. That is the accepted price of a retry that can recover from a hung fetch.
* Neutral, because the cache outlives every handler that ever touched it and only the budget reclaims entries before the realm ends, which is sound for immutable content-addressed text and would not be for anything with freshness semantics.

### Confirmation

Compliance is confirmed by runtime behaviour across genuinely independent copies, and by the package's own surface checks.

Reach. Tests constructing two independently evaluated copies confirm that the copies produce distinct handler constructors yet adopt one protocol-compatible realm cache; that concurrent loads from both copies for the same content identity, resolving different absolute locations, issue exactly one fetch; that a sequential load across the copies reuses the cached text; and that both loads nonetheless mint distinct inline-content references — distinct module specifiers prepared per load over the shared text — so only source text was shared. A further test confirms that a realm-cache hit is not scoped to any single handler instance: a second, independently constructed handler in the same copy, with no reference passed between the two, hits the same realm cache the first handler used.

Contents and admission. Tests confirm that verified shared chunks, fetch-list documents and a microfrontend's own content-identified chunks are admitted to the realm cache; that text failing verification is not cached; and that an entry carrying no content identity is held only in the per-handler cache, so a second handler loading the same location does not hit it. A test confirms that a load of a content-addressed location the host has already downloaded is served without a new network transfer and is admitted to the realm cache. The package build confirms that no public export, no bridge capability and no constructor argument was added, and that no seeding or prefetch operation exists.

Bound. Tests confirm that admission beyond the configured byte budget evicts least-recently-used entries until the retained bytes fit; that a configured budget replaces the default; that the bound multiplies by neither handler nor compatible package-copy count; and that a load needing evicted text refetches and verifies it again. A measurement of representative compositions records the basis of the default budget. Tests confirm that the runtime reports bytes held, entry count, budget and evictions, and that those figures match the cache's state.

Protocol. A test confirms that an entry carrying an unrecognized version is neither read, mutated, replaced nor deleted, and that the load still succeeds by falling back to a local cache. Two further tests confirm each half of the fallback's scope directly rather than inferring one from the other: two handlers constructed from the same copy against the same unrecognized entry resolve to the identical fallback instance, a fetch driven through one is observed as a hit by the other, and the fallback evicts at the same byte budget the realm cache does; two independently evaluated copies falling back against the same unrecognized entry get two distinct fallback instances, and a fetch driven through one is not observed as a hit by the other. A protocol trust test confirms that a structurally conforming cache already present in the slot is adopted by both independently loaded copies, which records the accepted trust model rather than pretending to authenticate its publisher.

Release. Identity tests confirm that a rejected promise is evicted and retryable, and that rejection of an older promise cannot evict a newer promise under the same key, driven through the production eviction-on-rejection callback itself. A single-copy test confirms that an attempt that joins a replacement generation can, on its own subsequent timeout, release exactly that generation. A staggered cross-copy test confirms that, after the first copy's attempt times out and a retry publishes a replacement, the second copy's ledger releases only the promise it recorded and the replacement stays mapped. No test asserts a waiter count, because waiter tracking is not part of the protocol. Lifetime tests confirm that handler discard, registry disposal, extension unmount and extension unregistration leave the realm cache's entries in place.

## Pros and Cons of the Options

### A dedicated, version-namespaced realm-global cache rendezvous

A new `Symbol.for` slot, distinct from every existing rendezvous, holding a version-tagged entry carrying the cache compatible copies converge on, reached behind an internal accessor.

* Good, because the realm's global object is the only location independently evaluated copies reliably share, so convergence needs no cooperation from anyone.
* Good, because it adds no importable symbol, no capability method and no wiring, leaving the published contract closed.
* Good, because the explicit version tag makes incompatibility detectable and recoverable rather than silent.
* Good, because a slot of its own carries no obligations from another subsystem's contract, and a future incompatible protocol can take a new suffix instead of contending for this one.
* Neutral, because it relies on a well-known global slot as its convergence point, the same shape the platform already uses for inter-copy coordination.
* Bad, because realm-global state is global coupling, and a malformed publication by any copy degrades every compatible copy to a local fallback.

### Host the cache at the existing mount-context rendezvous

Put the cache in the realm-global slot the nesting composition uses to hand a bridge down and a relink callback back up.

* Good, because it mints no new global slot and reuses a convergence mechanism proven across copies.
* Bad, because that slot's contract scopes its entry to one synchronous mount window and requires that nothing remain at the rendezvous once the window closes; a realm-lifetime cache is exactly what it forbids, so this option would not reuse that mechanism but rewrite its contract.
* Bad, because it couples a loading concern to the mount handshake, so a change to either subsystem's rendezvous discipline would have to reason about the other.

### Reach the cache through the inbound bridge link or a child bridge capability

Add a source-text or cache-access operation to the channel that crosses a nesting boundary.

* Good, because the channel exists and spans the copy boundary that needs spanning.
* Bad, because `cpt-frontx-constraint-mfes-cross-nesting-reachability` forbids exactly this: a new capability method is a new operation a consumer can invoke, which is the measure that constraint applies.
* Bad, because source loading is unrelated to dispatch reachability; the bridge carries participation in communication, and widening it to carry bytes for the loader conflates two concerns the package keeps apart.

### Attach the cache to the bridge object handed across the nesting boundary

Carry the cache as a property on the bridge instance a parent hands to a child, in the plain-property style inter-copy state uses.

* Good, because it avoids a new global slot and travels with an object reference that already crosses the boundary.
* Bad, because it reaches only hosts related by a parent–child bridge, so two unrelated handlers in the same realm — the independent roots this decision exists to serve — still deduplicate nothing.
* Bad, because it entangles a realm-lifetime cache with bridge teardown, which is scoped to an extension's registration, complicating a lifetime that has no reason to be complicated.

### Inject the ancestor host's handler instance into the nested host

Have the composed application pass the outer handler down and let the nested registry reuse it instead of constructing its own.

* Good, because it needs no new mechanism in the package at all, only a different composition.
* Bad, because it requires every composed application to wire it, so the benefit depends on cooperation the runtime cannot assume from independently authored hosts.
* Bad, because it couples a nested host to an ancestor's handler implementation, and the nested host would then share far more than source text with its ancestor.
* Bad, because it does nothing for two independent roots in the same realm, which have no ancestor to inherit a handler from.

### Keep the cache handler-local

Treat per-copy refetching as the cost of copy isolation.

* Good, because it holds no realm-global state and needs no protocol, no version negotiation and no new failure mode.
* Bad, because it refetches, once per copy, text whose declared content identity already proves the reuse safe, contrary to the transfer-once threshold of `cpt-frontx-nfr-resource-efficiency`.
* Bad, because it leaves cross-microfrontend reuse unmet in exactly the composition the platform is built to support, where the second copy's fetches are the ones worth avoiding.

### A fixed entry count with least-recently-used eviction

Bound the realm cache by a fixed number of resident entries, evicting the least recently used.

* Good, because it needs no size accounting and is trivially cheap to enforce.
* Bad, because it bounds mappings, not bytes: with content-identified chunks ranging from a few hundred bytes to a whole package, no byte ceiling follows from any entry count.
* Bad, because it cannot express the application-configurable byte budget `cpt-frontx-nfr-resource-efficiency` requires.
* Bad, because a load reaching many small chunks fills an entry count quickly, so eviction churn rises while retained bytes stay small, costing hit rate for no memory benefit.

### A byte budget on retained source text with least-recently-used eviction

Bound the realm cache by the bytes of fulfilled, verified text it retains, evicting the least recently used entries when admission would exceed the budget; the default is measured and the application can configure its own.

* Good, because it bounds exactly the quantity the retained-memory threshold measures, whatever the mix of entry sizes.
* Good, because many small chunks do not cause eviction until they actually consume the budget.
* Good, because eviction is cheap to recover from: the text lives at an immutable content-addressed location the browser's HTTP cache ordinarily serves, and it is verified again on refetch.
* Good, because the budget is a single reported figure, so held bytes against budget and eviction counts make the bound's pressure observable.
* Bad, because every retained text must be size-accounted.
* Bad, because the default is only as good as the compositions it was measured on, so applications with unusual working sets must configure their own.

### Unbounded retention for the realm's lifetime

Keep every admitted text until the realm ends.

* Good, because it never evicts, so every repeated need is a hit.
* Good, because it needs neither size accounting nor eviction policy.
* Bad, because retained memory grows with every distinct build a long-lived page encounters, which `cpt-frontx-nfr-resource-efficiency` forbids.
* Bad, because there is no budget to report against, so the retained-memory threshold cannot be checked.

## More Information

This decision extends `cpt-frontx-adr-shared-dep-reuse` and changes nothing it fixes: the key's content identity and its fail-safe scoping of entries without one are the same, and this decision settles how far a key that already proves reuse safe reaches and how the cache holding the text is bounded. Verification of fetched text against its declared identity, and the use of a microfrontend's own load action for early loading, are decided in `cpt-frontx-adr-mfe-asset-discovery`; this decision relies on both and decides neither. Which symbol description, accessor name, default budget value, configuration key and structural cache interface realize the protocol are implementation shapes belonging to the FEATUREs that own the loading path's behaviour, cited by ID from the Traceability section below.

This protocol is **separate** from `cpt-frontx-algo-mfe-host-communication-registration-propagation` and leaves that instruction untouched. It owns the mount-context rendezvous and the inbound link, scopes its entry to one synchronous mount window, and requires that nothing remain at the rendezvous once the window closes; this decision mints a slot of its own precisely so that contract stays intact, and neither the mount-context symbol nor the inbound-link symbol is affected.

`cpt-frontx-adr-mfe-load-isolation` is unaffected. Every load mints its own isolated module graph regardless of where its source text came from: what crosses the copy boundary here is inert text that each load rewrites and wraps for itself, never a module record or an inline-content reference, so the per-instance isolation guarantee is untouched. The load cache, which does hold evaluated graphs, is the cache this decision keeps copy-local for exactly that reason.

For accuracy, and as non-binding present detail rather than part of this decision's durable identity: the rendezvous is realized in `packages/mfes/src/handler/mfe-handler-mf/RealmSharedDepTextCacheProvider.ts`; the convergence slot is `Symbol.for('@gears-frontx/mfes:shared-dep-text-cache:1')`; the entry it holds has the shape `{ v: 1, cache }`, carrying the protocol version alongside the cache; and the content identity a manifest declares on a shared-dependency entry is carried in the field `contentHash`. A future incompatible protocol takes the next suffix — `:2` — on a slot of its own.

The decision records this at the layer level alongside `cpt-frontx-adr-mfe-load-isolation`, `cpt-frontx-adr-mfe-asset-discovery` and `cpt-frontx-adr-shared-dep-reuse`, the decisions it is bounded by and the one it extends, so a single decision chain stays under one convention.

**Review trigger.** Revisit the default budget if sustained eviction churn is measured under it in representative compositions; revisit the lifetime posture if an explicit handler disposal ownership contract is introduced, which would make retainer counting arguable on its own terms (registry disposal alone would not, since registries do not own handler lifetime); revisit the protocol version if an incompatible change to the cache key's meaning becomes necessary; and revisit the reach mechanism if a mechanism arrives that lets independently loaded copies converge on shared state without a realm-global slot.

**Checklist applicability.** ARCH — applicable and addressed above: this fixes an inter-copy protocol and a memory bound every composed application's loading path depends on, and a published slot with adopters is costly to reverse. SEC — applicable and addressed above, with an explicit acceptance rather than a mitigation: only text verified against its declared content identity enters the realm cache and module isolation is preserved intact, but the rendezvous slot is trusted same-realm coordination state and authenticates no publisher, so code already executing in the realm can pre-occupy or mutate it and thereby observe or substitute cached source text. That is accepted on the ground recorded under Consequences: the realm is already the trusted coordination domain, `cpt-frontx-adr-mfe-load-isolation` governs admission and evaluation of microfrontend code but offers no isolation from code that has already obtained same-realm execution, and this protocol adds no admission path and grants no execution capability to an unadmitted party. No cross-copy authentication is implementable under the stated constraints, and an unrecognized or malformed entry is left untouched rather than trusted. PERF — applicable and addressed above: eliminating per-copy refetching is the driver, the byte budget is the memory counterweight, eviction costs a verified refetch the browser's HTTP cache ordinarily serves, and the reported bytes held, entry count, budget and evictions make both observable. REL — applicable and addressed above: identity-checked release and rejection eviction keep a hung or failed fetch recoverable, the accepted duplicate retry is stated, and an incompatible copy degrades to a bounded local fallback. INT — Not applicable, because no external system contract changes: the published manifest's shape is untouched, the protocol is internal to independently loaded copies of one package, and the budget is an application setting carried by runtime configuration. DATA — Not applicable, because no persistent store or schema is defined; entries are realm-lifetime source text. OPS — Not applicable, because no deployed-service procedure is governed; the reported figures are library behaviour, not operations monitoring. COMPL — Not applicable. UX — Not applicable, because the consequence is fetch count and memory, addressed under PERF. BIZ — Not applicable, because product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-nfr-resource-efficiency` — the realm cache transfers verified shared text at most once per page across every copy, holds retained source text within an application-configurable byte budget, and reports bytes held, entry count, budget and evictions.
* `cpt-frontx-nfr-runtime-performance` — the cache's reach spans the independently loaded copies a composed application produces, so deduplication happens where it matters most, and eviction costs only a verified refetch the browser's HTTP cache ordinarily serves.
* `cpt-frontx-nfr-security` — only text verified against its declared content identity is admitted to the realm cache, and what crosses the copy boundary is inert source text rather than a module record, so no microfrontend gains a capability or an evaluated graph it did not declare; the slot's same-realm trust model is stated and accepted rather than claimed as a boundary.
* `cpt-frontx-fr-mfe-runtime-registration` — on-demand loading of a registered microfrontend is the path this cache sits in; this decision fixes how far that path's source-text reuse extends when registration happens in more than one independently loaded copy, and how its retained text is bounded.
* `cpt-frontx-component-mfe-runtime` — this decision constrains how the MFE Runtime component's loading path converges on verified source text across copies, how that cache is bounded and reported, and which of its caches stay handler-local or copy-local.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — the member-level constraint this decision establishes, which binds compatible copies in one realm to the versioned, byte-bounded source-text cache without sharing module graphs or growing the public surface.
* `cpt-frontx-constraint-mfes-cross-nesting-reachability` — the public-surface guarantee this decision is bound by: the convergence mechanism adds no importable symbol and no capability method, so the composition stays invisible to consumers.
* `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous` — the algorithm that realizes the version-namespaced realm slot, its adoption and structural checks, and the copy-local fallback this decision fixes.
* `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache` — the definition of done that fixes the realm cache's byte budget, admission rule, identity-checked release, reporting and scope asymmetry.
