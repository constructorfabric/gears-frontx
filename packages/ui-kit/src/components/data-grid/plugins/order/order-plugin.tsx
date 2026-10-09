// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import { isDeepEqual } from '../../utils/deep-equal';
import { create } from 'zustand';
import type { DataGridItem } from '../../data-grid-types';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import type {
  LoadContextOrderItem,
  OrderDirection,
} from '../../services/plugins/plugins-types';
import { DataGridOrderButton } from './components/data-grid-order-button';
import { DataGridOrderHeaderCellLabel } from './components/data-grid-order-header-cell-label';
import { DataGridOrderIcon } from './components/data-grid-order-icon';
import type {
  DataGridDefaultOrder,
  DataGridOrderOption,
  DataGridOrderPluginApi,
  DataGridOrderPluginProps,
  DataGridOrderPopoverOptions,
} from './order-types';

interface OrderStore {
  order: LoadContextOrderItem | undefined;
}

const clearedSentinel: LoadContextOrderItem = { columnId: '__cleared__', direction: 'asc' };

// Stable identities for the absent-prop case: `useOptions` selects the array by reference, so a
// fresh literal would notify that selector for identical content.
const emptyOptions: DataGridOrderOption[] = [];
const emptyExcludedColumns: string[] = [];

function isClearedSentinel(value: LoadContextOrderItem | undefined | null): boolean {
  return value?.columnId === '__cleared__';
}

interface OrderConfigStore {
  excludedColumns: string[];
  options: DataGridOrderOption[];
  popover: DataGridOrderPopoverOptions | undefined;
}

export type { DataGridOrderPluginProps, DataGridOrderPluginApi };

export const DataGridOrderPlugin = createDataGridPlugin<
  DataGridItem,
  'order',
  DataGridOrderPluginProps
>(
  'order',
  (context) => {
    const persistent = context.registerPersistentState<LoadContextOrderItem>('order', {
      schema: { columnId: 'string', direction: 'string' },
    });

    // The stored order and the order the grid uses are different values. A narrowing can make a
    // stored order unusable without making it wrong, so it stays in storage and is withheld.
    let storedOrder = persistent.value;

    // Seeded empty on purpose: orderability depends on props, which arrive in the effect below, so
    // the first `resolveOrder` is what puts an order here. Nothing loads before it.
    const useOrderStore = create<OrderStore>(() => ({
      order: undefined,
    }));

    const useConfigStore = create<OrderConfigStore>(() => ({
      excludedColumns: emptyExcludedColumns,
      options: emptyOptions,
      popover: undefined,
    }));

    let hasRequestedLoad = false;

    // Register table components
    context.registerComponent('header-cell-label', DataGridOrderHeaderCellLabel);
    context.registerTableSlot('header-cell-end', { component: DataGridOrderIcon });
    context.registerSlot('top-end', {
      id: 'order',
      component: DataGridOrderButton,
      order: -10,
    });

    // Selectors
    const useOrder = () => useOrderStore((s) => s.order);
    const useColumnId = () => useOrderStore((s) => s.order?.columnId);
    const useDirection = () => useOrderStore((s) => s.order?.direction);

    context.hook('load:context', () => {
      hasRequestedLoad = true;

      const { order } = useOrderStore.getState();
      if (!order || isColumnUnorderable(order.columnId)) return;
      return { order: [{ column: order.columnId, direction: order.direction }] };
    });

    function applyOrder(order: LoadContextOrderItem) {
      // The plugin cannot express an order the user could not reach, so it does not store one.
      if (isColumnUnorderable(order.columnId)) return;

      storedOrder = order;
      useOrderStore.setState({ order });
      persistent.setValue(order);
      context.refresh({ resetFilters: false });
    }

    const api: DataGridOrderPluginApi = {
      useOrder,
      useColumnId,
      useDirection,
      toggleOrder,
      setOrder,
      useIsColumnExcluded,
      useOptions,
      get popover() {
        return useConfigStore.getState().popover;
      },
      onPropsChange,
    };

    return api;

    function toggleOrder(columnId: string) {
      const { order } = useOrderStore.getState();

      if (order?.columnId === columnId) {
        if (order.direction === 'desc') {
          applyOrder({ columnId, direction: 'asc' });
          return;
        }
        storedOrder = clearedSentinel;
        useOrderStore.setState({ order: undefined });
        persistent.setValue(clearedSentinel);
        context.refresh({ resetFilters: false });
        return;
      }

      applyOrder({ columnId, direction: 'desc' });
    }

    function setOrder(columnId: string, direction: OrderDirection) {
      applyOrder({ columnId, direction });
    }

    function useIsColumnExcluded(columnId: string) {
      return useConfigStore((s) => s.excludedColumns.includes(columnId));
    }

    function isColumnUnorderable(columnId: string) {
      const { excludedColumns, options } = useConfigStore.getState();
      return excludedColumns.includes(columnId) && !options.some((o) => o.id === columnId);
    }

    /** The stored order as a value of its own, so the mirror cannot be mutated through the store. */
    function pickStoredOrder() {
      if (!storedOrder || isClearedSentinel(storedOrder)) return undefined;
      return { columnId: storedOrder.columnId, direction: storedOrder.direction };
    }

    /** The order the grid uses, derived from the stored one and what the props currently offer. */
    function pickOrder(defaultOrder: DataGridDefaultOrder | undefined) {
      const stored = pickStoredOrder();
      if (stored && !isColumnUnorderable(stored.columnId)) return stored;

      // A sort the user cleared by hand is a choice, so no fallback applies to it.
      if (isClearedSentinel(storedOrder)) return undefined;

      // Nothing usable is stored. An order already applied this session stays, so changing
      // `defaultOrder` does not re-sort a grid the user is looking at.
      const { order: applied } = useOrderStore.getState();
      if (applied && !isColumnUnorderable(applied.columnId)) return applied;

      if (defaultOrder && !isColumnUnorderable(defaultOrder.id)) {
        return { columnId: defaultOrder.id, direction: defaultOrder.direction };
      }
      return undefined;
    }

    function resolveOrder(defaultOrder: DataGridDefaultOrder | undefined) {
      const { order: previous } = useOrderStore.getState();
      const next = pickOrder(defaultOrder);
      if (previous?.columnId === next?.columnId && previous?.direction === next?.direction) return;

      useOrderStore.setState({ order: next });
      if (hasRequestedLoad) context.refresh({ resetFilters: false });
    }

    function useOptions(): DataGridOrderOption[] {
      return useConfigStore((s) => s.options);
    }

    function onPropsChange(props: DataGridOrderPluginProps) {
      // Deliberately mirrors the props rather than committing each only when defined: both fields
      // decide what the request carries, so an absent prop must reset rather than keep its value.
      useConfigStore.setState({
        excludedColumns: props.excludedColumns ?? emptyExcludedColumns,
        options: props.options ?? emptyOptions,
        popover: props.popover,
      });

      resolveOrder(props.defaultOrder);
    }
  },
  (prevProps, nextProps) =>
    isDeepEqual(prevProps.options, nextProps.options) &&
    isDeepEqual(prevProps.excludedColumns, nextProps.excludedColumns) &&
    prevProps.defaultOrder?.id === nextProps.defaultOrder?.id &&
    prevProps.defaultOrder?.direction === nextProps.defaultOrder?.direction &&
    prevProps.popover?.minInlineSize === nextProps.popover?.minInlineSize,
);
