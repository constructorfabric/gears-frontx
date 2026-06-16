import React from 'react';
import { useAppSelector, type SidebarState } from '@gears-frontx/react';

export interface SidebarProps {
  children?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ children }) => {
  const sidebarState = useAppSelector((state) => state['layout/sidebar'] as SidebarState | undefined);

  const visible = sidebarState?.visible ?? false;
  const collapsed = sidebarState?.collapsed ?? true;

  if (!visible) {
    return null;
  }

  return (
    <aside
      style={{
        width: collapsed ? 0 : 320,
        transition: 'width 0.2s',
        borderLeft: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
        {children}
      </div>
    </aside>
  );
};

Sidebar.displayName = 'Sidebar';
