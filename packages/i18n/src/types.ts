/**
 * @gears-frontx/i18n - Type Definitions
 *
 * Core types for HAI3 internationalization.
 * Supports 36 languages with RTL support.
 */

// ============================================================================
// Text Direction
// ============================================================================

/**
 * Text Direction Enum
 * Defines text direction for RTL language support.
 */
export enum TextDirection {
  LeftToRight = 'ltr',
  RightToLeft = 'rtl',
}

// ============================================================================
// Language Enum
// ============================================================================

/**
 * Language Enum
 * All 36 supported languages based on major platforms (Google, Facebook, Microsoft, Apple).
 */
export enum Language {
  // Western European
  English = 'en',
  Spanish = 'es',
  French = 'fr',
  German = 'de',
  Italian = 'it',
  Portuguese = 'pt',
  Dutch = 'nl',

  // Eastern European
  Russian = 'ru',
  Polish = 'pl',
  Ukrainian = 'uk',
  Czech = 'cs',

  // Middle East & North Africa (RTL)
  Arabic = 'ar',
  Hebrew = 'he',
  Persian = 'fa',
  Urdu = 'ur',
  Turkish = 'tr',

  // Asian
  ChineseSimplified = 'zh',
  ChineseTraditional = 'zh-TW',
  Japanese = 'ja',
  Korean = 'ko',
  Vietnamese = 'vi',
  Thai = 'th',
  Indonesian = 'id',
  Hindi = 'hi',
  Bengali = 'bn',

  // Nordic
  Swedish = 'sv',
  Danish = 'da',
  Norwegian = 'no',
  Finnish = 'fi',

  // Other
  Greek = 'el',
  Romanian = 'ro',
  Hungarian = 'hu',

  // Additional major languages
  Malay = 'ms',
  Tagalog = 'tl',
  Tamil = 'ta',
  Swahili = 'sw',
}

// ============================================================================
// Language Metadata
// ============================================================================

/**
 * Language Metadata
 * Complete information about a supported language.
 */
export interface LanguageMetadata {
  /** Language code (from Language enum) */
  code: Language;
  /** Native name (e.g., 'English', 'العربية') */
  name: string;
  /** English name for settings UI */
  englishName: string;
  /** Text direction */
  direction: TextDirection;
  /** Optional region (e.g., 'US', 'GB', 'TW') */
  region?: string;
}

/**
 * Language Code Type
 * Type alias for language codes.
 */
export type LanguageCode = Language;

// ============================================================================
// Translation Types
// ============================================================================

/**
 * Translation Dictionary
 * Nested key-value structure for translations.
 *
 * @example
 * ```typescript
 * const translations: TranslationDictionary = {
 *   button: {
 *     submit: 'Submit',
 *     cancel: 'Cancel',
 *   },
 *   messages: {
 *     success: 'Operation completed successfully',
 *   },
 * };
 * ```
 */
export interface TranslationDictionary {
  [key: string]: string | TranslationDictionary;
}

/**
 * Translation Loader Function
 * Returns translations for a given language using dynamic import.
 * Accepts both Language enum and string for compatibility with @gears-frontx/layout.
 *
 * @example
 * ```typescript
 * const loader: TranslationLoader = async (language) => {
 *   const module = await import(`./i18n/${language}.json`);
 *   return module.default;
 * };
 * ```
 */
export type TranslationLoader = (language: Language | string) => Promise<TranslationDictionary>;

/**
 * Translation Map
 * Maps languages to their dynamic import functions.
 * Used by I18nRegistry.createLoader().
 *
 * @example
 * ```typescript
 * const translationMap: TranslationMap = {
 *   [Language.English]: () => import('./i18n/en.json'),
 *   [Language.Spanish]: () => import('./i18n/es.json'),
 *   // ... all 36 languages
 * };
 * ```
 */
export type TranslationMap = Record<Language, () => Promise<{ default: TranslationDictionary }>>;

// ============================================================================
// I18n Configuration
// ============================================================================

/**
 * I18n Configuration
 * Configuration options for the i18n system.
 */
export interface I18nConfig {
  /** Default language to use */
  defaultLanguage: LanguageCode;
  /** Fallback language when translation is missing */
  fallbackLanguage: LanguageCode;
}

/**
 * Translation Parameters
 * Parameters for string interpolation.
 *
 * @example
 * ```typescript
 * // Translation: "Hello, {name}!"
 * t('greeting', { name: 'John' });  // "Hello, John!"
 * ```
 */
export type TranslationParams = Record<string, string | number | boolean>;

// ============================================================================
// I18n Registry Interface
// ============================================================================

/**
 * I18n Registry Interface
 * Central registry for translation management.
 *
 * @example
 * ```typescript
 * // Register translations
 * i18nRegistry.registerLoader('screenset.demo', demoLoader);
 *
 * // Set language
 * await i18nRegistry.setLanguage(Language.Spanish);
 *
 * // Translate
 * const text = i18nRegistry.t('screenset.demo:welcome.title');
 * ```
 */
export interface I18nRegistry {
  /**
   * Register translations for a namespace.
   *
   * @param namespace - Translation namespace (e.g., 'screenset.demo')
   * @param language - Language enum value
   * @param translations - Translation dictionary
   */
  register(namespace: string, language: Language, translations: TranslationDictionary): void;

  /**
   * Register a translation loader for a namespace.
   * Loader is called on-demand when language changes.
   *
   * @param namespace - Namespace identifier
   * @param loader - Function that loads translations
   */
  registerLoader(namespace: string, loader: TranslationLoader): void;

  /**
   * Translate a key.
   *
   * @param key - Format: 'namespace:key.subkey' or just 'key' for default namespace
   * @param params - Interpolation parameters
   * @returns Translated string
   */
  t(key: string, params?: TranslationParams): string;

  /**
   * Set current language and load translations.
   * Updates HTML lang and dir attributes.
   *
   * @param language - Language to set
   */
  setLanguage(language: Language): Promise<void>;

  /**
   * Get current language.
   *
   * @returns Current language or null if not set
   */
  getLanguage(): Language | null;

  /**
   * Get language metadata.
   *
   * @param code - Optional language code (defaults to current)
   * @returns Language metadata
   */
  getLanguageMetadata(code?: Language): LanguageMetadata | undefined;

  /**
   * Get all supported languages.
   *
   * @returns Array of language metadata
   */
  getSupportedLanguages(): LanguageMetadata[];

  /**
   * Check if current language is RTL.
   *
   * @param code - Optional language code (defaults to current)
   * @returns True if RTL
   */
  isRTL(code?: Language): boolean;

  /**
   * Check if namespace is registered.
   *
   * @param namespace - Namespace to check
   * @returns True if registered
   */
  hasNamespace(namespace: string): boolean;

  /**
   * Get all registered namespaces.
   *
   * @returns Array of namespace identifiers
   */
  getNamespaces(): string[];

  /**
   * Load translations for a specific language.
   *
   * @param language - Language to load
   */
  loadLanguage(language: Language): Promise<void>;

  /**
   * Load translations for a specific screenset.
   *
   * @param screensetId - Screenset ID
   * @param language - Optional language (defaults to current)
   */
  loadScreensetTranslations(screensetId: string, language?: Language): Promise<void>;

  /**
   * Preload translations for multiple languages.
   *
   * @param languages - Languages to preload
   */
  preloadLanguages(languages: Language[]): Promise<void>;

  /**
   * Subscribe to translation changes.
   * Called when new translations are registered.
   *
   * @param callback - Function to call on changes
   * @returns Unsubscribe function
   */
  subscribe(callback: () => void): () => void;

  /**
   * Get the current version number.
   * Increments when translations change. Used by React for re-rendering.
   *
   * @returns Current version number
   */
  getVersion(): number;
}

// ============================================================================
// Display Mode
// ============================================================================

/**
 * Language Display Mode
 * How to display language names in the UI.
 */
export enum LanguageDisplayMode {
  /** Show native name (e.g., 'Español') */
  Native = 'native',
  /** Show English name (e.g., 'Spanish') */
  English = 'english',
}

// ============================================================================
// Constants
// ============================================================================

/**
 * I18n namespace separator constant.
 * Used to separate namespace from key: 'namespace:key'
 */
export const I18N_NAMESPACE_SEPARATOR = ':';

/**
 * I18n path separator constant.
 * Used to separate nested keys: 'key.subkey'
 */
export const I18N_PATH_SEPARATOR = '.';

/**
 * Default namespace for translations without explicit namespace.
 */
export const I18N_DEFAULT_NAMESPACE = 'app';

/**
 * HTML lang attribute name.
 */
export const HTML_LANG_ATTRIBUTE = 'lang';

/**
 * HTML dir attribute name.
 */
export const HTML_DIR_ATTRIBUTE = 'dir';
