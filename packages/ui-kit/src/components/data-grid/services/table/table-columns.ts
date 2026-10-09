import type { StoreApi } from 'zustand';
import type { UseBoundStore } from 'zustand/react';
import { useShallow } from 'zustand/react/shallow';
import type { DataGridItem } from '../../data-grid-types';
import type { TableColumnsPersistence } from './table-columns-persistence';
import type { TableStickyService } from './table-sticky';
import type { DataGridTableColumn, DataGridTableGroup, DataGridTableLayout, TableStore } from './table-types';
import { isTableGroup } from './table-types';

const snakeCaseRe = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export function prepareTableColumns<TItem extends DataGridItem = DataGridItem>(
  useTableStore: UseBoundStore<StoreApi<TableStore<TItem>>>,
  stickyApi: TableStickyService<TItem>,
  persistence?: TableColumnsPersistence,
) {
  // DEV-only "warn once per column id" throttles -- the columns effect re-fires on every new
  // `columns` array identity, and these must not spam on every re-render.
  const widthContradictionWarned = new Set<string>();
  const headerTruncateDeprecationWarned = new Set<string>();
  // Grid-level (not per-column) warn -- fires at most once for this grid instance's lifetime.
  let allColumnsCappedWarned = false;

  return {
    initializeColumns,
    useVisibleColumns,
  };

  function assertColumnId(id: string): void {
    if (!snakeCaseRe.test(id)) {
      throw new Error(`Column id "${id}" must be snake_case (e.g., "user_name", "is_active").`);
    }
  }

  /**
   * `headerTruncate` (deprecated) aliases to `headerOverflow: 'nowrap'` so every downstream
   * reader only ever sees `headerOverflow`. Returns the original column unchanged when no
   * normalization is needed, to avoid mutating/copying caller-owned column objects.
   */
  function normalizeColumn(col: DataGridTableColumn<TItem>): DataGridTableColumn<TItem> {
    if (!col.headerTruncate || col.headerOverflow !== undefined) return col;

    if (process.env.NODE_ENV !== 'production' && !headerTruncateDeprecationWarned.has(col.id)) {
      headerTruncateDeprecationWarned.add(col.id);
      console.warn(
        `[DataGrid] Column "${col.id}": \`headerTruncate\` is deprecated, use ` +
          "`headerOverflow: 'nowrap'` instead. `headerTruncate` will be removed in a " +
          'future release.',
      );
    }

    return { ...col, headerOverflow: 'nowrap' };
  }

  /**
   * Under `tableLayout="fixed"` the three width props collapse to a single track. Setting
   * `width` alongside `minWidth`/`maxWidth` -- or setting both `minWidth` and `maxWidth` without
   * a `width` to pick between them -- is a contradiction fixed layout cannot honor; a lone prop
   * is a valid track alias and does not warn. `width: 'min-content'` short-circuits this check
   * entirely -- it resolves via measurement rather than a literal author-set value (see
   * `resolveColumnStyle`), so pairing it with `minWidth`/`maxWidth` isn't flagged as the same
   * kind of contradiction.
   */
  function warnOnFixedModeWidthContradiction(
    col: DataGridTableColumn<TItem>,
    tableLayout: DataGridTableLayout,
  ) {
    if (tableLayout !== 'fixed') return;
    if (process.env.NODE_ENV === 'production') return;
    if (col.width === 'min-content') return;

    const definedCount = [col.width, col.minWidth, col.maxWidth].filter(
      (value) => value !== undefined,
    ).length;
    if (definedCount <= 1) return;
    if (widthContradictionWarned.has(col.id)) return;

    widthContradictionWarned.add(col.id);
    console.warn(
      `[DataGrid] Column "${col.id}": width, minWidth, and maxWidth cannot all apply under ` +
        'tableLayout="fixed" -- they collapse to a single track (width wins when set). Use ' +
        'tableLayout="auto" for independent min/max constraints, or drop the extra prop(s).',
    );
  }

  /**
   * Under `tableLayout="auto"`, a column's `width`/`maxWidth` is a cap honored only when the
   * browser has slack to give it -- when EVERY column is constrained (a `width` or `maxWidth` of
   * its own) and the container is wider than their sum, there is no widthless column left to
   * absorb the extra space, so the browser grows every column past its cap and capped content
   * shows trailing blank space. This is an accepted, documented limitation (see data-grid.md); the
   * warning just points a dev at the fix.
   */
  function warnOnAllColumnsCappedUnderAuto(
    flatCols: DataGridTableColumn<TItem>[],
    tableLayout: DataGridTableLayout,
  ) {
    if (tableLayout !== 'auto') return;
    if (process.env.NODE_ENV === 'production') return;
    if (allColumnsCappedWarned) return;
    if (flatCols.length === 0) return;

    const allConstrained = flatCols.every(
      (col) => col.width !== undefined || col.maxWidth !== undefined,
    );
    if (!allConstrained) return;

    allColumnsCappedWarned = true;
    console.warn(
      '[DataGrid] Every column has a width or maxWidth under tableLayout="auto" -- if the ' +
        'container is wider than their sum, the browser will grow columns past their caps and ' +
        'capped content will show trailing blank space. Leave at least one column without a ' +
        'width/maxWidth to absorb the extra space.',
    );
  }

  function flattenColumns(
    columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[],
  ): DataGridTableColumn<TItem>[] {
    const result: DataGridTableColumn<TItem>[] = [];

    for (const item of columns) {
      if (isTableGroup(item)) {
        for (const col of item.columns) {
          result.push(normalizeColumn({ ...col, groupId: item.id }));
        }
      } else {
        result.push(normalizeColumn(item));
      }
    }

    return result;
  }

  function initializeColumnVisibility(
    columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[],
  ): Map<string, boolean> {
    const map = new Map<string, boolean>();
    const lockedIds = new Set<string>();

    function register(col: DataGridTableColumn<TItem>) {
      map.set(col.id, col.visible ?? true);
      if (col.visibleToggleDisabled) {
        lockedIds.add(col.id);
      }
    }

    for (const item of columns) {
      if (isTableGroup(item)) {
        for (const col of item.columns) {
          register(col);
        }
      } else {
        register(item);
      }
    }

    for (const [columnId, visible] of Object.entries(persistence?.read() ?? {})) {
      // A stored id for a column this grid no longer has is dropped rather than carried: the
      // grid's columns can change between releases, and the store outlives them.
      //
      // A column the grid marks `visibleToggleDisabled` is dropped too. Its visibility is the
      // grid's decision rather than the user's, and a stored `false` from before the grid locked
      // it would hide the column behind a toggle that can no longer bring it back.
      if (map.has(columnId) && !lockedIds.has(columnId)) {
        map.set(columnId, visible);
      }
    }

    return map;
  }

  function useVisibleColumns(): DataGridTableColumn<TItem>[] {
    return useTableStore(
      useShallow((s) => {
        const visible = s.flatColumns.filter((c) => s.columnVisibility.get(c.id) !== false);
        return stickyApi.getOrderedColumnsWithSticky(visible, s.columnSticky);
      }),
    );
  }

  function initializeColumns(columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[]) {
    const flatCols = flattenColumns(columns);
    const { tableLayout } = useTableStore.getState();

    for (const col of flatCols) {
      assertColumnId(col.id);
      warnOnFixedModeWidthContradiction(col, tableLayout);
    }
    warnOnAllColumnsCappedUnderAuto(flatCols, tableLayout);

    return {
      columns,
      flatColumns: flatCols,
      columnVisibility: initializeColumnVisibility(columns),
    };
  }
}
