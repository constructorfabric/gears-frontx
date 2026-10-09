import type { DataGridItem, InternalContext } from '../../data-grid-types';

interface StoredColumnVisibility {
  columns?: unknown;
}

export interface TableColumnsPersistence {
  /** The columns the user toggled, by id. Columns never toggled are absent. */
  read: () => Record<string, boolean>;
  record: (columnId: string, visible: boolean) => void;
}

/** Namespaced by the grid's `name`, so two grids on a page keep separate selections. */
export const COLUMN_VISIBILITY_KEY = 'columnVisibility';

/**
 * Keeps the columns a user showed or hid, when the grid asked for it with
 * `persistentColumnVisibility`. Returns `undefined` otherwise, so a grid that did not opt in
 * registers no state and reads none.
 *
 * Pinned to `localStorage` whatever the grid's `persistent` setting is: a column selection is
 * how one person likes to read the table, not part of the view they would share by copying the
 * URL, so it sits beside filters that stay in the query string rather than displacing them.
 */
export function prepareTableColumnsPersistence<TItem extends DataGridItem = DataGridItem>(
  context: InternalContext<TItem>,
): TableColumnsPersistence | undefined {
  if (!context.config.persistentColumnVisibility) return undefined;

  const state = context.persistentState.registerPersistentState<StoredColumnVisibility>(
    COLUMN_VISIBILITY_KEY,
    { storage: 'localStorage' },
  );

  return { read, record };

  // The stored value is whatever is in `localStorage`, which the user can edit, so it is
  // narrowed here rather than trusted: anything that is not a boolean under a string key is
  // dropped instead of being carried into the visibility map and written back on the next
  // toggle.
  function read(): Record<string, boolean> {
    const stored = state.value?.columns;
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};

    return Object.fromEntries(
      Object.entries(stored).filter(([, visible]) => typeof visible === 'boolean'),
    );
  }

  // Only the toggled column is written, so a column left alone keeps following whatever default
  // the grid configures for it -- including a later change to that default.
  function record(columnId: string, visible: boolean) {
    state.setValue({ columns: { ...read(), [columnId]: visible } });
  }
}
