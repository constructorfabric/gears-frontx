---
status: accepted
date: 2026-09-21
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
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-shared-dep-cache-reach`

## Context and Problem Statement

`cpt-frontx-adr-shared-dep-dedup-key` fixed *what identity* the shared-dependency source-text cache key expresses; it left untouched *how far that cache reaches*. The cache is held per handler instance, so its reach ends at the handler that owns it. A composed application does not have one handler: a mounted microfrontend may itself host a further registry, and when it does, that nested host constructs its own handler from its own independently loaded copy of the runtime package — the copy boundary `cpt-frontx-adr-mfe-load-isolation` guarantees. Two copies in one browser realm therefore keep two disjoint caches, and a shared dependency whose declared content hash is identical on both sides is fetched once per copy rather than once per realm, even though the cache key already proves the two loads are reusing the same emitted build. The deduplication the key made safe is not the deduplication the runtime performs.

Neither the reach nor its absence is stated normatively anywhere: the algorithm that owns the cache's hit-and-miss steps describes it only as cross-microfrontend, the nesting constraint `cpt-frontx-constraint-mfes-cross-nesting-reachability` governs dispatch and reachability and is silent on loading, and no channel that crosses a nesting boundary carries loading or cache access at all. How far should shared-dependency source text be reusable, and through which mechanism should independently loaded copies converge on it?

## Decision Drivers

* **Reuse must follow the identity the key already proves** — where two loads agree on the identity of the emitted build, the cost of the second fetch buys nothing; a reach that stops short of that agreement discards a benefit `cpt-frontx-adr-shared-dep-dedup-key` has already established as safe (anchors `cpt-frontx-nfr-runtime-performance`).
* **Module isolation is not negotiable** — whatever is shared, it must be source text and never a module record: each load continues to mint its own isolated module graph, as `cpt-frontx-adr-mfe-load-isolation` requires, so sharing must be confined to inert bytes that a load rewrites and evaluates for itself.
* **No public-surface growth** — the mechanism must add no exported symbol, no capability method, and no constructor argument, because `cpt-frontx-constraint-mfes-cross-nesting-reachability` holds the package's published contract closed against exactly this kind of incremental widening.
* **No application wiring** — a composed application must obtain the benefit by composing microfrontends, not by threading an implementation object from an ancestor host into a descendant; a mechanism that only works when the application cooperates does not hold for the independently authored hosts the runtime admits.
* **Independently evaluated copies must not misread one another's state** — two copies in one realm may be different package versions, so a convergence point must let an incompatible copy recognize that it does not understand what it found, and back away, rather than operate on it.
* **Bounded memory regardless of composition depth** — a long-lived host encounters arbitrarily many builds and asset origins over a page's life, and the bound must not multiply with the number of handlers a composition happens to construct.
* **No lifecycle contract invented to serve a cache** — the runtime has no handler disposal contract and registries do not own handler lifetime, so a release discipline must not be conjured for the sole benefit of reclaiming a bounded cache.

## Considered Options

* **A dedicated, version-namespaced realm-global cache rendezvous** — a new `Symbol.for` slot on the realm's global object, distinct from every existing rendezvous, holding a version-tagged entry that carries the one cache compatible copies converge on.
* **Host the cache at the existing mount-context rendezvous** — reuse the realm-global slot the nesting composition already uses to hand a bridge down and a link callback back up.
* **Reach the cache through the inbound bridge link or a child bridge capability** — add a source-text or cache operation to the channel that already crosses a nesting boundary.
* **Attach the cache to the bridge object handed across the nesting boundary** — carry it as a property on the bridge instance a parent hands to a child.
* **Inject the ancestor host's handler instance into the nested host** — have the composed application pass the outer handler down and let the nested registry reuse it rather than constructing its own.
* **Keep the cache handler-local** — leave the reach where it is and treat per-copy refetching as the cost of copy isolation.

## Decision Outcome

Chosen option: **a dedicated, version-namespaced realm-global cache rendezvous**, because it is the only option that lets independently loaded compatible copies converge without an exported symbol, without application wiring, and without borrowing a channel whose own contract forbids holding long-lived state.

**Reach.** Shared-dependency source text is reusable across independently loaded compatible copies of the runtime package within one JavaScript realm. The cache represents immutable-or-page-stable source text, not handler state and not registry state, and the realm's global object is the only location independently evaluated copies reliably share. Sharing it shares no module record: every load still constructs its own isolated graph over that text.

**Protocol.** Convergence happens at one realm-global symbol carrying an explicit protocol version in its description, whose value is an entry tagged with that same version and holding the cache. The cache is reached behind an internal accessor and exposes only the operations the loading path needs, described structurally rather than by class identity, because class identity cannot be relied on across copies. A copy that finds no entry creates the cache and publishes the entry synchronously before returning it. A copy that finds an entry of the version it understands adopts that cache. A copy that finds a malformed entry or a version it does not recognize treats the realm entry as absent, logs a diagnostic, neither reads, mutates, replaces nor deletes what it found, and proceeds on its own copy-local bounded fallback cache. A future incompatible protocol takes a new symbol suffix so that old and new protocols coexist rather than compete for one slot. The protocol-v1 realm slot is a trusted same-realm coordination point, not an authenticity or confidentiality boundary. A structurally conforming `{ v: 1, cache }` entry is adopted regardless of which same-realm code published it. Version and structural checks protect against accidental incompatibility; they do not establish publisher identity or prevent a same-realm publisher from observing or substituting cached source text. No cross-copy authentication is available to change this: independently loaded copies share no prior secret, no unforgeable common object identity and no class identity, and a brand, a frozen wrapper, an extra symbol, an embedded key or a structural method set can each be reproduced or captured by code already executing in the realm. The cache-entry keys are exactly those `cpt-frontx-adr-shared-dep-dedup-key` fixed and need no change: they derive from declared manifest data and a resolved URL, and so are already free of package-copy, handler, registry, and object identity. Any future incompatible change to their meaning requires a protocol-version bump here.

**Lifetime and bounding.** The cache is bounded by a fixed capacity for the entire realm, not per handler, and it retains both in-flight and fulfilled source-text promises. Its lifetime is the lifetime of the realm. It is **not** retainer-counted: handler destruction, registry disposal, extension unmount, and extension unregistration neither clear nor release it, and no expiry window applies. This deliberately diverges from `cpt-frontx-adr-api-transport-bypass-and-fetch-sharing`, which retainer-counts a structurally similar realm-global cache. Retainer counting is right there because that cache has explicit holders, a freshness and invalidation contract, and a retain/release lifecycle to hang release on. None of those exist here: the module-federation handler has no disposal contract, a registry receives handlers rather than owning them, and source-text reuse is independent of extension registration — so retainer counting would have to invent the ownership boundary it depends on, and would risk clearing entries another live handler still benefits from. A realm-wide bound is also stricter than a per-handler bound would be, because no handler retains a capacity's worth on its own; eviction costs hit rate only, because a caller already holding an evicted promise proceeds unaffected.

The bound is on mappings, and the memory claim is exactly that: the cache imposes an entry-count bound, not a byte bound. Cache-attributable fulfilled payload is at most the source text retained by the 128 resident entries, plus promise and LRU bookkeeping. Individual source responses are not byte-limited by this decision, so no absolute byte ceiling is claimed. This is accepted because the values are already-admitted build assets, a per-handler cache at the same capacity would retain 128 such values per handler, and the realm cache holds that same capacity once for the whole realm instead of once per handler. A fulfilled value stays strongly reachable while its mapping is resident; least-recently-used eviction and identity-checked deletion are what drop the cache's strong reference, and a reference an active caller still holds after eviction is that caller's retention, not the cache's. A weakly held two-tier design is rejected rather than deferred: a JavaScript string cannot itself be weakly referenced, so it would require a boxed value, a strong in-flight promise, a transition to a weak fulfilled box and rehydration after a miss, while collection would be nondeterministic — capable of destroying the sequential cross-copy reuse this decision exists to create — and would still enforce no byte budget.

**Timeout release.** The per-attempt ledger that releases source-text entries an abandoned attempt was waiting on records the actual cache object, key and promise the attempt used. Release remains identity-checked against the promise it recorded, removes only the mapping and never cancels the work behind it, and leaves an existing waiter undisturbed because that waiter already holds the promise. Eviction on rejection uses the same cache reference and the same identity check, on the cache that received that exact promise rather than on whichever cache the handler would select later.

Recording the promise, and not merely the cache and key, is what makes the identity check a generation check. Where two copies joined one promise and the first copy's attempt times out and deletes that promise's mapping, a retry may publish a replacement promise under the same key; the second copy's later release still carries the promise it joined, so the identity check fails against the replacement and the release cannot remove it. Only an attempt that actually joined the replacement, and then exhausted its own budget, can release the replacement. An old waiter therefore cannot successively evict replacement generations, and duplicate fetches arise across genuine retry generations — the intended recovery when a fetch exceeds an attempt budget — rather than from the number of copies that originally joined one promise. Releasing only when the timing-out attempt is an entry's sole recorded waiter is rejected: while any other waiter remained, the timed-out attempt's retry would rejoin the same possibly hung promise and could never recover, and staggered retries could hold the count above zero indefinitely. No cross-copy waiter count is introduced, so no shared count is left behind when a copy or handler is discarded.

**Field scoping.** Two caches in the loading path have deliberately different scopes, and the asymmetry is part of this decision rather than an accident of it.

| Cache | Scope | Bound | Lifetime | Why |
|---|---|---|---|---|
| Shared-dependency source-text cache | One JavaScript realm, across compatible independently loaded copies | Fixed realm-wide capacity, least-recently-used eviction | Realm | Holds reusable inert source text only |
| Load cache | One evaluated package copy | Catalog-bounded, no eviction pressure | Realm | Holds extension-instance load results and their isolated module graphs |

The source-text cache is held per handler as a reference obtained from the realm accessor, not as a copy-static field: the reference is instance-held while the cache it names is realm-shared, and a static field would share only within one evaluated copy while obscuring the actual scope. The load cache stays class-static within an evaluated copy and must not use this protocol: sharing it across copies would conflate extension identity and, decisively, would share lifecycle and module-evaluation results across the boundary `cpt-frontx-adr-mfe-load-isolation` requires separate isolated loads for.

### Consequences

* Good, because reuse now reaches as far as the key's safety argument does: two loads that agree on the identity of the emitted build fetch it once per realm rather than once per copy.
* Good, because the mechanism is invisible to consumers — no exported symbol, no capability method, no constructor argument, and no application wiring — so a composed application gains the benefit by composing.
* Good, because the version-tagged entry lets an incompatible copy recognize that it does not understand what it found and fall back locally, instead of operating on state whose semantics it cannot establish.
* Good, because memory is bounded once for the realm rather than once per handler, so the bound applies once per realm, independent of a composition's handler count.
* Bad, because realm-global state is deliberate global coupling: a copy that publishes a malformed entry, or a future copy that reuses this slot with different semantics, degrades every compatible copy to its local fallback.
* Bad, and accepted: any code already executing in the realm can pre-occupy or mutate the well-known rendezvous slot and thereby observe or substitute shared-dependency source text. This is accepted because the JavaScript realm is already the trusted coordination domain: `cpt-frontx-adr-mfe-load-isolation` controls how microfrontend code is admitted and evaluated through the audited loading path, but does not provide isolation from arbitrary code that has already obtained same-realm execution. This protocol creates no new admission path and grants no code execution capability to an otherwise unadmitted party.
* Bad, because a timeout in one copy may evict a realm entry another copy is awaiting; the waiter is unaffected, but a later caller for that key may start a duplicate fetch. That is the accepted price of a retry that can recover from a hung fetch.
* Bad, because the realm-wide capacity is one number serving every composition in the page, so a page whose distinct build identities exceed it trades hit rate for the bound rather than growing to fit.
* Neutral, because the cache now outlives every handler that ever touched it; nothing reclaims it before the realm ends, which is sound for inert source text and would not be for anything with freshness semantics.
* Neutral, because the capacity is a fixed, provisional operational bound rather than a measured optimum: evidence of sustained eviction churn would justify raising the constant without disturbing the reach, the protocol, the key semantics, or the lifetime. Adaptive sizing is rejected, because it would weaken the memory policy and require a cross-copy resizing protocol no evidence calls for.

### Confirmation

Compliance is confirmed by runtime behaviour across genuinely independent copies, and by the package's own surface checks. Tests constructing two independently evaluated copies confirm that the copies produce distinct handler constructors yet adopt one protocol-compatible realm cache; that concurrent loads from both copies for the same content-hash key, resolving different absolute chunk URLs, issue exactly one shared-dependency fetch; that a sequential load across the copies reuses the fulfilled promise; that both loads nonetheless mint distinct blob URLs — distinct module specifiers prepared per load, over the shared text — so only source text was shared (module evaluation itself is not exercised: the test runtime cannot import a `blob:` URL, so no test claims evaluation it did not perform); and that two fallback-key loads resolving different absolute URLs share nothing. Further tests confirm the protocol's defensive half. A first test confirms that an entry carrying an unrecognized version is neither read, mutated, replaced nor deleted, and that the load still succeeds by falling back to a local cache. Two further tests confirm the fallback's own scope has both halves ADR-0035 requires, each proven directly rather than assumed from the other: one confirms that the fallback is SHARED within one evaluated copy — two handlers constructed from the same copy against the same unrecognized entry resolve to the identical fallback instance, a fetch driven through one is observed as a cache hit by the other, the fallback itself evicts at the same 128-entry bound the realm cache does, and the unrecognized entry remains untouched throughout; the other confirms that the fallback is SEPARATE across independently evaluated copies — two copies falling back against the same unrecognized entry get two distinct fallback instances, and a fetch driven through one copy's handler is not observed as a hit by the other copy's handler, which issues its own fetch instead. A further test confirms only that a realm-cache hit is not scoped to any single handler instance: a second, independently constructed handler in the same copy — with no reference passed between the two — hits the same realm cache the first handler used; this test does not exercise, and makes no claim about, lifetime, disposal, or discard. Identity tests confirm that a rejected promise is evicted and retryable, and that rejection of an older promise cannot evict a newer promise under the same key — driven through the production eviction-on-rejection callback itself, not a hand-rolled stand-in for it. A single-copy test confirms the positive half of the generation rule directly: an attempt that actually joins a replacement generation can, on its own subsequent timeout, release exactly that generation. A staggered cross-copy test confirms the negative half end to end: two copies join one promise, the first copy's attempt times out and identity-deletes it, a retry publishes a replacement, the second copy's ledger then releases the promise it recorded, and the replacement is still mapped. No test asserts a waiter count, because waiter tracking is not part of the protocol. A protocol trust test confirms that a structurally conforming protocol-v1 cache already present in the slot is adopted by BOTH independently loaded copies, which records the accepted trust model rather than pretending to authenticate its publisher. Capacity tests prove exactly the 128-entry mapping bound, least-recently-used recency and eviction on the 129th distinct insertion, and that the bound multiplies by neither handler nor compatible package-copy count — never that 128 is empirically optimal. The package build confirms that no public export and no bridge capability was added. The realm effect is confirmed end to end by capturing shared-dependency network requests for a nested-host composition and observing one fetch per distinct build identity rather than one per copy, with every microfrontend still mounting.

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

Put the cache in the realm-global slot the nesting composition already uses to hand a bridge down and a link callback back up.

* Good, because it mints no new global slot and reuses a convergence mechanism already proven across copies.
* Bad, because that slot's contract scopes its entry to one synchronous mount window and requires that nothing remain at the rendezvous once the window closes; a page-lifetime cache is exactly what it forbids, so this option is not a reuse of that mechanism but an amendment of it.
* Bad, because it couples a loading concern to the mount handshake, so a change to either subsystem's rendezvous discipline would have to reason about the other.

### Reach the cache through the inbound bridge link or a child bridge capability

Add a source-text or cache-access operation to the channel that already crosses a nesting boundary.

* Good, because the channel exists and already spans the copy boundary that needs spanning.
* Bad, because `cpt-frontx-constraint-mfes-cross-nesting-reachability` forbids exactly this: a new capability method is a new operation a consumer can invoke, which is the measure that constraint applies.
* Bad, because source loading is unrelated to dispatch reachability; the bridge carries participation in communication, and widening it to carry bytes for the loader conflates two concerns the package keeps apart.

### Attach the cache to the bridge object handed across the nesting boundary

Carry the cache as a property on the bridge instance a parent hands to a child, in the plain-property style inter-copy state already uses.

* Good, because it avoids a new global slot and travels with an object reference that already crosses the boundary.
* Bad, because it reaches only hosts related by a parent–child bridge, so two unrelated handlers in the same realm — the independent roots this decision exists to serve — still deduplicate nothing.
* Bad, because it entangles a page-lifetime cache with bridge teardown, which is scoped to an extension's registration, complicating a lifetime that has no reason to be complicated.

### Inject the ancestor host's handler instance into the nested host

Have the composed application pass the outer handler down and let the nested registry reuse it instead of constructing its own.

* Good, because it needs no new mechanism in the package at all, only a different composition.
* Bad, because it requires every composed application to wire it, so the benefit depends on cooperation the runtime cannot assume from independently authored hosts.
* Bad, because it couples a nested host to an ancestor's handler implementation, and the nested host would then share far more than source text with its ancestor.
* Bad, because it does nothing for two independent roots in the same realm, which have no ancestor to inherit a handler from.

### Keep the cache handler-local

Leave the reach where it is and treat per-copy refetching as the cost of copy isolation.

* Good, because it holds no realm-global state and needs no protocol, no version negotiation and no new failure mode.
* Bad, because it preserves the demonstrated per-copy refetching of shared dependencies whose declared identity already proves the reuse safe.
* Bad, because it leaves the cache's stated cross-microfrontend purpose unmet in exactly the composition the platform is built to support, where the second copy's fetches are the ones worth avoiding.

## More Information

This decision extends `cpt-frontx-adr-shared-dep-dedup-key` and changes nothing it fixed: the key's identity and its fail-safe fallback are the same, and this decision only settles how far a key that already proves reuse safe is allowed to reach. Which symbol description, accessor name, capacity constant and structural cache interface realize the protocol are implementation shapes belonging to the FEATUREs that own the loading path's behaviour, cited by ID from the Traceability section below; this decision fixes the reach, the version-namespaced convergence discipline, the lifetime and bounding posture, and the scope asymmetry between the two caches.

This protocol is **separate** from `cpt-frontx-algo-mfe-host-communication-registration-propagation` and does **not** amend it. That instruction owns the mount-context rendezvous and the inbound link, scopes its entry to one synchronous mount window, and requires that nothing remain at the rendezvous once the window closes; this decision mints a slot of its own precisely so that contract stays intact, and neither the existing mount-context symbol nor the existing inbound-link symbol changes.

`cpt-frontx-adr-mfe-load-isolation` is unaffected. Every load continues to mint its own isolated module graph regardless of where its shared-dependency source text came from: what crosses the copy boundary here is inert text that each load rewrites and wraps for itself, never a module record, so the per-instance isolation guarantee is untouched — the same reasoning `cpt-frontx-adr-shared-dep-dedup-key` records for cache provenance, now applied across copies rather than within one. The load cache, which does hold evaluated graphs, is the cache this decision keeps copy-local for exactly that reason.

For accuracy, and as non-binding present detail rather than part of this decision's durable identity: the convergence slot is `Symbol.for('@gears-frontx/mfes:shared-dep-text-cache:1')`, the entry it holds carries the protocol version alongside the cache, and the realm capacity is 128 least-recently-used entries — a fixed policy constant chosen without measurement, sufficient for the twelve-dependency nested-host composition that motivated this decision, and not a demonstrated optimum for every production composition. A future incompatible protocol takes the next suffix — `:2` — on a slot of its own.

The decision records this at the layer level alongside `cpt-frontx-adr-mfe-load-isolation` and `cpt-frontx-adr-shared-dep-dedup-key`, the two decisions it is bounded by and the one it extends, so a single decision chain stays under one convention. The root DESIGN's ownership matrix admits member-level decision records in principle; relocating the runtime's decision chain is one deliberate migration, not a consequence of the newest decision in it.

**Review trigger.** Sustained eviction churn is the review trigger for the capacity constant: revisit if it, or a composition needing more concurrent distinct build identities than the realm capacity admits, is measured; if an explicit handler disposal ownership contract is introduced, which would make retainer counting arguable on its own terms (registry disposal alone would not, since registries do not own handler lifetime); if an incompatible change to the cache key's meaning becomes necessary, which requires a protocol-version bump here; or if a mechanism arrives that lets independently loaded copies converge on shared state without a realm-global slot.

**Checklist applicability.** ARCH — applicable and addressed above: this fixes an inter-copy protocol every composed application's loading path depends on, and a published slot with adopters is costly to reverse. SEC — applicable and addressed above, with an explicit acceptance rather than a mitigation: what crosses the copy boundary is source text whose reuse is already gated by the declared-identity key and module isolation is preserved intact, but the rendezvous slot is trusted same-realm coordination state and authenticates no publisher, so code already executing in the realm can pre-occupy or mutate it and thereby observe or substitute shared-dependency source text. That is accepted on the ground recorded under Consequences: the realm is already the trusted coordination domain, `cpt-frontx-adr-mfe-load-isolation` governs admission and evaluation of microfrontend code but offers no isolation from code that has already obtained same-realm execution, and this protocol adds no admission path and grants no execution capability to an unadmitted party. No cross-copy authentication is implementable under the stated constraints, and an unrecognized or malformed entry is left untouched rather than trusted. PERF — applicable and addressed above: eliminating per-copy refetching is the driver, and the realm-wide bound is the memory counterweight. REL — applicable and addressed above: the identity-checked release and rejection eviction keep a hung or failed fetch recoverable, and the accepted duplicate retry is stated. INT — Not applicable, because no external contract changes: the published manifest's shape is untouched and the protocol is internal to independently loaded copies of one package. DATA — Not applicable, because no persistent store or schema is defined; entries are page-lifetime source text. OPS — Not applicable, because no deployed-service procedure is governed. COMPL — Not applicable. UX — Not applicable, because the consequence is fetch count, addressed under PERF. BIZ — Not applicable, because product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-nfr-runtime-performance` — the shared-dependency source-text cache this NFR's mechanism describes is the mechanism this decision rescopes: its reach must span the independently loaded copies a composed application produces, or the deduplication the NFR credits it with does not occur where it matters most.
* `cpt-frontx-nfr-security` — reuse remains gated by the declared-identity key, and what is shared across the copy boundary is inert source text rather than a module record, so no microfrontend gains a capability or an evaluated graph it did not declare.
* `cpt-frontx-fr-mfe-runtime-registration` — on-demand loading of a registered microfrontend is the path this cache sits in; this decision fixes how far that path's source-text reuse extends when registration happens in more than one independently loaded copy.
* `cpt-frontx-component-mfe-runtime` — this decision constrains how the MFE Runtime component's loading path converges on shared source text across copies, and which of its caches stays copy-local.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — the member-level constraint this decision establishes, which binds compatible copies in one realm to the versioned bounded source-text cache without sharing module graphs or growing the public surface.
* `cpt-frontx-constraint-mfes-cross-nesting-reachability` — the public-surface guarantee this decision is bound by: the convergence mechanism adds no importable symbol and no capability method, so the composition stays invisible to consumers.
