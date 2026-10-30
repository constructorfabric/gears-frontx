import { describe, expect, it } from 'vitest';
import { buildSearchString, decodeComponentOrRaw, parseSearchString } from '../search-codec.js';

describe('decodeComponentOrRaw', () => {
  it('decodes a validly percent-encoded value', () => {
    expect(decodeComponentOrRaw('a%20b')).toBe('a b');
  });

  it('falls back to the raw text on a malformed percent-escape rather than throwing', () => {
    expect(decodeComponentOrRaw('%')).toBe('%');
    expect(decodeComponentOrRaw('100%')).toBe('100%');
  });
});

describe('parseSearchString', () => {
  it('splits and decodes every pair, tolerating a malformed one among well-formed ones', () => {
    expect(parseSearchString('?a=100%&b=2')).toEqual([
      { name: 'a', value: '100%' },
      { name: 'b', value: '2' },
    ]);
  });

  it('treats a pair with no `=` as an empty value, decoded the same way', () => {
    expect(parseSearchString('?%zz=1')).toEqual([{ name: '%zz', value: '1' }]);
  });

  it('reads a `+` as a space and `%2B` as a plus, in names and values', () => {
    expect(parseSearchString('?a+b=c+d%2Be')).toEqual([{ name: 'a b', value: 'c d+e' }]);
  });

  it('reads what `URLSearchParams`, TanStack’s own serializer, writes', () => {
    const search = `?${new URLSearchParams({ q: 'a b+c' }).toString()}`;
    expect(parseSearchString(search)).toEqual([{ name: 'q', value: 'a b+c' }]);
  });

  it('still reads a `+` as a space in a pair whose percent-escape is malformed', () => {
    expect(parseSearchString('?a=100%+off')).toEqual([{ name: 'a', value: '100% off' }]);
  });
});

describe('buildSearchString', () => {
  it('percent-encodes every name and value, including one that was kept raw on a prior parse', () => {
    expect(buildSearchString([{ name: 'a', value: '100%' }])).toBe('?a=100%25');
  });

  it('round-trips a space and a plus through parseSearchString', () => {
    const params = [{ name: 'a b', value: 'c d+e' }];
    expect(parseSearchString(buildSearchString(params))).toEqual(params);
  });
});
