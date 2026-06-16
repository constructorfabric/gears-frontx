/**
 * API Registry - Central registry for API services
 *
 * Manages service registration, instantiation, and mock mode.
 * Services self-register via module augmentation.
 *
 * SDK Layer: L1 (Zero @gears-frontx dependencies)
 */

// @cpt-dod:cpt-frontx-dod-api-communication-registry:p1
// @cpt-flow:cpt-frontx-flow-api-communication-service-registration:p1
// @cpt-flow:cpt-frontx-flow-api-communication-global-plugin:p1
// @cpt-flow:cpt-frontx-flow-api-communication-mock-activation:p2

import type {
  ApiRegistry as IApiRegistry,
  ApiServicesConfig,
} from './types';
import { BaseApiService } from './BaseApiService';
import { protocolPluginRegistry } from './protocolPluginRegistry';

/**
 * Default API configuration.
 */
const DEFAULT_CONFIG: ApiServicesConfig = {
  // Empty - mock config removed (OCP/DIP - now in MockPluginConfig)
};

/**
 * ApiRegistry Implementation
 *
 * Central registry for all API service instances.
 * Type-safe via class-based registration.
 *
 * @example
 * ```typescript
 * // Register a service by class
 * apiRegistry.register(AccountsApiService);
 *
 * // Initialize
 * apiRegistry.initialize();
 *
 * // Get service (type-safe)
 * const accounts = apiRegistry.getService(AccountsApiService);
 * ```
 */
class ApiRegistryImpl implements IApiRegistry {
  /** Service instances by class constructor */
  private services: Map<new () => BaseApiService, BaseApiService> = new Map();

  /** Configuration */
  private config: ApiServicesConfig = { ...DEFAULT_CONFIG };

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Register an API service by class reference.
   * Service is instantiated immediately.
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-service-registration:p1:inst-1
  register<T extends BaseApiService>(serviceClass: new () => T): void {
    // Instantiate service
    const service = new serviceClass();

    // Store with class as key
    this.services.set(serviceClass, service);
  }
  // @cpt-end:cpt-frontx-flow-api-communication-service-registration:p1:inst-1

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the registry with configuration.
   * Services are already instantiated during register().
   */
  // @cpt-begin:cpt-frontx-dod-api-communication-registry:p1:inst-initialize
  initialize(config?: ApiServicesConfig): void {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
  }
  // @cpt-end:cpt-frontx-dod-api-communication-registry:p1:inst-initialize

  // ============================================================================
  // Service Access
  // ============================================================================

  /**
   * Get service by class reference.
   * Returns typed service instance.
   * Throws if service is not registered.
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-service-registration:p1:inst-2
  getService<T extends BaseApiService>(serviceClass: new () => T): T {
    const service = this.services.get(serviceClass);

    if (!service) {
      throw new Error(
        `Service not found. Did you forget to call apiRegistry.register(${serviceClass.name})?`
      );
    }

    return service as T;
  }
  // @cpt-end:cpt-frontx-flow-api-communication-service-registration:p1:inst-2

  /**
   * Check if service is registered.
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-service-registration:p1:inst-has
  has<T extends BaseApiService>(serviceClass: new () => T): boolean {
    return this.services.has(serviceClass);
  }
  // @cpt-end:cpt-frontx-flow-api-communication-service-registration:p1:inst-has

  /**
   * Get all registered service instances.
   * Used by framework effects to iterate services for plugin management.
   *
   * @returns Readonly array of all registered BaseApiService instances
   *
   * @example
   * ```typescript
   * // Framework code
   * for (const service of apiRegistry.getAll()) {
   *   const plugins = service.getPlugins();
   *   // Process plugins...
   * }
   * ```
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-service-registration:p1:inst-get-all
  getAll(): readonly BaseApiService[] {
    return Array.from(this.services.values());
  }
  // @cpt-end:cpt-frontx-flow-api-communication-service-registration:p1:inst-get-all

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get current configuration.
   */
  // @cpt-begin:cpt-frontx-dod-api-communication-registry:p1:inst-get-config
  getConfig(): Readonly<ApiServicesConfig> {
    return { ...this.config };
  }
  // @cpt-end:cpt-frontx-dod-api-communication-registry:p1:inst-get-config

  // ============================================================================
  // Protocol Plugin Management
  // ============================================================================

  /**
   * Plugin management namespace for protocol-specific plugins.
   * Provides OCP-compliant API using protocol class as parameter.
   *
   * @example
   * ```typescript
   * // Add plugin for RestProtocol
   * apiRegistry.plugins.add(RestProtocol, new AuthPlugin({ getToken }));
   *
   * // Add plugin for SseProtocol
   * apiRegistry.plugins.add(SseProtocol, new SseAuthPlugin({ getToken }));
   *
   * // Remove plugin by class
   * apiRegistry.plugins.remove(RestProtocol, AuthPlugin);
   *
   * // Check if plugin exists
   * apiRegistry.plugins.has(RestProtocol, AuthPlugin);
   *
   * // Get all plugins for protocol
   * const restPlugins = apiRegistry.plugins.getAll(RestProtocol);
   *
   * // Clear all plugins for protocol
   * apiRegistry.plugins.clear(RestProtocol);
   * ```
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-global-plugin:p1:inst-1
  public readonly plugins = {
    /**
     * Add a plugin for a specific protocol.
     * Creates plugin set for protocol if it doesn't exist.
     *
     * @template T - Protocol type
     * @param protocolClass - Protocol constructor (e.g., RestProtocol, SseProtocol)
     * @param plugin - Plugin instance implementing protocol's hooks
     */
    add: protocolPluginRegistry.add.bind(protocolPluginRegistry),

    /**
     * Remove a plugin from a protocol by plugin class.
     * Calls destroy() on the plugin if available.
     *
     * @template T - Protocol type
     * @param protocolClass - Protocol constructor
     * @param pluginClass - Plugin class constructor
     */
    remove: protocolPluginRegistry.remove.bind(protocolPluginRegistry),

    /**
     * Check if a plugin of given class is registered for a protocol.
     *
     * @template T - Protocol type
     * @param protocolClass - Protocol constructor
     * @param pluginClass - Plugin class constructor
     * @returns True if plugin of this class is registered
     */
    has: protocolPluginRegistry.has.bind(protocolPluginRegistry),

    /**
     * Get all plugins for a protocol.
     * Returns readonly array to prevent external modification.
     *
     * @template T - Protocol type
     * @param protocolClass - Protocol constructor
     * @returns Readonly array of plugins for this protocol
     */
    getAll: protocolPluginRegistry.getAll.bind(protocolPluginRegistry),

    /**
     * Clear all plugins for a protocol.
     * Calls destroy() on each plugin if available.
     *
     * @template T - Protocol type
     * @param protocolClass - Protocol constructor
     */
    clear: protocolPluginRegistry.clear.bind(protocolPluginRegistry),
  };
  // @cpt-end:cpt-frontx-flow-api-communication-global-plugin:p1:inst-1

  // ============================================================================
  // Reset (for testing)
  // ============================================================================

  /**
   * Reset the registry to initial state.
   * Primarily used for testing.
   *
   * @internal
   */
  // @cpt-begin:cpt-frontx-dod-api-communication-registry:p1:inst-reset
  reset(): void {
    // Cleanup all services
    this.services.forEach((service) => {
      if (service instanceof BaseApiService) {
        service.cleanup();
      }
    });

    this.services.clear();
    protocolPluginRegistry.reset();
    this.config = { ...DEFAULT_CONFIG };
  }
  // @cpt-end:cpt-frontx-dod-api-communication-registry:p1:inst-reset
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default API registry instance.
 * Use this instance throughout the application.
 *
 * For micro-frontend isolation, each micro-frontend should bundle its own
 * instance of @gears-frontx/api package, which provides natural isolation.
 */
export const apiRegistry = new ApiRegistryImpl();
