import { messages } from '../../../messages';
import type { DataGridItem } from '../../../data-grid-types';
import { useDataGrid } from '../../../services/core/data-grid-context';
import type { DataGridTableColumn } from '../../../services/table/table-types';
import type { DataGridOrderPluginApi } from '../order-types';
import styles from './data-grid-order-header-cell-label.module.css';

interface DataGridOrderHeaderCellLabelProps<TItem extends DataGridItem> {
  column: DataGridTableColumn<TItem>;
}

export function DataGridOrderHeaderCellLabel<TItem extends DataGridItem>({
  column,
}: DataGridOrderHeaderCellLabelProps<TItem>) {
  const grid = useDataGrid<TItem>();
  const orderApi = grid.getPlugin<DataGridOrderPluginApi>('order')!;

  const isOrderable = !orderApi.useIsColumnExcluded(column.id);
  const label = typeof column.label === 'function' ? column.label() : column.label;

  if (!isOrderable) {
    return <span>{label}</span>;
  }

  return (
    <button
      type="button"
      className={styles.orderLabel}
      aria-label={messages.order.changeSorting(label)}
      onClick={() => orderApi.toggleOrder(column.id)}
    >
      {label}
    </button>
  );
}
