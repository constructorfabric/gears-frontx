import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once, with the last arguments, after the calls stop for the wait', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced('a');
    vi.advanceTimersByTime(200);
    debounced('b');
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('drops a pending call on cancel', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(1000);

    expect(fn).not.toHaveBeenCalled();
  });

  it('runs a pending call now on flush, and does nothing when none is pending', () => {
    const fn = vi.fn((value: number) => value * 2);
    const debounced = debounce(fn, 300);

    expect(debounced.flush()).toBeUndefined();

    debounced(21);
    expect(debounced.flush()).toBe(42);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);

    expect(debounced.flush()).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
