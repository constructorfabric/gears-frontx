import { useEffect, useRef } from 'react';
import { cx } from 'class-variance-authority';
import type { DataGridItem } from '../../../data-grid-types';
import { resolveColumnStyle } from '../resolve-column-style';
import { useTableService } from '../table-context';
import { resolveLabel } from '../table-helpers';
import { measureMinContentWidth } from '../table-min-content-width';
import type { DataGridTableColumn, TableSlot } from '../table-types';
import { DataGridCell } from './data-grid-cell';
import cellStyles from './data-grid-cell.module.css';
import styles from './data-grid-header-cell.module.css';

interface DataGridHeaderCellProps<TItem extends DataGridItem> {
  column: DataGridTableColumn<TItem>;
  rowspan?: number;
  headerCellEndSlots: TableSlot[];
  className?: string;
}

export function DataGridHeaderCell<TItem extends DataGridItem>({
  column,
  rowspan,
  headerCellEndSlots,
  className,
}: DataGridHeaderCellProps<TItem>) {
  const tableService = useTableService<TItem>();
  const contentRowRef = useRef<HTMLSpanElement>(null);

  const LabelComponent = tableService.useComponent<{ column: DataGridTableColumn<TItem> }>('header-cell-label');
  const tableLayout = tableService.useTableLayout();
  const stickyHeader = tableService.useStickyHeader();
  const minContentWidth = tableService.useMinContentWidth(column.id);

  const content = column.headerComponent ? (
    <column.headerComponent column={column} />
  ) : (
    // eslint-disable-next-line react-hooks/static-components -- LabelComponent comes from the grid's component registry (a store lookup), so it is the same component on every render; the rule cannot see through the lookup.
    <LabelComponent column={column} />
  );

  const configuredHeaderOverflow = column.headerOverflow ?? 'nowrap';
  // Measured under both `tableLayout` modes -- `resolveColumnStyle` applies the result as this
  // column's `auto` size or its `fixed` track respectively (see its own doc for the branch).
  const isMinContentColumn = column.width === 'min-content';
  // A min-content column is, by definition, exactly as wide as its content needs -- there's
  // nothing to truncate. Disabling the ellipsis/nowrap overflow here also keeps `.contentRow`
  // unconstrained by the `max-inline-size: 100%` the nowrap CSS would otherwise apply (see
  // data-grid-cell.module.css), so the measurement effect below reads its true natural width
  // instead of one clamped to whatever width the column happens to have before the first
  // measurement lands. `title` still follows the column's actual configured overflow (below),
  // independent of this internal measurement-mode override.
  const cellOverflow = isMinContentColumn ? undefined : configuredHeaderOverflow;
  const { headerStyle, contentVars, isCapped } = resolveColumnStyle(
    column,
    tableLayout,
    minContentWidth,
  );
  // A custom headerComponent can render anything -- the kit can't stringify it for a title
  // fallback, so the consumer is responsible for their own (documented on DataGridTableColumn).
  // `nowrap` is the clipping mode (single line, ellipsis on overflow) -- `wrap` never clips.
  const title =
    !column.headerComponent && configuredHeaderOverflow === 'nowrap'
      ? resolveLabel(column.label)
      : undefined;
  // A custom headerComponent (e.g. a select-all checkbox) needs to fill/center like a body cell,
  // not shrink-wrap to its own min-content width the way a default text label does -- see
  // `fillContent`'s doc on `DataGridCell`. `headerCellEndSlots` is table-wide (non-empty for every
  // column once a plugin like order registers a slot, even though `DataGridOrderIcon` only
  // renders for the one actively-sorted column), so it's the wrong signal for this: gating on it
  // would leave a custom header shrink-wrapped on any grid where such a plugin is registered.
  // `column.headerComponent` doesn't depend on which plugins are registered, so it handles both
  // the no-plugin and the with-plugin cases the same way. Excluded for min-content columns, whose
  // `.contentRow` must keep shrink-wrapping to stay an accurate ResizeObserver measurement target.
  // Edge case: a custom header on the actively-sorted column still gets a real end slot (the sort
  // arrow), which then sits at the filled row's far end instead of snug against the label --
  // accepted as a minor cosmetic tradeoff.
  const fillContent = Boolean(column.headerComponent) && !isMinContentColumn;

  // Measures `.contentRow`'s own natural (`inline-size: min-content`) width whenever it changes
  // and stores it as this column's resolved width (`resolveColumnStyle` reads it back above --
  // under `auto` as the column's size, under `fixed` as its shared track). This does not loop:
  // `.contentRow` renders at its own min-content size regardless of the `<th>`'s allocated width
  // -- under `auto` because a browser's auto table-layout algorithm doesn't stretch or shrink an
  // ordinary `inline-size: min-content` child to match its ancestor cell, and under `fixed`
  // because the `<th>`'s box (sized by the fixed track algorithm from the *header row*, before
  // any of this observer's writes land) never forces an ordinary content child to match it either
  // -- a `<th>` wider than its content just leaves the child at its own size. So applying the
  // measured width to the `<th>` never changes what this observer sees on a later fire, in either
  // mode; `setMinContentWidth` also skips the store write (and the re-render that would otherwise
  // trigger another observer callback) when the measured value hasn't changed. A genuine
  // ResizeObserver (not a one-off measurement at mount) also means this re-measures correctly if
  // CSS lands after mount (e.g. a consumer's prod bundle injecting a stylesheet `<link>`
  // post-mount), since that changes `.contentRow`'s rendered size and
  // re-fires the observer.
  useEffect(() => {
    if (!isMinContentColumn) return;

    const contentRow = contentRowRef.current;
    if (!contentRow) return;

    const cell = contentRow.closest('th, td');

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      tableService.setMinContentWidth(column.id, measureMinContentWidth(entry, cell));
    });
    observer.observe(contentRow);

    return () => observer.disconnect();
  }, [isMinContentColumn, column.id, tableService]);

  return (
    <DataGridCell
      header
      columnId={column.id}
      className={cx(styles.headerCell, stickyHeader && cellStyles.stickyHeaderCell, className)}
      style={{ ...headerStyle, ...contentVars }}
      rowspan={rowspan}
      overflow={cellOverflow}
      // Same measurement rationale as `cellOverflow` above: `[data-capped] .contentRow` also
      // clamps to `max-inline-size: 100%`, which would re-clamp the measurement target to the
      // `<th>`'s current (possibly stale/narrow) width -- suppressing it here keeps the
      // ResizeObserver reading the column's true natural width. Body cells are unaffected: they
      // resolve their own `capped` independently via `resolveBodyCellProps`.
      capped={isMinContentColumn ? undefined : isCapped}
      title={title}
      contentRowRef={isMinContentColumn ? contentRowRef : undefined}
      fillContent={fillContent}
      endSlot={headerCellEndSlots.map((slot) => {
        const SlotComponent = slot.component;
        return <SlotComponent key={slot.id} column={column} />;
      })}
    >
      {content}
    </DataGridCell>
  );
}
