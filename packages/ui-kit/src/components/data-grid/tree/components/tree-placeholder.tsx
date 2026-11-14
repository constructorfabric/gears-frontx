import { DropdownMenuItem } from '../../../dropdown-menu/public.js';
import { useDataGridMessages } from '../../services/core/data-grid-messages-context';
import type { DataGridTreeItem } from '../../tree-structure/tree-structure-types';
import { useTreeContext } from '../services/core/tree-context';
import { TreeLeftSlot } from './tree-left-slot';
import styles from './tree-placeholder.module.css';

export interface TreePlaceholderProps<TItem extends DataGridTreeItem> {
  parent: TItem | null;
}

export function TreePlaceholder<TItem extends DataGridTreeItem = DataGridTreeItem>({
  parent,
}: TreePlaceholderProps<TItem>) {
  const { layout } = useTreeContext<TItem>();
  const messages = useDataGridMessages();
  const placeholderSlots = layout.useSlots('placeholder');
  const PlaceholderComponent = placeholderSlots[0]?.component;

  return (
    <DropdownMenuItem disabled className={styles.treePlaceholder}>
      <TreeLeftSlot />
      {PlaceholderComponent ? <PlaceholderComponent parent={parent} /> : messages.tree.noItems}
    </DropdownMenuItem>
  );
}
