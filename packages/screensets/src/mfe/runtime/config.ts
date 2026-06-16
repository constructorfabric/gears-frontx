/**
 * MfeRegistry Configuration
 *
 * Configuration interface for creating a MfeRegistry instance.
 * The TypeSystemPlugin is required at initialization.
 *
 * @packageDocumentation
 */

import type { TypeSystemPlugin } from '../plugins/types';
import type { MfeHandler } from '../handler/types';
import type { RuntimeCoordinator } from '../coordination/types';

/**
 * Configuration for creating a MfeRegistry instance.
 *
 * The TypeSystemPlugin is REQUIRED at initialization - the registry cannot
 * function without it. All type validation, schema operations, and contract
 * matching depend on the plugin.
 */
export interface MfeRegistryConfig {
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
   * import { mfeRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
   *
   * // Build the registry with GTS plugin at application wiring time
   * const registry = mfeRegistryFactory.build({ typeSystem: gtsPlugin });
   *
   * // Use the registry with container provider
   * registry.registerDomain(myDomain, containerProvider);
   * ```
   */
  typeSystem: TypeSystemPlugin;

  /**
   * Optional runtime coordinator implementation.
   * If omitted, the registry uses `WeakMapRuntimeCoordinator`.
   *
   * This is primarily useful for tests and advanced host integrations that need
   * to control how runtime connections are stored and resolved.
   */
  coordinator?: RuntimeCoordinator;

  /**
   * Optional MFE handler instances.
   * If provided, these handlers will be registered with the registry.
   *
   * Note: The default MfeHandlerMF is NOT automatically registered.
   * Applications must explicitly provide handlers they want to use.
   */
  mfeHandlers?: MfeHandler[];
}
