import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import type { DataGridRowSelectPluginApi } from '../row-select-types';
import { DataGridRowSelectBanner } from './data-grid-row-select-banner';
import styles from './data-grid-row-select-top.module.css';

export function DataGridRowSelectTop() {
  const grid = useDataGrid();
  const rowSelect = grid.getPlugin<DataGridRowSelectPluginApi>('rowSelect')!;
  const messages = useDataGridMessages();

  const ActionComponent = rowSelect.useComponent();
  const StatusComponent = rowSelect.useStatusComponent();
  const count = rowSelect.useSelectionCount();

  if (!ActionComponent && !StatusComponent) return null;

  return (
    <div className={styles.container}>
      <div className={styles.rowSelectTop}>
        {ActionComponent && (
          <div className={styles.actions}>
            {/* eslint-disable-next-line react-hooks/static-components -- ActionComponent is the consumer's component held in the plugin's store, so it is the same component on every render; the rule cannot see through the store. */}
            <ActionComponent rowSelect={rowSelect} />
          </div>
        )}
        <div className={styles.selectedCount}>
          {StatusComponent ? (
            // eslint-disable-next-line react-hooks/static-components -- StatusComponent is the consumer's component held in the plugin's store, so it is the same component on every render; the rule cannot see through the store.
            <StatusComponent rowSelect={rowSelect} />
          ) : (
            messages.rowSelect.itemsSelected(count)
          )}
        </div>
      </div>
      <DataGridRowSelectBanner />
    </div>
  );
}
