import type { DataGridItem } from '../../../data-grid-types';
import type { DataGridRecord } from '../../storage/storage-types';
import { useTableService } from '../table-context';

interface DataGridTableRecordProps<TItem extends DataGridItem> {
  record: DataGridRecord<TItem>;
}

export function DataGridTableRecord<TItem extends DataGridItem>({
  record,
}: DataGridTableRecordProps<TItem>) {
  const tableService = useTableService<TItem>();
  const RowComponent = tableService.useComponent<DataGridTableRecordProps<TItem>>('row');

  // eslint-disable-next-line react-hooks/static-components -- RowComponent comes from the grid's component registry (a store lookup), so it is the same component on every render; the rule cannot see through the lookup.
  return <RowComponent record={record} />;
}
