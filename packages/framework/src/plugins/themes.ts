/**
 * Themes Plugin - Provides theme registry and changeTheme action
 *
 * Framework Layer: L2
 */

// @cpt-flow:cpt-hai3-flow-framework-composition-theme-propagation:p1
// @cpt-flow:cpt-hai3-flow-framework-composition-shared-property-broadcast:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-propagation:p1
// @cpt-dod:cpt-hai3-dod-framework-composition-shared-property:p1

import { eventBus } from '@gears-frontx/state';
import { FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/screensets';
import type { HAI3Plugin, ChangeThemePayload, ThemePropagationFailedPayload } from '../types';
import { createThemeRegistry } from '../registries/themeRegistry';

// Define theme events for module augmentation
declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'theme/changed': ChangeThemePayload;
    'theme/propagation/failed': ThemePropagationFailedPayload;
  }
}

/**
 * Change theme action.
 * Emits 'theme/changed' event to trigger theme application.
 */
// @cpt-begin:cpt-hai3-flow-framework-composition-theme-propagation:p1:inst-1
function changeTheme(payload: ChangeThemePayload): void {
  eventBus.emit('theme/changed', payload);
}
// @cpt-end:cpt-hai3-flow-framework-composition-theme-propagation:p1:inst-1

/**
 * Themes plugin factory.
 *
 * @returns Themes plugin
 *
 * @example
 * ```typescript
 * const app = createHAI3()
 *   .use(screensets())
 *   .use(themes())
 *   .build();
 *
 * app.actions.changeTheme({ themeId: 'dark' });
 * ```
 */
export function themes(): HAI3Plugin {
  const themeRegistry = createThemeRegistry();

  return {
    name: 'themes',
    dependencies: [],

    provides: {
      registries: {
        themeRegistry,
      },
      actions: {
        changeTheme,
      },
    },

    // @cpt-begin:cpt-hai3-flow-framework-composition-theme-propagation:p1:inst-2
    // @cpt-begin:cpt-hai3-dod-framework-composition-propagation:p1:inst-1
    onInit(app) {
      // Subscribe to theme changes
      eventBus.on('theme/changed', (payload: ChangeThemePayload) => {
        themeRegistry.apply(payload.themeId);
        try {
          const themeConfig = themeRegistry.get(payload.themeId);
          if (themeConfig) {
            app.screensetsRegistry?.setTheme(themeConfig.variables);
          }
          app.screensetsRegistry?.updateSharedProperty(FRONTX_SHARED_PROPERTY_THEME, payload.themeId);
        } catch (error) {
          console.error('[HAI3] Failed to propagate theme to MFE domains', error);
          eventBus.emit('theme/propagation/failed', { themeId: payload.themeId, error });
        }
      });

      // Bootstrap: Apply the first registered theme (or default)
      const themes = themeRegistry.getAll();
      if (themes.length > 0) {
        themeRegistry.apply(themes[0].id);
        app.screensetsRegistry?.setTheme(themes[0].variables);
      }
    },
    // @cpt-end:cpt-hai3-flow-framework-composition-theme-propagation:p1:inst-2
    // @cpt-end:cpt-hai3-dod-framework-composition-propagation:p1:inst-1
  };
}
