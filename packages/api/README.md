# @gears-frontx/api

API communication protocols and service registry for FrontX applications.

Part of the SDK Layer (L1): zero `@gears-frontx` dependencies, usable independently. `axios` is a
peer dependency.

## BaseApiService

Abstract base class for domain-specific API services:

```typescript
import { BaseApiService, RestEndpointProtocol, RestProtocol } from '@gears-frontx/api';

class AccountsApiService extends BaseApiService {
  constructor() {
    const rest = new RestProtocol();
    super({ baseURL: '/api/accounts' }, rest, new RestEndpointProtocol(rest));
  }

  async getCurrentUser(): Promise<User> {
    return this.protocol(RestProtocol).get('/user/current');
  }
}
```

## Endpoint descriptors

Services declare read and write endpoints as descriptors. Cache keys are derived automatically from
`[baseURL, method, path]` - there are no manual key factories.

```typescript
class AccountsApiService extends BaseApiService {
  constructor() {
    const rest = new RestProtocol();
    super({ baseURL: '/api/accounts' }, rest, new RestEndpointProtocol(rest));
  }

  // key: ['/api/accounts', 'GET', '/user/current']
  readonly getCurrentUser = this.protocol(RestEndpointProtocol).query<User>('/user/current');

  // key: ['/api/accounts', 'GET', '/user/123', { id: '123' }]
  readonly getUser = this.protocol(RestEndpointProtocol).queryWith<User, { id: string }>(
    (params) => `/user/${params.id}`
  );

  readonly getConfig = this.protocol(RestEndpointProtocol).query<AppConfig>('/config', {
    staleTime: 600_000,
    gcTime: Infinity,
  });

  readonly updateProfile = this.protocol(RestEndpointProtocol).mutation<User, ProfileUpdate>(
    'PUT',
    '/user/profile'
  );
}
```

Components consume descriptors via `useApiQuery(service.endpoint)` - see `@gears-frontx/react`.

## Registry

```typescript
import { apiRegistry } from '@gears-frontx/api';

apiRegistry.register(AccountsApiService);

const accounts = apiRegistry.getService(AccountsApiService);
const user = await accounts.getCurrentUser.fetch();
```

Registration and lookup both take the service class, not a string key.

## Stream descriptors (SSE)

Keys are derived from `[baseURL, 'SSE', path]`. `SseStreamProtocol.stream()` routes through
`SseProtocol` with the full plugin chain, including the mock short-circuit via `SseMockPlugin`.

```typescript
import { BaseApiService, SseProtocol, SseStreamProtocol } from '@gears-frontx/api';

class ChatApiService extends BaseApiService {
  constructor() {
    const sse = new SseProtocol();
    super({ baseURL: '/api/chat' }, sse, new SseStreamProtocol(sse));
  }

  // key: ['/api/chat', 'SSE', '/stream/messages'], default parser JSON.parse(event.data)
  readonly messageStream = this.protocol(SseStreamProtocol).stream<ChatMessage>(
    '/stream/messages'
  );

  readonly rawStream = this.protocol(SseStreamProtocol).stream<string>('/stream/raw', {
    parse: (event) => event.data,
  });
}
```

Components consume stream descriptors via `useApiStream(service.streamDescriptor)`.

## Mocks

Register mock plugins in the service constructor with `registerPlugin()`. The framework owns their
lifecycle through `toggleMockMode()`.

```typescript
import { BaseApiService, RestProtocol, RestMockPlugin, apiRegistry } from '@gears-frontx/api';

class ChatApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    super({ baseURL: '/api/chat' }, restProtocol);

    this.registerPlugin(
      restProtocol,
      new RestMockPlugin({
        mockMap: {
          'GET /api/chat/threads': () => [{ id: '1', title: 'Thread 1' }],
          'POST /api/chat/messages': (body) => ({ id: '2', ...body }),
        },
        delay: 100,
      })
    );
  }
}

// cross-cutting mocks
apiRegistry.plugins.add(
  RestProtocol,
  new RestMockPlugin({ mockMap: { 'GET /api/health': () => ({ status: 'ok' }) }, delay: 100 })
);
```

```typescript
import { toggleMockMode } from '@gears-frontx/framework';

toggleMockMode(true);
```

A custom mock plugin must carry the `MOCK_PLUGIN` symbol for the framework to recognize it;
`isMockPlugin(plugin)` is the type guard.

```typescript
import { ApiPluginBase, MOCK_PLUGIN } from '@gears-frontx/api';

class CustomMockPlugin extends ApiPluginBase {
  static readonly [MOCK_PLUGIN] = true;
}
```

## Plugins

Extend `ApiPluginBase` (no config) or `ApiPlugin<TConfig>`:

```typescript
import { ApiPlugin, ApiPluginBase, ApiRequestContext, ApiResponseContext } from '@gears-frontx/api';

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

class AuthPlugin extends ApiPlugin<{ getToken: () => string | null }> {
  onRequest(ctx: ApiRequestContext) {
    const token = this.config.getToken();
    if (!token) return ctx;
    return { ...ctx, headers: { ...ctx.headers, Authorization: `Bearer ${token}` } };
  }
}

service.plugins.add(new LoggingPlugin());
apiRegistry.plugins.add(new LoggingPlugin());
```

Plugins are addressed by class reference, never by string name.

## Retry

`onError` receives an `ApiPluginErrorContext` and can retry the request with modifications:

```typescript
import { RestPluginWithConfig, ApiPluginErrorContext } from '@gears-frontx/api';

class AuthPlugin extends RestPluginWithConfig<AuthConfig> {
  async onError(context: ApiPluginErrorContext): Promise<Error | RestResponseContext> {
    if (this.is401Error(context.error) && context.retryCount === 0) {
      try {
        const newToken = await this.config.refreshToken();
        return context.retry({
          headers: { ...context.request.headers, Authorization: `Bearer ${newToken}` },
        });
      } catch {
        return context.error;
      }
    }
    return context.error;
  }
}
```

Check `retryCount` before retrying, and return the error when the retry should not happen.
`maxRetryDepth` (default `10`, configurable per protocol) is the backstop, not the primary guard:

```typescript
const restProtocol = new RestProtocol({ maxRetryDepth: 5 });
```

## Protocols

```typescript
const restProtocol = new RestProtocol({
  timeout: 30000,
  withCredentials: true,
  contentType: 'application/json',
});
```

## Exports

Services and descriptors: `BaseApiService`, `EndpointDescriptor`,
`ParameterizedEndpointDescriptor`, `MutationDescriptor`, `StreamDescriptor`, `StreamStatus`,
`apiRegistry`.

Protocols: `RestProtocol`, `SseProtocol`, `RestEndpointProtocol`, `SseStreamProtocol`,
`ProtocolType`, `ProtocolPluginType`.

Plugins: `ApiPluginBase`, `ApiPlugin`, `RestPlugin`, `RestPluginWithConfig`, `SsePlugin`,
`SsePluginWithConfig`, `PluginType`.

Mocks: `RestMockPlugin`, `SseMockPlugin`, `MockMap`, `MOCK_PLUGIN`, `isMockPlugin`.

Contexts and short-circuits: `ApiRequestContext`, `ApiResponseContext`, `RestRequestContext`,
`RestResponseContext`, `SseConnectContext`, `ApiPluginErrorContext`, `ShortCircuitResponse`,
`RestShortCircuitResponse`, `SseShortCircuitResponse`, `isShortCircuit`, `isRestShortCircuit`,
`isSseShortCircuit`.
