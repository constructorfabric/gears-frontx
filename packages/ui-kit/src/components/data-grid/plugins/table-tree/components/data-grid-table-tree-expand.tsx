import { ChevronDownIcon } from 'lucide-react';
import { Button } from '../../../../button/public.js';
import type { DataGridItem } from '../../../data-grid-types';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import { IGNORE_CLICK_ATTRIBUTE } from '../../../services/table/ignore-row-click';
import { useDataGridRecord } from '../../../services/table/data-grid-record-context';
import type { DataGridTableTreePluginApi } from '../table-tree-types';
import styles from './data-grid-table-tree.module.css';

export function DataGridTableTreeExpand<TItem extends DataGridItem>() {
  const grid = useDataGrid<TItem>();
  const record = useDataGridRecord<TItem>();
  const treePlugin = grid.getPlugin<DataGridTableTreePluginApi<TItem>>('tableTree')!;
  const isExpanded = treePlugin.useIsExpanded(record.id);
  const messages = useDataGridMessages();

  const iconClassName = isExpanded
    ? styles.expandIcon
    : `${styles.expandIcon} ${styles.expandIconCollapsed}`;

  return (
    <div className={styles.expand} {...{ [IGNORE_CLICK_ATTRIBUTE]: '' }}>
      <Button
        variant="ghost"
        size="sm"
        className={styles.toggle}
        icon={<ChevronDownIcon className={iconClassName} />}
        // The name says what the press does and `aria-expanded` says where the row stands: the
        // icon alone says neither.
        aria-label={isExpanded ? messages.tableTree.collapse : messages.tableTree.expand}
        aria-expanded={isExpanded}
        onClick={() => treePlugin.toggle(record.id)}
      />
    </div>
  );
}
