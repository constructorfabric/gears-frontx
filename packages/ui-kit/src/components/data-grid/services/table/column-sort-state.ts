import { useSyncExternalStore } from 'react';

import { useTableService } from './table-context';

export type ColumnAriaSort = 'ascending' | 'descending' | 'none';

function subscribeNothing() {
  return () => {};
}

function getNothing() {
  return undefined;
}

/**
 * The value of `aria-sort` for one header column, from the sort source a sorting plugin registered
 * with `registerColumnSortSource`: `ascending` or `descending` while the grid sorts by it (also a
 * column excluded from header sorting that the toolbar sorted, since `aria-sort` states the order
 * of the rows, not the presence of a control), `none` on the other sortable columns, and
 * `undefined` for an unsorted excluded column or a grid with no sort source, which render no
 * attribute. The source is read from the table store, so one registered after the header mounted
 * is read from the next render on; the subscription changes with it, and the hooks called stay
 * the same.
 */
export function useColumnAriaSort(columnId: string): ColumnAriaSort | undefined {
  const sortable = useTableService().useColumnSortSource();

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
