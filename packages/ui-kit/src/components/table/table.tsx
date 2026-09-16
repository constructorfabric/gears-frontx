'use client';

import { cva, cx, type VariantProps } from 'class-variance-authority';
import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import styles from './table.module.css';

/*
 * Resize behaviour constants. These are not style values: they decide how
 * the drag RESPONDS, not how anything looks, so they live here rather than
 * as unexplained numbers in the stylesheet. All four are the design spec's
 * own.
 */
/** How far one arrow-key press moves the boundary. */
const KEYBOARD_STEP = 12;
/** The grab area straddling the column's trailing edge, half on each side. */
const HANDLE_WIDTH = 8;
/** A column carrying text needs room for a word. */
const MIN_WIDTH_WITH_TEXT = 72;
/** One carrying only a control (a checkbox, a row action) does not. */
const MIN_WIDTH_WITHOUT_TEXT = 32;

function headerCellsOf(cell: HTMLTableCellElement): HTMLTableCellElement[] {
  return Array.from(cell.parentElement?.children ?? []).filter(
    (child): child is HTMLTableCellElement => child instanceof HTMLTableCellElement,
  );
}

function minWidthOf(cell: HTMLTableCellElement, override: number | undefined): number {
  if (override !== undefined) {
    return override;
  }
  return cell.textContent?.trim() ? MIN_WIDTH_WITH_TEXT : MIN_WIDTH_WITHOUT_TEXT;
}

/*
 * The first drag freezes every column at the width it currently renders and
 * switches the table to a fixed layout. Without that the browser keeps
 * re-deriving every column from its content, so widening one column silently
 * reflows the rest and the drag does not hold.
 */
function freezeColumns(cell: HTMLTableCellElement): HTMLTableCellElement[] {
  const cells = headerCellsOf(cell);
  const table = cell.closest('table');
  if (table && table.style.tableLayout !== 'fixed') {
    for (const column of cells) {
      column.style.width = `${Math.round(column.getBoundingClientRect().width)}px`;
    }
    table.style.tableLayout = 'fixed';
  }
  return cells;
}

/*
 * A column resizes against its TRAILING neighbour: the pair's combined width
 * is what stays constant, so dragging a boundary never changes the table's
 * own width. The last column has no neighbour to trade with, and there the
 * table's width is what gives.
 */
function applyWidths(
  cells: HTMLTableCellElement[],
  index: number,
  selfStart: number,
  neighbourStart: number | null,
  delta: number,
  minSelf: number,
  minNeighbour: number,
): number {
  const self = cells[index];
  if (!self) {
    return selfStart;
  }
  const neighbour = neighbourStart === null ? null : cells[index + 1];
  const ceiling =
    neighbourStart === null || !neighbour
      ? Number.POSITIVE_INFINITY
      : selfStart + neighbourStart - minNeighbour;
  const next = Math.round(Math.min(Math.max(selfStart + delta, minSelf), ceiling));
  self.style.width = `${next}px`;
  if (neighbour && neighbourStart !== null) {
    neighbour.style.width = `${selfStart + neighbourStart - next}px`;
  }
  return next;
}

interface DragState {
  pointerId: number;
  startX: number;
  cells: HTMLTableCellElement[];
  index: number;
  selfStart: number;
  neighbourStart: number | null;
  minSelf: number;
  minNeighbour: number;
}

interface TableColumnResizerProps {
  minWidth?: number;
}

/*
 * The trailing-edge resize handle. Rendered inside its own <th>, which is
 * what it measures and resizes; the geometry it needs from JS (the grab
 * width and its half-overhang) comes from HANDLE_WIDTH above, and the
 * hairline it draws is the stylesheet's.
 */
function TableColumnResizer({ minWidth }: TableColumnResizerProps) {
  const handleRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [columnName, setColumnName] = useState('');
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    setColumnName(handleRef.current?.closest('th')?.textContent?.trim() ?? '');
  }, []);

  /*
   * The cursor and the text selection are locked for the DURATION of the
   * drag, not for the pointer's position: without it, dragging past the
   * handle turns the pointer back into a caret and starts selecting the
   * header labels it crosses.
   */
  const lockPage = (locked: boolean) => {
    document.body.style.cursor = locked ? 'col-resize' : '';
    document.body.style.userSelect = locked ? 'none' : '';
  };

  /*
   * Pointer capture is what keeps the drag alive once the pointer leaves
   * the 8px handle, but it is not what the drag depends on: a pointer id
   * the platform does not consider active throws, and the drag still has to
   * work. Both calls are therefore best-effort, and the drag's own state is
   * the ref above.
   */
  const capturePointer = (handle: HTMLSpanElement, pointerId: number, capture: boolean) => {
    try {
      if (capture) {
        handle.setPointerCapture(pointerId);
      } else if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
    } catch {
      // No capture to take or give back; the drag is unaffected either way.
    }
  };

  const endDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    lockPage(false);
    const handle = handleRef.current;
    if (drag && handle) {
      capturePointer(handle, drag.pointerId, false);
    }
  }, []);

  // Releases the lock if the header unmounts mid-drag: the page would
  // otherwise keep the resize cursor and the suppressed selection forever.
  useEffect(() => endDrag, [endDrag]);

  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const cell = event.currentTarget.closest('th');
    if (!(cell instanceof HTMLTableCellElement) || event.button !== 0) {
      return;
    }
    const cells = freezeColumns(cell);
    const index = cells.indexOf(cell);
    const neighbour = cells[index + 1] ?? null;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      cells,
      index,
      selfStart: cell.getBoundingClientRect().width,
      neighbourStart: neighbour ? neighbour.getBoundingClientRect().width : null,
      minSelf: minWidthOf(cell, minWidth),
      minNeighbour: neighbour ? minWidthOf(neighbour, undefined) : 0,
    };
    capturePointer(event.currentTarget, event.pointerId, true);
    lockPage(true);
    setWidth(Math.round(dragRef.current.selfStart));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setWidth(
      applyWidths(
        drag.cells,
        drag.index,
        drag.selfStart,
        drag.neighbourStart,
        event.clientX - drag.startX,
        drag.minSelf,
        drag.minNeighbour,
      ),
    );
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    const step =
      event.key === 'ArrowLeft' ? -KEYBOARD_STEP : event.key === 'ArrowRight' ? KEYBOARD_STEP : 0;
    if (step === 0) {
      return;
    }
    const cell = event.currentTarget.closest('th');
    if (!(cell instanceof HTMLTableCellElement)) {
      return;
    }
    event.preventDefault();
    const cells = freezeColumns(cell);
    const index = cells.indexOf(cell);
    const neighbour = cells[index + 1] ?? null;
    setWidth(
      applyWidths(
        cells,
        index,
        cell.getBoundingClientRect().width,
        neighbour ? neighbour.getBoundingClientRect().width : null,
        step,
        minWidthOf(cell, minWidth),
        neighbour ? minWidthOf(neighbour, undefined) : 0,
      ),
    );
  };

  return (
    <span
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label={`${columnName || 'Column'} width${width === null ? '' : `, ${width} pixels`}`}
      tabIndex={0}
      className={styles.columnResizer}
      style={{ width: HANDLE_WIDTH, insetInlineEnd: -HANDLE_WIDTH / 2 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    />
  );
}

/*
 * Table has no Base UI primitive (registry/base-vega ships plain native
 * elements with data-slot markers, this kit drops data-slot everywhere —
 * see card.tsx) — pure styling translation over native `<table>` markup,
 * per design-notes.md: a composite data-table (sorting, filtering,
 * pagination, virtualisation, column defs) is deliberately out of scope
 * here. This is styled markup, nothing more.
 *
 * Table renders two elements, matching the source exactly: its own
 * horizontal-scroll wrapper div around the <table>, rather than asking
 * every consumer to remember to add one. A consumer who also wants a
 * *vertical* scroll region (e.g. capping a long table's height) wraps
 * their own div with `overflow-y` around <Table> — it composes fine, since
 * the two wrappers scroll orthogonal axes (see table.md).
 *
 * That wrapper is `tabIndex={0}`, a deliberate addition over the source,
 * which has none. A horizontally-overflowing region with no scrollbar
 * dragging alternative is otherwise unreachable from the keyboard (WCAG
 * 2.1.1) — a mouse/touch user can drag or swipe it, a keyboard-only user
 * cannot Tab to it and press the arrow keys, since a plain `div` isn't in
 * the tab order by default. This is unconditional rather than toggled on
 * only when the table actually overflows: detecting that needs a
 * ResizeObserver, which is exactly the behavior layer this "primitive
 * markup" component intentionally does not have. The trade-off is a table
 * that never overflows still gets one extra, functionless tab stop — minor
 * next to the alternative of a table that does overflow being silently
 * unreachable.
 *
 * A focus stop should announce something: `label` names the wrapper
 * (`role="region"` + `aria-label` — a bare div's aria-label is ignored
 * without a role, which is also why wrapping the Table yourself and
 * labelling that wrapper doesn't work: the name lands on a non-focusable
 * element while the focusable one stays nameless). Without `label` the
 * wrapper stays roleless and nameless as before — prefer passing it
 * whenever the surrounding page doesn't already make the table's purpose
 * obvious the moment focus lands.
 */
const tableVariants = cva(styles.table, {
  variants: {
    /*
     * `collection` is the spec's own guide word for the dense arrangement:
     * a fixed layout with a sticky header and tall, wrapping rows. The
     * density axis below is orthogonal to it and still applies.
     */
    variant: {
      default: styles.variantDefault,
      collection: styles.variantCollection,
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface TableProps extends ComponentProps<'table'>, VariantProps<typeof tableVariants> {
  /**
   * Accessible name for the focusable scroll wrapper around the table
   * (`role="region"` + `aria-label`). Announced when keyboard focus lands
   * on the wrapper; without it the stop announces nothing.
   */
  label?: string;
  /**
   * Cell metrics only — `compact` tightens row padding for operational
   * views (the mockups' Data Table density axis). Not a data-table
   * feature: no virtualization, no row model, purely the cells' padding.
   */
  density?: 'default' | 'compact';
}

export function Table({ className, label, density, variant, ...props }: TableProps) {
  return (
    <div
      className={styles.tableContainer}
      tabIndex={0}
      role={label === undefined ? undefined : 'region'}
      aria-label={label}
    >
      <table
        className={tableVariants({
          variant,
          className: cx(density === 'compact' && styles.densityCompact, className),
        })}
        {...props}
      />
    </div>
  );
}

export type TableHeaderProps = ComponentProps<'thead'>;

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <thead className={cx(styles.tableHeader, className)} {...props} />;
}

export type TableBodyProps = ComponentProps<'tbody'>;

export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody className={cx(styles.tableBody, className)} {...props} />;
}

export type TableFooterProps = ComponentProps<'tfoot'>;

export function TableFooter({ className, ...props }: TableFooterProps) {
  return <tfoot className={cx(styles.tableFooter, className)} {...props} />;
}

export type TableRowProps = ComponentProps<'tr'>;

export function TableRow({ className, ...props }: TableRowProps) {
  return <tr className={cx(styles.tableRow, className)} {...props} />;
}

export interface TableHeadProps extends ComponentProps<'th'> {
  /**
   * Renders a draggable, keyboard-resizable handle on the column's trailing
   * edge. Off by default: the spec's own default is on, but turning it on
   * here would make every column of every shipped table draggable without
   * the caller asking for it.
   */
  resizable?: boolean;
  /**
   * Pixel floor for this column while resizing, overriding the 72 / 32
   * defaults (72 for a column carrying text, 32 for one that does not).
   */
  resizeMinWidth?: number;
}

export function TableHead({
  className,
  resizable,
  resizeMinWidth,
  children,
  ...props
}: TableHeadProps) {
  return (
    <th className={cx(styles.tableHead, className)} {...props}>
      {children}
      {resizable ? <TableColumnResizer minWidth={resizeMinWidth} /> : null}
    </th>
  );
}

export type TableCellProps = ComponentProps<'td'>;

export function TableCell({ className, ...props }: TableCellProps) {
  return <td className={cx(styles.tableCell, className)} {...props} />;
}

/**
 * A table's accessible name/description, kept as a real semantic caption
 * regardless of where it's drawn — `.table`'s `caption-side: bottom` (see
 * table.module.css) only moves it visually below the rows; a `<caption>`
 * contributes to the table's accessibility tree the same way at either
 * position.
 */
export type TableCaptionProps = ComponentProps<'caption'>;

export function TableCaption({ className, ...props }: TableCaptionProps) {
  return <caption className={cx(styles.tableCaption, className)} {...props} />;
}
