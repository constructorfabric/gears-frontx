import React from 'react';
import { useAppSelector, type PopupSliceState } from '@gears-frontx/react';

export interface PopupProps {
  children?: React.ReactNode;
}

export const Popup: React.FC<PopupProps> = ({ children }) => {
  const popupState = useAppSelector((state) => state['layout/popup'] as PopupSliceState | undefined);
  const stack = popupState?.stack ?? [];

  if (stack.length === 0) {
    return null;
  }

  const topPopup = stack[stack.length - 1];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'hsl(var(--background))',
          opacity: 0.8,
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Dialog */}
      <div
        style={{
          position: 'relative',
          zIndex: 1001,
          width: '100%',
          maxWidth: 512,
          borderRadius: 8,
          border: '1px solid hsl(var(--border))',
          backgroundColor: 'hsl(var(--card))',
          padding: 24,
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
        }}
      >
        {topPopup.title && (
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{topPopup.title}</h2>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

Popup.displayName = 'Popup';
