/**
 * I18n Registry - Central translation management
 *
 * Implements namespace-based translation loading with:
 * - Lazy loading for screenset/screen translations
 * - RTL/LTR support
 * - Parameter interpolation
 *
 * SDK Layer: L1 (Zero @gears-frontx dependencies)
 */
// @cpt-flow:cpt-hai3-flow-i18n-infrastructure-language-activation:p1
// @cpt-flow:cpt-hai3-flow-i18n-infrastructure-screenset-registration:p1
// @cpt-flow:cpt-hai3-flow-i18n-infrastructure-screen-lazy-load:p1
// @cpt-flow:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1
// @cpt-algo:cpt-hai3-algo-i18n-infrastructure-language-file-map:p1
// @cpt-algo:cpt-hai3-algo-i18n-infrastructure-create-loader:p1
// @cpt-algo:cpt-hai3-algo-i18n-infrastructure-lazy-exclusion:p1
// @cpt-algo:cpt-hai3-algo-i18n-infrastructure-html-attrs:p1
// @cpt-algo:cpt-hai3-algo-i18n-infrastructure-path-traversal:p1
// @cpt-state:cpt-hai3-state-i18n-infrastructure-registry:p1
// @cpt-state:cpt-hai3-state-i18n-infrastructure-namespace-cache:p1
// @cpt-dod:cpt-hai3-dod-i18n-infrastructure-hybrid-namespace:p1
// @cpt-dod:cpt-hai3-dod-i18n-infrastructure-lazy-chunks:p1

import type {
  I18nRegistry as II18nRegistry,
  I18nConfig,
  TranslationDictionary,
  TranslationLoader,
  TranslationParams,
  TranslationMap,
  LanguageMetadata,
} from './types';

import {
  Language,
  TextDirection,
  I18N_NAMESPACE_SEPARATOR,
  I18N_PATH_SEPARATOR,
  I18N_DEFAULT_NAMESPACE,
  HTML_LANG_ATTRIBUTE,
  HTML_DIR_ATTRIBUTE,
} from './types';

import { SUPPORTED_LANGUAGES } from './languages';

// ============================================================================
// I18n Registry Implementation
// ============================================================================

/**
 * I18n Registry Implementation
 *
 * Central registry for managing translations across the application.
 * Supports lazy loading, namespace isolation, and RTL languages.
 */
export class I18nRegistryImpl implements II18nRegistry {
  /** Configuration */
  private config: I18nConfig;

  /** Current language */
  private currentLanguage: Language | null = null;

  /** Translation dictionaries: namespace -> language -> dictionary */
  private dictionaries: Map<string, Map<Language, TranslationDictionary>> = new Map();

  /** Translation loaders: namespace -> loader function */
  private loaders: Map<string, TranslationLoader> = new Map();

  /** Subscribers for translation changes */
  private subscribers: Set<() => void> = new Set();

  /** Version counter for React re-rendering */
  private version: number = 0;

  // @cpt-begin:cpt-hai3-algo-i18n-infrastructure-language-file-map:p1:inst-1
  /** Language file mapping */
  static readonly LANGUAGE_FILE_MAP: Record<Language, string> = {
    [Language.English]: 'en.json',
    [Language.Spanish]: 'es.json',
    [Language.French]: 'fr.json',
    [Language.German]: 'de.json',
    [Language.Italian]: 'it.json',
    [Language.Portuguese]: 'pt.json',
    [Language.Dutch]: 'nl.json',
    [Language.Russian]: 'ru.json',
    [Language.Polish]: 'pl.json',
    [Language.Ukrainian]: 'uk.json',
    [Language.Czech]: 'cs.json',
    [Language.Arabic]: 'ar.json',
    [Language.Hebrew]: 'he.json',
    [Language.Persian]: 'fa.json',
    [Language.Urdu]: 'ur.json',
    [Language.Turkish]: 'tr.json',
    [Language.ChineseSimplified]: 'zh.json',
    [Language.ChineseTraditional]: 'zh-TW.json',
    [Language.Japanese]: 'ja.json',
    [Language.Korean]: 'ko.json',
    [Language.Vietnamese]: 'vi.json',
    [Language.Thai]: 'th.json',
    [Language.Indonesian]: 'id.json',
    [Language.Hindi]: 'hi.json',
    [Language.Bengali]: 'bn.json',
    [Language.Swedish]: 'sv.json',
    [Language.Danish]: 'da.json',
    [Language.Norwegian]: 'no.json',
    [Language.Finnish]: 'fi.json',
    [Language.Greek]: 'el.json',
    [Language.Romanian]: 'ro.json',
    [Language.Hungarian]: 'hu.json',
    [Language.Malay]: 'ms.json',
    [Language.Tagalog]: 'tl.json',
    [Language.Tamil]: 'ta.json',
    [Language.Swahili]: 'sw.json',
  };
  // @cpt-end:cpt-hai3-algo-i18n-infrastructure-language-file-map:p1:inst-1

  constructor(config: I18nConfig) {
    this.config = config;
  }

  // ============================================================================
  // Registration
  // ============================================================================

  // @cpt-begin:cpt-hai3-state-i18n-infrastructure-namespace-cache:p1:inst-1
  /**
   * Register translations for a namespace.
   */
  register(namespace: string, language: Language, translations: TranslationDictionary): void {
    if (!this.dictionaries.has(namespace)) {
      this.dictionaries.set(namespace, new Map());
    }
    this.dictionaries.get(namespace)!.set(language, translations);
    this.notifySubscribers();
  }
  // @cpt-end:cpt-hai3-state-i18n-infrastructure-namespace-cache:p1:inst-1

  /**
   * Subscribe to translation changes.
   * Returns an unsubscribe function.
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of a change.
   */
  private notifySubscribers(): void {
    this.version++;
    this.subscribers.forEach((callback) => callback());
  }

  /**
   * Get the current version number.
   * Used by React to detect changes.
   */
  getVersion(): number {
    return this.version;
  }

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-screenset-registration:p1:inst-1
  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-screen-lazy-load:p1:inst-1
  /**
   * Register a translation loader for a namespace.
   */
  registerLoader(namespace: string, loader: TranslationLoader): void {
    this.loaders.set(namespace, loader);
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-screenset-registration:p1:inst-1
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-screen-lazy-load:p1:inst-1

  /**
   * Check if namespace is registered.
   */
  hasNamespace(namespace: string): boolean {
    return this.dictionaries.has(namespace) || this.loaders.has(namespace);
  }

  /**
   * Get all registered namespaces.
   */
  getNamespaces(): string[] {
    const namespaces = new Set<string>();
    this.dictionaries.forEach((_, key) => namespaces.add(key));
    this.loaders.forEach((_, key) => namespaces.add(key));
    return Array.from(namespaces);
  }

  // ============================================================================
  // Translation
  // ============================================================================

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-1
  /**
   * Translate a key.
   * Format: 'namespace:key.subkey' or just 'key' for default namespace
   */
  t(key: string, params?: TranslationParams): string {
    // Parse namespace and path
    const { namespace, path } = this.parseKey(key);

    // Get translation from dictionary
    const translation = this.getTranslation(namespace, path);

    // Return key if no translation found
    if (translation === undefined) {
      return key;
    }

    // Interpolate parameters
    return this.interpolate(translation, params);
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-1

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-2
  /**
   * Parse a translation key into namespace and path.
   */
  private parseKey(key: string): { namespace: string; path: string } {
    const separatorIndex = key.indexOf(I18N_NAMESPACE_SEPARATOR);

    if (separatorIndex === -1) {
      return {
        namespace: I18N_DEFAULT_NAMESPACE,
        path: key,
      };
    }

    return {
      namespace: key.slice(0, separatorIndex),
      path: key.slice(separatorIndex + 1),
    };
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-2

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-3
  /**
   * Get a translation from the dictionary.
   */
  private getTranslation(namespace: string, path: string): string | undefined {
    const language = this.currentLanguage ?? this.config.defaultLanguage;
    const fallback = this.config.fallbackLanguage;

    // Try current language first
    let translation = this.findTranslation(namespace, language, path);
    if (translation !== undefined) {
      return translation;
    }

    // Try fallback language
    if (language !== fallback) {
      translation = this.findTranslation(namespace, fallback, path);
      if (translation !== undefined) {
        return translation;
      }
    }

    return undefined;
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-3

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-4
  // @cpt-begin:cpt-hai3-algo-i18n-infrastructure-path-traversal:p1:inst-1
  /**
   * Find a translation in the dictionary.
   */
  private findTranslation(
    namespace: string,
    language: Language,
    path: string
  ): string | undefined {
    const namespaceDicts = this.dictionaries.get(namespace);
    if (!namespaceDicts) {
      return undefined;
    }

    const dict = namespaceDicts.get(language);
    if (!dict) {
      return undefined;
    }

    // Navigate nested path
    const parts = path.split(I18N_PATH_SEPARATOR);
    let current: TranslationDictionary | string = dict;

    for (const part of parts) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }
      current = current[part] as TranslationDictionary | string;
      if (current === undefined) {
        return undefined;
      }
    }

    return typeof current === 'string' ? current : undefined;
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-4
  // @cpt-end:cpt-hai3-algo-i18n-infrastructure-path-traversal:p1:inst-1

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-5
  /**
   * Interpolate parameters into a translation string.
   */
  private interpolate(text: string, params?: TranslationParams): string {
    if (!params) {
      return text;
    }

    return text.replace(/\{(\w+)\}/g, (match, key) => {
      const value = params[key];
      return value !== undefined ? String(value) : match;
    });
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-key-resolution:p1:inst-5

  // ============================================================================
  // Language Management
  // ============================================================================

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-language-activation:p1:inst-1
  // @cpt-begin:cpt-hai3-state-i18n-infrastructure-registry:p1:inst-1
  /**
   * Set current language and load translations.
   */
  async setLanguage(language: Language): Promise<void> {
    this.currentLanguage = language;

    // Update HTML attributes
    this.updateHtmlAttributes(language);

    // Load translations for the language
    await this.loadLanguage(language);
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-language-activation:p1:inst-1
  // @cpt-end:cpt-hai3-state-i18n-infrastructure-registry:p1:inst-1

  /**
   * Get current language.
   */
  getLanguage(): Language | null {
    return this.currentLanguage;
  }

  // @cpt-begin:cpt-hai3-algo-i18n-infrastructure-html-attrs:p1:inst-1
  /**
   * Update HTML lang and dir attributes.
   */
  private updateHtmlAttributes(language: Language): void {
    if (typeof document === 'undefined') {
      return; // Skip in SSR/Node.js environment
    }

    const htmlElement = document.documentElement;
    htmlElement.setAttribute(HTML_LANG_ATTRIBUTE, language);
    htmlElement.setAttribute(
      HTML_DIR_ATTRIBUTE,
      this.isRTL(language) ? TextDirection.RightToLeft : TextDirection.LeftToRight
    );
  }
  // @cpt-end:cpt-hai3-algo-i18n-infrastructure-html-attrs:p1:inst-1

  // ============================================================================
  // Language Metadata
  // ============================================================================

  /**
   * Get language metadata.
   */
  getLanguageMetadata(code?: Language): LanguageMetadata | undefined {
    const targetCode = code ?? this.currentLanguage;
    if (!targetCode) {
      return undefined;
    }
    return SUPPORTED_LANGUAGES.find((lang) => lang.code === targetCode);
  }

  /**
   * Get all supported languages.
   */
  getSupportedLanguages(): LanguageMetadata[] {
    return [...SUPPORTED_LANGUAGES];
  }

  /**
   * Check if a language is RTL.
   */
  isRTL(code?: Language): boolean {
    const targetCode = code ?? this.currentLanguage;
    if (!targetCode) {
      return false;
    }
    const metadata = this.getLanguageMetadata(targetCode);
    return metadata?.direction === TextDirection.RightToLeft;
  }

  // ============================================================================
  // Translation Loading
  // ============================================================================

  // @cpt-begin:cpt-hai3-algo-i18n-infrastructure-lazy-exclusion:p1:inst-1
  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-language-activation:p1:inst-2
  /**
   * Load translations for a language.
   * Excludes screen.* and screenset.* namespaces which are lazy-loaded:
   * - screen.* namespaces: loaded when screen mounts
   * - screenset.* namespaces: loaded when screenset is activated
   */
  async loadLanguage(language: Language): Promise<void> {
    const loadPromises: Promise<void>[] = [];

    this.loaders.forEach((_loader, namespace) => {
      // Skip screen and screenset namespaces (lazy-loaded on demand)
      if (namespace.startsWith('screen.') || namespace.startsWith('screenset.')) {
        return;
      }
      loadPromises.push(this.loadNamespace(namespace, language));
    });

    await Promise.all(loadPromises);
  }
  // @cpt-end:cpt-hai3-algo-i18n-infrastructure-lazy-exclusion:p1:inst-1
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-language-activation:p1:inst-2

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-screen-lazy-load:p1:inst-2
  /**
   * Load translations for a specific namespace.
   */
  private async loadNamespace(namespace: string, language: Language): Promise<void> {
    const loader = this.loaders.get(namespace);
    if (!loader) {
      return;
    }

    try {
      const translations = await loader(language);
      this.register(namespace, language, translations);
    } catch (error) {
      console.warn(`Failed to load translations for ${namespace}/${language}:`, error);
    }
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-screen-lazy-load:p1:inst-2

  // @cpt-begin:cpt-hai3-flow-i18n-infrastructure-screenset-registration:p1:inst-2
  /**
   * Load translations for a specific screenset.
   */
  async loadScreensetTranslations(screensetId: string, language?: Language): Promise<void> {
    const targetLanguage = language ?? this.currentLanguage ?? this.config.defaultLanguage;
    const namespace = `screenset.${screensetId}`;

    await this.loadNamespace(namespace, targetLanguage);
  }
  // @cpt-end:cpt-hai3-flow-i18n-infrastructure-screenset-registration:p1:inst-2

  /**
   * Preload translations for multiple languages.
   */
  async preloadLanguages(languages: Language[]): Promise<void> {
    const loadPromises = languages.map((language) => this.loadLanguage(language));
    await Promise.all(loadPromises);
  }

  // ============================================================================
  // Static Helpers
  // ============================================================================

  /**
   * Create a translation loader from a translation map.
   *
   * @example
   * ```typescript
   * const loader = I18nRegistry.createLoader({
   *   [Language.English]: () => import('./i18n/en.json'),
   *   [Language.Spanish]: () => import('./i18n/es.json'),
   * });
   * ```
   */
  // @cpt-begin:cpt-hai3-algo-i18n-infrastructure-create-loader:p1:inst-1
  // @cpt-begin:cpt-hai3-dod-i18n-infrastructure-lazy-chunks:p1:inst-1
  static createLoader(translationMap: TranslationMap): TranslationLoader {
    return async (language: Language | string): Promise<TranslationDictionary> => {
      const importFn = translationMap[language as Language];
      if (!importFn) {
        throw new Error(`No translation found for language: ${language}`);
      }
      const module = await importFn();
      return module.default;
    };
  }
  // @cpt-end:cpt-hai3-algo-i18n-infrastructure-create-loader:p1:inst-1
  // @cpt-end:cpt-hai3-dod-i18n-infrastructure-lazy-chunks:p1:inst-1

  /**
   * Create a translation loader from a directory.
   * Maps Language enum values to file names automatically.
   *
   * @param basePath - Base path for translation files
   * @param importFn - Dynamic import function
   */
  static createLoaderFromDirectory(
    importFn: (filename: string) => Promise<{ default: TranslationDictionary }>
  ): TranslationLoader {
    return async (language: Language | string): Promise<TranslationDictionary> => {
      const filename = I18nRegistryImpl.LANGUAGE_FILE_MAP[language as Language];
      const module = await importFn(filename);
      return module.default;
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

// @cpt-begin:cpt-hai3-state-i18n-infrastructure-registry:p1:inst-2
// @cpt-begin:cpt-hai3-dod-i18n-infrastructure-language-support:p1:inst-1
/**
 * Default i18n registry instance.
 * Use this instance throughout the application.
 */
export const i18nRegistry = new I18nRegistryImpl({
  defaultLanguage: Language.English,
  fallbackLanguage: Language.English,
});
// @cpt-end:cpt-hai3-state-i18n-infrastructure-registry:p1:inst-2
// @cpt-end:cpt-hai3-dod-i18n-infrastructure-language-support:p1:inst-1

/**
 * Create a new i18n registry with custom configuration.
 *
 * @param config - I18n configuration
 * @returns New I18nRegistry instance
 */
export function createI18nRegistry(config: I18nConfig): I18nRegistryImpl {
  return new I18nRegistryImpl(config);
}
