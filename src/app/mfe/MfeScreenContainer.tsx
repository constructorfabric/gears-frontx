/**
 * MFE Screen Container Component
 *
 * Provides the DOM container element for MFE screen domain.
 * This container is provided to the screen domain via RefContainerProvider.
 */

import { useRef, useEffect } from 'react';
import { useHAI3 } from '@gears-frontx/react';
import { bootstrapMFE } from './bootstrap';

/**
 * Container component for MFE screen domain.
 * Renders a div that MFEs will mount into.
 */
export function MfeScreenContainer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const app = useHAI3();
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    // Bootstrap MFE system once on mount
    if (!bootstrappedRef.current && containerRef.current) {
      bootstrappedRef.current = true;
      // Cast ref to non-null since we know it's assigned
      bootstrapMFE(app, containerRef as React.RefObject<HTMLDivElement>).catch((error) => {
        console.error('[MFE Bootstrap] Failed to bootstrap MFE:', error);
      });
    }
  }, [app]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto"
      data-mfe-screen-container
    />
  );
}
