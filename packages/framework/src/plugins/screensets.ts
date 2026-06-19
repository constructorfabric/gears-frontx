// @cpt-flow:cpt-hai3-flow-framework-composition-full-preset:p1

/**
 * Screensets Plugin - Provides screenset registry and screen slice
 *
 * This is the minimal plugin for screenset orchestration.
 * It does NOT include navigation actions - those are in the navigation plugin.
 *
 * Framework Layer: L2
 *
 * NOTE: Translations are NOT handled by this plugin. Screensets register
 * their translations directly with i18nRegistry via framework re-exports.
 * This maintains clean separation: @gears-frontx/screensets has zero knowledge of i18n.
 */

import { screenSlice, screenActions } from '../slices';
import type { HAI3Plugin, ScreensetsConfig } from '../types';

/**
 * Screensets plugin factory.
 *
 * @param config - Plugin configuration
 * @returns Screensets plugin
 *
 * @example
 * ```typescript
 * const app = createHAI3()
 *   .use(screensets({ autoDiscover: true }))
 *   .build();
 * ```
 */
// @cpt-begin:cpt-hai3-flow-framework-composition-full-preset:p1:inst-1
export function screensets(_config?: ScreensetsConfig): HAI3Plugin<ScreensetsConfig> {
  return {
    name: 'screensets',
    dependencies: [],

    provides: {
      registries: {},
      slices: [screenSlice],
      actions: {
        setActiveScreen: screenActions.navigateTo,
        setScreenLoading: screenActions.setScreenLoading,
      },
    },

    onInit() {
      // Auto-discover screensets if configured
      // Note: In Vite apps, this is handled by glob imports in user code
      // Translation wiring is NOT done here.
      // Screensets register translations directly with i18nRegistry.
      // This keeps @gears-frontx/screensets free of i18n dependencies.
    },
  };
}
// @cpt-end:cpt-hai3-flow-framework-composition-full-preset:p1:inst-1
