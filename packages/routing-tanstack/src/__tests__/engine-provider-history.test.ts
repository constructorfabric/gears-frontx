import { describe, expect, it } from 'vitest';
import { createRootRoute, createRoute } from '@tanstack/react-router';
import { resolveNavigationHistory, type DomainKey, type EntryAddress, type ExtensionToken } from '@gears-frontx/routing';
import { adaptProviderHistory } from '../engine-provider-history.js';
import { attachAdaptedHistory } from '../history-adaptation.js';
import { createProviderRouter } from '../router-creation.js';
import { resetRealm } from './helpers/index.js';

const DASHBOARD_ENTRY_ADDRESS: EntryAddress = { domainKey: 'screen' as DomainKey, extension: 'dashboard' as ExtensionToken };
const COMPOSED_URL = '/en?screen=dashboard;route=settings/general;orientation=left';

describe('history adaptation given an entry address', () => {
  it('projects from the occupant own entry when an entry address is supplied', () => {
    resetRealm(COMPOSED_URL);
    const history = adaptProviderHistory(resolveNavigationHistory(), DASHBOARD_ENTRY_ADDRESS);
    expect(history.location.pathname).toBe('/settings/general');
    expect(history.location.search).toBe('?orientation=left');
  });
});

function buildRouteTreeWithNotFound() {
  const rootRoute = createRootRoute({ component: () => 'root', notFoundComponent: () => 'not found' });
  const knownRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings/general', component: () => 'known' });
  return rootRoute.addChildren([knownRoute]);
}

function buildRouteTreeWithTwoRoutes() {
  const rootRoute = createRootRoute({ component: () => 'root' });
  const generalRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings/general', component: () => 'general' });
  const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings/profile', component: () => 'profile' });
  return rootRoute.addChildren([generalRoute, profileRoute]);
}

// Exercises `router.navigate()` end to end — the real path a mounted
// router's own imperative navigation takes (`commitLocation` ->
// `history.push(href, state, { ignoreBlocker })`), not only this adapter's
// own `history.push` called directly. A defect only reachable through the
// engine's own `navigate` call (a missing `ignoreBlocker` forward, a state
// argument `commitLocation` supplies that this adapter mishandles) is
// invisible to every other test in this package, which drives `history`
// itself.
describe('router.navigate() writes back through the adapter', () => {
  it('composed mode: navigate() reaches the occupant own entry', async () => {
    const adapter = resetRealm(COMPOSED_URL);
    const history = adaptProviderHistory(resolveNavigationHistory(), DASHBOARD_ENTRY_ADDRESS);
    // This test drives a router without mounting it through
    // `EngineProvider`, so it takes on the attach that component's own
    // effect would otherwise perform.
    attachAdaptedHistory(history);
    const router = createProviderRouter(buildRouteTreeWithTwoRoutes(), history);
    await router.load();

    await router.navigate({ to: '/settings/profile' });

    // `navigate({ to })` with no `search` option does not carry the
    // previous search forward — TanStack's own behavior, not this
    // adapter's — so the write reaches only the occupant's own entry, with
    // its `route` parameter updated and `orientation` dropped.
    expect(adapter.lastWrite).toBe('/en?screen=dashboard;route=settings/profile');
    expect(router.state.location.pathname).toBe('/settings/profile');
  });

  // TanStack's own search serializer writes a space as `+`
  // (`URLSearchParams`), so the value has to survive this adapter's own
  // parse, the write, and a fresh projection of the written URL.
  it('a search value with a space and a plus reads back unchanged, also after a reload', async () => {
    const adapter = resetRealm(COMPOSED_URL);
    const history = adaptProviderHistory(resolveNavigationHistory(), DASHBOARD_ENTRY_ADDRESS);
    attachAdaptedHistory(history);
    const router = createProviderRouter(buildRouteTreeWithTwoRoutes(), history);
    await router.load();

    await router.navigate({ to: '/settings/profile', search: { q: 'a b+c' } as never });

    expect(router.state.location.search).toEqual({ q: 'a b+c' });

    resetRealm(adapter.lastWrite ?? '');
    const reloaded = createProviderRouter(
      buildRouteTreeWithTwoRoutes(),
      adaptProviderHistory(resolveNavigationHistory(), DASHBOARD_ENTRY_ADDRESS),
    );
    await reloaded.load();

    expect(reloaded.state.location.search).toEqual({ q: 'a b+c' });
  });
});

describe('an undeclared route= path resolves to the engine own notFound', () => {
  it('composed mode resolves an undeclared path to this router own notFound match', async () => {
    resetRealm('/en?screen=dashboard;route=settings/unknown');
    const history = adaptProviderHistory(resolveNavigationHistory(), DASHBOARD_ENTRY_ADDRESS);
    const router = createProviderRouter(buildRouteTreeWithNotFound(), history);

    await router.load();

    expect(router.state.matches.some((match) => match._notFound === true)).toBe(true);
  });
});
