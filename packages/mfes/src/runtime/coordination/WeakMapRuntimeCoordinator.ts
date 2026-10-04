/**
 * WeakMap-Based Runtime Coordinator
 *
 * Concrete implementation of RuntimeCoordinator using WeakMap for storage.
 * This is an INTERNAL implementation detail and is NOT exported from the package.
 *
 * Key Benefits:
 * - No window global pollution (not accessible via devtools)
 * - Automatic garbage collection when container element is removed
 * - Private encapsulation (WeakMap is private to this class)
 *
 * @packageDocumentation
 */

import { RuntimeCoordinator, type RuntimeConnection } from './RuntimeCoordinator';

/**
 * WeakMap-based runtime coordinator.
 *
 * Uses a private WeakMap to store runtime connections keyed by container elements.
 * When a container element is garbage collected, the WeakMap entry is automatically
 * cleaned up by the JavaScript engine.
 *
 * This is the default coordinator implementation used by MfeRegistry.
 * It is NOT exported from the package - only the abstract RuntimeCoordinator is exported.
 *
 * @internal
 */
export class WeakMapRuntimeCoordinator extends RuntimeCoordinator {
  /**
   * Private WeakMap for runtime coordination.
   *
   * The WeakMap keys on container Elements, so when a container is garbage
   * collected, the RuntimeConnection is automatically cleaned up.
   *
   * @private
   */
  private readonly connections = new WeakMap<Element, RuntimeConnection>();

  /**
   * Register a runtime connection for a container element.
   *
   * @param container - The DOM element containing the MFE
   * @param connection - The runtime connection metadata
   */
  register(container: Element, connection: RuntimeConnection): void {
    this.connections.set(container, connection);
  }

  /**
   * Get the runtime connection for a container element.
   *
   * @param container - The DOM element to lookup
   * @returns The runtime connection, or undefined if not registered
   */
  get(container: Element): RuntimeConnection | undefined {
    return this.connections.get(container);
  }

  /**
   * Unregister a runtime connection for a container element.
   *
   * @param container - The DOM element to unregister
   */
  unregister(container: Element): void {
    this.connections.delete(container);
  }
}
