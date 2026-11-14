import { useSyncExternalStore } from 'react';

import { useDataGridContext } from '../core/data-grid-context';
import type { ColumnSortSource } from './table-types';

export type ColumnAriaSort = 'ascending' | 'descending' | 'none';

function subscribeNothing() {
  return () => {};
}

function getNothing() {
  return undefined;
}

/**
 * The value of `aria-sort` for one header column, from the grid's own sorting: `ascending` or
 * `descending` while the grid sorts by it (also a column excluded from header sorting that the
 * toolbar sorted, since `aria-sort` states the order of the rows, not the presence of a control),
 * `none` on the other sortable columns, and `undefined` for an unsorted excluded column or a grid
 * with no order plugin, which render no attribute. The plugin is looked up on every render, so
 * one that mounts after the header is read from the next render on; the subscription changes
 * with it, and the hooks called stay the same.
 */
export function useColumnAriaSort(columnId: string): ColumnAriaSort | undefined {
  const context = useDataGridContext();
  const source = context.plugins.getPlugin<Partial<ColumnSortSource>>('order');
  const sortable = source?.subscribeColumnSort ? (source as ColumnSortSource) : undefined;

  const order = useSyncExternalStore(
    sortable?.subscribeColumnSort ?? subscribeNothing,
    sortable?.getColumnSortOrder ?? getNothing,
  );
  const excludedColumns = useSyncExternalStore(
    sortable?.subscribeColumnSort ?? subscribeNothing,
    sortable?.getSortExcludedColumns ?? getNothing,
  );

  if (!sortable) {
    return undefined;
  }

  if (order?.columnId === columnId) {
    return order.direction === 'asc' ? 'ascending' : 'descending';
  }

  return excludedColumns?.includes(columnId) ? undefined : 'none';
}
