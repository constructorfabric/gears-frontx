/**
 * Presets - Pre-configured plugin combinations
 *
 * Framework Layer: L2
 */

// @cpt-flow:cpt-frontx-flow-framework-composition-full-preset:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-presets:p1

import type { HAI3Plugin, Presets } from '../types';
import { themes } from '../plugins/themes';
import { layout } from '../plugins/layout';
import { i18n } from '../plugins/i18n';
import { effects } from '../plugins/effects';
import { queryCache } from '../plugins/queryCache';
import { mock } from '../plugins/mock';
import { microfrontends, type MicrofrontendsConfig } from '../plugins/microfrontends';
import { auth, type AuthPluginConfig } from '../plugins/auth';

/**
 * Full preset configuration.
 */
export interface FullPresetConfig {
  /** Configuration for microfrontends plugin */
  microfrontends?: MicrofrontendsConfig;
  /** Optional auth plugin config. When provided, `auth()` is added to the preset. */
  auth?: AuthPluginConfig;
}

/**
 * Full preset - All plugins for the complete FrontX experience.
 * This is the default for `frontx create` projects.
 *
 * Includes:
 * - themes (theme registry, changeTheme action)
 * - layout (all layout domain slices and effects)
 * - i18n (i18n registry, setLanguage action)
 * - effects (effect coordination)
 * - mock (mock mode control for API services)
 * - microfrontends (MFE registry, actions, effects)
 *
 * @param config - Optional preset configuration
 *
 * @example
 * ```typescript
 * import { MfeHandlerMF, FrontX_MFE_ENTRY_MF } from '@gears-frontx/screensets/mfe/handler';
 * import { gtsPlugin } from '@gears-frontx/screensets/plugins/gts';
 *
 * const app = createFrontX()
 *   .use(full({
 *     microfrontends: { typeSystem: gtsPlugin, mfeHandlers: [new MfeHandlerMF(FrontX_MFE_ENTRY_MF)] }
 *   }))
 *   .build();
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1
// @cpt-begin:cpt-frontx-dod-framework-composition-presets:p1:inst-1
export function full(config?: FullPresetConfig): HAI3Plugin[] {
  const plugins: HAI3Plugin[] = [
    effects(),
    themes(),
    layout(),
    i18n(),
    queryCache(),
    mock(),
  ];
  if (config?.microfrontends) {
    plugins.push(microfrontends(config.microfrontends));
  }
  if (config?.auth) {
    plugins.push(auth(config.auth));
  }
  return plugins;
}
// @cpt-end:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1

/**
 * Minimal preset - Themes only.
 * For users who want basic FrontX patterns without full layout management.
 *
 * Includes:
 * - themes (theme registry, changeTheme action)
 */
export function minimal(): HAI3Plugin[] {
  return [
    themes(),
  ];
}
// @cpt-end:cpt-frontx-dod-framework-composition-presets:p1:inst-1

/**
 * Presets collection
 */
export const presets: Presets = {
  full,
  minimal,
};
