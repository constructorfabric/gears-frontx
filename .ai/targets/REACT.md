
# @gears-frontx/react Guidelines (Canonical)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-6 rules from this file before making changes.
2) STOP if you bypass HAI3Provider or use hooks outside provider.

## SCOPE
- Package: `packages/react/`
- Layer: L3 React (depends on @gears-frontx/framework)
- Peer dependencies: `@gears-frontx/framework`, `react`, `react-redux`

## CRITICAL RULES
- All apps wrapped with `<HAI3Provider>`.
- Use provided hooks for state access (not raw react-redux).
- Use `QueryCache` access via `useQueryCache()` or `useApiMutation()` callback context; do not expose raw `QueryClient` to app or MFE code.
- `useApiQuery` and `useApiMutation` accept endpoint descriptors from services, NOT TanStack-specific options.
- Screen translations via `useScreenTranslations()` hook.
- Wrap translated content with `<TextLoader>` to prevent FOUC.
- NO layout components here (use the configured UI kit or app code).

## PROVIDER SETUP
```tsx
// REQUIRED: Wrap app with HAI3Provider
function App() {
  return (
    <HAI3Provider>
      <Layout>
        <AppRouter fallback={<Loading />} />
      </Layout>
    </HAI3Provider>
  );
}

// OPTIONAL: With configuration
<HAI3Provider config={{ devMode: true }}>
  <AppRouter fallback={<Loading />} />
</HAI3Provider>

// OPTIONAL: With pre-built app — register queryCache() before .build() so the app
// carries the shared QueryClient; HAI3Provider resolves it and mounts QueryClientProvider.
import { createHAI3, queryCache, screensets } from '@gears-frontx/react';
const app = createHAI3().use(queryCache()).use(screensets()).build();
<HAI3Provider app={app}>
  <AppRouter fallback={<Loading />} />
</HAI3Provider>

// OPTIONAL: Separately mounted MFE roots — same chain as src/mfe_packages/*/init.ts (SCREENSETS.md).
// apiRegistry before .build (mock syncs at build); registerSlice after .build when you have slices.
import {
  createHAI3,
  apiRegistry,
  effects,
  mock,
  queryCacheShared,
  registerSlice,
} from '@gears-frontx/react';
apiRegistry.register(MyApiService);
apiRegistry.initialize();
const mfeApp = createHAI3().use(effects()).use(queryCacheShared()).use(mock()).build();
registerSlice(mySlice, initMyEffects);
<HAI3Provider app={mfeApp}>
  <AppRouter fallback={<Loading />} />
</HAI3Provider>
```

## AVAILABLE HOOKS

| Hook | Purpose | Returns |
|------|---------|---------|
| `useHAI3()` | Access app instance | HAI3App |
| `useAppDispatch()` | Typed dispatch | AppDispatch |
| `useAppSelector()` | Typed selector | Selected state |
| `useTranslation()` | Translation utilities | `{ t, language, setLanguage, isRTL }` |
| `useScreenTranslations()` | Load screen translations | `{ isLoaded, error }` |
| `useTheme()` | Theme utilities | `{ currentTheme, themes, setTheme }` |
| `useApiQuery()` | Declarative data fetch from endpoint descriptor | `ApiQueryResult<TData>` |
| `useApiMutation()` | Declarative mutation with optimistic update support | `ApiMutationResult<TData>` |
| `useQueryCache()` | Restricted query cache access | `QueryCache` |

## SCREEN TRANSLATIONS
```tsx
// REQUIRED: Use useScreenTranslations for lazy loading
const translations = {
  en: () => import('./i18n/en.json'),
  es: () => import('./i18n/es.json'),
};

function HomeScreen() {
  const { isLoaded } = useScreenTranslations('demo', 'home', translations);
  const { t } = useTranslation();

  if (!isLoaded) return <Loading />;

  return (
    <TextLoader>
      <h1>{t('screen.demo.home:title')}</h1>
    </TextLoader>
  );
}

// REQUIRED: Export default for lazy loading
export default HomeScreen;
```

## DATA FETCHING PATTERN
```tsx
// REQUIRED: Use endpoint descriptors from services
const service = apiRegistry.getService(AccountsApiService);

// Read — pass descriptor directly
const { data, isLoading, error } = useApiQuery(service.getCurrentUser);

// Read with params
const { data } = useApiQuery(service.getUser({ id: '123' }));

// Write — with optimistic update
const { mutateAsync } = useApiMutation({
  endpoint: service.updateProfile,
  onMutate: async (variables, { queryCache }) => {
    const snapshot = queryCache.get(service.getCurrentUser);
    queryCache.set(service.getCurrentUser, (old) => ({ ...old, ...variables }));
    return { snapshot };
  },
  onError: (_err, _vars, context, { queryCache }) => {
    if (context?.snapshot) queryCache.set(service.getCurrentUser, context.snapshot);
  },
});

// Per-endpoint cache override (rare)
const { data } = useApiQuery(service.getConfig, { staleTime: 0 });
```

## STOP CONDITIONS
- Using hooks outside HAI3Provider.
- Using raw react-redux instead of provided hooks.
- Exposing TanStack `useQueryClient()` directly to app or MFE code.
- Importing `queryOptions` from `@tanstack/react-query` or `@gears-frontx/react` in MFE code.
- Creating standalone query modules with manual query key factories in MFE packages.
- Adding layout components to this package.
- Forgetting TextLoader wrapper for translations.

## PRE-DIFF CHECKLIST
- [ ] App wrapped with HAI3Provider.
- [ ] Using provided hooks (not raw react-redux).
- [ ] Data fetching uses `useApiQuery(service.endpoint)` with endpoint descriptors, not `queryOptions()`.
- [ ] No manual query key factories outside service descriptors.
- [ ] Query cache access uses `useQueryCache()` or `useApiMutation()` callback context, not raw `useQueryClient()`.
- [ ] QueryCache operations use endpoint descriptors (e.g., `queryCache.get(service.endpoint)`), not raw key arrays.
- [ ] Screen translations lazy loaded.
- [ ] TextLoader wraps translated content.
- [ ] Screen component has default export.
