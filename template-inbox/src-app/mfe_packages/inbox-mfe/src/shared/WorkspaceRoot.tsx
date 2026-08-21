import { useEffect, useState, type ReactNode } from 'react';
import { OverlayContainerProvider } from './workspaceRuntime';
import { assertPreferredThemeOnce, collapseHostMenuOnce } from './workspaceChrome';
import styles from '../styles/workspace.module.css';

/**
 * The outermost box of either screen: the flex row the panes sit in, plus the
 * node kit overlays portal into.
 *
 * Mounting it is also where the workspace asks the host for the chrome it
 * wants - a narrowed menu and its own default theme - because both are
 * properties of the workspace rather than of either screen, and both screens
 * mount this. Each is applied once per page load, not once per mount: the
 * screen domain unmounts one screen to mount the other, and re-running either
 * would undo a choice the visitor made in between.
 */
export function WorkspaceRoot({ children }: { children: ReactNode }) {
  // A callback ref stored in state rather than a `useRef`, so the consumers
  // reading it through context re-render once the node exists.
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    collapseHostMenuOnce();
    assertPreferredThemeOnce();
  }, []);

  return (
    <div className={styles.root}>
      <OverlayContainerProvider value={overlayHost}>
        {children}
        <div className={styles.overlayHost} ref={setOverlayHost} />
      </OverlayContainerProvider>
    </div>
  );
}
