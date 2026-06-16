/**
 * FrontX Context - React context for FrontX application
 *
 * React Layer: L3 (Depends on @gears-frontx/framework)
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-hai3:p2
// @cpt-algo:cpt-frontx-algo-react-bindings-mfe-context-guard:p1

import { createContext, useContext } from 'react';
import type { HAI3App } from '@gears-frontx/framework';

// ============================================================================
// Context Definition
// ============================================================================

/**
 * FrontX Context
 * Holds the FrontX app instance for the application.
 */
export const HAI3Context = createContext<HAI3App | null>(null);

/**
 * Use the FrontX context.
 * Throws if used outside of FrontXProvider.
 *
 * @returns The FrontX app instance
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-hai3:p2:inst-call-use-hai3
// @cpt-begin:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-hai3-context
export function useHAI3(): HAI3App {
  const context = useContext(HAI3Context);

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-hai3:p2:inst-guard-hai3-context
  if (!context) {
    throw new Error(
      'useHAI3 must be used within a HAI3Provider. ' +
      'Wrap your application with <HAI3Provider> to access HAI3 features.'
    );
  }
  // @cpt-end:cpt-frontx-flow-react-bindings-use-hai3:p2:inst-guard-hai3-context

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-hai3:p2:inst-return-hai3-app
  return context;
  // @cpt-end:cpt-frontx-flow-react-bindings-use-hai3:p2:inst-return-hai3-app
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-hai3:p2:inst-call-use-hai3
// @cpt-end:cpt-frontx-algo-react-bindings-mfe-context-guard:p1:inst-throw-no-hai3-context
