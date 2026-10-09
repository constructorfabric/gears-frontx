import type { DataGridPluginApi } from '../../services/plugins/plugins-helpers';
import type {
  LoadContextOrderItem,
  OrderDirection,
} from '../../services/plugins/plugins-types';

export type DataGridOrderColumnType = 'string' | 'number' | 'date';

export interface DataGridOrderOption {
  id: string;
  label: string;
  type?: DataGridOrderColumnType;
}

export interface DataGridDefaultOrder {
  id: string;
  direction: OrderDirection;
}

export interface DataGridOrderPopoverOptions {
  minInlineSize: number;
}

export interface DataGridOrderPluginProps extends Record<string, unknown> {
  /**
   * Columns the toolbar order button offers. Removing the prop is the same as passing `[]`: the
   * plugin reads its configuration from the current props, never from a previous render.
   */
  options?: DataGridOrderOption[];
  /**
   * Column IDs excluded from sorting in the header. An excluded column's header renders as
   * plain text with no click handler and no direction icon. Removing the prop is the same as
   * passing `[]`.
   *
   * Listing a column here as well as in `options` is a supported configuration, and reads as
   * "not from the header, yes from the toolbar button": the button still offers the column, so it
   * stays orderable there and its order is sent like any other. Exclusion then governs the header
   * alone, and how that header should look is the consuming product's decision.
   *
   * A column excluded here and absent from `options` is orderable nowhere: `setOrder` and
   * `toggleOrder` refuse it, and no order for it is sent. An order stored from an earlier session
   * is withheld rather than deleted, so `defaultOrder` applies in its place and the stored value
   * becomes the order again if the column is ever offered — a narrowing can make a stored order
   * unusable without making it wrong. A sort the user cleared by hand still suppresses
   * `defaultOrder`.
   */
  excludedColumns?: string[];
  /**
   * Order applied when the grid has no usable order of its own, and the order an unorderable
   * stored order falls back to. A sort the user cleared by hand keeps it suppressed; an unusable
   * stored order does not, because that is not a choice. Skipped when its own column is orderable
   * nowhere. It seeds an order rather than governing one: while an applied order stays usable,
   * changing or removing this prop does not re-sort the grid.
   */
  defaultOrder?: DataGridDefaultOrder;
  /** Sizing overrides for the toolbar button's popover. */
  popover?: DataGridOrderPopoverOptions;
}

export interface DataGridOrderPluginApi extends DataGridPluginApi<DataGridOrderPluginProps> {
  useOrder: () => LoadContextOrderItem | undefined;
  useColumnId: () => string | undefined;
  useDirection: () => OrderDirection | undefined;
  toggleOrder: (columnId: string) => void;
  setOrder: (columnId: string, direction: OrderDirection) => void;
  /**
   * Whether the column is excluded from sorting **in the header**. Not an orderability check: a
   * column listed in both `excludedColumns` and `options` returns `true` here and is still
   * orderable through the toolbar button.
   */
  useIsColumnExcluded: (columnId: string) => boolean;
  useOptions: () => DataGridOrderOption[];
  popover?: DataGridOrderPopoverOptions;
}
