import type { StoreApi, UseBoundStore } from 'zustand';
import type { DataGridItem } from '../../data-grid-types';
import type { PluginsLoadContext } from '../plugins/plugins-types';

export interface DataGridSectionConfig {
  loadContext: PluginsLoadContext;
  parentId?: DataGridParentId;
}

export interface DataGridSection<TItem extends DataGridItem> {
  id: DataGridSectionId;
  visible: boolean;
  loadContext: PluginsLoadContext;
  parentId: DataGridParentId;
  records: DataGridRecords<TItem>;
}

export type DataGridSectionId = number | string;

export type DataGridDataKey<TItem extends DataGridItem> =
  | string
  | ((item: TItem) => DataGridItemId);

export type DataGridParentId = DataGridItemId | null;

export type DataGridItemId = string | number;

export type DataGridRecords<TItem extends DataGridItem> = DataGridRecord<TItem>[];

export interface DataGridRecord<TItem extends DataGridItem = DataGridItem> {
  id: DataGridItemId;
  item: TItem;
  index: number;
  section: DataGridSection<TItem>;
}

export interface StorageStorePublic<TItem extends DataGridItem> {
  visibleRecords: DataGridRecord<TItem>[];
  rootSections: DataGridSection<TItem>[];
  visibleSections: DataGridSection<TItem>[];
  hasActiveFilters: boolean;
}

export interface StorageStoreInternal<
  TItem extends DataGridItem,
> extends StorageStorePublic<TItem> {
  sections: Map<DataGridSectionId, DataGridSection<TItem>>;
  recordSections: Map<DataGridParentId, DataGridSectionId[]>;
}

export interface StoragePublicApi<TItem extends DataGridItem> {
  /**
   * Zustand store hook for accessing storage state (visible records and sections).
   */
  useStore: UseBoundStore<StoreApi<StorageStorePublic<TItem>>>;

  /**
   * Clear all sections from storage.
   */
  clearSections: () => void;

  /**
   * Create a new section with items.
   *
   * @param section - Section configuration (loadContext, parentId)
   * @param items - Items to store in the section
   * @returns The created section
   */
  createSection: (section: DataGridSectionConfig, items: TItem[]) => DataGridSection<TItem>;

  /**
   * Get all sections as an array.
   */
  getSections: () => DataGridSection<TItem>[];

  /**
   * Find a record by ID across all sections.
   *
   * @param id - The record ID to find
   * @returns The record or undefined if not found
   */
  getRecord: (id: DataGridItemId) => DataGridRecord<TItem> | undefined;

  /**
   * Get all sections with the specified parentId.
   *
   * @param parentId - The parent ID to filter by (null for root sections)
   */
  getSectionsByParentId: (parentId: DataGridParentId) => DataGridSection<TItem>[];

  /**
   * Get all records from sections with the specified parentId as a flat array.
   *
   * @param parentId - The parent ID to filter by (null for root records)
   */
  getRecordsByParentId: (parentId: DataGridParentId) => DataGridRecords<TItem>;

  /**
   * Get the unique ID for an item using the configured itemKey.
   *
   * @param item - The item to extract ID from
   * @returns The item's unique ID
   */
  getItemId: (item: TItem) => DataGridItemId;
}

export interface StorageService<
  TItem extends DataGridItem,
> extends StoragePublicApi<TItem> {
  /**
   * Set the filter keys that scope the grid rather than being chosen by the user, and so
   * don't count towards `hasActiveFilters`. Internal: `DataGrid` is the only writer.
   *
   * @param keys - Filter keys to exclude from the active-filter check
   */
  updateImplicitFilterKeys: (keys: string[]) => void;
}
