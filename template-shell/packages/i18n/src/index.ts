/**
 * @gears-frontx/i18n - Internationalization
 *
 * This package provides:
 * - Language enum with 36 supported languages
 * - Translation registry with namespace support
 * - RTL support for Arabic, Hebrew, Persian, Urdu
 * - Lazy loading with dynamic imports
 *
 * SDK Layer: L1 (Zero @gears-frontx dependencies)
 */

// Re-export enums and constants
export {
  TextDirection,
  Language,
  LanguageDisplayMode,
  I18N_NAMESPACE_SEPARATOR,
  I18N_PATH_SEPARATOR,
  I18N_DEFAULT_NAMESPACE,
  HTML_LANG_ATTRIBUTE,
  HTML_DIR_ATTRIBUTE,
} from './types';

// Re-export types
export type {
  LanguageMetadata,
  LanguageCode,
  TranslationDictionary,
  TranslationLoader,
  TranslationMap,
  I18nConfig,
  TranslationParams,
  I18nRegistry,
} from './types';

// Export I18n Registry implementation and singleton
export {
  i18nRegistry,
  I18nRegistryImpl,
  createI18nRegistry,
} from './I18nRegistry';

// Export language utilities
export {
  SUPPORTED_LANGUAGES,
  getLanguageMetadata,
  getRTLLanguages,
  isValidLanguage,
} from './languages';

// Export formatters (locale from i18nRegistry.getLanguage())
export {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelative,
  formatNumber,
  formatPercent,
  formatCompact,
  formatCurrency,
  compareStrings,
  createCollator,
  type DateFormatStyle,
  type TimeFormatStyle,
  type DateInput,
  type Formatters,
} from './formatters';
