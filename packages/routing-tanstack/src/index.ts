// @gears-frontx/routing-tanstack — package entry point.
//
// This package is the default implementation of the engine-provider port the
// navigation substrate declares (`cpt-frontx-routing-fr-engine-provider-port`,
// owned by the routing package's own DESIGN). The Engine Provider component
// itself is specified by this package's own `engine-provider` FEATURE
// (packages/routing-tanstack/architecture/features/engine-provider/FEATURE.md).
//
// This entry point re-exports the full engine-provider surface: history
// adaptation and router creation (§3, "History Adaptation To The
// RouterHistory Contract" and "Router Creation And Mount Over A Virtual
// History"), the composed and standalone virtual-location sources, the
// mode-selecting dispatch between them, the location-preserving navigation
// helper, and teardown (`RouterHistory#destroy`, already part of the
// history-adaptation surface below — no separate export, since the
// teardown algorithm's own output is that same member), plus the port's
// own type contract.
export type { EngineProviderInput, EngineProviderPort, EntryAddress } from '@gears-frontx/routing';

export { projectParamsToVirtualLocation, projectVirtualLocationToParams, ROUTE_PARAM_NAME } from './virtual-location.js';
export type { VirtualLocationParts } from './virtual-location.js';

export type { AdaptHistoryOptions, VirtualLocationSource } from './history-adaptation.js';
// `attachAdaptedHistory` is published because an adapted history observes
// nothing until a mount boundary establishes its registration: a consumer
// that mounts a raw `RouterProvider` rather than `EngineProvider` needs it,
// and its counterpart `destroy()` is already a member of the returned
// `RouterHistory` (FEATURE §3, Teardown On Unmount, step 1).
export { adaptVirtualLocationHistory, attachAdaptedHistory } from './history-adaptation.js';

export { createComposedVirtualLocationSource, adaptComposedHistory } from './composed-history-source.js';
export { createStandaloneVirtualLocationSource, adaptStandaloneHistory } from './standalone-history-source.js';
export { adaptProviderHistory } from './engine-provider-history.js';
export { locationPreservingRedirect } from './location-preserving-redirect.js';

export { createProviderRouter, createEngineProviderRouter, EngineProvider } from './router-creation.js';
export type { EngineProviderProps, EngineProviderFromRouterProps, ProviderRouterOptions } from './router-creation.js';

// DESIGN §3.3, "API Contracts" — the concrete engine's own router and
// route-tree construction, mounting, hooks, components, and route-resolution
// helpers this package's public surface lists alongside its
// own adapter, so a microfrontend using this package's default provider
// never needs its own direct `@tanstack/react-router` import for these
// (`cpt-frontx-constraint-routing-tanstack-sole-engine-import`): a
// direct import would move the sole permitted ecosystem edge into the
// consumer, which the ecosystem-wide `no-restricted-imports` guard exists
// to prevent.
export {
  createRouter,
  createRootRoute,
  createRoute,
  createRootRouteWithContext,
  RouterProvider,
  useNavigate,
  useParams,
  useSearch,
  useRouterState,
  Link,
  Outlet,
  redirect,
  notFound,
} from '@tanstack/react-router';

// The engine's own type names that appear in this package's own exported
// signatures, forwarded for the same reason as the values above: the
// ecosystem guard forbidding a direct `@tanstack/*` import bites
// `import type` exactly as it bites a value import, so without these a
// consumer inside this ecosystem can call `adaptComposedHistory` but cannot
// name what it returns, and can pass a route tree to `EngineProviderProps`
// but cannot name the constraint it satisfies. `RouterHistory` is the return
// type of every history-adaptation entry point and the parameter type of
// `attachAdaptedHistory` and `locationPreservingRedirect`; `AnyRoute` and
// `AnyRouter` are the constraints on `ProviderRouterOptions`,
// `EngineProviderProps`, and `EngineProviderFromRouterProps`.
export type { AnyRoute, AnyRouter, RouterHistory } from '@tanstack/react-router';
