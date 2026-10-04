import { describe, expect, it } from 'vitest';
import * as routingTanstack from '../index.js';

// This package's entry point carries only what the framework router needs:
// history adaptation and router creation folded behind `adaptProviderHistory`
// (`../engine-provider-history.ts`, `../composed-history-source.ts`,
// `../standalone-history-source.ts`, `../history-adaptation.ts`,
// `../virtual-location.ts` — all internal), `createProviderRouter` /
// `EngineProvider` (`../router-creation.tsx`), the location-preserving
// redirect helper (`../location-preserving-redirect.ts`), and — per DESIGN
// §3.3's public-surface table — the concrete engine's own router and
// route-tree construction, mounting, hooks, components, and
// route-resolution helpers, re-exported so a microfrontend never
// has to import `@tanstack/react-router` itself
// (`cpt-frontx-constraint-routing-tanstack-sole-engine-import`). Teardown
// has no separate export — it is `RouterHistory#destroy`, already reachable
// through every function below that returns a `RouterHistory`.
describe('@gears-frontx/routing-tanstack entry point', () => {
  it('loads without throwing', () => {
    expect(routingTanstack).toBeDefined();
  });

  it('exposes only the framework-router-facing engine-provider surface', () => {
    expect(Object.keys(routingTanstack).sort()).toEqual(
      [
        'adaptProviderHistory',
        'locationPreservingRedirect',
        'createProviderRouter',
        'EngineProvider',
        // DESIGN §3.3 public surface — the concrete engine's own re-exports.
        'createRouter',
        'createRootRoute',
        'createRootRouteWithContext',
        'createRoute',
        'RouterProvider',
        'useNavigate',
        'useParams',
        'useSearch',
        'useRouterState',
        'Link',
        'Outlet',
        'redirect',
        'notFound',
      ].sort(),
    );
  });
});
