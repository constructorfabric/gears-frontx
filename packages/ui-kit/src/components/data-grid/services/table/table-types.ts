import type { ComponentType, ReactNode } from 'react';
import type { DataGridItem } from '../../data-grid-types';

export const TableLayouts = ['fixed', 'auto'] as const;
export type DataGridTableLayout = (typeof TableLayouts)[number];

export const TableColumnOverflows = ['wrap', 'nowrap'] as const;
export type DataGridTableColumnOverflow = (typeof TableColumnOverflows)[number];

export interface DataGridTableColumn<TItem extends DataGridItem = DataGridItem> {
  id: string;
  key?: string;
  label: string | (() => string);
  type?: 'string' | 'number' | 'date';
  /**
   * Column width. Under `tableLayout="fixed"` (default) this is the column's shared track — a
   * proportional weight when every column has a `width`, an exact size when some columns are
   * widthless. Under `tableLayout="auto"` it is a preferred size that also acts as a floor unless
   * `minWidth` is set. A `%` string maps to `inline-size`; any other value maps to `width` +
   * `min-inline-size`.
   *
   * `'min-content'` is a first-class value: it sizes the column to its own header content, in
   * both layout modes -- the literal CSS keyword isn't honored by either table-layout algorithm
   * as a sizing hint on its own, so `DataGridHeaderCell` measures the header cell's content and
   * applies the result as a pixel width instead (the column's size under `auto`, its shared track
   * under `fixed`). See `resolveColumnStyle`. For choosing a width strategy per column, see the
   * decision guide in `data-grid.md` ("Choosing column widths").
   */
  width?: number | 'min-content' | (string & {});
  /**
   * Minimum column width in px. Under `tableLayout="auto"` this is an independent floor. Under
   * `tableLayout="fixed"` the three width props collapse to a single track: a lone `minWidth`
   * (no `width`, no `maxWidth`) aliases to the track, while combining it with `width` triggers a
   * DEV-only console warning and `width` wins, since fixed layout cannot honor both.
   */
  minWidth?: number;
  /**
   * Maximum column width in px, enforced via a content-cap wrapper. Under `tableLayout="auto"`
   * this is a real, independent cap. Under `tableLayout="fixed"` the three width props collapse
   * to a single track: a lone `maxWidth` (no `width`, no `minWidth`) aliases to the track, while
   * combining it with `width` triggers a DEV-only console warning and `width` wins, since fixed
   * layout cannot honor both.
   */
  maxWidth?: number;
  visible?: boolean;
  sticky?: boolean;
  visibleToggleDisabled?: boolean;
  formatter?: (value: unknown) => string;
  /**
   * Header-only overflow handling. Default `'nowrap'` — the label stays on one line and clips
   * with an ellipsis ("…") on overflow, auto-setting `title` with the full label for the default
   * label renderer; when `headerComponent` is set the kit cannot supply that fallback and the
   * consumer is responsible for it. `'wrap'` lets the label wrap across lines instead.
   */
  headerOverflow?: DataGridTableColumnOverflow;
  /**
   * Body-cell overflow handling. Default `'wrap'`: the value wraps across lines. `'nowrap'` keeps the value on one line and clips it with an ellipsis ("…") on
   * overflow, auto-setting `title` with the formatted value for the default value renderer; when
   * `component` or `render` is set the kit cannot supply that fallback and the consumer is
   * responsible for it.
   */
  cellOverflow?: DataGridTableColumnOverflow;
  /**
   * @deprecated Use `headerOverflow: 'nowrap'` instead. Normalized to `headerOverflow` at
   * column ingestion and kept working for one release with a dev-only deprecation warning.
   */
  headerTruncate?: boolean;
  component?: ComponentType<{ item: TItem; column: DataGridTableColumn<TItem>; value: unknown }>;
  headerComponent?: ComponentType<{ column: DataGridTableColumn<TItem> }>;
  render?: ((item: TItem) => ReactNode) | ReactNode;
  getClassName?: (item: TItem) => string | undefined;
  groupId?: string;
}

export interface DataGridTableGroup<TItem extends DataGridItem = DataGridItem> {
  id: string;
  label: string | (() => string);
  columns: DataGridTableColumn<TItem>[];
  component?: ComponentType<{ group: DataGridTableGroup<TItem> }>;
  visible?: boolean;
  sticky?: boolean;
}

export function isTableGroup<TItem extends DataGridItem>(
  item: DataGridTableColumn<TItem> | DataGridTableGroup<TItem>,
): item is DataGridTableGroup<TItem> {
  return 'columns' in item && Array.isArray(item.columns);
}

export type TableSlotName = 'subheader' | 'footer' | 'header-cell-end';

export interface TableSlot {
  id: string;
  name: TableSlotName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- what `registerTableSlot` takes: a `header-cell-end` slot gets the column, the others nothing
  component: ComponentType<any>;
  order: number;
}

export interface TableSlotOption {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the option `registerTableSlot` takes
  component: ComponentType<any>;
  order?: number;
}

export interface TableSlotOptions {
  subheader: TableSlotOption;
  footer: TableSlotOption;
  'header-cell-end': TableSlotOption;
}

export type ExtraColumnPosition = 'start' | 'end';

export interface ExtraColumn {
  id: string;
  header?: ComponentType;
  body?: ComponentType;
  position: ExtraColumnPosition;
  order: number;
  /**
   * Any CSS length, applied as the column's width. A pinned `end` column's contribution to the
   * offsets of the columns pinned inside it is read from this only while the header has not been
   * measured yet, and only when the value is a plain px length -- anything else contributes `0`
   * until the measurement lands.
   */
  width?: string;
  /**
   * Pins the column to the table's inline-end edge, so it stays reachable while the rows scroll
   * sideways. Read only for `end` columns; a `start` extra column is not pinned by it, and is not
   * pinned by the table's own sticky columns either -- it only offsets them. Setting it on a
   * `start` column logs a DEV-only warning. Defaults to unpinned.
   */
  sticky?: boolean;
  /**
   * When `true`, the rendered header and body cells for this column carry
   * `data-grid-row-ignore-click`, so a plugin that reacts to row clicks can skip clicks
   * anywhere in the cell (including its padding, not just the inner content).
   */
  ignoreRowClick?: boolean;
}

export type ExtraColumnOption = Partial<ExtraColumn>;

export type TableComponentName =
  | 'row'
  | 'header-cell'
  | 'header-cell-label'
  | 'header-group'
  | 'body-cell-content'
  | 'content';

/**
 * How the registry stores a component registered under a `TableComponentName`. Each name takes its
 * own props, so the registry holds them as taking none it could name: every function component
 * (a `memo`, `forwardRef` or `lazy` one too) is assignable to `ComponentType<never>`, and
 * `useComponent` hands one back as the props its caller renders. A class component is not: its
 * instance carries its props (`this.props`), which `never` cannot hold. So this is the stored
 * form only; the public `registerComponent` still takes `ComponentType<any>` and asserts a class
 * component into it.
 */
export type RegisteredTableComponent = ComponentType<never>;

export interface TableHeaderCell<TItem extends DataGridItem = DataGridItem> {
  type: 'group' | 'column';
  item: DataGridTableGroup<TItem> | DataGridTableColumn<TItem>;
  component: RegisteredTableComponent;
  colspan?: number;
  rowspan?: number;
}

export interface TableStore<TItem extends DataGridItem = DataGridItem> {
  columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[];
  flatColumns: DataGridTableColumn<TItem>[];
  columnVisibility: Map<string, boolean>;
  columnSticky: Map<string, boolean>;
  groupSticky: Map<string, boolean>;
  columnWidths: Map<string, number>;
  /**
   * Measured pixel width of `tableLayout="auto"` columns with `width: 'min-content'` -- see
   * `table-min-content-width.ts`. Kept separate from `columnWidths` above: that one is read-only
   * telemetry off a cell's already-rendered width (for sticky-offset math) and never feeds back
   * into that cell's own size, so it never needs a dedup guard. This one directly drives the
   * column's own CSS width, so it must dedupe writes to avoid a measure -> apply -> relayout ->
   * re-measure loop.
   */
  minContentWidths: Map<string, number>;
  extraColumnsStart: ExtraColumn[];
  extraColumnsEnd: ExtraColumn[];
  slots: Map<TableSlotName, TableSlot[]>;
  components: Map<TableComponentName, RegisteredTableComponent>;
  tableLayout: DataGridTableLayout;
  /** Mirrors `DataGrid`'s `stickyHeader` prop; read by the header renderers. */
  stickyHeader: boolean;
}

export interface ConfigurationColumn {
  id: string;
  label: string;
  visible: boolean;
  sticky: boolean;
  visibleToggleDisabled: boolean;
}

export interface ConfigurationGroup {
  id: string;
  label: string;
  visible: boolean;
  sticky: boolean;
  columns: ConfigurationColumn[];
}

export type ConfigurationEntry = ConfigurationColumn | ConfigurationGroup;

export function isConfigurationGroup(entry: ConfigurationEntry): entry is ConfigurationGroup {
  return 'columns' in entry && Array.isArray(entry.columns);
}

export interface TablePublicApi<TItem extends DataGridItem = DataGridItem> {
  registerTableSlot: <T extends TableSlotName>(name: T, options: TableSlotOptions[T]) => void;
  registerExtraColumn: (options: ExtraColumnOption) => void;
  updateExtraColumnWidth: (columnId: string, width: string) => void;
  updateExtraColumnOrder: (columnId: string, order: number) => void;
  updateExtraColumnSticky: (columnId: string, sticky: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `ComponentType<never>` would refuse a class component
  registerComponent: (name: TableComponentName, component: ComponentType<any>) => void;
  updateColumns: (columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[]) => void;
  updateColumnVisibility: (columnId: string, visible: boolean) => void;
  updateColumnSticky: (id: string, sticky: boolean) => void;
  updateTableLayout: (tableLayout: DataGridTableLayout) => void;
  updateStickyHeader: (stickyHeader: boolean) => void;
}

export interface TableService<
  TItem extends DataGridItem = DataGridItem,
> extends TablePublicApi<TItem> {
  registerSlot: <T extends TableSlotName>(name: T, options: TableSlotOptions[T]) => void;
  useSlots: <T extends TableSlotName>(name: T) => TableSlot[];

  useComponent: <TProps = unknown>(name: TableComponentName) => ComponentType<TProps>;

  useExtraColumns: (position: ExtraColumnPosition) => ExtraColumn[];

  initializeColumns: (columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[]) => {
    columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[];
    flatColumns: DataGridTableColumn<TItem>[];
    columnVisibility: Map<string, boolean>;
  };
  useVisibleColumns: () => DataGridTableColumn<TItem>[];

  initializeStickyState: (columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[]) => {
    columnSticky: Map<string, boolean>;
    groupSticky: Map<string, boolean>;
  };
  getOrderedColumnsWithSticky: (
    visibleColumns: DataGridTableColumn<TItem>[],
    columnSticky: Map<string, boolean>,
  ) => DataGridTableColumn<TItem>[];
  onResizeColumn: (columnId: string, width: number) => void;
  isColumnSticky: (columnId: string) => boolean;
  isGroupSticky: (groupId: string) => boolean;
  useColumnStickyOffset: (columnId: string) => number | undefined;
  useColumnEndStickyOffset: (columnId: string) => number | undefined;
  useGroupStickyOffset: (groupId: string) => number | undefined;

  useHasGroups: () => boolean;
  useFirstRowHeaderCells: () => TableHeaderCell<TItem>[];
  useSecondRowHeaderColumns: () => DataGridTableColumn<TItem>[];

  useConfigurationColumns: () => ConfigurationEntry[];
  useTableLayout: () => DataGridTableLayout;
  useStickyHeader: () => boolean;

  /**
   * Measured pixel width for a `tableLayout="auto"` column with `width: 'min-content'` -- see
   * `table-min-content-width.ts` and `DataGridHeaderCell`'s measurement effect.
   */
  useMinContentWidth: (columnId: string) => number | undefined;
  setMinContentWidth: (columnId: string, width: number) => void;
}
