import type { DataGridItem } from '../../data-grid-types';
import type { DataGridDataKey, DataGridItemId } from './storage-types';

export function getItemKeyValue<TItem extends DataGridItem = DataGridItem>(
  item: TItem,
  key: DataGridDataKey<TItem>,
) {
  if (typeof key === 'string') {
    if (!(key in item)) {
      throw new Error(`Key "${key}" not found in item ${JSON.stringify(item)}`);
    }
    return item[key] as DataGridItemId;
  }

  return key(item);
}
