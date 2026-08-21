import { useEffect, useState, type ReactNode } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { OverlayContainerProvider } from './workspaceRuntime';
import { assertPreferredTheme, collapseHostMenuOnce, trackHostTheme } from './workspaceChrome';
import styles from '../styles/workspace.module.css';

/**
 * The outermost box of either screen: the flex row the panes sit in, plus the
 * node kit overlays portal into.
 *
 * Mounting it is also where the workspace asks the host for the chrome it
 * wants - a narrowed menu and its own default theme - because both are
 * properties of the workspace rather than of either screen, and both screens
 * mount this. Both requests travel up the actions chain, and both are written
 * to be safe to repeat: the screen domain unmounts one screen to mount the
 * other, so this effect runs again on every jump between them.
 */
export function WorkspaceRoot({
  bridge,
  children,
}: {
  bridge: ChildMfeBridge;
  children: ReactNode;
}) {
  // A callback ref stored in state rather than a `useRef`, so the consumers
  // reading it through context re-render once the node exists.
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Subscribed before the theme is asserted so the host's answer is the
    // first value this workspace records.
    const untrack = trackHostTheme(bridge);
    collapseHostMenuOnce(bridge);
    assertPreferredTheme(bridge);
    return untrack;
  }, [bridge]);

  return (
    <div className={styles.root}>
      <OverlayContainerProvider value={overlayHost}>
        {children}
        <div className={styles.overlayHost} ref={setOverlayHost} />
      </OverlayContainerProvider>
    </div>
  );
}
