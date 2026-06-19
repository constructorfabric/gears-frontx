
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

// OPTIONAL: With pre-built app
const app = createHAI3().use(screensets()).build();
<HAI3Provider app={app}>
```

## AVAILABLE HOOKS

| Hook | Purpose | Returns |
|------|---------|---------|
| `useHAI3()` | Access app instance | HAI3App |
| `useAppDispatch()` | Typed dispatch | AppDispatch |
| `useAppSelector()` | Typed selector | Selected state |
| `useTranslation()` | Translation utilities | `{ t, language, setLanguage, isRTL }` |
| `useScreenTranslations()` | Load screen translations | `{ isLoaded, error }` |
| `useNavigation()` | Navigation utilities | `{ navigateToScreen, currentScreen }` |
| `useTheme()` | Theme utilities | `{ currentTheme, themes, setTheme }` |

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

## STOP CONDITIONS
- Using hooks outside HAI3Provider.
- Using raw react-redux instead of provided hooks.
- Adding layout components to this package.
- Forgetting TextLoader wrapper for translations.

## PRE-DIFF CHECKLIST
- [ ] App wrapped with HAI3Provider.
- [ ] Using provided hooks (not raw react-redux).
- [ ] Screen translations lazy loaded.
- [ ] TextLoader wraps translated content.
- [ ] Screen component has default export.
