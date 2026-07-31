# @gears-frontx/api

API communication protocols and service registry. SDK Layer (L1): zero `@gears-frontx`
dependencies, `axios` as a peer dependency. Usage, descriptors, SSE, mocks, plugins, retry and the
export list: `README.md`.

## Rules

- REQUIRED: one service per bounded context, extending `BaseApiService`.
- REQUIRED: declare endpoints as descriptors - `RestEndpointProtocol.query()` / `queryWith()` /
  `mutation()` for REST, `SseStreamProtocol.stream()` for SSE.
- REQUIRED: address services, protocols and plugins by class reference -
  `apiRegistry.register(ServiceClass)`, `apiRegistry.getService(ServiceClass)`, never a string key.
- REQUIRED: register mock plugins with `this.registerPlugin(protocol, plugin)` in the constructor,
  and mark a custom one with the `MOCK_PLUGIN` symbol or the framework will not toggle it.
- REQUIRED: check `context.retryCount` in `onError` before calling `context.retry()` -
  `maxRetryDepth` (default `10`) is a backstop, not the guard.
- FORBIDDEN: manual cache key factories - keys derive from `[baseURL, method, path]`.
- FORBIDDEN: a parallel query-factory layer in an MFE - the service IS the data layer.
- FORBIDDEN: driving mock mode from a service - the framework owns it via `toggleMockMode()`.

## Commands

```sh
npm run test:unit        --workspace=@gears-frontx/api
npm run test:integration --workspace=@gears-frontx/api
npm run build            --workspace=@gears-frontx/api
npm run type-check       --workspace=@gears-frontx/api
```
