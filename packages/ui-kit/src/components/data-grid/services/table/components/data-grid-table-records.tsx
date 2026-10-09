import type { DataGridItem } from '../../../data-grid-types';
import type { DataGridRecord } from '../../storage/storage-types';
import { DataGridTableRecord } from './data-grid-table-record';

interface DataGridTableRecordsProps<TItem extends DataGridItem> {
  records: DataGridRecord<TItem>[];
}

export function DataGridTableRecords<TItem extends DataGridItem>({
  records,
}: DataGridTableRecordsProps<TItem>) {
  return (
    <>
      {records.map((record) => (
        <DataGridTableRecord<TItem> key={record.id} record={record} />
      ))}
    </>
  );
}
