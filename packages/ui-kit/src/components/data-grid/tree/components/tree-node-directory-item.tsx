import { ChevronRightIcon } from 'lucide-react';
import { Button } from '../../../button/public.js';
import { useDataGridMessages } from '../../services/core/data-grid-messages-context';
import type { DataGridTreeItem, DataGridTreeNode } from '../../tree-structure/tree-structure-types';
import { useTreeContext } from '../services/core/tree-context';
import type { TreeListItemProps } from './tree-list-item';
import { TreeLayoutSlot } from './tree-layout-slot';
import { TreeNodeContent } from './tree-node-content';
import styles from './tree-node-directory-item.module.css';

interface TreeNodeDirectoryItemProps<TItem extends DataGridTreeItem> {
  node: DataGridTreeNode<TItem>;
}

export function TreeNodeDirectoryItem<TItem extends DataGridTreeItem = DataGridTreeItem>({
  node,
}: TreeNodeDirectoryItemProps<TItem>) {
  const { settings, layout } = useTreeContext<TItem>();
  const messages = useDataGridMessages();
  const DirectoryComponent = layout.useComponent<TreeListItemProps<TItem>>('directory');

  const isExpanded = layout.useLayoutStore((state) => state.expandedIds.has(node.id));
  const iconSlots = layout.useSlots('icon');
  const hasIconSlot = iconSlots.length > 0;
  const leftSlots = layout.useSlots('left');
  const hasLeftSlot = leftSlots.length > 0;

  const shouldShowLeft = computeShouldShowLeft();

  function computeShouldShowLeft() {
    if (!hasLeftSlot) {
      return false;
    }

    const { showInlineStart } = settings;

    if (!showInlineStart || showInlineStart === 'leaf') {
      return false;
    }

    if (showInlineStart === 'directory') {
      return true;
    }

    return showInlineStart(node.item);
  }

  function handleToggle() {
    layout.toggleExpanded(node.id);
  }

  const ariaLabel = isExpanded ? messages.tree.collapse : messages.tree.expand;
  const buttonIcon = hasIconSlot ? (
    <TreeLayoutSlot name="icon" item={node.item} expanded={isExpanded} />
  ) : (
    <span className={isExpanded ? styles.iconExpanded : styles.icon}>
      <ChevronRightIcon />
    </span>
  );

  const leftSlotContent = (
    <>
      <Button
        variant="ghost"
        size="sm"
        render={<span />}
        nativeButton={false}
        data-tree-node-click-ignore
        tabIndex={-1}
        onClick={handleToggle}
        aria-expanded={isExpanded}
        aria-label={ariaLabel}
        icon={buttonIcon}
      />
      {shouldShowLeft && <TreeLayoutSlot name="left" item={node.item} node={node} />}
    </>
  );

  return (
    // eslint-disable-next-line react-hooks/static-components -- DirectoryComponent comes from the tree's component registry (a store lookup), so it is the same component on every render; the rule cannot see through the lookup.
    <DirectoryComponent node={node} leftSlot={leftSlotContent}>
      <TreeNodeContent node={node} />
    </DirectoryComponent>
  );
}
