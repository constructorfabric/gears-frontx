import React from 'react';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import {
  createHAI3,
  type ChildMfeBridge,
  type EndpointDescriptor,
  type HAI3App,
  queryCache,
  queryCacheShared,
  resetSharedQueryClient,
} from '@gears-frontx/framework';
import {
  ThemeAwareReactLifecycle,
  useApiQuery,
  useQueryCache,
} from '@gears-frontx/react';
import {
  bootstrapHAI3QueryClient,
  resolveHAI3QueryClient,
  useOptionalHAI3QueryClient,
} from '@gears-frontx/react/testing';

afterEach(() => {
  resetSharedQueryClient();
});

/** Minimal real app: failure-path test only needs an app without shared QueryClient wiring. */
function createMinimalHai3App(): HAI3App {
  return createHAI3().build();
}

function makeScreenMountBridgeStub(): ChildMfeBridge {
  return {
    domainId: 'screen',
    instanceId: 'bridge',
    executeActionsChain: vi.fn().mockResolvedValue(undefined),
    subscribeToProperty: vi.fn().mockReturnValue(() => undefined),
    getProperty: vi.fn().mockReturnValue(undefined),
    registerActionHandler: vi.fn(),
  };
}

function QueryCacheProbe({ onRender }: { onRender: (value: unknown) => void }) {
  const queryCache = useQueryCache();
  onRender(queryCache.get(['probe']));
  return null;
}

function OptionalQueryClientProbe({ onRender }: { onRender: (value: unknown) => void }) {
  const queryClient = useOptionalHAI3QueryClient();
  onRender(queryClient?.getQueryData(['probe']));
  return null;
}

const LATE_JOIN_API_QUERY_DESCRIPTOR: EndpointDescriptor<string> = {
  key: ['mfe-late-join-useApiQuery'],
  staleTime: 0,
  gcTime: 0,
  fetch: () => Promise.resolve('late-join-data'),
};

function ApiQueryLateJoinProbe({
  onRender,
}: {
  onRender: (r: { data: unknown; isLoading: boolean }) => void;
}) {
  const result = useApiQuery(LATE_JOIN_API_QUERY_DESCRIPTOR);
  onRender({ data: result.data, isLoading: result.isLoading });
  return null;
}

class TestLifecycle extends ThemeAwareReactLifecycle {
  constructor(
    app: HAI3App,
    private readonly onRender: (value: unknown) => void
  ) {
    super(app);
  }

  protected renderContent() {
    return React.createElement(QueryCacheProbe, { onRender: this.onRender });
  }
}

class OptionalQueryClientLifecycle extends ThemeAwareReactLifecycle {
  constructor(
    app: HAI3App,
    private readonly onRender: (value: unknown) => void
  ) {
    super(app);
  }

  protected renderContent() {
    return React.createElement(OptionalQueryClientProbe, { onRender: this.onRender });
  }
}

class ApiQueryLateJoinLifecycle extends ThemeAwareReactLifecycle {
  constructor(
    app: HAI3App,
    private readonly onRender: (r: { data: unknown; isLoading: boolean }) => void
  ) {
    super(app);
  }

  protected renderContent() {
    return React.createElement(ApiQueryLateJoinProbe, { onRender: this.onRender });
  }
}

describe('MFE shared QueryClient join', () => {
  it('resolves the shared QueryClient at mount when the child app built before the host', async () => {
    const childApp = createHAI3().use(queryCacheShared()).build();
    const hostApp = createHAI3().use(queryCache()).build();
    const hostClient = resolveHAI3QueryClient(hostApp);
    if (!hostClient) {
      throw new Error('expected host query client');
    }
    hostClient.setQueryData(['probe'], 'shared-query-client');

    let observedValue: unknown;
    const lifecycle = new TestLifecycle(childApp, (value) => {
      observedValue = value;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
      hostApp.destroy();
    });
  });

  it('keeps the joined QueryClient readable after immediate host app teardown following mount', async () => {
    const hostApp = createHAI3().use(queryCache()).build();
    const hostClient = resolveHAI3QueryClient(hostApp);
    if (!hostClient) {
      throw new Error('expected host query client');
    }
    hostClient.setQueryData(['probe'], 'shared-query-client');

    const childApp = createHAI3().use(queryCacheShared()).build();

    let observedValue: unknown;
    const lifecycle = new TestLifecycle(childApp, (value) => {
      observedValue = value;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    act(() => {
      hostApp.destroy();
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
    });
  });

  it('reads the app QueryClient through the first React commit', async () => {
    const app = createHAI3().use(queryCache()).build();
    const sharedClient = resolveHAI3QueryClient(app);
    if (!sharedClient) {
      throw new Error('expected app query client');
    }
    sharedClient.setQueryData(['probe'], 'shared-query-client');

    let observedValue: unknown;
    const lifecycle = new TestLifecycle(
      app,
      (value) => {
        observedValue = value;
      }
    );

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      app.destroy();
    });
  });

  it('does not activate queryCacheShared() from render bootstrap', async () => {
    const childApp = createHAI3().use(queryCacheShared()).build();
    const hostApp = createHAI3().use(queryCache()).build();

    expect(bootstrapHAI3QueryClient(childApp)).toBeUndefined();
    expect(resolveHAI3QueryClient(childApp)).toBeUndefined();

    act(() => {
      hostApp.destroy();
    });

    expect(bootstrapHAI3QueryClient(childApp)).toBeUndefined();

    childApp.destroy();
  });

  it('useApiQuery resolves after the host runtime appears when the MFE mounted first', async () => {
    const childApp = createHAI3().use(queryCacheShared()).build();

    let last: { data: unknown; isLoading: boolean } | undefined;
    const lifecycle = new ApiQueryLateJoinLifecycle(childApp, (r) => {
      last = r;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    expect(last).toBeUndefined();

    let hostApp!: HAI3App;
    await act(async () => {
      hostApp = createHAI3().use(queryCache()).build();
    });

    await waitFor(() => {
      expect(last?.data).toBe('late-join-data');
      expect(last?.isLoading).toBe(false);
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
      hostApp.destroy();
    });
  });

  it('waits for the host runtime when it appears after the mounted MFE renders', async () => {
    const childApp = createHAI3().use(queryCacheShared()).build();

    let observedValue: unknown = 'initial';
    const lifecycle = new OptionalQueryClientLifecycle(childApp, (value) => {
      observedValue = value;
    });

    const container = document.createElement('div');
    await act(async () => {
      lifecycle.mount(
        container,
        makeScreenMountBridgeStub(),
        {
          domainId: 'screen',
          extensionId: 'ext',
        }
      );
    });

    // HAI3Provider defers the subtree until the shared client joins, so the probe
    // does not mount (and does not observe undefined) until the host exists.
    expect(observedValue).toBe('initial');

    let hostApp!: HAI3App;
    await act(async () => {
      hostApp = createHAI3().use(queryCache()).build();
      const hostClient = resolveHAI3QueryClient(hostApp);
      if (!hostClient) {
        throw new Error('expected host query client');
      }
      hostClient.setQueryData(['probe'], 'shared-query-client');
    });

    await waitFor(() => {
      expect(observedValue).toBe('shared-query-client');
    });

    act(() => {
      lifecycle.unmount(container);
      childApp.destroy();
      hostApp.destroy();
    });
  });

  it('fails explicitly when a mounted MFE app has no shared QueryClient', async () => {
    const minimalApp = createMinimalHai3App();
    try {
      const lifecycle = new TestLifecycle(minimalApp, () => undefined);
      const container = document.createElement('div');

      expect(() => {
        act(() => {
          lifecycle.mount(
            container,
            makeScreenMountBridgeStub(),
            {
              domainId: 'screen',
              extensionId: 'ext',
            }
          );
        });
      }).toThrow(
        '[HAI3Provider] Mounted MFEs require queryCacheShared() in the child app and queryCache() in the host app before loading the MFE app.'
      );
    } finally {
      minimalApp.destroy();
    }
  });
});
