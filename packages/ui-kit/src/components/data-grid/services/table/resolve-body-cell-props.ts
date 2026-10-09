import type { CSSProperties } from 'react';
import type { DataGridItem } from '../../data-grid-types';
import { resolveColumnStyle } from './resolve-column-style';
import { resolveCellDisplayValue } from './table-helpers';
import type { DataGridTableColumn, DataGridTableColumnOverflow, DataGridTableLayout } from './table-types';

export interface ResolvedBodyCellProps {
  /** Content-cap CSS var(s) forwarded to `DataGridCell`'s `style` prop -- see `resolveColumnStyle`. */
  style: CSSProperties;
  /** Drives `DataGridCell`'s `data-overflow` attribute; defaults to `'wrap'` when unset on the column. */
  overflow: DataGridTableColumnOverflow;
  /** Whether a real, active `maxWidth` cap applies -- forwarded to `DataGridCell`'s `capped` prop. */
  capped: boolean;
  /** Stringified cell value for the native `title` tooltip, or `undefined` when there's none to show. */
  title: string | undefined;
}

/**
 * Single source of the per-cell overflow/width props a body row forwards to `DataGridCell`, kept
 * apart from `DataGridRow` so the derivation is pure and can be tested without rendering a row.
 *
 * Pure: `useTableLayout()` stays a hook call at each call site, its result passed in here.
 */
export function resolveBodyCellProps<TItem extends DataGridItem>(
  column: DataGridTableColumn<TItem>,
  item: TItem,
  tableLayout: DataGridTableLayout,
): ResolvedBodyCellProps {
  const overflow = column.cellOverflow ?? 'wrap';
  // Width lives on the header only -- the column already shares one track from there. Body cells
  // only need the content-cap var (auto mode + maxWidth) for their own per-row overflow wrapper.
  const { contentVars, isCapped } = resolveColumnStyle(column, tableLayout);
  // Custom `component`/`render` output can't be safely stringified -- the kit can't supply a
  // title fallback for it, so resolveCellDisplayValue returns undefined there. `nowrap` is the
  // clipping mode (single line, ellipsis on overflow) -- `wrap` never clips.
  const displayValue = overflow === 'nowrap' ? resolveCellDisplayValue(column, item) : undefined;
  // An empty stringified value (e.g. `null`) must not become an empty `title=""` attribute --
  // only set `title` when there's real content to show.
  const title = displayValue ? displayValue : undefined;

  return { style: contentVars, overflow, capped: isCapped, title };
}
