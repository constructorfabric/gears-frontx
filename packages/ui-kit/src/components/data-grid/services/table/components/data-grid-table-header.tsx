import { useEffect, useRef } from 'react';
import { cx } from 'class-variance-authority';
import { TableHeader, TableRow } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useTableService } from '../table-context';
import type { DataGridTableColumn, DataGridTableGroup } from '../table-types';
import { DataGridExtraHeaderColumns } from './data-grid-extra-header-columns';
import { DataGridHeaderCell } from './data-grid-header-cell';
import { DataGridHeaderGroup } from './data-grid-header-group';
import styles from './data-grid-table-header.module.css';

export function DataGridTableHeader<TItem extends DataGridItem>() {
  const tableService = useTableService<TItem>();
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const hasGroups = tableService.useHasGroups();
  const stickyHeader = tableService.useStickyHeader();
  const firstRowCells = tableService.useFirstRowHeaderCells();
  const secondRowColumns = tableService.useSecondRowHeaderColumns();
  const headerCellEndSlots = tableService.useSlots('header-cell-end');

  // Set up shared ResizeObserver for all header cells
  useEffect(() => {
    const thead = theadRef.current;
    if (!thead) return;

    observerRef.current = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { columnId } = (entry.target as HTMLElement).dataset;
        if (columnId) {
          const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
          tableService.onResizeColumn(columnId, width);
        }
      }
    });

    const cells = thead.querySelectorAll<HTMLElement>('[data-column-id]');
    for (const cell of cells) {
      observerRef.current.observe(cell);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [tableService, firstRowCells, secondRowColumns]);

  return (
    <TableHeader
      ref={theadRef}
      className={cx(stickyHeader && hasGroups && styles.theadSticky)}
    >
      <TableRow>
        <DataGridExtraHeaderColumns<TItem> position="start" isGroupRow />

        {firstRowCells.map((cell) => {
          if (cell.type === 'group') {
            const group = cell.item as DataGridTableGroup<TItem>;
            return (
              <DataGridHeaderGroup<TItem> key={group.id} group={group} colspan={cell.colspan} />
            );
          }

          const column = cell.item as DataGridTableColumn<TItem>;
          return (
            <DataGridHeaderCell<TItem>
              key={column.id}
              column={column}
              rowspan={cell.rowspan}
              headerCellEndSlots={headerCellEndSlots}
            />
          );
        })}

        <DataGridExtraHeaderColumns<TItem> position="end" isGroupRow />
      </TableRow>

      {/* Second row for grouped columns */}
      {hasGroups && secondRowColumns.length > 0 && (
        <TableRow>
          {secondRowColumns.map((column) => (
            <DataGridHeaderCell<TItem>
              key={column.id}
              column={column}
              headerCellEndSlots={headerCellEndSlots}
            />
          ))}
        </TableRow>
      )}
    </TableHeader>
  );
}
