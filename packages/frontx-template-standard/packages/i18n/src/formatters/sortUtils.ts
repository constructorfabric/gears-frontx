/**
 * Sort utilities - Locale-aware string comparison
 *
 * Uses i18nRegistry.getLanguage() for locale; fallback to Language.English when null.
 */
// @cpt-dod:cpt-frontx-dod-i18n-infrastructure-formatters:p1

import { getLocale } from './utils';

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-9
/**
 * Compare two strings according to the current locale (for sorting).
 *
 * @param a - First string
 * @param b - Second string
 * @param options - Intl.Collator options (e.g. sensitivity, numeric)
 * @returns Negative if a < b, 0 if equal, positive if a > b
 */
export function compareStrings(
  a: string,
  b: string,
  options?: Intl.CollatorOptions
): number {
  const locale = getLocale();
  return new Intl.Collator(locale, options).compare(a, b);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-9

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-10
/**
 * Create a Collator for the current locale (reuse for many comparisons, e.g. in tables).
 *
 * @param options - Intl.Collator options
 * @returns Intl.Collator instance
 */
export function createCollator(options?: Intl.CollatorOptions): Intl.Collator {
  const locale = getLocale();
  return new Intl.Collator(locale, options);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-10
