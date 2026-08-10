# Ecosystem API Quick Reference (template-mfe)

Signatures a screen actually needs, so a run does not re-derive them from
`node_modules/@gears-frontx/*/dist/*.d.ts`. Each one is copied from the package that
declares it; each snippet matches the shape `_blank-mfe` and `demo-mfe` ship. Read the
skeleton for anything not listed here. An MFE imports the whole ecosystem from
`@gears-frontx/react`, which re-exports the framework and SDK surfaces; name another
package only inside a `declare module` block.

## Module augmentation targets

| Interface | Augment on | Why |
| --- | --- | --- |
| `RootState` | `@gears-frontx/state` | Declared there once; `@gears-frontx/react` only re-exports it, so augmenting `react` reaches `useAppSelector` but leaves `getStore().getState()` typed `unknown` (TS2571). |
| `EventPayloadMap` | `@gears-frontx/react` | `react` re-declares the interface (`export interface EventPayloadMap extends FrameworkEventPayloadMap {}`) and types its own `eventBus` with it. |

Every file carrying a `declare module` block needs a top-level `import` or `export`, or
TypeScript reads it as a script and the block REPLACES the module instead of augmenting
it (TS2305 on every ecosystem import in the package).

## State: createSlice, registerSlice, useAppSelector

```ts
function createSlice<TState, TReducers extends SliceCaseReducers<TState>, TName extends string = string>(
  options: CreateSliceOptions<TState, TReducers, TName>): FrontXSliceResult<TState, TReducers, TName>;
function registerSlice<TState>(slice: SliceObject<TState>, initEffects?: EffectInitializer): void;
const useAppSelector: TypedUseSelectorHook<RootState>;
```

`createSlice` returns `{ slice, ...reducerFunctions }`; register the `slice` member, not
the whole result. The slice `name` is the state key, and with `RootState` augmented
`useAppSelector((state) => state['billing/home']?.status)` is typed without a cast.

```ts
import { createSlice, type ReducerPayload } from '@gears-frontx/react';

const { slice, setStatus } = createSlice({
  name: 'billing/home',
  initialState: { status: 'idle' as 'idle' | 'saved' },
  reducers: { setStatus: (state, payload: ReducerPayload<'idle' | 'saved'>) => { state.status = payload.payload; } },
});
export const homeSlice = slice;
export { setStatus };

declare module '@gears-frontx/state' {
  interface RootState { 'billing/home': { status: 'idle' | 'saved' } }
}
```

## Events: eventBus

```ts
emit<K extends keyof TEvents>(event: K, ...args: TEvents[K] extends void ? [] : [TEvents[K]]): void;
on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): Subscription;  // { unsubscribe(): void }
once(...): Subscription;  clear(event: string): void;  clearAll(): void;
```

Actions emit, effects subscribe and dispatch, components call actions.

```ts
// src/events/homeEvents.ts - `export {}` keeps the file a module (see the augmentation note above)
export {};
declare module '@gears-frontx/react' {
  interface EventPayloadMap { 'mfe/home/save-requested': { name: string } }
}

// src/actions/homeActions.ts
import { eventBus } from '@gears-frontx/react';
import '../events/homeEvents';
export function requestSave(name: string): void { eventBus.emit('mfe/home/save-requested', { name }); }

// src/effects/homeEffects.ts - the only place that dispatches
import { eventBus, type AppDispatch } from '@gears-frontx/react';
export function initHomeEffects(dispatch: AppDispatch): void {
  eventBus.on('mfe/home/save-requested', () => { dispatch(setStatus('saved')); });
}
```

## API service and endpoint descriptors

```ts
query<TData>(path: string, options?: EndpointOptions): EndpointDescriptor<TData>;
queryWith<TData, TParams>(pathFn: (params: TParams) => string, options?: EndpointOptions): ParameterizedEndpointDescriptor<TData, TParams>;
mutation<TData, TVariables>(method: MutationMethod, path: string): MutationDescriptor<TData, TVariables>;
```

Cache keys derive from `[baseURL, method, path]`; never write a key factory.

```ts
export class BillingApiService extends BaseApiService {
  constructor() {
    const restProtocol = new RestProtocol({ timeout: 30000 });
    super({ baseURL: '/api/billing' }, restProtocol, new RestEndpointProtocol(restProtocol));
    this.registerPlugin(restProtocol, new RestMockPlugin({ mockMap: billingMockMap, delay: 100 }));
  }
  readonly getStatus = this.protocol(RestEndpointProtocol).query<GetStatusResponse>('/status');
  readonly saveName = this.protocol(RestEndpointProtocol).mutation<GetStatusResponse, { name: string }>('PUT', '/name');
}
```

## Mocks and bootstrap order

`type MockMap = Record<string, MockResponseFactory<JsonValue, JsonCompatible>>`, keyed
`'<METHOD> <full path including baseURL>'`. `mock()` in the plugin chain activates the
registered plugins; `apiRegistry.register` must run BEFORE `.build()`, because the mock
plugin syncs during build, and `registerSlice` AFTER it, because it needs the store.

```ts
export const billingMockMap: MockMap = { 'GET /api/billing/status': (): GetStatusResponse => ({ status: 'ok' }) };

apiRegistry.register(BillingApiService);   // register<T extends BaseApiService>(serviceClass: new () => T): void
apiRegistry.initialize();
const mfeApp = createFrontX().use(effects()).use(queryCacheShared()).use(mock()).build();
registerSlice(homeSlice, initHomeEffects);
```

## Data hooks

```ts
useApiQuery<TData = unknown, TError = Error>(descriptor: EndpointDescriptor<TData>, overrides?: ApiQueryOverrides): ApiQueryResult<TData, TError>;
// ApiQueryResult: { data, error, isLoading, isFetching, isError, refetch }
useApiMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(options): ApiMutationResult<TData, TError, TVariables>;
// options: { endpoint, cancelOnSupersede?, abortOnUnmount?, onMutate?, onSuccess?, onError?, onSettled? }
// ApiMutationResult: { mutate, mutateAsync, isPending, error, data, reset }
```

Every mutation callback receives `MutationCallbackContext` (`{ queryCache }`) as its LAST
argument. `QueryCache` takes descriptors directly, not raw key arrays:

```ts
get<T>(k: EndpointDescriptor<unknown> | QueryCacheKey): T | undefined;
set<T>(k, dataOrUpdater: T | ((old: T | undefined) => T | undefined)): void;
cancel(k): Promise<void>;  invalidate(k): Promise<void>;  invalidateMany(filters?): Promise<void>;  remove(k): void;
```

```ts
const service = apiRegistry.getService(BillingApiService);
const { data, isLoading, isError, error } = useApiQuery(service.getStatus);
const { mutateAsync, isPending } = useApiMutation({
  endpoint: service.saveName,
  onMutate: async (vars, { queryCache }) => {
    await queryCache.cancel(service.getStatus);
    return { snapshot: queryCache.get<GetStatusResponse>(service.getStatus) };
  },
  onError: (_e, _v, ctx, { queryCache }) => { if (ctx?.snapshot) queryCache.set(service.getStatus, ctx.snapshot); },
  onSettled: async (_d, _e, _v, _c, { queryCache }) => { await queryCache.invalidate(service.getStatus); },
});
```

## Bridge: theme and language

```ts
getProperty(propertyTypeId: string): SharedProperty | undefined;   // SharedProperty: { id: string; value: unknown }
subscribeToProperty(propertyTypeId: string, callback: (value: SharedProperty) => void): () => void;
```

`value` is `unknown`, so narrow it with `typeof` rather than a cast. Read the current
value in a lazy `useState` initializer and use the effect only to SUBSCRIBE - a setState
in an effect body is what `react-hooks/set-state-in-effect` rejects. `bridge.domainId`
and `bridge.instanceId` are plain string properties.

```ts
import { FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';

const [theme, setTheme] = useState<string>(() => {
  const initial = bridge.getProperty(FRONTX_SHARED_PROPERTY_THEME);
  return initial && typeof initial.value === 'string' ? initial.value : 'default';
});
useEffect(() => bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_THEME, (p) => {
  if (typeof p.value === 'string') setTheme(p.value);
}), [bridge]);
```
