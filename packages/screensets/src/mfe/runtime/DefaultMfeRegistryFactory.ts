/**
 * DefaultMfeRegistryFactory - Concrete Factory Implementation
 *
 * Factory-with-cache implementation for creating MfeRegistry instances.
 * This class is NOT exported from the public barrel - it's an internal
 * implementation detail.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-flow:cpt-frontx-flow-mfe-registry-factory-build:p1
// @cpt-state:cpt-frontx-state-mfe-registry-factory-cache:p1
// @cpt-dod:cpt-frontx-dod-mfe-registry-factory-cache:p1

import { MfeRegistryFactory, type MfeRegistry, type MfeRegistryConfig } from '@gears-frontx/mfes';
import { DefaultMfeRegistry } from './DefaultMfeRegistry';

/**
 * Concrete factory that implements factory-with-cache pattern.
 *
 * After the first build() call, the instance is cached and returned
 * on subsequent calls. If a different config is provided after the
 * first build, an error is thrown (config mismatch detection).
 *
 * This is the ONLY code (besides test files) that imports DefaultMfeRegistry.
 *
 * @internal - Not exported from public barrel
 */
export class DefaultMfeRegistryFactory extends MfeRegistryFactory {
  private instance: MfeRegistry | null = null;
  private cachedConfig: MfeRegistryConfig | null = null;

  /**
   * Build a MfeRegistry instance with the provided configuration.
   *
   * On first call: creates a new DefaultMfeRegistry, caches it, returns it.
   * On subsequent calls: validates config matches cached config, returns cached instance.
   *
   * @param config - Registry configuration (must include typeSystem)
   * @returns The MfeRegistry singleton instance
   * @throws Error if called with different config after first build
   */
  // @cpt-begin:cpt-frontx-flow-mfe-registry-factory-build:p1:inst-1
  // @cpt-begin:cpt-frontx-state-mfe-registry-factory-cache:p1:inst-1
  build(config: MfeRegistryConfig): MfeRegistry {
    if (this.instance) {
      // Instance exists - validate config matches
      if (this.cachedConfig && config.typeSystem !== this.cachedConfig.typeSystem) {
        throw new Error(
          'MfeRegistry already built with a different TypeSystemPlugin. ' +
          'Cannot rebuild with a different configuration. ' +
          `Expected: ${this.cachedConfig.typeSystem.name}, ` +
          `Got: ${config.typeSystem.name}`
        );
      }
      // Config matches - return cached instance
      return this.instance;
    }

    // No instance yet - create, cache, return
    this.cachedConfig = config;
    this.instance = new DefaultMfeRegistry(config);
    return this.instance;
  }
  // @cpt-end:cpt-frontx-flow-mfe-registry-factory-build:p1:inst-1
  // @cpt-end:cpt-frontx-state-mfe-registry-factory-cache:p1:inst-1
}
