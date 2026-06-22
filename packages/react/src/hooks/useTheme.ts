/**
 * useTheme Hook - Theme utilities
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-theme:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-theme-hook:p1

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFrontX } from '../FrontXContext';
import type { UseThemeReturn } from '../types';

/**
 * Hook for theme utilities.
 *
 * @returns Theme utilities
 *
 * @example
 * ```tsx
 * const { currentTheme, themes, setTheme } = useTheme();
 *
 * return (
 *   <select
 *     value={currentTheme}
 *     onChange={(e) => setTheme(e.target.value)}
 *   >
 *     {themes.map((theme) => (
 *       <option key={theme.id} value={theme.id}>
 *         {theme.name}
 *       </option>
 *     ))}
 *   </select>
 * );
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-theme:p1:inst-call-theme
// @cpt-begin:cpt-frontx-dod-react-bindings-theme-hook:p1:inst-call-theme
export function useTheme(): UseThemeReturn {
  // @cpt-begin:cpt-frontx-flow-react-bindings-use-theme:p1:inst-read-theme-registry
  const app = useFrontX();
  const { themeRegistry } = app;
  // @cpt-end:cpt-frontx-flow-react-bindings-use-theme:p1:inst-read-theme-registry

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-theme:p1:inst-subscribe-theme
  // @cpt-begin:cpt-frontx-flow-react-bindings-use-theme:p1:inst-rerender-on-theme-change
  // Subscribe to theme changes using useSyncExternalStore
  // Uses version counter to trigger re-renders when theme changes
  const version = useSyncExternalStore(
    useCallback(
      (callback: () => void) => {
        return themeRegistry.subscribe(callback);
      },
      [themeRegistry]
    ),
    () => themeRegistry.getVersion(),
    () => themeRegistry.getVersion()
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-theme:p1:inst-subscribe-theme
  // @cpt-end:cpt-frontx-flow-react-bindings-use-theme:p1:inst-rerender-on-theme-change

  // Get current theme (memoized, recalculates on version change)
  const currentTheme = useMemo(() => {
    // Reference version to trigger recalculation on theme change
    void version;
    const theme = themeRegistry.getCurrent();
    return theme?.id;
  }, [themeRegistry, version]);

  // Get all themes
  const themes = useMemo(() => {
    return themeRegistry.getAll().map((theme) => ({
      id: theme.id,
      name: theme.name,
    }));
  }, [themeRegistry]);

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-theme:p1:inst-dispatch-change-theme
  // Set theme
  const setTheme = useCallback(
    (themeId: string) => {
      if (app.actions.changeTheme) {
        app.actions.changeTheme({ themeId });
      }
    },
    [app.actions]
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-theme:p1:inst-dispatch-change-theme

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-theme:p1:inst-return-theme-api
  return {
    currentTheme,
    themes,
    setTheme,
  };
  // @cpt-end:cpt-frontx-flow-react-bindings-use-theme:p1:inst-return-theme-api
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-theme:p1:inst-call-theme
// @cpt-end:cpt-frontx-dod-react-bindings-theme-hook:p1:inst-call-theme
