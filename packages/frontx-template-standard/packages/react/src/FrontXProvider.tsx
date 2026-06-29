/**
 * FrontX Provider - Main provider component for FrontX applications
 *
 * React Layer: L3 (Depends on @gears-frontx/framework)
 *
 * Query cache lifecycle is owned by the queryCache() framework plugin (L2).
 * FrontXProvider reads the plugin-owned QueryClient from the app and mounts the
 * internal React provider around the tree when it is available.
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-bootstrap-provider:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-resolve-app:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-build-provider-tree:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-provider:p1
// @cpt-dod:cpt-frontx-dod-request-lifecycle-query-provider:p2
// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2
// @cpt-FEATURE:implement-endpoint-descriptors:p3

import React, { useMemo, useEffect, useState } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import type { Store } from '@reduxjs/toolkit';
import {
  createFrontXApp,
  microfrontends,
} from '@gears-frontx/framework';
import type { FrontXApp } from '@gears-frontx/framework';
import { FrontXContext } from './FrontXContext';
import { MfeProvider } from './mfe/MfeProvider';
import {
  hasFrontXQueryClientActivator,
  FrontXQueryClientProvider,
  useBootstrappedFrontXQueryClient,
} from './queryClient';
import type { FrontXProviderProps } from './types';

/**
 * Shallow-compare two plain objects by own-enumerable values (Object.is).
 * Prevents unnecessary app recreation when callers pass inline config literals
 * whose values haven't actually changed between renders.
 */
function shallowEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => Object.is(a[k], b[k]));
}

type ProviderOwnedAppConfig = FrontXProviderProps['config'] & {
  microfrontends?: Parameters<typeof microfrontends>[0];
};

function createProviderOwnedApp(
  config: ProviderOwnedAppConfig | undefined
): FrontXApp {
  return createFrontXApp(config);
}

/**
 * FrontX Provider Component
 *
 * Provides the FrontX application context to all child components.
 * Creates the FrontX app instance with the full preset by default.
 *
 * @example
 * ```tsx
 * // Default - creates app with full preset
 * <FrontXProvider>
 *   <App />
 * </FrontXProvider>
 *
 * // With configuration
 * <FrontXProvider config={{ devMode: true }}>
 *   <App />
 * </FrontXProvider>
 *
 * // With pre-built app
 * const app = createFrontX().use(queryCache()).build();
 * <FrontXProvider app={app}>
 *   <App />
 * </FrontXProvider>
 *
 * // With MFE bridge (for MFE components)
 * <FrontXProvider mfeBridge={{ bridge, extensionId, domainId }}>
 *   <MyMfeApp />
 * </FrontXProvider>
 *
 * // QueryCache is resolved from the app's plugin composition
 * <FrontXProvider app={app}>
 *   <MyMfeApp />
 * </FrontXProvider>
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-provider
// @cpt-begin:cpt-frontx-dod-react-bindings-provider:p1:inst-render-provider
// @cpt-begin:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-render-provider
export const FrontXProvider: React.FC<FrontXProviderProps> = ({
  children,
  config,
  app: providedApp,
  mfeBridge,
}) => {
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-resolve-app
  // @cpt-begin:cpt-frontx-algo-react-bindings-resolve-app:p1:inst-use-provided-app
  // @cpt-begin:cpt-frontx-algo-react-bindings-resolve-app:p1:inst-create-app
  // @cpt-begin:cpt-frontx-algo-react-bindings-resolve-app:p1:inst-memoize-app
  // @cpt-begin:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-resolve-app-tree
  // Stabilize config by shallow value without mutating a ref during render.
  // When the incoming config shallow-differs, a render-phase setState triggers an
  // immediate re-render so useMemo sees the updated stable reference in the same
  // turn as a reference-changing (but value-equal) prop would be ignored.
  const [stableConfig, setStableConfig] = useState(config);
  if (
    !shallowEqual(
      stableConfig as Record<string, unknown> | undefined,
      config as Record<string, unknown> | undefined,
    )
  ) {
    setStableConfig(config);
  }

  const app = useMemo<FrontXApp>(() => {
    if (providedApp) {
      return providedApp;
    }

    return createProviderOwnedApp(stableConfig as ProviderOwnedAppConfig | undefined);
  }, [providedApp, stableConfig]);
  // @cpt-end:cpt-frontx-algo-react-bindings-resolve-app:p1:inst-use-provided-app
  // @cpt-end:cpt-frontx-algo-react-bindings-resolve-app:p1:inst-create-app
  // @cpt-end:cpt-frontx-algo-react-bindings-resolve-app:p1:inst-memoize-app
  // @cpt-end:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-resolve-app-tree
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-resolve-app

  const queryClient = useBootstrappedFrontXQueryClient(app);
  const deferQuerySubtree =
    hasFrontXQueryClientActivator(app) && queryClient === undefined;

  useEffect(() => {
    if (
      queryClient ||
      hasFrontXQueryClientActivator(app) ||
      process.env.NODE_ENV === 'production' ||
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true'
    ) {
      return;
    }

    console.warn(
      '[FrontXProvider] No query cache available. Add queryCache() or queryCacheShared() to your plugin composition. ' +
      'useApiQuery/useApiMutation will fail without it.'
    );
  }, [app, queryClient]);

  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-destroy-app
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Only destroy if we created the app (not provided externally)
      if (!providedApp) {
        app.destroy();
      }
    };
  }, [app, providedApp]);
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-destroy-app

  // @cpt-begin:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-frontx-context
  // @cpt-begin:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-redux
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-frontx-context
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-redux-provider
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-query-provider
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-children
  // @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-render-query-provider
  // Provider order (outer to inner):
  //   FrontXContext -> ReduxProvider -> QueryClientProvider -> children
  // queryCache()/queryCacheShared() own the shared QueryClient lifecycle.
  const content = (
    <FrontXContext.Provider value={app}>
      <ReduxProvider store={app.store as Store}>
        {/* app.store is FrontX-owned but Redux-compatible. Cast keeps react-redux happy. */}
        <FrontXQueryClientProvider queryClient={queryClient}>
          {deferQuerySubtree ? null : children}
        </FrontXQueryClientProvider>
      </ReduxProvider>
    </FrontXContext.Provider>
  );
  // @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-render-query-provider
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-children
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-query-provider
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-redux-provider
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-set-frontx-context
  // @cpt-end:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-redux
  // @cpt-end:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-frontx-context

  // @cpt-begin:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-mfe-conditional
  // @cpt-begin:cpt-frontx-flow-react-bindings-bootstrap-provider:p2:inst-wrap-mfe-provider
  // Wrap with MfeProvider if bridge is provided
  if (mfeBridge) {
    return (
      <MfeProvider value={mfeBridge}>
        {content}
      </MfeProvider>
    );
  }
  // @cpt-end:cpt-frontx-algo-react-bindings-build-provider-tree:p1:inst-wrap-mfe-conditional
  // @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p2:inst-wrap-mfe-provider

  return content;
};
// @cpt-end:cpt-frontx-flow-react-bindings-bootstrap-provider:p1:inst-render-provider
// @cpt-end:cpt-frontx-dod-react-bindings-provider:p1:inst-render-provider
// @cpt-end:cpt-frontx-dod-request-lifecycle-query-provider:p2:inst-render-provider
