// `.js` on each relative type import: they land verbatim in the shipped declaration file, where
// `moduleResolution: "nodenext"` rejects an extensionless one and every type from it goes untyped
// (the callbacks' `item` among them).
import type { ReactNode } from 'react';
import type { DataGridItem } from '../../data-grid-types.js';
import type { DataGridPluginApi } from '../../services/plugins/plugins-helpers.js';
import type { DataGridItemId } from '../../services/storage/storage-types.js';

/** Draws the content of one row's detail, given the row's item. */
export type DataGridRenderDetail<TItem extends DataGridItem = DataGridItem> = (
  item: TItem,
) => ReactNode;

/** Names one row's toggle and its detail group, given the row's item. */
export type DataGridToggleLabel<TItem extends DataGridItem = DataGridItem> = (item: TItem) => string;

export interface DataGridRowDetailPluginProps<TItem extends DataGridItem = DataGridItem>
  extends Record<string, unknown> {
  /**
   * Draws the content of every row's detail. Keep its identity between renders (a module-level
   * function, or `useCallback`): the plugin's props are compared shallowly, so a new one each
   * render updates the plugin's props and re-renders every open detail.
   */
  render: DataGridRenderDetail<TItem>;
  /**
   * Names the toggle and the detail group of each row, over the `rowDetail.toggle` message. Keep
   * its identity stable, like `render`.
   */
  toggleLabel?: DataGridToggleLabel<TItem>;
}

export interface DataGridRowDetailPluginApi<TItem extends DataGridItem = DataGridItem>
  extends DataGridPluginApi<DataGridRowDetailPluginProps<TItem>> {
  /** Whether the record's detail is open, read reactively. */
  useIsOpen: (itemId: DataGridItemId) => boolean;
  /** Opens the record's detail when it is closed and closes it when it is open. */
  toggle: (itemId: DataGridItemId) => void;
  /** The render function the detail rows draw, from the plugin's props. */
  useRender: () => DataGridRenderDetail<TItem> | undefined;
  /** The toggle name of one row: `toggleLabel(item)` when given, the message otherwise. */
  useName: (item: TItem) => string;
  /**
   * The DOM id of the record's detail group, per plugin instance and per id type, so two grids,
   * or a record 1 and a record "1", never name the same element, and a record id that is odd in an
   * id cannot break the reference.
   */
  regionId: (itemId: DataGridItemId) => string;
}

/** Which records' details are open, keyed by record id, in memory only. */
export interface RowDetailStore {
  openIds: Set<DataGridItemId>;
}

/** The plugin's props, as the components read them. */
export interface RowDetailConfigStore<TItem extends DataGridItem = DataGridItem> {
  render: DataGridRenderDetail<TItem> | undefined;
  toggleLabel: DataGridToggleLabel<TItem> | undefined;
}
