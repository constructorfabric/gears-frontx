# Feature: Internationalization Infrastructure

- [x] `p1` - **ID**: `cpt-hai3-featstatus-i18n-infrastructure`

<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Language Activation](#language-activation)
  - [Screenset Translation Registration](#screenset-translation-registration)
  - [Screen Translation Registration and Lazy Load](#screen-translation-registration-and-lazy-load)
  - [Translation Key Resolution](#translation-key-resolution)
  - [Formatter Usage](#formatter-usage)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Language File Mapping](#language-file-mapping)
  - [Create Translation Loader](#create-translation-loader)
  - [Namespace Lazy-Load Exclusion](#namespace-lazy-load-exclusion)
  - [HTML Attribute Synchronization](#html-attribute-synchronization)
  - [Translation Path Traversal](#translation-path-traversal)
  - [Formatter Locale Resolution](#formatter-locale-resolution)
  - [Graceful Formatter Input Validation](#graceful-formatter-input-validation)
- [4. States (CDSL)](#4-states-cdsl)
  - [Language Registry State](#language-registry-state)
  - [Namespace Cache State](#namespace-cache-state)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Language Support and Registry](#language-support-and-registry)
  - [Locale-Aware Formatters](#locale-aware-formatters)
  - [Hybrid Namespace Model](#hybrid-namespace-model)
  - [Lazy Chunk Loading](#lazy-chunk-loading)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [x] `p2` - `cpt-hai3-feature-i18n-infrastructure`

---

## 1. Feature Context

### 1.1 Overview

Internationalization Infrastructure provides the foundational i18n layer for the entire HAI3 system. It covers 36 built-in language configurations, locale-aware formatting utilities, a hybrid two-tier namespace model for translations, and lazy on-demand chunk loading per namespace. The package is an L1 SDK concern with zero `@gears-frontx/*` dependencies, consumed by `@gears-frontx/framework` (which initializes and propagates language state) and by `@gears-frontx/react` (which exposes `useTranslation()` and `useFormatters()` hooks).

Problem: Translation files historically load monolithically, wasting bandwidth; locale-aware formatting logic is duplicated across screens; there is no consistent namespace pattern to colocate screen translations with screen components.

Primary value: Enables lazy, namespace-scoped translation loading that grows proportionally with the number of screens visited, not the total number of screens in the application — while exposing a single, tree-shakeable formatter API driven by the active locale.

Key assumptions: Consumers register translation loaders before activating a language. The framework layer owns language lifecycle events (`i18n/language/changed`); this package owns the registry, formatters, and loading mechanics only.

### 1.2 Purpose

Expose a complete, zero-dependency i18n foundation so that host applications, screen-sets, and MFEs share consistent translation and formatting patterns without incurring the cost of loading all translations up front.

Success criteria: Application initial bundle contains no translation JSON beyond what is explicitly pre-loaded; every locale-aware formatter returns a correct locale string or `''` for invalid inputs; the `I18nRegistry` singleton correctly resolves two-tier namespace keys.

### 1.3 Actors

- `cpt-hai3-actor-developer` — Platform engineer who wires the i18n plugin into `createHAI3()` and selects the initial language.
- `cpt-hai3-actor-screenset-author` — Developer who registers translation loaders per screenset/screen and authors JSON translation files.

### 1.4 References

- PRD: [PRD.md](../../PRD.md) — sections 5.12 (i18n Formatters), 5.13 (i18n Loading)
- DESIGN: [DESIGN.md](../../DESIGN.md) — `cpt-hai3-component-i18n`, principles `cpt-hai3-principle-self-registering-registries`, constraints `cpt-hai3-constraint-no-react-below-l3`, `cpt-hai3-constraint-zero-cross-deps-at-l1`
- DECOMPOSITION: [DECOMPOSITION.md](../../DECOMPOSITION.md) — feature `cpt-hai3-feature-i18n-infrastructure` (section 2.5)
- ADR: `cpt-hai3-adr-hybrid-namespace-localization`
- Related feature: `cpt-hai3-feature-react-bindings` — screen translation hook and loading flow

---

## 2. Actor Flows (CDSL)

### Language Activation

- [x] `p1` - **ID**: `cpt-hai3-flow-i18n-infrastructure-language-activation`

**Actors**: `cpt-hai3-actor-developer`

1. [x] `p1` - Framework calls `i18nRegistry.setLanguage(language)` — `inst-set-language`
2. [x] `p1` - Registry stores the language as current, then calls `updateHtmlAttributes` — `inst-update-html-attrs`
3. [x] `p1` - Registry iterates all registered loaders, skipping namespaces whose prefix is `screen.` or `screenset.` — `inst-filter-lazy-namespaces`
4. [x] `p1` - FOR EACH non-lazy namespace: Registry calls the registered loader with the language code, awaits the result, and calls `register(namespace, language, translations)` — `inst-load-global-namespaces`
5. [x] `p1` - Registry increments the version counter and notifies all subscribers — `inst-notify-subscribers`
6. [x] `p1` - RETURN resolved Promise — `inst-return-activation`

### Screenset Translation Registration

- [x] `p1` - **ID**: `cpt-hai3-flow-i18n-infrastructure-screenset-registration`

**Actors**: `cpt-hai3-actor-screenset-author`

1. [x] `p1` - Screenset module calls `i18nRegistry.registerLoader('screenset.{screensetId}', loader)` where loader is produced by `I18nRegistryImpl.createLoader(translationMap)` — `inst-register-screenset-loader`
2. [x] `p1` - Registry stores the loader in its internal loader map keyed by the namespace — `inst-store-loader`
3. [x] `p1` - At screenset activation time, framework calls `i18nRegistry.loadScreensetTranslations(screensetId)` — `inst-trigger-screenset-load`
4. [x] `p1` - Registry resolves target language (current language or configured default), calls loader with that language, and registers the resulting dictionary — `inst-load-screenset-translations`
5. [x] `p1` - Registry increments version and notifies subscribers — `inst-notify-after-screenset`

### Screen Translation Registration and Lazy Load

- [x] `p1` - **ID**: `cpt-hai3-flow-i18n-infrastructure-screen-lazy-load`

**Actors**: `cpt-hai3-actor-screenset-author`

1. [x] `p1` - Screen module calls `i18nRegistry.registerLoader('screen.{screensetId}.{screenId}', loader)` — `inst-register-screen-loader`
2. [x] `p1` - React.lazy() loads the screen component chunk when the user navigates to the screen — `inst-react-lazy-load`
3. [x] `p1` - Screen component triggers translation load for namespace `screen.{screensetId}.{screenId}` for the current language — `inst-trigger-screen-load`
4. [x] `p1` - IF translations for that namespace and language are already cached: RETURN immediately without a network request — `inst-cache-hit`
5. [x] `p1` - IF not cached: Registry calls the registered loader with the current language — `inst-invoke-loader`
6. [x] `p2` - IF the loader throws (e.g. missing JSON file): Registry logs a warning and does not crash; the key is returned verbatim from `t()` — `inst-load-failure-graceful`
7. [x] `p1` - Registry stores the loaded dictionary and notifies subscribers — `inst-cache-and-notify`

### Translation Key Resolution

- [x] `p1` - **ID**: `cpt-hai3-flow-i18n-infrastructure-key-resolution`

**Actors**: `cpt-hai3-actor-screenset-author`

1. [x] `p1` - Caller invokes `i18nRegistry.t('namespace:path.to.key', params?)` — `inst-call-t`
2. [x] `p1` - Registry splits key on the `:` separator to extract namespace and dot-delimited path — `inst-parse-key`
3. [x] `p1` - IF no `:` present: namespace resolves to `'app'` (default namespace) — `inst-default-namespace`
4. [x] `p1` - Registry looks up the dictionary for `(namespace, currentLanguage)` and traverses the dot path — `inst-lookup-current-lang`
5. [x] `p1` - IF no match in current language: Registry retries with `fallbackLanguage` (English) — `inst-fallback-lang`
6. [x] `p1` - IF still no match: Registry returns the original key string verbatim — `inst-return-key-verbatim`
7. [x] `p1` - IF match found and `params` present: Registry replaces all `{paramName}` tokens in the string — `inst-interpolate`
8. [x] `p1` - RETURN resolved string — `inst-return-translation`

### Formatter Usage

- [x] `p1` - **ID**: `cpt-hai3-flow-i18n-infrastructure-formatter-usage`

**Actors**: `cpt-hai3-actor-screenset-author`

1. [x] `p1` - Caller imports a formatter function from `@gears-frontx/i18n` (e.g. `formatDate`, `formatCurrency`) — `inst-import-formatter`
2. [x] `p1` - Formatter calls `getLocale()` which reads `i18nRegistry.getLanguage() ?? Language.English` — `inst-get-locale`
3. [x] `p1` - Formatter constructs the appropriate `Intl` object (`Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, or `Intl.Collator`) with the resolved locale — `inst-construct-intl`
4. [x] `p2` - IF input value is null, undefined, or invalid (NaN, invalid Date): formatter returns `''` without throwing — `inst-graceful-invalid`
5. [x] `p1` - Formatter formats the value and RETURN the locale-appropriate string — `inst-return-formatted`

---

## 3. Processes / Business Logic (CDSL)

### Language File Mapping

- [x] `p1` - **ID**: `cpt-hai3-algo-i18n-infrastructure-language-file-map`

Maps each of the 36 `Language` enum values to its canonical JSON filename. The mapping is a compile-time exhaustive `Record<Language, string>` so TypeScript enforces completeness.

1. [x] `p1` - FOR EACH Language enum member: map to `{locale-code}.json` (e.g. `Language.English → 'en.json'`, `Language.ChineseTraditional → 'zh-TW.json'`) — `inst-map-all-languages`
2. [x] `p1` - IF any Language member is absent from the map: TypeScript compilation MUST fail — `inst-exhaustive-check`

### Create Translation Loader

- [x] `p1` - **ID**: `cpt-hai3-algo-i18n-infrastructure-create-loader`

`I18nRegistryImpl.createLoader(translationMap)` produces a `TranslationLoader` function from an explicit `TranslationMap` (one dynamic import function per language).

1. [x] `p1` - Accept a `TranslationMap` — a `Record<Language, () => Promise<{ default: TranslationDictionary }>>` — `inst-accept-translation-map`
2. [x] `p1` - RETURN a `TranslationLoader` function that, when called with a `Language`, invokes the corresponding import function from the map — `inst-return-loader-fn`
3. [x] `p1` - IF the language key is absent from the map: THROW an error with a clear message identifying the missing language — `inst-missing-language-error`
4. [x] `p1` - RETURN `module.default` from the resolved import as `TranslationDictionary` — `inst-unwrap-default`

### Namespace Lazy-Load Exclusion

- [x] `p1` - **ID**: `cpt-hai3-algo-i18n-infrastructure-lazy-exclusion`

During `loadLanguage(language)`, namespaces prefixed with `screen.` or `screenset.` are excluded from the global load batch. This separates concerns: global namespaces load eagerly on language switch; screen-scoped namespaces load on demand.

1. [x] `p1` - FOR EACH namespace in the loaders map: — `inst-iterate-loaders`
2. [x] `p1` - IF namespace starts with `'screen.'` OR starts with `'screenset.'`: SKIP (do not load) — `inst-skip-lazy-prefix`
3. [x] `p1` - OTHERWISE: add `loadNamespace(namespace, language)` to the batch — `inst-batch-global`
4. [x] `p1` - Await all batch promises concurrently — `inst-await-batch`

### HTML Attribute Synchronization

- [x] `p1` - **ID**: `cpt-hai3-algo-i18n-infrastructure-html-attrs`

When a language is activated the DOM `<html>` element's `lang` and `dir` attributes must be updated to match, enabling CSS direction-aware rules and screen-reader language announcements.

1. [x] `p1` - IF `document` is undefined (SSR / Node.js): RETURN immediately without error — `inst-ssr-guard`
2. [x] `p1` - Set `document.documentElement.lang` to the language enum value (BCP 47 code, e.g. `'ar'`) — `inst-set-lang`
3. [x] `p1` - IF `isRTL(language)` is true: set `document.documentElement.dir` to `'rtl'` — `inst-set-rtl`
4. [x] `p1` - ELSE: set `document.documentElement.dir` to `'ltr'` — `inst-set-ltr`

### Translation Path Traversal

- [x] `p1` - **ID**: `cpt-hai3-algo-i18n-infrastructure-path-traversal`

Resolves a dot-delimited path string against a nested `TranslationDictionary`.

1. [x] `p1` - Split path on `'.'` to produce an ordered list of segments — `inst-split-path`
2. [x] `p1` - FOR EACH segment: descend into the current node — `inst-traverse-segment`
3. [x] `p1` - IF the current node is not an object or the segment is absent: RETURN `undefined` — `inst-missing-segment`
4. [x] `p1` - IF the final node is a string: RETURN that string — `inst-return-string`
5. [x] `p1` - IF the final node is a nested object (not a leaf): RETURN `undefined` — `inst-non-leaf`

### Formatter Locale Resolution

- [x] `p1` - **ID**: `cpt-hai3-algo-i18n-infrastructure-locale-resolution`

All formatters resolve the active locale through a single shared utility before constructing any `Intl` object.

1. [x] `p1` - Call `i18nRegistry.getLanguage()` — `inst-get-language`
2. [x] `p1` - IF result is null (no language set): use `Language.English` as locale — `inst-fallback-to-english`
3. [x] `p1` - RETURN the resolved BCP 47 locale string — `inst-return-locale`

### Graceful Formatter Input Validation

- [x] `p2` - **ID**: `cpt-hai3-algo-i18n-infrastructure-formatter-input-guard`

Every formatter validates its primary input before passing it to the `Intl` layer.

1. [x] `p2` - IF input is `null` or `undefined`: RETURN `''` — `inst-null-check`
2. [x] `p2` - IF input is a number and `isNaN(input)`: RETURN `''` — `inst-nan-check`
3. [x] `p2` - IF input is a `Date` or date-convertible and produces an invalid Date: RETURN `''` — `inst-invalid-date-check`
4. [x] `p2` - RETURN the formatted string — `inst-return-formatted-guarded`

---

## 4. States (CDSL)

### Language Registry State

- [x] `p1` - **ID**: `cpt-hai3-state-i18n-infrastructure-registry`

Tracks the lifecycle of the `i18nRegistry` singleton across language switches.

1. [x] `p1` - **FROM** `UNINITIALIZED` **TO** `IDLE` **WHEN** singleton instance is created with default config (`defaultLanguage: English`, `fallbackLanguage: English`) — `inst-init`
2. [x] `p1` - **FROM** `IDLE` **TO** `LOADING` **WHEN** `setLanguage(language)` is called — `inst-begin-load`
3. [x] `p1` - **FROM** `LOADING` **TO** `IDLE` **WHEN** all non-lazy namespace loaders have resolved — `inst-load-complete`
4. [x] `p2` - **FROM** `LOADING` **TO** `IDLE` **WHEN** one or more namespace loaders reject (errors are swallowed and logged; the registry remains operational) — `inst-load-partial-failure`
5. [x] `p1` - **SELF-TRANSITION** on `IDLE` **WHEN** `registerLoader` is called (no language change required) — `inst-register-loader`
6. [x] `p1` - **SELF-TRANSITION** on `IDLE` **WHEN** `loadScreensetTranslations` completes (on-demand load, does not change registry state) — `inst-screenset-loaded`

### Namespace Cache State

- [x] `p1` - **ID**: `cpt-hai3-state-i18n-infrastructure-namespace-cache`

Tracks the loaded/unloaded state per `(namespace, language)` pair.

1. [x] `p1` - **FROM** `UNLOADED` **TO** `LOADED` **WHEN** `register(namespace, language, dictionary)` is called for the first time for that pair — `inst-first-register`
2. [x] `p1` - **SELF-TRANSITION** on `LOADED` **WHEN** `register` is called again for the same pair (overwrite; version increments) — `inst-overwrite`
3. [x] `p2` - `UNLOADED` state is permanent for a pair until a successful load; a failed load does not create a `LOADED` entry — `inst-failed-remains-unloaded`

---

## 5. Definitions of Done

### Language Support and Registry

- [x] `p1` - **ID**: `cpt-hai3-dod-i18n-infrastructure-language-support`

`@gears-frontx/i18n` exports the `Language` enum with exactly 36 members covering Western European, Eastern European, Middle East/North Africa (RTL), Asian, Nordic, and other major language groups. The `SUPPORTED_LANGUAGES` array provides `LanguageMetadata` for each, and `getRTLLanguages()` returns the four RTL language codes (Arabic, Hebrew, Persian, Urdu). The singleton `i18nRegistry` is initialized with `defaultLanguage: English` and `fallbackLanguage: English`. `createI18nRegistry(config)` allows consumers to construct a custom instance.

**Implements**:
- `cpt-hai3-flow-i18n-infrastructure-language-activation`
- `cpt-hai3-algo-i18n-infrastructure-html-attrs`
- `cpt-hai3-state-i18n-infrastructure-registry`

**Covers (PRD)**:
- `cpt-hai3-fr-sdk-i18n-package`

**Covers (DESIGN)**:
- `cpt-hai3-component-i18n`
- `cpt-hai3-constraint-zero-cross-deps-at-l1`
- `cpt-hai3-constraint-no-react-below-l3`

### Locale-Aware Formatters

- [x] `p1` - **ID**: `cpt-hai3-dod-i18n-infrastructure-formatters`

All ten formatter functions (`formatDate`, `formatTime`, `formatDateTime`, `formatRelative`, `formatNumber`, `formatPercent`, `formatCompact`, `formatCurrency`, `compareStrings`, `createCollator`) are implemented and exported from `@gears-frontx/i18n`. Each uses `i18nRegistry.getLanguage() ?? Language.English` as the locale source. Invalid inputs return `''` without throwing. All public API signatures use explicit TypeScript types; no `any` in public surface. `DateFormatStyle`, `TimeFormatStyle`, `DateInput`, and the `Formatters` aggregate interface are exported.

**Implements**:
- `cpt-hai3-flow-i18n-infrastructure-formatter-usage`
- `cpt-hai3-algo-i18n-infrastructure-locale-resolution`
- `cpt-hai3-algo-i18n-infrastructure-formatter-input-guard`

**Covers (PRD)**:
- `cpt-hai3-fr-i18n-formatters`
- `cpt-hai3-fr-i18n-formatter-exports`
- `cpt-hai3-fr-i18n-graceful-invalid`

**Covers (DESIGN)**:
- `cpt-hai3-component-i18n`
- `cpt-hai3-constraint-zero-cross-deps-at-l1`

### Hybrid Namespace Model

- [x] `p1` - **ID**: `cpt-hai3-dod-i18n-infrastructure-hybrid-namespace`

The `I18nRegistryImpl` enforces a two-tier namespace convention: `screenset.{id}` for shared screenset-level translations and `screen.{screensetId}.{screenId}` for screen-specific translations. The `':'` character separates namespace from key path; `'.'` separates path segments. The `t()` method resolves keys through path traversal with current-language-first and English-fallback lookup. When a key is not found at either tier, the verbatim key string is returned.

**Implements**:
- `cpt-hai3-flow-i18n-infrastructure-key-resolution`
- `cpt-hai3-algo-i18n-infrastructure-path-traversal`

**Covers (PRD)**:
- `cpt-hai3-fr-i18n-hybrid-namespace`

**Covers (DESIGN)**:
- `cpt-hai3-component-i18n`
- `cpt-hai3-principle-self-registering-registries`
- `cpt-hai3-adr-hybrid-namespace-localization`

### Lazy Chunk Loading

- [x] `p1` - **ID**: `cpt-hai3-dod-i18n-infrastructure-lazy-chunks`

`I18nRegistryImpl.createLoader(translationMap)` is a static factory that accepts an exhaustive `TranslationMap` and returns a `TranslationLoader`. `loadLanguage(language)` loads all non-lazy namespaces concurrently; namespaces prefixed `screen.` or `screenset.` are excluded from this batch and must be loaded on demand via `loadScreensetTranslations(screensetId)` or a screen-level trigger. Successfully loaded translation dictionaries are cached; repeat navigation to a screen does not re-fetch its translations. The `LANGUAGE_FILE_MAP` static property provides the exhaustive `Record<Language, string>` mapping used by `createLoaderFromDirectory`.

**Implements**:
- `cpt-hai3-flow-i18n-infrastructure-screenset-registration`
- `cpt-hai3-flow-i18n-infrastructure-screen-lazy-load`
- `cpt-hai3-algo-i18n-infrastructure-create-loader`
- `cpt-hai3-algo-i18n-infrastructure-lazy-exclusion`
- `cpt-hai3-algo-i18n-infrastructure-language-file-map`
- `cpt-hai3-state-i18n-infrastructure-namespace-cache`

**Covers (PRD)**:
- `cpt-hai3-fr-i18n-lazy-chunks`
- `cpt-hai3-nfr-perf-lazy-loading`
- `cpt-hai3-nfr-perf-treeshake`

**Covers (DESIGN)**:
- `cpt-hai3-component-i18n`
- `cpt-hai3-constraint-esm-first-module-format`

---

## 6. Acceptance Criteria

- [x] `@gears-frontx/i18n` has zero `@gears-frontx/*` runtime dependencies; `npm ls` shows no cross-SDK imports
- [x] `Language` enum has exactly 36 members; `SUPPORTED_LANGUAGES` has exactly 36 entries; `getRTLLanguages()` returns exactly `['ar', 'he', 'fa', 'ur']`
- [x] `i18nRegistry.setLanguage(Language.Arabic)` sets `document.documentElement.dir` to `'rtl'` and `document.documentElement.lang` to `'ar'`
- [x] Calling `loadLanguage(language)` does NOT invoke any loader whose namespace starts with `'screen.'` or `'screenset.'`
- [x] `i18nRegistry.t('screenset.demo:models.gpt4')` returns the nested value from a registered dictionary; returns the key verbatim when no dictionary is registered
- [x] `i18nRegistry.t('app:key', { name: 'Alice' })` interpolates `{name}` tokens in the resolved string
- [x] `I18nRegistryImpl.createLoader(translationMap)` throws with a descriptive message when called with a language absent from the map
- [x] `formatDate(null)` returns `''`; `formatNumber(NaN)` returns `''`; `formatCurrency(undefined, 'USD')` returns `''`
- [x] `formatDate(new Date(), 'short')` returns a non-empty string formatted for the current locale
- [x] `formatCurrency(1234.56, 'EUR')` returns a locale-appropriate currency string (symbol position and decimal separators match the active language)
- [x] Navigating to a screen twice triggers the screen's translation loader at most once (cache hit on second navigation)
- [x] `npx tsc --noEmit` passes with no errors in `packages/i18n/`
- [x] All formatter functions are individually importable from `@gears-frontx/i18n` (tree-shaking verified by bundle analysis)
