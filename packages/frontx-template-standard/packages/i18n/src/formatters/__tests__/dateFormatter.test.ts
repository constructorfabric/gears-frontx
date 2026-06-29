/**
 * Unit tests for date formatters
 *
 * Covers invalid inputs (return ''), valid date formatting with concrete output,
 * and formatRelative. Uses Language.German and UTC for deterministic results (matches production type).
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nRegistry } from '../../I18nRegistry';
import { Language } from '../../types';
import { formatDate, formatTime, formatDateTime, formatRelative } from '../dateFormatter';

/** Language.German ('de') gives stable formats: 15.06.25, 15.06.2025, 14:30:00, etc. */
const validDate = new Date('2025-06-15T14:30:00.000Z');

describe('dateFormatter', () => {
  let getLanguageSpy: ReturnType<typeof vi.spyOn>;
  let originalTZ: string | undefined;

  beforeAll(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = 'UTC';
  });

  afterAll(() => {
    if (originalTZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTZ;
    }
  });

  beforeEach(() => {
    getLanguageSpy = vi.spyOn(i18nRegistry, 'getLanguage').mockReturnValue(Language.German);
  });

  afterEach(() => {
    getLanguageSpy.mockRestore();
  });

  describe('formatDate', () => {
    it('returns empty string for null', () => {
      expect(formatDate(null, 'short')).toBe('');
    });
    it('returns empty string for undefined', () => {
      expect(formatDate(undefined, 'short')).toBe('');
    });
    it('returns empty string for invalid date string', () => {
      expect(formatDate('not-a-date', 'short')).toBe('');
    });
    it('returns formatted date for valid Date (short)', () => {
      expect(formatDate(validDate, 'short')).toBe('15.06.25');
    });
    it('returns formatted date for valid Date (medium)', () => {
      expect(formatDate(validDate, 'medium')).toBe('15.06.2025');
    });
    it('returns formatted date for timestamp (medium)', () => {
      expect(formatDate(validDate.getTime(), 'medium')).toBe('15.06.2025');
    });
  });

  describe('formatTime', () => {
    it('returns empty string for invalid date', () => {
      expect(formatTime('invalid', 'short')).toBe('');
    });
    it('returns formatted time for valid date (short)', () => {
      expect(formatTime(validDate, 'short')).toBe('14:30');
    });
    it('returns formatted time for valid date (medium)', () => {
      expect(formatTime(validDate, 'medium')).toBe('14:30:00');
    });
  });

  describe('formatDateTime', () => {
    it('returns empty string for null', () => {
      expect(formatDateTime(null, 'short', 'short')).toBe('');
    });
    it('returns formatted date-time for valid date (short/short)', () => {
      expect(formatDateTime(validDate, 'short', 'short')).toBe('15.06.25, 14:30');
    });
    it('returns formatted date-time for valid date (medium/medium)', () => {
      expect(formatDateTime(validDate, 'medium', 'medium')).toBe('15.06.2025, 14:30:00');
    });
  });

  describe('formatRelative', () => {
    it('returns empty string for invalid date', () => {
      expect(formatRelative('invalid')).toBe('');
    });
    it('returns "in 2 hours" when date is 2 hours after base (German)', () => {
      const d = new Date('2025-01-01T12:00:00Z');
      const base = new Date('2025-01-01T10:00:00Z');
      expect(formatRelative(d, base)).toBe('in 2 Stunden');
    });
    it('returns "2 hours ago" when date is 2 hours before base (German)', () => {
      const d = new Date('2025-01-01T08:00:00Z');
      const base = new Date('2025-01-01T10:00:00Z');
      expect(formatRelative(d, base)).toBe('vor 2 Stunden');
    });
    it('returns "in 3 days" when date is 3 days after base (German)', () => {
      const d = new Date('2025-01-04T10:00:00Z');
      const base = new Date('2025-01-01T10:00:00Z');
      expect(formatRelative(d, base)).toBe('in 3 Tagen');
    });
  });
});
