/**
 * useActivePackage Hook - Active GTS package subscription
 *
 * Subscribes to store changes and returns the GTS package of the currently
 * mounted screen extension.
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-active-package:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-stable-snapshots:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-observation-hooks:p1

import { useSyncExternalStore, useCallback, useRef } from 'react';
import { useHAI3 } from '../../HAI3Context';
import { extractGtsPackage, HAI3_SCREEN_DOMAIN } from '@cyberfabric/framework';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for observing the active GTS package (the package of the currently
 * mounted screen extension).
 *
 * Subscribes to the FrontX store to detect mount state changes, and returns
 * the GTS package extracted from the currently mounted screen extension's ID.
 *
 * Returns `undefined` if no screen extension is currently mounted.
 *
 * Precondition: presumes HAI3_SCREEN_DOMAIN is registered with ExclusiveMountStrategy;
 * for non-Exclusive domains use useMountedExtensions(domainId) instead.
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
// @cpt-begin:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-call-active-package
// @cpt-begin:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-active-package
export function useActivePackage(): string | undefined {
  const app = useHAI3();
  const registry = app.mfeRegistry;

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-guard-registry-active
  // @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry
  if (!registry) {
    throw new Error(
      'useActivePackage requires the microfrontends plugin. ' +
      'Add microfrontends() to your HAI3 app configuration.'
    );
  }
  // @cpt-end:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-guard-registry-active
  // @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-subscribe-store-active
  // Subscribe to store changes.
  // Any dispatch (including mount state updates) triggers a snapshot check.
  // The snapshot comparison ensures only actual active package changes cause re-renders.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return app.store.subscribe(onStoreChange);
    },
    [app.store]
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-subscribe-store-active

  // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref
  // Cache the snapshot to maintain referential stability for useSyncExternalStore.
  // Only update when the active package actually changes.
  const cacheRef = useRef<{ activePackage: string | undefined }>({ activePackage: undefined });
  // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref

  const getSnapshot = useCallback(() => {
    // @cpt-begin:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-get-mounted-extension
    const mounted = registry.getMountedExtensions(HAI3_SCREEN_DOMAIN);
    // @cpt-end:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-get-mounted-extension

    // @cpt-begin:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-return-undefined-active
    // Guard: if no extension is mounted in the screen domain, return undefined.
    // Index 0 is correct only because the screen domain is documented as
    // ExclusiveMountStrategy-backed — that contract is the hook's precondition.
    if (mounted.length === 0) {
      // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
      if (cacheRef.current.activePackage !== undefined) {
        cacheRef.current = { activePackage: undefined };
      }
      return cacheRef.current.activePackage;
      // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    }
    // @cpt-end:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-return-undefined-active

    // @cpt-begin:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-extract-package
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key
    // Extract GTS package from the first (and only, for Exclusive domains) mounted extension ID.
    const activePackage = extractGtsPackage(mounted[0]);
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key

    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache
    if (activePackage !== cacheRef.current.activePackage) {
      cacheRef.current = { activePackage };
    }
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache

    return cacheRef.current.activePackage;
    // @cpt-end:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-extract-package
  }, [registry]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-active-package:p1:inst-call-active-package
// @cpt-end:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-active-package
