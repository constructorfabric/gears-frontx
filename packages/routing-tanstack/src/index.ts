// @gears-frontx/routing-tanstack — package entry point.
//
// This package is the default implementation of the engine-provider port the
// navigation substrate declares (`cpt-frontx-routing-fr-engine-provider-port`,
// owned by the routing package's own DESIGN). Its public surface is DESIGN
// §3.3 (`cpt-frontx-routing-tanstack-interface-package-entry`) and the
// `engine-provider` FEATURE's DoD `cpt-frontx-dod-routing-engine-provider-extension-router`
// (packages/routing-tanstack/architecture/features/engine-provider/FEATURE.md):
// `ExtensionRouter`, `navigation`, the engine's route-tree builders and
// scoped route hooks, and its search parser and serializer builders. History
// adaptation, router construction, the provider component, the
// engine-provider port types and the entry-address type stay internal: while
// public, they would let code build a history or a router over another
// extension's part of the URL.
// @cpt-dod:cpt-frontx-dod-routing-engine-provider-extension-router:p1
export { ExtensionRouter } from './extension-router.js';
export type { ExtensionRouterProps } from './extension-router.js';
export { navigation } from './navigation.js';
export type { Navigation } from './navigation.js';

// The concrete engine's own route-tree construction, hooks, components and
// route-resolution helpers, re-exported unchanged so a microfrontend using
// this package never needs its own direct `@tanstack/react-router` import
// for them (`cpt-frontx-constraint-routing-tanstack-sole-engine-import`): a
// direct import would move the sole permitted ecosystem edge into the
// consumer, which the ecosystem-wide `no-restricted-imports` guard exists to
// prevent. The engine's `createRouter` is not among them: it is used inside
// this package only (DESIGN, engine dependency `@tanstack/react-router`).
// `parseSearchWith` and `stringifySearchWith` build the `parseSearch` and
// `stringifySearch` functions `ExtensionRouter` takes.
export {
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  useNavigate,
  useParams,
  useSearch,
  useRouterState,
  Link,
  Outlet,
  redirect,
  notFound,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router';
