/**
 * Unit tests for sort utilities
 *
 * Covers compareStrings and createCollator with locale from registry.
 * Uses Language.English (matches production type).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nRegistry } from '../../I18nRegistry';
import { Language } from '../../types';
import { compareStrings, createCollator } from '../sortUtils';

describe('sortUtils', () => {
  let getLanguageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getLanguageSpy = vi.spyOn(i18nRegistry, 'getLanguage').mockReturnValue(Language.English);
  });

  afterEach(() => {
    getLanguageSpy.mockRestore();
  });

  describe('compareStrings', () => {
    it('returns negative when a < b', () => {
      const result = compareStrings('apple', 'banana');
      expect(result).toBeLessThan(0);
    });
    it('returns positive when a > b', () => {
      const result = compareStrings('banana', 'apple');
      expect(result).toBeGreaterThan(0);
    });
    it('returns 0 when a === b', () => {
      expect(compareStrings('same', 'same')).toBe(0);
    });
    it('applies Intl.CollatorOptions', () => {
      expect(compareStrings('a', 'á')).not.toBe(0);
      expect(compareStrings('a', 'á', { sensitivity: 'base' })).toBe(0);
    });
  });

  describe('createCollator', () => {
    it('returns an Intl.Collator instance', () => {
      const collator = createCollator();
      expect(collator).toBeInstanceOf(Intl.Collator);
    });
    it('compare method orders strings', () => {
      const collator = createCollator();
      const sorted = ['c', 'a', 'b'].sort(collator.compare);
      expect(sorted).toEqual(['a', 'b', 'c']);
    });
    it('accepts options', () => {
      const collator = createCollator({ numeric: true });
      expect(collator).toBeInstanceOf(Intl.Collator);
    });
  });
});
