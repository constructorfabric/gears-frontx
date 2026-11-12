// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import { create } from 'zustand';
import type { DataGridItem } from '../../data-grid-types';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import { isFilterValueActive } from '../../utils/is-filter-value-active';
import type {
  LoadContextFilterKey,
  LoadContextFilters,
  LoadContextFiltersState,
} from '../../services/plugins/plugins-types';
import { FiltersBar } from './components/filters-bar';
import type { DataGridFilterEntity, DataGridFiltersPluginProps } from './filters-types';

interface FiltersConfigStore {
  entities: DataGridFilterEntity[];
  isAllFiltersOptionVisible: boolean;
}

interface FiltersStore {
  filters: LoadContextFilters;
}

export const DataGridFiltersPlugin = createDataGridPlugin<
  DataGridItem,
  'filters',
  DataGridFiltersPluginProps
>('filters', (context) => {
  const useConfigStore = create<FiltersConfigStore>(() => ({
    entities: [],
    isAllFiltersOptionVisible: true,
  }));

  const persistent = context.registerPersistentState<Record<string, { value: unknown }>>(
    'filters',
    {
      schema: {},
    },
  );

  const filtersStore = create<FiltersStore>(() => ({
    filters: persistent.value ?? {},
  }));
  const draftStore = create<FiltersStore>(() => ({ filters: {} }));

  // Initialize draft from current filters
  copyState(filtersStore, draftStore);

  context.registerSlot('top-start', {
    id: 'filters',
    component: FiltersBar,
  });

  context.hook('load:context', () => {
    const activeFilters = getActiveFilters();
    if (Object.keys(activeFilters).length === 0) return;
    return { filters: activeFilters };
  });

  context.hook('refresh', (options: object) => {
    if ('resetFilters' in options && options.resetFilters) {
      filtersStore.setState({ filters: {} });
      draftStore.setState({ filters: {} });
      persistent.setValue(undefined);
    }
  });

  filtersStore.subscribe(() => {
    const raw = filtersStore.getState().filters;
    persistent.setValue(Object.keys(raw).length > 0 ? raw : undefined);
  });

  const useFilterEntities = () => useConfigStore((s) => s.entities);
  const useIsAllFiltersOptionVisible = () => useConfigStore((s) => s.isAllFiltersOptionVisible);

  return {
    useFilterEntities,
    useIsAllFiltersOptionVisible,
    useState: useFilterState,
    useActiveCount,
    setState: setFilterState,
    removeState: removeFilterState,
    useDraftState,
    setDraftState,
    applyDraftState,
    resetDraftState,
    isFilterValueActive,
    onPropsChange,
  };

  function useFilterState(filterKey: LoadContextFilterKey) {
    return filtersStore((s): LoadContextFiltersState | undefined => s.filters[filterKey]);
  }

  function useActiveCount(filterKeys: LoadContextFilterKey[]) {
    return filtersStore(
      (s) => filterKeys.filter((key) => isFilterValueActive(s.filters[key]?.value)).length,
    );
  }

  function setFilterState(filterKey: LoadContextFilterKey, state: LoadContextFiltersState) {
    setStoreFilter(filtersStore, filterKey, state);
    context.refresh({ resetFilters: false });
    copyState(filtersStore, draftStore);
  }

  function removeFilterState(filterKey: LoadContextFilterKey) {
    filtersStore.setState((prev) => {
      const rest = { ...prev.filters };
      delete rest[filterKey];
      return { filters: rest };
    });
    context.refresh({ resetFilters: false });
    copyState(filtersStore, draftStore);
  }

  function useDraftState(filterKey: LoadContextFilterKey) {
    return draftStore((s): LoadContextFiltersState | undefined => s.filters[filterKey]);
  }

  function setDraftState(filterKey: LoadContextFilterKey, state: LoadContextFiltersState) {
    setStoreFilter(draftStore, filterKey, state);
  }

  function applyDraftState() {
    const draftRaw = draftStore.getState().filters;
    filtersStore.setState({ filters: { ...draftRaw } });
    context.refresh({ resetFilters: false });
  }

  function resetDraftState() {
    copyState(filtersStore, draftStore);
  }

  function getActiveFilters(): LoadContextFilters {
    const { filters } = filtersStore.getState();
    const { entities } = useConfigStore.getState();
    const active: LoadContextFilters = {};

    for (const [key, state] of Object.entries(filters)) {
      if (isFilterValueActive(state?.value)) {
        const entity = entities.find((e) => e.filterKey === key);
        active[key] = entity?.resolveLoadValue ? entity.resolveLoadValue(state) : state;
      }
    }

    return active;
  }

  function setStoreFilter(
    store: typeof filtersStore,
    filterKey: LoadContextFilterKey,
    state: LoadContextFiltersState,
  ) {
    store.setState((prev) => ({
      filters: { ...prev.filters, [filterKey]: state },
    }));
  }

  function copyState(source: typeof filtersStore, target: typeof filtersStore) {
    target.setState({ filters: { ...source.getState().filters } });
  }

  function onPropsChange(props: DataGridFiltersPluginProps) {
    const updates: Partial<FiltersConfigStore> = {};

    if (props.entities !== undefined) {
      updates.entities = props.entities;
    }
    if (props.isAllFiltersOptionVisible !== undefined) {
      updates.isAllFiltersOptionVisible = props.isAllFiltersOptionVisible;
    }

    if (Object.keys(updates).length > 0) {
      useConfigStore.setState(updates);
    }
  }
});
