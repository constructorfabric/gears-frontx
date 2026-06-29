/**
 * Number formatter - Locale-aware number formatting
 *
 * Uses i18nRegistry.getLanguage() for locale; fallback to Language.English when null.
 * null, undefined, and NaN return ''.
 */
// @cpt-dod:cpt-frontx-dod-i18n-infrastructure-formatters:p1

import { getLocale, toNumber } from './utils';

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-5
/**
 * Format a number according to the current locale.
 *
 * @param value - Number to format
 * @param options - Intl.NumberFormatOptions (e.g. minimumFractionDigits)
 * @returns Formatted number string, or '' if input is null, undefined, or NaN
 */
export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  const n = toNumber(value);
  if (n === null) return '';
  const locale = getLocale();
  return new Intl.NumberFormat(locale, options).format(n);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-5

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-6
/**
 * Format a value as a percentage (0.15 -> "15%").
 *
 * @param value - Decimal value (e.g. 0.15 for 15%)
 * @param decimals - Optional decimal places
 * @returns Formatted percent string, or '' if input is null, undefined, or NaN
 */
export function formatPercent(
  value: number | null | undefined,
  decimals?: number
): string {
  const n = toNumber(value);
  if (n === null) return '';
  const locale = getLocale();
  const opts: Intl.NumberFormatOptions = {
    style: 'percent',
    ...(decimals !== undefined && { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
  };
  return new Intl.NumberFormat(locale, opts).format(n);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-6

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-7
/**
 * Format a number in compact notation (e.g. "1.2K", "3.4M").
 *
 * @param value - Number to format
 * @returns Compact formatted string, or '' if input is null, undefined, or NaN
 */
export function formatCompact(value: number | null | undefined): string {
  const n = toNumber(value);
  if (n === null) return '';
  const locale = getLocale();
  return new Intl.NumberFormat(locale, { notation: 'compact' }).format(n);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-7
