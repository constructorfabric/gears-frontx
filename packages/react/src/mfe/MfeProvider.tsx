/**
 * MFE Provider - Provides MFE context to child components
 *
 * Wraps MFE components with bridge and metadata.
 * Used by the MFE mounting system.
 *
 * MfeProvider does not create or own the shared QueryClient. When the host uses
 * queryCache() and the child app uses queryCacheShared(), overlapping queries
 * (same query key) are deduplicated and cached once across MFE boundaries.
 * Each MFE still uses its own apiRegistry and service instances in queryFn.
 *
 * React Layer: L3 (Depends on @gears-frontx/framework)
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-mfe-provider:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-mfe-hooks:p1
// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

import React from 'react';
import { MfeContext, type MfeContextValue } from './MfeContext';

// ============================================================================
// Provider Props
// ============================================================================

/**
 * MFE Provider Props
 */
export interface MfeProviderProps {
  /** MFE context value */
  value: MfeContextValue;
  /** Child components */
  children: React.ReactNode;
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * MFE Provider Component
 *
 * Provides MFE bridge and metadata to child components.
 * Used by the MFE mounting system to wrap MFE components.
 *
 * @example
 * ```tsx
 * <MfeProvider value={{ bridge, extensionId, domainId }}>
 *   <MyMfeComponent />
 * </MfeProvider>
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-mfe-provider:p1:inst-render-mfe-provider
// @cpt-begin:cpt-frontx-flow-react-bindings-mfe-provider:p1:inst-set-mfe-context
// @cpt-begin:cpt-frontx-dod-react-bindings-mfe-hooks:p1:inst-render-mfe-provider
// @cpt-begin:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-mfe-query-client
export const MfeProvider: React.FC<MfeProviderProps> = ({ value, children }) => {
  // MfeProvider only supplies the bridge context. Shared cache depends on
  // plugin-owned QueryClient reuse across each MFE root's HAI3Provider.
  return (
    <MfeContext.Provider value={value}>
      {children}
    </MfeContext.Provider>
  );
};
// @cpt-end:cpt-frontx-flow-react-bindings-mfe-provider:p1:inst-render-mfe-provider
// @cpt-end:cpt-frontx-flow-react-bindings-mfe-provider:p1:inst-set-mfe-context
// @cpt-end:cpt-frontx-dod-react-bindings-mfe-hooks:p1:inst-render-mfe-provider
// @cpt-end:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2:inst-mfe-query-client
