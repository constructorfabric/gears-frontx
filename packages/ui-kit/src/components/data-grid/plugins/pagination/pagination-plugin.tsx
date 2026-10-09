// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import { isDeepEqual } from '../../utils/deep-equal';
import type { StoreApi, UseBoundStore } from 'zustand';
import { create } from 'zustand';
import type { DataGridItem } from '../../data-grid-types';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import { DataGridPagination } from './components/data-grid-pagination';

interface PaginationConfig {
  defaultLimit: number;
  limits: number[];
  autoHide: boolean;
}

interface PaginationStore {
  page: number;
  limit: number;
  total: number;
}

type ConfigStore = PaginationConfig;

export interface DataGridPaginationPluginProps {
  defaultLimit?: number;
  limits?: number[];
  autoHide?: boolean;
}

export interface PaginationPluginApi {
  useConfigStore: UseBoundStore<StoreApi<ConfigStore>>;
  usePaginationStore: UseBoundStore<StoreApi<PaginationStore>>;
  useLimit: () => number;
  getPage: () => number;
  getLimit: () => number;
  onPropsChange: (props: unknown) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setTotal: (total: number) => void;
}

// Plugin definition
export const DataGridPaginationPlugin = createDataGridPlugin<
  DataGridItem,
  'pagination',
  DataGridPaginationPluginProps
>(
  'pagination',
  (context) => {
    const useConfigStore = create<ConfigStore>(() => ({
      defaultLimit: 12,
      limits: [12, 24, 48, 96],
      autoHide: false,
    }));

    const persistent = context.registerPersistentState<{
      page?: number;
      limit?: number;
    }>('pagination', {
      schema: { page: 'number', limit: 'number' },
    });

    // State store for pagination
    const usePaginationStore = create<PaginationStore>(() => ({
      page: persistent.value?.page ?? 1,
      limit: persistent.value?.limit ?? useConfigStore.getState().defaultLimit,
      total: 0,
    }));

    const useLimit = () => usePaginationStore((s) => s.limit);
    const getPage = () => usePaginationStore.getState().page;
    const getLimit = () => usePaginationStore.getState().limit;

    // Register slot directly in setup
    context.registerSlot('bottom', {
      id: 'pagination',
      component: () => <DataGridPagination />,
    });

    context.hook('load:context', (instance) => {
      const state = usePaginationStore.getState();
      return {
        pagination: instance.loadContext.pagination ?? { page: state.page, limit: state.limit },
      };
    });

    context.hook('load:store', (instance) => {
      if (instance.processResult?.total !== undefined) {
        setTotal(instance.processResult.total);
      }
    });

    context.hook('refresh', () => {
      usePaginationStore.setState({ page: 1 });
      persistent.setValue({ ...persistent.value, page: undefined });
    });

    return {
      useConfigStore,
      usePaginationStore,
      useLimit,
      getPage,
      getLimit,
      onPropsChange,
      setPage,
      setLimit,
      setTotal,
    };

    function setPage(newPage: number) {
      const { total, limit } = usePaginationStore.getState();
      const lastPage = Math.max(1, Math.ceil(total / limit));
      const validatedPage = Math.max(1, Math.min(newPage, lastPage));

      if (validatedPage === usePaginationStore.getState().page) return;

      usePaginationStore.setState({ page: validatedPage });
      persistent.setValue({
        ...persistent.value,
        page: validatedPage > 1 ? validatedPage : undefined,
      });
      context.triggerLoad();
    }

    function setLimit(newLimit: number) {
      if (newLimit === usePaginationStore.getState().limit) return;

      usePaginationStore.setState({ limit: newLimit, page: 1 });
      const currentDefaultLimit = useConfigStore.getState().defaultLimit;
      persistent.setValue({
        page: undefined,
        limit: newLimit === currentDefaultLimit ? undefined : newLimit,
      });
      context.triggerLoad();
    }

    function setTotal(total: number) {
      usePaginationStore.setState({ total });
    }

    function onPropsChange(props: DataGridPaginationPluginProps) {
      const updates: Partial<PaginationConfig> = {};

      if (props.defaultLimit !== undefined) {
        updates.defaultLimit = props.defaultLimit;
      }
      if (props.limits !== undefined) {
        updates.limits = props.limits;
      }
      if (props.autoHide !== undefined) {
        updates.autoHide = props.autoHide;
      }

      if (Object.keys(updates).length > 0) {
        useConfigStore.setState(updates);

        // Only set limit from props if there's no persisted value
        if (props.defaultLimit !== undefined && persistent.value?.limit === undefined) {
          usePaginationStore.setState({ limit: props.defaultLimit });
        }
      }
    }
  },
  (prevProps, nextProps) =>
    prevProps.defaultLimit === nextProps.defaultLimit &&
    prevProps.autoHide === nextProps.autoHide &&
    isDeepEqual(prevProps.limits, nextProps.limits),
);
