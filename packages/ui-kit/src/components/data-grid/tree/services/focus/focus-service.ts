import type { KeyboardEvent } from 'react';
import { create } from 'zustand';
import type {
  DataGridTreeItem,
  DataGridTreeItemId,
} from '../../../tree-structure/tree-structure-types';
import type { TreeInternalContext } from '../../tree-types';
import type { TreeFocusPublicApi, TreeFocusService, TreeFocusStore } from './focus-types';
import { getNextVisibleNode, getPreviousVisibleNode, getVisibleNodes } from './navigation-helpers';

export function createFocusService<TItem extends DataGridTreeItem>(
  context: TreeInternalContext<TItem>,
): TreeFocusService {
  const { layout, settings } = context;

  const useFocusStore = create<TreeFocusStore>()(() => ({
    focusedNodeId: null,
  }));

  const publicApi: TreeFocusPublicApi = {
    setFocusedNode,
    focusNode,
  };

  context.plugins.registerPublicApi(publicApi);

  return {
    ...publicApi,
    useFocusStore,
    handleKeyDown,
  };

  function setFocusedNode(id: DataGridTreeItemId | null) {
    useFocusStore.setState({ focusedNodeId: id });
  }

  function focusNode(id: DataGridTreeItemId) {
    setFocusedNode(id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const { focusedNodeId } = useFocusStore.getState();
    if (focusedNodeId === null) return;

    const { key } = event;
    let handled = false;

    if (key === 'ArrowDown') {
      handled = handleArrowDown();
    } else if (key === 'ArrowUp') {
      handled = handleArrowUp();
    } else if (key === 'ArrowRight') {
      handled = handleArrowRight();
    } else if (key === 'ArrowLeft') {
      handled = handleArrowLeft();
    } else if (key === 'Home') {
      handled = handleHome();
    } else if (key === 'End') {
      handled = handleEnd();
    } else if (key === 'Enter') {
      handled = handleEnter();
    }

    if (handled) {
      event.preventDefault();
    }
  }

  function handleArrowDown() {
    const { treeStructure, expandedIds, focusedNodeId } = getNavigationContext();
    if (focusedNodeId === null) return false;

    const visibleNodes = getVisibleNodes(treeStructure, expandedIds);
    const nextNode = getNextVisibleNode(visibleNodes, focusedNodeId);
    if (nextNode) {
      setFocusedNode(nextNode.id);
      return true;
    }
    return false;
  }

  function handleArrowUp() {
    const { treeStructure, expandedIds, focusedNodeId } = getNavigationContext();
    if (focusedNodeId === null) return false;

    const visibleNodes = getVisibleNodes(treeStructure, expandedIds);
    const prevNode = getPreviousVisibleNode(visibleNodes, focusedNodeId);
    if (prevNode) {
      setFocusedNode(prevNode.id);
      return true;
    }
    return false;
  }

  function handleArrowRight() {
    const { treeStructure, expandedIds, focusedNodeId } = getNavigationContext();
    if (focusedNodeId === null) return false;

    const focusedNode = treeStructure.getNode(focusedNodeId);
    if (!focusedNode) return false;

    // If leaf node, do nothing
    if (focusedNode.isLeaf) {
      return false;
    }

    // If closed directory, expand it
    if (!expandedIds.has(focusedNodeId)) {
      layout.toggleExpanded(focusedNodeId, true);
      return true;
    }

    // If open directory, move to first child
    const firstChild = focusedNode.children[0];
    if (firstChild) {
      setFocusedNode(firstChild.id);
      return true;
    }

    // Open directory with no children - do nothing
    return false;
  }

  function handleArrowLeft() {
    const { treeStructure, expandedIds, focusedNodeId } = getNavigationContext();
    if (focusedNodeId === null) return false;

    const focusedNode = treeStructure.getNode(focusedNodeId);
    if (!focusedNode) return false;

    // If open directory, collapse it
    if (!focusedNode.isLeaf && expandedIds.has(focusedNodeId)) {
      layout.toggleExpanded(focusedNodeId, false);
      return true;
    }

    // If closed child node or leaf, move to parent
    if (focusedNode.parent) {
      setFocusedNode(focusedNode.parent.id);
      return true;
    }

    // Root node (closed or leaf) - do nothing
    return false;
  }

  function handleHome() {
    const { treeStructure } = getNavigationContext();
    const firstNode = treeStructure.getRootNodes()[0];
    if (firstNode) {
      setFocusedNode(firstNode.id);
      return true;
    }
    return false;
  }

  function handleEnd() {
    const { treeStructure, expandedIds } = getNavigationContext();
    const visibleNodes = getVisibleNodes(treeStructure, expandedIds);
    const lastNode = visibleNodes[visibleNodes.length - 1];
    if (lastNode) {
      setFocusedNode(lastNode.id);
      return true;
    }
    return false;
  }

  function handleEnter() {
    const { treeStructure, focusedNodeId } = getNavigationContext();
    if (focusedNodeId === null) return false;

    const focusedNode = treeStructure.getNode(focusedNodeId);
    if (!focusedNode) return false;

    // If click handler is defined, trigger it
    if (settings.click) {
      settings.click({ id: focusedNode.id, item: focusedNode.item });
      return true;
    }

    // Otherwise, toggle expansion for directory nodes
    if (!focusedNode.isLeaf) {
      layout.toggleExpanded(focusedNodeId);
      return true;
    }

    return false;
  }

  function getNavigationContext() {
    const treeStructure = settings.treeStructure.current;
    const { expandedIds } = layout.useLayoutStore.getState();
    const { focusedNodeId } = useFocusStore.getState();

    return { treeStructure, expandedIds, focusedNodeId };
  }
}
