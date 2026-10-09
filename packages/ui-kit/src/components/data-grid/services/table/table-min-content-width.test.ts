import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { renderHook } from '@testing-library/react';
import { measureMinContentWidth, prepareTableMinContentWidth } from './table-min-content-width';
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
    tableLayout: 'auto',
    stickyHeader: false,
    ...overrides,
  }));
}

describe('prepareTableMinContentWidth', () => {
  describe('setMinContentWidth', () => {
    it('stores the measured width for a column', () => {
      const useStore = createTestStore();
      const { setMinContentWidth } = prepareTableMinContentWidth(useStore);

      setMinContentWidth('status', 84);

      expect(useStore.getState().minContentWidths.get('status')).toBe(84);
    });

    it('tracks widths independently per column', () => {
      const useStore = createTestStore();
      const { setMinContentWidth } = prepareTableMinContentWidth(useStore);

      setMinContentWidth('status', 84);
      setMinContentWidth('role', 60);

      expect(useStore.getState().minContentWidths.get('status')).toBe(84);
      expect(useStore.getState().minContentWidths.get('role')).toBe(60);
    });

    it('skips the store write when the measured width is unchanged (loop guard)', () => {
      const useStore = createTestStore();
      const { setMinContentWidth } = prepareTableMinContentWidth(useStore);
      setMinContentWidth('status', 84);
      const mapAfterFirstWrite = useStore.getState().minContentWidths;

      setMinContentWidth('status', 84);

      // Same Map reference -- no setState call happened, so no re-render would be triggered.
      expect(useStore.getState().minContentWidths).toBe(mapAfterFirstWrite);
    });

    it('writes again when the measured width actually changes', () => {
      const useStore = createTestStore();
      const { setMinContentWidth } = prepareTableMinContentWidth(useStore);
      setMinContentWidth('status', 84);
      const mapAfterFirstWrite = useStore.getState().minContentWidths;

      setMinContentWidth('status', 90);

      expect(useStore.getState().minContentWidths).not.toBe(mapAfterFirstWrite);
      expect(useStore.getState().minContentWidths.get('status')).toBe(90);
    });
  });

  describe('useMinContentWidth', () => {

    it('returns undefined for a column that has not been measured yet', () => {
      const useStore = createTestStore();
      const { useMinContentWidth } = prepareTableMinContentWidth(useStore);

      const { result } = renderHook(() => useMinContentWidth('status'));

      expect(result.current).toBeUndefined();
    });

    it('returns the stored measured width for a column', () => {
      const useStore = createTestStore({ minContentWidths: new Map([['status', 84]]) });
      const { useMinContentWidth } = prepareTableMinContentWidth(useStore);

      const { result } = renderHook(() => useMinContentWidth('status'));

      expect(result.current).toBe(84);
    });
  });
});

describe('measureMinContentWidth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeEntry(width: number): ResizeObserverEntry {
    return {
      contentRect: { width, height: 0, x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0 },
    } as unknown as ResizeObserverEntry;
  }

  it('rounds the content-box width up when there is no cell to read padding/border from', () => {
    expect(measureMinContentWidth(makeEntry(42.3), null)).toBe(43);
  });

  it('adds the cell padding and border (inline start + end) to the content-box width', () => {
    vi.stubGlobal(
      'getComputedStyle',
      vi.fn().mockReturnValue({
        paddingInlineStart: '12px',
        paddingInlineEnd: '12px',
        borderInlineStartWidth: '1px',
        borderInlineEndWidth: '1px',
      }),
    );
    const cell = document.createElement('th');

    // 50 content + 24 padding + 2 border = 76
    expect(measureMinContentWidth(makeEntry(50), cell)).toBe(76);
  });

  it('treats missing padding/border computed values as 0', () => {
    vi.stubGlobal('getComputedStyle', vi.fn().mockReturnValue({}));
    const cell = document.createElement('th');

    expect(measureMinContentWidth(makeEntry(50), cell)).toBe(50);
  });
});
