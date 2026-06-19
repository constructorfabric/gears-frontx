/**
 * Menu Component
 *
 * Side navigation menu displaying MFE extensions with presentation metadata.
 * Uses local shadcn/ui Sidebar components for proper styling and collapsible behavior.
 */

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
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuIcon,
  SidebarHeader,
} from '@/app/components/ui/sidebar';
import { Icon } from '@iconify/react';
import { HAI3LogoIcon } from '@/app/icons/HAI3LogoIcon';
import { HAI3LogoTextIcon } from '@/app/icons/HAI3LogoTextIcon';

export interface MenuProps {
  children?: React.ReactNode;
}

export const Menu: React.FC<MenuProps> = ({ children }) => {
  const menuState = useAppSelector((state) => state['layout/menu'] as MenuState | undefined);
  const app = useHAI3();
  const { screensetsRegistry } = app;
  const activePackage = useActivePackage();

  const collapsed = menuState?.collapsed ?? false;

  // Extension-driven menu state — filtered by active GTS package
  const [extensions, setExtensions] = useState<ScreenExtension[]>([]);
  const [mountedId, setMountedId] = useState<string | undefined>();

  useEffect(() => {
    if (!screensetsRegistry) return;

    const refresh = () => {
      let screenExts: ScreenExtension[];
      if (activePackage) {
        // Filter extensions by the active GTS package, then by screen domain
        const packageExts = screensetsRegistry.getExtensionsForPackage(activePackage);
        screenExts = packageExts.filter(
          (ext: Extension) => ext.domain === FRONTX_SCREEN_DOMAIN && 'presentation' in ext
        ) as ScreenExtension[];
      } else {
        // Fallback: show all screen extensions when no package is active yet
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
      if (!screensetsRegistry) return;
      await screensetsRegistry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: FRONTX_SCREEN_DOMAIN,
          payload: { extensionId },
        },
      });
      setMountedId(extensionId);
    },
    [screensetsRegistry]
  );

  return (
    <Sidebar collapsed={collapsed}>
      {/* Logo/Brand area with collapse button */}
      <SidebarHeader
        logo={<HAI3LogoIcon />}
        logoText={!collapsed ? <HAI3LogoTextIcon /> : undefined}
        collapsed={collapsed}
        onClick={handleToggleCollapse}
      />

      {/* Menu items */}
      <SidebarContent>
        <SidebarMenu>
          {extensions.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No screens yet. Create a screenset with <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">hai3 screenset create</code> or add MFE packages.
            </div>
          ) : (
            extensions.map((ext) => {
              const isActive = ext.id === mountedId;
              const pres = ext.presentation;
              return (
                <SidebarMenuItem key={ext.id}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => handleMenuItemClick(ext.id)}
                    tooltip={collapsed ? pres.label : undefined}
                  >
                    {pres.icon && (
                      <SidebarMenuIcon>
                        <Icon icon={pres.icon} className="w-4 h-4" />
                      </SidebarMenuIcon>
                    )}
                    <span>{pres.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })
          )}
        </SidebarMenu>
      </SidebarContent>

      {children}
    </Sidebar>
  );
};

Menu.displayName = 'Menu';
