// @gears-frontx/routing-tanstack — package entry point.
//
// This package is the default implementation of the engine-provider port the
// navigation substrate declares (`cpt-frontx-routing-fr-engine-provider-port`,
// owned by the routing package's own DESIGN). The Engine Provider component
// itself is specified by this package's own `engine-provider` FEATURE
// (packages/routing-tanstack/architecture/features/engine-provider/FEATURE.md).
//
// This entry point re-exports the engine-provider surface the framework
// router actually needs: `adaptProviderHistory` (history adaptation, mode
// dispatch between the composed and standalone cases, and teardown via the
// returned `RouterHistory#destroy` — no separate export, since the teardown
// algorithm's own output is that same member), `createProviderRouter` and
// `EngineProvider` (router creation and mount), the location-preserving
// navigation helper, and the port's own type contract. Every internal
// building block `adaptProviderHistory` folds behind — the virtual-location
// projection helpers, `VirtualLocationSource`/`adaptVirtualLocationHistory`,
// `attachAdaptedHistory`, the composed and standalone sources and
// adapters — is reached only through this package's own internal modules,
// never through this entry point (AC2.1, resolved decisions: these stay
// internal, folded behind `adaptProviderHistory`).
export type { EngineProviderInput, EngineProviderPort, EntryAddress } from '@gears-frontx/routing';

export type { AdaptHistoryOptions } from './history-adaptation.js';

export { adaptProviderHistory } from './engine-provider-history.js';
export { locationPreservingRedirect } from './location-preserving-redirect.js';

export { createProviderRouter, EngineProvider } from './router-creation.js';
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
  createRootRouteWithContext,
  createRoute,
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
// consumer inside this ecosystem can call `adaptProviderHistory` but cannot
// name what it returns, and can pass a route tree to `EngineProviderProps`
// but cannot name the constraint it satisfies. `RouterHistory` is the return
// type of `adaptProviderHistory` and the parameter type of
// `locationPreservingRedirect`; `AnyRoute` and `AnyRouter` are the
// constraints on `ProviderRouterOptions`, `EngineProviderProps`, and
// `EngineProviderFromRouterProps`.
export type { AnyRoute, AnyRouter, RouterHistory } from '@tanstack/react-router';
