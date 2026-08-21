/**
 * The two host-chrome effects this workspace asks for, and the only place
 * either is spelled out.
 *
 * Both are one-shot per page load rather than per mount, and both are module
 * state rather than component state, because a screen unmounts every time the
 * other one is mounted into the exclusive screen domain: re-running them on
 * mount would undo a choice the user had made in between.
 *
 * Both reach the host over the shared event bus. `@gears-frontx/state`'s bus is
 * externalised in this package's build and provided by the host at runtime, so
 * the bus a screen emits on is the same singleton the host's own plugins
 * listen on - the same path the host's menu uses for its own collapse button.
 */

import { eventBus } from '@gears-frontx/react';

export type WorkspaceTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'frontx.inbox.theme';

/** The workspace is a dark-first product; the shell boots on a light default. */
const PREFERRED_THEME: WorkspaceTheme = 'dark';

let themeAsserted = false;
let menuCollapseRequested = false;

const isWorkspaceTheme = (value: string | null): value is WorkspaceTheme =>
  value === 'light' || value === 'dark';

/**
 * Reading `localStorage` throws outright in a browser configured to block site
 * data, so a stored preference is a best-effort input, never a precondition.
 */
const readStoredTheme = (): WorkspaceTheme | null => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isWorkspaceTheme(stored) ? stored : null;
  } catch {
    return null;
  }
};

const writeStoredTheme = (theme: WorkspaceTheme): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A preference that cannot be persisted still applies for this session.
  }
};

/**
 * `changeTheme` is an emit on the shared bus, which the host's themes plugin
 * turns into the applied theme, the stamped `data-theme`, and a rebroadcast of
 * the theme shared property to every mounted microfrontend. Emitting directly
 * keeps this package off the host's app instance, which it has no handle on.
 */
const applyTheme = (theme: WorkspaceTheme): void => {
  eventBus.emit('theme/changed', { themeId: theme });
};

/**
 * Puts the workspace into its own default theme once per page load, unless the
 * visitor has already chosen otherwise. The cost is one light frame before the
 * remote has loaded: the host applies its own default at entry, and a template
 * cannot edit that file.
 */
export const assertPreferredThemeOnce = (): WorkspaceTheme => {
  const stored = readStoredTheme();
  const theme = stored ?? PREFERRED_THEME;
  if (!themeAsserted) {
    themeAsserted = true;
    applyTheme(theme);
  }
  return theme;
};

export const setWorkspaceTheme = (theme: WorkspaceTheme): void => {
  writeStoredTheme(theme);
  applyTheme(theme);
};

/**
 * Narrows the host's menu to its icon rail, once. The reference's own rail is
 * 64px against the host's 56px collapsed width, which is the closest fit that
 * edits no shell file. A later expand by the user survives, because a remount
 * does not re-emit.
 */
export const collapseHostMenuOnce = (): void => {
  if (menuCollapseRequested) return;
  menuCollapseRequested = true;
  eventBus.emit('layout/menu/collapsed', { collapsed: true });
};
