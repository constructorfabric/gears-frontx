/**
 * MfeRegistry Configuration
 *
 * Configuration interface for creating a MfeRegistry instance.
 * The TypeSystemPlugin is required at initialization.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-frontx-dod-mfe-registry-router-configuration:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-host-configuration:p1

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
   * Optional router conforming to the abstract router `RouterPort`
   * (`cpt-frontx-mfes-interface-router-port`). Where present, the registry
   * connects it to its actions-chain executor and type system once, at
   * construction; registers with it each domain and extension that declares
   * a `route` before the registration becomes durable; starts and stops a
   * domain at its root's attach and detach; obtains each extension's
   * occupant value from it at mount; supplies navigation when it adopts an
   * inbound bridge; issues URL commands to it at a request's acceptance and
   * at its settle; and sends it release notifications for what it admitted.
   * Where absent, the registry makes no router call: it connects nothing,
   * registers nothing, sends no release notification, assigns no occupant
   * value, and issues no command
   * (`cpt-frontx-dod-mfe-registry-router-configuration`).
   */
  router?: RouterPort;

  /**
   * Application-supplied attribute name stamped on each shadow host when an
   * appearance is set. The runtime owns no theme vocabulary. When absent, no
   * appearance attribute is written.
   */
  themeAppearanceAttribute?: string;

  /**
   * Base URL from which the host application is served. The runtime passes
   * this value unchanged without parsing or interpreting it. A screen that
   * builds a nested registry passes its own mount context value here.
   */
  hostBaseUrl?: string;
}
