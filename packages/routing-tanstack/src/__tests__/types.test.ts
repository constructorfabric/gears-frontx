import { describe, expectTypeOf, it } from 'vitest';
import { createRootRoute, createRootRouteWithContext, type RouterHistory } from '@tanstack/react-router';
import { createProviderRouter, type EngineProviderProps, type ProviderRouterOptions } from '../router-creation.js';

// These are compile-time-only assertions (`expectTypeOf`): the `it` bodies
// below execute as ordinary, no-op vitest tests so `npm test` stays green,
// while `tsc` is what actually enforces every assertion — mirroring
// `packages/routing/src/__tests__/types.test.ts`'s own convention.
//
// H5 (quality review of `d8ce4c97`): before this file, a route tree built
// with `createRootRouteWithContext` — one that requires a `context` at
// construction — could be handed to `createProviderRouter` (or mounted
// through `EngineProvider`'s `{routeTree, history}` shape) with the options
// argument, or the `routerOptions` prop, omitted entirely, and neither call
// site failed to type-check. `RouterConstructorOptions`'s own `context`
// field is already conditionally required (`@tanstack/router-core`'s
// `RouterContextOptions`, keyed off the route tree's inferred context
// type), but that per-property requiredness is invisible to a caller
// whenever the *whole* argument/prop carrying it is itself declared
// optional: omitting an optional value is never checked against what its
// own members would have required had it been supplied. Fixed by keying
// the very presence of that argument/prop off the same condition
// (`EmptyRouterOptions extends ProviderRouterOptions<TRouteTree>`),
// mirrored in `router-creation.tsx` for both `createProviderRouter`'s
// trailing parameter and `EngineProviderProps`'s own `routerOptions` field.
declare const history: RouterHistory;

const treeWithContext = createRootRouteWithContext<{ apiClient: string }>()({ component: () => 'root' });
const treeWithoutContext = createRootRoute({ component: () => 'root' });

describe('createProviderRouter — context requiredness', () => {
  it('the trailing options argument is required, not optional, for a route tree that declares a router context', () => {
    // An instantiation expression (no call) pins `TRouteTree` to a concrete
    // type, resolving the conditional tuple that stays deferred inside the
    // function's own generic body — the same concreteness a real call site
    // gets from inferring `TRouteTree` off its own `routeTree` argument.
    const pinned = createProviderRouter<typeof treeWithContext>;

    // Positively pins the third parameter to exactly the options type, with
    // no `| undefined` — the omission-is-an-error claim, stated as "the
    // parameter equals the required shape" rather than as a negative
    // "not callable without it" (which `expect-type` does not support for
    // generic overloads: `toBeCallableWith` is positive-only).
    expectTypeOf(pinned).parameter(2).toEqualTypeOf<ProviderRouterOptions<typeof treeWithContext>>();
    expectTypeOf(pinned).toBeCallableWith(treeWithContext, history, { context: { apiClient: 'x' } });
  });

  it('stays optional for a route tree that declares no router context', () => {
    const pinned = createProviderRouter<typeof treeWithoutContext>;

    expectTypeOf(pinned).parameter(2).toEqualTypeOf<ProviderRouterOptions<typeof treeWithoutContext> | undefined>();
    expectTypeOf(pinned).toBeCallableWith(treeWithoutContext, history);
  });
});

describe('EngineProviderProps — routerOptions requiredness', () => {
  it('rejects a {routeTree, history} props shape missing routerOptions, for a context-bearing tree', () => {
    type WithoutRouterOptions = { routeTree: typeof treeWithContext; history: RouterHistory };

    // The requiredness claim itself: a shape that omits `routerOptions`
    // does not satisfy `EngineProviderProps` for a context-bearing tree.
    // `.not.toExtend` is one of the few `expect-type` matchers that support
    // negation for a structural (non-overloaded) comparison like this one.
    expectTypeOf<WithoutRouterOptions>().not.toExtend<EngineProviderProps<typeof treeWithContext>>();
  });

  it('accepts a {routeTree, history, routerOptions} props shape for a context-bearing tree', () => {
    type WithRouterOptions = {
      routeTree: typeof treeWithContext;
      history: RouterHistory;
      routerOptions: { context: { apiClient: string } };
    };

    expectTypeOf<WithRouterOptions>().toExtend<EngineProviderProps<typeof treeWithContext>>();
  });

  it('leaves routerOptions optional for a route tree that declares no router context', () => {
    type WithoutRouterOptions = { routeTree: typeof treeWithoutContext; history: RouterHistory };

    expectTypeOf<WithoutRouterOptions>().toExtend<EngineProviderProps<typeof treeWithoutContext>>();
  });
});
