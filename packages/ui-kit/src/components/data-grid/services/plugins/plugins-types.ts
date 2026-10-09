import type { DataGridItem } from '../../data-grid-types';
import type { DataGridHooked } from '../hooked/hooked-types';
import type { LayoutPublicApi } from '../layout/layout-types';
import type { LoadPublicApi } from '../load/load-types';
import type { PersistentStatePublicApi } from '../persistent-state/persistent-state-types';
import type { DataGridParentId, StoragePublicApi } from '../storage/storage-types';
import type { TablePublicApi } from '../table/table-types';

export type LoadContextFilterKey = string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the value a filter carries is whatever its plugin stores
export type LoadContextFiltersState<Value = any> = {
  value: Value;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a filter may carry fields beyond `value`
} & Record<PropertyKey, any>;

export type OrderDirection = 'asc' | 'desc';

export interface LoadContextOrderItem {
  columnId: string;
  direction: OrderDirection;
}

export interface LoadContextTree {
  parentId: DataGridParentId;
}

export interface LoadContextOrders {
  value: LoadContextOrderItem[];
}

export type LoadContextFilters = Record<LoadContextFilterKey, LoadContextFiltersState>;

export interface PluginsLoadContext {
  pagination?: {
    page?: number;
    limit?: number;
  };
  filters?: LoadContextFilters;
  orders?: LoadContextOrders;
  tree?: LoadContextTree;
}

export interface PluginsPublicApi<TItem extends DataGridItem> {
  /**
   * Register a lifecycle hook handler.
   *
   * @param name - Hook name (e.g., 'load:context', 'load:store')
   * @param handler - Handler function to execute when hook is called
   */
  hook: DataGridHooked<TItem>['hook'];

  /**
   * Access another plugin's API.
   *
   * @param name - Plugin name
   * @returns The plugin's public API or undefined if not found
   */
  getPlugin: <TApi>(name: string) => TApi | undefined;
}

export type ServicesPublicApiTypes<TItem extends DataGridItem> =
  | LayoutPublicApi
  | StoragePublicApi<TItem>
  | PersistentStatePublicApi
  | LoadPublicApi<TItem>
  | PluginsPublicApi<TItem>
  | TablePublicApi<TItem>;

export interface DataGridPluginContext<TItem extends DataGridItem>
  extends
    LayoutPublicApi,
    StoragePublicApi<TItem>,
    PersistentStatePublicApi,
    LoadPublicApi<TItem>,
    PluginsPublicApi<TItem>,
    TablePublicApi<TItem> {}

export interface DataGridPlugin<
  TItem extends DataGridItem = DataGridItem,
  TName extends string = string,
  TApi = void,
> {
  name: TName;
  setup: (context: DataGridPluginContext<TItem>) => TApi;
}

export interface PluginsService<
  TItem extends DataGridItem,
> extends PluginsPublicApi<TItem> {
  registerPlugin: (plugin: DataGridPlugin<TItem>) => void;
  registerPlugins: (plugins: DataGridPlugin<TItem>[]) => void;
  registerPublicApi: (methods: ServicesPublicApiTypes<TItem>) => void;
  pluginContext: DataGridPluginContext<TItem>;
}
