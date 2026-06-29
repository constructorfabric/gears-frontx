/**
 * Date formatter - Locale-aware date and time formatting
 *
 * Uses i18nRegistry.getLanguage() for locale; fallback to Language.English when null.
 * Invalid date inputs return ''.
 */
// @cpt-flow:cpt-frontx-flow-i18n-infrastructure-formatter-usage:p1
// @cpt-dod:cpt-frontx-dod-i18n-infrastructure-formatters:p1

import { getLocale } from './utils';

export type DateFormatStyle = 'short' | 'medium' | 'long' | 'full';
export type TimeFormatStyle = 'short' | 'medium';

export type DateInput = Date | number | string | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// @cpt-begin:cpt-frontx-flow-i18n-infrastructure-formatter-usage:p1:inst-1
// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-1
/**
 * Format a date according to the current locale.
 *
 * @param date - Date, timestamp, or ISO string
 * @param format - 'short' | 'medium' | 'long' | 'full'
 * @returns Formatted date string, or '' if input is invalid
 */
export function formatDate(date: DateInput, format: DateFormatStyle): string {
  const d = toDate(date);
  if (!d) return '';
  const locale = getLocale();
  return new Intl.DateTimeFormat(locale, { dateStyle: format }).format(d);
}
// @cpt-end:cpt-frontx-flow-i18n-infrastructure-formatter-usage:p1:inst-1
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-1

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-2
/**
 * Format the time portion of a date according to the current locale.
 *
 * @param date - Date, timestamp, or ISO string
 * @param format - 'short' | 'medium'
 * @returns Formatted time string, or '' if input is invalid
 */
export function formatTime(date: DateInput, format: TimeFormatStyle): string {
  const d = toDate(date);
  if (!d) return '';
  const locale = getLocale();
  return new Intl.DateTimeFormat(locale, { timeStyle: format }).format(d);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-2

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-3
/**
 * Format date and time according to the current locale.
 *
 * @param date - Date, timestamp, or ISO string
 * @param dateFormat - Date style: 'short' | 'medium' | 'long' | 'full'
 * @param timeFormat - Time style: 'short' | 'medium'
 * @returns Formatted date-time string, or '' if input is invalid
 */
export function formatDateTime(
  date: DateInput,
  dateFormat: DateFormatStyle,
  timeFormat: TimeFormatStyle
): string {
  const d = toDate(date);
  if (!d) return '';
  const locale = getLocale();
  return new Intl.DateTimeFormat(locale, {
    dateStyle: dateFormat,
    timeStyle: timeFormat,
  }).format(d);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-3

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Picks relative-time unit and value using calendar-aware boundaries for day/month/year
 * (no 30d/365d approximations), and exact second/minute/hour for sub-day deltas.
 */
function getRelativeUnit(
  date: Date,
  base: Date
): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const diffMs = date.getTime() - base.getTime();
  const absMs = Math.abs(diffMs);
  const sign = diffMs < 0 ? -1 : 1;

  if (absMs < 60 * MS_PER_SECOND) {
    const value = Math.round(diffMs / MS_PER_SECOND);
    return { value: value === 0 ? 0 : value, unit: 'second' };
  }
  if (absMs < 60 * MS_PER_MINUTE) {
    return { value: sign * Math.round(absMs / MS_PER_MINUTE), unit: 'minute' };
  }
  if (absMs < MS_PER_DAY) {
    return { value: sign * Math.round(absMs / MS_PER_HOUR), unit: 'hour' };
  }

  const baseY = base.getUTCFullYear();
  const baseM = base.getUTCMonth();
  const baseD = base.getUTCDate();
  const dateY = date.getUTCFullYear();
  const dateM = date.getUTCMonth();
  const dateD = date.getUTCDate();

  const totalMonths = (dateY - baseY) * 12 + (dateM - baseM);
  const baseUTC = Date.UTC(baseY, baseM, baseD);
  const dateUTC = Date.UTC(dateY, dateM, dateD);
  const diffDays = Math.round((dateUTC - baseUTC) / MS_PER_DAY);

  if (Math.abs(totalMonths) >= 12) {
    const value = Math.round(totalMonths / 12);
    return { value, unit: 'year' };
  }
  if (Math.abs(totalMonths) >= 1) {
    return { value: totalMonths, unit: 'month' };
  }
  return { value: diffDays === 0 ? sign * 1 : diffDays, unit: 'day' };
}

// @cpt-begin:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-4
/**
 * Format a date as relative time (e.g. "2 hours ago", "in 3 days").
 *
 * @param date - Date, timestamp, or ISO string
 * @param base - Reference date for "now"; defaults to new Date()
 * @returns Relative time string, or '' if input is invalid
 */
export function formatRelative(date: DateInput, base?: DateInput): string {
  const d = toDate(date);
  if (!d) return '';
  const baseDate = base !== undefined ? toDate(base) : new Date();
  if (!baseDate) return '';
  const locale = getLocale();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const { value, unit } = getRelativeUnit(d, baseDate);
  return rtf.format(value, unit);
}
// @cpt-end:cpt-frontx-dod-i18n-infrastructure-formatters:p1:inst-4
