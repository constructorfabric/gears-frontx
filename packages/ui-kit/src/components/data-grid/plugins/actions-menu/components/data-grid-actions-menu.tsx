import { EllipsisIcon } from 'lucide-react';

import { Button } from '../../../../button/public.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../../dropdown-menu/public.js';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import { useDataGridPortalContainer } from '../../../services/core/data-grid-portal-container-context';
import type { DataGridActionsMenuPluginApi } from '../actions-menu-types';

export function DataGridActionsMenu() {
  const grid = useDataGrid();
  const actionsMenu = grid.getPlugin<DataGridActionsMenuPluginApi>('actionsMenu')!;
  const menuItems = actionsMenu.useMenuItems();
  const portalContainer = useDataGridPortalContainer();
  const messages = useDataGridMessages();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            icon={<EllipsisIcon />}
            aria-label={messages.actionsMenu.actions}
          />
        }
      />
      <DropdownMenuContent side="bottom" align="end" container={portalContainer}>
        {menuItems.map((menuItem) => (
          <menuItem.component key={menuItem.id} params={menuItem.params} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
