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

## UI kit components

Imported from `@gears-frontx/ui-kit`. Each takes `className` (merged after the kit's own
class) and forwards the rest to its element or Base UI primitive; only the props past that
are listed. Styled markup only - no data table, no form library.

```
Button       variant?: 'default'|'destructive'|'outline'|'secondary'|'ghost'|'link'; size?: 'default'|'sm'|'lg'
             icon?: ReactNode; loading?: boolean; focusableWhenDisabled?: boolean; render?; nativeButton?
Input        Base UI Input props: type, value/defaultValue, onValueChange(value, eventDetails), disabled
Field        name?: string; disabled?: boolean; invalid?: boolean; validate?: (value) => string|string[]|null
             FieldLabel, FieldDescription, FieldError (match?: 'valueMissing'|'typeMismatch'|...)
Card         size?: 'default'|'sm'; CardHeader/CardTitle/CardDescription/CardAction/CardContent/CardFooter
Table        label?: string (names the focusable scroll wrapper); density?: 'default'|'compact'
             TableHeader/TableBody/TableFooter/TableRow/TableHead/TableCell/TableCaption
Checkbox     checked?/defaultChecked?: boolean; onCheckedChange?: (checked: boolean, eventDetails) => void
             indeterminate?: boolean; name?: string; disabled?: boolean
Skeleton     ComponentProps<'div'> only
```

```tsx
<Field name="email">
  <FieldLabel>Email</FieldLabel>
  <Input type="email" required placeholder="you@company.com" />
  <FieldError match="valueMissing">Email is required.</FieldError>
</Field>
<Checkbox aria-label="Select row" checked={selected} onCheckedChange={setSelected} />
<Button variant="secondary" size="sm" loading={isPending}>Save</Button>
<Card><CardHeader><CardTitle>Bridge</CardTitle></CardHeader><CardContent>{body}</CardContent></Card>
<Table label="Invoices"><TableHeader><TableRow><TableHead>Id</TableHead></TableRow></TableHeader>
  <TableBody><TableRow><TableCell>{id}</TableCell></TableRow></TableBody></Table>
```

`icon` is the only right place for a Button icon; with no children the button goes
icon-only and needs its own `aria-label`, and `loading` reports through `aria-busy`
without setting the native `disabled` property, so a `:disabled` selector misses it.
Card's slots stay DIRECT children - the card's `gap` falls between them, so a `<form>`
wrapped around them spaces nothing; put the form inside a slot. Skeleton carries no
loading semantics - `role="status"` and `aria-busy` belong on the region around it.
