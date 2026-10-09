import { TableBody } from '../../../../table/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useDataGrid } from '../../core/data-grid-context';
import { DataGridTableRecords } from './data-grid-table-records';

export function DataGridTableBody<TItem extends DataGridItem>() {
  const grid = useDataGrid<TItem>();
  const rootSections = grid.useStore((s) => s.rootSections);

  return (
    <>
      {rootSections.map((section) => (
        <TableBody key={section.id}>
          <DataGridTableRecords<TItem> records={section.records} />
        </TableBody>
      ))}
    </>
  );
}
