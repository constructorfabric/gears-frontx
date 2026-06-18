import React, { useState, useEffect, useCallback } from 'react';
import {
  useAppSelector,
  useHAI3,
  useActivePackage,
  eventBus,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type MenuState,
  type Extension,
  type ScreenExtension,
} from '@gears-frontx/react';
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
  const { screensetsRegistry } = app;
  const activePackage = useActivePackage();

  const collapsed = menuState?.collapsed ?? false;

  const [extensions, setExtensions] = useState<ScreenExtension[]>([]);
  const [mountedId, setMountedId] = useState<string | undefined>();

  useEffect(() => {
    if (!screensetsRegistry) return;

    const refresh = () => {
      let screenExts: ScreenExtension[];
      if (activePackage) {
        const packageExts = screensetsRegistry.getExtensionsForPackage(activePackage);
        screenExts = packageExts.filter(
          (ext: Extension) => ext.domain === FRONTX_SCREEN_DOMAIN && 'presentation' in ext
        ) as ScreenExtension[];
      } else {
        screenExts = screensetsRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN) as ScreenExtension[];
      }
      const sorted = screenExts
        .sort((a, b) => (a.presentation.order ?? 999) - (b.presentation.order ?? 999));
      setExtensions(sorted);
      setMountedId(screensetsRegistry.getMountedExtension(FRONTX_SCREEN_DOMAIN));
    };

    refresh();
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, [screensetsRegistry, activePackage]);

  const handleToggleCollapse = () => {
    eventBus.emit('layout/menu/collapsed', { collapsed: !collapsed });
  };

  const handleMenuItemClick = useCallback(
    async (extensionId: string) => {
      if (!screensetsRegistry || extensionId === mountedId) return;
      await screensetsRegistry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: FRONTX_SCREEN_DOMAIN,
          payload: { extensionId },
        },
      });
      setMountedId(extensionId);
    },
    [screensetsRegistry, mountedId]
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
        <span style={{ fontSize: 20, lineHeight: 1 }}>{collapsed ? '\u2630' : '\u2715'}</span>
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
