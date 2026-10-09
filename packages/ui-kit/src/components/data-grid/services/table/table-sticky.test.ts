import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { getEndStickyOffset, prepareTableSticky } from './table-sticky';
import type { ExtraColumn, DataGridTableColumn, DataGridTableGroup, TableStore } from './table-types';

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

describe('tableSticky', () => {
  describe('initializeStickyState', () => {
    it('defaults sticky to false', () => {
      const useStore = createTestStore();
      const { initializeStickyState } = prepareTableSticky(useStore);
      const columns: DataGridTableColumn[] = [{ id: 'name', label: 'Name' }];

      const result = initializeStickyState(columns);

      expect(result.columnSticky.get('name')).toBe(false);
    });

    it('reads sticky from column config', () => {
      const useStore = createTestStore();
      const { initializeStickyState } = prepareTableSticky(useStore);
      const columns: DataGridTableColumn[] = [
        { id: 'name', label: 'Name', sticky: true },
        { id: 'email', label: 'Email' },
      ];

      const result = initializeStickyState(columns);

      expect(result.columnSticky.get('name')).toBe(true);
      expect(result.columnSticky.get('email')).toBe(false);
    });

    it('inherits group sticky to columns', () => {
      const useStore = createTestStore();
      const { initializeStickyState } = prepareTableSticky(useStore);
      const columns: (DataGridTableColumn | DataGridTableGroup)[] = [
        {
          id: 'group',
          label: 'Group',
          sticky: true,
          columns: [
            { id: 'col_a', label: 'A' },
            { id: 'col_b', label: 'B' },
          ],
        },
      ];

      const result = initializeStickyState(columns);

      expect(result.groupSticky.get('group')).toBe(true);
      expect(result.columnSticky.get('col_a')).toBe(true);
      expect(result.columnSticky.get('col_b')).toBe(true);
    });
  });

  describe('getOrderedColumnsWithSticky', () => {
    it('puts sticky columns first', () => {
      const useStore = createTestStore();
      const { getOrderedColumnsWithSticky } = prepareTableSticky(useStore);
      const columns: DataGridTableColumn[] = [
        { id: 'name', label: 'Name' },
        { id: 'email', label: 'Email' },
        { id: 'role', label: 'Role' },
      ];
      const stickyMap = new Map([
        ['name', false],
        ['email', true],
        ['role', false],
      ]);

      const result = getOrderedColumnsWithSticky(columns, stickyMap);

      expect(result[0].id).toBe('email');
      expect(result[1].id).toBe('name');
      expect(result[2].id).toBe('role');
    });

    it('preserves order within sticky and non-sticky groups', () => {
      const useStore = createTestStore();
      const { getOrderedColumnsWithSticky } = prepareTableSticky(useStore);
      const columns: DataGridTableColumn[] = [
        { id: 'col_a', label: 'A' },
        { id: 'col_b', label: 'B' },
        { id: 'col_c', label: 'C' },
        { id: 'col_d', label: 'D' },
      ];
      const stickyMap = new Map([
        ['col_a', false],
        ['col_b', true],
        ['col_c', false],
        ['col_d', true],
      ]);

      const result = getOrderedColumnsWithSticky(columns, stickyMap);

      expect(result.map((c: DataGridTableColumn) => c.id)).toEqual(['col_b', 'col_d', 'col_a', 'col_c']);
    });
  });

  describe('onResizeColumn', () => {
    it('updates stored column width', () => {
      const useStore = createTestStore({
        columnWidths: new Map([['name', 100]]),
      });
      const { onResizeColumn } = prepareTableSticky(useStore);

      onResizeColumn('name', 150);

      expect(useStore.getState().columnWidths.get('name')).toBe(150);
    });

    it('adds new column width', () => {
      const useStore = createTestStore();
      const { onResizeColumn } = prepareTableSticky(useStore);

      onResizeColumn('name', 200);

      expect(useStore.getState().columnWidths.get('name')).toBe(200);
    });

    // A write of an unchanged width is a new store state, which re-creates the header's
    // ResizeObserver, whose first report writes the same width again: an observer per frame.
    it('leaves the store state alone when the width is unchanged', () => {
      const useStore = createTestStore({
        columnWidths: new Map([['name', 100]]),
      });
      const { onResizeColumn } = prepareTableSticky(useStore);
      const before = useStore.getState();

      onResizeColumn('name', 100);

      expect(useStore.getState()).toBe(before);
    });
  });

  describe('isColumnSticky / isGroupSticky', () => {
    it('returns sticky state for column', () => {
      const useStore = createTestStore({
        columnSticky: new Map([['name', true]]),
      });
      const { isColumnSticky } = prepareTableSticky(useStore);

      expect(isColumnSticky('name')).toBe(true);
      expect(isColumnSticky('unknown')).toBe(false);
    });

    it('returns sticky state for group', () => {
      const useStore = createTestStore({
        groupSticky: new Map([['group', true]]),
      });
      const { isGroupSticky } = prepareTableSticky(useStore);

      expect(isGroupSticky('group')).toBe(true);
      expect(isGroupSticky('unknown')).toBe(false);
    });
  });

  describe('columnStickyOffset logic', () => {
    function computeColumnOffset(
      store: ReturnType<typeof createTestStore>,
      columnId: string,
    ): number | undefined {
      const s = store.getState();
      if (!s.columnSticky.get(columnId)) return undefined;

      let offset = 0;
      for (const extra of s.extraColumnsStart) {
        if (extra.width) offset += parseInt(extra.width, 10) || 0;
      }
      const visibleCols = s.flatColumns.filter((c) => s.columnVisibility.get(c.id) !== false);
      for (const col of visibleCols) {
        if (col.id === columnId) break;
        if (s.columnSticky.get(col.id)) {
          offset += s.columnWidths.get(col.id) ?? 0;
        }
      }
      return offset;
    }

    it('returns undefined for non-sticky column', () => {
      const useStore = createTestStore({
        flatColumns: [{ id: 'name', label: 'Name' }],
        columnVisibility: new Map([['name', true]]),
        columnSticky: new Map([['name', false]]),
      });

      expect(computeColumnOffset(useStore, 'name')).toBeUndefined();
    });

    it('returns 0 for first sticky column with no extra start columns', () => {
      const useStore = createTestStore({
        flatColumns: [{ id: 'name', label: 'Name' }],
        columnVisibility: new Map([['name', true]]),
        columnSticky: new Map([['name', true]]),
        columnWidths: new Map([['name', 100]]),
      });

      expect(computeColumnOffset(useStore, 'name')).toBe(0);
    });

    it('accumulates widths of preceding sticky columns', () => {
      const useStore = createTestStore({
        flatColumns: [
          { id: 'col_a', label: 'A' },
          { id: 'col_b', label: 'B' },
          { id: 'col_c', label: 'C' },
        ],
        columnVisibility: new Map([
          ['col_a', true],
          ['col_b', true],
          ['col_c', true],
        ]),
        columnSticky: new Map([
          ['col_a', true],
          ['col_b', true],
          ['col_c', false],
        ]),
        columnWidths: new Map([
          ['col_a', 100],
          ['col_b', 150],
        ]),
      });

      expect(computeColumnOffset(useStore, 'col_a')).toBe(0);
      expect(computeColumnOffset(useStore, 'col_b')).toBe(100);
    });

    it('includes extra start column widths in offset', () => {
      const useStore = createTestStore({
        flatColumns: [{ id: 'name', label: 'Name' }],
        columnVisibility: new Map([['name', true]]),
        columnSticky: new Map([['name', true]]),
        columnWidths: new Map([['name', 100]]),
        extraColumnsStart: [{ id: 'checkbox', position: 'start', order: 10, width: '40px' }],
      });

      expect(computeColumnOffset(useStore, 'name')).toBe(40);
    });

    it('skips non-sticky columns in offset calculation', () => {
      const useStore = createTestStore({
        flatColumns: [
          { id: 'col_a', label: 'A' },
          { id: 'col_b', label: 'B' },
          { id: 'col_c', label: 'C' },
        ],
        columnVisibility: new Map([
          ['col_a', true],
          ['col_b', true],
          ['col_c', true],
        ]),
        columnSticky: new Map([
          ['col_a', true],
          ['col_b', false],
          ['col_c', true],
        ]),
        columnWidths: new Map([
          ['col_a', 100],
          ['col_b', 200],
          ['col_c', 150],
        ]),
      });

      // col_c is sticky, preceded by col_a (sticky, 100px) and col_b (not sticky, skipped)
      expect(computeColumnOffset(useStore, 'col_c')).toBe(100);
    });
  });

  describe('groupStickyOffset logic', () => {
    function computeGroupOffset(
      store: ReturnType<typeof createTestStore>,
      groupId: string,
    ): number | undefined {
      const s = store.getState();
      if (!s.groupSticky.get(groupId)) return undefined;

      let offset = 0;
      for (const extra of s.extraColumnsStart) {
        if (extra.width) offset += parseInt(extra.width, 10) || 0;
      }
      const visibleCols = s.flatColumns.filter((c) => s.columnVisibility.get(c.id) !== false);
      for (const col of visibleCols) {
        if (col.groupId === groupId) break;
        if (s.columnSticky.get(col.id)) {
          offset += s.columnWidths.get(col.id) ?? 0;
        }
      }
      return offset;
    }

    it('returns undefined for non-sticky group', () => {
      const useStore = createTestStore({
        flatColumns: [{ id: 'name', label: 'Name', groupId: 'grp' }],
        columnVisibility: new Map([['name', true]]),
        columnSticky: new Map([['name', false]]),
        groupSticky: new Map([['grp', false]]),
      });

      expect(computeGroupOffset(useStore, 'grp')).toBeUndefined();
    });

    it('returns offset for sticky group', () => {
      const useStore = createTestStore({
        flatColumns: [
          { id: 'col_a', label: 'A' },
          { id: 'col_b', label: 'B', groupId: 'grp' },
        ],
        columnVisibility: new Map([
          ['col_a', true],
          ['col_b', true],
        ]),
        columnSticky: new Map([
          ['col_a', true],
          ['col_b', true],
        ]),
        groupSticky: new Map([['grp', true]]),
        columnWidths: new Map([['col_a', 120]]),
      });

      expect(computeGroupOffset(useStore, 'grp')).toBe(120);
    });
  });

  describe('getEndStickyOffset', () => {
    function endColumn(overrides: Partial<ExtraColumn> & { id: string }): ExtraColumn {
      return { position: 'end', order: 10, ...overrides };
    }

    it('returns undefined for an end column that does not pin', () => {
      const state = {
        extraColumnsEnd: [endColumn({ id: 'row-actions', width: '48px' })],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'row-actions')).toBeUndefined();
    });

    it('returns undefined for a column that is not an end extra column at all', () => {
      const state = {
        extraColumnsEnd: [endColumn({ id: 'row-actions', width: '48px', sticky: true })],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'email')).toBeUndefined();
    });

    it('pins the outermost end column flush against the edge', () => {
      const state = {
        extraColumnsEnd: [endColumn({ id: 'row-actions', width: '48px', sticky: true })],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'row-actions')).toBe(0);
    });

    it('stacks pinned end columns right to left', () => {
      // Rendered left to right as [flags, row-actions]; measured from the end edge, row-actions
      // is the outermost and flags sits just inside it.
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, width: '32px', sticky: true }),
          endColumn({ id: 'row-actions', order: 100, width: '48px', sticky: true }),
        ],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'row-actions')).toBe(0);
      expect(getEndStickyOffset(state, 'flags')).toBe(48);
    });

    it('does not reserve room for an unpinned column between two pinned ones', () => {
      // The unpinned column scrolls away, so the pinned ones stack against each other.
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, width: '32px', sticky: true }),
          endColumn({ id: 'notes', order: 50, width: '200px' }),
          endColumn({ id: 'row-actions', order: 100, width: '48px', sticky: true }),
        ],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'flags')).toBe(48);
      expect(getEndStickyOffset(state, 'notes')).toBeUndefined();
    });

    it('stacks on the measured header width in preference to the registered one', () => {
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, width: '32px', sticky: true }),
          endColumn({ id: 'row-actions', order: 100, width: '48px', sticky: true }),
        ],
        columnWidths: new Map([['row-actions', 64]]),
      };

      expect(getEndStickyOffset(state, 'flags')).toBe(64);
    });

    it('ignores a registered width that is not a plain px length', () => {
      // `parseInt` would read `4rem` as `4` and pin `flags` four pixels from the edge, under a
      // column many times that wide. Nothing until the header is measured is better than that.
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, width: '32px', sticky: true }),
          endColumn({ id: 'row-actions', order: 100, width: '4rem', sticky: true }),
        ],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'flags')).toBe(0);
    });

    it('ignores a percentage registered width the same way', () => {
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, width: '32px', sticky: true }),
          endColumn({ id: 'row-actions', order: 100, width: '10%', sticky: true }),
        ],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'flags')).toBe(0);
    });

    it('keeps the measured width when the registered one is unreadable', () => {
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, width: '32px', sticky: true }),
          endColumn({ id: 'row-actions', order: 100, width: '4rem', sticky: true }),
        ],
        columnWidths: new Map([['row-actions', 64]]),
      };

      expect(getEndStickyOffset(state, 'flags')).toBe(64);
    });

    it('reads a fractional px registered width in full', () => {
      // `parseInt` truncates -- the auto-sizer reports sub-pixel tracks on a scaled viewport.
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, width: '32px', sticky: true }),
          endColumn({ id: 'row-actions', order: 100, width: '47.5px', sticky: true }),
        ],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'flags')).toBe(47.5);
    });

    it('treats an unmeasured, widthless pinned column as contributing nothing', () => {
      const state = {
        extraColumnsEnd: [
          endColumn({ id: 'flags', order: 10, sticky: true }),
          endColumn({ id: 'row-actions', order: 100, sticky: true }),
        ],
        columnWidths: new Map<string, number>(),
      };

      expect(getEndStickyOffset(state, 'flags')).toBe(0);
    });
  });
});
