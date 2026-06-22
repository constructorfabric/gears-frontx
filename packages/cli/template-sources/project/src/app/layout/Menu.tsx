/**
 * Menu Component (Standalone)
 *
 * Side navigation menu for standalone FrontX projects.
 * Uses local shadcn/ui Sidebar components for proper styling and collapsible behavior.
 */

import React from 'react';
import {
  useAppSelector,
  eventBus,
  type MenuState,
} from '@gears-frontx/react';
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from '@/app/components/ui/sidebar';
import { FrontXLogoIcon } from '@/app/icons/FrontXLogoIcon';
import { FrontXLogoTextIcon } from '@/app/icons/FrontXLogoTextIcon';

export interface MenuProps {
  children?: React.ReactNode;
}

export const Menu: React.FC<MenuProps> = ({ children }) => {
  const menuState = useAppSelector((state) => state['layout/menu'] as MenuState | undefined);
  const collapsed = menuState?.collapsed ?? false;

  const handleToggleCollapse = () => {
    eventBus.emit('layout/menu/collapsed', { collapsed: !collapsed });
  };

  return (
    <Sidebar collapsed={collapsed}>
      <SidebarHeader
        logo={<FrontXLogoIcon />}
        logoText={!collapsed ? <FrontXLogoTextIcon /> : undefined}
        collapsed={collapsed}
        onClick={handleToggleCollapse}
      />

      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive>
              <span>Home</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>

      {children}
    </Sidebar>
  );
};

Menu.displayName = 'Menu';
