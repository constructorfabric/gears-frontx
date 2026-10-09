import type { StoreApi } from 'zustand';
import type { UseBoundStore } from 'zustand/react';
import type { DataGridItem } from '../../data-grid-types';
import type {
  ExtraColumn,
  ExtraColumnOption,
  ExtraColumnPosition,
  TableStore,
} from './table-types';

export function prepareTableExtraColumns<TItem extends DataGridItem = DataGridItem>(
  useTableStore: UseBoundStore<StoreApi<TableStore<TItem>>>,
) {
  // DEV-only "warn once per column id" throttle -- `updateExtraColumnSticky` is called from a
  // plugin's `onPropsChange`, which runs on every re-render, so an unthrottled warning would spam.
  const startPinWarned = new Set<string>();

  return {
    registerExtraColumn,
    updateExtraColumnWidth,
    updateExtraColumnOrder,
    updateExtraColumnSticky,
    useExtraColumns,
  };

  function registerExtraColumn(option: ExtraColumnOption) {
    const store = useTableStore.getState();
    const position = option.position ?? 'end';
    const existing = position === 'start' ? store.extraColumnsStart : store.extraColumnsEnd;
    const order = option.order ?? (existing.length + 1) * 10;

    const newColumn: ExtraColumn = {
      id: option.id ?? Math.random().toString(36).slice(2),
      header: option.header,
      body: option.body,
      width: option.width,
      sticky: option.sticky,
      ignoreRowClick: option.ignoreRowClick,
      order,
      position,
    };

    const updated = [...existing, newColumn].sort((a, b) => a.order - b.order);

    if (position === 'start') {
      warnOnStartColumnPin(newColumn.id, newColumn.sticky);
      useTableStore.setState({ extraColumnsStart: updated });
    } else {
      useTableStore.setState({ extraColumnsEnd: updated });
    }
  }

  /**
   * `sticky` sits on `ExtraColumn`, which both positions share, but only `end` columns are ever
   * read for it: `getEndStickyOffset` walks `extraColumnsEnd` alone, and extra columns never enter
   * the table's `columnSticky` map. On a `start` column the flag reads like "pin this" and changes
   * nothing -- the field's JSDoc says so, but a caller who sets it does not see the JSDoc, they see
   * nothing happen.
   *
   * A DEV warning rather than a type that refuses the pairing: `position` is optional on
   * `ExtraColumnOption`, so a union discriminated on it would make every caller spell the
   * position out, and it still would not cover `updateExtraColumnSticky` -- that one takes a column
   * id and cannot know the position at the call site, and it is the route a plugin's props take.
   * One runtime check covers both.
   */
  function warnOnStartColumnPin(columnId: string, sticky: boolean | undefined) {
    if (process.env.NODE_ENV === 'production') return;
    if (!sticky) return;
    if (startPinWarned.has(columnId)) return;

    startPinWarned.add(columnId);
    console.warn(
      `[DataGrid] Extra column "${columnId}": \`sticky\` pins to the table's inline-end edge and ` +
        'is read only for columns at the `end` position -- on a `start` column it does nothing. ' +
        'Drop the flag, or register the column at the `end` position.',
    );
  }

  function updateExtraColumnWidth(columnId: string, width: string) {
    const store = useTableStore.getState();

    function updateList(columns: ExtraColumn[]): ExtraColumn[] | undefined {
      const index = columns.findIndex((c) => c.id === columnId);
      if (index === -1) return undefined;
      const updated = [...columns];
      updated[index] = { ...updated[index], width };
      return updated;
    }

    const updatedStart = updateList(store.extraColumnsStart);
    if (updatedStart) {
      useTableStore.setState({ extraColumnsStart: updatedStart });
      return;
    }

    const updatedEnd = updateList(store.extraColumnsEnd);
    if (updatedEnd) {
      useTableStore.setState({ extraColumnsEnd: updatedEnd });
    }
  }

  function updateExtraColumnOrder(columnId: string, order: number) {
    const store = useTableStore.getState();

    function updateList(columns: ExtraColumn[]): ExtraColumn[] | undefined {
      const index = columns.findIndex((c) => c.id === columnId);
      if (index === -1) return undefined;
      const updated = [...columns];
      updated[index] = { ...updated[index], order };
      return updated.sort((a, b) => a.order - b.order);
    }

    const updatedStart = updateList(store.extraColumnsStart);
    if (updatedStart) {
      useTableStore.setState({ extraColumnsStart: updatedStart });
      return;
    }

    const updatedEnd = updateList(store.extraColumnsEnd);
    if (updatedEnd) {
      useTableStore.setState({ extraColumnsEnd: updatedEnd });
    }
  }

  /**
   * Plugins register their extra column once at setup, before their props are available, so the
   * pin arrives here on the first props pass -- same route `updateExtraColumnOrder` takes. Writing
   * only on an actual change keeps that pass from replacing the column list (and re-rendering
   * every cell) on every re-render of a plugin that never opts in.
   *
   * The stored flag is compared through the same `?? false` the callers normalise with, so a
   * column registered with no `sticky` at all is already "unpinned" as far as the guard is
   * concerned and the first pass of a grid that never opts in writes nothing. Nothing downstream
   * tells an absent flag from an explicit `false` -- `getEndStickyOffset` reads both as unpinned --
   * so collapsing them here costs no meaning and saves every such grid one re-render of every cell
   * on mount.
   */
  function updateExtraColumnSticky(columnId: string, sticky: boolean) {
    const store = useTableStore.getState();

    const isStart = store.extraColumnsStart.some((c) => c.id === columnId);
    const key = isStart ? 'extraColumnsStart' : 'extraColumnsEnd';
    const columns = store[key];

    const index = columns.findIndex((c) => c.id === columnId);
    if (index === -1) return;

    if (isStart) warnOnStartColumnPin(columnId, sticky);

    if ((columns[index].sticky ?? false) === sticky) return;

    const updated = [...columns];
    updated[index] = { ...updated[index], sticky };
    useTableStore.setState({ [key]: updated });
  }

  function useExtraColumns(position: ExtraColumnPosition): ExtraColumn[] {
    return useTableStore((s) => (position === 'start' ? s.extraColumnsStart : s.extraColumnsEnd));
  }
}
