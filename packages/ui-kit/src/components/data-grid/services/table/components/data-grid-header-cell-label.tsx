import type { DataGridItem } from '../../../data-grid-types';
import { resolveLabel } from '../table-helpers';
import type { DataGridTableColumn } from '../table-types';

interface DataGridHeaderCellLabelProps<TItem extends DataGridItem> {
  column: DataGridTableColumn<TItem>;
}

export function DataGridHeaderCellLabel<TItem extends DataGridItem>({
  column,
}: DataGridHeaderCellLabelProps<TItem>) {
  return <span>{resolveLabel(column.label)}</span>;
}
