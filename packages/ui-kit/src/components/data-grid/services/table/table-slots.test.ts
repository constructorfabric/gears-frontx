import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { prepareTableSlots } from './table-slots';
import type { TableStore } from './table-types';

function createTestStore(overrides: Partial<TableStore> = {}) {
  return create<TableStore>(() => ({
    columns: [],
    flatColumns: [],
    columnVisibility: new Map(),
    columnSticky: new Map(),
    groupSticky: new Map(),
    columnWidths: new Map(),
    minContentWidths: new Map(),
    extraColumnsStart: [],
    extraColumnsEnd: [],
    slots: new Map(),
    components: new Map(),
    tableLayout: 'fixed',
    stickyHeader: false,
    ...overrides,
  }));
}

describe('tableSlots', () => {
  describe('registerSlot', () => {
    it('registers a slot component', () => {
      const useStore = createTestStore();
      const { registerSlot } = prepareTableSlots(useStore);
      const TestComponent = () => null;

      registerSlot('subheader', { component: TestComponent });

      const slots = useStore.getState().slots.get('subheader');
      expect(slots).toHaveLength(1);
      expect(slots![0].component).toBe(TestComponent);
      expect(slots![0].name).toBe('subheader');
    });

    it('auto-assigns order', () => {
      const useStore = createTestStore();
      const { registerSlot } = prepareTableSlots(useStore);
      const TestComponent = () => null;

      registerSlot('footer', { component: TestComponent });

      const slots = useStore.getState().slots.get('footer');
      expect(slots![0].order).toBe(10);
    });

    it('respects custom order', () => {
      const useStore = createTestStore();
      const { registerSlot } = prepareTableSlots(useStore);
      const TestComponent = () => null;

      registerSlot('subheader', { component: TestComponent, order: 5 });

      const slots = useStore.getState().slots.get('subheader');
      expect(slots![0].order).toBe(5);
    });

    it('sorts multiple slots by order', () => {
      const useStore = createTestStore();
      const { registerSlot } = prepareTableSlots(useStore);
      const ComponentA = () => null;
      const ComponentB = () => null;

      registerSlot('subheader', { component: ComponentA, order: 20 });
      registerSlot('subheader', { component: ComponentB, order: 5 });

      const slots = useStore.getState().slots.get('subheader')!;
      expect(slots).toHaveLength(2);
      expect(slots[0].component).toBe(ComponentB);
      expect(slots[1].component).toBe(ComponentA);
    });
  });

  describe('useSlots logic', () => {
    it('returns slots for a registered name', () => {
      const TestComponent = () => null;
      const useStore = createTestStore({
        slots: new Map([
          ['subheader', [{ id: '1', name: 'subheader', component: TestComponent, order: 10 }]],
        ]),
      });

      const state = useStore.getState();
      const slots = state.slots.get('subheader') ?? [];

      expect(slots).toHaveLength(1);
      expect(slots[0].component).toBe(TestComponent);
    });

    it('returns empty array for unregistered slot name', () => {
      const useStore = createTestStore();

      const state = useStore.getState();
      const slots = state.slots.get('footer') ?? [];

      expect(slots).toHaveLength(0);
    });

    it('returns slots sorted by order', () => {
      const ComponentA = () => null;
      const ComponentB = () => null;
      const useStore = createTestStore({
        slots: new Map([
          [
            'subheader',
            [
              { id: '1', name: 'subheader', component: ComponentB, order: 5 },
              { id: '2', name: 'subheader', component: ComponentA, order: 20 },
            ],
          ],
        ]),
      });

      const state = useStore.getState();
      const slots = state.slots.get('subheader') ?? [];

      expect(slots).toHaveLength(2);
      expect(slots[0].component).toBe(ComponentB);
      expect(slots[1].component).toBe(ComponentA);
    });
  });
});
