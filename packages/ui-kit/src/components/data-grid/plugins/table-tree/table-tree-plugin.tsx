// Load-bearing: a plugin is rendered as a child of <DataGrid>, so a Server Component can import
// and render it, and the component it returns calls hooks. This directive puts the banner on the
// plugin's own entry chunk (dist/data-grid/<plugin>.js). client-boundaries.test.ts only scans a
// component's top-level files, so scripts/verify-consumer.sh is what checks the built banner of
// every plugin entry.
'use client';

import type { ReactNode } from 'react';
import { create } from 'zustand';
// `.js` on each relative type import: they land verbatim in the shipped declaration file, where
// `moduleResolution: "nodenext"` rejects an extensionless one and every type from it goes untyped
// (the `expandable` callback's `item` among them).
import type { DataGridItem } from '../../data-grid-types.js';
import type { LoadInstance } from '../../services/load/load-types.js';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import type {
  DataGridItemId,
  DataGridRecord,
  DataGridSection,
} from '../../services/storage/storage-types.js';
import { DataGridTableTreeBodyCellContent } from './components/data-grid-table-tree-body-cell-content';
import { DataGridTableTreeRow } from './components/data-grid-table-tree-row';
import { createTreeDataFromFlattenedArray } from './table-tree-helpers';
import type {
  DataGridTableTreePluginApi,
  DataGridTableTreePluginConfig,
  TableTreeConfigStore,
  TableTreePersistentState,
  TableTreeStore,
} from './table-tree-types.js';

// Ids from every visited page accumulate in the stored list (a row that is not
// on screen cannot be collapsed), and rows deleted server-side never come back
// to be collapsed either — so the list is bounded, dropping the oldest first.
const maxPersistedExpandedIds = 200;

const DataGridTableTreePluginRaw = createDataGridPlugin<
  DataGridItem,
  'tableTree',
  DataGridTableTreePluginConfig,
  DataGridTableTreePluginApi
>('tableTree', (context) => {
  const useTreeStore = create<TableTreeStore>(() => ({
    expandedIds: new Set(),
  }));

  const useConfigStore = create<TableTreeConfigStore>(() => ({
    parentKey: undefined,
    expandable: undefined,
  }));

  const resetIds = new Set<DataGridItemId>();
  // One-shot work queue, not observable state: ids restored from storage whose
  // children still need a lazy load. A restored id alone cannot tell whether the
  // row exists or is expandable, so the load waits until its record arrives.
  const restoredIds = new Set<DataGridItemId>();
  // Expand state is stored next to the page, filters and order, under whichever
  // backend the grid was configured with — except the URL: the list grows to the
  // persistence cap and keeps ids of rows deleted server-side, and every copied
  // URL would seed all of that into whichever grid opens the link.
  const persistentState = context.registerPersistentState<TableTreePersistentState>('tree', {
    schema: { expanded: 'object' },
    router: false,
  });

  context.hook('load:prepare', onBeforeLoad);
  context.hook('load:context', ({ loadContext }) => ({
    tree: { parentId: loadContext.tree?.parentId ?? null },
  }));
  context.hook('load:store', onLoadStore);
  context.registerComponent('row', DataGridTableTreeRow);
  context.registerComponent('body-cell-content', DataGridTableTreeBodyCellContent);

  return {
    useIsExpandable,
    useIsExpanded,
    useLevel: getLevel,
    toggle,
    isExpandable,
    onPropsChange,
  };

  function onPropsChange(props: DataGridTableTreePluginConfig) {
    useConfigStore.setState({
      parentKey: props.parentKey,
      expandable: props.expandable,
    });
  }

  function useIsExpandable(record: DataGridRecord): boolean {
    const expandable = useConfigStore((s) => s.expandable);
    const parentKey = useConfigStore((s) => s.parentKey);

    if (expandable) {
      return expandable(record.item);
    }

    if (parentKey) {
      return !!context.getSectionsByParentId(record.id).length;
    }

    return false;
  }

  function useIsExpanded(itemId: DataGridItemId): boolean {
    return useTreeStore((s) => s.expandedIds.has(itemId));
  }

  function getLevel(section: DataGridSection<DataGridItem>): number {
    const { parentId } = section;

    if (parentId === null) {
      return 0;
    }

    const parentRecord = context.getRecord(parentId);
    return 1 + (parentRecord ? getLevel(parentRecord.section) : 0);
  }

  function toggle(itemId: DataGridItemId) {
    const state = useTreeStore.getState();
    const isCurrentlyExpanded = state.expandedIds.has(itemId);

    const newExpandedIds = new Set(state.expandedIds);
    if (isCurrentlyExpanded) {
      newExpandedIds.delete(itemId);
    } else {
      newExpandedIds.add(itemId);
    }
    useTreeStore.setState({ expandedIds: newExpandedIds });
    syncPersistent();

    if (!isCurrentlyExpanded) {
      triggerLoadChildren(itemId);
    }
  }

  // --- Private helpers ---

  function seedFromPersistent() {
    // Storage is user-editable, so the value is narrowed to the id type
    // instead of being trusted as-is, and capped the same way the write side
    // caps it — the plugin itself never stores more, so an oversized list is
    // external. The slice keeps the tail: storage order is oldest-first.
    const stored = persistentState.value?.expanded;
    const expanded = Array.isArray(stored)
      ? stored
          .filter((id): id is DataGridItemId => typeof id === 'string' || typeof id === 'number')
          .slice(-maxPersistedExpandedIds)
      : [];
    if (!expanded.length) {
      return;
    }

    const { parentKey } = useConfigStore.getState();
    const expandedIds = new Set(useTreeStore.getState().expandedIds);

    for (const id of expanded) {
      expandedIds.add(id);
      if (!parentKey) {
        restoredIds.add(id);
      }
    }

    useTreeStore.setState({ expandedIds });
  }

  function syncPersistent() {
    // Writes the whole object rather than a delta, because the accessor stores
    // whatever it is given: a partial write would drop the ids it omits. The
    // empty list is written too, so a fully collapsed hierarchy is stored as
    // such instead of as an absent entry. Set iterates in insertion order —
    // seeded ids first, fresh toggles last — so the slice drops the oldest.
    const expanded = [...useTreeStore.getState().expandedIds].slice(-maxPersistedExpandedIds);
    persistentState.setValue({ expanded });
  }

  // Drains the restored ids against sections that have just been stored,
  // starting a children load only for rows that actually arrived.
  function loadRestoredChildren(sections: DataGridSection<DataGridItem>[]) {
    if (!restoredIds.size) {
      return;
    }

    const { expandedIds } = useTreeStore.getState();

    for (const section of sections) {
      for (const record of section.records) {
        if (!restoredIds.delete(record.id) || !expandedIds.has(record.id)) {
          continue;
        }

        if (isExpandable(record)) {
          triggerLoadChildren(record.id);
        } else {
          // The row arrived and cannot be expanded, so the stored id is dropped
          // instead of leaving the row marked expanded with nothing under it.
          toggle(record.id);
        }
      }
    }
  }

  function triggerLoadChildren(parentId: DataGridItemId) {
    const loadInstance = findLoadInstance(parentId);
    if (loadInstance) {
      return;
    }

    const loadedSections = context.getSectionsByParentId(parentId);
    if (!loadedSections.length) {
      context.triggerLoad({ loadContext: { tree: { parentId } } });
    }
  }

  function findLoadInstance(parentId: DataGridItemId) {
    return context
      .getLoadInstances()
      .find((instance) => instance.loadContext.tree?.parentId === parentId);
  }

  function onBeforeLoad() {
    resetIds.clear();

    for (const section of context.getSections()) {
      for (const record of section.records) {
        if (useTreeStore.getState().expandedIds.has(record.id)) {
          resetIds.add(record.id);
        }
      }
    }
  }

  function onLoadStore(instance: LoadInstance<DataGridItem>) {
    const { parentKey } = useConfigStore.getState();
    const pageChanged = isPageChanged(instance.loadContext.pagination?.page);

    if (instance.refresh || pageChanged) {
      context.clearSections();
    }
    if (pageChanged) {
      // Two cases reach this branch, and the reseed serves both.
      //
      // A real page change: the in-memory expansion belongs to the page being
      // left, so it is reset, but the stored ids are kept and re-applied. A row
      // expanded on page 1 is expanded again when the user comes back to it, and
      // ids belonging to other pages sit in the set harmlessly, because children
      // load only for records that arrived and pass isExpandable.
      //
      // The very first load, where isPageChanged() is also true because no root
      // section exists yet: here the reset would erase the state just restored
      // from storage, so it has to be seeded again.
      useTreeStore.setState({ expandedIds: new Set() });
      seedFromPersistent();
    }

    const newSections: DataGridSection<DataGridItem>[] = [];

    if (parentKey) {
      const results = createTreeDataFromFlattenedArray(instance.processResult!.results, parentKey);

      for (const [parentId, items] of results) {
        const newSection = context.createSection(
          { loadContext: instance.loadContext, parentId },
          items,
        );
        newSections.push(newSection);
      }
    } else {
      const newSection = context.createSection(
        { loadContext: instance.loadContext, parentId: instance.loadContext.tree!.parentId },
        instance.processResult!.results,
      );
      newSections.push(newSection);
    }

    if (resetIds.size) {
      const { expandedIds } = useTreeStore.getState();
      const toLoadRecords = newSections.flatMap((section) => {
        return section.records.filter(
          (record) => resetIds.has(record.id) && isExpandable(record) && expandedIds.has(record.id),
        );
      });

      if (toLoadRecords.length) {
        for (const record of toLoadRecords) {
          resetIds.delete(record.id);
          triggerLoadChildren(record.id);
        }
      } else {
        resetIds.clear();
      }
    }

    loadRestoredChildren(newSections);

    return true;
  }

  function isPageChanged(newPage?: number) {
    const sections = context.getSectionsByParentId(null);
    return sections.length === 0
      ? true
      : (newPage ?? 1) !== (sections[0].loadContext.pagination?.page ?? 1);
  }

  function isExpandable(record: DataGridRecord): boolean {
    const { expandable, parentKey } = useConfigStore.getState();

    if (expandable) {
      return expandable(record.item);
    }

    if (parentKey) {
      return !!context.getSectionsByParentId(record.id).length;
    }

    return false;
  }
});

// The plugin is built for the base item type; the cast hands the consumer a generic component, so
// `<DataGridTableTreePlugin<Category> parentKey="parent_id" />` types `parentKey` and `expandable`
// against the consumer's item.
export const DataGridTableTreePlugin = DataGridTableTreePluginRaw as <
  TItem extends DataGridItem = DataGridItem,
>(
  props: DataGridTableTreePluginConfig<TItem>,
) => ReactNode;
