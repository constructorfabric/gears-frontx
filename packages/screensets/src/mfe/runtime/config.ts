/**
 * ScreensetsRegistry Configuration
 *
 * Configuration interface for creating a ScreensetsRegistry instance.
 * The TypeSystemPlugin is required at initialization.
 *
 * @packageDocumentation
 */

import type { TypeSystemPlugin } from '../plugins/types';
import type { MfeHandler } from '../handler/types';

/**
 * Configuration for creating a ScreensetsRegistry instance.
 *
 * The TypeSystemPlugin is REQUIRED at initialization - the registry cannot
 * function without it. All type validation, schema operations, and contract
 * matching depend on the plugin.
 */
export interface ScreensetsRegistryConfig {
  /**
   * Type System plugin instance (REQUIRED).
   *
   * This plugin handles all type operations:
   * - Type ID validation and parsing
   * - Schema registration and retrieval
   * - Instance validation
   * - Type hierarchy checks
   *
   * @example
   * ```typescript
   * import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
   *
   * // Build the registry with GTS plugin at application wiring time
   * const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
   *
   * // Use the registry with container provider
   * registry.registerDomain(myDomain, containerProvider);
   * ```
   */
  typeSystem: TypeSystemPlugin;

  /**
   * Optional MFE handler instances.
   * If provided, these handlers will be registered with the registry.
   *
   * Note: The default MfeHandlerMF is NOT automatically registered.
   * Applications must explicitly provide handlers they want to use.
   */
  mfeHandlers?: MfeHandler[];
}
