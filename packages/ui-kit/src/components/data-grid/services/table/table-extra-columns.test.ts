import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { prepareTableExtraColumns } from './table-extra-columns';
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

describe('tableExtraColumns', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('registerExtraColumn', () => {
    it('adds column at end position by default', () => {
      const useStore = createTestStore();
      const { registerExtraColumn } = prepareTableExtraColumns(useStore);

      registerExtraColumn({ id: 'actions', width: '80px' });

      const state = useStore.getState();
      expect(state.extraColumnsEnd).toHaveLength(1);
      expect(state.extraColumnsEnd[0].id).toBe('actions');
      expect(state.extraColumnsEnd[0].position).toBe('end');
      expect(state.extraColumnsStart).toHaveLength(0);
    });

    it('adds column at start position', () => {
      const useStore = createTestStore();
      const { registerExtraColumn } = prepareTableExtraColumns(useStore);

      registerExtraColumn({ id: 'checkbox', position: 'start', width: '40px' });

      expect(useStore.getState().extraColumnsStart).toHaveLength(1);
      expect(useStore.getState().extraColumnsStart[0].id).toBe('checkbox');
    });

    it('carries the registered pin onto the column', () => {
      const useStore = createTestStore();
      const { registerExtraColumn } = prepareTableExtraColumns(useStore);

      registerExtraColumn({ id: 'actions', sticky: true });

      expect(useStore.getState().extraColumnsEnd[0].sticky).toBe(true);
    });

    it('leaves a column registered without a pin unpinned', () => {
      const useStore = createTestStore();
      const { registerExtraColumn } = prepareTableExtraColumns(useStore);

      registerExtraColumn({ id: 'actions' });

      expect(useStore.getState().extraColumnsEnd[0].sticky).toBeUndefined();
    });

    it('sorts by order', () => {
      const useStore = createTestStore({
        extraColumnsEnd: [{ id: 'first', position: 'end', order: 10, width: '80px' }],
      });
      const { registerExtraColumn } = prepareTableExtraColumns(useStore);

      registerExtraColumn({ id: 'second', position: 'end', order: 5 });

      const end = useStore.getState().extraColumnsEnd;
      expect(end[0].id).toBe('second');
      expect(end[1].id).toBe('first');
    });

    it('auto-assigns order when not provided', () => {
      const useStore = createTestStore();
      const { registerExtraColumn } = prepareTableExtraColumns(useStore);

      registerExtraColumn({ id: 'col_a' });

      expect(useStore.getState().extraColumnsEnd[0].order).toBe(10);
    });
  });

  describe('useExtraColumns logic', () => {
    it('returns start columns for start position', () => {
      const useStore = createTestStore({
        extraColumnsStart: [{ id: 'checkbox', position: 'start', order: 10, width: '40px' }],
        extraColumnsEnd: [{ id: 'actions', position: 'end', order: 10, width: '80px' }],
      });

      const state = useStore.getState();
      const startCols = state.extraColumnsStart;

      expect(startCols).toHaveLength(1);
      expect(startCols[0].id).toBe('checkbox');
    });

    it('returns end columns for end position', () => {
      const useStore = createTestStore({
        extraColumnsStart: [{ id: 'checkbox', position: 'start', order: 10, width: '40px' }],
        extraColumnsEnd: [{ id: 'actions', position: 'end', order: 10, width: '80px' }],
      });

      const state = useStore.getState();
      const endCols = state.extraColumnsEnd;

      expect(endCols).toHaveLength(1);
      expect(endCols[0].id).toBe('actions');
    });

    it('returns empty array when no columns registered', () => {
      const useStore = createTestStore();

      const state = useStore.getState();

      expect(state.extraColumnsStart).toHaveLength(0);
      expect(state.extraColumnsEnd).toHaveLength(0);
    });
  });

  describe('updateExtraColumnSticky', () => {
    it('pins and unpins an end column', () => {
      const useStore = createTestStore({
        extraColumnsEnd: [{ id: 'actions', position: 'end', order: 100, width: '80px' }],
      });
      const { updateExtraColumnSticky } = prepareTableExtraColumns(useStore);

      updateExtraColumnSticky('actions', true);
      expect(useStore.getState().extraColumnsEnd[0].sticky).toBe(true);

      updateExtraColumnSticky('actions', false);
      expect(useStore.getState().extraColumnsEnd[0].sticky).toBe(false);
    });

    it('finds the column on the start side too', () => {
      const useStore = createTestStore({
        extraColumnsStart: [{ id: 'checkbox', position: 'start', order: 10, width: '40px' }],
        extraColumnsEnd: [{ id: 'actions', position: 'end', order: 100, width: '80px' }],
      });
      const { updateExtraColumnSticky } = prepareTableExtraColumns(useStore);
      vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      updateExtraColumnSticky('checkbox', true);

      expect(useStore.getState().extraColumnsStart[0].sticky).toBe(true);
      expect(useStore.getState().extraColumnsEnd[0].sticky).toBeUndefined();
    });

    it('keeps the column list identical when nothing changes', () => {
      // Plugins push their props on every re-render; replacing the list would re-render every
      // cell in the table each time a pinned grid re-renders.
      const useStore = createTestStore({
        extraColumnsEnd: [{ id: 'actions', position: 'end', order: 100, sticky: true }],
      });
      const { updateExtraColumnSticky } = prepareTableExtraColumns(useStore);
      const before = useStore.getState().extraColumnsEnd;

      updateExtraColumnSticky('actions', true);

      expect(useStore.getState().extraColumnsEnd).toBe(before);
    });

    it('writes nothing on a column registered without a pin', () => {
      // A grid that never opts in registers no `sticky` and the plugin sends `false` on every
      // props pass. An absent flag and an explicit `false` are the same thing to every reader, so
      // the guard normalises both and the grid never pays a re-render of its cells for the pin.
      const useStore = createTestStore();
      const { registerExtraColumn, updateExtraColumnSticky } = prepareTableExtraColumns(useStore);

      registerExtraColumn({ id: 'actions' });
      const registered = useStore.getState().extraColumnsEnd;

      updateExtraColumnSticky('actions', false);
      expect(useStore.getState().extraColumnsEnd).toBe(registered);

      updateExtraColumnSticky('actions', false);
      expect(useStore.getState().extraColumnsEnd).toBe(registered);
    });

    it('ignores an unknown column', () => {
      const useStore = createTestStore({
        extraColumnsEnd: [{ id: 'actions', position: 'end', order: 100 }],
      });
      const { updateExtraColumnSticky } = prepareTableExtraColumns(useStore);

      updateExtraColumnSticky('nope', true);

      expect(useStore.getState().extraColumnsEnd[0].sticky).toBeUndefined();
    });
  });

  describe('start-column pin DEV warning', () => {
    // Nothing reads `sticky` on a `start` column, so a caller who sets it sees no effect and no
    // error. The warning is the only signal they get.
    it('warns when a start column is registered with a pin', () => {
      const useStore = createTestStore();
      const { registerExtraColumn } = prepareTableExtraColumns(useStore);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      registerExtraColumn({ id: 'checkbox', position: 'start', sticky: true });

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('"checkbox"');
      expect(warnSpy.mock.calls[0][0]).toContain('`end`');
    });

    it('warns when a start column is pinned after registration', () => {
      const useStore = createTestStore({
        extraColumnsStart: [{ id: 'checkbox', position: 'start', order: 10, width: '40px' }],
      });
      const { updateExtraColumnSticky } = prepareTableExtraColumns(useStore);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      updateExtraColumnSticky('checkbox', true);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('"checkbox"');
    });

    it('does not warn for an end column, which is where the flag is read', () => {
      const useStore = createTestStore();
      const { registerExtraColumn, updateExtraColumnSticky } = prepareTableExtraColumns(useStore);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      registerExtraColumn({ id: 'actions', position: 'end', sticky: true });
      updateExtraColumnSticky('actions', true);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn when a start column is told it is unpinned', () => {
      const useStore = createTestStore({
        extraColumnsStart: [{ id: 'checkbox', position: 'start', order: 10, width: '40px' }],
      });
      const { registerExtraColumn, updateExtraColumnSticky } = prepareTableExtraColumns(useStore);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      registerExtraColumn({ id: 'expand', position: 'start' });
      updateExtraColumnSticky('checkbox', false);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns once per column id, however many props passes arrive', () => {
      // `onPropsChange` calls the updater on every re-render of the plugin element.
      const useStore = createTestStore({
        extraColumnsStart: [{ id: 'checkbox', position: 'start', order: 10, width: '40px' }],
      });
      const { updateExtraColumnSticky } = prepareTableExtraColumns(useStore);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      updateExtraColumnSticky('checkbox', true);
      updateExtraColumnSticky('checkbox', true);
      updateExtraColumnSticky('checkbox', true);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
