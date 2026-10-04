import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, isValidElement, StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useNavigate,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import {
  resolveNavigationHistory,
  type DomainKey,
  type EntryAddress,
  type ExtensionToken,
} from '@gears-frontx/routing';
import { adaptComposedHistory } from '../composed-history-source.js';
import { adaptStandaloneHistory } from '../standalone-history-source.js';
import { attachAdaptedHistory } from '../history-adaptation.js';
import { adaptProviderHistory } from '../engine-provider-history.js';
import { createProviderRouter, EngineProvider, type ProviderRouterOptions } from '../router-creation.js';
import { resetRealm } from './helpers/index.js';

const ENTRY_ADDRESS: EntryAddress = { domainKey: 'screen' as DomainKey, extension: 'dashboard' as ExtensionToken };

// Every test below that actually mounts `EngineProvider` needs both of
// these: React's own `act()` warns when this flag is unset, and jsdom does
// not implement `scrollTo` — TanStack Router's own scroll restoration calls
// it after a successful load. Set once here, for the whole file, rather
// than repeated per test — `createProviderRouter`'s own tests above never
// mount anything, so setting these globally costs them nothing.
beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => {};
});

function buildRouteTree() {
  return createRootRoute({ component: () => 'root' });
}

/** Counts every registration `navigationHistory.subscribe` makes and every
 * one of those releases — the same counting wrapper the unmount test
 * below already uses, factored out so the StrictMode and port-entry
 * teardown tests can share it. */
function countSubscriptions(navigationHistory: ReturnType<typeof resolveNavigationHistory>): { active: () => number } {
  let activeSubscriptions = 0;
  const originalSubscribe = navigationHistory.subscribe.bind(navigationHistory);
  navigationHistory.subscribe = (subscriber) => {
    activeSubscriptions += 1;
    const release = originalSubscribe(subscriber);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      activeSubscriptions -= 1;
      release();
    };
  };
  return { active: () => activeSubscriptions };
}

describe('createProviderRouter', () => {
  it('builds a router bound to the given routeTree and adapted virtual history', () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    const routeTree = buildRouteTree();

    const router = createProviderRouter(routeTree, history);

    expect(router.history).toBe(history);
    expect(router.routeTree).toBe(routeTree);
  });

  it('matches only its own virtual location, projected from the occupant entry', () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    const router = createProviderRouter(buildRouteTree(), history);

    expect(router.state.location.pathname).toBe('/settings/general');
  });
});

// The engine-provider port's own input is exactly
// `{history, entryAddress, routeTree}`, and it stays that way — so the
// construction options the engine also accepts, `context` above all, are
// offered on this package's own exports instead. `context` is the
// motivating one: an application's route loaders reach a consumer-owned
// dependency, an API client being the usual case, through it.
describe('construction options seam', () => {
  it('forwards context to the constructed router, with routeTree and history still this package own', () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    const routeTree = buildRouteTree();
    const apiClient = { get: () => 'payload' };

    const router = createProviderRouter(routeTree, history, { context: { apiClient } });

    expect(router.options.context).toEqual({ apiClient });
    expect(router.history).toBe(history);
    expect(router.routeTree).toBe(routeTree);
  });

  // The two fields this package supplies are written after the caller's own
  // options, so neither can be displaced. Reachable only past the types —
  // `ProviderRouterOptions` omits both — which is exactly the caller this
  // guards against: a plain JavaScript consumer, or an options object built
  // by spreading something wider.
  it('cannot have routeTree or history displaced by a caller supplied option', () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    const routeTree = buildRouteTree();
    const foreignHistory = createMemoryHistory({ initialEntries: ['/elsewhere'] });
    const displacing = { history: foreignHistory, routeTree: buildRouteTree() } as unknown as ProviderRouterOptions<
      ReturnType<typeof buildRouteTree>
    >;

    const router = createProviderRouter(routeTree, history, displacing);

    expect(router.history).toBe(history);
    expect(router.routeTree).toBe(routeTree);
  });

  // What a consumer supplies has to arrive where route loading actually
  // reads it, not merely on the router object — so this asserts the context
  // a route's own `beforeLoad` was handed, the same place a loader reaching
  // an API client would read it from.
  it('reaches a route own load-time context through EngineProvider own routerOptions prop', async () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    const seen: unknown[] = [];
    const routeTree = createRootRoute({
      beforeLoad: ({ context }) => {
        seen.push(context);
      },
      component: () => 'root',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <EngineProvider routeTree={routeTree} history={history} routerOptions={{ context: { label: 'from the consumer' } }} />,
      );
    });

    expect(container.textContent).toBe('root');
    expect(seen[0]).toMatchObject({ label: 'from the consumer' });

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe('EngineProvider', () => {
  it('mounts the constructed router into the component tree via RouterProvider', async () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    const routeTree = buildRouteTree();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EngineProvider routeTree={routeTree} history={history} />);
    });

    expect(container.textContent).toBe('root');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('releases the internal NavigationHistory subscription exactly once on unmount', async () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const navigationHistory = resolveNavigationHistory();

    let activeSubscriptions = 0;
    const originalSubscribe = navigationHistory.subscribe.bind(navigationHistory);
    navigationHistory.subscribe = (subscriber) => {
      activeSubscriptions += 1;
      const release = originalSubscribe(subscriber);
      let released = false;
      return () => {
        // `release` is itself idempotent (`NavigationHistory`'s own
        // `ReleaseFunction` contract); this counting wrapper mirrors that,
        // so a second `destroy()` call — a case this same test exercises
        // below — does not double-decrement.
        if (released) {
          return;
        }
        released = true;
        activeSubscriptions -= 1;
        release();
      };
    };

    // Constructing the adapted history registers nothing — the mount
    // effect below is what establishes the registration this test counts.
    const history = adaptComposedHistory(navigationHistory, ENTRY_ADDRESS);
    expect(activeSubscriptions).toBe(0);

    const routeTree = buildRouteTree();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EngineProvider routeTree={routeTree} history={history} />);
    });
    expect(activeSubscriptions).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();

    expect(activeSubscriptions).toBe(0);

    // A second teardown (the adapter's own `destroy` idempotence) must stay
    // safe even after the component's own unmount already called it once.
    expect(() => history.destroy()).not.toThrow();
    expect(activeSubscriptions).toBe(0);
  });

  // React (18+) dev StrictMode
  // double-invokes an effect's setup/cleanup/setup on every mount. A
  // teardown effect that only ever tears down (`() => history.destroy()`
  // in cleanup, nothing in setup) leaves the mounted
  // router's own history with zero active substrate subscriptions after that
  // sequence — navigation from outside this occupant (a sibling, back/forward, a deep
  // link) would stop reaching it for the rest of that mount, silently, in
  // every StrictMode-wrapped dev environment (Vite/CRA/Next default).
  // `attachAdaptedHistory` (`../history-adaptation.js`) re-establishes the
  // same registration `destroy()` released, making the two effect halves
  // true inverses regardless of how many times React runs them.
  it('ends a StrictMode mount with exactly one live subscription, and unmount with zero — composed mode', async () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const navigationHistory = resolveNavigationHistory();
    const subscriptions = countSubscriptions(navigationHistory);

    const history = adaptComposedHistory(navigationHistory, ENTRY_ADDRESS);
    expect(subscriptions.active()).toBe(0);

    const routeTree = buildRouteTree();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <EngineProvider routeTree={routeTree} history={history} />
        </StrictMode>,
      );
    });
    expect(subscriptions.active()).toBe(1);
    expect(container.textContent).toBe('root');

    await act(async () => {
      root.unmount();
    });
    container.remove();

    expect(subscriptions.active()).toBe(0);
  });

  it('ends a StrictMode mount with exactly one live subscription, and unmount with zero — standalone mode', async () => {
    resetRealm('/');
    const navigationHistory = resolveNavigationHistory();
    const subscriptions = countSubscriptions(navigationHistory);

    const history = adaptStandaloneHistory(navigationHistory);
    expect(subscriptions.active()).toBe(0);

    const routeTree = buildRouteTree();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <EngineProvider routeTree={routeTree} history={history} />
        </StrictMode>,
      );
    });
    expect(subscriptions.active()).toBe(1);
    expect(container.textContent).toBe('root');

    await act(async () => {
      root.unmount();
    });
    container.remove();

    expect(subscriptions.active()).toBe(0);
  });

  // The history built inside the component that mounts it — a `useMemo` in
  // a wrapper — is the everyday shape, and StrictMode invokes that memo
  // twice on a development mount, so two adapted histories exist and only
  // the second is ever mounted. What this asserts is the count of live
  // registrations against the shared history, not the number of
  // notifications delivered: a delivery count cannot see the first history
  // at all, since nothing renders from it. Were the registration made by
  // the act of constructing, the discarded history would stay subscribed to
  // a realm-lived shared history with no reference left to release it
  // through, for the life of the page.
  it('leaves nothing registered for a history StrictMode constructed and discarded', async () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const navigationHistory = resolveNavigationHistory();
    const subscriptions = countSubscriptions(navigationHistory);
    const routeTree = buildRouteTree();

    function Microfrontend() {
      const history = useMemo(() => adaptComposedHistory(navigationHistory, ENTRY_ADDRESS), []);
      return <EngineProvider routeTree={routeTree} history={history} />;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <Microfrontend />
        </StrictMode>,
      );
    });
    expect(container.textContent).toBe('root');
    expect(subscriptions.active()).toBe(1);

    await act(async () => {
      root.unmount();
    });
    container.remove();

    expect(subscriptions.active()).toBe(0);
  });
});

// `adaptProviderHistory` + `createProviderRouter` — the two-step
// composition any conforming engine-provider port instance performs — builds
// and internally owns an adapted history that no plain
// `<RouterProvider router={router}/>` mount can ever tear down, reopening
// the same subscription leak on a router built this way. `EngineProvider`'s
// `{router}` overload (design: whoever the effect belongs to owns teardown)
// gives it the same lifecycle hook the `{routeTree, history}` overload
// already has.
describe('a router built from adaptProviderHistory + createProviderRouter', () => {
  it('reaches zero active subscriptions after unmount when mounted through EngineProvider({router})', async () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const navigationHistory = resolveNavigationHistory();
    const subscriptions = countSubscriptions(navigationHistory);
    const routeTree = buildRouteTree();

    const router = createProviderRouter(routeTree, adaptProviderHistory(navigationHistory, ENTRY_ADDRESS));
    expect(subscriptions.active()).toBe(0);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EngineProvider router={router} />);
    });
    expect(subscriptions.active()).toBe(1);
    expect(container.textContent).toBe('root');

    await act(async () => {
      root.unmount();
    });
    container.remove();

    expect(subscriptions.active()).toBe(0);
  });
});

// The engine-provider port's own normative contract (routing DESIGN §3.3,
// `EngineProviderPort` in `packages/routing/src/types/index.ts`): a
// conforming provider constructs a router and stops there — mounting it
// into the microfrontend's own component tree is a separate act the
// consumer performs, deliberately excluded from this port. That correction
// was carried as prose across seven files with nothing executable behind
// it, so nothing stopped a later edit from drifting back to describing this
// composition as mounting. Pinned here as the one property the contract
// actually states — not, e.g., which fields the returned router carries,
// which a legitimate refactor is free to change.
describe('adaptProviderHistory + createProviderRouter return contract', () => {
  it('returns a constructed router, not a mounted React element', () => {
    resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const navigationHistory = resolveNavigationHistory();
    const routeTree = buildRouteTree();

    const router = createProviderRouter(routeTree, adaptProviderHistory(navigationHistory, ENTRY_ADDRESS));

    expect(typeof router).toBe('object');
    expect(isValidElement(router)).toBe(false);
  });
});

// `EngineProvider`'s `{router}` overload commits to an
// unconditional contract — it owns the lifecycle of whatever `history` the
// given router carries, adapted by this package or not — documented at this
// overload's own doc comment above `EngineProviderFromRouterProps`.
describe('EngineProvider({router}) destroys a consumer-owned, non-adapted history too', () => {
  it('calls destroy() on unmount even for a router built outside this package, over a plain memory history', async () => {
    const consumerHistory = createMemoryHistory({ initialEntries: ['/'] });
    let destroyed = false;
    const originalDestroy = consumerHistory.destroy.bind(consumerHistory);
    consumerHistory.destroy = () => {
      destroyed = true;
      originalDestroy();
    };
    const router = createRouter({ routeTree: buildRouteTree(), history: consumerHistory });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<EngineProvider router={router} />);
    });
    expect(destroyed).toBe(false);

    await act(async () => {
      root.unmount();
    });
    container.remove();

    expect(destroyed).toBe(true);
  });
});

// Neither prop shape given is rejected at compile time by
// `EngineProvider`'s own overloads; this exercises the runtime guard that
// exists for a caller who bypasses them (a plain JavaScript consumer, or an
// `as`-cast past the union), so that case fails with a clear message
// instead of an opaque TanStack internal error.
describe('EngineProvider guards against neither prop shape being given', () => {
  it('throws a clear error instead of letting TanStack fail on a missing router/history', () => {
    const bypassed = EngineProvider as unknown as (props: Record<string, never>) => unknown;
    expect(() => bypassed({})).toThrow(/EngineProvider requires/);
  });

  // The `{router}` shape's own bad case — `router`
  // present but `undefined` — is a second, independent way to bypass the
  // TypeScript overloads (e.g. a consumer forwarding a possibly-undefined
  // router prop of its own). Before the fix, this shape reached
  // `props.router.history` before the guard ran, throwing TanStack's own
  // opaque "Cannot read properties of undefined (reading 'history')"
  // instead of this function's own message.
  it('throws the same clear error, not an opaque property-access error, for {router: undefined}', () => {
    const bypassed = EngineProvider as unknown as (props: { router: undefined }) => unknown;
    expect(() => bypassed({ router: undefined })).toThrow(/EngineProvider requires/);
  });

  it('mounted through a real render, {router: undefined} still throws the guard\'s own message', async () => {
    const Bypassed = EngineProvider as unknown as (props: { router: undefined }) => ReturnType<typeof EngineProvider>;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    // React reports a render-thrown error to `console.error` in addition to
    // rethrowing it into `act`'s own rejection — silenced here so this
    // expected failure does not print as if it were a real test crash.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        act(async () => {
          root.render(<Bypassed router={undefined} />);
        }),
      ).rejects.toThrow(/EngineProvider requires/);
    } finally {
      consoleError.mockRestore();
      container.remove();
    }
  });
});

// `useBlocker` (a consumer's own blocking route guard) needs its own
// end-to-end coverage through this adapted history — the guarantee that
// `block` stops only a navigation issued through this same constructed
// router's own `RouterHistory` is otherwise only exercised indirectly.
describe('useBlocker end to end through the adapted history', () => {
  function buildBlockableRouteTree(blockerCalls: unknown[], shouldBlock: () => boolean) {
    // Named (capitalized) rather than an inline arrow assigned to
    // `component:` — `react-hooks/rules-of-hooks` requires a function
    // calling a Hook to read as a component (capitalized) or a custom Hook
    // (`use`-prefixed) by its own name, which an anonymous arrow is not.
    function GeneralRoute(): string {
      useBlocker({
        shouldBlockFn: (args) => {
          blockerCalls.push(args);
          return shouldBlock();
        },
        enableBeforeUnload: false,
      });
      const navigate = useNavigate();
      (globalThis as Record<string, unknown>).__engineProviderProbeNavigate = navigate;
      return 'general';
    }
    const root = createRootRoute({ component: () => <Outlet /> });
    const general = createRoute({ getParentRoute: () => root, path: '/settings/general', component: GeneralRoute });
    const profile = createRoute({ getParentRoute: () => root, path: '/settings/profile', component: () => 'profile' });
    return root.addChildren([general, profile]);
  }

  async function settle(): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  it('blocks a navigate() when shouldBlockFn returns true: no write, view unchanged', async () => {
    const adapter = resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    const calls: unknown[] = [];
    const router = createProviderRouter(buildBlockableRouteTree(calls, () => true), history);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<RouterProvider router={router} />);
    });
    expect(container.textContent).toBe('general');

    await act(async () => {
      (globalThis as unknown as { __engineProviderProbeNavigate: (opts: { to: string }) => void }).__engineProviderProbeNavigate({
        to: '/settings/profile',
      });
      await settle();
    });

    expect(calls).toHaveLength(1);
    expect((calls[0] as { action: string }).action).toBe('PUSH');
    expect(adapter.lastWrite).toBeUndefined();
    expect(container.textContent).toBe('general');
    expect(router.state.location.pathname).toBe('/settings/general');

    await act(async () => {
      root.unmount();
    });
    container.remove();
    history.destroy();
  });

  it('lets a navigate() through when shouldBlockFn returns false: the write reaches the shared history', async () => {
    const adapter = resetRealm('/en?screen=dashboard;route=settings/general;orientation=left');
    const history = adaptComposedHistory(resolveNavigationHistory(), ENTRY_ADDRESS);
    // Mounted through a raw `RouterProvider` rather than `EngineProvider`,
    // so this test owns the attach the provider's own effect would run.
    attachAdaptedHistory(history);
    const calls: unknown[] = [];
    const router = createProviderRouter(buildBlockableRouteTree(calls, () => false), history);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<RouterProvider router={router} />);
    });

    await act(async () => {
      (globalThis as unknown as { __engineProviderProbeNavigate: (opts: { to: string }) => void }).__engineProviderProbeNavigate({
        to: '/settings/profile',
      });
      await settle();
    });

    expect(calls).toHaveLength(1);
    expect(adapter.lastWrite).toBe('/en?screen=dashboard;route=settings/profile');
    expect(container.textContent).toBe('profile');

    await act(async () => {
      root.unmount();
    });
    container.remove();
    history.destroy();
  });
});
