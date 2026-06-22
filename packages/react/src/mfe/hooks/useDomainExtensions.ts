/**
 * useDomainExtensions Hook - Domain extension list subscription
 *
 * Subscribes to store changes to detect when extensions are registered or unregistered,
 * and returns the current list of extensions for a domain.
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-domain-extensions:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-stable-snapshots:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-observation-hooks:p1

import { useSyncExternalStore, useCallback, useRef } from 'react';
import { useFrontX } from '../../FrontXContext';
import type { Extension } from '@gears-frontx/framework';

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for observing extensions registered for a domain.
 *
 * Subscribes to the FrontX store to detect registration state changes,
 * and returns the current list of extensions for the specified domain.
 *
 * @param domainId - Domain ID to query extensions for
 * @returns Array of extensions currently registered for the domain
 *
 * @example
 * ```tsx
 * function SidebarExtensions() {
 *   const extensions = useDomainExtensions('gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.sidebar.v1');
 *
 *   return (
 *     <div>
 *       {extensions.map(ext => (
 *         <div key={ext.id}>{ext.id}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-call-domain-extensions
// @cpt-begin:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-domain-extensions
export function useDomainExtensions(domainId: string): Extension[] {
  const app = useFrontX();
  const registry = app.mfeRegistry;

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-guard-registry
  // @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry
  if (!registry) {
    throw new Error(
      'useDomainExtensions requires the microfrontends plugin. ' +
      'Add microfrontends() to your Gears FrontX app configuration.'
    );
  }
  // @cpt-end:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-guard-registry
  // @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-registry

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-subscribe-store
  // Subscribe to store changes.
  // Any dispatch (including registration state updates) triggers a snapshot check.
  // The snapshot comparison ensures only actual extension list changes cause re-renders.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return app.store.subscribe(onStoreChange);
    },
    [app.store]
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-subscribe-store

  // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref
  // Cache the snapshot to maintain referential stability for useSyncExternalStore.
  // Only update when the extension IDs actually change.
  const cacheRef = useRef<{ ids: string; extensions: Extension[] }>({ ids: '', extensions: [] });
  // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-cache-ref

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-diff-extensions
  // @cpt-begin:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-stable-reference
  const getSnapshot = useCallback(() => {
    const extensions = registry.getExtensionsForDomain(domainId);
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key
    const ids = extensions.map(e => e.id).join(',');
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-compute-cache-key
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    // @cpt-begin:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache
    if (ids !== cacheRef.current.ids) {
      cacheRef.current = { ids, extensions };
    }
    return cacheRef.current.extensions;
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-return-cached
    // @cpt-end:cpt-frontx-algo-react-bindings-stable-snapshots:p1:inst-update-cache
  }, [registry, domainId]);
  // @cpt-end:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-diff-extensions
  // @cpt-end:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-stable-reference

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-domain-extensions:p1:inst-call-domain-extensions
// @cpt-end:cpt-frontx-dod-react-bindings-observation-hooks:p1:inst-call-domain-extensions
