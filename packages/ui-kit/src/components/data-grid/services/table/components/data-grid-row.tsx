import { TableRow } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import type { DataGridRecord } from '../../storage/storage-types';
import { DataGridRecordProvider } from '../data-grid-record-context';
import { resolveBodyCellProps } from '../resolve-body-cell-props';
import { useTableService } from '../table-context';
import type { DataGridTableColumn } from '../table-types';
import { DataGridCell } from './data-grid-cell';
import { DataGridExtraBodyColumns } from './data-grid-extra-body-columns';

interface DataGridRowProps<TItem extends DataGridItem> {
  record: DataGridRecord<TItem>;
}

export function DataGridRow<TItem extends DataGridItem>({ record }: DataGridRowProps<TItem>) {
  const tableService = useTableService<TItem>();
  const columns = tableService.useVisibleColumns();
  const tableLayout = tableService.useTableLayout();

  const BodyCellContent = tableService.useComponent<{ column: DataGridTableColumn<TItem>; item: TItem }>(
    'body-cell-content',
  );

  return (
    <DataGridRecordProvider value={record}>
      <TableRow>
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
    </DataGridRecordProvider>
  );
}
