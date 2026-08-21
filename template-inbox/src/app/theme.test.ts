import { beforeEach, describe, expect, it } from 'vitest';
import { applyStoredTheme, readAppliedTheme } from './theme';

describe('applyStoredTheme', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('boots dark when nobody has chosen otherwise', () => {
    expect(applyStoredTheme()).toBe('dark');
    expect(readAppliedTheme()).toBe('dark');
  });

  it('honours a stored choice, so a reload does not undo the toggle', () => {
    window.localStorage.setItem('frontx.inbox.theme', 'light');
    expect(applyStoredTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('falls back to the default rather than trusting a corrupted value', () => {
    window.localStorage.setItem('frontx.inbox.theme', 'solarized');
    expect(applyStoredTheme()).toBe('dark');
  });
});
