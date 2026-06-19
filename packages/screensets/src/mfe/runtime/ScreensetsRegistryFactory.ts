/**
 * ScreensetsRegistryFactory - Abstract Factory for ScreensetsRegistry
 *
 * Pure contract for creating ScreensetsRegistry instances.
 * This is a factory-with-cache pattern - the concrete implementation
 * caches the first instance and returns it on subsequent calls.
 *
 * @packageDocumentation
 */

import type { ScreensetsRegistry } from './ScreensetsRegistry';
import type { ScreensetsRegistryConfig } from './config';

/**
 * Abstract factory for creating the ScreensetsRegistry singleton.
 *
 * The build() method accepts configuration and returns the registry instance.
 * After the first build(), subsequent calls return the cached instance.
 *
 * This factory pattern enables TypeSystemPlugin pluggability by deferring
 * the binding of the type system plugin to application wiring time.
 *
 * **Key Principles:**
 * - Pure contract (abstract class) - NO static methods
 * - NO knowledge of DefaultScreensetsRegistryFactory or DefaultScreensetsRegistry
 * - Concrete implementation handles caching logic
 *
 * @example
 * ```typescript
 * import { screensetsRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
 *
 * // Build the registry with GTS plugin at application wiring time
 * const registry = screensetsRegistryFactory.build({ typeSystem: gtsPlugin });
 * ```
 */
export abstract class ScreensetsRegistryFactory {
  /**
   * Build a ScreensetsRegistry instance with the provided configuration.
   *
   * The concrete implementation caches the first instance and returns it
   * on subsequent calls. If the config changes between calls, the concrete
   * implementation may throw an error (config mismatch detection).
   *
   * @param config - Registry configuration (must include typeSystem)
   * @returns The ScreensetsRegistry singleton instance
   */
  abstract build(config: ScreensetsRegistryConfig): ScreensetsRegistry;
}
