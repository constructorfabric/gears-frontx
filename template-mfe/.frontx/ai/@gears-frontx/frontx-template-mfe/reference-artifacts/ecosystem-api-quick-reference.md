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

## Recurring type pitfalls

Three errors show up in almost every run, each from this repo's configuration.

**1. Mock payloads are `JsonValue`, not your response type.** `MockMap` is
`Record<string, MockResponseFactory<JsonValue, JsonCompatible>>` with
`MockResponseFactory<TRequest, TResponse> = (requestData?: TRequest) => TResponse`, so a
factory read out of the map returns `JsonCompatible` and its `requestData` arrives
`JsonValue | undefined` - property access raises TS2339, TS18047 on the optional
parameter. Annotate each factory's RETURN, narrow the request body once inside it, and
assert the response type at the test's call site:

```ts
export const blankMockMap: MockMap = {
  'GET /api/blank/status': (): GetBlankStatusResponse => ({ message: '...', generatedAt: '...', capabilities: [] }),
  // demo-mfe's mocks.ts narrows the body once, at the top of the factory:
  'PUT /api/blank/name': (requestData): GetBlankStatusResponse => toStatus((requestData ?? {}) as Partial<UpdateNameRequest>),
};
const response = blankMockMap['GET /api/blank/status']() as GetBlankStatusResponse;  // mocks.test.ts
```

Screens never hit this: `useApiQuery(service.getStatus)` takes `TData` from the descriptor,
so `data` is `GetBlankStatusResponse | undefined` - narrow with `isLoading`/`isError`.

**2. `Array.prototype.at` is not in the lib target - TS2550.** An MFE's `tsconfig.json`
sets `"lib": ["ES2020", "DOM", "DOM.Iterable"]` and `at` arrived in ES2022. Index instead
of raising `lib` for one call, the way the shell does (`Popup.tsx`, `Header.tsx`):
`const last = items[items.length - 1];`

**3. jest-dom matchers raise TS2339 - jest-dom is not installed.** The shared setup file
(`vitest.setup.ts`, wired in through `SHARED_VITEST_SETUP_FILES` by `vitest.mfe.base.ts`)
registers React Testing Library cleanup and global teardown and nothing else, and
`@testing-library/jest-dom` is in no `package.json` here - there is no import or
`/// <reference>` that turns those matchers on, and adding the dependency is a repo-wide
decision, not a test file's. Use plain Vitest matchers, as the shipped tests do:

```ts
expect(screen.getByText(label)).toBeTruthy();       // not toBeInTheDocument()
expect(screen.queryByText(label)).toBeNull();       // not not.toBeInTheDocument()
expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
expect(screen.getByLabelText<HTMLInputElement>('first_name_label').value).toBe('Grace');  // not toHaveValue()
```

## Screen translations: nothing calls `t()` during the load window

`useScreenTranslations(languageModules, bridge)` returns `{ t, loading }`. It starts
`loading: true` with an EMPTY translation map, loads the locale module asynchronously, and
only then flips `loading` to `false`. Inside the window, `t(key)` finds nothing, logs
`[useScreenTranslations] Missing translation key: <key>` and returns the KEY as its value -
no throw, no red gate, just raw keys on screen and a warning per call. Two rules keep a
screen out of it:

**1. Gate every `t()`-dependent render path on `loading`.** Return the placeholder branch
first and read `t()` only after it - one early return covers the whole screen:

```tsx
const { t, loading } = useScreenTranslations(languageModules, bridge);
if (loading) return <div className={styles.screen} role="status" aria-busy="true" />;
```

**2. Derive translated collections with `useMemo(..., [t])`, never a `useState`
initializer.** `t` is a `useCallback` keyed on the loaded map, so its identity CHANGES when
translations arrive - a `useMemo` on `[t]` recomputes then, while a `useState` initializer
runs once, during the load window, and freezes whatever it captured:

```tsx
// Wrong: computed once, before translations exist - these labels stay raw keys forever.
const [filters] = useState(() => [{ id: 'all', label: t('filter_all') }]);

// Right: recomputed when `t` changes identity as the locale module lands.
const filters = useMemo(() => [{ id: 'all', label: t('filter_all') }], [t]);
```

Module scope is the same defect one level worse: a `const` array built at import time has no
`t` at all. Two scaffolding runs lost a verification walk to this class - one shipped a
filter bar of raw keys, the other logged ~20 missing-key warnings per mount - and both read
as "translations broken" while the loader was working correctly.

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

## Screen skeleton (edit, do not re-derive)

Copy this shape and edit the names. Every signature in it is the one the packages
declare at this revision; re-deriving them costs a red gate cycle each.

```tsx
import React, { useState } from 'react';  // the default import is what puts React.FormEvent in scope
import { apiRegistry, useApiMutation, useApiQuery, useAppSelector } from '@gears-frontx/react';
import { Button } from '../../components/ui/button';  // the package's own components, not an ecosystem import
import { Card, CardContent } from '../../components/ui/card';
import { BillingApiService } from '../../api/BillingApiService';
import type { GetStatusResponse } from '../../api/types';
import { requestSave } from '../../actions/homeActions';

export const HomeScreen = () => {
  const service = apiRegistry.getService(BillingApiService);
  const [name, setName] = useState('');  // uncommitted draft - the ONLY thing useState holds
  // The outcome the screen keeps showing after the mutation settles is client-owned.
  const status = useAppSelector((state) => state['billing/home']?.status);

  const { data, isLoading, isError, error } = useApiQuery(service.getStatus);  // TData from the descriptor - narrow, never cast

  // ApiMutationResult has exactly: mutate, mutateAsync, isPending, error, data, reset.
  const { mutateAsync, isPending } = useApiMutation<GetStatusResponse, Error, { name: string }, { snapshot?: GetStatusResponse }>({
    endpoint: service.saveName,
    // MutationCallbackContext ({ queryCache }) is always the LAST argument.
    onMutate: async (_variables, { queryCache }) => {
      await queryCache.cancel(service.getStatus);
      return { snapshot: queryCache.get<GetStatusResponse>(service.getStatus) };
    },
    onError: (_error, _variables, context, { queryCache }) => {
      if (context?.snapshot) queryCache.set(service.getStatus, context.snapshot);
    },
    onSettled: async (_data, _error, _variables, _context, { queryCache }) => {
      await queryCache.invalidate(service.getStatus);
    },
  });

  if (isLoading) return <div role="status" aria-busy="true" data-testid="screen-loading" />;
  if (isError) return <p data-testid="screen-status-error">{error?.message}</p>;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await mutateAsync({ name });
    requestSave(name);  // the action emits, the effect dispatches, the slice keeps the outcome
  };

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={onSubmit}>
          <label className="font-medium" htmlFor="name">Name</label>
          <input
            id="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="screen-name-input"
          />
          <Button type="submit" disabled={isPending} data-testid="screen-submit">Save</Button>
        </form>
        <p data-testid="screen-status">{status ?? data?.message}</p>
      </CardContent>
    </Card>
  );
};
```

The components under `src/components/ui/` belong to the MFE package that ships them,
so a screen imports them by relative path and no ecosystem package declares them. What
a solution puts there is its own decision - swapping them for a component library is a
package-level change, and only the imports in this block move with it.
