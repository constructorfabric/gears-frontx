/**
 * Sanctioned subpath `@gears-frontx/mfes/unit-loader`: the shared-unit
 * fetcher and the location-to-URL resolver a host-side boot chunk (or any
 * runtime copy that is not the orchestrating `MfeHandlerMF`) uses to admit
 * shared text to the realm cache — and nothing else.
 *
 * The surface is exactly two classes and no type: `SharedUnitFetcher`
 * (constructed with a fetch function and a label its errors carry; its
 * `fetch` admits a list item's text under the key derived from the
 * declared content identity) and `SharedAssetUrlResolver` (a location, a
 * base and a label to an absolute fetch URL). The contract types come from
 * `@gears-frontx/mfes/unit-format`.
 *
 * Nothing below reaches the registry, the orchestrating handler
 * (`MfeHandlerMF`), or the mediator, and the subpath adds nothing to the
 * root barrel.
 *
 * @packageDocumentation
 */

// @cpt-algo:cpt-frontx-algo-unit-format-contract-loader-surface:p1
// @cpt-begin:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-classes
// @cpt-begin:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-no-orchestration
export { SharedUnitFetcher } from '../handler/mfe-handler-mf/SharedUnitFetcher';
export { SharedAssetUrlResolver } from '../handler/mfe-handler-mf/SharedAssetUrlResolver';
// @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-no-orchestration
// @cpt-end:cpt-frontx-algo-unit-format-contract-loader-surface:p1:inst-loader-surface-classes
