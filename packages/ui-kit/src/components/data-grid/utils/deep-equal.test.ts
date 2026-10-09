import { describe, expect, it } from 'vitest';

import { isDeepEqual } from './deep-equal';

describe('isDeepEqual', () => {
  it('compares plain data structurally', () => {
    expect(isDeepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(isDeepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });

  it('tells a missing key from an undefined one', () => {
    expect(isDeepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(isDeepEqual({ a: undefined }, { b: undefined })).toBe(false);
  });

  it('compares primitives and undefined by identity', () => {
    expect(isDeepEqual(1, 1)).toBe(true);
    expect(isDeepEqual(1, '1')).toBe(false);
    expect(isDeepEqual(undefined, undefined)).toBe(true);
    expect(isDeepEqual(undefined, {})).toBe(false);
  });
});
