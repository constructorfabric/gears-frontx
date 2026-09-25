// Router Creation And Mount Over A Virtual History
// `cpt-frontx-algo-routing-engine-provider-router-creation`.
//
// FEATURE (engine-provider) §3, "Router Creation And Mount Over A Virtual
// History".
import { useEffect, useMemo, type ReactElement } from 'react';
import {
  createRouter,
  RouterProvider,
  type AnyRoute,
  type AnyRouter,
  type RouterConstructorOptions,
  type RouterHistory,
} from '@tanstack/react-router';
import type { EngineProviderPort } from '@gears-frontx/routing';
import { adaptProviderHistory } from './engine-provider-history.js';
import { attachAdaptedHistory } from './history-adaptation.js';

/**
 * Every construction option the engine accepts except the two this package
 * supplies itself. `routeTree` and `history` are `createProviderRouter`'s
 * own positional arguments — `history` in particular has to stay the
 * adapted, virtual one for the constructed router to match nothing but this
 * occupant's own virtual location — and everything else the engine offers
 * at construction passes through untouched. `context` is the motivating
 * member: an application whose route loaders reach an API client, a query
 * client, or any other consumer-owned dependency states it here, at the one
 * call site that constructs the router.
 *
 * Written as the engine's own constructor-options type minus those two
 * fields, rather than a hand-listed subset, so an option the engine gains
 * is available here without an edit and none of them silently diverges from
 * its own definition. Naming that type is this package's own business: the
 * engine-provider port (`@gears-frontx/routing`) stays a function of
 * `{history, entryAddress, routeTree}` alone, so nothing of the engine's
 * surface reaches the core package through this seam.
 */
export type ProviderRouterOptions<TRouteTree extends AnyRoute> = Omit<
  RouterConstructorOptions<TRouteTree, 'never', false, RouterHistory, Record<string, unknown>>,
  'routeTree' | 'history'
>;

/**
 * The structural "no required properties" probe the two requiredness
 * conditionals below key off (`EmptyRouterOptions extends ProviderRouterOptions<TRouteTree>`):
 * true exactly when every member of `ProviderRouterOptions<TRouteTree>` — `context`
 * chief among them — is itself optional, i.e. an empty object literal would
 * already satisfy it. `object`/`unknown` cannot stand in for it: neither is
 * structurally compatible with a type that has required named members, which
 * is the one property this probe needs.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentional structural probe, not "any value"; see doc comment above.
type EmptyRouterOptions = {};

/**
 * Calls `createRouter({ ...options, routeTree, history })` with the microfrontend's own
 * route tree and the adapted, virtual history built by history adaptation
 * (`./history-adaptation.js`, `./composed-history-source.js`,
 * `./standalone-history-source.js`). The resulting router matches only its
 * own virtual location — the pathname and search this package projected
 * from the occupant's own entry, or from the page's own address in
 * standalone mode — because `history` itself is already scoped to nothing
 * else; no separate code enforces that property. This same call is also
 * where FEATURE §3, Standalone Deployment, steps 4 and 5 land: the
 * standalone case runs through this identical function and
 * `EngineProvider` below, differing only in which `history` was adapted
 * (`./engine-provider-history.js`) — "the same construction path the
 * composed case uses" is this file, unmodified for standalone.
 *
 * FEATURE §3, Router Creation, steps 1-2, 4; Standalone Deployment, steps
 * 4-5; Swap-The-Router-Engine flow, step 5 ("construct-router") for the
 * default provider's own instance of that step — this function only
 * constructs; the router it returns is mounted separately, by
 * `EngineProvider` below, via `RouterProvider`.
 */
// @cpt-algo:cpt-frontx-algo-routing-engine-provider-router-creation:p2
// @cpt-algo:cpt-frontx-algo-routing-engine-provider-standalone-deployment:p2
// @cpt-dod:cpt-frontx-dod-routing-engine-provider-adaptation-and-creation:p1
// @cpt-dod:cpt-frontx-dod-routing-engine-provider-redirect-and-standalone:p1
// @cpt-flow:cpt-frontx-flow-routing-engine-provider-swap-engine:p1
export function createProviderRouter<TRouteTree extends AnyRoute>(
  routeTree: TRouteTree,
  history: RouterHistory,
  // A plain `options?: ProviderRouterOptions<TRouteTree>` would still leave
  // `context` reachable as unset: `ProviderRouterOptions`'s own `context`
  // member is conditionally required (see below), but that per-property
  // requiredness is invisible to a caller who omits the *whole* argument —
  // an optional parameter accepts no value at all, and TypeScript never
  // checks what an absent value's own members would have required had it
  // been supplied. Keying the parameter's own presence off the same
  // condition (`EmptyRouterOptions extends ProviderRouterOptions<TRouteTree>`) closes that
  // gap: the argument itself becomes required whenever the route tree
  // declares a context, so a call site holding a concrete, context-bearing
  // route tree cannot omit it at all, not merely fail to satisfy it once
  // supplied.
  //
  // The conditional needs `TRouteTree` resolved to a concrete route tree to
  // pick a branch; a caller that is itself still generic over
  // `T extends AnyRoute` and forwards that unresolved `T` straight through
  // (`function wrap<T extends AnyRoute>(tree: T, h) { return
  // createProviderRouter(tree, h); }`) gets a compile error at the
  // forwarding call even for a `T` that will only ever be a
  // context-optional tree at every call site that instantiates it — such a
  // generic caller must pin the tree to a concrete type before forwarding,
  // or accept and forward its own `options` parameter instead of omitting
  // it.
  ...[options]: EmptyRouterOptions extends ProviderRouterOptions<TRouteTree>
    ? [options?: ProviderRouterOptions<TRouteTree>]
    : [options: ProviderRouterOptions<TRouteTree>]
) {
  // `RouterConstructorOptions`'s own `context` field is conditionally
  // required, keyed off `TRouteTree`'s own inferred router-context type
  // (`@tanstack/router-core`'s `RouterContextOptions`) — a conditional type
  // TypeScript cannot resolve against a still-generic `TRouteTree`, only
  // against a concrete one. The cast below is the one place that mismatch
  // is bridged. `ProviderRouterOptions` above is that same conditional type
  // minus the two fields this function supplies, so a call site holding a
  // concrete route tree does get the requiredness checked — both that a
  // supplied `context` matches, and, via the rest-parameter conditional
  // above, that the argument itself was supplied at all; only this
  // generic body works with it unresolved.
  //
  // A route tree that declares a router context and is constructed without
  // one does not fail here: `createRouter` returns normally and the
  // router's own `options.context` is `undefined`. The failure arrives
  // later, inside the first `beforeLoad` or loader that reads a member off
  // that context, with nothing left at that point to connect it to the
  // construction that omitted it. The `options` parameter above is the way
  // out of that: the context is stated where the router is built.
  //
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-scope-to-entry
  // `routeTree` and `history` are written after the spread, so no caller
  // can displace either. `history` is passed straight through, unmodified —
  // already scoped to nothing but this occupant's own virtual location by
  // history adaptation (`./history-adaptation.js`), never re-scoped or
  // filtered here — which is what keeps the constructed router matching
  // only that virtual location, never a sibling occupant's own or another
  // domain's (step 2).
  const constructorOptions = { ...options, routeTree, history } as RouterConstructorOptions<
    TRouteTree,
    'never',
    false,
    RouterHistory,
    Record<string, unknown>
  >;
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-scope-to-entry
  // The construct call itself is the smallest fragment implementing both
  // the swap-engine flow's own "constructs its engine's router" step and
  // the standalone-deployment algo's "same `createRouter` call the composed
  // case uses" step — neither instruction has code of its own beyond this
  // one call. It returns the router constructed, not mounted: mounting
  // (`RouterProvider`) is a separate instruction, performed by
  // `EngineProvider` below, with its own marker at its own call site there —
  // this call site's own ids were renamed off "…-and-mount"/"…-mounted-…"
  // for exactly this reason: the port this function backs constructs a
  // router the consumer mounts through the provider, it does not mount one
  // itself.
  // @cpt-begin:cpt-frontx-flow-routing-engine-provider-swap-engine:p1:inst-construct-router
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-standalone-deployment:p2:inst-construct-with-standalone-virtual-history
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-call-create-router
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-return-constructed-router
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-standalone-deployment:p2:inst-return-standalone-router
  return createRouter(constructorOptions);
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-standalone-deployment:p2:inst-return-standalone-router
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-return-constructed-router
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-call-create-router
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-standalone-deployment:p2:inst-construct-with-standalone-virtual-history
  // @cpt-end:cpt-frontx-flow-routing-engine-provider-swap-engine:p1:inst-construct-router
}

interface EngineProviderTreeProps<TRouteTree extends AnyRoute> {
  /** Expected stable for the lifetime of one mount, exactly like `history`
   * below — `EngineProvider`'s own `useMemo` rebuilds the router whenever
   * this identity changes. The teardown effect below is keyed on
   * `history`, not on the memoized router, so replacing this prop's own
   * identity does destroy the previously adapted `history` (the effect's
   * cleanup runs against the old dependency value before the new setup
   * runs); what is *not* torn down is the previous router object itself —
   * `useMemo` simply drops it, and `RouterProvider` swaps to the new one —
   * so an identity change here without an actual engine swap still leaks
   * whatever internal state that discarded router held beyond its shared
   * `history` member. */
  readonly routeTree: TRouteTree;
  readonly history: RouterHistory;
}

/**
 * Keyed off the same condition as `createProviderRouter`'s own trailing
 * parameter (`EmptyRouterOptions extends ProviderRouterOptions<TRouteTree>`)
 * so the two stay in lockstep by construction rather than by two authors
 * remembering to agree: `routerOptions` below is required, not optional,
 * whenever `TRouteTree` declares a router context. A plain optional field
 * here would repeat that function's own pre-fix gap one level up — a
 * consumer building this props shape directly, not only one calling that
 * function, could otherwise omit `routerOptions` for a context-bearing tree
 * and have it type-check. The same caveat as that function's own trailing
 * parameter applies here too: a component still generic over its own
 * `T extends AnyRoute` that forwards an unresolved `T` into
 * `EngineProviderProps<T>` must pin the tree to a concrete type or pass
 * `routerOptions` regardless of whether `T` ends up context-bearing.
 */
export type EngineProviderProps<TRouteTree extends AnyRoute> = EngineProviderTreeProps<TRouteTree> &
  (EmptyRouterOptions extends ProviderRouterOptions<TRouteTree>
    ? {
        /** Forwarded verbatim to `createProviderRouter` above when this
         * component builds the router itself — the seam a consumer states
         * `context` (and every other engine construction option) through,
         * since this shape is the only one of the two that constructs
         * anything. Expected stable for the lifetime of one mount like the
         * two props above: the `useMemo` below reads it, so a fresh object
         * literal on every render rebuilds the router. The `{router}` shape
         * has no counterpart by construction — a router handed in has
         * already been built with whatever options its builder chose.
         * Optional here: `TRouteTree` declares no router context, so there
         * is nothing this field would be required to carry. */
        readonly routerOptions?: ProviderRouterOptions<TRouteTree>;
      }
    : {
        /** Forwarded verbatim to `createProviderRouter` above when this
         * component builds the router itself — the seam a consumer states
         * `context` (and every other engine construction option) through,
         * since this shape is the only one of the two that constructs
         * anything. Expected stable for the lifetime of one mount like the
         * two props above: the `useMemo` below reads it, so a fresh object
         * literal on every render rebuilds the router. The `{router}` shape
         * has no counterpart by construction — a router handed in has
         * already been built with whatever options its builder chose.
         * Required here: `TRouteTree` declares a router context, and this
         * field is the only place a `{routeTree, history}` mount can state
         * it. */
        readonly routerOptions: ProviderRouterOptions<TRouteTree>;
      });

/**
 * `createEngineProviderRouter` below returns only a constructed
 * router — a consumer mounting it directly through `RouterProvider`,
 * bypassing this component, has no lifecycle hook of its own from which to
 * attach that router's `history` or to call `router.history.destroy()`, so
 * it gets an inert history for the life of that mount and, once the mount
 * ends, the exact leak §3, Teardown On Unmount, describes — both on the one
 * export typed against the engine-provider port itself. This overload gives
 * that consumer the same mount boundary and the same symmetric attach/destroy effect below,
 * applied to the already-constructed router's own `history` member (the
 * same adapted `RouterHistory` object either overload ultimately mounts
 * and tears down) instead of a separately supplied `history` prop —
 * `router` is expected stable for the lifetime of one mount, exactly like
 * `history` above.
 *
 * The contract this overload commits to is unconditional: `EngineProvider`
 * owns the lifecycle of whatever `history` the router it is given carries,
 * whether or not that history was built by this package's own adaptation.
 * A `router` constructed elsewhere with a consumer-owned, non-adapted
 * history still has that history's own `destroy()` called on unmount
 * (`attachAdaptedHistory` is a no-op for an object it never registered, so
 * the mismatched half of the pair costs nothing) — a caller who wants to
 * keep managing that history's lifecycle itself must mount the router
 * through a raw `RouterProvider` instead of this overload.
 */
export interface EngineProviderFromRouterProps<TRouter extends AnyRouter> {
  readonly router: TRouter;
}

/**
 * Mounts a router built over an adapted virtual history into the
 * microfrontend's own component tree via `RouterProvider` (FEATURE §3,
 * Router Creation, step 3). Either builds that router itself from
 * `{routeTree, history}` (the same adapted `RouterHistory` a caller built
 * once via `adaptComposedHistory`/`adaptStandaloneHistory`,
 * `./engine-provider-history.js`) or mounts one already constructed
 * elsewhere — `createEngineProviderRouter`'s own output — via `{router}`.
 * Mounting a standalone-adapted history runs through this identical
 * component (FEATURE §3, Standalone Deployment, step 5).
 *
 * FEATURE §3, Teardown On Unmount, steps 1 and 2 (`inst-when-mount`,
 * `inst-when-unmount`): this component is the mount boundary the FEATURE
 * names, and its own effect below is both of those moments. Setup
 * establishes the adapted history's own internal `NavigationHistory`
 * registration (`attachAdaptedHistory`, a no-op when it is already active),
 * and cleanup releases it (`history.destroy()`, already documented
 * idempotent). The registration belongs to this pair and to nothing else —
 * an adapted history is not registered by the act of constructing it, so it
 * observes nothing until some mount boundary attaches it. That is what
 * makes constructing one safe: a history built for a mount that never
 * happens, or discarded before it does (React's StrictMode double-invoking
 * a `useMemo` that builds one is the everyday case), holds no registration
 * to leak. The two halves being exact inverses is what then keeps
 * StrictMode — which double-invokes an effect's setup/cleanup/setup on
 * every development mount — from leaving a still-mounted router's history
 * dead: the second setup re-does exactly what the cleanup undid, so a
 * StrictMode mount still ends with exactly one live subscription, and an
 * actual unmount still ends with zero.
 *
 * The consequence for a consumer that does not use this component: a raw
 * `<RouterProvider router={router} />` mount receives an inert history —
 * `location` stays at whatever the adaptation projected at construction and
 * no navigation from outside this occupant ever reaches it — until
 * something calls `attachAdaptedHistory` (`./history-adaptation.js`,
 * re-exported from this package's own entry point) on it. Such a consumer
 * owns both halves: that attach, and the matching `router.history.destroy()`.
 */
export function EngineProvider<TRouteTree extends AnyRoute>(props: EngineProviderProps<TRouteTree>): ReactElement;
export function EngineProvider<TRouter extends AnyRouter>(props: EngineProviderFromRouterProps<TRouter>): ReactElement;
export function EngineProvider(
  props: EngineProviderProps<AnyRoute> | EngineProviderFromRouterProps<AnyRouter>,
): ReactElement {
  // Normalized to plain, individually stable locals — rather than reading
  // `props.*` inside the `useMemo` callback below — so `react-hooks`'s own
  // exhaustive-deps check can see every dependency the memo actually reads
  // as a simple identifier; reading a discriminated union's members inline
  // inside the callback is a pattern that rule cannot statically follow.
  const fromRouter = 'router' in props;
  const providedRouter = fromRouter ? props.router : undefined;
  const routeTree = fromRouter ? undefined : props.routeTree;
  const providedHistory = fromRouter ? undefined : props.history;
  const routerOptions = fromRouter ? undefined : props.routerOptions;

  // The two overloads above reject a call site missing both prop shapes at
  // compile time; this runtime check only matters for a caller that
  // bypasses them — a plain JavaScript consumer, or an `as`-cast past the
  // union — where `props` can otherwise reach `createProviderRouter` (or a
  // `.history` property read below) as `undefined`, surfacing as an opaque
  // TanStack internal error (reading a property off `undefined`) with no
  // indication that the missing prop, not this package, is the cause. This
  // guard must run before anything derives `history` from `props.router` —
  // deriving it first (`props.router.history`) reintroduces the exact
  // opaque error this guard exists to replace, for the `{router: undefined}`
  // call shape.
  if (fromRouter ? providedRouter === undefined : routeTree === undefined || providedHistory === undefined) {
    throw new Error(
      'EngineProvider requires either a {routeTree, history} pair or a {router} — received neither. ' +
        'This is only reachable when a caller bypasses this function\'s own TypeScript overloads.',
    );
  }

  // `providedHistory` is cast the same way `createProviderRouter`'s own call
  // below already is (see its comment): the guard above proves it is
  // defined whenever `providedRouter` is not, but that proof spans two
  // independently-computed locals TypeScript's control-flow analysis cannot
  // relate to each other.
  const history = providedRouter !== undefined ? providedRouter.history : (providedHistory as RouterHistory);

  const router = useMemo(() => {
    if (providedRouter !== undefined) {
      return providedRouter;
    }
    // `fromRouter` false is exactly the case `routeTree`/`providedHistory`
    // are both set (the two branches above are exhaustive over the same
    // union, so this pairing always holds); TypeScript has no way to see
    // that invariant across the two independently-computed locals, so it
    // is bridged here rather than left as an unreachable `undefined` case
    // `createProviderRouter` would reject at its own call boundary.
    return createProviderRouter(routeTree as AnyRoute, providedHistory as RouterHistory, routerOptions);
  }, [providedRouter, routeTree, providedHistory, routerOptions]);

  // @cpt-algo:cpt-frontx-algo-routing-engine-provider-teardown:p2
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-teardown:p2:inst-when-mount
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-teardown:p2:inst-when-unmount
  useEffect(() => {
    attachAdaptedHistory(history);
    return () => history.destroy();
  }, [history]);
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-teardown:p2:inst-when-unmount
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-teardown:p2:inst-when-mount

  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-mount-router-provider
  // @cpt-begin:cpt-frontx-algo-routing-engine-provider-standalone-deployment:p2:inst-mount-standalone-router
  return <RouterProvider router={router} />;
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-standalone-deployment:p2:inst-mount-standalone-router
  // @cpt-end:cpt-frontx-algo-routing-engine-provider-router-creation:p2:inst-mount-router-provider
}

/**
 * This package's own conforming instance of the navigation substrate's
 * `EngineProviderPort` (`@gears-frontx/routing`, FEATURE
 * (navigation-substrate) §1.5, "Engine-provider port shape"): a function
 * from `EngineProviderInput` (`history`, `entryAddress`, `routeTree`) to a
 * constructed router, typed against the port so a mismatch between this
 * package's own construction path and the port's normative contract is a
 * compile-time diagnostic, not a hoped-for convention (DESIGN §3.3
 * table row "`createRouter({ routeTree, history })`" reframed against the
 * port's own input shape). Composes `adaptProviderHistory`'s own mode
 * dispatch (`./engine-provider-history.js`) with `createProviderRouter`
 * above — the identical two-step construction path
 * `cpt-frontx-flow-routing-engine-provider-swap-engine`'s own worked
 * instance already names, exposed here as one callable a consumer can pass
 * anywhere the port itself is expected.
 *
 * Construction options: the port's own input is exactly
 * `{history, entryAddress, routeTree}` and this function keeps that
 * signature, so it passes `createProviderRouter` no options at all — the
 * router it returns carries no `context`. That silence is the point: the
 * port is declared by the core package, and admitting an engine-shaped
 * options field into it would put the engine's own construction surface
 * there. A consumer that needs `context` reaches the seam on this package's
 * own exports instead — `createProviderRouter`'s third argument, or
 * `EngineProvider`'s `routerOptions` prop.
 *
 * Teardown: the port's own signature likewise returns a router, not a
 * `{router, destroy}` pair — widening it would break the port typing this
 * function exists to satisfy. The returned router's own `history` member
 * (TanStack's `Router#history` field) is the same adapted `RouterHistory`
 * object `EngineProvider` attaches and tears down elsewhere in this file,
 * and it is unattached when this function returns; mount the result through
 * `<EngineProvider router={router} />` (the `EngineProviderFromRouterProps`
 * overload above), rather than a raw `<RouterProvider router={router} />`,
 * to get that attach on mount and the symmetric teardown on unmount. A
 * consumer that mounts the raw `RouterProvider` instead owns both:
 * `attachAdaptedHistory(router.history)` and `router.history.destroy()`.
 */
export const createEngineProviderRouter: EngineProviderPort<AnyRoute, ReturnType<typeof createProviderRouter>> = ({
  history,
  entryAddress,
  routeTree,
}) => createProviderRouter(routeTree, adaptProviderHistory(history, entryAddress));
