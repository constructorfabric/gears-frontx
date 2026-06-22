---
status: accepted
date: 2026-06-05
---

# Plugin Short-Circuit and Realm-Shared Fetch Cache


<!-- toc -->

- [Context and Problem Statement](#context-and-problem-statement)
- [Decision Drivers](#decision-drivers)
- [Considered Options](#considered-options)
- [Decision Outcome](#decision-outcome)
  - [Consequences](#consequences)
  - [Confirmation](#confirmation)
- [Pros and Cons of the Options](#pros-and-cons-of-the-options)
  - [Per-instance caches with hard-coded transport bypass](#per-instance-caches-with-hard-coded-transport-bypass)
  - [Generic plugin short-circuit plus a realm-scoped, retainer-counted, library-agnostic shared fetch cache](#generic-plugin-short-circuit-plus-a-realm-scoped-retainer-counted-library-agnostic-shared-fetch-cache)
  - [Dependency on an external shared-cache/state library](#dependency-on-an-external-shared-cachestate-library)
- [More Information](#more-information)
- [Traceability](#traceability)

<!-- /toc -->

**ID**: `cpt-frontx-adr-short-circuit-and-shared-fetch-cache`
## Context and Problem Statement

Independently bundled microfrontends running in the same browser realm frequently issue identical or overlapping fetches, and many cross-cutting plugins need to return a response without performing a network round trip. The API Protocol Surface (`cpt-frontx-component-api-surface`) must let a plugin supply a response in place of a network call, and must let independently bundled units converge on shared in-flight and completed fetch results — without taking a runtime dependency on any caching or state-management library, and while meeting the runtime performance targets in `cpt-frontx-nfr-runtime-performance`. How should the surface let a plugin bypass transport, and how should it share fetch results across separately bundled units in one realm?

## Decision Drivers

* **Bypass without special-casing** — any plugin must be able to return a response in place of the transport call through one uniform mechanism, so the surface need not special-case any particular kind of response provider.
* **Cross-bundle reuse within a realm** — separately bundled units that share a realm must be able to deduplicate concurrent fetches and reuse completed results, so the same data is not fetched repeatedly. This serves the runtime performance targets in `cpt-frontx-nfr-runtime-performance`.
* **Library-agnostic, dependency-light** — the reuse mechanism must not impose a runtime dependency on any specific caching or state library, keeping the surface a self-contained Core Framework unit.
* **Bounded lifetime and safe teardown** — shared state must be reclaimable: it must track how many holders depend on it and release cleanly when the last holder departs, so the cache cannot outlive its consumers or be retained beyond teardown.
* **Correctness under concurrency and cancellation** — concurrent consumers of one in-flight fetch must share a single request and observe consistent cancellation, freshness, and invalidation semantics.

## Considered Options

* **Per-instance caches with hard-coded transport bypass** — each protocol instance owns a private cache, and transport bypass is a built-in branch in the surface reserved for known providers.
* **Generic plugin short-circuit plus a realm-scoped, retainer-counted, library-agnostic shared fetch cache** — a uniform short-circuit return contract any plugin can use, paired with a single fetch cache hosted on the realm's global object, keyed by request identity, reference-counted by holders, and reclaimed when the last holder releases.
* **Dependency on an external shared-cache/state library** — adopt an established caching or state-management library as a runtime dependency and host shared results inside it.

## Decision Outcome

Chosen option: **Generic plugin short-circuit plus a realm-scoped, retainer-counted, library-agnostic shared fetch cache**, because it satisfies the bypass-without-special-casing, cross-bundle-reuse, library-agnostic, and bounded-lifetime drivers together. A single short-circuit return shape lets any plugin substitute a response without the surface knowing the plugin's purpose, and a realm-global, retainer-counted cache lets independently bundled units share in-flight and completed fetches while remaining reclaimable on teardown — all with no runtime dependency on a caching library. The per-instance option cannot share across bundles and forces the surface to special-case bypass; the external-library option reintroduces the runtime dependency the surface exists to avoid.

The short-circuit contract is a discriminated return value: a plugin returns either the (possibly modified) request context or a wrapper carrying an immediate response, and a type guard lets the protocol detect and honour it, skipping transport. The shared fetch cache is reached through a well-known realm-global symbol so that separately bundled copies of the surface converge on one instance; it deduplicates concurrent fetches by request-identity key, retains results subject to a freshness window, exposes invalidation, tracks a retainer count, and resets when the final retainer releases.

### Consequences

* Good, because any plugin can bypass transport through one mechanism, so any response provider needs no special core support.
* Good, because separately bundled units in one realm share in-flight and completed fetches, reducing duplicate network work in support of the runtime performance targets.
* Good, because the mechanism is library-agnostic and adds no runtime dependency, keeping the surface self-contained.
* Good, because retainer counting bounds the shared cache's lifetime and gives deterministic teardown when the last holder releases.
* Bad, because hosting shared state on a realm-global symbol is a deliberate global coupling that demands disciplined retain/release to avoid stale or orphaned state.
* Bad, because correct request-identity keying and freshness/invalidation semantics add implementation complexity that consumers must trust rather than inspect.

### Confirmation

Compliance is confirmed by design and code review plus automated tests against four invariants: (1) every transport bypass flows through the single short-circuit return contract and its type guard, with no provider-specific branch in the surface; (2) the shared cache is reached only through the well-known realm-global symbol, so separately bundled instances converge on one cache (verified by an instance-sharing test); (3) concurrent consumers of one key share a single in-flight fetch and observe consistent cancellation, freshness, and invalidation (verified by deduplication and abort tests); (4) the retainer count returns to zero and the shared state is released after the last holder releases (verified by a retain/release lifecycle test). Performance is verified by measuring duplicate-fetch elimination against the realm-shared path versus an unshared baseline.

## Pros and Cons of the Options

### Per-instance caches with hard-coded transport bypass

Each protocol instance keeps a private cache and special-cases bypass inside the surface for known providers.

* Good, because state is encapsulated per instance with no global coupling.
* Good, because there is no realm-global lifetime to manage.
* Bad, because separately bundled instances cannot share fetches, so duplicate network work persists across bundles.
* Bad, because bypass is special-cased in the core, conflicting with the bypass-without-special-casing driver.

### Generic plugin short-circuit plus a realm-scoped, retainer-counted, library-agnostic shared fetch cache

A uniform short-circuit return contract any plugin can use, plus a single realm-global, reference-counted, library-agnostic fetch cache keyed by request identity.

* Good, because one bypass contract serves every plugin purpose without core special-casing.
* Good, because separately bundled units share fetches within a realm.
* Good, because it adds no runtime dependency and reclaims state via retainer counting.
* Neutral, because it relies on a well-known global symbol as the convergence point.
* Bad, because realm-global state requires disciplined retain/release to stay correct.

### Dependency on an external shared-cache/state library

Adopt an established caching or state-management library as a runtime dependency and host shared results inside it.

* Good, because it reuses a mature, battle-tested implementation.
* Bad, because it imposes a runtime dependency the surface is designed to avoid, dictating the consumer's stack.
* Bad, because cross-bundle sharing still depends on every bundle resolving the same library instance, reintroducing the coupling without removing it.

## More Information

The mechanism described here ships in the `@gears-frontx/api` package. For accuracy (and as non-binding present detail): the short-circuit return contract and its guards are defined in `packages/api/src/types.ts` — `ShortCircuitResponse` (`types.ts:275`), `isShortCircuit` (`types.ts:410`), and the protocol-specific `RestShortCircuitResponse` / `SseShortCircuitResponse` with `isRestShortCircuit` / `isSseShortCircuit`. The request/response protocol honours short-circuit results in `packages/api/src/protocols/RestProtocol.ts` (the short-circuit bypass in `executePreparedRequest`). The shared fetch cache is defined in `packages/api/src/sharedFetchCache.ts`: the `SharedFetchCache` contract (`sharedFetchCache.ts:35`), the realm-global host symbols `SHARED_FETCH_CACHE_SYMBOL` and `SHARED_FETCH_CACHE_RETAINERS_SYMBOL` (`sharedFetchCache.ts:13`–`14`), `getSharedFetchCache` / `peekSharedFetchCache`, and the retainer lifecycle `retainSharedFetchCache` / `releaseSharedFetchCache` / `resetSharedFetchCache`. Concurrent-fetch deduplication, freshness, and invalidation live in `getOrFetch`, `lookup`, and `invalidateMany`. The request/response protocol opts into shared reuse through `getWithSharedCache` in `packages/api/src/protocols/RestProtocol.ts`. These specific symbols and paths are present detail for reviewer verification and are not part of this decision's durable identity.

**Checklist applicability** — PERF is addressed above (performance drivers, consequences, and the Confirmation measurement). INTEGRATION is partially relevant (the short-circuit return shape is a plugin-facing contract) and is covered by the short-circuit invariant in Confirmation. SECURITY, RELIABILITY, DATA, and OPERATIONS are Not applicable: this decision adds no secrets, defines no persistent schema, and prescribes no operational runbook; reliability concerns are limited to the bounded-lifetime and cancellation semantics already captured in Drivers and Confirmation.

## Traceability

- **PRD**: [PRD.md](../PRD.md)
- **DESIGN**: [DESIGN.md](../DESIGN.md)

This decision directly addresses the following design elements and requirements:

* `cpt-frontx-component-api-surface` — This decision defines the API Protocol Surface's generic plugin short-circuit mechanism and its realm-scoped, retainer-counted, library-agnostic shared fetch cache. It is intentionally below PRD interface altitude and therefore anchors the DESIGN component.
* `cpt-frontx-nfr-runtime-performance` — Realm-shared deduplication and reuse of in-flight and completed fetches reduce duplicate network work for applications composed from many microfrontends, supporting the runtime response-time and throughput targets.
