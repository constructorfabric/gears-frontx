import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { loadStudioState, saveStudioState } from './persistence';

describe('studio persistence', () => {
  let consoleWarn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    localStorage.clear();
    // Keep invalid-JSON tests quiet while still asserting the warning happened.
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  it('round-trips JSON values through localStorage', () => {
    const key = 'studio:test';
    const value = { collapsed: true };

    saveStudioState(key, value);

    expect(loadStudioState(key, { collapsed: false })).toEqual(value);
  });

  it('falls back to the default value when stored JSON is invalid', () => {
    const key = 'studio:invalid';
    const fallback = { collapsed: false };

    localStorage.setItem(key, '{invalid-json');

    expect(loadStudioState(key, fallback)).toEqual(fallback);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });
});
