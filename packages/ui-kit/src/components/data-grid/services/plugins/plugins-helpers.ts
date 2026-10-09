import { memo, useEffect, useState } from 'react';
import type { DataGridItem } from '../../data-grid-types';
import { useDataGridContext } from '../core/data-grid-context';
import type { DataGridPluginContext } from './plugins-types';

export interface DataGridPluginApi<TProps extends Record<string, unknown> = Record<string, unknown>> {
  onPropsChange?: (props: TProps) => void;
}

/**
 * Creates a DataGrid plugin as a React component.
 *
 * @param name - Unique plugin name for plugin identification
 * @param setup - Setup function that runs once on mount, returns plugin API
 * @param propsAreEqual - Optional comparison function for React.memo to control re-renders
 * @returns React component that accepts TProps and can be used as child of DataGrid
 *
 * @example
 * ```tsx
 * interface TablePluginProps {
 *   columns: { id: string; label: string }[];
 * }
 *
 * interface TablePluginApi extends DataGridPluginApi<TablePluginProps> {
 *   useTableStore: UseBoundStore<StoreApi<{ columns: DataGridTableColumn[] }>>;
 * }
 *
 * export const DataGridTablePlugin = createDataGridPlugin<
 *   DataGridItem,
 *   'table',
 *   TablePluginProps
 * >('table', (context) => {
 *   const useTableStore = create(() => ({ columns: [] }));
 *
 *   context.registerSlot('main', {
 *     id: 'table',
 *     component: TableUI,
 *   });
 *
 *   return {
 *     useTableStore,
 *     onPropsChange,
 *   };
 *
 *   function onPropsChange(props: TablePluginProps) {
 *     useTableStore.setState({ columns: props.columns });
 *   }
 *
 * });
 * ```
 */
export function createDataGridPlugin<
  TItem extends DataGridItem = DataGridItem,
  TName extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `unknown` would refuse interface-typed props, which have no index signature
  TProps extends Record<string, any> = Record<string, any>,
  TApi extends DataGridPluginApi<TProps> = DataGridPluginApi<TProps>,
>(
  name: TName,
  setup: (context: DataGridPluginContext<TItem>) => TApi,
  propsAreEqual?: (prevProps: Readonly<TProps>, nextProps: Readonly<TProps>) => boolean,
) {
  return memo(function DataGridPlugin(props: TProps) {
    const context = useDataGridContext<TItem>();

    const [api] = useState<TApi>(() => {
      const existing = context.plugins.getPlugin<TApi>(name);
      if (existing) {
        return existing;
      }

      const pluginApi = setup(context.plugins.pluginContext);
      context.plugins.registerPlugin({
        name,
        setup: () => pluginApi,
      });

      return pluginApi;
    });

    useEffect(() => {
      api.onPropsChange?.(props);
    }, [api, props]);

    return null;
  }, propsAreEqual);
}
