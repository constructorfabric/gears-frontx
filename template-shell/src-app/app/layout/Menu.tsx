/**
 * Menu Component
 *
 * Side navigation menu displaying MFE extensions with presentation metadata.
 * Uses local shadcn/ui Sidebar components for proper styling and collapsible behavior.
 *
 * A click mounts the screen and pushes its `presentation.route`, so the URL
 * tracks the mounted screen and the resulting link is shareable;
 * `mfe/MfeScreenContainer.tsx` reads that URL back on load and on back/forward.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  useAppSelector,
  useFrontX,
  useMountedExtensions,
  eventBus,
  FRONTX_SCREEN_DOMAIN,
  type MenuState,
  type ScreenExtension,
} from '@gears-frontx/react';
import { mountScreenExtension } from '@/app/mfe/screenRouting';
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

/**
 * How long registration discovery may stay empty before the menu is allowed to
 * say there are no screens. Spans several poll cycles, so it covers the gap
 * between the menu's first render and the MFEs finishing registration.
 */
export const EMPTY_STATE_GRACE_MS = 2000;

export const Menu: React.FC<MenuProps> = ({ children }) => {
  const menuState = useAppSelector((state) => state['layout/menu'] as MenuState | undefined);
  const app = useFrontX();
  const { mfeRegistry } = app;

  const collapsed = menuState?.collapsed ?? false;

  // Currently-mounted screen extension (subscribes to store changes; no polling).
  // Index 0 is meaningful because the host registers the screen domain with
  // ExclusiveMountStrategy in `bootstrap.ts` (single mount per domain).
  // Reading the mount set rather than tracking clicks is what makes the active
  // item correct for a screen mounted from the URL, which no click announced.
  const mountedScreens = useMountedExtensions(FRONTX_SCREEN_DOMAIN);
  const mountedId = mountedScreens[0]?.id;

  const [extensions, setExtensions] = useState<ScreenExtension[]>([]);
  // An empty registry means "not discovered yet" far more often than it means
  // "nothing to discover": on a hard load the menu renders before the MFEs have
  // registered. Showing the empty-state on that first empty poll would flash a
  // false "no screens" claim through every normal boot, so the claim waits for
  // discovery to settle - it is only trustworthy once polling has run for the
  // whole grace window without ever finding a screen.
  const [discoverySettled, setDiscoverySettled] = useState(false);

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
    // The window starts with discovery itself, not with the component, so a
    // registry that arrives late still gets its full share of poll cycles.
    const graceTimer = setTimeout(() => setDiscoverySettled(true), EMPTY_STATE_GRACE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(graceTimer);
    };
  }, [mfeRegistry]);

  const handleToggleCollapse = () => {
    eventBus.emit('layout/menu/collapsed', { collapsed: !collapsed });
  };

  const handleMenuItemClick = useCallback(
    async (extension: ScreenExtension) => {
      if (!mfeRegistry) return;
      // The URL is pushed before the mount so a screen that fails to mount still
      // leaves the address bar on the screen the user asked for, and so the entry
      // exists before any code the screen runs can push its own.
      // `presentation.route` is schema-required, so an empty one means a manifest
      // that never should have registered - mount it, just without a URL.
      const { route } = extension.presentation;
      if (route && route !== window.location.pathname) {
        window.history.pushState(null, '', route);
      }
      await mountScreenExtension(mfeRegistry, extension.id);
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
          {extensions.map((ext) => {
            const isActive = ext.id === mountedId;
            const pres = ext.presentation;
            return (
              <SidebarMenuItem key={ext.id}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => handleMenuItemClick(ext)}
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
          })}

          {/* Until discovery settles the menu stays blank rather than guessing. */}
          {extensions.length === 0 && discoverySettled && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No screens yet. Add an MFE package by copying the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">_blank-mfe</code> reference scaffold in <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">mfe_packages/</code>, then delete <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">templateExample</code> from the copy&rsquo;s <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">mfe.json</code> so it reaches this menu.
            </div>
          )}
        </SidebarMenu>
      </SidebarContent>

      {children}
    </Sidebar>
  );
};

Menu.displayName = 'Menu';
