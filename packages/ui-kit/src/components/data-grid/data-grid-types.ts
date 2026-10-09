import type { ReactNode, RefObject } from 'react';
import type { CoreService } from './services/core/core-types';
import type { DataGridHooked } from './services/hooked/hooked-types';
import type { internalContextKey } from './services/internal/internal-helpers';
import type { LayoutService } from './services/layout/layout-types';
import type { LoadService } from './services/load/load-types';
import type { PersistentStateService } from './services/persistent-state/persistent-state-types';
import type {
  DataGridPlugin,
  DataGridPluginContext,
  PluginsService,
} from './services/plugins/plugins-types';
import type { StorageService } from './services/storage/storage-types';
import type {
  DataGridTableColumn,
  DataGridTableGroup,
  DataGridTableLayout,
  TableService,
} from './services/table/table-types';

export interface DataGridItem {
  id: string | number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- an item is whatever the consumer's API returns, and `any` is what lets a column's `key` read its field
  [key: string]: any;
}

export type DataGridLabel = string | (() => string);

/**
 * Context passed to the load function containing pagination, filters, ordering, and signal.
 *
 * @property pagination - Current page and items per page
 * @property filters - Filter values from plugins
 * @property order - Column ordering configuration
 * @property signal - AbortSignal for request cancellation
 */
export interface DataGridLoadContext {
  pagination?: {
    page: number;
    limit: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each plugin contributes a filter of its own shape
  filters?: Record<string, any>;
  order?: {
    column: string;
    direction: 'asc' | 'desc';
  }[];
  signal?: AbortSignal;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lets `load` read the fields a plugin adds beyond the ones typed here
  [key: string]: any;
}

export interface DataGridLoadResult<TItem> {
  results: TItem[];
  total?: number;
}

export type LoadFunction<TItem> = (context: DataGridLoadContext) => Promise<DataGridLoadResult<TItem>>;

export interface DataGridConfig<TItem extends DataGridItem> {
  name: string;
  load: RefObject<LoadFunction<TItem>>;
  itemKey?: string | ((item: TItem) => string | number);
  /**
   * Storage mechanism for persisting grid state (pagination, filters, ordering).
   *
   * - `'localStorage'` - Browser localStorage (persists across sessions)
   * - `'sessionStorage'` - Browser sessionStorage (cleared when tab closes)
   * - `'router'` - URL query parameters (`history.replaceState`, one query key per state)
   * - `'memory'` - In-memory only; state survives re-renders within one mount
   *   and resets on remount or page reload
   */
  persistent?: 'localStorage' | 'sessionStorage' | 'router' | 'memory';
  /**
   * Remembers which columns the user showed or hid, so a column selection survives a reload or
   * leaving the page and coming back. Stored in `localStorage`, per browser, regardless of
   * `persistent`: a column selection is how one person likes to read the table, not part of the
   * view they would share by copying the URL. That includes `persistent: 'memory'` — a grid set to
   * keep nothing still writes the column selection to `localStorage` once this is on, and still
   * reads it back after a reload.
   *
   * Only columns the user actually toggled are stored, so a column left alone keeps following
   * whatever default the grid configures for it, including a later change to that default.
   * @default false
   */
  persistentColumnVisibility?: boolean;
}

export interface DataGridProps<TItem extends DataGridItem> extends Pick<
  DataGridConfig<TItem>,
  'name' | 'persistent' | 'persistentColumnVisibility'
> {
  load: LoadFunction<TItem>;
  columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[];
  /**
   * The table's `table-layout` algorithm. Default `'fixed'` — columns share a stable, weighted
   * track. `'auto'` opts into content-fit sizing with independent
   * `minWidth`/`maxWidth` per column (see `DataGridTableColumn`); it fills the same container width
   * `'fixed'` does, but rows re-layout as content changes.
   */
  tableLayout?: DataGridTableLayout;
  /**
   * Keeps the header row(s) pinned to the top of the grid's own scroll area while the rows
   * scroll. Header controls (the sort button, a custom `headerComponent`) stay reachable, pinned
   * (`sticky`) columns keep working, and the corner cells stick on both axes.
   *
   * Only takes effect when the grid is height-bounded by its layout so that the grid scrolls
   * internally (a flex column chain with `min-block-size: 0` down to `DataGrid`). On a grid
   * that grows to its content and lets the page scroll, the header scrolls away with the rows.
   *
   * The header cells paint an opaque background with a 1px separator so the rows do not show
   * through; override the background with the `--data-grid-header-background` custom property.
   * @default false
   */
  stickyHeader?: boolean;
  /**
   * Shows the grid's loading overlay while an operation the grid does not own is running — a bulk
   * copy, a mutation elsewhere on the screen. The grid's own data loads already raise the overlay
   * by themselves, so this is only for work the grid cannot see. The two are OR-ed: the overlay is
   * visible while either is in flight.
   */
  loading?: boolean;
  /**
   * Filter keys that scope the grid rather than being chosen by the user — a tenant or team
   * the grid always queries by. They don't count towards `hasActiveFilters`, so a grid with no
   * records still reaches its unfiltered empty state. Only for filters with no in-grid control
   * to clear them: a listed key can otherwise strand the user in an empty grid.
   *
   * Must be referentially stable, same as `columns` — a module-level constant, or `useMemo`
   * when the keys depend on props. A new array each render recomputes derived state and
   * re-renders every storage-store subscriber.
   *
   * ```tsx
   * const IMPLICIT_KEYS = ['teamId'];
   *
   * <DataGrid name="users" load={loadUsers} columns={columns} implicitFilterKeys={IMPLICIT_KEYS} />
   * ```
   */
  implicitFilterKeys?: string[];
  children?: ReactNode;
}

export interface InternalContext<TItem extends DataGridItem> {
  hooked: DataGridHooked<TItem>;
  plugins: PluginsService<TItem>;
  core: CoreService;
  load: LoadService<TItem>;
  storage: StorageService<TItem>;
  persistentState: PersistentStateService;
  layout: LayoutService;
  table: TableService<TItem>;
  config: DataGridConfig<TItem>;
}

/**
 * Data grid instance
 */
export interface DataGridInstance<
  TItem extends DataGridItem,
  TPlugins extends DataGridPlugin<TItem>[] = DataGridPlugin<TItem>[],
> extends Omit<DataGridPluginContext<TItem>, 'getPlugin'> {
  init: () => Promise<void>;
  destroy: () => void;
  getPlugin: (<TApi>(name: string) => TApi | undefined) &
    (<TName extends TPlugins[number]['name']>(
      name: TName,
    ) => ReturnType<Extract<TPlugins[number], { name: TName }>['setup']>);
  [internalContextKey]: InternalContext<TItem>;
}
