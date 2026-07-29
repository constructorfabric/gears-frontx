/**
 * Unit tests for number formatters
 *
 * Covers null/undefined/NaN (return ''), and valid number formatting with concrete output.
 * Uses Language.English for deterministic results (matches production type).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nRegistry } from '../../I18nRegistry';
import { Language } from '../../types';
import { formatNumber, formatPercent, formatCompact } from '../numberFormatter';

describe('numberFormatter', () => {
  let getLanguageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getLanguageSpy = vi
      .spyOn(i18nRegistry, 'getLanguage')
      .mockReturnValue(Language.English);
  });

  afterEach(() => {
    getLanguageSpy.mockRestore();
  });

  describe('formatNumber', () => {
    it('returns empty string for null', () => {
      expect(formatNumber(null)).toBe('');
    });
    it('returns empty string for undefined', () => {
      expect(formatNumber(undefined)).toBe('');
    });
    it('returns empty string for NaN', () => {
      expect(formatNumber(Number.NaN)).toBe('');
    });
    it('returns formatted number for valid value', () => {
      expect(formatNumber(1234.56)).toBe('1,234.56');
    });
    it('accepts Intl.NumberFormatOptions', () => {
      expect(formatNumber(1234.5, { minimumFractionDigits: 2 })).toBe('1,234.50');
    });
  });

  describe('formatPercent', () => {
    it('returns empty string for null', () => {
      expect(formatPercent(null)).toBe('');
    });
    it('returns empty string for undefined', () => {
      expect(formatPercent(undefined)).toBe('');
    });
    it('returns formatted percent for valid value', () => {
      expect(formatPercent(0.15)).toBe('15%');
    });
    it('accepts decimals option', () => {
      expect(formatPercent(0.1567, 2)).toBe('15.67%');
    });
  });

  describe('formatCompact', () => {
    it('returns empty string for null', () => {
      expect(formatCompact(null)).toBe('');
    });
    it('returns compact notation for large number', () => {
      expect(formatCompact(1200)).toBe('1.2K');
    });
    it('returns compact notation for very large number', () => {
      expect(formatCompact(3_400_000)).toBe('3.4M');
    });
  });
});
