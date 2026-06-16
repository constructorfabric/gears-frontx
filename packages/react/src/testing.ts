/**
 * Test-only entry for @gears-frontx/react.
 *
 * Utilities here are intended for Vitest (or similar) suites that need access
 * to query-client wiring without importing package internals directly.
 */

// @cpt-dod:cpt-frontx-dod-react-bindings-provider:p1

// @cpt-begin:cpt-frontx-dod-react-bindings-provider:p1:inst-react-testing-reexports
export {
  bootstrapHAI3QueryClient,
  resolveHAI3QueryClient,
  useOptionalHAI3QueryClient,
} from './queryClient';

/** App-layer tests must import this from `@gears-frontx/react/testing`, not `@gears-frontx/framework/testing`. */
export { describeBootstrapMfeContract } from '@gears-frontx/framework/testing';
export type {
  BootstrapMfeResolveArgs,
  BootstrapMfeTestSpecOptions,
} from '@gears-frontx/framework/testing';
// @cpt-end:cpt-frontx-dod-react-bindings-provider:p1:inst-react-testing-reexports
