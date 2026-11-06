/**
 * Sanctioned subpath `@gears-frontx/mfes/unit-loader`: the unit loader a
 * host-side boot chunk (or any runtime copy that is not the orchestrating
 * `MfeHandlerMF`) uses to fetch, verify, realm-cache and mint shared-dependency
 * units — and nothing else.
 *
 * @cpt-begin:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-classes
 * The surface is exactly three classes: `SharedUnitGraphLoader` (fetch and
 * verify of the `./unit-format` graph files and unit/pack text), `UnitBlobMinter`
 * (minting per-load `blob:` URLs in dependency order), and
 * `RealmSharedDepTextCacheProvider` (the realm-wide, version-namespaced
 * content-identity cache compatible copies of this package converge on).
 * The accompanying types are type-only and carry no implementation.
 * @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-classes
 *
 * @cpt-begin:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-no-orchestration
 * Nothing below reaches the registry, the orchestrating handler
 * (`MfeHandlerMF`), or the mediator: a host that loads its own shared set
 * through this subpath pulls only the collaborator classes the loading path
 * itself is built from, never the orchestration that admits and isolates a
 * registered microfrontend. The unit-loader entry is built as its own
 * package `exports` subpath beside `./unit-format` and adds nothing to the
 * root barrel.
 * @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-no-orchestration
 *
 * @cpt-dod:cpt-frontx-dod-unit-format-contract-loader-surface:p1
 *
 * @packageDocumentation
 */

// Fetch and verify: graph-file fetching, SHA-256 content-identity
// verification, `requires` closure checking and root reachability.
export { SharedUnitGraphLoader } from '../handler/mfe-handler-mf/SharedUnitGraphLoader';
export type {
  SharedDepSourceRecord,
  SharedUnitGraphPlan,
  SharedUnitReach,
  LoadedGraph,
} from '../handler/mfe-handler-mf/SharedUnitGraphLoader';

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
