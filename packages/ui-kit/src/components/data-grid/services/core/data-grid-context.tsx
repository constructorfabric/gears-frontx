import { createContext, useContext } from 'react';
import type { DataGridInstance, DataGridItem, InternalContext } from '../../data-grid-types';
import { internalContextKey } from '../internal/internal-helpers';
import type { DataGridPlugin, DataGridPluginContext } from '../plugins/plugins-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DataGridInstance is invariant in TItem (its internals take it in both positions), so no one item type fits every provider; useDataGrid hands the grid back as the caller's TItem
const DataGridContext = createContext<DataGridInstance<any, any[]> | null>(null);

export const DataGridProvider = DataGridContext.Provider;

export function useDataGrid<
  TItem extends DataGridItem = DataGridItem,
  TPlugins extends DataGridPlugin<TItem>[] = DataGridPlugin<TItem>[],
>(): DataGridInstance<TItem, TPlugins> {
  const grid = useContext(DataGridContext);
  if (!grid) {
    throw new Error('useDataGrid must be used within a DataGrid');
  }

  return grid;
}

/**
 * Hook for plugins to access public plugin context.
 * Provides access to plugin APIs, hooks, storage, and layout registration.
 * @public
 */
export function useDataGridPluginContext<
  TItem extends DataGridItem = DataGridItem,
>(): DataGridPluginContext<TItem> {
  const context = useDataGridContext<TItem>();

  return context.plugins.pluginContext;
}

/**
 * Hook for internal access to all grid services.
 * Not exported in public API - for internal use only.
 * @internal
 */
export function useDataGridContext<
  TItem extends DataGridItem = DataGridItem,
>(): InternalContext<TItem> {
  const grid = useDataGrid<TItem>();

  return grid[internalContextKey];
}
