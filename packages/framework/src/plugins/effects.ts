// @cpt-flow:cpt-frontx-flow-framework-composition-full-preset:p1

/**
 * Effects Plugin - Core effect coordination infrastructure
 *
 * Framework Layer: L2
 */

import type { FrontXPlugin } from '../types';

/**
 * Effects plugin factory.
 *
 * Provides the core effect coordination infrastructure.
 * Other plugins register their effects through this system.
 *
 * @returns Effects plugin
 *
 * @example
 * ```typescript
 * const app = createFrontX()
 *   .use(effects())
 *   .build();
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1
export function effects(): FrontXPlugin {
  return {
    name: 'effects',
    dependencies: [],

    onInit() {
      // Effects plugin provides the coordination layer
      // Individual plugins register their own effects in their onInit
      // This plugin ensures effect infrastructure is available
    },
  };
}
// @cpt-end:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1
