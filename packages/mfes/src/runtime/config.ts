/**
 * MfeRegistry Configuration
 *
 * Configuration interface for creating a MfeRegistry instance.
 * The TypeSystemPlugin is required at initialization.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-router-configuration:p1

import type { TypeSystemPlugin } from '../type-substrate';
import type { MfeHandler } from '../handler/MfeHandler';
import type { RuntimeCoordinator } from './coordination/RuntimeCoordinator';
import type { RouterPort } from '../router/RouterPort';

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
   * import { createMfeRegistryFactory } from '@gears-frontx/mfes';
   * import { gtsPlugin } from '@gears-frontx/gts-plugin';
   *
   * // Build the registry with GTS plugin at application wiring time
   * const registry = createMfeRegistryFactory().build({ typeSystem: gtsPlugin });
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

  /**
   * Optional router implementing the router port (`cpt-frontx-mfes-interface-router-port`).
   * Where present, the registry presents each domain and extension
   * registration to it before the registration becomes durable, obtains
   * each extension's occupant value from it at mount, reports each settled
   * `mount_ext`/`unmount_ext` execution to it, and sends it release
   * notifications on unregistration and disposal. Where absent, the
   * registry runs every extension standalone: it presents no registration,
   * sends no release notification, assigns no occupant value, and reports
   * no settled action to anyone (`cpt-frontx-dod-mfe-registry-router-configuration`).
   */
  router?: RouterPort;
}
