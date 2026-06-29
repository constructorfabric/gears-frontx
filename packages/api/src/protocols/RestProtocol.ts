/**
 * RestProtocol - REST API communication protocol
 *
 * Implements REST API calls using axios.
 * Supports plugin chain for request/response interception.
 *
 * SDK Layer: L1 (Only peer dependency on axios)
 */

// @cpt-dod:cpt-frontx-dod-api-communication-rest-protocol:p1
// @cpt-flow:cpt-frontx-flow-api-communication-rest-request:p1
// @cpt-algo:cpt-frontx-algo-api-communication-rest-plugin-chain-request:p1
// @cpt-algo:cpt-frontx-algo-api-communication-rest-plugin-chain-response:p1
// @cpt-algo:cpt-frontx-algo-api-communication-plugin-ordering:p1
// @cpt-state:cpt-frontx-state-api-communication-rest-connection:p1
// @cpt-dod:cpt-frontx-dod-request-lifecycle-abort-signal:p1
// @cpt-flow:cpt-frontx-flow-request-lifecycle-rest-abort:p1
// @cpt-algo:cpt-frontx-algo-request-lifecycle-signal-threading:p1
// @cpt-algo:cpt-frontx-algo-request-lifecycle-cancel-detection:p1
// @cpt-algo:cpt-frontx-algo-request-lifecycle-request-options:p1
// @cpt-flow:cpt-frontx-flow-api-protocol-surface-service-call:p1
// @cpt-algo:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1
// @cpt-algo:cpt-frontx-algo-api-protocol-surface-shared-cache:p1
// @cpt-dod:cpt-frontx-dod-api-protocol-surface-protocol-dispatch:p1

import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import {
  ApiProtocol,
  type ApiServiceConfig,
  type RestProtocolConfig,
  type ApiRequestContext,
  type ApiResponseContext,
  type RestPluginHooks,
  type HttpMethod,
  type PluginClass,
  type ApiPluginErrorContext,
  type RestResponseContext,
  type RestRequestContext,
  type RestRequestOptions,
} from '../types';
import { isRestShortCircuit } from '../types';
import { protocolPluginRegistry } from '../protocolPluginRegistry';
import { peekSharedFetchCache } from '../sharedFetchCache';

/**
 * Default REST protocol configuration.
 */
const DEFAULT_REST_CONFIG: RestProtocolConfig = {
  withCredentials: false,
  contentType: 'application/json',
};

let nextSharedRequestScopeId = 0;

function allocateRestProtocolSharedRequestScopeId(): string {
  nextSharedRequestScopeId += 1;
  return `rest-protocol:${nextSharedRequestScopeId}`;
}

type PreparedRestRequest = {
  readonly originalRequestContext: ApiRequestContext;
  readonly processedRequestContext: ApiRequestContext;
  readonly shortCircuitResponse?: ApiResponseContext;
};

type SharedGetResponseEnvelope = {
  readonly responseContext: ApiResponseContext;
};

/**
 * RestProtocol Implementation
 *
 * Handles REST API communication with plugin support.
 *
 * @example
 * ```typescript
 * const restProtocol = new RestProtocol({ timeout: 30000 });
 *
 * // Use in a service
 * const data = await restProtocol.get('/users');
 * ```
 */
export class RestProtocol extends ApiProtocol<RestPluginHooks> {
  /** Axios instance */
  private client: AxiosInstance | null = null;

  /** Base service config */
  private config: Readonly<ApiServiceConfig> | null = null;

  /** REST-specific config */
  private restConfig: RestProtocolConfig;

  /** Stable per-instance scope so request preparation dedupes only within one protocol. */
  private readonly sharedRequestScopeId = allocateRestProtocolSharedRequestScopeId();

  /** Callback to get excluded plugin classes from service */
  private getExcludedClasses: () => ReadonlySet<PluginClass> = () => new Set();

  /** Instance-specific plugins */
  private _instancePlugins: Set<RestPluginHooks> = new Set();

  /**
   * Instance plugin management namespace
   * Plugins registered here apply only to this RestProtocol instance
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-plugin-ordering:p1:inst-rest-instance-plugins
  public readonly plugins = {
    /**
     * Add an instance REST plugin
     * @param plugin - Plugin instance implementing RestPluginHooks
     */
    add: (plugin: RestPluginHooks): void => {
      this._instancePlugins.add(plugin);
    },

    /**
     * Remove an instance REST plugin
     * Calls destroy() if available
     * @param plugin - Plugin instance to remove
     */
    remove: (plugin: RestPluginHooks): void => {
      if (this._instancePlugins.has(plugin)) {
        this._instancePlugins.delete(plugin);
        plugin.destroy();
      }
    },

    /**
     * Get all instance plugins
     */
    getAll: (): readonly RestPluginHooks[] => {
      return Array.from(this._instancePlugins);
    },
  };
  // @cpt-end:cpt-frontx-algo-api-communication-plugin-ordering:p1:inst-rest-instance-plugins

  // @cpt-begin:cpt-frontx-dod-api-communication-rest-protocol:p1:inst-constructor
  constructor(restConfig: RestProtocolConfig = {}) {
    super();
    this.restConfig = { ...DEFAULT_REST_CONFIG, ...restConfig };
  }
  // @cpt-end:cpt-frontx-dod-api-communication-rest-protocol:p1:inst-constructor

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the protocol with service configuration.
   */
  // @cpt-begin:cpt-frontx-state-api-communication-rest-connection:p1:inst-1
  initialize(
    config: Readonly<ApiServiceConfig>,
    getExcludedClasses?: () => ReadonlySet<PluginClass>
  ): void {
    this.config = config;
    if (getExcludedClasses) {
      this.getExcludedClasses = getExcludedClasses;
    }

    // Create axios instance
    this.client = axios.create({
      baseURL: config.baseURL,
      headers: {
        'Content-Type': this.restConfig.contentType,
        ...config.headers,
      },
      timeout: this.restConfig.timeout ?? config.timeout,
      withCredentials: this.restConfig.withCredentials,
    });
  }
  // @cpt-end:cpt-frontx-state-api-communication-rest-connection:p1:inst-1

  /**
   * Cleanup protocol resources.
   */
  // @cpt-begin:cpt-frontx-state-api-communication-rest-connection:p1:inst-2
  cleanup(): void {
    // Cleanup instance plugins
    this._instancePlugins.forEach((plugin) => {
      plugin.destroy();
    });
    this._instancePlugins.clear();

    this.client = null;
    this.config = null;
  }
  // @cpt-end:cpt-frontx-state-api-communication-rest-connection:p1:inst-2

  /**
   * Test-only hook that replaces the underlying axios `request` dispatcher.
   *
   * Exists so tests can stub the network layer without reaching into the
   * private axios instance via structural casts. Throws if the protocol has
   * not been initialized, since no underlying client exists yet.
   *
   * @internal Test seam — do not rely on this in production code.
   */
  setRequestDispatcherForTest(
    dispatch: (config: AxiosRequestConfig) => Promise<unknown>
  ): void {
    if (!this.client) {
      throw new Error(
        'RestProtocol.setRequestDispatcherForTest: protocol has not been initialized.'
      );
    }
    this.client.request = dispatch as AxiosInstance['request'];
  }

  /**
   * Get global plugins from apiRegistry, filtering out excluded classes.
   * @internal
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-plugin-ordering:p1:inst-1
  private getGlobalPlugins(): readonly RestPluginHooks[] {
    const allGlobalPlugins = protocolPluginRegistry.getAll(RestProtocol);
    const excludedClasses = this.getExcludedClasses();

    if (excludedClasses.size === 0) {
      return allGlobalPlugins;
    }

    // Filter out excluded plugin classes
    return allGlobalPlugins.filter((plugin) => {
      for (const excludedClass of excludedClasses) {
        if ((plugin as object) instanceof excludedClass) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Get all plugins in execution order (global first, then instance).
   * Used by plugin chain execution to get ordered list of plugins.
   * @internal
   */
  // @cpt-algo:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1
  getPluginsInOrder(): RestPluginHooks[] {
    return [
      ...this.getGlobalPlugins(),
      ...Array.from(this._instancePlugins),
    ];
  }
  // @cpt-end:cpt-frontx-algo-api-communication-plugin-ordering:p1:inst-1

  // ============================================================================
  // HTTP Methods
  // ============================================================================

  // @cpt-begin:cpt-frontx-algo-request-lifecycle-request-options:p1:inst-update-signatures
  /**
   * Perform GET request.
   * @template TResponse - Response type
   */
  async get<TResponse>(url: string, options?: RestRequestOptions): Promise<TResponse> {
    return this.request<TResponse>('GET', url, undefined, options);
  }

  /**
   * Perform GET request with shared-fetch reuse when a global cache is retained.
   * The shared key is derived from the plugin-processed request identity so
   * auth/tenant headers and similar request mutations stay isolated per root.
   *
   * @internal Used by RestEndpointProtocol query descriptors.
   */
  async getWithSharedCache<TResponse>(
    url: string,
    options?: RestRequestOptions & { descriptorKey?: readonly unknown[]; staleTime?: number }
  ): Promise<TResponse> {
    // @cpt-begin:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-peek-cache
    const cache = peekSharedFetchCache();
    // @cpt-end:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-peek-cache
    if (!cache) {
      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-no-cache
      return this.get<TResponse>(url, options);
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-no-cache
    }

    // @cpt-begin:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-derive-prep-key
    const preparationKey = this.resolveSharedGetPreparationKey(
      url,
      options?.params,
      options?.withCredentials
    );
    // @cpt-end:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-derive-prep-key
    // @cpt-begin:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-prepare-via-cache
    const preparedRequest = await cache.getOrFetch(
      preparationKey,
      ({ signal }) => this.prepareRequest('GET', url, undefined, signal, undefined, options?.withCredentials),
      {
        signal: options?.signal,
        aliases: options?.descriptorKey ? [options.descriptorKey] : undefined,
        staleTime: 0,
      }
    );
    // @cpt-end:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-prepare-via-cache
    // @cpt-begin:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-derive-shared-key
    const sharedKey = this.resolveSharedGetCacheKey(
      preparedRequest.processedRequestContext,
      options?.params
    );
    // @cpt-end:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-derive-shared-key
    // @cpt-begin:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-getorfetch
    const sharedEnvelope = await cache.getOrFetch<SharedGetResponseEnvelope>(
      sharedKey,
      ({ signal }) =>
        this.fetchSharedGetResponse(
          preparedRequest,
          'GET',
          url,
          options?.params,
          signal,
          0
        ),
      {
        signal: options?.signal,
        aliases: options?.descriptorKey ? [options.descriptorKey] : undefined,
        staleTime: options?.staleTime,
      }
    );
    // @cpt-end:cpt-frontx-algo-api-protocol-surface-shared-cache:p1:inst-getorfetch

    // @cpt-begin:cpt-frontx-flow-api-protocol-surface-service-call:p1:inst-post-fetch-response-chain
    const finalResponse = await this.executePluginOnResponse(
      sharedEnvelope.responseContext,
      preparedRequest.originalRequestContext
    );

    return finalResponse.data as TResponse;
    // @cpt-end:cpt-frontx-flow-api-protocol-surface-service-call:p1:inst-post-fetch-response-chain
  }

  /**
   * Perform POST request.
   * @template TResponse - Response type
   * @template TRequest - Request body type (optional, for type-safe requests)
   */
  async post<TResponse, TRequest = unknown>(url: string, data?: TRequest, options?: RestRequestOptions): Promise<TResponse> {
    return this.request<TResponse>('POST', url, data, options);
  }

  /**
   * Perform PUT request.
   * @template TResponse - Response type
   * @template TRequest - Request body type (optional, for type-safe requests)
   */
  async put<TResponse, TRequest = unknown>(url: string, data?: TRequest, options?: RestRequestOptions): Promise<TResponse> {
    return this.request<TResponse>('PUT', url, data, options);
  }

  /**
   * Perform PATCH request.
   * @template TResponse - Response type
   * @template TRequest - Request body type (optional, for type-safe requests)
   */
  async patch<TResponse, TRequest = unknown>(url: string, data?: TRequest, options?: RestRequestOptions): Promise<TResponse> {
    return this.request<TResponse>('PATCH', url, data, options);
  }

  /**
   * Perform DELETE request.
   * Omit `data` when the endpoint has no body; pass `undefined` explicitly when combining with `options`
   * (e.g. `delete(url, undefined, { signal })`), same pattern as POST/PUT/PATCH.
   * @template TResponse - Response type
   * @template TRequest - Request body type (optional)
   */
  async delete<TResponse, TRequest = unknown>(
    url: string,
    data?: TRequest,
    options?: RestRequestOptions
  ): Promise<TResponse> {
    return this.request<TResponse>('DELETE', url, data, options);
  }
  // @cpt-end:cpt-frontx-algo-request-lifecycle-request-options:p1:inst-update-signatures

  // ============================================================================
  // Request Execution
  // ============================================================================

  /**
   * Execute an HTTP request with plugin chain.
   * Public entry point - delegates to requestInternal with retryCount: 0.
   */
  // @cpt-begin:cpt-frontx-algo-request-lifecycle-request-options:p1:inst-forward-to-internal
  private async request<T>(
    method: HttpMethod,
    url: string,
    data?: unknown,
    options?: RestRequestOptions
  ): Promise<T> {
    return this.requestInternal<T>(
      method,
      url,
      data,
      options?.params,
      options?.signal,
      options?.withCredentials,
      0
    );
  }
  // @cpt-end:cpt-frontx-algo-request-lifecycle-request-options:p1:inst-forward-to-internal

  /**
   * Internal request execution with retry support.
   * Can be called for initial request or retry.
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-rest-request:p1:inst-1
  // @cpt-begin:cpt-frontx-algo-api-communication-rest-plugin-chain-request:p1:inst-1
  // @cpt-begin:cpt-frontx-algo-api-communication-rest-plugin-chain-response:p1:inst-1
  // @cpt-begin:cpt-frontx-algo-request-lifecycle-signal-threading:p1:inst-receive-signal
  private async requestInternal<T>(
    method: HttpMethod,
    url: string,
    data?: unknown,
    params?: Record<string, string>,
    signal?: AbortSignal,
    withCredentials?: boolean,
    retryCount: number = 0,
    /** Merged request headers from plugin retry() — must be applied before onRequest, not rebuilt from config only */
    retryHeaders?: Record<string, string>
  ): Promise<T> {
    if (!this.client) {
      throw new Error('RestProtocol not initialized. Call initialize() first.');
    }

    // Check max retry depth safety net
    const maxDepth = this.restConfig.maxRetryDepth ?? 10;
    if (retryCount >= maxDepth) {
      throw new Error(`Max retry depth (${maxDepth}) exceeded`);
    }
    // @cpt-begin:cpt-frontx-flow-api-protocol-surface-service-call:p1:inst-build-rr-ctx
    const requestContext = this.buildRequestContext(
      method,
      url,
      data,
      signal,
      retryHeaders,
      withCredentials
    );
    // @cpt-end:cpt-frontx-flow-api-protocol-surface-service-call:p1:inst-build-rr-ctx

    let preparedRequest: PreparedRestRequest;

    try {
      preparedRequest = await this.prepareRequestContext(requestContext);
    } catch (error) {
      if (axios.isCancel(error)) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      const responseContext = this.extractResponseContext(error);
      const finalResult = await this.executePluginOnError(
        err,
        requestContext,
        url,
        params,
        retryCount,
        responseContext
      );

      if (this.isApiResponseContext(finalResult)) {
        return this.unwrapResponseData<T>(finalResult, requestContext);
      }

      throw finalResult;
    }

    // @cpt-begin:cpt-frontx-flow-api-protocol-surface-service-call:p1:inst-forward-transport
    return this.executePreparedRequest<T>(
      preparedRequest,
      method,
      url,
      params,
      signal,
      retryCount
    );
    // @cpt-end:cpt-frontx-flow-api-protocol-surface-service-call:p1:inst-forward-transport
  }
  // @cpt-end:cpt-frontx-algo-request-lifecycle-signal-threading:p1:inst-receive-signal
  // @cpt-end:cpt-frontx-flow-api-communication-rest-request:p1:inst-1
  // @cpt-end:cpt-frontx-algo-api-communication-rest-plugin-chain-request:p1:inst-1
  // @cpt-end:cpt-frontx-algo-api-communication-rest-plugin-chain-response:p1:inst-1

  private async executePreparedRequest<T>(
    preparedRequest: PreparedRestRequest,
    method: HttpMethod,
    url: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
    retryCount: number = 0
  ): Promise<T> {
    const requestContext = {
      ...preparedRequest.originalRequestContext,
      signal,
    };
    const processedContext = {
      ...preparedRequest.processedRequestContext,
      signal,
    };

    try {
      // Check if a plugin short-circuited (signal is irrelevant when no HTTP call is made)
      // @cpt-begin:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-short-circuit-bypass
      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-sc-response-plugins
      if (preparedRequest.shortCircuitResponse) {
        const shortCircuitResponse = preparedRequest.shortCircuitResponse;

        // Execute onResponse for plugins in reverse order
        const processedShortCircuit = await this.executePluginOnResponse(
          shortCircuitResponse,
          requestContext
        );

        // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-return-sc
        return processedShortCircuit.data as T;
        // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-return-sc
      }
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-sc-response-plugins
      // @cpt-end:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-short-circuit-bypass

      // Build axios config.
      // IMPORTANT: Use the original relative URL for axios since it already has baseURL configured.
      // Plugin chain receives full URL for mock matching, but axios needs relative URL.
      // @cpt-begin:cpt-frontx-algo-request-lifecycle-signal-threading:p1:inst-copy-to-axios
      // @cpt-begin:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-axios-signal
      const axiosConfig: AxiosRequestConfig = {
        method,
        url,  // Use original relative URL, not processedContext.url which includes baseURL
        headers: processedContext.headers,
        data: processedContext.body,
        params,
        withCredentials: processedContext.withCredentials,
        signal,
      };
      // @cpt-end:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-axios-signal
      // @cpt-end:cpt-frontx-algo-request-lifecycle-signal-threading:p1:inst-copy-to-axios

      // Execute actual HTTP request
      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-transport-call
      const response = await this.client!.request(axiosConfig);
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-transport-call

      // Build response context
      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-wrap-response
      const responseContext: ApiResponseContext = {
        status: response.status,
        headers: response.headers as Record<string, string>,
        data: response.data,
      };
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-wrap-response

      // Execute onResponse plugin chain (reverse order)
      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-run-response-plugins
      const finalResponse = await this.executePluginOnResponse(
        responseContext,
        requestContext
      );
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-run-response-plugins

      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-return-rr
      return finalResponse.data as T;
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-return-rr
    } catch (error) {
      // @cpt-begin:cpt-frontx-algo-request-lifecycle-cancel-detection:p1:inst-check-is-cancel
      // @cpt-begin:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-cancel-skip-plugins
      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-rethrow-cancel
      // Canceled requests bypass the error plugin chain entirely — they are not retryable
      // and the caller (e.g., TanStack Query on unmount) expects the raw CanceledError.
      if (axios.isCancel(error)) {
        throw error;
      }
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-rethrow-cancel
      // @cpt-end:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-cancel-skip-plugins
      // @cpt-end:cpt-frontx-algo-request-lifecycle-cancel-detection:p1:inst-check-is-cancel

      const err = error instanceof Error ? error : new Error(String(error));
      const responseContext = this.extractResponseContext(error);

      // Execute onError plugin chain with retry support
      // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-error-chain
      const finalResult = await this.executePluginOnError(
        err,
        requestContext,
        url,
        params,
        retryCount,
        responseContext
      );
      // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-error-chain

      // Check if error was recovered (plugin returned ApiResponseContext)
      if (this.isApiResponseContext(finalResult)) {
        return this.unwrapResponseData<T>(finalResult, requestContext);
      }

      throw finalResult;
    }
  }

  private async fetchSharedGetResponse(
    preparedRequest: PreparedRestRequest,
    method: HttpMethod,
    url: string,
    params?: Record<string, string>,
    signal?: AbortSignal,
    retryCount: number = 0
  ): Promise<SharedGetResponseEnvelope> {
    const requestContext = {
      ...preparedRequest.originalRequestContext,
      signal,
    };
    const processedContext = {
      ...preparedRequest.processedRequestContext,
      signal,
    };

    try {
      if (preparedRequest.shortCircuitResponse) {
        return {
          responseContext: preparedRequest.shortCircuitResponse,
        };
      }

      const axiosConfig: AxiosRequestConfig = {
        method,
        url,
        headers: processedContext.headers,
        data: processedContext.body,
        params,
        withCredentials: processedContext.withCredentials,
        signal,
      };

      const response = await this.client!.request(axiosConfig);

      return {
        responseContext: {
          status: response.status,
          headers: response.headers as Record<string, string>,
          data: response.data,
        },
      };
    } catch (error) {
      if (axios.isCancel(error)) {
        throw error;
      }

      const err = error instanceof Error ? error : new Error(String(error));
      const responseContext = this.extractResponseContext(error);
      const finalResult = await this.executePluginOnError(
        err,
        requestContext,
        url,
        params,
        retryCount,
        responseContext
      );

      if (finalResult && typeof finalResult === 'object' && 'status' in finalResult && 'data' in finalResult) {
        return {
          responseContext: finalResult as ApiResponseContext,
        };
      }

      throw finalResult;
    }
  }

  // ============================================================================
  // Plugin Chain Execution
  // ============================================================================

  /**
   * Execute onRequest plugin chain.
   * Plugins execute in FIFO order (global first, then instance).
   * Any plugin can short-circuit by returning { shortCircuit: response }.
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-rest-plugin-chain-request:p1:inst-execute-on-request
  private async executePluginOnRequest(
    context: ApiRequestContext
  ): Promise<PreparedRestRequest> {
    let currentContext: ApiRequestContext = { ...context };

    // Use protocol-level plugins (global + instance)
    for (const plugin of this.getPluginsInOrder()) {
      // Set protocol reference for plugins that need it (e.g., RestMockPlugin)
      if ('_protocol' in plugin) {
        (plugin as { _protocol?: unknown })._protocol = this;
      }

      if (plugin.onRequest) {
        // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-run-request-plugins
        const result = await plugin.onRequest(currentContext);
        // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-run-request-plugins

        // Check if plugin short-circuited
        // @cpt-begin:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-check-short-circuit
        if (isRestShortCircuit(result)) {
          return {
            originalRequestContext: context,
            processedRequestContext: currentContext,
            shortCircuitResponse: result.shortCircuit,
          };
        }
        // @cpt-end:cpt-frontx-algo-api-protocol-surface-protocol-dispatch:p1:inst-check-short-circuit

        // Update context
        currentContext = result;
      }
    }

    return {
      originalRequestContext: context,
      processedRequestContext: currentContext,
    };
  }
  // @cpt-end:cpt-frontx-algo-api-communication-rest-plugin-chain-request:p1:inst-execute-on-request

  /**
   * Execute onResponse plugin chain.
   * Plugins execute in reverse order (LIFO - onion model).
   */
  // @cpt-begin:cpt-frontx-algo-api-communication-rest-plugin-chain-response:p1:inst-execute-on-response
  private async executePluginOnResponse(
    context: ApiResponseContext,
    _requestContext: ApiRequestContext
  ): Promise<ApiResponseContext> {
    let currentContext: ApiResponseContext = { ...context };
    // Use protocol-level plugins (global + instance) in reverse order
    const plugins = [...this.getPluginsInOrder()].reverse();

    for (const plugin of plugins) {
      if (plugin.onResponse) {
        currentContext = await plugin.onResponse(currentContext);
      }
    }

    return currentContext;
  }
  // @cpt-end:cpt-frontx-algo-api-communication-rest-plugin-chain-response:p1:inst-execute-on-response

  private isApiResponseContext(value: Error | ApiResponseContext): value is ApiResponseContext {
    return Boolean(value) && typeof value === 'object' && 'status' in value && 'data' in value;
  }

  private async unwrapResponseData<T>(
    responseContext: ApiResponseContext,
    requestContext: ApiRequestContext
  ): Promise<T> {
    const finalResponse = await this.executePluginOnResponse(responseContext, requestContext);
    return finalResponse.data as T;
  }

  /**
   * Execute onError plugin chain with retry support.
   * Plugins execute in reverse order (LIFO).
   * Plugins can transform error, recover with ApiResponseContext, or retry the request.
   */
  // @cpt-begin:cpt-frontx-flow-api-communication-rest-request:p1:inst-execute-on-error
  private async executePluginOnError(
    error: Error,
    context: ApiRequestContext,
    originalUrl: string,
    params: Record<string, string> | undefined,
    retryCount: number,
    responseContext?: RestResponseContext
  ): Promise<Error | ApiResponseContext> {
    // Create retry function that calls requestInternal with incremented retryCount
    const retry = async (modifiedRequest?: Partial<RestRequestContext>): Promise<RestResponseContext> => {
      const retryContext: RestRequestContext = {
        ...context,
        ...modifiedRequest,
        headers: { ...context.headers, ...modifiedRequest?.headers },
      };

      // Re-execute through requestInternal with incremented retryCount.
      // Signal is forwarded so aborted retries also cancel correctly.
      const result = await this.requestInternal(
        retryContext.method,
        originalUrl,
        retryContext.body,
        params,
        retryContext.signal,
        retryContext.withCredentials,
        retryCount + 1,
        retryContext.headers
      );

      // Wrap result in response context format
      return {
        status: 200,
        headers: {},
        data: result,
      };
    };

    const errorContext: ApiPluginErrorContext = {
      error,
      request: context as RestRequestContext,
      response: responseContext,
      retryCount,
      retry,
    };

    let currentResult: Error | ApiResponseContext = error;
    // Use protocol-level plugins (global + instance) in reverse order
    const plugins = [...this.getPluginsInOrder()].reverse();

    for (const plugin of plugins) {
      if (plugin.onError) {
        const result = await plugin.onError(errorContext);

        // If plugin returns ApiResponseContext, it's a recovery - stop chain
        if (result && typeof result === 'object' && 'status' in result && 'data' in result) {
          return result as ApiResponseContext;
        }

        // If plugin returns Error, continue chain
        if (result instanceof Error) {
          currentResult = result;
        }
      }
    }

    return currentResult;
  }
  // @cpt-end:cpt-frontx-flow-api-communication-rest-request:p1:inst-execute-on-error

  private async prepareRequest(
    method: HttpMethod,
    url: string,
    data?: unknown,
    signal?: AbortSignal,
    retryHeaders?: Record<string, string>,
    withCredentials?: boolean
  ): Promise<PreparedRestRequest> {
    // @cpt-begin:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-build-context-signal
    const requestContext = this.buildRequestContext(
      method,
      url,
      data,
      signal,
      retryHeaders,
      withCredentials
    );
    // @cpt-end:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-build-context-signal

    return this.prepareRequestContext(requestContext);
  }

  private async prepareRequestContext(
    requestContext: ApiRequestContext
  ): Promise<PreparedRestRequest> {
    // Execute onRequest plugin chain — plugins receive context with signal
    // @cpt-begin:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-plugin-chain-signal
    return this.executePluginOnRequest(requestContext);
    // @cpt-end:cpt-frontx-flow-request-lifecycle-rest-abort:p1:inst-plugin-chain-signal
  }

  private buildRequestContext(
    method: HttpMethod,
    url: string,
    data?: unknown,
    signal?: AbortSignal,
    retryHeaders?: Record<string, string>,
    withCredentials?: boolean
  ): ApiRequestContext {
    const fullUrl = this.config?.baseURL
      ? `${this.config.baseURL}${url}`.replace(/\/+/g, '/').replace(':/', '://')
      : url;

    return {
      method,
      url: fullUrl,
      headers: retryHeaders
        ? { ...this.config?.headers, ...retryHeaders }
        : { ...this.config?.headers },
      body: data,
      withCredentials: withCredentials ?? this.restConfig.withCredentials,
      signal,
    };
  }

  private resolveSharedGetCacheKey(
    context: ApiRequestContext,
    params?: Record<string, string>
  ): readonly unknown[] {
    return [
      context.method,
      context.url,
      { ...context.headers },
      params ? { ...params } : undefined,
      context.body,
      Boolean(context.withCredentials ?? this.restConfig.withCredentials),
    ] as const;
  }

  private resolveSharedGetPreparationKey(
    url: string,
    params?: Record<string, string>,
    withCredentials?: boolean
  ): readonly unknown[] {
    const requestContext = this.buildRequestContext('GET', url, undefined, undefined, undefined, withCredentials);

    return [
      this.sharedRequestScopeId,
      requestContext.method,
      requestContext.url,
      { ...requestContext.headers },
      params ? { ...params } : undefined,
      requestContext.body,
    ] as const;
  }

  private extractResponseContext(error: unknown): RestResponseContext | undefined {
    if (!axios.isAxiosError(error) || !error.response) {
      return undefined;
    }

    return {
      status: error.response.status,
      headers: error.response.headers as Record<string, string>,
      data: error.response.data,
    };
  }

}
