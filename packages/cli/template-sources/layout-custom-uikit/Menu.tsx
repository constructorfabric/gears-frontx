import React, { useState, useEffect, useCallback } from 'react';
import {
  useAppSelector,
  useHAI3,
  useMountedExtensions,
  eventBus,
  HAI3_ACTION_MOUNT_EXT,
  HAI3_SCREEN_DOMAIN,
  type MenuState,
  type ScreenExtension,
} from '@cyberfabric/react';
import * as lucideIcons from 'lucide-react';

type LucideIcon = React.ComponentType<lucideIcons.LucideProps>;

function resolveLucideIcon(iconStr?: string): LucideIcon | null {
  if (!iconStr) return null;
  const name = iconStr.startsWith('lucide:') ? iconStr.slice(7) : iconStr;
  const pascal = name
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  const icon = (lucideIcons as Record<string, unknown>)[pascal];
  if (icon && typeof icon === 'object' && 'render' in icon) return icon as LucideIcon;
  return null;
}

export interface MenuProps {
  children?: React.ReactNode;
}

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 56;

export const Menu: React.FC<MenuProps> = ({ children }) => {
  const menuState = useAppSelector((state) => state['layout/menu'] as MenuState | undefined);
  const app = useHAI3();
  const { mfeRegistry } = app;

  const collapsed = menuState?.collapsed ?? false;

  // Currently-mounted screen extension (subscribes to store changes; no polling).
  // Index 0 is meaningful because the host registers the screen domain with
  // ExclusiveMountStrategy (single mount per domain).
  const mountedScreens = useMountedExtensions(HAI3_SCREEN_DOMAIN);
  const mountedId = mountedScreens[0]?.id;

  const [extensions, setExtensions] = useState<ScreenExtension[]>([]);

  useEffect(() => {
    if (!mfeRegistry) return;

    const refresh = () => {
      const screenExts = mfeRegistry.getExtensionsForDomain(HAI3_SCREEN_DOMAIN) as ScreenExtension[];
      const sorted = screenExts
        .sort((a, b) => (a.presentation.order ?? 999) - (b.presentation.order ?? 999));
      setExtensions(sorted);
    };

    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [mfeRegistry]);

  const handleToggleCollapse = () => {
    eventBus.emit('layout/menu/collapsed', { collapsed: !collapsed });
  };

  const handleMenuItemClick = useCallback(
    async (extensionId: string) => {
      if (!mfeRegistry || extensionId === mountedId) return;
      await mfeRegistry.executeActionsChain({
        action: {
          type: HAI3_ACTION_MOUNT_EXT,
          target: HAI3_SCREEN_DOMAIN,
          payload: { subject: extensionId },
        },
      });
    },
    [mfeRegistry, mountedId]
  );

  return (
    <nav
      style={{
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        transition: 'width 0.2s',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--card))',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header / collapse toggle */}
      <button
        onClick={handleToggleCollapse}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          color: 'hsl(var(--foreground))',
        }}
      >
        <span style={{ fontSize: 20, lineHeight: 1 }}>{collapsed ? '☰' : '✕'}</span>
        {!collapsed && <span style={{ fontWeight: 600, fontSize: 14 }}>Menu</span>}
      </button>

      {/* Navigation items */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, overflowY: 'auto' }}>
        {extensions.length === 0 ? (
          <li style={{ padding: '16px 12px', fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
            {collapsed ? '' : 'No screens yet.'}
          </li>
        ) : (
          extensions.map((ext) => {
            const isActive = ext.id === mountedId;
            const pres = ext.presentation;
            const Icon = resolveLucideIcon(pres.icon);
            return (
              <li key={ext.id}>
                <button
                  onClick={() => handleMenuItemClick(ext.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: collapsed ? '8px 0' : '8px 16px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    border: 'none',
                    background: isActive ? 'hsl(var(--accent))' : 'none',
                    color: isActive ? 'hsl(var(--accent-foreground))' : 'hsl(var(--foreground))',
                    cursor: 'pointer',
                    fontSize: 14,
                    textAlign: 'left',
                    borderRadius: 4,
                  }}
                  title={collapsed ? pres.label : undefined}
                >
                  {Icon ? (
                    <Icon size={20} style={{ flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 20, textAlign: 'center', flexShrink: 0, fontWeight: 600 }}>
                      {pres.label.charAt(0)}
                    </span>
                  )}
                  {!collapsed && <span>{pres.label}</span>}
                </button>
              </li>
            );
          })
        )}
      </ul>

      {children}
    </nav>
  );
};

Menu.displayName = 'Menu';
