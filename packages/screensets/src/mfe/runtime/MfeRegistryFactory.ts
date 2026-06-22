/**
 * MfeRegistryFactory - Abstract Factory for MfeRegistry
 *
 * Pure contract for creating MfeRegistry instances.
 * This is a factory-with-cache pattern - the concrete implementation
 * caches the first instance and returns it on subsequent calls.
 *
 * @packageDocumentation
 */

import type { MfeRegistry } from './MfeRegistry';
import type { MfeRegistryConfig } from './config';

/**
 * Abstract factory for creating the MfeRegistry singleton.
 *
 * The build() method accepts configuration and returns the registry instance.
 * After the first build(), subsequent calls return the cached instance.
 *
 * This factory pattern enables TypeSystemPlugin pluggability by deferring
 * the binding of the type system plugin to application wiring time.
 *
 * **Key Principles:**
 * - Pure contract (abstract class) - NO static methods
 * - NO knowledge of DefaultMfeRegistryFactory or DefaultMfeRegistry
 * - Concrete implementation handles caching logic
 *
 * @example
 * ```typescript
 * import { mfeRegistryFactory, gtsPlugin } from '@gears-frontx/screensets';
 *
 * // Build the registry with GTS plugin at application wiring time
 * const registry = mfeRegistryFactory.build({ typeSystem: gtsPlugin });
 * ```
 */
export abstract class MfeRegistryFactory {
  /**
   * Build a MfeRegistry instance with the provided configuration.
   *
   * The concrete implementation caches the first instance and returns it
   * on subsequent calls. If the config changes between calls, the concrete
   * implementation may throw an error (config mismatch detection).
   *
   * @param config - Registry configuration (must include typeSystem)
   * @returns The MfeRegistry singleton instance
   */
  abstract build(config: MfeRegistryConfig): MfeRegistry;
}
