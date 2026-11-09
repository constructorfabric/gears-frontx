import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { DomainKey, EntryAddress, ExtensionToken } from '@gears-frontx/routing';
import {
  createRootRoute,
  createRoute,
  ExtensionRouter,
  Link,
  Outlet,
  parseSearchWith,
  stringifySearchWith,
  useNavigate,
  useSearch,
} from '../index.js';
import { resetRealm, entry, type FakeHistoryAdapter } from './helpers/index.js';
import { composedUrl, DASHBOARD_ENTRY, SIDEBAR_ENTRY } from './helpers/composed-url.js';

const { ownEntryAddress } = vi.hoisted(() => ({ ownEntryAddress: vi.fn() }));

vi.mock('@gears-frontx/routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gears-frontx/routing')>()),
  router: { ownEntryAddress },
}));

const OWN: EntryAddress = { domainKey: 'screen' as DomainKey, extension: 'dashboard' as ExtensionToken };
const ENTRIES = [DASHBOARD_ENTRY, SIDEBAR_ENTRY];
const COMPOSED_URL = composedUrl('/en', ENTRIES);

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => {};
});

function GoTo({ to, hash }: { to: string; hash?: string }) {
  const navigate = useNavigate();
  return (
    <button data-testid="go" onClick={() => void navigate({ to, hash })}>
      go
    </button>
  );
}

function extensionTree() {
  const root = createRootRoute({
    component: () => (
      <>
        <GoTo to="/settings/profile" hash="frag" />
        <Link to="/settings/profile" hash="frag">
          link
        </Link>
        <Outlet />
      </>
    ),
  });
  return root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/settings/general', component: () => 'general-page' }),
    createRoute({ getParentRoute: () => root, path: '/settings/profile', component: () => 'profile-page' }),
  ]);
}

function shellTree() {
  const root = createRootRoute({
    component: () => (
      <>
        <GoTo to="/fr" />
        <Outlet />
      </>
    ),
  });
  return root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/en', component: () => 'shell-en' }),
    createRoute({ getParentRoute: () => root, path: '/fr', component: () => 'shell-fr' }),
  ]);
}

class Catcher extends Component<{ children: ReactNode }, { error: Error | undefined }> {
  state = { error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? `refused: ${this.state.error.message}` : this.props.children;
  }
}

async function mount(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return container;
}

async function click(container: HTMLElement) {
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="go"]')!.click();
  });
}

let adapter: FakeHistoryAdapter;

describe('ExtensionRouter in a routed extension', () => {
  beforeEach(() => {
    adapter = resetRealm(COMPOSED_URL);
    ownEntryAddress.mockReset().mockReturnValue(OWN);
  });

  it('takes only routeTree and renders it over the own entry', async () => {
    const container = await mount(<ExtensionRouter routeTree={extensionTree()} />);
    expect(container.textContent).toContain('general-page');
  });

  it('writes only the own entry on navigation', async () => {
    const container = await mount(<ExtensionRouter routeTree={extensionTree()} />);
    await click(container);
    expect(container.textContent).toContain('profile-page');
    expect(adapter.lastWrite).toBe(
      composedUrl('/en', [entry('screen', 'dashboard', [{ name: 'route', value: 'settings/profile' }]), SIDEBAR_ENTRY]),
    );
  });

  it('drops a hash given to navigate and to a link href, and keeps the current page hash verbatim', async () => {
    adapter = resetRealm(composedUrl('/en', ENTRIES, 'page'));
    const container = await mount(<ExtensionRouter routeTree={extensionTree()} />);
    expect(container.querySelector('a')!.getAttribute('href')).not.toContain('frag');
    await click(container);
    expect(adapter.lastWrite).toBe(
      composedUrl('/en', [entry('screen', 'dashboard', [{ name: 'route', value: 'settings/profile' }]), SIDEBAR_ENTRY], 'page'),
    );
    expect(adapter.lastWrite).not.toContain('frag');
  });
});

// A route that keeps `q` a string, the way a route that reads a search box
// does: TanStack's default parser reads `q=123` as the number 123.
function searchTree() {
  const root = createRootRoute({ component: Outlet });
  return root.addChildren([
    createRoute({
      getParentRoute: () => root,
      path: '/settings/general',
      validateSearch: (search: Record<string, unknown>) => ({
        q: search.q === undefined ? undefined : String(search.q),
      }),
      component: function ShowQuery() {
        const { q } = useSearch({ strict: false });
        const navigate = useNavigate();
        return (
          <>
            {`q:${typeof q}:${String(q)}`}
            <button data-testid="go" onClick={() => void navigate({ to: '.', search: { q: '456' } })}>
              go
            </button>
          </>
        );
      },
    }),
  ]);
}

// Text in and text out: every value reads as the string written, and a
// string is written as it is.
const parseTextSearch = parseSearchWith((value) => value);
const stringifyTextSearch = stringifySearchWith(JSON.stringify);

function searchEntry(q: string) {
  return entry('screen', 'dashboard', [
    { name: 'route', value: 'settings/general' },
    { name: 'q', value: q },
  ]);
}

describe('ExtensionRouter search options', () => {
  beforeEach(() => {
    adapter = resetRealm(composedUrl('/en', [searchEntry('123'), SIDEBAR_ENTRY]));
    ownEntryAddress.mockReset().mockReturnValue(OWN);
  });

  it('with the engine default, rewrites a number-shaped string value JSON-quoted on load', async () => {
    const container = await mount(<ExtensionRouter routeTree={searchTree()} />);
    expect(container.textContent).toContain('q:string:123');
    expect(adapter.lastWrite).toBe(composedUrl('/en', [searchEntry('"123"'), SIDEBAR_ENTRY]));
  });

  it('with a text parser and serializer, leaves the entry as written on load and writes a string as it is', async () => {
    const container = await mount(
      <ExtensionRouter
        routeTree={searchTree()}
        parseSearch={parseTextSearch}
        stringifySearch={stringifyTextSearch}
      />,
    );
    expect(container.textContent).toContain('q:string:123');
    expect(adapter.lastWrite).toBeUndefined();

    await click(container);
    expect(container.textContent).toContain('q:string:456');
    expect(adapter.lastWrite).toBe(composedUrl('/en', [searchEntry('456'), SIDEBAR_ENTRY]));
  });
});

describe('ExtensionRouter in the shell runtime', () => {
  beforeEach(() => {
    adapter = resetRealm(COMPOSED_URL);
    ownEntryAddress.mockReset().mockReturnValue(undefined);
  });

  it('renders over the pathname and leaves the query string untouched', async () => {
    const container = await mount(<ExtensionRouter routeTree={shellTree()} />);
    expect(container.textContent).toContain('shell-en');
    await click(container);
    expect(container.textContent).toContain('shell-fr');
    expect(adapter.lastWrite).toBe(composedUrl('/fr', ENTRIES));
  });
});

describe('ExtensionRouter in an extension runtime with no access to the router', () => {
  it('refuses', async () => {
    adapter = resetRealm(COMPOSED_URL);
    ownEntryAddress.mockReset().mockImplementation(() => {
      throw new Error('no access to the router');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = await mount(
      <Catcher>
        <ExtensionRouter routeTree={extensionTree()} />
      </Catcher>,
    );
    expect(container.textContent).toContain('refused: no access to the router');
    expect(container.textContent).not.toContain('general-page');
  });
});
