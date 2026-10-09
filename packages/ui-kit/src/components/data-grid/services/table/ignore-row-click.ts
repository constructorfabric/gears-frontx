/*
 * Marks a cell that a plugin reacting to row clicks must not treat as a row click. It lives in the
 * core because the cell renderer stamps it, and the core's entry must not import a plugin to do
 * that (see `services/layout/layout-slot-ids.ts` for the same split).
 */
export const IGNORE_CLICK_ATTRIBUTE = 'data-grid-row-ignore-click';
