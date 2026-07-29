/**
 * Unit tests for currency formatter
 *
 * Covers null/undefined/NaN (return '') and valid currency formatting.
 * Uses Language.English for deterministic results (matches production type).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nRegistry } from '../../I18nRegistry';
import { Language } from '../../types';
import { formatCurrency } from '../currencyFormatter';

function normalizeCurrencyOutput(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

describe('currencyFormatter', () => {
  let getLanguageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getLanguageSpy = vi
      .spyOn(i18nRegistry, 'getLanguage')
      .mockReturnValue(Language.English);
  });

  afterEach(() => {
    getLanguageSpy.mockRestore();
  });

  it('returns empty string for null', () => {
    expect(formatCurrency(null, 'USD')).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(formatCurrency(undefined, 'USD')).toBe('');
  });
  it('returns empty string for NaN', () => {
    expect(formatCurrency(Number.NaN, 'USD')).toBe('');
  });
  it('returns formatted currency for valid value', () => {
    const formatted = formatCurrency(99.99, 'USD');

    expect(normalizeCurrencyOutput(formatted)).toContain('99.99');
    expect(formatted).toMatch(/\$|USD/);
  });
  it('accepts different currency codes', () => {
    const formatted = formatCurrency(100, 'EUR');

    expect(normalizeCurrencyOutput(formatted)).toContain('100.00');
    expect(formatted).toMatch(/EUR|€/);
  });

  it('returns empty string for invalid currencyCode and does not throw', () => {
    expect(formatCurrency(100, '')).toBe('');
    expect(formatCurrency(100, 'INVALID')).toBe('');
    expect(() => {
      formatCurrency(100, 'NOTACODE');
    }).not.toThrow();
  });
});
