// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { DataGridItem } from '../../data-grid-types.js';
import { useDataGridMessages } from '../../services/core/data-grid-messages-context';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import type { DataGridItemId } from '../../services/storage/storage-types.js';
import { DataGridRowDetailHeader } from './components/data-grid-row-detail-header';
import { DataGridRowDetailRow } from './components/data-grid-row-detail-row';
import { DataGridRowDetailToggle } from './components/data-grid-row-detail-toggle';
import type {
  DataGridRowDetailPluginApi,
  DataGridRowDetailPluginProps,
  RowDetailConfigStore,
  RowDetailStore,
} from './row-detail-types.js';

const rowDetailColumnId = 'row-detail';
// Row select's checkbox column takes 5 (the drag and drop handle takes 0, the row number 3), so
// the detail toggle follows the checkbox, and 7 is free.
const rowDetailColumnOrder = 7;
const rowDetailColumnWidth = '40px';

const DataGridRowDetailPluginRaw = createDataGridPlugin<
  DataGridItem,
  'rowDetail',
  DataGridRowDetailPluginProps,
  DataGridRowDetailPluginApi
>('rowDetail', (context) => {
  const useDetailStore = create<RowDetailStore>(() => ({
    openIds: new Set(),
  }));

  const useConfigStore = create<RowDetailConfigStore>(() => ({
    render: undefined,
    toggleLabel: undefined,
  }));

  // Per instance, so two grids (or two plugins on one grid) never point a toggle at the other's
  // detail, and an id whose characters are odd in a DOM id cannot break the reference.
  const idPrefix = `data-grid-row-detail-${Math.random().toString(36).slice(2)}`;

  context.registerExtraColumn({
    id: rowDetailColumnId,
    position: 'start',
    order: rowDetailColumnOrder,
    width: rowDetailColumnWidth,
    header: DataGridRowDetailHeader,
    body: DataGridRowDetailToggle,
    // Toggling the detail must never also fire the row-click callback. Marking the whole cell
    // (not just the toggle) covers the button and the cell padding, a press on either included.
    ignoreRowClick: true,
  });
  context.registerTableSlot('row-after', { component: DataGridRowDetailRow });

  return {
    useIsOpen,
    toggle,
    useRender,
    useName,
    regionId,
    onPropsChange,
  };

  function useIsOpen(itemId: DataGridItemId): boolean {
    return useDetailStore((s) => s.openIds.has(itemId));
  }

  function toggle(itemId: DataGridItemId) {
    const { openIds } = useDetailStore.getState();
    const next = new Set(openIds);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    useDetailStore.setState({ openIds: next });
  }

  function useRender() {
    return useConfigStore((s) => s.render);
  }

  function useName(item: DataGridItem): string {
    const toggleLabel = useConfigStore((s) => s.toggleLabel);
    const messages = useDataGridMessages();
    return toggleLabel ? toggleLabel(item) : messages.rowDetail.toggle;
  }

  function regionId(itemId: DataGridItemId): string {
    // The type is part of the id: the open set tells 1 from "1", so their details are two
    // elements, and two elements cannot share an id.
    return `${idPrefix}-${typeof itemId === 'number' ? 'n' : 's'}-${encodeURIComponent(String(itemId))}`;
  }

  function onPropsChange(props: DataGridRowDetailPluginProps) {
    useConfigStore.setState({
      render: props.render,
      toggleLabel: props.toggleLabel,
    });
  }
});

// The plugin is built for the base item type; the cast hands the consumer a generic component, so
// `<DataGridRowDetailPlugin<User> render={renderUserDetail} />` types `render` against the
// consumer's item.
export const DataGridRowDetailPlugin = DataGridRowDetailPluginRaw as <
  TItem extends DataGridItem = DataGridItem,
>(
  props: DataGridRowDetailPluginProps<TItem>,
) => ReactNode;
