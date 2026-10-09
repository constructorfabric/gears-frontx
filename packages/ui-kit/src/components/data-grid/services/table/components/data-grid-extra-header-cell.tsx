import type { ReactNode } from 'react';
import { cx } from 'class-variance-authority';
import type { DataGridItem } from '../../../data-grid-types';
import { useTableService } from '../table-context';
import type { ExtraColumn } from '../table-types';
import { DataGridCell } from './data-grid-cell';
import cellStyles from './data-grid-cell.module.css';
import styles from './data-grid-header-cell.module.css';
import { DataGridHeaderCellContent } from './data-grid-header-cell-content';

interface DataGridExtraHeaderCellProps {
  column: ExtraColumn;
  rowspan?: number;
  className?: string;
  children?: ReactNode;
}

export function DataGridExtraHeaderCell<TItem extends DataGridItem>({
  column,
  rowspan,
  className,
  children,
}: DataGridExtraHeaderCellProps) {
  const tableService = useTableService<TItem>();
  const stickyHeader = tableService.useStickyHeader();

  return (
    <DataGridCell<TItem>
      header
      columnId={column.id}
      className={cx(styles.extraHeaderCell, stickyHeader && cellStyles.stickyHeaderCell, className)}
      width={column.width}
      rowspan={rowspan}
      ignoreRowClick={column.ignoreRowClick}
    >
      {children ? <DataGridHeaderCellContent>{children}</DataGridHeaderCellContent> : null}
    </DataGridCell>
  );
}
