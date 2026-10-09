import type { StoreApi } from 'zustand';
import type { UseBoundStore } from 'zustand/react';
import type { DataGridItem } from '../../data-grid-types';
import type { TableStickyService } from './table-sticky';
import type {
  DataGridTableColumn,
  RegisteredTableComponent,
  TableComponentName,
  TableHeaderCell,
  TableStore,
} from './table-types';
import { isTableGroup } from './table-types';

export function prepareTableHeader<TItem extends DataGridItem = DataGridItem>(
  useTableStore: UseBoundStore<StoreApi<TableStore<TItem>>>,
  stickyApi: TableStickyService<TItem>,
  defaultComponents: Map<TableComponentName, RegisteredTableComponent>,
) {
  const emptyTableColumnArray: DataGridTableColumn<TItem>[] = [];
  // Caches for referential stability in reactive hooks
  let headerCellsCache: { state: TableStore<TItem>; result: TableHeaderCell<TItem>[] } | null =
    null;
  let headerColumnsCache: { state: TableStore<TItem>; result: DataGridTableColumn<TItem>[] } | null =
    null;

  return {
    useHasGroups,
    useFirstRowHeaderCells,
    useSecondRowHeaderColumns,
  };

  function getVisibleColumns(): DataGridTableColumn<TItem>[] {
    const state = useTableStore.getState();
    const visible = state.flatColumns.filter((col) => state.columnVisibility.get(col.id) !== false);
    return stickyApi.getOrderedColumnsWithSticky(visible, state.columnSticky);
  }

  function hasGroups(): boolean {
    return useTableStore.getState().columns.some(isTableGroup);
  }

  function getFirstRowHeaderCells(): TableHeaderCell<TItem>[] {
    const state = useTableStore.getState();
    const visibleCols = getVisibleColumns();

    if (!hasGroups()) {
      const component =
        state.components.get('header-cell') ?? defaultComponents.get('header-cell')!;
      return visibleCols.map((column) => ({
        type: 'column' as const,
        item: column,
        component,
      }));
    }

    const columnOrderMap = new Map(visibleCols.map((col, index) => [col.id, index]));
    const orderedItems = [...state.columns].sort((a, b) => {
      const aIndex = isTableGroup(a)
        ? Math.min(...a.columns.map((c) => columnOrderMap.get(c.id) ?? Infinity))
        : (columnOrderMap.get(a.id) ?? Infinity);
      const bIndex = isTableGroup(b)
        ? Math.min(...b.columns.map((c) => columnOrderMap.get(c.id) ?? Infinity))
        : (columnOrderMap.get(b.id) ?? Infinity);
      return aIndex - bIndex;
    });

    return orderedItems.flatMap((item) => {
      if (isTableGroup(item)) {
        const visibleCount = item.columns.filter(
          (c) => state.columnVisibility.get(c.id) !== false,
        ).length;

        if (visibleCount === 0) return [];

        return {
          type: 'group' as const,
          item,
          component: state.components.get('header-group') ?? defaultComponents.get('header-group')!,
          colspan: visibleCount,
        };
      }

      if (state.columnVisibility.get(item.id) === false) return [];

      return {
        type: 'column' as const,
        item,
        component: state.components.get('header-cell') ?? defaultComponents.get('header-cell')!,
        rowspan: 2,
      };
    });
  }

  function getSecondRowHeaderColumns(): DataGridTableColumn<TItem>[] {
    if (!hasGroups()) return emptyTableColumnArray;

    const state = useTableStore.getState();
    const visibleCols = getVisibleColumns();
    return visibleCols.filter((col) => col.groupId && state.columnVisibility.get(col.id) !== false);
  }

  function useHasGroups() {
    return useTableStore((state) => state.columns.some(isTableGroup));
  }

  function useFirstRowHeaderCells(): TableHeaderCell<TItem>[] {
    return useTableStore((state) => {
      if (headerCellsCache !== null && headerCellsCache.state === state) {
        return headerCellsCache.result;
      }
      const result = getFirstRowHeaderCells();
      headerCellsCache = { state, result };
      return result;
    });
  }

  function useSecondRowHeaderColumns(): DataGridTableColumn<TItem>[] {
    return useTableStore((state) => {
      if (headerColumnsCache !== null && headerColumnsCache.state === state) {
        return headerColumnsCache.result;
      }
      const result = getSecondRowHeaderColumns();
      headerColumnsCache = { state, result };
      return result;
    });
  }
}
