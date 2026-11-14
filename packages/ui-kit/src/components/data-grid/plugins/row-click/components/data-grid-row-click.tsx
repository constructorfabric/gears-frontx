import type { KeyboardEvent } from 'react';
import { TableRow } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useDataGridContext } from '../../../services/core/data-grid-context';
import type { DataGridRecord } from '../../../services/storage/storage-types';
import { DataGridCell } from '../../../services/table/components/data-grid-cell';
import { DataGridExtraBodyColumns } from '../../../services/table/components/data-grid-extra-body-columns';
import { DataGridTableSlot } from '../../../services/table/components/data-grid-table-slot';
import { DataGridRecordProvider } from '../../../services/table/data-grid-record-context';
import { resolveBodyCellProps } from '../../../services/table/resolve-body-cell-props';
import type { DataGridTableColumn } from '../../../services/table/table-types';
import type { DataGridRowClickPluginApi } from '../row-click-plugin';
import { getClickListener } from '../row-click-utils';
import styles from './data-grid-row-click.module.css';

interface DataGridRowClickProps<TItem extends DataGridItem> {
  record: DataGridRecord<TItem>;
}

export function DataGridRowClick<TItem extends DataGridItem>({
  record,
}: DataGridRowClickProps<TItem>) {
  // Uses useDataGridContext (not useTableService) because we need both context.table and context.plugins
  const context = useDataGridContext<TItem>();
  const tableService = context.table;
  const columns = tableService.useVisibleColumns();
  const tableLayout = tableService.useTableLayout();
  const rowAfterSlots = tableService.useSlots('row-after');
  const rowClickApi = context.plugins.getPlugin<DataGridRowClickPluginApi<TItem>>('rowClick');

  const onClick = getClickListener(record.item, () => rowClickApi?.click);
  const onDblClick = getClickListener(record.item, () => rowClickApi?.dblclick);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      onClick(event);
    }
  };

  const BodyCellContent = tableService.useComponent<{ column: DataGridTableColumn<TItem>; item: TItem }>(
    'body-cell-content',
  );

  return (
    <DataGridRecordProvider value={record}>
      <TableRow
        className={styles.clickableRow}
        tabIndex={0}
        onClick={onClick}
        onDoubleClick={onDblClick}
        onKeyDown={onKeyDown}
      >
        <DataGridExtraBodyColumns position="start" />
        {columns.map((col) => {
          const dynamicClassName = col.getClassName?.(record.item);
          const bodyCellProps = resolveBodyCellProps(col, record.item, tableLayout);

          return (
            <DataGridCell<TItem>
              key={col.id}
              columnId={col.id}
              className={dynamicClassName}
              {...bodyCellProps}
            >
              <BodyCellContent column={col} item={record.item} />
            </DataGridCell>
          );
        })}
        <DataGridExtraBodyColumns position="end" />
      </TableRow>
      <DataGridTableSlot slots={rowAfterSlots} />
    </DataGridRecordProvider>
  );
}
