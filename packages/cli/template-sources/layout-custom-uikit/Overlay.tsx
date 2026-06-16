import React from 'react';
import { useAppSelector, type OverlayState } from '@gears-frontx/react';

export interface OverlayProps {
  children?: React.ReactNode;
}

export const Overlay: React.FC<OverlayProps> = ({ children }) => {
  const overlayState = useAppSelector((state) => state['layout/overlay'] as OverlayState | undefined);
  const visible = overlayState?.visible ?? false;

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'hsl(var(--background))',
        opacity: 0.8,
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
};

Overlay.displayName = 'Overlay';
