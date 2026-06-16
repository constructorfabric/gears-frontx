/**
 * useMountedExtensions Hook - Mounted extension observation for any domain
 *
 * Domain-agnostic hook that returns the currently-mounted Extension instances
 * for any registered domain, including multi-mount domains backed by
 * ConcurrentMountStrategy.
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-stable-snapshots:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-observation-hooks:p1

import { useSyncExternalStore, useCallback, useRef } from 'react';
import { useHAI3 } from '../../HAI3Context';
import type { Extension } from '@gears-frontx/framework';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for observing the currently-mounted extensions in any domain.
 *
 * Subscribes to the FrontX store to detect mount state changes, and returns
 * the array of Extension instances currently mounted in the specified domain.
 *
 * Pairs with getMountedExtensions(domainId) on the registry and resolves each
 * mounted extension ID to its Extension instance. IDs that have been unregistered
 * concurrently (race against unregister) are filtered out.
 *
 * Returns a referentially stable array when the underlying ID list is unchanged.
 *
 * For multi-mount domains (ConcurrentMountStrategy), may return more than one entry.
 * For single-mount domains (ExclusiveMountStrategy), the returned array has at most one entry.
 *
 * @param domainId - Domain ID to query mounted extensions for
 * @returns Array of Extension instances currently mounted in the domain
 *
 * @example
 * ```tsx
 * function MountedWidgets() {
 *   const mounted = useMountedExtensions('gts.hai3.mfes.ext.domain.v1~hai3.screensets.layout.sidebar.v1');
 *
 *   return (
 *     <ul>
 *       {mounted.map(ext => (
 *         <li key={ext.id}>{ext.id}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-call-mounted-extensions
// @cpt-begin:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-mounted-extensions
export function useMountedExtensions(domainId: string): Extension[] {
  const app = useHAI3();
  const registry = app.mfeRegistry;

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-guard-registry-mounted
  // @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry
  if (!registry) {
    throw new Error(
      'useMountedExtensions requires the microfrontends plugin. ' +
      'Add microfrontends() to your HAI3 app configuration.'
    );
  }
  // @cpt-end:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-guard-registry-mounted
  // @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-subscribe-store-mounted
  // Subscribe to store changes. Any dispatch (including mount state updates) triggers
  // a snapshot check. The cache key comparison ensures only actual mount-set changes
  // cause re-renders.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return app.store.subscribe(onStoreChange);
    },
    [app.store]
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-subscribe-store-mounted

  // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref
  // Cache the snapshot to maintain referential stability for useSyncExternalStore.
  // Only update when the mounted ID list actually changes.
  const cacheRef = useRef<{ key: string; extensions: Extension[] }>({ key: '', extensions: [] });
  // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref

  const getSnapshot = useCallback(() => {
    // @cpt-begin:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-use-mounted-extensions-snapshot
    const ids = registry.getMountedExtensions(domainId);
    const resolved = ids
      .map(id => registry.getExtension(id))
      .filter((ext): ext is Extension => ext !== undefined);
    // @cpt-end:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-use-mounted-extensions-snapshot

    // @cpt-begin:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-mounted-extensions-stable-ref
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key
    const key = ids.join(',');
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key

    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache
    if (key !== cacheRef.current.key) {
      cacheRef.current = { key, extensions: resolved };
    }
    return cacheRef.current.extensions;
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache
    // @cpt-end:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-mounted-extensions-stable-ref
  }, [registry, domainId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-mounted-extensions:p1:inst-call-mounted-extensions
// @cpt-end:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-mounted-extensions
