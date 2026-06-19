/**
 * MFE Runtime - ScreensetsRegistry Factory and Configuration
 *
 * This module exports the core runtime components for the MFE system.
 *
 * Key exports:
 * - ScreensetsRegistry (abstract class) - The public API contract
 * - ScreensetsRegistryFactory (abstract class) - Factory contract
 * - screensetsRegistryFactory (singleton) - Factory instance for building registry
 * - ScreensetsRegistryConfig (interface) - Registry configuration
 *
 * NOTE: DefaultScreensetsRegistry and DefaultScreensetsRegistryFactory (concrete classes)
 * are NOT exported. They are internal implementation details.
 *
 * @packageDocumentation
 */

import { DefaultScreensetsRegistryFactory } from './DefaultScreensetsRegistryFactory';
import type { ScreensetsRegistryFactory } from './ScreensetsRegistryFactory';

export { ScreensetsRegistry } from './ScreensetsRegistry';
export { ScreensetsRegistryFactory } from './ScreensetsRegistryFactory';
export { ContainerProvider } from './container-provider';
export type { ScreensetsRegistryConfig } from './config';

/**
 * Singleton ScreensetsRegistryFactory instance.
 *
 * This is the primary way to obtain a ScreensetsRegistry instance.
 * The factory accepts configuration (including TypeSystemPlugin) and returns
 * the registry singleton. After the first build(), subsequent calls return
 * the cached instance.
 *
 * This factory pattern enables TypeSystemPlugin pluggability by deferring
 * the binding of the type system plugin to application wiring time.
 *
 * @example
 * ```typescript
 * import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
 *
 * // Build the registry with GTS plugin at application wiring time
 * const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
 *
 * // Register a domain with container provider
 * registry.registerDomain(myDomain, containerProvider);
 *
 * // Register an extension
 * await registry.registerExtension(myExtension);
 * ```
 */
export const screensetsRegistryFactory: ScreensetsRegistryFactory = new DefaultScreensetsRegistryFactory();
