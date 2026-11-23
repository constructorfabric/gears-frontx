/** One-pass offset splice: edits apply against the original offsets. */
import { describe, expect, it } from 'vitest';
import { SourceSplice } from '../SourceSplice';

describe('SourceSplice', () => {
  it('applies edits in any order against the original offsets', () => {
    const source = 'abcdefgh';
    expect(
      SourceSplice.apply(source, [
        { start: 6, end: 8, text: 'Z' },
        { start: 0, end: 2, text: 'XYZ' },
      ]),
    ).toBe('XYZcdefZ');
  });

  it('returns the source itself without edits', () => {
    const source = 'abc';
    expect(SourceSplice.apply(source, [])).toBe(source);
  });

  it('drops an edit that begins inside an earlier edit', () => {
    expect(
      SourceSplice.apply('abcdefgh', [
        { start: 1, end: 6, text: '-' },
        { start: 3, end: 4, text: 'NOPE' },
      ]),
    ).toBe('a-gh');
  });
});
