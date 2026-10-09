import { TablePropertiesIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { DataGridItem, InternalContext } from '../../data-grid-types';
import { DataGridBodyCellContent } from './components/data-grid-body-cell-content';
import { DataGridContent } from './components/data-grid-content';
import { DataGridHeaderCellLabel } from './components/data-grid-header-cell-label';
import { DataGridHeaderGroup } from './components/data-grid-header-group';
import { DataGridRow } from './components/data-grid-row';
import { DataGridTable } from './components/data-grid-table';
import { TABLE_LAYOUT_SLOT_ID } from '../layout/layout-slot-ids';
import { prepareTableColumns } from './table-columns';
import { prepareTableColumnsPersistence } from './table-columns-persistence';
import { prepareTableExtraColumns } from './table-extra-columns';
import { prepareTableHeader } from './table-header';
import { prepareTableMinContentWidth } from './table-min-content-width';
import { prepareTableSlots } from './table-slots';
import { prepareTableSticky } from './table-sticky';
import { createTableStore } from './table-store';
import type {
  ConfigurationColumn,
  ConfigurationEntry,
  DataGridTableColumn,
  TableComponentName,
  DataGridTableGroup,
  DataGridTableLayout,
  RegisteredTableComponent,
  TablePublicApi,
  TableService,
} from './table-types';
import { isTableGroup } from './table-types';

export function createTableService<TItem extends DataGridItem>(
  context: InternalContext<TItem>,
): TableService<TItem> {
  const useTableStore = createTableStore<TItem>();
  const defaultComponents = createDefaultComponents();

  // Register table in layout main slot as the default active view, with an icon for the view selector
  context.layout.registerSlot('main', {
    id: TABLE_LAYOUT_SLOT_ID,
    component: DataGridTable,
    active: true,
    icon: TablePropertiesIcon,
  });

  // Domain APIs (same composition as before)
  const slotsApi = prepareTableSlots<TItem>(useTableStore);
  const extraColumnsApi = prepareTableExtraColumns<TItem>(useTableStore);
  const stickyApi = prepareTableSticky<TItem>(useTableStore);
  const columnsPersistence = prepareTableColumnsPersistence<TItem>(context);
  const columnsApi = prepareTableColumns<TItem>(useTableStore, stickyApi, columnsPersistence);
  const headerApi = prepareTableHeader<TItem>(useTableStore, stickyApi, defaultComponents);
  const minContentWidthApi = prepareTableMinContentWidth<TItem>(useTableStore);

  // Public API — registered into pluginContext for external plugins
  const publicApi: TablePublicApi<TItem> = {
    registerTableSlot: slotsApi.registerSlot,
    registerExtraColumn: extraColumnsApi.registerExtraColumn,
    updateExtraColumnWidth: extraColumnsApi.updateExtraColumnWidth,
    updateExtraColumnOrder: extraColumnsApi.updateExtraColumnOrder,
    updateExtraColumnSticky: extraColumnsApi.updateExtraColumnSticky,
    registerComponent,
    updateColumns,
    updateColumnVisibility,
    updateColumnSticky,
    updateTableLayout,
    updateStickyHeader,
  };
  context.plugins.registerPublicApi(publicApi);

  return {
    ...publicApi,
    updateColumns,
    useComponent,
    useConfigurationColumns,
    useTableLayout,
    useStickyHeader,
    ...slotsApi,
    ...extraColumnsApi,
    ...stickyApi,
    ...columnsApi,
    ...headerApi,
    ...minContentWidthApi,
  };

  function updateColumns(columns: (DataGridTableColumn<TItem> | DataGridTableGroup<TItem>)[]) {
    const columnState = columnsApi.initializeColumns(columns);
    const { columnSticky, groupSticky } = stickyApi.initializeStickyState(columns);
    const current = useTableStore.getState();
    useTableStore.setState({
      ...columnState,
      columnSticky,
      groupSticky,
      extraColumnsStart: current.extraColumnsStart,
      extraColumnsEnd: current.extraColumnsEnd,
      slots: current.slots,
      components: current.components,
      columnWidths: current.columnWidths,
      minContentWidths: current.minContentWidths,
    });
  }

  function updateColumnVisibility(columnId: string, visible: boolean) {
    const state = useTableStore.getState();
    const newVisibility = new Map(state.columnVisibility);
    newVisibility.set(columnId, visible);
    useTableStore.setState({ columnVisibility: newVisibility });
    columnsPersistence?.record(columnId, visible);
  }

  function updateTableLayout(tableLayout: DataGridTableLayout) {
    useTableStore.setState({ tableLayout });
  }

  function useTableLayout(): DataGridTableLayout {
    return useTableStore((state) => state.tableLayout);
  }

  function updateStickyHeader(stickyHeader: boolean) {
    useTableStore.setState({ stickyHeader });
  }

  function useStickyHeader(): boolean {
    return useTableStore((state) => state.stickyHeader);
  }

  function updateColumnSticky(id: string, sticky: boolean) {
    const state = useTableStore.getState();
    const isGroup = state.columns.some((col) => isTableGroup(col) && col.id === id);

    if (isGroup) {
      const newGroupSticky = new Map(state.groupSticky);
      newGroupSticky.set(id, sticky);
      useTableStore.setState({ groupSticky: newGroupSticky });
    } else {
      const newColumnSticky = new Map(state.columnSticky);
      newColumnSticky.set(id, sticky);
      useTableStore.setState({ columnSticky: newColumnSticky });
    }
  }

  // The parameter is whatever the public API takes (a `ComponentType<any>`), so a class component
  // is accepted. The registry stores it as a `ComponentType<never>`, which a class component is
  // not assignable to (its instance's `props` are not assignable to `never`), hence the assertion.
  function registerComponent(
    name: TableComponentName,
    component: Parameters<TablePublicApi['registerComponent']>[1],
  ) {
    const state = useTableStore.getState();
    const newComponents = new Map(state.components);
    newComponents.set(name, component as RegisteredTableComponent);
    useTableStore.setState({ components: newComponents });
  }

  function useComponent<TProps = unknown>(name: TableComponentName): ComponentType<TProps> {
    return useTableStore(
      (state) => state.components.get(name) ?? defaultComponents.get(name)!,
    ) as ComponentType<TProps>;
  }

  function resolveLabel(label: string | (() => string)): string {
    return typeof label === 'function' ? label() : label;
  }

  function useConfigurationColumns(): ConfigurationEntry[] {
    const { columns, columnVisibility, columnSticky, groupSticky } = useTableStore(
      useShallow((state) => ({
        columns: state.columns,
        columnVisibility: state.columnVisibility,
        columnSticky: state.columnSticky,
        groupSticky: state.groupSticky,
      })),
    );

    return useMemo(() => {
      const visibleCount = Array.from(columnVisibility.values()).filter(Boolean).length;

      function toConfigCol(col: DataGridTableColumn<TItem>): ConfigurationColumn {
        const visible = columnVisibility.get(col.id) ?? true;
        return {
          id: col.id,
          label: resolveLabel(col.label),
          visible,
          sticky: columnSticky.get(col.id) ?? false,
          visibleToggleDisabled: col.visibleToggleDisabled ?? (visible && visibleCount === 1),
        };
      }

      return columns.map((item): ConfigurationEntry => {
        if (isTableGroup(item)) {
          return {
            id: item.id,
            label: resolveLabel(item.label),
            visible: item.visible ?? true,
            sticky: groupSticky.get(item.id) ?? false,
            columns: item.columns.map(toConfigCol),
          };
        }
        return toConfigCol(item);
      });
    }, [columns, columnVisibility, columnSticky, groupSticky]);
  }
}

function createDefaultComponents(): Map<TableComponentName, RegisteredTableComponent> {
  const defaults = new Map<TableComponentName, RegisteredTableComponent>();
  defaults.set('body-cell-content', DataGridBodyCellContent);
  defaults.set('content', DataGridContent);
  defaults.set('header-cell-label', DataGridHeaderCellLabel);
  defaults.set('header-group', DataGridHeaderGroup);
  defaults.set('row', DataGridRow);
  return defaults;
}
