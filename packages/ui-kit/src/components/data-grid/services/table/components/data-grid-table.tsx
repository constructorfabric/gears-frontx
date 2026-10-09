import { cx } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { Table } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useTableService } from '../table-context';
import type { DataGridTableLayout } from '../table-types';
import styles from './data-grid-table.module.css';
import { DataGridTableBody } from './data-grid-table-body';
import { DataGridTableHeader } from './data-grid-table-header';
import { DataGridTableSlot } from './data-grid-table-slot';

const layoutClassMap: Record<DataGridTableLayout, string> = {
  fixed: styles.layoutFixed,
  auto: styles.layoutAuto,
};

export function DataGridTable<TItem extends DataGridItem>() {
  const tableService = useTableService<TItem>();

  const hasGroups = tableService.useHasGroups();
  const subheaderSlots = tableService.useSlots('subheader');
  const footerSlots = tableService.useSlots('footer');
  const tableLayout = tableService.useTableLayout();
  const stickyHeader = tableService.useStickyHeader();

  const ContentWrapper = tableService.useComponent<{ children?: ReactNode }>('content');

  return (
    // eslint-disable-next-line react-hooks/static-components -- ContentWrapper comes from the grid's component registry (a store lookup), so it is the same component on every render; the rule cannot see through the lookup.
    <ContentWrapper>
      <Table
        stickyHeader={stickyHeader}
        containerClassName={styles.tableWrapper}
        className={cx(styles.table, layoutClassMap[tableLayout], hasGroups && styles.tableBordered)}
      >
        <DataGridTableHeader />
        <DataGridTableSlot slots={subheaderSlots} />
        <DataGridTableBody />
        <DataGridTableSlot slots={footerSlots} />
      </Table>
    </ContentWrapper>
  );
}
