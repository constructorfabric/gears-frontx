/**
 * MFE Context - React context for MFE state
 *
 * Provides MFE bridge and metadata to child components.
 * Used by MFE components to access their runtime context.
 *
 * React Layer: L3 (Depends on @gears-frontx/framework)
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-mfe-provider:p1
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-mfe-hooks:p1

import { createContext, useContext } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/framework';

// ============================================================================
// Context Value Types
// ============================================================================

/**
 * MFE Context Value
 * Contains bridge and metadata about the MFE instance.
 */
export interface MfeContextValue {
  /** Child bridge for communication with host */
  bridge: ChildMfeBridge;
  /** Extension ID */
  extensionId: string;
  /** Domain ID where MFE is mounted */
  domainId: string;
}

// ============================================================================
// Context Definition
// ============================================================================

/**
 * MFE Context
 * Holds the MFE bridge and metadata for child components.
 */
export const MfeContext = createContext<MfeContextValue | null>(null);

/**
 * Use the MFE context.
 * Throws if used outside of MFE context.
 *
 * @returns The MFE context value
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-mfe-provider:p1:inst-use-mfe-context
// @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-mfe-context
// @cpt-begin:cpt-frontx-dod-react-bindings-mfe-hooks:p1:inst-use-mfe-context
export function useMfeContext(): MfeContextValue {
  const context = useContext(MfeContext);

  if (!context) {
    throw new Error(
      'useMfeContext must be used within a MfeProvider. ' +
      'This hook can only be used inside MFE components.'
    );
  }

  return context;
}
// @cpt-end:cpt-frontx-flow-react-bindings-mfe-provider:p1:inst-use-mfe-context
// @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-mfe-context
// @cpt-end:cpt-frontx-dod-react-bindings-mfe-hooks:p1:inst-use-mfe-context
