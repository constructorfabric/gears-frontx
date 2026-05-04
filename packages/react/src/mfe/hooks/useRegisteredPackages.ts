/**
 * useRegisteredPackages Hook - Registered GTS packages subscription
 *
 * Subscribes to store changes to detect when extensions are registered or unregistered,
 * and returns the current list of registered GTS packages.
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-registered-packages:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-stable-snapshots:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-observation-hooks:p1

import { useSyncExternalStore, useCallback, useRef } from 'react';
import { useHAI3 } from '../../HAI3Context';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for observing registered GTS packages.
 *
 * Subscribes to the FrontX store to detect registration state changes,
 * and returns the current list of GTS packages extracted from registered
 * extensions.
 *
 * ARCHITECTURAL NOTE ON STORE SUBSCRIPTION COUPLING:
 * This hook uses `useSyncExternalStore` with `app.store.subscribe`, which
 * fires on any Redux dispatch. Since `registerExtension()` dispatches to
 * the mfe store slice, the subscription WILL trigger when packages change.
 * The `getSnapshot` function calls `mfeRegistry.getRegisteredPackages()`
 * which reads the private `packages` Map. This works because every package
 * map mutation (in registerExtension/unregisterExtension) is always
 * accompanied by a store dispatch in the same serializer callback.
 *
 * IMPORTANT: If a future change mutates the packages map WITHOUT a store
 * dispatch, this hook would fail to re-render. Keep this coupling documented.
 *
 * @returns Array of GTS package strings currently registered
 *
 * @example
 * ```tsx
 * function PackageList() {
 *   const packages = useRegisteredPackages();
 *
 *   return (
 *     <div>
 *       {packages.map(pkg => (
 *         <div key={pkg}>{pkg}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-call-registered-packages
// @cpt-begin:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-registered-packages
export function useRegisteredPackages(): string[] {
  const app = useHAI3();
  const registry = app.mfeRegistry;

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-guard-registry-packages
  // @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry
  if (!registry) {
    throw new Error(
      'useRegisteredPackages requires the microfrontends plugin. ' +
      'Add microfrontends() to your HAI3 app configuration.'
    );
  }
  // @cpt-end:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-guard-registry-packages
  // @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-subscribe-store-packages
  // Subscribe to store changes.
  // Any dispatch (including registration state updates) triggers a snapshot check.
  // The snapshot comparison ensures only actual package list changes cause re-renders.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return app.store.subscribe(onStoreChange);
    },
    [app.store]
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-subscribe-store-packages

  // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref
  // Cache the snapshot to maintain referential stability for useSyncExternalStore.
  // Only update when the package list actually changes.
  const cacheRef = useRef<{ packages: string; list: string[] }>({ packages: '', list: [] });
  // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-diff-packages
  const getSnapshot = useCallback(() => {
    const list = registry.getRegisteredPackages();
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key
    const packages = list.join(',');
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache
    if (packages !== cacheRef.current.packages) {
      cacheRef.current = { packages, list };
    }
    return cacheRef.current.list;
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache
  }, [registry]);
  // @cpt-end:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-diff-packages

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-registered-packages:p1:inst-call-registered-packages
// @cpt-end:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-registered-packages
