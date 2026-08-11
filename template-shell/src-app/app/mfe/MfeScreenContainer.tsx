// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

/**
 * MFE Screen Container Component
 *
 * Bootstraps MFE domains and extensions on first mount, then renders the
 * per-domain `<ExtensionDomainSlot>` for the screen domain. The slot owns its
 * own DOM root attachment via the per-domain mounter; the slot never mounts on
 * its own - the host dispatches the mount.
 *
 * This container is the host side of that contract for the URL: it mounts the
 * screen the current path names once bootstrap has registered the extensions,
 * and again on back/forward. Menu clicks are the other entry point and push the
 * matching URL (`layout/Menu.tsx`).
 */

import { useEffect, useRef, useState } from 'react';
import {
  useFrontX,
  ExtensionDomainSlot,
  screenDomain,
} from '@gears-frontx/react';
import { bootstrapMFE } from './bootstrap';
import { mountScreenExtension, resolveScreenFromPath } from './screenRouting';

export function MfeScreenContainer() {
  const app = useFrontX();
  const bootstrappedRef = useRef(false);
  const initialMountRef = useRef(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    bootstrapMFE(app).then(() => {
      setBootstrapped(true);
    }).catch((error) => {
      console.error('[MFE Bootstrap] Failed to bootstrap MFE:', error);
    });
  }, [app]);

  // Runs only once `bootstrapped` is set, i.e. after `bootstrapMFE` resolved and
  // every extension is registered - resolving earlier would search an empty
  // registry and mount nothing.
  useEffect(() => {
    const registry = app.mfeRegistry;
    if (!bootstrapped || !registry) return;

    const mountScreenForLocation = () => {
      const screen = resolveScreenFromPath(
        window.location.pathname,
        registry.getExtensionsForDomain(screenDomain.id),
      );
      if (!screen) return;
      mountScreenExtension(registry, screen.id).catch((error) => {
        console.error('[MFE Screen] Failed to mount screen for the current URL:', error);
      });
    };

    // Once per container instance: the mount chain is async, and StrictMode
    // re-runs this effect before the first chain settles - a second dispatch
    // would race it into mounting the same screen twice.
    if (!initialMountRef.current) {
      initialMountRef.current = true;
      mountScreenForLocation();
    }

    window.addEventListener('popstate', mountScreenForLocation);
    return () => window.removeEventListener('popstate', mountScreenForLocation);
  }, [bootstrapped, app]);

  return (
    <div className="flex-1 overflow-auto" data-mfe-screen-container>
      {bootstrapped && app.mfeRegistry ? (
        <ExtensionDomainSlot
          registry={app.mfeRegistry}
          domainId={screenDomain.id}
          className="h-full"
        />
      ) : null}
    </div>
  );
}
