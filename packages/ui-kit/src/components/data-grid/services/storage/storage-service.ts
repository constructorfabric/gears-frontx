import { create } from 'zustand';
import type { DataGridItem, InternalContext } from '../../data-grid-types';
import { getItemKeyValue } from './storage-helpers';
import type {
  DataGridItemId,
  DataGridParentId,
  DataGridRecord,
  DataGridRecords,
  DataGridSection,
  DataGridSectionConfig,
  DataGridSectionId,
  StoragePublicApi,
  StorageService,
  StorageStoreInternal,
} from './storage-types';

export function createStorageService<TItem extends DataGridItem>(
  context: InternalContext<TItem>,
): StorageService<TItem> {
  const useStore = create<StorageStoreInternal<TItem>>()(() => ({
    sections: new Map(),
    recordSections: new Map(),
    visibleRecords: [],
    rootSections: [],
    visibleSections: [],
    hasActiveFilters: false,
  }));

  let implicitFilterKeys: string[] = [];

  const publicApi: StoragePublicApi<TItem> = {
    useStore,
    clearSections,
    createSection,
    getSections,
    getRecord,
    getSectionsByParentId,
    getRecordsByParentId,
    getItemId,
  };

  context.plugins.registerPublicApi(publicApi);

  return { ...publicApi, updateImplicitFilterKeys };

  function createSection(config: DataGridSectionConfig, items: TItem[]) {
    const sectionId = Math.random().toString();
    const parentId = config.parentId ?? null;
    const newSection: DataGridSection<TItem> = {
      id: sectionId,
      visible: true,
      parentId,
      loadContext: config.loadContext,
      records: [],
    };

    const itemKey = context.config.itemKey ?? 'id';
    for (const [index, item] of items.entries()) {
      const itemId = getItemKeyValue(item, itemKey);
      newSection.records.push({ id: itemId, item, index, section: newSection });
    }

    useStore.setState((state) => {
      const sections = new Map(state.sections);
      const recordSections = new Map(state.recordSections);

      sections.set(sectionId, newSection);
      recordSections.set(parentId, [...(recordSections.get(parentId) ?? []), sectionId]);
      const { visibleRecords, rootSections, visibleSections, hasActiveFilters } =
        computeDerivedState(sections, recordSections);

      return {
        sections,
        recordSections,
        visibleRecords,
        rootSections,
        visibleSections,
        hasActiveFilters,
      };
    });

    return newSection;
  }

  function clearSections() {
    useStore.setState({
      sections: new Map(),
      recordSections: new Map(),
      visibleRecords: [],
      rootSections: [],
      visibleSections: [],
      hasActiveFilters: false,
    });
  }

  function getSections(): DataGridSection<TItem>[] {
    return [...useStore.getState().sections.values()];
  }

  function getRecord(id: DataGridItemId): DataGridRecord<TItem> | undefined {
    for (const section of useStore.getState().sections.values()) {
      const record = section.records.find((r) => r.id === id);
      if (record) {
        return record;
      }
    }
    return undefined;
  }

  function getSectionsByParentId(parentId: DataGridParentId): DataGridSection<TItem>[] {
    const state = useStore.getState();
    const sectionIds = state.recordSections.get(parentId) ?? [];
    return sectionIds.map((id) => state.sections.get(id)!).filter(Boolean);
  }

  function getRecordsByParentId(parentId: DataGridParentId): DataGridRecords<TItem> {
    return getSectionsByParentId(parentId).flatMap((section) => section.records);
  }

  function getItemId(item: TItem): DataGridItemId {
    const itemKey = context.config.itemKey ?? 'id';
    return getItemKeyValue(item, itemKey);
  }

  function isFilterValueActive(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  }

  // hasActiveFilters is computed eagerly into the store, so changing the keys has to
  // recompute it rather than wait for the next section change. Compared by reference, like
  // `columns`: the prop is documented as referentially stable, so a new array means new keys.
  function updateImplicitFilterKeys(keys: string[]) {
    if (implicitFilterKeys === keys) return;

    implicitFilterKeys = keys;
    useStore.setState((state) => computeDerivedState(state.sections, state.recordSections));
  }

  function computeDerivedState(
    sections: Map<DataGridSectionId, DataGridSection<TItem>>,
    recordSections: Map<DataGridParentId, DataGridSectionId[]>,
  ) {
    const allSections = [...sections.values()];
    const visibleSections = allSections.filter((section) => section.visible);
    const rootSectionIds = recordSections.get(null) ?? [];
    const rootSections = rootSectionIds
      .map((id) => sections.get(id)!)
      .filter((section) => section.visible);
    const visibleRecords = visibleSections.flatMap((section) => section.records);
    const hasActiveFilters = visibleSections.some((section) => {
      const { filters } = section.loadContext;
      if (!filters) return false;
      return Object.entries(filters).some(
        ([key, filter]) => !implicitFilterKeys.includes(key) && isFilterValueActive(filter?.value),
      );
    });

    return {
      visibleSections,
      rootSections,
      visibleRecords,
      hasActiveFilters,
    };
  }
}
