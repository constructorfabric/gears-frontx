/**
 * useActivePackage Hook - Active GTS package subscription
 *
 * Subscribes to store changes and returns the GTS package of the currently
 * mounted screen extension.
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-hai3-flow-react-bindings-use-active-package:p1
// @cpt-algo:cpt-hai3-algo-react-bindings-mfe-context-guard:p1
// @cpt-algo:cpt-hai3-algo-react-bindings-stable-snapshots:p1
// @cpt-dod:cpt-hai3-dod-react-bindings-observation-hooks:p1

import { useSyncExternalStore, useCallback, useRef } from 'react';
import { useHAI3 } from '../../HAI3Context';
import { extractGtsPackage, FRONTX_SCREEN_DOMAIN } from '@gears-frontx/framework';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for observing the active GTS package (the package of the currently
 * mounted screen extension).
 *
 * Subscribes to the HAI3 store to detect mount state changes, and returns
 * the GTS package extracted from the currently mounted screen extension's ID.
 *
 * Returns `undefined` if no screen extension is currently mounted.
 *
 * @returns GTS package string of the active screen extension, or undefined
 *
 * @example
 * ```tsx
 * function ActivePackageIndicator() {
 *   const activePackage = useActivePackage();
 *
 *   if (!activePackage) {
 *     return <div>No active screen</div>;
 *   }
 *
 *   return <div>Active package: {activePackage}</div>;
 * }
 * ```
 */
// @cpt-begin:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-call-active-package
// @cpt-begin:cpt-hai3-dod-react-bindings-observation-hooks:p1:inst-call-active-package
export function useActivePackage(): string | undefined {
  const app = useHAI3();
  const registry = app.screensetsRegistry;

  // @cpt-begin:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-guard-registry-active
  // @cpt-begin:cpt-hai3-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry
  if (!registry) {
    throw new Error(
      'useActivePackage requires the microfrontends plugin. ' +
      'Add microfrontends() to your HAI3 app configuration.'
    );
  }
  // @cpt-end:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-guard-registry-active
  // @cpt-end:cpt-hai3-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry

  // @cpt-begin:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-subscribe-store-active
  // Subscribe to store changes.
  // Any dispatch (including mount state updates) triggers a snapshot check.
  // The snapshot comparison ensures only actual active package changes cause re-renders.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return app.store.subscribe(onStoreChange);
    },
    [app.store]
  );
  // @cpt-end:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-subscribe-store-active

  // @cpt-begin:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-cache-ref
  // Cache the snapshot to maintain referential stability for useSyncExternalStore.
  // Only update when the active package actually changes.
  const cacheRef = useRef<{ activePackage: string | undefined }>({ activePackage: undefined });
  // @cpt-end:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-cache-ref

  const getSnapshot = useCallback(() => {
    // @cpt-begin:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-get-mounted-extension
    const mountedExtensionId = registry.getMountedExtension(FRONTX_SCREEN_DOMAIN);
    // @cpt-end:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-get-mounted-extension

    // @cpt-begin:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-return-undefined-active
    // Guard: if no extension is mounted, return undefined immediately
    if (!mountedExtensionId) {
      const result = undefined;
      // @cpt-begin:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-return-cached
      if (result !== cacheRef.current.activePackage) {
        cacheRef.current = { activePackage: result };
      }
      return cacheRef.current.activePackage;
      // @cpt-end:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    }
    // @cpt-end:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-return-undefined-active

    // @cpt-begin:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-extract-package
    // @cpt-begin:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key
    // Extract GTS package from the mounted extension ID
    const activePackage = extractGtsPackage(mountedExtensionId);
    // @cpt-end:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key

    // @cpt-begin:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-update-cache
    if (activePackage !== cacheRef.current.activePackage) {
      cacheRef.current = { activePackage };
    }
    // @cpt-end:cpt-hai3-algo-react-bindings-stable-snapshots:p1:inst-update-cache

    return cacheRef.current.activePackage;
    // @cpt-end:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-extract-package
  }, [registry]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
// @cpt-end:cpt-hai3-flow-react-bindings-use-active-package:p1:inst-call-active-package
// @cpt-end:cpt-hai3-dod-react-bindings-observation-hooks:p1:inst-call-active-package
