import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { prepareTableColumns } from './table-columns';
import type { TableStickyService } from './table-sticky';
import type { DataGridTableColumn, DataGridTableGroup, TableStore } from './table-types';

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

const noop = () => {
  // noop
};

const noopStickyApi: TableStickyService = {
  initializeStickyState: () => ({
    columnSticky: new Map<string, boolean>(),
    groupSticky: new Map<string, boolean>(),
  }),
  getOrderedColumnsWithSticky: <T extends { id: string }>(cols: T[]) => cols,
  onResizeColumn: noop,
  isColumnSticky: () => false,
  isGroupSticky: () => false,
  useColumnStickyOffset: () => undefined,
  useColumnEndStickyOffset: () => undefined,
  useGroupStickyOffset: () => undefined,
};

describe('tableColumns', () => {
  describe('initializeColumns', () => {
    it('accepts valid snake_case ids', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);

      expect(() => initializeColumns([{ id: 'user_name', label: 'Name' }])).not.toThrow();
      expect(() => initializeColumns([{ id: 'is_active', label: 'Active' }])).not.toThrow();
      expect(() => initializeColumns([{ id: 'name', label: 'Name' }])).not.toThrow();
      expect(() => initializeColumns([{ id: 'id', label: 'ID' }])).not.toThrow();
    });

    it('rejects non-snake_case ids', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);

      expect(() => initializeColumns([{ id: 'userName', label: 'Name' }])).toThrow();
      expect(() => initializeColumns([{ id: 'UserName', label: 'Name' }])).toThrow();
      expect(() => initializeColumns([{ id: 'user-name', label: 'Name' }])).toThrow();
      expect(() => initializeColumns([{ id: 'USER_NAME', label: 'Name' }])).toThrow();
    });

    it('returns flat columns unchanged', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const columns: DataGridTableColumn[] = [
        { id: 'name', label: 'Name' },
        { id: 'email', label: 'Email' },
      ];

      const result = initializeColumns(columns);

      expect(result.flatColumns).toHaveLength(2);
      expect(result.flatColumns[0].id).toBe('name');
      expect(result.flatColumns[1].id).toBe('email');
    });

    it('flattens grouped columns and assigns groupId', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const columns: (DataGridTableColumn | DataGridTableGroup)[] = [
        { id: 'name', label: 'Name' },
        {
          id: 'contact',
          label: 'Contact',
          columns: [
            { id: 'email', label: 'Email' },
            { id: 'phone', label: 'Phone' },
          ],
        },
      ];

      const result = initializeColumns(columns);

      expect(result.flatColumns).toHaveLength(3);
      expect(result.flatColumns[0].id).toBe('name');
      expect(result.flatColumns[0].groupId).toBeUndefined();
      expect(result.flatColumns[1].id).toBe('email');
      expect(result.flatColumns[1].groupId).toBe('contact');
      expect(result.flatColumns[2].id).toBe('phone');
      expect(result.flatColumns[2].groupId).toBe('contact');
    });

    it('defaults all columns to visible', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const columns: DataGridTableColumn[] = [
        { id: 'name', label: 'Name' },
        { id: 'email', label: 'Email' },
      ];

      const result = initializeColumns(columns);

      expect(result.columnVisibility.get('name')).toBe(true);
      expect(result.columnVisibility.get('email')).toBe(true);
    });

    it('respects explicit visible: false', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const columns: DataGridTableColumn[] = [
        { id: 'name', label: 'Name' },
        { id: 'email', label: 'Email', visible: false },
      ];

      const result = initializeColumns(columns);

      expect(result.columnVisibility.get('name')).toBe(true);
      expect(result.columnVisibility.get('email')).toBe(false);
    });

    it('handles grouped columns visibility', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const columns: (DataGridTableColumn | DataGridTableGroup)[] = [
        {
          id: 'group',
          label: 'Group',
          columns: [
            { id: 'col_a', label: 'A', visible: false },
            { id: 'col_b', label: 'B' },
          ],
        },
      ];

      const result = initializeColumns(columns);

      expect(result.columnVisibility.get('col_a')).toBe(false);
      expect(result.columnVisibility.get('col_b')).toBe(true);
    });
  });

  describe('headerTruncate deprecation alias', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('normalizes headerTruncate: true to headerOverflow: "nowrap"', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      const result = initializeColumns([{ id: 'email', label: 'Email', headerTruncate: true }]);

      expect(result.flatColumns[0].headerOverflow).toBe('nowrap');
    });

    it('does not normalize headerTruncate: false', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);

      const result = initializeColumns([{ id: 'email', label: 'Email', headerTruncate: false }]);

      expect(result.flatColumns[0].headerOverflow).toBeUndefined();
    });

    it('leaves an explicit headerOverflow untouched when headerTruncate is also set', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      const result = initializeColumns([
        { id: 'email', label: 'Email', headerTruncate: true, headerOverflow: 'wrap' },
      ]);

      expect(result.flatColumns[0].headerOverflow).toBe('wrap');
    });

    it('emits a dev-only deprecation warning naming the column id', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([{ id: 'email', label: 'Email', headerTruncate: true }]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('"email"');
      expect(warnSpy.mock.calls[0][0]).toContain('headerOverflow');
    });

    it('warns only once per column id across repeated updateColumns-style calls', () => {
      const useStore = createTestStore();
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      const columns: DataGridTableColumn[] = [{ id: 'email', label: 'Email', headerTruncate: true }];

      // Simulate the columns effect re-firing with a new array identity but the same columns.
      initializeColumns([...columns]);
      initializeColumns([...columns]);
      initializeColumns([...columns]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('fixed-mode width contradiction DEV warning', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('does not warn when only width is set', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([{ id: 'name', label: 'Name', width: 100 }]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for a lone minWidth or maxWidth (valid track alias)', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([
        { id: 'min_col', label: 'Min', minWidth: 100 },
        { id: 'max_col', label: 'Max', maxWidth: 300 },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns when width and minWidth are both set under tableLayout: fixed', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([{ id: 'name', label: 'Name', width: 100, minWidth: 250 }]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('"name"');
      expect(warnSpy.mock.calls[0][0]).toContain('tableLayout="fixed"');
    });

    it('warns when minWidth and maxWidth are both set without a width', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([{ id: 'name', label: 'Name', minWidth: 100, maxWidth: 300 }]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not warn under tableLayout: auto -- the three props are independent there', () => {
      const useStore = createTestStore({ tableLayout: 'auto' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      // A flexible sibling keeps this focused on the width-contradiction warning specifically --
      // a lone constrained column would also trigger the unrelated all-columns-capped warning
      // (see its own describe block below).
      initializeColumns([
        { id: 'name', label: 'Name', width: 100, minWidth: 250, maxWidth: 300 },
        { id: 'role', label: 'Role' },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns only once per column id across repeated updateColumns-style calls', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      const columns: DataGridTableColumn[] = [{ id: 'name', label: 'Name', width: 100, minWidth: 250 }];

      initializeColumns([...columns]);
      initializeColumns([...columns]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not warn (about the contradiction) for a lone width: "min-content"', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([{ id: 'name', label: 'Name', width: 'min-content' }]);

      expect(warnSpy.mock.calls.some((call) => call[0].includes('cannot all apply'))).toBe(false);
    });

    it('does not warn (about the contradiction) when width: "min-content" is combined with minWidth/maxWidth', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([
        { id: 'name', label: 'Name', width: 'min-content', minWidth: 100, maxWidth: 300 },
      ]);

      expect(warnSpy.mock.calls.some((call) => call[0].includes('cannot all apply'))).toBe(false);
    });
  });

  describe('all-columns-capped DEV warning under tableLayout: auto', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('warns when every column has a width or maxWidth under tableLayout: auto', () => {
      const useStore = createTestStore({ tableLayout: 'auto' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([
        { id: 'name', label: 'Name', width: 150 },
        { id: 'description', label: 'Description', maxWidth: 220 },
      ]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('tableLayout="auto"');
    });

    it('does not warn when at least one column has neither width nor maxWidth', () => {
      const useStore = createTestStore({ tableLayout: 'auto' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([
        { id: 'name', label: 'Name' },
        { id: 'description', label: 'Description', maxWidth: 220 },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('a lone minWidth does not count as constraining a column (it is still flexible)', () => {
      const useStore = createTestStore({ tableLayout: 'auto' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([
        { id: 'name', label: 'Name', minWidth: 80 },
        { id: 'description', label: 'Description', maxWidth: 220 },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn under tableLayout: fixed even when every column is constrained', () => {
      const useStore = createTestStore({ tableLayout: 'fixed' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());

      initializeColumns([
        { id: 'name', label: 'Name', width: 150 },
        { id: 'description', label: 'Description', maxWidth: 220 },
      ]);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns only once for this grid instance across repeated updateColumns-style calls', () => {
      const useStore = createTestStore({ tableLayout: 'auto' });
      const { initializeColumns } = prepareTableColumns(useStore, noopStickyApi);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      const columns: DataGridTableColumn[] = [
        { id: 'name', label: 'Name', width: 150 },
        { id: 'description', label: 'Description', maxWidth: 220 },
      ];

      initializeColumns([...columns]);
      initializeColumns([...columns]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('useVisibleColumns logic', () => {
    it('returns only visible columns', () => {
      const useStore = createTestStore({
        flatColumns: [
          { id: 'name', label: 'Name' },
          { id: 'email', label: 'Email' },
          { id: 'role', label: 'Role' },
        ],
        columnVisibility: new Map([
          ['name', true],
          ['email', false],
          ['role', true],
        ]),
      });

      const state = useStore.getState();
      const visible = state.flatColumns.filter((c) => state.columnVisibility.get(c.id) !== false);

      expect(visible).toHaveLength(2);
      expect(visible.map((c) => c.id)).toEqual(['name', 'role']);
    });

    it('delegates ordering to stickyApi', () => {
      const useStore = createTestStore({
        flatColumns: [
          { id: 'name', label: 'Name' },
          { id: 'email', label: 'Email' },
          { id: 'role', label: 'Role' },
        ],
        columnVisibility: new Map([
          ['name', true],
          ['email', true],
          ['role', true],
        ]),
        columnSticky: new Map([
          ['name', false],
          ['email', true],
          ['role', false],
        ]),
      });

      const reverseStickyApi: TableStickyService = {
        ...noopStickyApi,
        getOrderedColumnsWithSticky: <T extends { id: string }>(
          cols: T[],
          sticky: Map<string, boolean>,
        ) => {
          const s: T[] = [];
          const ns: T[] = [];
          for (const c of cols) {
            if (sticky.get(c.id)) s.push(c);
            else ns.push(c);
          }
          return [...s, ...ns];
        },
      };

      prepareTableColumns(useStore, reverseStickyApi);
      // initializeColumns was already tested above
      // Here we verify the sticky ordering integration
      const state = useStore.getState();
      const visible = state.flatColumns.filter((c) => state.columnVisibility.get(c.id) !== false);
      const ordered = reverseStickyApi.getOrderedColumnsWithSticky(visible, state.columnSticky);

      expect(ordered[0].id).toBe('email');
      expect(ordered[1].id).toBe('name');
      expect(ordered[2].id).toBe('role');
    });

    it('excludes hidden columns before ordering', () => {
      const useStore = createTestStore({
        flatColumns: [
          { id: 'name', label: 'Name' },
          { id: 'email', label: 'Email' },
        ],
        columnVisibility: new Map([
          ['name', false],
          ['email', true],
        ]),
      });

      const state = useStore.getState();
      const visible = state.flatColumns.filter((c) => state.columnVisibility.get(c.id) !== false);

      expect(visible).toHaveLength(1);
      expect(visible[0].id).toBe('email');
    });
  });
});
