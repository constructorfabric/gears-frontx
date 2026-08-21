/**
 * The two things every part of a screen needs from its surroundings: where kit
 * overlays should portal to, and which theme the host currently has applied.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import {
  FRONTX_SHARED_PROPERTY_THEME,
  type ChildMfeBridge,
} from '@gears-frontx/react';
import type { WorkspaceTheme } from './workspaceChrome';

const OverlayContainerContext = createContext<HTMLElement | null>(null);

export const OverlayContainerProvider = OverlayContainerContext.Provider;

/**
 * The node to hand kit popups as their `container`. `undefined` while the root
 * has not laid out yet, which is the kit's own "portal to `<body>`" default -
 * an overlay can only open after a click, by which time the root exists.
 */
export const useOverlayContainer = (): HTMLElement | undefined =>
  useContext(OverlayContainerContext) ?? undefined;

const readTheme = (bridge: ChildMfeBridge): string => {
  const property = bridge.getProperty(FRONTX_SHARED_PROPERTY_THEME);
  return typeof property?.value === 'string' ? property.value : '';
};

/**
 * The applied theme, read from the host rather than mirrored locally: the
 * host rebroadcasts the theme shared property to every mounted microfrontend
 * whenever it changes, including changes this workspace did not make.
 */
export function useHostTheme(bridge: ChildMfeBridge): WorkspaceTheme {
  const [theme, setTheme] = useState<string>(() => readTheme(bridge));

  useEffect(() => {
    setTheme(readTheme(bridge));
    return bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_THEME, (property) => {
      if (typeof property.value === 'string') setTheme(property.value);
    });
  }, [bridge]);

  // The shell registers more themes than the two this workspace toggles
  // between, and only these two declare an appearance. Anything else reads as
  // light, which is what the shell's own default is.
  return theme === 'dark' ? 'dark' : 'light';
}
