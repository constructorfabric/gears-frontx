/**
 * Supported Languages - All 36 FrontX supported languages
 *
 * Based on major platforms (Google, Facebook, Microsoft, Apple).
 * Includes native names, English names, and text direction.
 */
// @cpt-dod:cpt-frontx-dod-i18n-infrastructure-language-support:p1

import { Language, TextDirection } from './types';
import type { LanguageMetadata } from './types';

/**
 * All supported languages with metadata.
 * This list defines what languages the application can use.
 */
// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-western
export const SUPPORTED_LANGUAGES: LanguageMetadata[] = [
  // Western European
  {
    code: Language.English,
    name: 'English',
    englishName: 'English',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Spanish,
    name: 'Español',
    englishName: 'Spanish',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.French,
    name: 'Français',
    englishName: 'French',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.German,
    name: 'Deutsch',
    englishName: 'German',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Italian,
    name: 'Italiano',
    englishName: 'Italian',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Portuguese,
    name: 'Português',
    englishName: 'Portuguese',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Dutch,
    name: 'Nederlands',
    englishName: 'Dutch',
    direction: TextDirection.LeftToRight,
  },
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-western

  // Eastern European
// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-eastern
  {
    code: Language.Russian,
    name: 'Русский',
    englishName: 'Russian',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Polish,
    name: 'Polski',
    englishName: 'Polish',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Ukrainian,
    name: 'Українська',
    englishName: 'Ukrainian',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Czech,
    name: 'Čeština',
    englishName: 'Czech',
    direction: TextDirection.LeftToRight,
  },
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-eastern

  // Middle East & North Africa (RTL)
// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-mena
  {
    code: Language.Arabic,
    name: 'العربية',
    englishName: 'Arabic',
    direction: TextDirection.RightToLeft,
  },
  {
    code: Language.Hebrew,
    name: 'עברית',
    englishName: 'Hebrew',
    direction: TextDirection.RightToLeft,
  },
  {
    code: Language.Persian,
    name: 'فارسی',
    englishName: 'Persian',
    direction: TextDirection.RightToLeft,
  },
  {
    code: Language.Urdu,
    name: 'اردو',
    englishName: 'Urdu',
    direction: TextDirection.RightToLeft,
  },
  {
    code: Language.Turkish,
    name: 'Türkçe',
    englishName: 'Turkish',
    direction: TextDirection.LeftToRight,
  },
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-mena

  // Asian
// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-asian
  {
    code: Language.ChineseSimplified,
    name: '简体中文',
    englishName: 'Chinese (Simplified)',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.ChineseTraditional,
    name: '繁體中文',
    englishName: 'Chinese (Traditional)',
    direction: TextDirection.LeftToRight,
    region: 'TW',
  },
  {
    code: Language.Japanese,
    name: '日本語',
    englishName: 'Japanese',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Korean,
    name: '한국어',
    englishName: 'Korean',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Vietnamese,
    name: 'Tiếng Việt',
    englishName: 'Vietnamese',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Thai,
    name: 'ไทย',
    englishName: 'Thai',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Indonesian,
    name: 'Bahasa Indonesia',
    englishName: 'Indonesian',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Hindi,
    name: 'हिन्दी',
    englishName: 'Hindi',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Bengali,
    name: 'বাংলা',
    englishName: 'Bengali',
    direction: TextDirection.LeftToRight,
  },
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-asian

  // Nordic
// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-nordic
  {
    code: Language.Swedish,
    name: 'Svenska',
    englishName: 'Swedish',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Danish,
    name: 'Dansk',
    englishName: 'Danish',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Norwegian,
    name: 'Norsk',
    englishName: 'Norwegian',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Finnish,
    name: 'Suomi',
    englishName: 'Finnish',
    direction: TextDirection.LeftToRight,
  },
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-nordic

  // Other
// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-remaining
  {
    code: Language.Greek,
    name: 'Ελληνικά',
    englishName: 'Greek',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Romanian,
    name: 'Română',
    englishName: 'Romanian',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Hungarian,
    name: 'Magyar',
    englishName: 'Hungarian',
    direction: TextDirection.LeftToRight,
  },

  // Additional major languages
  {
    code: Language.Malay,
    name: 'Bahasa Melayu',
    englishName: 'Malay',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Tagalog,
    name: 'Tagalog',
    englishName: 'Tagalog',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Tamil,
    name: 'தமிழ்',
    englishName: 'Tamil',
    direction: TextDirection.LeftToRight,
  },
  {
    code: Language.Swahili,
    name: 'Kiswahili',
    englishName: 'Swahili',
    direction: TextDirection.LeftToRight,
  },
];
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-array-remaining

/**
 * Get language metadata by code.
 *
 * @param code - Language code
 * @returns Language metadata or undefined
 */
export function getLanguageMetadata(code: Language): LanguageMetadata | undefined {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code);
}

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-2
/**
 * Get RTL language codes.
 *
 * @returns Array of RTL language codes
 */
export function getRTLLanguages(): Language[] {
  return SUPPORTED_LANGUAGES
    .filter((lang) => lang.direction === TextDirection.RightToLeft)
    .map((lang) => lang.code);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-language-support:p1:inst-2

/**
 * Check if a language code is valid.
 *
 * @param code - Language code to check
 * @returns True if valid
 */
export function isValidLanguage(code: string): code is Language {
  return SUPPORTED_LANGUAGES.some((lang) => lang.code === code);
}
