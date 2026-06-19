# @gears-frontx/react

React bindings and hooks for HAI3 applications. Provides the React integration layer with MFE (Microfrontend) support.

## React Layer

This package is part of the **React Layer (L3)** - it depends only on @gears-frontx/framework (not directly on SDK packages) and provides React-specific components and hooks.

## Core Concepts

### HAI3Provider

Wrap your app with HAI3Provider to enable all hooks:

```tsx
import { HAI3Provider } from '@gears-frontx/react';

function App() {
  return (
    <HAI3Provider>
      <YourApp />
    </HAI3Provider>
  );
}

// With configuration
<HAI3Provider config={{ devMode: true }}>
  <YourApp />
</HAI3Provider>

// With pre-built app
const app = createHAI3().use(screensets()).build();
<HAI3Provider app={app}>
  <YourApp />
</HAI3Provider>
```

### Available Hooks

#### useHAI3

Access the HAI3 app instance:

```tsx
import { useHAI3 } from '@gears-frontx/react';

function MyComponent() {
  const app = useHAI3();

  // Access MFE-enabled registry
  const extensions = app.screensetsRegistry.getRegisteredExtensions();

  // Access MFE actions
  await app.actions.loadExtension({ extensionId: 'home' });
  await app.actions.mountExtension({ extensionId: 'home', domainId: 'screen', container });
}
```

#### useAppDispatch / useAppSelector

Type-safe Redux hooks:

```tsx
import { useAppDispatch, useAppSelector } from '@gears-frontx/react';

function MyComponent() {
  const dispatch = useAppDispatch();
  const activeScreen = useAppSelector((state) => state.layout.screen.activeScreen);
}
```

#### useTranslation

Access translation utilities:

```tsx
import { useTranslation } from '@gears-frontx/react';

function MyComponent() {
  const { t, language, setLanguage, isRTL } = useTranslation();

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <h1>{t('common:title')}</h1>
      <p>{t('common:welcome', { name: 'John' })}</p>
    </div>
  );
}
```

#### useScreenTranslations

Load screen-level translations:

```tsx
import { useScreenTranslations } from '@gears-frontx/react';

const translations = {
  en: () => import('./i18n/en.json'),
  es: () => import('./i18n/es.json'),
};

function HomeScreen() {
  const { isLoaded, error } = useScreenTranslations('demo', 'home', translations);

  if (!isLoaded) return <Loading />;
  if (error) return <Error error={error} />;

  return <div>...</div>;
}
```

#### useTheme

Access theme utilities:

```tsx
import { useTheme } from '@gears-frontx/react';

function ThemeToggle() {
  const { currentTheme, themes, setTheme } = useTheme();

  return (
    <select value={currentTheme} onChange={(e) => setTheme(e.target.value)}>
      {themes.map((theme) => (
        <option key={theme.id} value={theme.id}>{theme.name}</option>
      ))}
    </select>
  );
}
```

### MFE Hooks

#### useMfeBridge

Access the MFE bridge for child MFEs:

```tsx
import { useMfeBridge } from '@gears-frontx/react';
import { HAI3_ACTION_LOAD_EXT, HAI3_SHARED_PROPERTY_THEME } from '@gears-frontx/react';

function MyExtension() {
  const bridge = useMfeBridge();

  // Execute actions chain on parent
  await bridge.executeActionsChain({
    action: { type: HAI3_ACTION_LOAD_EXT, target: 'screen', payload: { extensionId: 'other' } }
  });

  // Get shared property
  const theme = bridge.getProperty(HAI3_SHARED_PROPERTY_THEME);
}
```

#### useSharedProperty

Subscribe to shared property changes:

```tsx
import { useSharedProperty, HAI3_SHARED_PROPERTY_THEME } from '@gears-frontx/react';

function ThemedComponent() {
  const theme = useSharedProperty(HAI3_SHARED_PROPERTY_THEME);

  return <div style={{ backgroundColor: theme?.primaryColor }}>...</div>;
}
```

#### useHostAction

Invoke actions on the host application:

```tsx
import { useHostAction, HAI3_ACTION_LOAD_EXT } from '@gears-frontx/react';

function MyExtension() {
  const loadExtension = useHostAction(HAI3_ACTION_LOAD_EXT);

  const handleClick = () => {
    loadExtension({ extensionId: 'other' });
  };

  return <button onClick={handleClick}>Load Extension</button>;
}
```

#### useDomainExtensions

Subscribe to extensions in a domain:

```tsx
import { useDomainExtensions } from '@gears-frontx/react';

function ScreenList() {
  const screenExtensions = useDomainExtensions('screen');

  return (
    <ul>
      {screenExtensions.map((ext) => (
        <li key={ext.id}>{ext.title}</li>
      ))}
    </ul>
  );
}
```

#### useRegisteredPackages

Subscribe to registered GTS packages:

```tsx
import { useRegisteredPackages } from '@gears-frontx/react';

function PackageList() {
  const packages = useRegisteredPackages();

  return (
    <ul>
      {packages.map((pkg) => (
        <li key={pkg}>{pkg}</li>
      ))}
    </ul>
  );
}
```

#### useActivePackage

Subscribe to the active GTS package (the package of the currently mounted screen extension):

```tsx
import { useActivePackage } from '@gears-frontx/react';

function ActivePackageIndicator() {
  const activePackage = useActivePackage();

  if (!activePackage) {
    return <div>No active screen</div>;
  }

  return <div>Active: {activePackage}</div>;
}
```

### MFE Components

#### MfeProvider

Provide MFE context for child extensions:

```tsx
import { MfeProvider } from '@gears-frontx/react';

function MfeHost() {
  return (
    <MfeProvider bridge={parentBridge}>
      <ExtensionContainer />
    </MfeProvider>
  );
}
```

#### ExtensionDomainSlot

Render extensions into a domain slot:

```tsx
import { ExtensionDomainSlot } from '@gears-frontx/react';

function LayoutScreen() {
  return (
    <div>
      <ExtensionDomainSlot
        domainId="screen"
        containerRef={screenContainerRef}
        fallback={<Loading />}
      />
    </div>
  );
}
```

#### RefContainerProvider

Provide container references for MFE mounting:

```tsx
import { RefContainerProvider } from '@gears-frontx/react';

function Layout() {
  return (
    <RefContainerProvider>
      <ScreenContainer />
      <SidebarContainer />
    </RefContainerProvider>
  );
}
```

### Components

## Key Rules

1. **Wrap with HAI3Provider** - Required for all hooks to work
2. **Use hooks for state access** - Don't import selectors directly from @gears-frontx/framework
3. **Lazy load translations** - Use `useScreenTranslations` for screen-level i18n
4. **Use MFE hooks for extensions** - `useMfeBridge`, `useSharedProperty`, `useHostAction`, `useDomainExtensions`
5. **NO Layout components here** - Layout and UI components belong in L4 (user's project via CLI scaffolding)

## Re-exports

For convenience, this package re-exports everything from @gears-frontx/framework:

- All SDK primitives (eventBus, createStore, etc.)
- All plugins (screensets, themes, layout, microfrontends, etc.)
- All registries and factory functions
- All types (including MFE types)
- All MFE actions, selectors, and domain constants

This allows users to import everything from `@gears-frontx/react` without needing `@gears-frontx/framework` directly.

## Exports

### Components
- `HAI3Provider` - Main context provider
- `MfeProvider` - MFE context provider
- `ExtensionDomainSlot` - Domain slot renderer
- `RefContainerProvider` - Container reference provider

### Hooks
- `useHAI3` - Access app instance
- `useAppDispatch` - Typed dispatch
- `useAppSelector` - Typed selector
- `useTranslation` - Translation utilities
- `useScreenTranslations` - Screen translation loading
- `useTheme` - Theme utilities
- `useMfeBridge` - Access MFE bridge
- `useSharedProperty` - Subscribe to shared property
- `useHostAction` - Invoke host action
- `useDomainExtensions` - Subscribe to domain extensions
- `useRegisteredPackages` - Subscribe to registered GTS packages
- `useActivePackage` - Subscribe to active GTS package

### Context
- `HAI3Context` - React context (for advanced use)
- `MfeContext` - MFE context (for advanced use)

### Types
- `HAI3ProviderProps`
- `MfeProviderProps`, `ExtensionDomainSlotProps`
- `UseTranslationReturn`, `UseThemeReturn`
- All types from @gears-frontx/framework

## Migration from Legacy API

The `useNavigation` hook has been removed. Use MFE hooks and actions instead:

### Removed Hook
- `useNavigation()` (replaced by MFE actions and hooks)

### Migration Examples

**OLD**: Navigate using hook
```tsx
import { useNavigation } from '@gears-frontx/react';

function MyComponent() {
  const { navigateToScreen } = useNavigation();

  return (
    <button onClick={() => navigateToScreen('demo', 'home')}>
      Go Home
    </button>
  );
}
```

**NEW**: Mount extension using app actions
```tsx
import { useHAI3 } from '@gears-frontx/react';

function MyComponent() {
  const app = useHAI3();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNavigate = async () => {
    if (containerRef.current) {
      await app.actions.mountExtension({
        extensionId: 'home',
        domainId: 'screen',
        container: containerRef.current,
      });
    }
  };

  return (
    <>
      <button onClick={handleNavigate}>Go Home</button>
      <div ref={containerRef} />
    </>
  );
}
```

**NEW (Alternative)**: Use ExtensionDomainSlot
```tsx
import { ExtensionDomainSlot } from '@gears-frontx/react';

function MyComponent() {
  return (
    <ExtensionDomainSlot
      domainId="screen"
      containerRef={screenContainerRef}
      fallback={<Loading />}
    />
  );
}
```

See the MFE migration guide in the project documentation for detailed migration steps.
