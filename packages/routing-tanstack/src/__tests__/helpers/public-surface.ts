import * as tanstackIndex from '../../index.js';

// The `@tanstack/react-router` names `src/index.ts` forwards verbatim at its
// own bottom (DESIGN §3.3, "API Contracts" — the engine's own route-tree
// builders, scoped route hooks and search codec builders) — a third-party surface this package's
// own build cannot regress, so it is excluded from the derived runtime list
// below rather than pinned alongside this package's own exports.
const REACT_ROUTER_PASSTHROUGH = [
  'createRootRoute',
  'createRootRouteWithContext',
  'createRoute',
  'useNavigate',
  'useParams',
  'useSearch',
  'useRouterState',
  'Link',
  'Outlet',
  'redirect',
  'notFound',
  'parseSearchWith',
  'stringifySearchWith',
] as const;

// The engine-provider FEATURE's own authored public surface — the runtime
// values `src/index.ts` exports itself, excluding the pass-through re-exports
// above. Derived from `../../index.js`'s own actual runtime exports
// (`Object.keys`) rather than maintained by hand, so a real export can never
// silently stop being covered.
export const TANSTACK_RUNTIME_SURFACE = Object.keys(tanstackIndex).filter(
  (name) => !(REACT_ROUTER_PASSTHROUGH as readonly string[]).includes(name),
);

// Type-only exports cannot be derived the same way — `export type { ... }`
// erases entirely at compile time, so there is no runtime object to call
// `Object.keys` on. Cross-checked by hand against every type-only
// `export type { ... }` statement in `src/index.ts`: the props of
// `ExtensionRouter` and the shape `navigation()` returns.
export const TANSTACK_TYPE_ONLY_SURFACE = ['ExtensionRouterProps', 'Navigation'] as const;
