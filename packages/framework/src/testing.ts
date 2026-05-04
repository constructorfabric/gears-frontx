/**
 * Test-only entry for @cyberfabric/framework.
 *
 * Utilities here are intended for Vitest (or similar) teardown between cases.
 * `resetSharedQueryClient` is also re-exported from the package root when
 * importing alongside runtime symbols.
 */

// @cpt-dod:cpt-frontx-dod-framework-composition-reexports:p1

// @cpt-begin:cpt-frontx-dod-framework-composition-reexports:p1:inst-testing-subpath-exports
export { describeBootstrapMfeContract } from './testing/describeBootstrapMfeContract';
export type {
  BootstrapMfeResolveArgs,
  BootstrapMfeTestSpecOptions,
} from './testing/describeBootstrapMfeContract';
export {
  peekSharedQueryClient,
  peekSharedQueryClientRetainers,
  peekQueryClientBroadcastTarget,
  peekAppQueryClient,
  peekAppQueryClientResolver,
  peekAppQueryClientActivator,
} from './testing/queryCacheTestHooks';
export { resetSharedQueryClient } from './plugins/queryCache';
// @cpt-end:cpt-frontx-dod-framework-composition-reexports:p1:inst-testing-subpath-exports
