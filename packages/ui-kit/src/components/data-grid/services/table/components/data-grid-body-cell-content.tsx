import type { DataGridItem } from '../../../data-grid-types';
import { getNestedValue, resolveCellDisplayValue } from '../table-helpers';
import type { DataGridTableColumn } from '../table-types';

interface DataGridBodyCellContentProps<TItem extends DataGridItem> {
  column: DataGridTableColumn<TItem>;
  item: TItem;
}

export function DataGridBodyCellContent<TItem extends DataGridItem>({
  column,
  item,
}: DataGridBodyCellContentProps<TItem>) {
  // Column-specific render function takes priority
  if (column.render) {
    if (typeof column.render === 'function') {
      return <>{column.render(item)}</>;
    }
    return <>{column.render}</>;
  }

  // Column-specific component
  if (column.component) {
    const CellComponent = column.component;
    const key = column.key ?? column.id;
    const value = key.includes('.') ? getNestedValue(item, key) : item[key];
    return <CellComponent item={item} column={column} value={value} />;
  }

  // Default: resolve value from key (shared with the `title` fallback in DataGridRow)
  return <>{resolveCellDisplayValue(column, item)}</>;
}
