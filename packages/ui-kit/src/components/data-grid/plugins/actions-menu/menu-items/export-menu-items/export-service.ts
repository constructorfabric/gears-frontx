import type { DataGridItem } from '../../../../data-grid-types';
import type { DataGridPluginContext } from '../../../../services/plugins/plugins-types';
import type {
  DataGridItemId,
  DataGridRecord,
  DataGridSection,
} from '../../../../services/storage/storage-types';
import type { PaginationPluginApi } from '../../../pagination/pagination-plugin';
import type { DataGridTableTreePluginApi } from '../../../table-tree/table-tree-types';
import type {
  DataGridExportColumn,
  DataGridExportOptions,
  DataGridExportService,
} from './export-types';
import { csvFormatter } from './formatters/csv-formatter';
import { excelFormatter } from './formatters/excel-formatter';

export function createExportService<
  Item extends DataGridItem = DataGridItem,
>(): DataGridExportService<Item> {
  return {
    exportToCSV,
    exportToExcel,
    downloadFile,
    getAllData,
  };

  async function exportToCSV(
    data: Item[],
    columns: DataGridExportColumn[],
    options: DataGridExportOptions<Item>,
    gridContext: DataGridPluginContext<Item>,
  ): Promise<void> {
    const csvOptions = { ...options, format: 'csv' as const };
    try {
      const csvContent = await csvFormatter<Item>({
        data,
        columns,
        options: csvOptions,
        gridContext,
      });

      const filename = generateFilename(options.filename, 'csv');
      downloadFile(csvContent, filename, 'text/csv');
    } catch (error) {
      if (options.onError) {
        options.onError(toError(error));
      } else {
        throw error;
      }
    }
  }

  async function exportToExcel(
    data: Item[],
    columns: DataGridExportColumn[],
    options: DataGridExportOptions<Item>,
    gridContext: DataGridPluginContext<Item>,
  ): Promise<void> {
    const excelOptions = { ...options, format: 'xlsx' as const };
    try {
      const excelBlob = await excelFormatter<Item>({
        data,
        columns,
        options: excelOptions,
        gridContext,
      });

      const filename = generateFilename(options.filename, 'xlsx');
      downloadFile(
        excelBlob,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } catch (error) {
      if (options.onError) {
        options.onError(toError(error));
      } else {
        throw error;
      }
    }
  }

  function downloadFile(content: string | Blob, filename: string, mimeType: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  async function getAllData(gridContext: DataGridPluginContext<Item>): Promise<Item[]> {
    // The export reads the pagination and the tree plugin by name: with neither registered, what
    // is on screen is everything there is.
    const paginationPlugin = gridContext.getPlugin<PaginationPluginApi>('pagination');
    const treePlugin = gridContext.getPlugin<DataGridTableTreePluginApi<Item>>('tableTree');

    if (treePlugin && paginationPlugin) {
      return await getAllTreeDataWithPagination(gridContext, treePlugin, paginationPlugin);
    } else if (treePlugin) {
      return await getAllTreeData(gridContext, treePlugin);
    } else if (paginationPlugin) {
      return await getAllDataPageByPage(gridContext, paginationPlugin);
    }

    const records = gridContext.useStore.getState().visibleRecords;
    return records.map((record) => record.item);
  }

  async function getAllTreeData(
    gridContext: DataGridPluginContext<Item>,
    treePlugin: DataGridTableTreePluginApi<Item>,
  ): Promise<Item[]> {
    const allData: Item[] = [];
    const visitedIds = new Set<DataGridItemId>();
    const records = gridContext.useStore.getState().visibleRecords;

    await collectTreeDataFromRecords(gridContext, records, allData, visitedIds, treePlugin);
    return allData;
  }

  async function getAllTreeDataWithPagination(
    gridContext: DataGridPluginContext<Item>,
    treePlugin: DataGridTableTreePluginApi<Item>,
    paginationPlugin: PaginationPluginApi,
  ): Promise<Item[]> {
    const originalState = { page: paginationPlugin.getPage(), limit: paginationPlugin.getLimit() };
    const allData: Item[] = [];
    const visitedIds = new Set<DataGridItemId>();
    let currentPage = 1;
    let hasMorePages = true;
    let previousPageIds = '';

    while (hasMorePages) {
      const loadInstance = gridContext.triggerLoad({
        loadContext: {
          pagination: { ...originalState, page: currentPage },
          tree: { parentId: null },
        },
        store: false,
      });

      await loadInstance.promise;

      if (loadInstance.processResult) {
        const pageData = loadInstance.processResult.results;

        if (pageData.length === 0) {
          hasMorePages = false;
        } else {
          // A page is not stored, so it has no records of the grid's own; the tree is walked
          // over records made for it.
          const pageRecords = pageData.map((item, index) => ({
            id: gridContext.getItemId(item),
            item,
            index,
            section: rootSection<Item>(),
          }));

          // A load that ignores the page returns the same rows again; stop there, not never.
          const pageIds = pageRecords.map((record) => String(record.id)).join('\n');
          const repeatsPreviousPage = pageIds === previousPageIds;
          previousPageIds = pageIds;

          await collectTreeDataFromRecords(
            gridContext,
            pageRecords,
            allData,
            visitedIds,
            treePlugin,
          );

          currentPage++;

          if (repeatsPreviousPage || pageData.length < originalState.limit) {
            hasMorePages = false;
          }
        }
      } else {
        hasMorePages = false;
      }
    }

    return allData;
  }

  async function collectTreeDataFromRecords(
    gridContext: DataGridPluginContext<Item>,
    records: DataGridRecord<Item>[],
    allData: Item[],
    visitedIds: Set<DataGridItemId>,
    treePlugin: DataGridTableTreePluginApi<Item>,
  ): Promise<void> {
    for (const record of records) {
      if (visitedIds.has(record.id)) {
        continue;
      }

      visitedIds.add(record.id);
      allData.push(record.item);

      const expandable = treePlugin.isExpandable(record);
      if (expandable) {
        // Load children if not already loaded
        const loadedSections = gridContext.getSectionsByParentId(record.id);
        if (!loadedSections.length) {
          const loadInstance = gridContext.triggerLoad({
            loadContext: { tree: { parentId: record.id } },
          });
          await loadInstance.promise;
        }

        const childRecords = gridContext.getRecordsByParentId(record.id);
        if (childRecords.length > 0) {
          await collectTreeDataFromRecords(
            gridContext,
            childRecords,
            allData,
            visitedIds,
            treePlugin,
          );
        }
      }
    }
  }

  async function getAllDataPageByPage(
    gridContext: DataGridPluginContext<Item>,
    paginationPlugin: PaginationPluginApi,
  ): Promise<Item[]> {
    const originalState = { page: paginationPlugin.getPage(), limit: paginationPlugin.getLimit() };

    const allData: Item[] = [];
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const loadInstance = gridContext.triggerLoad({
        loadContext: {
          pagination: { ...originalState, page: currentPage },
        },
        store: false,
      });

      await loadInstance.promise;

      if (loadInstance.processResult) {
        const pageData = loadInstance.processResult.results;

        if (pageData.length === 0) {
          hasMorePages = false;
        } else {
          allData.push(...pageData);
          currentPage++;

          if (pageData.length < originalState.limit) {
            hasMorePages = false;
          }

          if (
            loadInstance.processResult.total &&
            allData.length >= loadInstance.processResult.total
          ) {
            hasMorePages = false;
          }
        }
      } else {
        hasMorePages = false;
      }
    }

    return allData;
  }
}

function rootSection<Item extends DataGridItem>(): DataGridSection<Item> {
  return { id: '', visible: true, loadContext: {}, parentId: null, records: [] };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function generateFilename(
  filename: string | (() => string) | undefined,
  extension: string,
): string {
  if (typeof filename === 'function') {
    return filename();
  }

  if (typeof filename === 'string') {
    return filename.endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  return `${timestamp}.${extension}`;
}
