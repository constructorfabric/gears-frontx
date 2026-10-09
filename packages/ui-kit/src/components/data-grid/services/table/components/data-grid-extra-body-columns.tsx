import type { DataGridItem } from '../../../data-grid-types';
import { useTableService } from '../table-context';
import type { ExtraColumnPosition } from '../table-types';
import { DataGridCell } from './data-grid-cell';

interface DataGridExtraBodyColumnsProps {
  position: ExtraColumnPosition;
}

export function DataGridExtraBodyColumns<TItem extends DataGridItem = DataGridItem>({
  position,
}: DataGridExtraBodyColumnsProps) {
  const tableService = useTableService<TItem>();
  const extraColumns = tableService.useExtraColumns(position);

  return (
    <>
      {extraColumns.map((extra) => (
        <DataGridCell
          key={extra.id}
          columnId={extra.id}
          width={extra.width}
          ignoreRowClick={extra.ignoreRowClick}
        >
          {extra.body ? <extra.body /> : null}
        </DataGridCell>
      ))}
    </>
  );
}
