// The core entry: the grid, its hooks, the plugin helper and the types. It must not re-export a
// plugin: each plugin is its own entry (`@gears-frontx/ui-kit/data-grid/<plugin>`), so a grid
// that uses none of them pulls in none of their code or CSS.
export { DataGrid } from './data-grid.js';
export { useDataGrid, useDataGridPluginContext } from './services/core/data-grid-context.js';
export type {
  DataGridConfig,
  DataGridItem,
  DataGridLabel,
  DataGridProps,
  DataGridLoadContext,
  DataGridLoadResult,
} from './data-grid-types.js';
export type { DataGridHooks } from './services/hooked/hooked-types.js';
export type { DataGridPlugin, DataGridPluginContext } from './services/plugins/plugins-types.js';
export type {
  DataGridTableColumn,
  DataGridTableColumnOverflow,
  DataGridTableGroup,
  DataGridTableLayout,
} from './services/table/table-types.js';

// Plugin helpers
export { createDataGridPlugin } from './services/plugins/plugins-helpers.js';
export type { DataGridPluginApi } from './services/plugins/plugins-helpers.js';

export { useDataGridRecord } from './services/table/data-grid-record-context.js';
export { DATA_GRID_VIEW, useDataGridActiveView } from './services/layout/data-grid-view.js';
export type { DataGridViewId } from './services/layout/data-grid-view.js';
