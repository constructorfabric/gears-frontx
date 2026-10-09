import { CARDS_LAYOUT_SLOT_ID, TABLE_LAYOUT_SLOT_ID } from './layout-slot-ids';
import { useDataGridContext } from '../core/data-grid-context';

/**
 * Stable ids of the built-in DataGrid main views. Use these instead of hardcoding the raw slot-id
 * strings when reading or setting the active view (e.g. `grid.setActiveSlotId('main', DATA_GRID_VIEW.cards)`).
 */
export const DATA_GRID_VIEW = {
  table: TABLE_LAYOUT_SLOT_ID,
  cards: CARDS_LAYOUT_SLOT_ID,
} as const;

/** A built-in DataGrid main-view slot id. */
export type DataGridViewId = (typeof DATA_GRID_VIEW)[keyof typeof DATA_GRID_VIEW];

/**
 * Reactively read the id of the currently active DataGrid main view (e.g. the table view, or a cards view that a plugin registers).
 * Re-renders when the active view changes. Returns `undefined` before any main view is active.
 */
export function useDataGridActiveView(): string | undefined {
  const context = useDataGridContext();
  return context.layout.useLayoutStore((state) => state.activeSlotIds.get('main'));
}
