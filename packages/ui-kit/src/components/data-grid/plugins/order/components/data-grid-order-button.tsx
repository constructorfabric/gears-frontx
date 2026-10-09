import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PencilLineIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../../../button/public.js';
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '../../../../dropdown-menu/public.js';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../popover/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { messages } from '../../../messages';
import { useDataGrid } from '../../../services/core/data-grid-context';
import type { OrderDirection } from '../../../services/plugins/plugins-types';
import type { DataGridOrderPluginApi } from '../order-types';
import { getOrderLabels } from '../services/order-labels';
import styles from './data-grid-order-button.module.css';

export function DataGridOrderButton() {
  const grid = useDataGrid<DataGridItem>();
  const orderApi = grid.getPlugin<DataGridOrderPluginApi>('order')!;
  const [open, setOpen] = useState(false);

  const order = orderApi.useOrder();
  const options = orderApi.useOptions();

  const selectedOption = order ? (options.find((opt) => opt.id === order.columnId) ?? null) : null;
  const columnType = selectedOption?.type ?? 'string';
  const orderLabels = getOrderLabels(columnType);

  const buttonLabel = selectedOption ? selectedOption.label : messages.order.sort;

  function selectColumn(columnId: string) {
    const defaultDirection: OrderDirection = 'desc';
    orderApi.setOrder(columnId, defaultDirection);
    setOpen(false);
  }

  function selectDirection(direction: OrderDirection) {
    if (!order) return;
    orderApi.setOrder(order.columnId, direction);
    setOpen(false);
  }

  const directionIcon =
    order?.direction === 'asc' ? (
      <ChevronUpIcon />
    ) : order?.direction === 'desc' ? (
      <ChevronDownIcon />
    ) : null;

  const triggerButton = (
    // `lg` is the height of the search field it sits beside in the toolbar (both are the kit's
    // 40px step); the default step would sit 4px shorter than the field.
    <Button
      variant="outline"
      size="lg"
      icon={<PencilLineIcon />}
      end={directionIcon}
      aria-label={messages.order.sort}
    >
      {buttonLabel}
    </Button>
  );

  const popoverStyle = orderApi.popover?.minInlineSize
    ? { minInlineSize: `${orderApi.popover.minInlineSize}px` }
    : undefined;

  if (options.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={triggerButton} />
      <PopoverContent side="bottom" align="end">
        {/* The menu parts without a popup of their own: the popover is the popup, and the menu
            only supplies the items, so there is no arrow-key navigation between them. */}
        <DropdownMenu open modal={false}>
          <div className={styles.orderPopover} style={popoverStyle}>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{messages.order.sortBy}</DropdownMenuLabel>
              {options.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  className={styles.menuItem}
                  onClick={() => selectColumn(option.id)}
                >
                  {option.label}
                  {order?.columnId === option.id && <CheckIcon className={styles.check} />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>{messages.order.order}</DropdownMenuLabel>
              <DropdownMenuItem
                className={styles.menuItem}
                disabled={!order}
                onClick={() => selectDirection('asc')}
              >
                {orderLabels.ascending}
                {order?.direction === 'asc' && <CheckIcon className={styles.check} />}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={styles.menuItem}
                disabled={!order}
                onClick={() => selectDirection('desc')}
              >
                {orderLabels.descending}
                {order?.direction === 'desc' && <CheckIcon className={styles.check} />}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </div>
        </DropdownMenu>
      </PopoverContent>
    </Popover>
  );
}
