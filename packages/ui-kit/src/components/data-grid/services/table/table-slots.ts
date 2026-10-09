import type { StoreApi } from 'zustand';
import type { UseBoundStore } from 'zustand/react';
import { useShallow } from 'zustand/react/shallow';
import type { DataGridItem } from '../../data-grid-types';
import type { TableSlot, TableSlotName, TableSlotOptions, TableStore } from './table-types';

const emptySlots: TableSlot[] = [];

export function prepareTableSlots<TItem extends DataGridItem = DataGridItem>(
  useTableStore: UseBoundStore<StoreApi<TableStore<TItem>>>,
) {
  return {
    registerSlot,
    useSlots,
  };

  function registerSlot<T extends TableSlotName>(name: T, options: TableSlotOptions[T]) {
    const store = useTableStore.getState();
    const id = Math.random().toString(36).slice(2);
    const existingSlots = store.slots.get(name) ?? emptySlots;
    const order = options.order ?? (existingSlots.length + 1) * 10;

    const newSlot: TableSlot = {
      id,
      name,
      component: options.component,
      order,
    };

    const updated = [...existingSlots, newSlot].sort((a, b) => a.order - b.order);
    const newSlots = new Map(store.slots);
    newSlots.set(name, updated);
    useTableStore.setState({ slots: newSlots });
  }

  function useSlots<T extends TableSlotName>(name: T): TableSlot[] {
    return useTableStore(useShallow((state) => state.slots.get(name) ?? emptySlots));
  }
}
