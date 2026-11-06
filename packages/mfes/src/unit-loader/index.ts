/**
 * Sanctioned subpath `@gears-frontx/mfes/unit-loader`: the unit loader a
 * host-side boot chunk (or any runtime copy that is not the orchestrating
 * `MfeHandlerMF`) uses to fetch, verify, realm-cache and mint shared-dependency
 * units — and nothing else.
 *
 * The surface is exactly the loader capability classes:
 * `SharedUnitGraphLoader` (fetch and verify of the `./unit-format` graph
 * files and unit/pack text), `UnitBlobMinter` (minting per-load `blob:`
 * URLs in dependency order), `RealmSharedDepTextCacheProvider` (the
 * realm-wide, version-namespaced content-identity cache compatible
 * copies of this package converge on), `VerifiedUnitFetcher` (the fetch
 * → SHA-256 verify → realm-cache admit → evict-on-reject discipline a
 * `buildPlan` call consumes), `SharedAssetUrlResolver` (shared-file
 * `location` → fetch URL validation), and `PackFallbackPolicy` (carrying
 * the documented `DEFAULT_BUDGET_MS` static for `buildPlan`'s
 * `packFallbackBudgetMs`). With them a host runs
 * `loadGraph` → `buildPlan` → `mint` with no hand-written fetch or URL
 * logic. The accompanying types are type-only and carry no
 * implementation.
 *
 * Nothing below reaches the registry, the orchestrating handler
 * (`MfeHandlerMF`), or the mediator: a host that loads its own shared set
 * through this subpath pulls only the collaborator classes the loading
 * path itself is built from, never the orchestration that admits and
 * isolates a registered microfrontend. The unit-loader entry is built as
 * its own package `exports` subpath beside `./unit-format` and adds
 * nothing to the root barrel.
 *
 * @cpt-dod:cpt-frontx-dod-unit-format-contract-loader-surface:p1
 *
 * @packageDocumentation
 */

// @cpt-begin:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-classes
// @cpt-begin:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-no-orchestration
// Fetch and verify: graph-file fetching, SHA-256 content-identity
// verification, `requires` closure checking and root reachability.
export { SharedUnitGraphLoader } from '../handler/mfe-handler-mf/SharedUnitGraphLoader';
// Needed-graphs fetch: the `requires` closure of the declared roots,
// so a boot fetches only the graph files its entries can reach.
export { SharedGraphSetLoader } from '../handler/mfe-handler-mf/SharedGraphSetLoader';
export type {
  SharedDepSourceRecord,
  SharedUnitGraphPlan,
  SharedUnitReach,
  LoadedGraph,
} from '../handler/mfe-handler-mf/SharedUnitGraphLoader';

// Verified fetch: fetch → SHA-256 verify → realm-cache admit →
// evict-on-reject, deduping verified text by content identity through
// the realm cache. `fetchText` is injected; `cache` and `ledger` default
// to the realm rendezvous and no ledger.
export { VerifiedUnitFetcher } from '../handler/mfe-handler-mf/VerifiedUnitFetcher';
export type { AttemptSourceTextLedger } from '../handler/mfe-handler-mf/AttemptSourceTextLedger';

// Shared-asset URL validation: shared-file `location` → absolute fetch
// URL under the shared asset base, by the same rules a shared
// `chunkPath` is checked against.
export { SharedAssetUrlResolver } from '../handler/mfe-handler-mf/SharedAssetUrlResolver';

// Pack fallback: the `DEFAULT_BUDGET_MS` static is the documented
// default for `buildPlan`'s `packFallbackBudgetMs`.
export { PackFallbackPolicy } from '../handler/mfe-handler-mf/PackFallbackPolicy';

// Mint: leaves-first `blob:` URL minting and the specifier→blob map a
// load rewrites unit and own-chunk imports against.
export { UnitBlobMinter } from '../handler/mfe-handler-mf/UnitBlobMinter';

// Realm cache: the versioned `Symbol.for` rendezvous compatible copies
// converge on; an entry whose shape or protocol version a copy does not
// recognize is left untouched and never shared (do-not-share), the copy
// proceeding on its own bounded fallback cache.
export { RealmSharedDepTextCacheProvider } from '../handler/mfe-handler-mf/RealmSharedDepTextCacheProvider';
export type { SharedDepTextCache } from '../handler/mfe-handler-mf/RealmSharedDepTextCacheProvider';
export type { RealmSharedDepTextCacheDiagnostics } from '../handler/mfe-handler-mf/ByteBudgetLruCache';

// Manifest contract types `loadGraph`/`rootsForExposedModule`/`buildPlan`
// are typed against (type-only: no implementation crosses the subpath).
export type {
  MfManifest,
  MfManifestShared,
  MfManifestRoot,
} from '../manifest/mf-manifest';
// @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-no-orchestration
// @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-classes
