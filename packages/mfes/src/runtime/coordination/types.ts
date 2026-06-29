/**
 * Runtime Coordinator Types
 *
 * Defines the abstract coordinator interface for managing runtime connections
 * between parent and MFE runtimes. This follows FrontX's SOLID OOP pattern:
 * abstract class (exportable contract) + concrete implementation (private).
 *
 * @packageDocumentation
 */

import type { MfeRegistry } from '../../registry/MfeRegistry';
import type { ParentMfeBridge } from '../../handler/types';

/**
 * Runtime connection metadata stored per container element.
 *
 * Contains the parent runtime and all bridges for MFE instances
 * mounted in this container.
 */
export interface RuntimeConnection {
  /**
   * Reference to the parent (host) MfeRegistry runtime.
   * This allows MFE instances to coordinate with their parent.
   */
  hostRuntime: MfeRegistry;

  /**
   * Map of entry type IDs to their corresponding bridges.
   * Multiple MFE instances can be mounted in the same container,
   * each with its own bridge.
   */
  bridges: Map<string, ParentMfeBridge>;
}

/**
 * Abstract coordinator for managing runtime connections.
 *
 * This is the exportable abstraction that defines the contract for
 * runtime coordination. Concrete implementations (like WeakMapRuntimeCoordinator)
 * encapsulate the actual storage mechanism.
 *
 * Key Benefits:
 * - Dependency Inversion: MfeRegistry depends on abstraction, not concrete implementation
 * - Testability: Can inject mock coordinators for testing
 * - Encapsulation: Storage mechanism is hidden in concrete class
 *
 * @example
 * ```typescript
 * class MfeRegistry {
 *   private readonly coordinator: RuntimeCoordinator;
 *
 *   constructor(config: MfeRegistryConfig) {
 *     this.coordinator = config.coordinator ?? new WeakMapRuntimeCoordinator();
 *   }
 * }
 * ```
 */
export abstract class RuntimeCoordinator {
  /**
   * Register a runtime connection for a container element.
   *
   * This is called internally when an MFE is mounted to establish
   * the coordination link between parent and child runtimes.
   *
   * @param container - The DOM element containing the MFE
   * @param connection - The runtime connection metadata
   */
  abstract register(container: Element, connection: RuntimeConnection): void;

  /**
   * Get the runtime connection for a container element.
   *
   * This is used internally to lookup coordination information
   * when delivering actions or propagating property updates.
   *
   * @param container - The DOM element to lookup
   * @returns The runtime connection, or undefined if not registered
   */
  abstract get(container: Element): RuntimeConnection | undefined;

  /**
   * Unregister a runtime connection for a container element.
   *
   * This is called internally when an MFE is unmounted to cleanup
   * the coordination link.
   *
   * @param container - The DOM element to unregister
   */
  abstract unregister(container: Element): void;
}
