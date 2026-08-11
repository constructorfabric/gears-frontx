/**
 * Unit tests for useLatest.
 *
 * The contract under test: the returned ref (a) always reflects the value
 * from the most recently committed render, and (b) keeps a stable identity
 * across renders so it is safe to drop into a dependency array.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLatest } from '../useLatest';

describe('useLatest', () => {
  it('reflects the value passed on the initial render', () => {
    const { result } = renderHook(() => useLatest('first'));
    expect(result.current.current).toBe('first');
  });

  it('updates ref.current after a rerender with a new value', () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: 'first' },
    });

    rerender({ value: 'second' });

    expect(result.current.current).toBe('second');
  });

  it('keeps the same ref object identity across rerenders', () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: 1 },
    });
    const firstRef = result.current;

    rerender({ value: 2 });

    expect(result.current).toBe(firstRef);
  });
});
