import { create } from 'zustand';
import type { DataGridItem } from '../../data-grid-types';
import type { TableStore } from './table-types';

export function createTableStore<TItem extends DataGridItem = DataGridItem>() {
  return create<TableStore<TItem>>(() => ({
    columns: [],
    flatColumns: [],
    columnVisibility: new Map(),
    columnSticky: new Map(),
    groupSticky: new Map(),
    columnWidths: new Map(),
    minContentWidths: new Map(),
    extraColumnsStart: [],
    extraColumnsEnd: [],
    slots: new Map(),
    components: new Map(),
    tableLayout: 'fixed',
    stickyHeader: false,
  }));
}
