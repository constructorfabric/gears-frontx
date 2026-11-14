import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { Button } from '../../../../button/public.js';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import type { DataGridTableColumn } from '../../../services/table/table-types';
import type { DataGridOrderPluginApi } from '../order-types';

interface DataGridOrderIconProps {
  column: DataGridTableColumn;
}

export function DataGridOrderIcon({ column }: DataGridOrderIconProps) {
  const grid = useDataGrid();
  const orderApi = grid.getPlugin<DataGridOrderPluginApi>('order')!;
  const messages = useDataGridMessages();

  const order = orderApi.useOrder();
  const isOrderable = !orderApi.useIsColumnExcluded(column.id);
  const isActive = isOrderable && order?.columnId === column.id;

  if (!isActive) return null;

  const label = typeof column.label === 'function' ? column.label() : column.label;

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={messages.order.changeSorting(label)}
      icon={order.direction === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />}
      onClick={() => orderApi.toggleOrder(column.id)}
    />
  );
}
