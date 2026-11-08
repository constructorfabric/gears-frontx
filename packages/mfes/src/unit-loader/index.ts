/**
 * Sanctioned subpath `@gears-frontx/mfes/unit-loader`: the list loader a
 * host-side boot chunk (or any runtime copy that is not the orchestrating
 * `MfeHandlerMF`) uses to read a fetch list, fetch and verify its items,
 * realm-cache them, and mint per-load `blob:` URLs — and nothing else.
 *
 * The surface is exactly the loader capability classes:
 * `SharedDepListLoader` (list read, one-parallel-batch fetch,
 * dependency-order mint, lazy/pattern dependent-list resolution),
 * `VerifiedUnitFetcher` (the fetch → SHA-256 verify → realm-cache admit
 * → evict-on-reject discipline), `SharedAssetUrlResolver` (shared-file
 * `location` → fetch URL validation), and
 * `RealmSharedDepTextCacheProvider` (the realm-wide, version-namespaced
 * content-identity cache compatible copies of this package converge
 * on). With them a host runs `fetchListDocument`/`registerList` →
 * `loadList` → `resolveDependent` with no hand-written fetch or URL
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
// List loader: read an entry's flat fetch list (from a document
// reference or inline boot data), fetch every item missing from the
// realm cache in one parallel batch, mint per load in dependency
// order, and resolve lazy/pattern dependent lists on first use.
export { SharedDepListLoader } from '../handler/mfe-handler-mf/SharedDepListLoader';
export type {
  SharedDepListContext,
} from '../handler/mfe-handler-mf/SharedDepListLoader';
export type {
  SharedDepListRecord,
  SharedDepListMintMaps,
  ListDynamicImportRewrites,
} from '../handler/mfe-handler-mf/SharedDepListMinter';

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

// Realm cache: the versioned `Symbol.for` rendezvous compatible copies
// converge on; an entry whose shape or protocol version a copy does not
// recognize is left untouched and never shared (do-not-share), the copy
// proceeding on its own bounded fallback cache.
export { RealmSharedDepTextCacheProvider } from '../handler/mfe-handler-mf/RealmSharedDepTextCacheProvider';
export type { SharedDepTextCache } from '../handler/mfe-handler-mf/RealmSharedDepTextCacheProvider';
export type { RealmSharedDepTextCacheDiagnostics } from '../handler/mfe-handler-mf/ByteBudgetLruCache';

// Fetch-list contract types the loader is typed against (type-only: no
// implementation crosses the subpath).
export type {
  SharedDepFetchList,
  SharedDepListItem,
  SharedDepFileRef,
  SharedDepBootData,
  SharedDepImportEdge,
  SharedDepOpaqueImport,
  SharedDepProducer,
} from '../unit-format/fetch-list';
export type { MfManifest } from '../manifest/mf-manifest';
// @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-no-orchestration
// @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-classes
