/**
 * FrontX Context - React context for FrontX application
 *
 * React Layer: L3 (Depends on @gears-frontx/framework)
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-frontx:p2
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1

import { createContext, useContext } from 'react';
import type { FrontXApp } from '@gears-frontx/framework';

// ============================================================================
// Context Definition
// ============================================================================

/**
 * FrontX Context
 * Holds the FrontX app instance for the application.
 */
export const FrontXContext = createContext<FrontXApp | null>(null);

/**
 * Use the FrontX context.
 * Throws if used outside of FrontXProvider.
 *
 * @returns The FrontX app instance
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-frontx:p2:inst-call-use-frontx
// @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-frontx-context
export function useFrontX(): FrontXApp {
  const context = useContext(FrontXContext);

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-frontx:p2:inst-guard-frontx-context
  if (!context) {
    throw new Error(
      'useFrontX must be used within a FrontXProvider. ' +
      'Wrap your application with <FrontXProvider> to access Gears FrontX features.'
    );
  }
  // @cpt-end:cpt-frontx-flow-react-bindings-use-frontx:p2:inst-guard-frontx-context

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-frontx:p2:inst-return-frontx-app
  return context;
  // @cpt-end:cpt-frontx-flow-react-bindings-use-frontx:p2:inst-return-frontx-app
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-frontx:p2:inst-call-use-frontx
// @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-frontx-context
