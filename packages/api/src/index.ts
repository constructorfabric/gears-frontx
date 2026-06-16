/**
 * @gears-frontx/api - API Communication
 *
 * This package provides:
 * - API service interface and registry
 * - REST and SSE protocol support
 * - Plugin system for request/response modification
 * - Mock data support for testing
 *
 * SDK Layer: L1 (Zero @gears-frontx dependencies)
 */

// @cpt-dod:cpt-frontx-dod-api-communication-public-api:p1

// Re-export all types
export type {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  JsonCompatible,
  MockResponseFactory,
  MockMap,
  ApiServiceConfig,
  ApiServicesConfig,
  RestProtocolConfig,
  SseProtocolConfig,
  HttpMethod,
  MutationMethod,
  ApiRequestContext,
  ApiResponseContext,
  ShortCircuitResponse,
  ServiceConstructor,
  ApiRegistry,
  PluginClass,
  ProtocolClass,
  ProtocolPluginType,
  BasePluginHooks,
  // Protocol-specific types
  RestPluginHooks,
  SsePluginHooks,
  RestRequestContext,
  RestResponseContext,
  RestRequestOptions,
  ApiPluginErrorContext,
  SseConnectContext,
  EventSourceLike,
  RestShortCircuitResponse,
  SseShortCircuitResponse,
  // Endpoint descriptor types
  EndpointDescriptor,
  ParameterizedEndpointDescriptor,
  MutationDescriptor,
  EndpointOptions,
  // Stream descriptor types
  StreamDescriptor,
  StreamStatus,
} from './types';
export type {
  SharedFetchCache,
  SharedFetchCacheFetchOptions,
  SharedFetchCacheInvalidateFilters,
} from './sharedFetchCache';

// Re-export mock config types from plugin files
export type { RestMockConfig } from './plugins/RestMockPlugin';
export type { SseMockConfig } from './plugins/SseMockPlugin';
export type { SseMockEvent } from './mocks/MockEventSource';

// Export plugin classes and functions
export {
  ApiPluginBase,
  ApiPlugin,
  ApiProtocol,
  isShortCircuit,
  // Protocol-specific plugin classes
  RestPlugin,
  RestPluginWithConfig,
  SsePlugin,
  SsePluginWithConfig,
  // Protocol-specific type guards
  isRestShortCircuit,
  isSseShortCircuit,
  // Mock plugin identification
  MOCK_PLUGIN,
  isMockPlugin,
} from './types';

// Export base service class
export { BaseApiService } from './BaseApiService';

// Export protocols
export { RestProtocol } from './protocols/RestProtocol';
export { SseProtocol } from './protocols/SseProtocol';
export { RestEndpointProtocol } from './protocols/RestEndpointProtocol';
export { SseStreamProtocol } from './protocols/SseStreamProtocol';
export {
  SHARED_FETCH_CACHE_SYMBOL,
  SHARED_FETCH_CACHE_RETAINERS_SYMBOL,
  createSharedFetchCache,
  getSharedFetchCache,
  peekSharedFetchCache,
  retainSharedFetchCache,
  releaseSharedFetchCache,
  resetSharedFetchCache,
} from './sharedFetchCache';

// Export protocol-specific mock plugins
export { RestMockPlugin } from './plugins/RestMockPlugin';
export { SseMockPlugin } from './plugins/SseMockPlugin';
export { MockEventSource } from './mocks/MockEventSource';

// Export registry
export { apiRegistry } from './apiRegistry';
