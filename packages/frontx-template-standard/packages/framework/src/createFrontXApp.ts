/**
 * createFrontXApp - Convenience function for full FrontX application
 *
 * Creates a fully configured FrontX application using the full preset.
 *
 * Framework Layer: L2
 */

// @cpt-flow:cpt-frontx-flow-framework-composition-full-preset:p1
// @cpt-dod:cpt-frontx-dod-framework-composition-builder:p1

import { createFrontX } from './createFrontX';
import { full, type FullPresetConfig } from './presets';
import type { FrontXConfig, FrontXApp } from './types';

/**
 * Combined configuration for createFrontXApp.
 * Includes both FrontX core config and full preset config.
 */
export interface FrontXAppConfig extends FrontXConfig, FullPresetConfig {}

/**
 * Create a fully configured FrontX application.
 *
 * This is a convenience function that uses the full preset.
 * For custom plugin composition, use `createFrontX()` instead.
 *
 * @param config - Optional application configuration
 * @returns The built FrontX application
 *
 * @example
 * ```typescript
 * // Default - uses full() preset
 * const app = createFrontXApp();
 *
 * // With configuration
 * const app = createFrontXApp({ devMode: true });
 * ```
 */
// @cpt-begin:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1
export function createFrontXApp(config?: FrontXAppConfig): FrontXApp {
  return createFrontX(config)
    .useAll(full({
      auth: config?.auth,
      microfrontends: config?.microfrontends,
    }))
    .build();
}
// @cpt-end:cpt-frontx-flow-framework-composition-full-preset:p1:inst-1
