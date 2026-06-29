# @gears-frontx/i18n

Internationalization (i18n) system for FrontX applications with 36 supported languages.

## SDK Layer

This package is part of the **SDK Layer (L1)** - it has zero dependencies and can be used independently.

## Core Concepts

### I18nRegistry

Central registry for translations:

```typescript
import { i18nRegistry, Language } from '@gears-frontx/i18n';

// Register translations directly
i18nRegistry.register('common', Language.English, {
  'app.title': 'My App',
  'app.welcome': 'Welcome, {name}!'
});

// Or register lazy loaders
i18nRegistry.registerLoader('screenset.demo', {
  [Language.English]: () => import('./i18n/en.json'),
  [Language.Spanish]: () => import('./i18n/es.json')
});
```

### Translation Keys

Use namespaced keys with colon separator:

```typescript
// Format: namespace:key.subkey
const title = i18nRegistry.t('common:app.title');
const welcome = i18nRegistry.t('common:app.welcome', { name: 'John' });

// Screenset translations
const screenTitle = i18nRegistry.t('screen.demo.home:title');
```

### Language Management

```typescript
import { i18nRegistry, Language } from '@gears-frontx/i18n';

// Set current language (async - loads translations)
await i18nRegistry.setLanguage(Language.Spanish);

// Get current language
const currentLang = i18nRegistry.getLanguage();

// Check text direction
const isRTL = i18nRegistry.isRTL(); // For current language
const isArabicRTL = i18nRegistry.isRTL(Language.Arabic); // For specific language
```

### Supported Languages

36 languages including RTL support:

```typescript
import { Language, SUPPORTED_LANGUAGES, getRTLLanguages } from '@gears-frontx/i18n';

// Language enum
Language.English    // 'en'
Language.Spanish    // 'es'
Language.Arabic     // 'ar'
Language.Japanese   // 'ja'
// ... and 32 more

// Get RTL languages
const rtlLangs = getRTLLanguages();
// ['ar', 'he', 'fa', 'ur']

// Get language metadata
import { getLanguageMetadata } from '@gears-frontx/i18n';
const arabic = getLanguageMetadata(Language.Arabic);
// { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true }
```

### Translation Loader Factory

Create loaders for screenset translations:

```typescript
import { I18nRegistryImpl, Language } from '@gears-frontx/i18n';

const screenTranslations = I18nRegistryImpl.createLoader({
  [Language.English]: () => import('./i18n/en.json'),
  [Language.Spanish]: () => import('./i18n/es.json'),
  [Language.French]: () => import('./i18n/fr.json'),
  // ... all 36 languages
});
```

## Translation Key Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Screenset-level | `screenset.{id}:key` | `screenset.demo:name` |
| Screen-level | `screen.{screenset}.{screen}:key` | `screen.demo.home:title` |
| Common | `common:key` | `common:buttons.save` |

## RTL Languages

The following languages are RTL:
- Arabic (ar)
- Hebrew (he)
- Persian (fa)
- Urdu (ur)

Use `isRTL()` to check and apply appropriate styles.

## Key Rules

1. **Namespace translations** - Use `namespace:key` format
2. **Lazy load screen translations** - Load only when screen mounts
3. **Use parameter interpolation** - `{param}` syntax for dynamic values
4. **Handle RTL** - Check `isRTL()` for text direction

## Exports

- `i18nRegistry` - Singleton registry instance
- `I18nRegistryImpl` - Registry class (for testing/custom instances)
- `Language` - Enum of 36 language codes
- `SUPPORTED_LANGUAGES` - Array of language metadata
- `getLanguageMetadata` - Get metadata for language
- `getRTLLanguages` - Get list of RTL languages
- `isValidLanguage` - Type guard for language codes
- `TranslationLoader` - Loader function type
- `TranslationDictionary` - Flat translation object type
