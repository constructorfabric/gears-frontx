---
status: accepted
date: 2026-11-17
description: "Decides that shared-dependency source text, keyed as the reuse decision fixes, is reused across independently loaded copies of the runtime through one dedicated, version-namespaced realm-global rendezvous, admitted from outside the package only through the shared-unit fetcher, in a realm cache bounded by an application-configurable byte budget with least-recently-used eviction."
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
  - [Admission only through the shared-unit fetcher](#admission-only-through-the-shared-unit-fetcher)
  - [A public seeding operation accepting caller-supplied text](#a-public-seeding-operation-accepting-caller-supplied-text)
  - [A fixed entry count with least-recently-used eviction](#a-fixed-entry-count-with-least-recently-used-eviction)
  - [A byte budget on retained source text with least-recently-used eviction](#a-byte-budget-on-retained-source-text-with-least-recently-used-eviction)
  - [Unbounded retention for the realm's lifetime](#unbounded-retention-for-the-realms-lifetime)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-shared-dep-cache-reach`

## Context and Problem Statement

`cpt-frontx-adr-shared-dep-reuse` fixes *what identity* reuse of shared-dependency source text is keyed on: the content identity of the unit or fetch-list document a manifest or a fetch list references, or, for a whole-package entry that declares none, its resolved absolute location. That decision leaves open *how far* the cache holding that text reaches, and *how it is bounded*. A composed application does not have one handler: a mounted microfrontend may itself host a further registry, and when it does, that nested host constructs its own handler from its own independently loaded copy of the runtime package — the copy boundary `cpt-frontx-adr-mfe-load-isolation` guarantees. A cache held per handler, or per copy, therefore stops at that handler or copy. Two copies in one browser realm would keep disjoint caches, and text whose declared content identity is identical on both sides would be fetched once per copy rather than once per realm, even though the identical declared identity states that the two loads want the same bytes.

The bound is the second half of the problem. Under `cpt-frontx-adr-shared-dep-reuse` a load reaches many content-identified list items of widely varying size, each shared under the content identity its producer declares. A long-lived page accumulates such text from arbitrarily many builds, and `cpt-frontx-nfr-resource-efficiency` requires the shared source text the runtime retains to stay within an application-configurable byte budget and to be observable. A bound on the number of entries says nothing about bytes when entry sizes range from a few hundred bytes to a whole package.

How far should shared source text be reusable, through which mechanism should independently loaded copies converge on it, and how should the cache that holds it be bounded?

## Decision Drivers

* **Reuse must follow the declared identity** — where two loads agree on the content identity of what they fetch, the second fetch buys nothing; a reach that stops short of that agreement discards a benefit `cpt-frontx-adr-shared-dep-reuse` establishes as safe (`cpt-frontx-nfr-runtime-performance`).
* **Retained memory is bounded in bytes and observable** — `cpt-frontx-nfr-resource-efficiency` asks that shared code be transferred at most once per page, that retained shared source text stay within an application-configurable byte budget, and that the runtime report the figures needed to check that bound.
* **Load latency stays within budget** — `cpt-frontx-nfr-runtime-performance` sets the load-time budget; eviction must cost hit rate, not correctness, and a refetch after eviction must not reopen a network transfer the browser can already serve.
* **Module isolation is not negotiable** — whatever is shared must be source text and never a module record: each load continues to mint its own isolated module graph, as `cpt-frontx-adr-mfe-load-isolation` requires, so sharing is confined to inert bytes that a load rewrites and evaluates for itself.
* **Shared text is keyed by its declaration** — text is reused under the content identity its producer declares, and text that declares no identity only under its absolute location, so the realm cache hands a load only text whose key its own declaration names; the declared identity is a sharing key, not a grant of trust in code.
* **Contained public surface** — the only public additions are the `./unit-format` and `./unit-loader` subpaths decided in `cpt-frontx-adr-shared-dep-reuse`, because `cpt-frontx-constraint-mfes-cross-nesting-reachability` and `cpt-frontx-constraint-mfes-realm-shared-dep-cache` hold the package's published contract closed against incremental widening.
* **No application wiring** — a composed application obtains the benefit by composing microfrontends, not by threading an implementation object from an ancestor host into a descendant; a mechanism that only works when the application cooperates does not hold for the independently authored hosts the runtime admits.
* **Independently evaluated copies must not misread one another's state** — two copies in one realm may be different package versions, so a convergence point must let an incompatible copy recognize that it does not understand what it found, and back away, rather than operate on it.
* **No lifecycle contract invented to serve a cache** — the runtime has no handler disposal contract and registries do not own handler lifetime, so a release discipline must not be invented for the sole benefit of reclaiming a bounded cache.

## Considered Options

Reach — how independently loaded copies converge on one cache:

* **A dedicated, version-namespaced realm-global cache rendezvous** — a new `Symbol.for` slot on the realm's global object, distinct from every existing rendezvous, holding a version-tagged entry that carries the one cache compatible copies converge on.
* **Host the cache at the existing mount-context rendezvous** — reuse the realm-global slot the nesting composition uses to hand a bridge down and a relink callback back up.
* **Reach the cache through the inbound bridge link or a child bridge capability** — add a source-text or cache operation to the channel that crosses a nesting boundary.
* **Attach the cache to the bridge object handed across the nesting boundary** — carry it as a property on the bridge instance a parent hands to a child.
* **Inject the ancestor host's handler instance into the nested host** — have the composed application pass the outer handler down and let the nested registry reuse it rather than constructing its own.
* **Keep the cache handler-local** — treat per-copy refetching as the cost of copy isolation.

Host admission — how code outside the package places text in the realm cache:

* **Admission only through the shared-unit fetcher** — code outside the package fetches text through the same shared-unit fetcher a microfrontend load uses.
* **A public seeding operation accepting caller-supplied text** — code outside the package hands the runtime text it obtained itself, together with a key.

Bound — how the realm cache limits what it retains:

* **A fixed entry count with least-recently-used eviction.**
* **A byte budget on retained source text with least-recently-used eviction.**
* **Unbounded retention for the realm's lifetime.**

## Decision Outcome

Chosen options: **a dedicated, version-namespaced realm-global cache rendezvous** for reach, because it is the only option that lets independently loaded compatible copies converge without a new public export, without application wiring, and without borrowing a channel whose own contract forbids holding long-lived state; **admission only through the shared-unit fetcher** for host admission, because it is the only option that admits text only under the key a declared content identity fixes and keeps the key forms internal; and **a byte budget on retained source text with least-recently-used eviction** for the bound, because it is the only option that bounds what `cpt-frontx-nfr-resource-efficiency` measures, whatever the mix of entry sizes.

**Reach.** Shared source text is reusable across independently loaded compatible copies of the runtime package within one JavaScript realm. The cache represents immutable source text keyed by content identity or by absolute location, not handler state and not registry state, and the realm's global object is the only location independently evaluated copies reliably share. Sharing it shares no module record: every load still constructs its own isolated graph over that text.

**Contents and admission.** The realm cache holds every shared text, under these keys:

* fetch-list documents, keyed `list:<content identity>`;
* list items, keyed `chunk:<content identity>`;
* whole-package entries that declare a content identity, keyed `name@version@<content identity>`;
* whole-package entries that declare no content identity, keyed `name@version@<absolute URL>`. These are reused only by loads resolving the identical absolute location, on the assumption that the content at a location does not change during the realm's lifetime, and the runtime writes a notice naming the dependency and the manifest, once per handler for each dependency and manifest among the most recent pairs it has noticed, so the memory the notices keep stays bounded.

The key scheme is part of the protocol below. No two keys of different forms can collide, because the manifest contract fixes the value formats (`cpt-frontx-adr-mfe-asset-discovery`): a package name carries no colon, so no whole-package key starts with a `list:` or `chunk:` prefix; and neither a package name, a version nor a content identity carries a colon, while an absolute URL always does, so a whole-package key built from a content identity never equals one built from an absolute URL. The keys derive from declared manifest and fetch-list data and are free of package-copy, handler, registry and object identity.

Text fetched for a declared content identity — a fetch-list document, a list item, or a whole-package entry that declares one — is admitted to the realm cache under that identity's key as fetched, as `cpt-frontx-adr-mfe-asset-discovery` decides; whole-package entries that declare none are admitted under a key built from their absolute URL; none of them passes through the handler's URL-keyed source-text cache. A microfrontend's own code — its entry module, its further and lazy chunks, and the own chunks a fetch list names — is never admitted to the realm cache.

**Host participation.** The only path by which code outside the package admits text to the realm cache is the shared-unit fetcher `SharedUnitFetcher` on `@gears-frontx/mfes/unit-loader`. It takes a fetch function and a label that its errors carry; it fetches a shared unit through the realm cache under the same discipline as a microfrontend load, and derives the cache key itself from the unit's declared content identity. The key forms listed under Contents stay internal to the protocol below; no public operation takes or exposes a key.

**Protocol.** Convergence happens at one realm-global symbol carrying an explicit protocol version in its description, whose value is an entry tagged with that same version and holding the cache. The cache is reached behind an accessor that is internal to the package; the public shared-unit fetcher reaches the same cache through that accessor. The cache exposes only the operations the loading path needs, described structurally rather than by class identity, because class identity cannot be relied on across copies. A copy that finds no entry creates the cache and publishes the entry synchronously before returning it. A copy that finds an entry of the version it understands adopts that cache. A copy that finds a malformed entry or a version it does not recognize treats the realm entry as absent, logs a diagnostic, neither reads, mutates, replaces nor deletes what it found, and proceeds on its own copy-local fallback cache, bounded by the same byte budget and shared by every handler of that copy. A future incompatible protocol takes a new symbol suffix, so that old and new protocols coexist rather than compete for one slot. The key forms listed under Contents are part of this protocol, and any incompatible change to the meaning of the cache key requires a protocol-version change here.

**Trust.** The realm slot is a trusted same-realm coordination point, not an authenticity or confidentiality boundary. A structurally conforming entry of the understood version is adopted regardless of which same-realm code published it. Version and structural checks protect against accidental incompatibility; they do not establish publisher identity or prevent a same-realm publisher from observing or substituting cached source text. No cross-copy authentication is available to change this: independently loaded copies share no prior secret, no unforgeable common object identity and no class identity, and a brand, a frozen wrapper, an extra symbol, an embedded key or a structural method set can each be reproduced or captured by code already executing in the realm. Admission through the shared-unit fetcher fixes how the protocol's honest participants admit text — under the key its declaration names — but it does not defend against code that already executes in the realm.

**Bound.** The realm cache is bounded by a byte budget on the source text it retains, once for the whole realm rather than per handler or per copy, and evicts least-recently-used entries when admitting text would exceed the budget. Bytes are accounted when text is fulfilled, since an in-flight fetch has no size yet. A chosen default budget applies, large enough to hold the shared working set of a shell and a few microfrontends and small relative to the memory a page uses. An application configures its own budget through runtime configuration (`MfeLoaderConfig`). The budget is set by the configuration of the first handler that publishes the realm cache, or by the default when that handler configures none; later handlers adopt the published cache unchanged, so a configured budget never multiplies the realm's footprint. A single text larger than the whole budget is never retained: it is evicted as soon as its size is known, and the load that fetched it proceeds with the text it already holds. Eviction only drops text. A later load that needs evicted text refetches it from its location, which the browser's HTTP cache ordinarily serves without a new download, and admits it again under the same key; a caller already holding the evicted text proceeds unaffected. A weakly held design is rejected: a JavaScript string cannot itself be weakly referenced, so it would need boxed values and rehydration after a miss, while collection would be nondeterministic and could destroy the sequential cross-copy reuse this decision exists to create.

Fetch-list documents, list items and whole-package entries are held only in the realm cache, so the realm byte budget bounds all retained shared text. The handler's URL-keyed source-text cache holds only a microfrontend's own code. It is bounded by an entry count with least-recently-used eviction, because the text it holds is reused only by repeated loads that the same handler serves; its capacity is specified in `cpt-frontx-feature-mfe-isolation`.

**Lifetime.** The realm cache's lifetime is the realm's. It is **not** retainer-counted: handler destruction, registry disposal, extension unmount and extension unregistration neither clear nor release it, and no expiry window applies; only the byte budget removes entries. This deliberately diverges from `cpt-frontx-adr-api-transport-bypass-and-fetch-sharing`, which retainer-counts a structurally similar realm-global cache. Retainer counting is right there because that cache has explicit holders, a freshness and invalidation contract, and a retain/release lifecycle to hang release on. None of those exist here: the handler has no disposal contract, a registry receives handlers rather than owning them, and source-text reuse is independent of extension registration — so retainer counting would have to invent the ownership boundary it depends on, and would risk clearing entries another live handler still benefits from. The inline-content references each load mints over the text are owned by that load under `cpt-frontx-adr-mfe-load-isolation`, not by this cache, so eviction of text never touches a reference a load holds.

**Timeout release and retry.** When a load attempt times out, every source-text entry it was waiting on is released — every realm cache entry, whatever its key form, the whole-package entries included, and the handler cache entries of its own code — so a retry issues its own fetch instead of rejoining a hung one. Release is identity-checked against the exact promise the attempt recorded, on the cache that received that promise. It therefore never removes a newer generation that another attempt published under the same key, never cancels the work behind the promise, and never disturbs a waiter that already holds it. Eviction on rejection uses the same identity check. The rationale is recovery without shared bookkeeping: a retry can always recover from a hung fetch, and no cross-copy waiter count is needed, so none is left behind when a copy or handler is discarded. The accepted price is a possible duplicate fetch across retry generations. Releasing only when the timed-out attempt is an entry's sole waiter is rejected, because while any other waiter remained, a retry would rejoin a possibly hung promise and could never recover. A load that joins another load's in-flight fetch which then rejects retries once from its own URL, unless the load has already failed. A failed load admits no text to the realm cache after the failure and issues no further request. Text admitted before the failure stays admitted and serves any later load as it is; the in-flight entries the failed load published are released under the same identity check, so a later load issues its own fetch rather than joining work the failed load abandoned.

**Diagnostics.** On the fetch-list path, each load writes one console diagnostic: the bytes of the fetch-list document and list items that the load itself fetched — excluding the microfrontend's own code, requests it joined and lazy batches — and the realm cache's held bytes, entry count, budget and evictions; when the adopted cache reports no figures, the diagnostic states that they are unavailable. The retained-memory threshold of `cpt-frontx-nfr-resource-efficiency` can therefore be checked from the runtime's own output.

**Cache scoping.** The caches in the loading path have deliberately different scopes, and the asymmetry is part of this decision.

| Cache | Scope | Bound | Lifetime | Why |
|---|---|---|---|---|
| Realm source-text cache | One JavaScript realm, across compatible independently loaded copies | Byte budget on retained text, least-recently-used eviction | Realm | Holds fetch-list documents and list items, and whole-package entry text under a content-identity or absolute-location key |
| Handler source-text cache | One handler; keyed by absolute URL | Entry count, least-recently-used eviction (`cpt-frontx-feature-mfe-isolation`) | Handler | Holds only a microfrontend's own code, reused by repeated loads the same handler serves |
| Load cache | One evaluated package copy | Bounded by the extension instances registered; no capacity-driven eviction | Realm | Holds extension-instance load results and their isolated module graphs; a failed load's entry is removed (`cpt-frontx-adr-mfe-load-isolation`) |

The realm cache is held per handler as a reference obtained from the realm accessor, not as a copy-static field: the reference is instance-held while the cache it names is realm-shared, and a static field would share only within one evaluated copy while hiding the actual scope. The load cache stays class-static within an evaluated copy and must not use this protocol: sharing it across copies would conflate extension identity and, decisively, would share lifecycle and module-evaluation results across the boundary `cpt-frontx-adr-mfe-load-isolation` requires separate isolated loads for.

### Consequences

* Good, because reuse reaches as far as the declared content identity does: two loads that agree on the identity of what they fetch transfer it once per realm rather than once per copy.
* Good, because all retained shared text is bounded in bytes, the measure `cpt-frontx-nfr-resource-efficiency` sets, and the bound holds whether a page's entries are many small list items or a few whole packages.
* Good, because the bound applies once per realm, independent of how many handlers or copies a composition constructs.
* Good, because eviction costs at most a refetch, which the browser's HTTP cache ordinarily serves; correctness never depends on what the cache still holds.
* Good, because text is held under the content-identity key its declaration names, and whole-package text that declares no identity only under its absolute location, which no content-identity key can match, so a load reuses only text whose key its own declaration names.
* Good, because code outside the package admits text to the realm cache only through the shared-unit fetcher, under the key the unit's declared content identity fixes, as a microfrontend load does.
* Good, because the mechanism needs no application wiring and no public addition beyond the two subpaths, so a composed application gains the benefit by composing.
* Good, because the version-tagged entry lets an incompatible copy recognize that it does not understand what it found and fall back locally, instead of operating on state whose semantics it cannot establish.
* Good, because the reported bytes held, entry count, budget and evictions make the bound and its pressure observable.
* Bad, because realm-global state is deliberate global coupling: a copy that publishes a malformed entry, or a future copy that reuses this slot with different semantics, degrades every compatible copy to its local fallback.
* Bad, and accepted: any code already executing in the realm can pre-occupy or mutate the well-known rendezvous slot and thereby observe or substitute cached source text. This is accepted because the JavaScript realm is already the trusted coordination domain: `cpt-frontx-adr-mfe-load-isolation` controls how microfrontend code is admitted and evaluated through the audited loading path, but does not provide isolation from arbitrary code that has already obtained same-realm execution. This protocol creates no new admission path and grants no code execution capability to an otherwise unadmitted party.
* Bad, because the runtime must account the size of every retained text, which an entry-count bound would not require.
* Bad, because one budget serves every composition in the page, set by whichever handler publishes the realm cache first, so a page whose working set exceeds it trades hit rate for the bound rather than growing to fit.
* Bad, because the handler's source-text cache is bounded by entry count rather than bytes, so a microfrontend's own code is not covered by the realm byte budget.
* Bad, because a timeout in one copy may release a realm entry another copy is awaiting; the waiter is unaffected, but a later caller for that key may start a duplicate fetch. That is the accepted price of a retry that can recover from a hung fetch.
* Neutral, because the cache outlives every handler that ever touched it and only the budget reclaims entries before the realm ends, which is sound for immutable text keyed by content identity or location and would not be for anything with freshness semantics.

### Confirmation

Compliance is confirmed by runtime behaviour across genuinely independent copies, and by the package's own tests.

Reach. Tests constructing two independently evaluated copies confirm that the copies produce distinct handler constructors yet adopt one protocol-compatible realm cache; that concurrent loads from both copies for the same content identity, resolving different absolute locations, issue exactly one fetch; that a sequential load across the copies reuses the cached text; and that both loads nonetheless mint distinct inline-content references — distinct module specifiers prepared per load over the shared text — so only source text was shared. A further test confirms that a realm-cache hit is not scoped to any single handler instance: a second, independently constructed handler in the same copy, with no reference passed between the two, hits the same realm cache the first handler used.

Contents and admission. Tests confirm that fetch-list documents and list items are admitted to the realm cache under their `list:` and `chunk:` keys, as fetched; that fetch-list documents, list items and whole-package entry text are held in the realm cache and never in the handler's source-text cache; that a whole-package entry carrying no content identity is held under its `name@version@<absolute URL>` key, with one notice per handler for each dependency and manifest, and that a URL-keyed entry never collides with a hash-keyed one; that keys for different absolute locations do not share, even across copies; and that the entry module and the own chunks a fetch list names are never admitted to the realm cache. Tests of the `./unit-loader` subpath confirm that its shared-unit fetcher takes only a fetch function and a label, admits only text it fetched, and keys it by the declared content identity; that the subpath reaches no registry, orchestrating handler or mediator module; and that two loader copies converge on one realm cache slot. The exact exports of the subpath are confirmed by the public-surface test of `cpt-frontx-adr-shared-dep-reuse`.

Bound. Tests confirm that admission beyond the configured byte budget evicts least-recently-used entries until the retained bytes fit; that a configured budget replaces the default, and that without one the default byte budget is enforced; that the bound multiplies by neither handler nor compatible package-copy count; and that a load needing evicted text refetches it; that a single text larger than the whole budget is not retained, while the load that fetched it still completes; and that the budget of the first handler that publishes the realm cache applies, so a later handler's configured budget leaves the published cache unchanged. Tests confirm that the runtime reports bytes held, entry count, budget and evictions, and that those figures match the cache's state; that the per-load figure counts the fetch-list document and list-item bytes that load itself fetched and excludes the microfrontend's own code, joined requests and lazy batches; and that, when the adopted cache reports no figures, the diagnostic states that they are unavailable.

Protocol. A test confirms that an entry carrying an unrecognized version is neither read, mutated, replaced nor deleted, and that the load still succeeds by falling back to a local cache. Two further tests confirm each half of the fallback's scope directly rather than inferring one from the other: two handlers constructed from the same copy against the same unrecognized entry resolve to the identical fallback instance, a fetch driven through one is observed as a hit by the other, and the fallback evicts at the same byte budget the realm cache does; two independently evaluated copies falling back against the same unrecognized entry get two distinct fallback instances, and a fetch driven through one is not observed as a hit by the other. A protocol trust test confirms that a structurally conforming cache already present in the slot is adopted by both independently loaded copies, which records the accepted trust model rather than pretending to authenticate its publisher.

Release. Identity tests confirm that a rejected promise is evicted and retryable, and that rejection of an older promise cannot evict a newer promise under the same key, driven through the production eviction-on-rejection callback itself. A single-copy test confirms that an attempt that joins a replacement generation can, on its own later timeout, release exactly that generation. A staggered cross-copy test confirms that, after the first copy's attempt times out and a retry publishes a replacement, the second copy's release removes only the promise it recorded and the replacement stays mapped. A join test confirms that a load which joined another load's in-flight fetch that then rejects issues one retry from its own URL, and none once the load has failed. A failure test confirms that a failed load admits no text to the realm cache after the failure and issues no further request, that text admitted before the failure stays in the realm cache, and that the in-flight entries the load published are released while a replacement another load published under the same key stays mapped. A timeout test confirms that a timed-out attempt releases the whole-package entries it waited on as well as its fetch-list document and list-item entries. Lifetime tests confirm that handler discard, registry disposal, extension unmount and extension unregistration leave the realm cache's entries in place.

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
* Bad, because it refetches, once per copy, text whose declared content identity is already identical on both sides, contrary to the transfer-once threshold of `cpt-frontx-nfr-resource-efficiency`.
* Bad, because it leaves cross-microfrontend reuse unmet in exactly the composition the platform is built to support, where the second copy's fetches are the ones worth avoiding.

### Admission only through the shared-unit fetcher

Code outside the package admits text to the realm cache only by fetching it through the shared-unit fetcher on `./unit-loader`, under the same fetch and admit discipline a microfrontend load uses.

* Good, because every text admitted from outside the package enters under the key its declared content identity fixes, exactly as a load's text does, and no key form becomes public.
* Good, because it adds no operation beyond the fetcher the loading path already uses.
* Bad, because code outside the package cannot hand over text it already holds; text enters the realm cache only through a fetch the shared-unit fetcher issues.

### A public seeding operation accepting caller-supplied text

A public operation lets code outside the package place text it obtained itself into the realm cache under a key it supplies.

* Good, because text the caller already holds is admitted with no further fetch.
* Bad, because the caller supplies the key, so the key forms — an internal protocol between copies — become public, and a caller can place text it obtained itself under a key other loads reuse.
* Bad, because it widens the public surface with an operation that writes to realm-shared state.

### A fixed entry count with least-recently-used eviction

Bound the realm cache by a fixed number of resident entries, evicting the least recently used.

* Good, because it needs no size accounting and is cheap to enforce.
* Bad, because it bounds mappings, not bytes: with list items ranging from a few hundred bytes to a whole package, no byte ceiling follows from any entry count.
* Bad, because it cannot express the application-configurable byte budget `cpt-frontx-nfr-resource-efficiency` requires.
* Bad, because a load reaching many small list items fills an entry count quickly, so eviction churn rises while retained bytes stay small, costing hit rate for no memory benefit.

### A byte budget on retained source text with least-recently-used eviction

Bound the realm cache by the bytes of fulfilled text it retains, evicting the least recently used entries when admission would exceed the budget; a chosen default applies, and the application can configure its own.

* Good, because it bounds exactly the quantity the retained-memory threshold measures, whatever the mix of entry sizes.
* Good, because many small list items do not cause eviction until they actually consume the budget.
* Good, because eviction is cheap to recover from: the text lives at a location the browser's HTTP cache ordinarily serves, and it is admitted again under the same key on refetch.
* Good, because the budget is a single reported figure, so held bytes against budget and eviction counts make the bound's pressure observable.
* Bad, because every retained text must be size-accounted.
* Bad, because a single default cannot fit every working set, so applications with unusual working sets must configure their own.

### Unbounded retention for the realm's lifetime

Keep every admitted text until the realm ends.

* Good, because it never evicts, so every repeated need is a hit.
* Good, because it needs neither size accounting nor eviction policy.
* Bad, because retained memory grows with every distinct build a long-lived page encounters, which `cpt-frontx-nfr-resource-efficiency` forbids.
* Bad, because there is no budget to report against, so the retained-memory threshold cannot be checked.

## More Information

This decision extends `cpt-frontx-adr-shared-dep-reuse`: it uses the keys and the scoping of entries without a content identity that decision fixes, and settles how far those keys reach and how the cache holding the text is bounded. The declared content identity as the sharing key, and the value formats that keep the key forms apart, are decided in `cpt-frontx-adr-mfe-asset-discovery`; this decision relies on both and decides neither. The symbol description, accessor name, configuration key, structural cache interface, default budget and handler cache capacity that realize the protocol are implementation shapes specified in `cpt-frontx-feature-mfe-isolation` and `cpt-frontx-feature-mfe-loading`.

This record deliberately bundles reach, host admission and bound, because they cannot be decided apart: a realm-wide reach is only acceptable when everything admitted to the realm cache enters through one admission path under the key its declaration fixes and when a realm-wide byte bound holds it, and the bound's scope follows from the reach.

This protocol is **separate** from `cpt-frontx-algo-mfe-host-communication-registration-propagation`. That instruction owns the mount-context rendezvous and the inbound link, scopes its entry to one synchronous mount window, and requires that nothing remain at the rendezvous once the window closes; this decision uses a slot of its own, distinct from the mount-context symbol and the inbound-link symbol, so that contract holds.

`cpt-frontx-adr-mfe-load-isolation` holds: every load mints its own isolated module graph regardless of where its source text came from, and what crosses the copy boundary here is inert text that each load rewrites and wraps for itself, never a module record or an inline-content reference. The load cache, which does hold evaluated graphs, is the cache this decision keeps copy-local for exactly that reason.

For accuracy, and as non-binding present detail rather than part of this decision's durable identity: the rendezvous is realized in `packages/mfes/src/handler/mfe-handler-mf/RealmSharedDepTextCacheProvider.ts`, which also holds the default budget; the convergence slot is `Symbol.for('@gears-frontx/mfes:shared-dep-text-cache:1')`; the entry it holds has the shape `{ v: 1, cache }`, carrying the protocol version alongside the cache; and the content identity a manifest declares on a shared entry is carried in the field `contentHash`. A future incompatible protocol takes the next suffix — `:2` — on a slot of its own.

The decision records this at the layer level alongside `cpt-frontx-adr-mfe-load-isolation`, `cpt-frontx-adr-mfe-asset-discovery` and `cpt-frontx-adr-shared-dep-reuse`, the decisions it is bounded by and the one it extends, so a single decision chain stays under one convention.

**Review trigger.** Revisit the default budget if sustained eviction churn is observed under it in representative compositions; revisit the lifetime posture if an explicit handler disposal ownership contract is introduced, which would make retainer counting arguable on its own terms (registry disposal alone would not, since registries do not own handler lifetime); revisit the protocol version if an incompatible change to the cache key's meaning becomes necessary; and revisit the reach mechanism if a mechanism arrives that lets independently loaded copies converge on shared state without a realm-global slot.

**Checklist applicability.**

* ARCH — applicable and addressed above: this fixes an inter-copy protocol and a memory bound every composed application's loading path depends on, and a published slot with adopters is costly to reverse.
* SEC — applicable and addressed above, with an explicit acceptance rather than a mitigation: text is held under the content-identity key its producer declares, whole-package text that declares no identity only under its absolute location, code outside the package admits text only through the shared-unit fetcher, and module isolation is preserved intact. The declared content identity is a sharing key, not a grant of trust in code; the runtime treats a registered MFE entry and its manifest as admitted input, and authenticating them is outside the package. The rendezvous slot is trusted same-realm coordination state and authenticates no publisher, so code already executing in the realm can pre-occupy or mutate it and thereby observe or substitute cached source text. That is accepted on the ground recorded under Consequences: the realm is already the trusted coordination domain, `cpt-frontx-adr-mfe-load-isolation` governs admission and evaluation of microfrontend code but offers no isolation from code that has already obtained same-realm execution, and this protocol adds no admission path and grants no execution capability to an unadmitted party. No cross-copy authentication is implementable under the stated constraints, and an unrecognized or malformed entry is left untouched rather than trusted.
* PERF — applicable and addressed above: eliminating per-copy refetching is the driver, the byte budget is the memory counterweight, eviction costs a refetch the browser's HTTP cache ordinarily serves, and the reported bytes held, entry count, budget and evictions make both observable.
* REL — applicable and addressed above: identity-checked release and rejection eviction keep a hung or failed fetch recoverable, the accepted duplicate retry is stated, and an incompatible copy degrades to a bounded local fallback.
* INT — applicable and addressed above: the shared-unit fetcher contract on `./unit-loader`, the only path by which code outside the package admits text to the realm cache, and the application-configurable byte budget, carried by runtime configuration, are this decision's integration surface. The rendezvous protocol is internal to independently loaded copies of one package.
* DATA — applicable and addressed above: no persistent store is defined, but the realm entry shape and the cache-key forms are a data protocol between independently loaded copies of the package; an incompatible change to either takes a new protocol version and slot.
* OPS — Not applicable because no deployed-service procedure is governed; the reported figures are library behaviour, not operations monitoring.
* MAINT — applicable and addressed above: the protocol version and the structural cache interface let independently released copies coexist, and the accessor stays internal so the cache can change without a public-surface change.
* TEST — applicable and addressed above: the runtime package's tests across independently evaluated copies, listed under Confirmation, are the verification this decision rests on.
* COMPL — Not applicable because no regulated or personal data is processed.
* UX — Not applicable because the consequence is fetch count and memory, addressed under PERF.
* BIZ — Not applicable because this is a technical decision; product requirements live in the PRD and are cited by ID.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following requirements and design elements:

* `cpt-frontx-nfr-resource-efficiency` — the realm cache transfers shared text at most once per page across every copy, holds all retained shared text within an application-configurable byte budget, and reports bytes held, entry count, budget and evictions.
* `cpt-frontx-nfr-runtime-performance` — the cache's reach spans the independently loaded copies a composed application produces, so deduplication happens where it matters most, and eviction costs only a refetch the browser's HTTP cache ordinarily serves.
* `cpt-frontx-nfr-security` — text is held only under the content-identity key or absolute location its declaration names, and what crosses the copy boundary is inert source text rather than a module record, so no microfrontend gains a capability or an evaluated graph it did not declare; the slot's same-realm trust model is stated and accepted rather than claimed as a boundary.
* `cpt-frontx-fr-mfe-runtime-registration` — on-demand loading of a registered microfrontend is the path this cache sits in; this decision fixes how far that path's source-text reuse extends when registration happens in more than one independently loaded copy, and how its retained text is bounded.
* `cpt-frontx-component-mfe-runtime` — this decision constrains how the MFE Runtime component's loading path converges on shared source text across copies, how that cache is bounded and reported, and which of its caches stay handler-local or copy-local.
* `cpt-frontx-constraint-mfes-realm-shared-dep-cache` — the member-level constraint this decision establishes, which binds compatible copies in one realm to the versioned, byte-bounded source-text cache without sharing module graphs or growing the public surface beyond the `./unit-format` and `./unit-loader` subpaths.
* `cpt-frontx-constraint-mfes-cross-nesting-reachability` — the public-surface guarantee this decision is bound by: the convergence mechanism adds no importable symbol and no capability method, so the composition stays invisible to consumers.
* `cpt-frontx-algo-mfe-isolation-realm-shared-dep-cache-rendezvous` — the algorithm that realizes the version-namespaced realm slot, its adoption and structural checks, and the copy-local fallback this decision fixes.
* `cpt-frontx-dod-mfe-isolation-realm-shared-dep-text-cache` — the definition of done that fixes the realm cache's byte budget, admission rule, identity-checked release, reporting and scope asymmetry.
* `cpt-frontx-feature-mfe-isolation` — the FEATURE that specifies the realm cache protocol, the default budget and the handler source-text cache capacity.
* `cpt-frontx-adr-shared-dep-reuse` — the decision whose reuse identity this cache's keys carry and whose public surface includes the shared-unit fetcher.
* `cpt-frontx-adr-mfe-asset-discovery` — the decision that fixes the declared content identity as the sharing key and the value formats that keep the key forms apart.
* `cpt-frontx-adr-mfe-load-isolation` — the decision whose per-load isolation this cache preserves by sharing only source text.
