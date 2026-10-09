import type { CSSProperties, ReactNode, Ref } from 'react';
import { cx } from 'class-variance-authority';
import { TableCell, TableHead } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { IGNORE_CLICK_ATTRIBUTE } from '../ignore-row-click';
import { useTableService } from '../table-context';
import type { DataGridTableColumnOverflow } from '../table-types';
import styles from './data-grid-cell.module.css';

interface DataGridCellProps {
  columnId: string;
  rowspan?: number;
  className?: string;
  style?: CSSProperties;
  width?: string | number;
  children?: ReactNode;
  /** Renders a column header (`<th>`) instead of a body cell (`<td>`). */
  header?: boolean;
  /**
   * Rendered after the overflow-controlled content, outside its clipping contract — used by
   * header cells for the sort-icon / header-cell-end slot, which must stay visible even when the
   * label ellipsizes. Body cells don't pass this.
   */
  endSlot?: ReactNode;
  /** Drives the shared `data-overflow` attribute that both header and body overflow CSS key off. */
  overflow?: DataGridTableColumnOverflow;
  /**
   * Whether `resolveColumnStyle` resolved a real, active `maxWidth` cap for this column (only
   * possible under `tableLayout="auto"`). Drives `data-capped`, which the overflow CSS uses to
   * enforce the cap for `wrap` too -- `nowrap` already reads the cap var directly (mode-agnostic)
   * -- so the column never grows past `maxWidth` regardless of how it wraps.
   */
  capped?: boolean;
  title?: string;
  /**
   * Ref onto the `.contentRow` wrapper -- used by `DataGridHeaderCell` to measure a
   * `width: 'min-content'` column's natural content width, under either `tableLayout` (its own
   * `inline-size: min-content` CSS below makes it shrink-wrap regardless of whatever width the
   * `<th>` itself ends up with, so it's a safe, unstretched measurement target -- see
   * `DataGridHeaderCell` for the ResizeObserver that reads it). Only rendered when `endSlot` is
   * passed, which header cells always do; body cells never pass this ref.
   */
  contentRowRef?: Ref<HTMLSpanElement>;
  /**
   * Whether this header cell's content should fill `.contentRow` instead of shrink-wrapping it,
   * via `data-header-fill` (see data-grid-cell.module.css). Set by `DataGridHeaderCell` only for a
   * custom `headerComponent` (e.g. a select-all checkbox) on a non-min-content column -- that kind
   * of header needs to fill/center like a body cell rather than hug its own min-content width the
   * way a default text label does. Body cells and min-content columns never set this (a min-content
   * column's `.contentRow` doubles as its ResizeObserver measurement target and must keep
   * shrink-wrapping).
   */
  fillContent?: boolean;
  /**
   * When `true`, stamps `data-grid-row-ignore-click` onto the cell element so a plugin that reacts
   * to row clicks can skip clicks anywhere in the cell. Set by extra columns that opt out of row
   * clicks (e.g. a column holding a checkbox).
   */
  ignoreRowClick?: boolean;
}

// A bare number, or a string holding one, is a pixel width; anything else (`%`, `rem`) is already
// a CSS length.
function normalizeWidth(width: string | number | undefined): string | undefined {
  if (width == null) return undefined;
  if (typeof width === 'number') return `${width}px`;
  return !isNaN(Number(width)) ? `${width}px` : width;
}

export function DataGridCell<TItem extends DataGridItem = DataGridItem>({
  columnId,
  rowspan,
  className,
  style,
  width,
  children,
  header,
  endSlot,
  overflow,
  capped,
  title,
  contentRowRef,
  fillContent,
  ignoreRowClick,
}: DataGridCellProps) {
  const tableService = useTableService<TItem>();

  const stickyOffset = tableService.useColumnStickyOffset(columnId);
  const endStickyOffset = tableService.useColumnEndStickyOffset(columnId);

  const isSticky = stickyOffset !== undefined;
  // Extra columns are never in the table's own sticky map, so a pinned `end` column can only ever
  // be one of these two, never both -- it pins to the opposite edge and stays out of the
  // start-side run rather than being parked against it.
  const isStickyEnd = endStickyOffset !== undefined;

  const content = <span className={styles.content}>{children}</span>;
  const Cell = header ? TableHead : TableCell;
  const normalizedWidth = normalizeWidth(width);

  return (
    <Cell
      data-column-id={columnId}
      data-overflow={overflow}
      data-capped={capped || undefined}
      data-header-fill={fillContent || undefined}
      {...(ignoreRowClick && { [IGNORE_CLICK_ATTRIBUTE]: '' })}
      title={title}
      className={cx(styles.cell, (isSticky || isStickyEnd) && styles.stickyCell, className)}
      style={{
        ...style,
        ...(normalizedWidth ? { width: normalizedWidth } : {}),
        ...(isSticky ? { position: 'sticky', insetInlineStart: `${stickyOffset}px` } : {}),
        ...(isStickyEnd ? { position: 'sticky', insetInlineEnd: `${endStickyOffset}px` } : {}),
      }}
      scope={header ? 'col' : undefined}
      rowSpan={rowspan}
    >
      {endSlot ? (
        <span className={styles.contentRow} ref={contentRowRef}>
          {content}
          <span className={styles.endSlot}>{endSlot}</span>
        </span>
      ) : (
        content
      )}
    </Cell>
  );
}
