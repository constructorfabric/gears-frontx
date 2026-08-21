/**
 * The two host-chrome effects this workspace asks for, and the only place
 * either is spelled out.
 *
 * Both travel upward as actions on the screen domain. A microfrontend runs in
 * its own module graph - `@gears-frontx/state` being externalised in this
 * package's build means the host serves the module's source, not its instance -
 * so a bus this package imports is its own, and nothing the host listens on.
 * The actions chain is the declared channel, and the shell declares these two
 * action types on the screen domain precisely so a screen can drive them.
 *
 * Neither is a per-mount effect: the screen domain mounts exclusively, so a
 * jump between the two screens unmounts and remounts this workspace, and
 * re-asserting either would undo a choice made in between. The theme guards on
 * the host's current value, the menu on a per-tab `sessionStorage` key.
 */

import {
  FRONTX_SCREEN_DOMAIN,
  FRONTX_SHARED_PROPERTY_THEME,
  type ChildMfeBridge,
} from '@gears-frontx/react';
import { CHROME_SET_MENU_COLLAPSED, CHROME_SET_THEME } from './hostChromeActions';

export type WorkspaceTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'frontx.inbox.theme';
const MENU_COLLAPSE_KEY = 'frontx.inbox.menu-collapsed';

/** The workspace is a dark-first product; the shell boots on a light default. */
const PREFERRED_THEME: WorkspaceTheme = 'dark';

const isWorkspaceTheme = (value: string | null): value is WorkspaceTheme =>
  value === 'light' || value === 'dark';

/**
 * Reading web storage throws outright in a browser configured to block site
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
 * True the first time it is asked in a tab, false afterwards. `sessionStorage`
 * rather than module state because a remount reloads the module graph, and
 * rather than `localStorage` because "the workspace narrowed my menu once" is
 * a fact about this tab, not a preference to carry across visits.
 */
const claimMenuCollapse = (): boolean => {
  try {
    if (window.sessionStorage.getItem(MENU_COLLAPSE_KEY) !== null) return false;
    window.sessionStorage.setItem(MENU_COLLAPSE_KEY, '1');
    return true;
  } catch {
    // Without storage there is no way to tell a remount from a first load, and
    // narrowing the menu on every screen swap would fight the user. Ask once
    // per module load instead, which is the closest honest approximation.
    return true;
  }
};

const dispatchChrome = (
  bridge: ChildMfeBridge,
  type: string,
  payload: Record<string, string | boolean>
): void => {
  void bridge.executeActionsChain({
    action: { type, target: FRONTX_SCREEN_DOMAIN, payload },
  });
};

/**
 * The theme the host currently has applied, as it broadcasts it. Anything the
 * shell registers beyond this workspace's two themes reads as light, which is
 * what the shell's own default is.
 */
export const readHostTheme = (bridge: ChildMfeBridge): WorkspaceTheme => {
  const property = bridge.getProperty(FRONTX_SHARED_PROPERTY_THEME);
  return property?.value === 'dark' ? 'dark' : 'light';
};

/**
 * The theme this workspace has asked the host for and has not yet seen
 * applied. Until the request lands, the host still broadcasts the value being
 * replaced, and mirroring that value would overwrite the preference currently
 * being applied.
 */
let pendingTheme: WorkspaceTheme | null = null;

/**
 * Applies this workspace's theme unless the host is already showing it.
 *
 * Comparing rather than flagging is what makes the call safe to repeat: a
 * remount that finds the host already on the wanted theme asks for nothing,
 * and a visitor who switched to light in between is left alone because the
 * switch was stored as their preference.
 */
export const assertPreferredTheme = (bridge: ChildMfeBridge): WorkspaceTheme => {
  const wanted = readStoredTheme() ?? PREFERRED_THEME;
  if (readHostTheme(bridge) !== wanted) {
    pendingTheme = wanted;
    dispatchChrome(bridge, CHROME_SET_THEME, { themeId: wanted });
  }
  return wanted;
};

/**
 * Records a theme the host applied, whoever asked for it. A switch made in the
 * shell's own chrome would otherwise be undone by the next screen swap, which
 * would find the stored preference still disagreeing and ask again.
 */
const rememberHostTheme = (theme: WorkspaceTheme): void => {
  if (pendingTheme !== null) {
    if (theme !== pendingTheme) return;
    pendingTheme = null;
  }
  writeStoredTheme(theme);
};

/**
 * Keeps the stored preference in step with the host for as long as the
 * workspace is mounted. Returns the unsubscribe.
 */
export const trackHostTheme = (bridge: ChildMfeBridge): (() => void) =>
  bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_THEME, (property) => {
    rememberHostTheme(property.value === 'dark' ? 'dark' : 'light');
  });

export const setWorkspaceTheme = (bridge: ChildMfeBridge, theme: WorkspaceTheme): void => {
  writeStoredTheme(theme);
  pendingTheme = theme;
  dispatchChrome(bridge, CHROME_SET_THEME, { themeId: theme });
};

/**
 * Narrows the host's menu to its icon rail, once per tab. The reference's own
 * rail is 64px against the host's 56px collapsed width, which is the closest
 * fit that edits no shell file. A later expand by the user survives, because
 * the claim is already spent.
 */
export const collapseHostMenuOnce = (bridge: ChildMfeBridge): void => {
  if (!claimMenuCollapse()) return;
  dispatchChrome(bridge, CHROME_SET_MENU_COLLAPSED, { collapsed: true });
};
