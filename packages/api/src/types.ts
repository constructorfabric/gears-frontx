/**
 * @gears-frontx/api - Type Definitions
 *
 * Core types for HAI3 API communication.
 * Supports REST, SSE, and mock protocols.
 */

// @cpt-dod:cpt-hai3-dod-api-communication-plugin-types:p1
// @cpt-algo:cpt-hai3-algo-api-communication-is-mock-plugin:p2
// @cpt-state:cpt-hai3-state-api-communication-mock-mode:p2

import type { BaseApiService } from './BaseApiService';

// ============================================================================
// JSON Types
// ============================================================================

/**
 * JSON-serializable primitive value
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON-serializable value (recursive)
 */
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * JSON object type
 */
export type JsonObject = { [key: string]: JsonValue };

/**
 * JSON-compatible type
 * Broader than JsonValue to accept objects without index signatures.
 * Intentionally permissive to avoid type errors while maintaining runtime JSON-serializability.
 */
export type JsonCompatible = JsonValue | object;

// ============================================================================
// Mock Types
// ============================================================================

/**
 * Mock Plugin Symbol
 * Symbol marker for identifying mock plugins in an OCP-compliant way.
 * Any plugin class can be marked as a mock plugin by adding this symbol as a static property.
 *
 * @example
 * ```typescript
 * class CustomMockPlugin extends ApiPluginBase {
 *   static readonly [MOCK_PLUGIN] = true;
 * }
 * ```
 */
export const MOCK_PLUGIN = Symbol.for('hai3:plugin:mock');

/**
 * Mock Plugin Type Guard
 * Checks if a plugin is marked as a mock plugin using the MOCK_PLUGIN symbol.
 * Framework uses this to identify and manage mock plugins based on mock mode state.
 *
 * @param plugin - Plugin instance to check
 * @returns True if plugin is marked as a mock plugin
 *
 * @example
 * ```typescript
 * const plugin = new RestMockPlugin({ mockMap: {} });
 * if (isMockPlugin(plugin)) {
 *   console.log('This is a mock plugin');
 * }
 * ```
 */
// @cpt-begin:cpt-hai3-algo-api-communication-is-mock-plugin:p2:inst-1
export function isMockPlugin(plugin: unknown): boolean {
  if (!plugin || typeof plugin !== 'object') return false;
  const constructor = (plugin as object).constructor;
  return MOCK_PLUGIN in constructor;
}
// @cpt-end:cpt-hai3-algo-api-communication-is-mock-plugin:p2:inst-1

/**
 * Mock Response Factory Function
 * Generic function that accepts a request and returns a response.
 *
 * @template TRequest - The request data type
 * @template TResponse - The response data type
 */
export type MockResponseFactory<TRequest = JsonValue, TResponse = JsonValue> = (
  requestData?: TRequest
) => TResponse;

/**
 * Mock Map
 * Maps endpoint keys to response factories.
 *
 * @example
 * ```typescript
 * const mockMap: MockMap = {
 *   'GET /users': () => [{ id: '1', name: 'John' }],
 *   'POST /users': (data) => ({ id: '2', ...data }),
 * };
 * ```
 */
export type MockMap = Record<string, MockResponseFactory<JsonValue, JsonCompatible>>;

// ============================================================================
// API Service Configuration
// ============================================================================

/**
 * API Service Configuration
 * Configuration options for an API service.
 */
export interface ApiServiceConfig {
  /** Base URL for API requests */
  baseURL: string;
  /** Default headers for all requests */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * API Services Global Configuration
 * Global configuration for all API services.
 */
export interface ApiServicesConfig {
  // Empty - mock config removed (OCP/DIP - now in MockPluginConfig)
}

// ============================================================================
// API Protocol Abstract Class
// ============================================================================

/**
 * API Protocol Abstract Class
 * Base class for all API communication protocols.
 * Generic TPlugin parameter defines the protocol's plugin hook type.
 *
 * @template TPlugin - Plugin hooks type for this protocol (e.g., RestPluginHooks)
 *
 * @example
 * ```typescript
 * class RestProtocol extends ApiProtocol<RestPluginHooks> { ... }
 * class SseProtocol extends ApiProtocol<SsePluginHooks> { ... }
 * ```
 */
export abstract class ApiProtocol<TPlugin extends BasePluginHooks = BasePluginHooks> {
  /**
   * Initialize the protocol with configuration.
   *
   * @param config - Base service configuration
   * @param getExcludedClasses - Function to access excluded global plugin classes
   */
  abstract initialize(
    config: Readonly<ApiServiceConfig>,
    getExcludedClasses?: () => ReadonlySet<PluginClass>
  ): void;

  /**
   * Get plugins in execution order.
   * Returns the protocol's specific plugin type.
   */
  abstract getPluginsInOrder(): readonly TPlugin[];

  /**
   * Cleanup protocol resources.
   */
  abstract cleanup(): void;
}

/**
 * REST Protocol Configuration
 * Configuration options for REST protocol.
 */
export interface RestProtocolConfig {
  /** Whether to include credentials */
  withCredentials?: boolean;
  /** Content type header */
  contentType?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry depth to prevent infinite loops (default: 10) */
  maxRetryDepth?: number;
}

/**
 * SSE Protocol Configuration
 * Configuration options for Server-Sent Events protocol.
 */
export interface SseProtocolConfig {
  /** Whether to include credentials */
  withCredentials?: boolean;
  /** Number of reconnect attempts */
  reconnectAttempts?: number;
}

// ============================================================================
// API Plugin Interface
// ============================================================================

/**
 * HTTP Method
 * Standard HTTP methods used in REST APIs.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * API Request Context
 * Pure request data passed to plugins during request lifecycle.
 * Contains only request information - no service-specific metadata.
 * Plugins use dependency injection for service-specific behavior.
 */
export interface ApiRequestContext {
  /** HTTP method */
  readonly method: HttpMethod;
  /** Request URL */
  readonly url: string;
  /** Request headers */
  readonly headers: Record<string, string>;
  /** Request body */
  readonly body?: unknown;
}

/**
 * API Response Context
 * Response data passed to plugins during response lifecycle.
 */
export interface ApiResponseContext {
  /** HTTP status code */
  readonly status: number;
  /** Response headers */
  readonly headers: Record<string, string>;
  /** Response data */
  readonly data: unknown;
}

/**
 * Short Circuit Response
 * Returned by plugins to skip HTTP request and provide immediate response.
 *
 * @example
 * ```typescript
 * class MockPlugin extends ApiPlugin<MockPluginConfig> {
 *   async onRequest(ctx: ApiRequestContext): Promise<ApiRequestContext | ShortCircuitResponse> {
 *     const mockData = this.findMock(ctx.url);
 *     if (mockData) {
 *       return {
 *         shortCircuit: {
 *           status: 200,
 *           headers: { 'x-hai3-short-circuit': 'true' },
 *           data: mockData
 *         }
 *       };
 *     }
 *     return ctx;
 *   }
 * }
 * ```
 */
export interface ShortCircuitResponse {
  /** Response to return immediately, skipping HTTP request */
  readonly shortCircuit: ApiResponseContext;
}

/**
 * API Plugin Base Class
 * Abstract base class for all API plugins.
 * Non-generic class used for storage in arrays and maps.
 *
 * @example
 * ```typescript
 * class LoggingPlugin extends ApiPluginBase {
 *   onRequest(ctx) {
 *     console.log(`Request: ${ctx.method} ${ctx.url}`);
 *     return ctx;
 *   }
 *
 *   onResponse(ctx) {
 *     console.log(`Response: ${ctx.status}`);
 *     return ctx;
 *   }
 * }
 * ```
 */
export abstract class ApiPluginBase {
  /**
   * Called before request is sent.
   * Can modify the request context or short-circuit with immediate response.
   *
   * @param context - Request context
   * @returns Modified request context, short-circuit response, or Promise
   */
  onRequest?(
    context: ApiRequestContext
  ): ApiRequestContext | ShortCircuitResponse | Promise<ApiRequestContext | ShortCircuitResponse>;

  /**
   * Called after response is received.
   * Can modify the response context.
   *
   * @param context - Response context
   * @returns Modified response context (or Promise)
   */
  onResponse?(
    context: ApiResponseContext
  ): ApiResponseContext | Promise<ApiResponseContext>;

  /**
   * Called when an error occurs.
   * Can transform the error or provide a recovery response.
   *
   * @param error - The error that occurred
   * @param context - Request context at time of error
   * @returns Modified error, recovery response, or Promise
   *
   * @deprecated Use protocol-specific plugin classes (RestPlugin, SsePlugin) with typed error contexts instead
   */
  onError?(
    error: Error,
    context: ApiRequestContext
  ): Error | ApiResponseContext | Promise<Error | ApiResponseContext>;

  /**
   * Called when plugin is removed or registry is reset.
   * Use for cleanup of resources.
   */
  destroy?(): void;
}

/**
 * API Plugin Generic Class
 * Generic abstract class extending ApiPluginBase with typed configuration.
 * Use this when your plugin needs configuration passed via constructor.
 *
 * @template TConfig - Configuration type (defaults to void for no config)
 *
 * @example
 * ```typescript
 * interface AuthConfig {
 *   getToken: () => string;
 * }
 *
 * class AuthPlugin extends ApiPlugin<AuthConfig> {
 *   onRequest(ctx) {
 *     ctx.headers['Authorization'] = `Bearer ${this.config.getToken()}`;
 *     return ctx;
 *   }
 * }
 *
 * // With config - use RestPluginWithConfig for REST protocol
 * class AuthPlugin extends RestPluginWithConfig<AuthConfig> {
 *   onRequest(ctx) {
 *     return { ...ctx, headers: { ...ctx.headers, Authorization: `Bearer ${this.config.getToken()}` } };
 *   }
 * }
 * apiRegistry.plugins.add(RestProtocol, new AuthPlugin({ getToken: () => 'token' }));
 * ```
 */
export abstract class ApiPlugin<TConfig = void> extends ApiPluginBase {
  constructor(protected readonly config: TConfig) {
    super();
  }
}

/**
 * Plugin Class Type
 * Type for plugin class references (abstract constructors).
 * Used for plugin identification and storage.
 *
 * @template T - Plugin type (defaults to ApiPluginBase)
 *
 * @example
 * ```typescript
 * const pluginClass: PluginClass<AuthPlugin> = AuthPlugin;
 * apiRegistry.plugins.has(RestProtocol, pluginClass);
 * ```
 */
export type PluginClass<T extends ApiPluginBase = ApiPluginBase> = abstract new (...args: never[]) => T;

/**
 * Short Circuit Type Guard
 * Checks if a plugin result is a short-circuit response.
 *
 * @param result - Plugin onRequest result
 * @returns True if result is a short-circuit response
 *
 * @example
 * ```typescript
 * const result = await plugin.onRequest?.(ctx);
 * if (isShortCircuit(result)) {
 *   return result.shortCircuit;
 * }
 * ```
 */
export function isShortCircuit(
  result: ApiRequestContext | ShortCircuitResponse | undefined
): result is ShortCircuitResponse {
  return result !== undefined && 'shortCircuit' in result;
}

// ============================================================================
// Protocol-Specific Plugin Types
// ============================================================================

/**
 * REST Request Context
 * Context passed to REST protocol plugins during request lifecycle.
 */
export interface RestRequestContext {
  /** HTTP method */
  readonly method: HttpMethod;
  /** Request URL */
  readonly url: string;
  /** Request headers */
  readonly headers: Record<string, string>;
  /** Request body */
  readonly body?: unknown;
}

/**
 * SSE Connect Context
 * Context passed to SSE protocol plugins during connection lifecycle.
 */
export interface SseConnectContext {
  /** SSE endpoint URL */
  readonly url: string;
  /** Connection headers */
  readonly headers: Record<string, string>;
}

/**
 * Base Plugin Hooks Interface
 * Common interface for all protocol plugin hooks.
 * OCP-compliant: new protocols extend this without modifying existing code.
 */
export interface BasePluginHooks {
  /**
   * Called when plugin is removed or protocol is cleaned up.
   * Use for cleanup of resources.
   */
  destroy(): void;
}

/**
 * REST Plugin Hooks Interface
 * Hook methods for REST protocol plugins.
 */
export interface RestPluginHooks extends BasePluginHooks {
  /**
   * Called before REST request is sent.
   * Can modify the request context or short-circuit with immediate response.
   *
   * @param context - REST request context
   * @returns Modified request context, short-circuit response, or Promise
   */
  onRequest?(
    context: RestRequestContext
  ): RestRequestContext | RestShortCircuitResponse | Promise<RestRequestContext | RestShortCircuitResponse>;

  /**
   * Called after REST response is received.
   * Can modify the response context.
   *
   * @param context - REST response context
   * @returns Modified response context (or Promise)
   */
  onResponse?(
    context: RestResponseContext
  ): RestResponseContext | Promise<RestResponseContext>;

  /**
   * Called when a REST error occurs.
   * Can transform the error, provide a recovery response, or retry the request.
   *
   * @param context - Error context with retry support
   * @returns Modified error, recovery response, or Promise
   */
  onError?(
    context: ApiPluginErrorContext
  ): Error | RestResponseContext | Promise<Error | RestResponseContext>;

}

/**
 * SSE Plugin Hooks Interface
 * Hook methods for SSE protocol plugins.
 */
export interface SsePluginHooks extends BasePluginHooks {
  /**
   * Called before SSE connection is established.
   * Can modify the connection context or short-circuit with mock EventSource.
   *
   * @param context - SSE connection context
   * @returns Modified connection context, short-circuit response, or Promise
   */
  onConnect?(
    context: SseConnectContext
  ): SseConnectContext | SseShortCircuitResponse | Promise<SseConnectContext | SseShortCircuitResponse>;

  /**
   * Called for each SSE event received.
   * Can modify or filter the event.
   *
   * @param event - The SSE message event
   * @returns Modified event or void (or Promise)
   */
  onEvent?(
    event: MessageEvent
  ): MessageEvent | void | Promise<MessageEvent | void>;

  /**
   * Called when SSE connection is closed.
   * Can perform cleanup or logging.
   *
   * @param connectionId - The connection ID
   */
  onDisconnect?(
    connectionId: string
  ): void | Promise<void>;
}

/**
 * REST Response Context
 * Response data passed to REST plugins during response lifecycle.
 */
export interface RestResponseContext {
  /** HTTP status code */
  readonly status: number;
  /** Response headers */
  readonly headers: Record<string, string>;
  /** Response data */
  readonly data: unknown;
}

/**
 * API Plugin Error Context
 * Context passed to REST plugin onError hooks with retry support.
 * Enables plugins to retry failed requests with optional context modifications.
 *
 * @example
 * ```typescript
 * class AuthPlugin extends RestPluginWithConfig<{ getToken: () => string }> {
 *   async onError({ error, request, retry, retryCount }: ApiPluginErrorContext) {
 *     // Retry once on 401 with refreshed token
 *     if (this.is401(error) && retryCount === 0) {
 *       const newToken = await this.refreshToken();
 *       return retry({
 *         headers: { ...request.headers, Authorization: `Bearer ${newToken}` }
 *       });
 *     }
 *     return error;
 *   }
 * }
 * ```
 */
export interface ApiPluginErrorContext {
  /** The error that occurred */
  readonly error: Error;
  /** Request context at time of error */
  readonly request: RestRequestContext;
  /** Current retry depth (0 for original request) */
  readonly retryCount: number;
  /**
   * Retry the request with optional modifications.
   * Executes full plugin chain on retry.
   * @param modifiedRequest - Optional partial request context to merge with original
   * @returns Promise resolving to response context
   */
  retry: (modifiedRequest?: Partial<RestRequestContext>) => Promise<RestResponseContext>;
}

/**
 * REST Short Circuit Response
 * Returned by REST plugins to skip HTTP request and provide immediate response.
 */
export interface RestShortCircuitResponse {
  /** Response to return immediately, skipping HTTP request */
  readonly shortCircuit: RestResponseContext;
}

/**
 * EventSource-like Interface
 * Minimal interface matching EventSource API for SSE mocking.
 * Allows plugins to provide mock EventSource implementations.
 */
export interface EventSourceLike {
  /** Current ready state */
  readonly readyState: number;
  /** Event handler for open event */
  onopen: ((this: EventSource, ev: Event) => void) | null;
  /** Event handler for message event */
  onmessage: ((this: EventSource, ev: MessageEvent) => void) | null;
  /**
   * Event handler for error event.
   * Uses union type for compatibility - real EventSource uses ErrorEvent,
   * but MockEventSource uses Event. Both are acceptable.
   */
  onerror: ((this: EventSource, ev: Event | ErrorEvent) => void) | null;
  /** Add event listener */
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  /** Remove event listener */
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  /** Close the connection */
  close(): void;
}

/**
 * SSE Short Circuit Response
 * Returned by SSE plugins to skip real EventSource and provide mock implementation.
 */
export interface SseShortCircuitResponse {
  /** Mock EventSource to use instead of real connection */
  readonly shortCircuit: EventSourceLike;
}

/**
 * REST Short Circuit Type Guard
 * Checks if a plugin result is a REST short-circuit response.
 *
 * @param result - Plugin onRequest result
 * @returns True if result is a REST short-circuit response
 */
export function isRestShortCircuit(
  result: RestRequestContext | RestShortCircuitResponse | undefined
): result is RestShortCircuitResponse {
  return result !== undefined && 'shortCircuit' in result && typeof (result as RestShortCircuitResponse).shortCircuit === 'object' && 'status' in (result as RestShortCircuitResponse).shortCircuit;
}

/**
 * SSE Short Circuit Type Guard
 * Checks if a plugin result is an SSE short-circuit response.
 *
 * @param result - Plugin onConnect result
 * @returns True if result is an SSE short-circuit response
 */
export function isSseShortCircuit(
  result: SseConnectContext | SseShortCircuitResponse | undefined
): result is SseShortCircuitResponse {
  return result !== undefined && 'shortCircuit' in result && typeof (result as SseShortCircuitResponse).shortCircuit === 'object' && 'close' in (result as SseShortCircuitResponse).shortCircuit;
}

// ============================================================================
// Protocol-Specific Plugin Convenience Classes
// ============================================================================

/**
 * REST Plugin Base Class
 * Convenience class for REST protocol plugins without configuration.
 * Implements RestPluginHooks without extending ApiPluginBase to avoid signature conflicts.
 *
 * @example
 * ```typescript
 * class LoggingPlugin extends RestPlugin {
 *   onRequest(ctx: RestRequestContext): RestRequestContext {
 *     console.log(`[REST] ${ctx.method} ${ctx.url}`);
 *     return ctx;
 *   }
 * }
 * ```
 */
export abstract class RestPlugin implements RestPluginHooks {
  /** Default destroy implementation - override if cleanup needed */
  destroy(): void {
    // Override in subclass if cleanup needed
  }
}

/**
 * REST Plugin With Config
 * Convenience class for REST protocol plugins with typed configuration.
 * Implements RestPluginHooks without extending ApiPluginBase to avoid signature conflicts.
 *
 * @template TConfig - Configuration type
 *
 * @example
 * ```typescript
 * interface AuthConfig {
 *   getToken: () => string;
 * }
 *
 * class AuthPlugin extends RestPluginWithConfig<AuthConfig> {
 *   onRequest(ctx: RestRequestContext): RestRequestContext {
 *     return {
 *       ...ctx,
 *       headers: {
 *         ...ctx.headers,
 *         Authorization: `Bearer ${this.config.getToken()}`,
 *       },
 *     };
 *   }
 * }
 * ```
 */
export abstract class RestPluginWithConfig<TConfig> implements RestPluginHooks {
  constructor(protected readonly config: TConfig) {}

  /** Default destroy implementation - override if cleanup needed */
  destroy(): void {
    // Override in subclass if cleanup needed
  }
}

/**
 * SSE Plugin Base Class
 * Convenience class for SSE protocol plugins without configuration.
 * Implements SsePluginHooks without extending ApiPluginBase to avoid signature conflicts.
 *
 * @example
 * ```typescript
 * class SseLoggingPlugin extends SsePlugin {
 *   onConnect(ctx: SseConnectContext): SseConnectContext {
 *     console.log(`[SSE] Connecting to ${ctx.url}`);
 *     return ctx;
 *   }
 * }
 * ```
 */
export abstract class SsePlugin implements SsePluginHooks {
  /** Default destroy implementation - override if cleanup needed */
  destroy(): void {
    // Override in subclass if cleanup needed
  }
}

/**
 * SSE Plugin With Config
 * Convenience class for SSE protocol plugins with typed configuration.
 * Implements SsePluginHooks without extending ApiPluginBase to avoid signature conflicts.
 *
 * @template TConfig - Configuration type
 *
 * @example
 * ```typescript
 * interface SseAuthConfig {
 *   getToken: () => string;
 * }
 *
 * class SseAuthPlugin extends SsePluginWithConfig<SseAuthConfig> {
 *   onConnect(ctx: SseConnectContext): SseConnectContext {
 *     return {
 *       ...ctx,
 *       headers: {
 *         ...ctx.headers,
 *         Authorization: `Bearer ${this.config.getToken()}`,
 *       },
 *     };
 *   }
 * }
 * ```
 */
export abstract class SsePluginWithConfig<TConfig> implements SsePluginHooks {
  constructor(protected readonly config: TConfig) {}

  /** Default destroy implementation - override if cleanup needed */
  destroy(): void {
    // Override in subclass if cleanup needed
  }
}


// ============================================================================
// Protocol Plugin Management Types
// ============================================================================

/**
 * Protocol Class Type
 * Constructor type for protocol classes that implement ApiProtocol.
 * Used as keys in the plugin registry to identify which protocol a plugin belongs to.
 *
 * @example
 * ```typescript
 * import { RestProtocol, SseProtocol } from '@gears-frontx/api';
 * const protocolClass: ProtocolClass = RestProtocol;
 * apiRegistry.plugins.add(RestProtocol, plugin);
 * ```
 */
export type ProtocolClass = new (...args: never[]) => ApiProtocol;


/**
 * Protocol Plugin Type Mapping
 * Extracts plugin hook type from protocol's generic parameter.
 * OCP-compliant: new protocols specify their plugin type via ApiProtocol<TPlugin>.
 *
 * @template T - The protocol type (e.g., RestProtocol, SseProtocol)
 * @example
 * ```typescript
 * // RestProtocol implements ApiProtocol<RestPluginHooks>
 * type RestPlugins = ProtocolPluginType<RestProtocol>; // RestPluginHooks
 * // SseProtocol implements ApiProtocol<SsePluginHooks>
 * type SsePlugins = ProtocolPluginType<SseProtocol>; // SsePluginHooks
 * ```
 */
export type ProtocolPluginType<T extends ApiProtocol> =
  T extends ApiProtocol<infer P> ? P : never;

// ============================================================================
// API Registry Interface
// ============================================================================

/**
 * Service Constructor Type
 * Constructor for API service classes.
 * All services must extend BaseApiService.
 */
export type ServiceConstructor<T = BaseApiService> = new () => T;

/**
 * API Registry Interface
 * Central registry for all API service instances.
 *
 * @example
 * ```typescript
 * // Register a service
 * apiRegistry.register(AccountsApiService);
 *
 * // Get a service (type-safe)
 * const accounts = apiRegistry.getService(AccountsApiService);
 * const user = await accounts.getCurrentUser();
 * ```
 */
export interface ApiRegistry {
  /**
   * Register an API service by class reference.
   *
   * @template T - Service type extending BaseApiService
   * @param serviceClass - Service constructor (no-arg)
   */
  register<T extends BaseApiService>(serviceClass: new () => T): void;

  /**
   * Get service by class reference.
   * Returns typed service instance.
   *
   * @template T - Service type extending BaseApiService
   * @param serviceClass - Service constructor
   * @returns The service instance
   */
  getService<T extends BaseApiService>(serviceClass: new () => T): T;

  /**
   * Check if service is registered.
   *
   * @template T - Service type extending BaseApiService
   * @param serviceClass - Service constructor
   * @returns True if service exists
   */
  has<T extends BaseApiService>(serviceClass: new () => T): boolean;

  /**
   * Initialize all registered services.
   *
   * @param config - Global API configuration
   */
  initialize(config?: ApiServicesConfig): void;

  /**
   * Get current configuration.
   *
   * @returns Current API configuration
   */
  getConfig(): Readonly<ApiServicesConfig>;
}
