// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import { debounce, type Debounced } from '../../utils/debounce';
import { create } from 'zustand';
import type { DataGridItem } from '../../data-grid-types';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import { DataGridTextSearch } from './components/data-grid-text-search';

interface TextSearchStore {
  query: string;
}

interface TextSearchConfigStore {
  placeholder: string;
  filterKey: string;
  fullWidth: boolean;
}

/**
 * The value this plugin contributes to the grid's load context, keyed by `filterKey`
 * (default `"textSearch"`). The `load` callback reads it as `filters[filterKey]` and
 * forwards `value` to the request — the plugin renders the search box but does not wire
 * the value to the backend itself.
 */
export interface DataGridTextSearchFilterValue {
  value: string;
}

export interface DataGridTextSearchPluginProps {
  /**
   * Key this plugin writes its value under in the load context (default `"textSearch"`).
   * Read it in `load` as `filters[filterKey]`, typed {@link DataGridTextSearchFilterValue}.
   */
  filterKey?: string;
  placeholder?: string;
  fullWidth?: boolean;
}

export interface DataGridTextSearchPluginApi {
  useQuery: () => string;
  usePlaceholder: () => string;
  useFullWidth: () => boolean;
  onPropsChange: (props: DataGridTextSearchPluginProps) => void;
  setSearch: (value: string) => void;
  updateSearch: (value: string) => void;
}

const defaultDebounceMs = 300;
const defaultFilterKey = 'textSearch';

/**
 * Text-search toolbar plugin for `DataGrid`. Renders a debounced search box and
 * contributes its value to the load context as `filters[filterKey] = { value }`
 * (default key `"textSearch"`).
 *
 * Wiring is not automatic: the grid's `load` callback must read the value and pass it to
 * the request — e.g. `const query = filters.textSearch?.value` — otherwise the box renders
 * but search does nothing. See {@link DataGridTextSearchFilterValue}.
 */
export const DataGridTextSearchPlugin = createDataGridPlugin<
  DataGridItem,
  'textSearch',
  DataGridTextSearchPluginProps
>('textSearch', (context) => {
  const useConfigStore = create<TextSearchConfigStore>(() => ({
    placeholder: '',
    filterKey: defaultFilterKey,
    fullWidth: false,
  }));

  const persistent = context.registerPersistentState<{ query?: string }>('textSearch', {
    schema: { query: 'string' },
  });

  const useTextSearchStore = create<TextSearchStore>(() => ({
    query: persistent.value?.query ?? '',
  }));

  context.registerSlot('top-start', {
    id: 'textSearch',
    component: () => <DataGridTextSearch />,
  });

  const debouncedRefresh: Debounced<[], void> = debounce(
    commitSearch,
    defaultDebounceMs,
  );

  context.hook('load:context', () => {
    const { query } = useTextSearchStore.getState();
    if (!query) return;
    const { filterKey } = useConfigStore.getState();
    const filterValue: DataGridTextSearchFilterValue = { value: query };
    return { filters: { [filterKey]: filterValue } };
  });

  context.hook('refresh', (options: object) => {
    if ('resetFilters' in options && options.resetFilters) {
      debouncedRefresh.cancel();
      useTextSearchStore.setState({ query: '' });
      persistent.setValue(undefined);
    }
  });

  context.hook('destroy', () => {
    debouncedRefresh.flush();
  });

  const useQuery = () => useTextSearchStore((s) => s.query);
  const usePlaceholder = () => useConfigStore((s) => s.placeholder);
  const useFullWidth = () => useConfigStore((s) => s.fullWidth);

  return {
    useQuery,
    usePlaceholder,
    useFullWidth,
    onPropsChange,
    setSearch,
    updateSearch,
  };

  function commitSearch() {
    const { query } = useTextSearchStore.getState();
    persistent.setValue(query ? { query } : undefined);
    context.refresh({ resetFilters: false });
  }

  function updateSearch(value: string) {
    useTextSearchStore.setState({ query: value });
    debouncedRefresh();
  }

  function setSearch(value: string) {
    debouncedRefresh.cancel();
    useTextSearchStore.setState({ query: value });
    persistent.setValue(value ? { query: value } : undefined);
    context.refresh({ resetFilters: false });
  }

  function onPropsChange(props: DataGridTextSearchPluginProps) {
    const configUpdates: Partial<TextSearchConfigStore> = {};

    if (props.filterKey !== undefined) {
      configUpdates.filterKey = props.filterKey;
    }
    if (props.placeholder !== undefined) {
      configUpdates.placeholder = props.placeholder;
    }
    if (props.fullWidth !== undefined) {
      configUpdates.fullWidth = props.fullWidth;
    }

    if (Object.keys(configUpdates).length > 0) {
      useConfigStore.setState(configUpdates);
    }
  }
});
