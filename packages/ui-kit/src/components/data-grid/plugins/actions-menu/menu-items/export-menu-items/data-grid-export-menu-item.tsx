import { ArrowDownToLineIcon } from 'lucide-react';
import { useState } from 'react';
import { DropdownMenuItem } from '../../../../../dropdown-menu/public.js';
import { useDataGridPluginContext } from '../../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../../services/core/data-grid-messages-context';
import { resolveLabel } from '../../../../services/table/table-helpers';
import { useTableService } from '../../../../services/table/table-context';
import { isRecord } from '../../../../utils/is-record';
import { createExportService } from './export-service';
import type {
  DataGridExportColumn,
  DataGridExportFormat,
  DataGridExportOptions,
} from './export-types';

interface DataGridExportMenuItemParams {
  type: DataGridExportFormat;
  exportConfig?: Partial<DataGridExportOptions>;
}

export interface DataGridExportMenuItemProps {
  params?: Record<string, unknown>;
}

// The menu hands every item `params` as a plain record, so the item reads its own back with these.
// `exportConfig` is only known to be an object here: `exportMenuItems` is what typed it.
function isExportFormat(value: unknown): value is DataGridExportFormat {
  return value === 'csv' || value === 'xlsx';
}

function isExportConfig(value: unknown): value is Partial<DataGridExportOptions> {
  return isRecord(value);
}

function readParams(params: Record<string, unknown> | undefined): DataGridExportMenuItemParams | undefined {
  if (!params || !isExportFormat(params.type)) return undefined;

  return {
    type: params.type,
    exportConfig: isExportConfig(params.exportConfig) ? params.exportConfig : undefined,
  };
}

export function DataGridExportMenuItem({ params: rawParams }: DataGridExportMenuItemProps) {
  const params = readParams(rawParams);
  const pluginContext = useDataGridPluginContext();
  // useTableService is needed for useVisibleColumns which isn't exposed in the public API
  const tableService = useTableService();
  const messages = useDataGridMessages();
  const [isExporting, setIsExporting] = useState(false);

  const visibleColumns = tableService.useVisibleColumns();
  const exportType = params?.type === 'csv' ? 'CSV' : 'Excel';

  async function handleSelect() {
    if (isExporting || !params) return;

    setIsExporting(true);

    try {
      const exportService = createExportService();

      const allData = await exportService.getAllData(pluginContext);

      const columns: DataGridExportColumn[] = visibleColumns.map((column) => {
        const label = resolveLabel(column.label);
        return {
          id: column.id,
          label,
          key: column.key,
          formatter: column.formatter,
        };
      });

      const defaultOptions: DataGridExportOptions = {
        format: params.type,
        filename: messages.exportMenuItem.defaultFilename,
        includeHeaders: true,
        ...(params.type === 'xlsx' ? { sheetName: messages.exportMenuItem.defaultSheetName } : {}),
      };

      const options: DataGridExportOptions = {
        ...defaultOptions,
        ...params.exportConfig,
      };

      const method =
        params.type === 'csv' ? exportService.exportToCSV : exportService.exportToExcel;

      await method(allData, columns, options, pluginContext);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <DropdownMenuItem disabled={isExporting} onClick={handleSelect}>
      <ArrowDownToLineIcon />
      {messages.exportMenuItem.exportAs(exportType)}
    </DropdownMenuItem>
  );
}
