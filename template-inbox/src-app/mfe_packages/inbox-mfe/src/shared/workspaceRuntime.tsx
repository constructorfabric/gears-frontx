/**
 * The two things every part of a screen needs from its surroundings: where kit
 * overlays should portal to, and which theme the host currently has applied.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import {
  FRONTX_SHARED_PROPERTY_THEME,
  type ChildMfeBridge,
} from '@gears-frontx/react';
import { readHostTheme, type WorkspaceTheme } from './workspaceChrome';

const OverlayContainerContext = createContext<HTMLElement | null>(null);

export const OverlayContainerProvider = OverlayContainerContext.Provider;

/**
 * The node to hand kit popups as their `container`. `undefined` while the root
 * has not laid out yet, which is the kit's own "portal to `<body>`" default -
 * an overlay can only open after a click, by which time the root exists.
 */
export const useOverlayContainer = (): HTMLElement | undefined =>
  useContext(OverlayContainerContext) ?? undefined;

/**
 * The applied theme, read from the host rather than mirrored locally: the
 * host rebroadcasts the theme shared property to every mounted microfrontend
 * whenever it changes, including changes this workspace did not make.
 */
export function useHostTheme(bridge: ChildMfeBridge): WorkspaceTheme {
  const [theme, setTheme] = useState<WorkspaceTheme>(() => readHostTheme(bridge));

  // The lazy initializer runs on mount only. If the host swaps the bridge
  // instance, re-read during render: a subscription delivers future changes
  // and never fires for the value the new bridge already holds.
  const [previousBridge, setPreviousBridge] = useState(bridge);
  if (previousBridge !== bridge) {
    setPreviousBridge(bridge);
    setTheme(readHostTheme(bridge));
  }

  useEffect(
    () =>
      bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_THEME, (property) => {
        setTheme(property.value === 'dark' ? 'dark' : 'light');
      }),
    [bridge]
  );

  return theme;
}
