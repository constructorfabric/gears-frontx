/**
 * Light/dark, as the kit's own tokens define it.
 *
 * `@gears-frontx/ui-kit/theme.css` reads `data-theme` on the root element and
 * repaints every token from it, so the whole app themes by setting one
 * attribute - there is nothing to broadcast and nothing to subscribe to.
 *
 * The app is dark-first, and `index.html` already ships `data-theme="dark"` on
 * `<html>` so the first paint is dark before any script runs. `applyStoredTheme`
 * then corrects it for a visitor who chose light, early enough in the entry
 * module that no frame is rendered in between.
 */

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'frontx.inbox.theme';

/** The product's own default; only a stored choice overrides it. */
const DEFAULT_THEME: Theme = 'dark';

const isTheme = (value: string | null): value is Theme => value === 'light' || value === 'dark';

/**
 * Reading web storage throws outright in a browser configured to block site
 * data, so a stored preference is a best-effort input, never a precondition.
 */
const readStoredTheme = (): Theme | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    return null;
  }
};

const writeStoredTheme = (theme: Theme): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A preference that cannot be persisted still applies for this session.
  }
};

export const readAppliedTheme = (): Theme => {
  const applied = document.documentElement.getAttribute('data-theme');
  return isTheme(applied) ? applied : DEFAULT_THEME;
};

const applyTheme = (theme: Theme): void => {
  document.documentElement.setAttribute('data-theme', theme);
};

/** Called from the entry module, before the first render. */
export const applyStoredTheme = (): Theme => {
  const theme = readStoredTheme() ?? DEFAULT_THEME;
  applyTheme(theme);
  return theme;
};

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(readAppliedTheme);

  useEffect(() => {
    applyTheme(theme);
    writeStoredTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
