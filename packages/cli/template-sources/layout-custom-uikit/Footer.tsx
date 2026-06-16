import React from 'react';
import { useAppSelector, type FooterState } from '@gears-frontx/react';

export interface FooterProps {
  children?: React.ReactNode;
}

export const Footer: React.FC<FooterProps> = ({ children }) => {
  const footerState = useAppSelector((state) => state['layout/footer'] as FooterState | undefined);
  const visible = footerState?.visible ?? true;

  if (!visible) {
    return null;
  }

  return (
    <footer
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 16,
        paddingRight: 16,
        borderTop: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))',
      }}
    >
      {children}
    </footer>
  );
};

Footer.displayName = 'Footer';
