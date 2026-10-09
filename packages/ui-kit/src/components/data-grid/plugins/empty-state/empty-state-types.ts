import type { ComponentType } from 'react';
import type { DataGridPluginApi } from '../../services/plugins/plugins-helpers';

export interface DataGridEmptyStatePluginProps extends Record<string, unknown> {
  /**
   * Rendered instead of the built-in empty state whenever the grid has no records. Read
   * `hasActiveFilters` from `useDataGrid()` inside to tell "nothing here yet" from "nothing
   * matched", and compose the content with `Empty`.
   */
  component: ComponentType;
}

export interface DataGridEmptyStatePluginApi extends DataGridPluginApi<DataGridEmptyStatePluginProps> {
  useComponent: () => ComponentType | null;
}
