import type { DataGridItem } from '../../data-grid-types';
import { useDataGridContext } from '../core/data-grid-context';
import type { TableService } from './table-types';

export function useTableService<
  TItem extends DataGridItem = DataGridItem,
>(): TableService<TItem> {
  return useDataGridContext<TItem>().table;
}
