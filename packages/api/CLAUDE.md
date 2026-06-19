# @gears-frontx/api

API communication protocols and service registry for HAI3 applications.

## SDK Layer

This package is part of the **SDK Layer (L1)** - it has zero @gears-frontx dependencies and can be used independently. It has `axios` as a peer dependency.

## Core Concepts

### BaseApiService

Abstract base class for domain-specific API services:

```typescript
import { BaseApiService, RestProtocol } from '@gears-frontx/api';

class AccountsApiService extends BaseApiService {
  constructor() {
    super(
      { baseURL: '/api/accounts' },
      new RestProtocol()
    );
  }

  async getCurrentUser(): Promise<User> {
    return this.protocol(RestProtocol).get('/user/current');
  }

  async updateProfile(data: ProfileUpdate): Promise<User> {
    return this.protocol(RestProtocol).put('/user/profile', data);
  }
}
```

### API Registry

Central registry for all API services:

```typescript
import { apiRegistry } from '@gears-frontx/api';

// Register service with class reference (type-safe)
apiRegistry.register(AccountsApiService);

// Get service (type-safe with class reference)
const accounts = apiRegistry.getService(AccountsApiService);
const user = await accounts.getCurrentUser();
```

### Mock Support

Configure mocks via RestMockPlugin using the `registerPlugin()` pattern. Framework controls mock plugin activation via the Mock API toggle.

```typescript
import { BaseApiService, RestProtocol, RestMockPlugin } from '@gears-frontx/api';

// Register mock plugins in service constructor
// Framework activates/deactivates based on mock mode state
class ChatApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    super({ baseURL: '/api/chat' }, restProtocol);

    // Register mock plugin (framework controls when it's active)
    this.registerPlugin(restProtocol, new RestMockPlugin({
      mockMap: {
        'GET /api/chat/threads': () => [{ id: '1', title: 'Thread 1' }],
        'POST /api/chat/messages': (body) => ({ id: '2', ...body }),
      },
      delay: 100,
    }));
  }
}

// Global mocks (for cross-cutting concerns)
apiRegistry.plugins.add(RestProtocol, new RestMockPlugin({
  mockMap: {
    'GET /api/health': () => ({ status: 'ok' }),
  },
  delay: 100,
}));
```

### Plugin System

Create plugins by extending ApiPluginBase or ApiPlugin<TConfig>:

```typescript
import { ApiPlugin, ApiPluginBase, ApiRequestContext, ApiResponseContext } from '@gears-frontx/api';

// Simple plugin (no config)
class LoggingPlugin extends ApiPluginBase {
  onRequest(ctx: ApiRequestContext) {
    console.log(`[${ctx.method}] ${ctx.url}`);
    return ctx;
  }

  onResponse(response: ApiResponseContext, request: ApiRequestContext) {
    console.log(`[${response.status}] ${request.url}`);
    return response;
  }
}

// Plugin with config
class AuthPlugin extends ApiPlugin<{ getToken: () => string | null }> {
  onRequest(ctx: ApiRequestContext) {
    const token = this.config.getToken();
    if (!token) return ctx;
    return {
      ...ctx,
      headers: { ...ctx.headers, Authorization: `Bearer ${token}` }
    };
  }
}

// Register on service
service.plugins.add(new LoggingPlugin());
service.plugins.add(new AuthPlugin({ getToken: () => localStorage.getItem('token') }));

// Or register globally
apiRegistry.plugins.add(new LoggingPlugin());
```

## Protocol Support

### RestProtocol

HTTP REST API calls via axios:

```typescript
import { RestProtocol } from '@gears-frontx/api';

const restProtocol = new RestProtocol({
  timeout: 30000,
  withCredentials: true,
  contentType: 'application/json'
});
```

## Mock Mode

Mock mode is controlled centrally by the framework via the `toggleMockMode()` action. Services register mock plugins using `registerPlugin()`, and the framework activates/deactivates them based on mock mode state.

```typescript
// In @gears-frontx/framework - toggle mock mode (used by HAI3 Studio)
import { toggleMockMode } from '@gears-frontx/framework';
toggleMockMode(true);  // Enable all mock plugins
toggleMockMode(false); // Disable all mock plugins

// Custom mock plugins must be marked with MOCK_PLUGIN symbol
import { ApiPluginBase, MOCK_PLUGIN } from '@gears-frontx/api';

class CustomMockPlugin extends ApiPluginBase {
  static readonly [MOCK_PLUGIN] = true;  // Required for framework to identify as mock plugin
  // ... implementation
}

// Check if a plugin is a mock plugin
import { isMockPlugin } from '@gears-frontx/api';
if (isMockPlugin(plugin)) {
  console.log('This is a mock plugin');
}
```

## Key Rules

1. **Services extend BaseApiService** - Use the base class for protocol management
2. **Register with class reference** - Call `apiRegistry.register(ServiceClass)`
3. **One service per domain** - Each bounded context gets one service
4. **Mock plugins via registerPlugin()** - Use `this.registerPlugin(protocol, mockPlugin)` in constructor
5. **Mock mode via framework** - Framework controls mock plugin lifecycle via `toggleMockMode()`
6. **Plugin identification by class** - Use class references, not string names

## Retry Pattern

Plugins can retry failed requests with optional modifications using `ApiPluginErrorContext`:

```typescript
import { RestPluginWithConfig, ApiPluginErrorContext } from '@gears-frontx/api';

interface AuthConfig {
  getToken: () => string | null;
  refreshToken: () => Promise<string>;
}

class AuthPlugin extends RestPluginWithConfig<AuthConfig> {
  async onRequest(ctx: RestRequestContext): Promise<RestRequestContext> {
    const token = this.config.getToken();
    if (!token) return ctx;
    return {
      ...ctx,
      headers: { ...ctx.headers, Authorization: `Bearer ${token}` }
    };
  }

  async onError(context: ApiPluginErrorContext): Promise<Error | RestResponseContext> {
    // Check if error is 401 and this is the first attempt (not a retry)
    if (this.is401Error(context.error) && context.retryCount === 0) {
      try {
        // Refresh the token
        const newToken = await this.config.refreshToken();

        // Retry the request with the new token
        return context.retry({
          headers: { ...context.request.headers, Authorization: `Bearer ${newToken}` }
        });
      } catch (refreshError) {
        // If refresh fails, return original error
        return context.error;
      }
    }

    // Not a 401 or already retried - propagate error
    return context.error;
  }

  private is401Error(error: Error): boolean {
    return error.message.includes('401') || error.message.includes('Unauthorized');
  }
}
```

Key retry pattern guidelines:

1. **Always check `retryCount`** to prevent infinite retry loops
2. **Use `context.retry()`** to retry with optional request modifications
3. **Limit retries** - typically retry once (`retryCount === 0`)
4. **Return error** if retry should not happen or max attempts reached
5. **Safety net** - `maxRetryDepth` config (default: 10) prevents infinite loops

```typescript
// Configure max retry depth (default: 10)
const restProtocol = new RestProtocol({ maxRetryDepth: 5 });
```

## Exports

- `BaseApiService` - Abstract base class
- `RestProtocol` - REST API protocol
- `SseProtocol` - SSE protocol
- `ApiPluginBase` - Abstract base class for plugins (no config)
- `ApiPlugin` - Abstract generic class for plugins with config
- `RestPlugin` - REST protocol plugin base class
- `RestPluginWithConfig` - REST protocol plugin with config
- `SsePlugin` - SSE protocol plugin base class
- `SsePluginWithConfig` - SSE protocol plugin with config
- `RestMockPlugin` - REST mock data plugin
- `SseMockPlugin` - SSE mock data plugin
- `apiRegistry` - Singleton registry
- `MOCK_PLUGIN` - Symbol for marking mock plugins
- `isMockPlugin` - Type guard for identifying mock plugins
- `ApiPluginErrorContext` - Error context with retry support
- `ApiRequestContext` - Plugin request context type
- `ApiResponseContext` - Plugin response context type
- `RestRequestContext` - REST request context type
- `RestResponseContext` - REST response context type
- `SseConnectContext` - SSE connection context type
- `ShortCircuitResponse` - Short-circuit response wrapper
- `RestShortCircuitResponse` - REST short-circuit response
- `SseShortCircuitResponse` - SSE short-circuit response
- `PluginType` - Type for plugin references
- `ProtocolType` - Type for protocol references
- `ProtocolPluginType` - Type mapping for protocol plugins
- `isShortCircuit` - Type guard for short-circuit responses
- `isRestShortCircuit` - Type guard for REST short-circuit responses
- `isSseShortCircuit` - Type guard for SSE short-circuit responses
- `MockMap` - Mock response map type
