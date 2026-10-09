import { createContext, useContext } from 'react';
import type { DataGridItem } from '../../data-grid-types';
import type { DataGridRecord } from '../storage/storage-types';

const DataGridRecordContext = createContext<DataGridRecord | null>(null);

export const DataGridRecordProvider = DataGridRecordContext.Provider;

export function useDataGridRecord<
  TItem extends DataGridItem = DataGridItem,
>(): DataGridRecord<TItem> {
  const record = useContext(DataGridRecordContext);
  if (!record) {
    throw new Error('useDataGridRecord must be used within a DataGridRow');
  }
  return record as DataGridRecord<TItem>;
}
