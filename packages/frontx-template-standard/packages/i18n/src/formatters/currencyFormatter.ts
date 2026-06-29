/**
 * Currency formatter - Locale-aware currency formatting
 *
 * Uses i18nRegistry.getLanguage() for locale; fallback to Language.English when null.
 * null, undefined, and NaN return ''; invalid currencyCode also returns '' and does not throw.
 */
// @cpt-dod:cpt-frontx-dod-i18n-infrastructure-formatters:p1

import { getLocale, toNumber } from './utils';

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-8
/**
 * Format a value as currency for the given currency code.
 *
 * @param value - Numeric amount
 * @param currencyCode - ISO 4217 currency code (e.g. 'USD', 'EUR')
 * @returns Formatted currency string, or '' if value is null, undefined, NaN, or currencyCode is invalid
 */
export function formatCurrency(
  value: number | null | undefined,
  currencyCode: string
): string {
  const n = toNumber(value);
  if (n === null) return '';
  if (!currencyCode || typeof currencyCode !== 'string') return '';
  const locale = getLocale();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(n);
  } catch {
    return '';
  }
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-8
