import type { StoreApi } from 'zustand';
import type { UseBoundStore } from 'zustand/react';
import type { DataGridItem } from '../../data-grid-types';
import type { TableStore } from './table-types';

/**
 * Store-backed home for the measured pixel width of columns whose `width` is `'min-content'`,
 * under either `tableLayout`. `DataGridHeaderCell` measures its header content's natural size
 * with a ResizeObserver and calls `setMinContentWidth`; `resolveColumnStyle` reads it back via
 * `useMinContentWidth` to size the column's track -- under `auto`, the literal CSS `min-content`
 * keyword isn't honored by the browser's algorithm as a hint to hold a column narrow against a
 * widthless sibling; under `fixed`, there is no content-driven sizing at all, so the keyword has
 * nothing to act on either way. A measured pixel value stands in for it in both modes.
 *
 * `setMinContentWidth` skips the store write when the measured value hasn't changed. This is the
 * loop guard: the measured value drives the column's own CSS width, so an unconditional write on
 * every ResizeObserver callback would risk apply-width -> relayout -> re-measure -> apply-width
 * spinning forever. (The measurement target itself is also chosen to be size-independent of the
 * column's own width -- see `DataGridHeaderCell` -- so in practice this dedup is a backstop, not
 * the only thing preventing a loop.)
 */
export function prepareTableMinContentWidth<TItem extends DataGridItem = DataGridItem>(
  useTableStore: UseBoundStore<StoreApi<TableStore<TItem>>>,
) {
  return {
    setMinContentWidth,
    useMinContentWidth,
  };

  function setMinContentWidth(columnId: string, width: number) {
    const current = useTableStore.getState().minContentWidths;
    if (current.get(columnId) === width) return;

    const next = new Map(current);
    next.set(columnId, width);
    useTableStore.setState({ minContentWidths: next });
  }

  function useMinContentWidth(columnId: string): number | undefined {
    return useTableStore((state) => state.minContentWidths.get(columnId));
  }
}

/**
 * Computes the pixel width to apply to a `width: 'min-content'` column's header `<th>` from a
 * ResizeObserver entry on its `.contentRow` wrapper (see `DataGridHeaderCell`'s measurement
 * effect) -- the wrapper's own `inline-size: min-content` CSS keeps its measured content-box size
 * independent of whatever width the `<th>` itself currently has, so this reads the column's true
 * natural content width regardless of where in the measure -> apply -> re-render cycle it's
 * called (see the loop-safety note on `setMinContentWidth` above). Adds the cell's own
 * padding/border (cells are `border-box`) so the applied width holds the full, unclipped content,
 * and rounds up to guard against sub-pixel drift across repeated measurements of the same content.
 */
export function measureMinContentWidth(entry: ResizeObserverEntry, cell: Element | null): number {
  const computedStyle = cell ? window.getComputedStyle(cell) : undefined;
  const paddings = computedStyle
    ? parseFloat(computedStyle.paddingInlineStart || '0') +
      parseFloat(computedStyle.paddingInlineEnd || '0')
    : 0;
  const borders = computedStyle
    ? parseFloat(computedStyle.borderInlineStartWidth || '0') +
      parseFloat(computedStyle.borderInlineEndWidth || '0')
    : 0;

  return Math.ceil(entry.contentRect.width + paddings + borders);
}
