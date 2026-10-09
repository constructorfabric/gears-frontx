import { cx } from 'class-variance-authority';
import { TableHead } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useTableService } from '../table-context';
import { resolveLabel } from '../table-helpers';
import type { DataGridTableGroup } from '../table-types';
import styles from './data-grid-cell.module.css';
import headerStyles from './data-grid-header-cell.module.css';
import { DataGridHeaderCellContent } from './data-grid-header-cell-content';

interface DataGridHeaderGroupProps<TItem extends DataGridItem> {
  group: DataGridTableGroup<TItem>;
  colspan?: number;
  className?: string;
}

export function DataGridHeaderGroup<TItem extends DataGridItem>({
  group,
  colspan,
  className,
}: DataGridHeaderGroupProps<TItem>) {
  const tableService = useTableService<TItem>();

  const stickyOffset = tableService.useGroupStickyOffset(group.id);
  const stickyHeader = tableService.useStickyHeader();
  const isSticky = stickyOffset !== undefined;

  const GroupContent = group.component;

  const content = GroupContent ? (
    <GroupContent group={group} />
  ) : (
    <DataGridHeaderCellContent>{resolveLabel(group.label)}</DataGridHeaderCellContent>
  );

  return (
    <TableHead
      className={cx(
        styles.cell,
        headerStyles.headerCell,
        isSticky && styles.stickyCell,
        stickyHeader && styles.stickyHeaderCell,
        className,
      )}
      style={isSticky ? { position: 'sticky', insetInlineStart: `${stickyOffset}px` } : undefined}
      scope="col"
      colSpan={colspan}
    >
      {content}
    </TableHead>
  );
}
