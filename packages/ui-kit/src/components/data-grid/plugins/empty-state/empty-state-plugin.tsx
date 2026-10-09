// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import { create } from 'zustand';
import type { DataGridItem } from '../../data-grid-types';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import type { DataGridEmptyStatePluginApi, DataGridEmptyStatePluginProps } from './empty-state-types';

export type { DataGridEmptyStatePluginApi, DataGridEmptyStatePluginProps };

export const EMPTY_STATE_LAYOUT_SLOT_ID = 'empty_state';

interface EmptyStateStore {
  component: React.ComponentType | null;
}

export const DataGridEmptyStatePlugin = createDataGridPlugin<
  DataGridItem,
  'emptyState',
  DataGridEmptyStatePluginProps
>('emptyState', (context) => {
  const useStore = create<EmptyStateStore>(() => ({
    component: null,
  }));

  context.registerSlot('empty', {
    id: EMPTY_STATE_LAYOUT_SLOT_ID,
    component: EmptyStateSlot,
  });

  const api: DataGridEmptyStatePluginApi = {
    useComponent: () => useStore((s) => s.component),
    onPropsChange,
  };

  return api;

  function onPropsChange(props: DataGridEmptyStatePluginProps) {
    useStore.setState({ component: props.component });
  }

  // Renders nothing until onPropsChange lands the component in the store: the slot is registered
  // during setup, so falling back to the built-in copy here would flash "No results found" on the
  // first paint of the very state this plugin exists to replace.
  function EmptyStateSlot() {
    const Component = useStore((s) => s.component);

    return Component ? <Component /> : null;
  }
});
