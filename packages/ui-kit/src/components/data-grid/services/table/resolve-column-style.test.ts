import { describe, expect, it } from 'vitest';
import { DATA_GRID_COLUMN_MAX_WIDTH_VAR, resolveColumnStyle } from './resolve-column-style';

describe('resolveColumnStyle', () => {
  describe('tableLayout: fixed', () => {
    it('returns no style when width/minWidth/maxWidth are all unset', () => {
      const result = resolveColumnStyle({}, 'fixed');

      expect(result.headerStyle).toEqual({});
      expect(result.contentVars).toEqual({});
    });

    it('maps a numeric width to width + min-inline-size (the shared track)', () => {
      const result = resolveColumnStyle({ width: 200 }, 'fixed');

      expect(result.headerStyle).toEqual({ width: '200px', minInlineSize: '200px' });
      expect(result.contentVars).toEqual({});
    });

    it('maps a string pixel width the same as a number', () => {
      const result = resolveColumnStyle({ width: '200' }, 'fixed');

      expect(result.headerStyle).toEqual({ width: '200px', minInlineSize: '200px' });
    });

    it('maps a percent width to inline-size, not width', () => {
      const result = resolveColumnStyle({ width: '20%' }, 'fixed');

      expect(result.headerStyle).toEqual({ inlineSize: '20%' });
    });

    it('passes through a non-numeric string width unchanged (e.g. auto keyword)', () => {
      const result = resolveColumnStyle({ width: 'max-content' }, 'fixed');

      expect(result.headerStyle).toEqual({
        width: 'max-content',
        minInlineSize: 'max-content',
      });
    });

    it('aliases a lone minWidth to the track', () => {
      const result = resolveColumnStyle({ minWidth: 150 }, 'fixed');

      expect(result.headerStyle).toEqual({ width: '150px', minInlineSize: '150px' });
    });

    it('aliases a lone maxWidth to the track', () => {
      const result = resolveColumnStyle({ maxWidth: 300 }, 'fixed');

      expect(result.headerStyle).toEqual({ width: '300px', minInlineSize: '300px' });
    });

    it('lets width win when width and minWidth are both set (contradiction)', () => {
      const result = resolveColumnStyle({ width: 100, minWidth: 250 }, 'fixed');

      expect(result.headerStyle).toEqual({ width: '100px', minInlineSize: '100px' });
    });

    it('lets width win when width and maxWidth are both set (contradiction)', () => {
      const result = resolveColumnStyle({ width: 100, maxWidth: 50 }, 'fixed');

      expect(result.headerStyle).toEqual({ width: '100px', minInlineSize: '100px' });
    });

    it('never sets a content-cap var -- the fixed track is the only cap mechanism', () => {
      const result = resolveColumnStyle({ width: 100, maxWidth: 300 }, 'fixed');

      expect(result.contentVars).toEqual({});
    });

    it('treats width: "min-content" as unset before measurement lands', () => {
      const result = resolveColumnStyle({ width: 'min-content' }, 'fixed');

      expect(result.headerStyle).toEqual({});
      expect(result.contentVars).toEqual({});
    });

    it('falls back to a lone minWidth/maxWidth alias when width is "min-content" and unmeasured', () => {
      const result = resolveColumnStyle({ width: 'min-content', minWidth: 120 }, 'fixed');

      expect(result.headerStyle).toEqual({ width: '120px', minInlineSize: '120px' });
    });

    it('applies a measured minContentWidth as the fixed track once available', () => {
      const result = resolveColumnStyle({ width: 'min-content' }, 'fixed', 84);

      expect(result.headerStyle).toEqual({ width: '84px', minInlineSize: '84px' });
      expect(result.contentVars).toEqual({});
    });

    it('lets a measured minContentWidth win over minWidth/maxWidth (same as any other width)', () => {
      const result = resolveColumnStyle(
        { width: 'min-content', minWidth: 120, maxWidth: 300 },
        'fixed',
        84,
      );

      expect(result.headerStyle).toEqual({ width: '84px', minInlineSize: '84px' });
    });

    it('ignores minContentWidth for a column whose width is not "min-content"', () => {
      const result = resolveColumnStyle({ width: 200 }, 'fixed', 84);

      expect(result.headerStyle).toEqual({ width: '200px', minInlineSize: '200px' });
    });
  });

  describe('tableLayout: auto', () => {
    it('returns no style when width/minWidth/maxWidth are all unset', () => {
      const result = resolveColumnStyle({}, 'auto');

      expect(result.headerStyle).toEqual({});
      expect(result.contentVars).toEqual({});
    });

    it('maps width to width + min-inline-size (preferred size doubles as the floor)', () => {
      const result = resolveColumnStyle({ width: 200 }, 'auto');

      expect(result.headerStyle).toEqual({ width: '200px', minInlineSize: '200px' });
    });

    it('maps a percent width to inline-size only', () => {
      const result = resolveColumnStyle({ width: '30%' }, 'auto');

      expect(result.headerStyle).toEqual({ inlineSize: '30%' });
    });

    it('lets an explicit minWidth override the implicit floor from width', () => {
      const result = resolveColumnStyle({ width: 200, minWidth: 80 }, 'auto');

      expect(result.headerStyle).toEqual({ width: '200px', minInlineSize: '80px' });
    });

    it('applies minWidth alone as a pure floor with no preferred width', () => {
      const result = resolveColumnStyle({ minWidth: 80 }, 'auto');

      expect(result.headerStyle).toEqual({ minInlineSize: '80px' });
    });

    it('gives a widthless column capped by maxWidth a header width equal to the cap', () => {
      const result = resolveColumnStyle({ maxWidth: 300 }, 'auto');

      expect(result.headerStyle.width).toBe('300px');
    });

    it('does not override an explicit width with maxWidth', () => {
      const result = resolveColumnStyle({ width: 150, maxWidth: 300 }, 'auto');

      expect(result.headerStyle.width).toBe('150px');
    });

    it('sets the content-cap CSS var whenever maxWidth is defined', () => {
      const result = resolveColumnStyle({ maxWidth: 300 }, 'auto');

      expect(result.contentVars).toEqual({ [DATA_GRID_COLUMN_MAX_WIDTH_VAR]: '300px' });
    });

    it('does not set the content-cap var when maxWidth is unset', () => {
      const result = resolveColumnStyle({ width: 150, minWidth: 50 }, 'auto');

      expect(result.contentVars).toEqual({});
    });

    it('combines width, minWidth, and maxWidth as three independent constraints', () => {
      const result = resolveColumnStyle({ width: 150, minWidth: 80, maxWidth: 300 }, 'auto');

      expect(result.headerStyle).toEqual({ width: '150px', minInlineSize: '80px' });
      expect(result.contentVars).toEqual({ [DATA_GRID_COLUMN_MAX_WIDTH_VAR]: '300px' });
    });

    it('passes width: "min-content" through as the literal CSS keyword before measurement', () => {
      const result = resolveColumnStyle({ width: 'min-content' }, 'auto');

      expect(result.headerStyle).toEqual({ width: 'min-content', minInlineSize: 'min-content' });
    });

    it('applies a measured minContentWidth as a pixel width once available', () => {
      const result = resolveColumnStyle({ width: 'min-content' }, 'auto', 84);

      expect(result.headerStyle).toEqual({ width: '84px', minInlineSize: '84px' });
    });

    it('clamps a measured minContentWidth to maxWidth when the measured value exceeds the cap', () => {
      const result = resolveColumnStyle({ width: 'min-content', maxWidth: 100 }, 'auto', 150);

      expect(result.headerStyle).toEqual({ width: '100px', minInlineSize: '100px' });
    });

    it('keeps the measured minContentWidth uncapped when it is under maxWidth', () => {
      const result = resolveColumnStyle({ width: 'min-content', maxWidth: 100 }, 'auto', 60);

      expect(result.headerStyle).toEqual({ width: '60px', minInlineSize: '60px' });
    });

    it('ignores minContentWidth for a column whose width is not "min-content"', () => {
      const result = resolveColumnStyle({ width: 200 }, 'auto', 84);

      expect(result.headerStyle).toEqual({ width: '200px', minInlineSize: '200px' });
    });
  });

  describe('isCapped', () => {
    it('is false under fixed layout even when maxWidth is set (the track is the only cap)', () => {
      expect(resolveColumnStyle({ maxWidth: 300 }, 'fixed').isCapped).toBe(false);
      expect(resolveColumnStyle({ width: 100, maxWidth: 300 }, 'fixed').isCapped).toBe(false);
    });

    it('is false under fixed layout when no width prop is set', () => {
      expect(resolveColumnStyle({}, 'fixed').isCapped).toBe(false);
    });

    it('is true under auto layout whenever maxWidth is defined, independent of width/minWidth', () => {
      expect(resolveColumnStyle({ maxWidth: 300 }, 'auto').isCapped).toBe(true);
      expect(resolveColumnStyle({ width: 150, maxWidth: 300 }, 'auto').isCapped).toBe(true);
      expect(resolveColumnStyle({ minWidth: 50, maxWidth: 300 }, 'auto').isCapped).toBe(true);
      expect(resolveColumnStyle({ width: 150, minWidth: 50, maxWidth: 300 }, 'auto').isCapped).toBe(
        true,
      );
    });

    it('is false under auto layout when maxWidth is unset', () => {
      expect(resolveColumnStyle({}, 'auto').isCapped).toBe(false);
      expect(resolveColumnStyle({ width: 150, minWidth: 50 }, 'auto').isCapped).toBe(false);
    });
  });
});
