import { create } from 'zustand';
import type { DataGridItem, InternalContext } from '../../data-grid-types';
import {
  DataGridLayoutMainSlotSelector,
  VIEW_SELECTOR_SLOT_ID,
} from './components/data-grid-layout-main-slot-selector';
import type {
  LayoutPublicApi,
  LayoutService,
  LayoutSlot,
  LayoutSlotName,
  LayoutSlotOptions,
  LayoutStore,
} from './layout-types';

export function createLayoutService<TItem extends DataGridItem>(
  context: InternalContext<TItem>,
): LayoutService {
  const useLayoutStore = create<LayoutStore>()(() => ({
    slots: new Map(),
    activeSlotIds: new Map(),
  }));

  const publicApi: LayoutPublicApi = {
    registerSlot,
    setActiveSlotId,
    getActiveSlotId,
  };

  context.plugins.registerPublicApi(publicApi);

  return {
    ...publicApi,
    useLayoutStore,
  };

  function getSlotById<T extends LayoutSlotName>(name: T, id: string) {
    return getLayoutSlots(name).find((slot) => slot.id === id) as Extract<
      LayoutSlot,
      { name: T }
    >;
  }

  function getLayoutSlots<T extends LayoutSlotName>(name: T) {
    return (useLayoutStore.getState().slots.get(name) ?? []) as Extract<
      LayoutSlot,
      { name: T }
    >[];
  }

  function registerSlot<T extends LayoutSlotName>(name: T, options: LayoutSlotOptions[T]) {
    if ((name === 'top-start' || name === 'top-end') && !getSlotById('top', 'default')) {
      registerSlot('top', {
        id: 'default',
        active: true,
        component: () => null,
      });
    }

    const id = options.id ?? Math.random().toString();
    const existingSlots = getLayoutSlots(name);
    const order = options.order ?? (existingSlots.length + 1) * 10;
    const newSlot: LayoutSlot = { id, name, ...options, order };
    const newSlots = [...existingSlots, newSlot].sort((a, b) => a.order - b.order);

    useLayoutStore.setState((state) => {
      const newSlotsMap = new Map(state.slots);
      newSlotsMap.set(name, newSlots);
      return { slots: newSlotsMap };
    });

    if ('active' in options && options.active) {
      setActiveSlotId(name, newSlot.id);
    } else if (newSlots.length === 1) {
      setActiveSlotId(name, newSlot.id);
    }

    // Auto-mount the main-slot view selector once there are two or more main views to switch
    // between. Guarded so a third main slot does not register a second selector.
    if (name === 'main' && newSlots.length >= 2 && !getSlotById('top-end', VIEW_SELECTOR_SLOT_ID)) {
      registerSlot('top-end', {
        id: VIEW_SELECTOR_SLOT_ID,
        component: DataGridLayoutMainSlotSelector,
      });
    }
  }

  function setActiveSlotId(name: LayoutSlotName, id: string) {
    useLayoutStore.setState((state) => {
      const newActiveSlotIds = new Map(state.activeSlotIds);
      newActiveSlotIds.set(name, id);
      return { activeSlotIds: newActiveSlotIds };
    });
  }

  function getActiveSlotId(name: LayoutSlotName) {
    return useLayoutStore.getState().activeSlotIds.get(name);
  }
}
