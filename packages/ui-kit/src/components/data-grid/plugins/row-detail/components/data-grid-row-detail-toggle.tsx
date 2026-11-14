import { ChevronDownIcon } from 'lucide-react';
import { Button } from '../../../../button/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridRecord } from '../../../services/table/data-grid-record-context';
import type { DataGridRowDetailPluginApi } from '../row-detail-types';
import styles from './data-grid-row-detail.module.css';

export function DataGridRowDetailToggle<TItem extends DataGridItem>() {
  const grid = useDataGrid<TItem>();
  const record = useDataGridRecord<TItem>();
  const rowDetail = grid.getPlugin<DataGridRowDetailPluginApi<TItem>>('rowDetail')!;
  const isOpen = rowDetail.useIsOpen(record.id);

  // The name says what the press offers and `aria-expanded` says whether the row's detail is open;
  // the same name labels the group the press reveals.
  const name = rowDetail.useName(record.item);

  return (
    <div className={styles.toggleCell}>
      <Button
        variant="ghost"
        size="sm"
        className={styles.toggle}
        icon={
          <ChevronDownIcon
            className={isOpen ? styles.icon : `${styles.icon} ${styles.iconCollapsed}`}
          />
        }
        aria-label={name}
        aria-expanded={isOpen}
        // Closed means nowhere to point: the group exists only while the detail is open.
        aria-controls={isOpen ? rowDetail.regionId(record.id) : undefined}
        onClick={() => rowDetail.toggle(record.id)}
      />
    </div>
  );
}
