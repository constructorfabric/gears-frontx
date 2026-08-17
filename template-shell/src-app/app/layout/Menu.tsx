/**
 * Menu Component
 *
 * Side navigation menu displaying MFE extensions with presentation metadata.
 * Uses local shadcn/ui Sidebar components for proper styling and collapsible behavior.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  useAppSelector,
  useFrontX,
  useMountedExtensions,
  eventBus,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type MenuState,
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
import { FrontXLogoIcon } from '@/app/icons/FrontXLogoIcon';
import { FrontXLogoTextIcon } from '@/app/icons/FrontXLogoTextIcon';

export interface MenuProps {
  children?: React.ReactNode;
}

const hintCodeClass = 'rounded bg-muted px-1.5 py-0.5 font-mono text-xs';

/**
 * Test id of the menu item that mounts `extensionId`.
 *
 * This is a verification API, not a styling hook: an unattended browser run
 * clicks screens through it, so the value is part of what the host promises
 * and may not be renamed to suit a stylesheet. Nothing in the app selects on
 * it. Without a stable handle a run addresses menu items through
 * accessibility references, which are re-issued on every navigation and every
 * theme switch, so each click costs a snapshot taken only to learn the
 * reference again.
 *
 * The extension id goes in verbatim, and it is the extension id rather than
 * `presentation.route` for two reasons. It is the identity the registry keys
 * on - the same value this component already uses as the React key and as the
 * mount subject - so two menu items cannot carry one id. The route is
 * presentation metadata beside it: nothing stops two extensions declaring the
 * same route, and an extension may declare none at all. A route-derived id
 * could therefore either collide or collapse to the bare prefix. Verbatim also
 * means no slug step, which is its own collision risk - `a.b` and `a-b` slug to
 * one string, and extension ids are built from punctuation a slug would
 * flatten.
 */
export const menuItemTestId = (extensionId: string): string => `menu-item-${extensionId}`;

export const Menu: React.FC<MenuProps> = ({ children }) => {
  const menuState = useAppSelector((state) => state['layout/menu'] as MenuState | undefined);
  const app = useFrontX();
  const { mfeRegistry } = app;

  const collapsed = menuState?.collapsed ?? false;

  // Currently-mounted screen extension (subscribes to store changes; no polling).
  // Index 0 is meaningful because the host registers the screen domain with
  // ExclusiveMountStrategy in `bootstrap.ts` (single mount per domain).
  const mountedScreens = useMountedExtensions(FRONTX_SCREEN_DOMAIN);
  const mountedId = mountedScreens[0]?.id;

  const [extensions, setExtensions] = useState<ScreenExtension[]>([]);

  useEffect(() => {
    if (!mfeRegistry) return;

    const refresh = () => {
      const screenExts = mfeRegistry.getExtensionsForDomain(FRONTX_SCREEN_DOMAIN) as ScreenExtension[];
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
      if (!mfeRegistry) return;
      await mfeRegistry.executeActionsChain({
        action: {
          type: FRONTX_ACTION_MOUNT_EXT,
          target: FRONTX_SCREEN_DOMAIN,
          payload: { subject: extensionId },
        },
      });
    },
    [mfeRegistry]
  );

  return (
    <Sidebar collapsed={collapsed}>
      {/* Logo/Brand area with collapse button */}
      <SidebarHeader
        logo={<FrontXLogoIcon />}
        logoText={!collapsed ? <FrontXLogoTextIcon /> : undefined}
        collapsed={collapsed}
        onClick={handleToggleCollapse}
      />

      {/* Menu items */}
      <SidebarContent>
        <SidebarMenu>
          {extensions.length === 0 ? (
            // Reached from two different states, so the hint names the step that
            // tells them apart: a shell-only seed has no `src-app/mfe_packages/`
            // at all until the MFE template is added, and pointing such a
            // project at a scaffold it does not carry is a dead end.
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No screens yet. If this project has no{' '}
              <code className={hintCodeClass}>src-app/mfe_packages/</code> directory, run{' '}
              <code className={hintCodeClass}>frontx add frontx-template-mfe</code> and{' '}
              <code className={hintCodeClass}>npm install</code> to get it. Then add a package by
              copying the <code className={hintCodeClass}>_blank-mfe</code> scaffold, and delete{' '}
              <code className={hintCodeClass}>templateExample</code> from the copy&rsquo;s{' '}
              <code className={hintCodeClass}>mfe.json</code> so it reaches this menu.
            </div>
          ) : (
            extensions.map((ext) => {
              const isActive = ext.id === mountedId;
              const pres = ext.presentation;
              return (
                <SidebarMenuItem key={ext.id}>
                  <SidebarMenuButton
                    data-testid={menuItemTestId(ext.id)}
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
