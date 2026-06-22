// @cpt-flow:cpt-frontx-flow-request-lifecycle-query-client-lifecycle:p2

/**
 * MFE Screen Container Component
 *
 * Bootstraps MFE domains and extensions on first mount, then renders the
 * per-domain `<ExtensionDomainSlot>` for the screen domain. The slot owns its
 * own DOM root attachment via the per-domain mounter; mount/unmount actions
 * are dispatched by other components (e.g., the menu) through
 * `registry.executeActionsChain`.
 */

import { useEffect, useRef, useState } from 'react';
import {
  useFrontX,
  ExtensionDomainSlot,
  screenDomain,
} from '@gears-frontx/react';
import { bootstrapMFE } from './bootstrap';

export function MfeScreenContainer() {
  const app = useFrontX();
  const bootstrappedRef = useRef(false);
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
