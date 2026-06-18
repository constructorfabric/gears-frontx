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

// @cpt-dod:cpt-hai3-dod-api-communication-public-api:p1

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
  ApiPluginErrorContext,
  SseConnectContext,
  EventSourceLike,
  RestShortCircuitResponse,
  SseShortCircuitResponse,
} from './types';

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

// Export protocol-specific mock plugins
export { RestMockPlugin } from './plugins/RestMockPlugin';
export { SseMockPlugin } from './plugins/SseMockPlugin';
export { MockEventSource } from './mocks/MockEventSource';

// Export registry
export { apiRegistry } from './apiRegistry';
