import { Fragment } from 'react';

import { DropdownMenu, DropdownMenuSeparator } from '../../../../dropdown-menu/public.js';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import { useTableService } from '../../../services/table/table-context';
import { isConfigurationGroup } from '../../../services/table/table-types';
import styles from './data-grid-table-configuration.module.css';
import { DataGridTableConfigurationGroupItem } from './data-grid-table-configuration-group-item';
import { DataGridTableConfigurationItem } from './data-grid-table-configuration-item';

export function DataGridTableConfiguration() {
  const tableService = useTableService();
  const messages = useDataGridMessages();
  const columns = tableService.useConfigurationColumns();

  function handleVisibilityToggle(columnId: string, visible: boolean) {
    tableService.updateColumnVisibility(columnId, visible);
  }

  function handleStickyToggle(id: string, sticky: boolean) {
    tableService.updateColumnSticky(id, sticky);
  }

  return (
    // The menu parts without a popup of their own: the popover is the popup, and the menu only
    // supplies the items, so there is no arrow-key navigation between them.
    <DropdownMenu open modal={false}>
      <div className={styles.tableConfiguration}>
        <div className={styles.header}>{messages.tableConfiguration.header}</div>
        <div className={styles.content}>
          {columns.map((entry, index) => (
            <Fragment key={entry.id}>
              {isConfigurationGroup(entry) ? (
                <DataGridTableConfigurationGroupItem
                  group={entry}
                  hasSticky
                  onVisibilityToggle={handleVisibilityToggle}
                  onStickyToggle={handleStickyToggle}
                />
              ) : (
                <DataGridTableConfigurationItem
                  column={entry}
                  hasSticky
                  onVisibilityToggle={handleVisibilityToggle}
                  onStickyToggle={handleStickyToggle}
                />
              )}
              {index !== columns.length - 1 && <DropdownMenuSeparator />}
            </Fragment>
          ))}
        </div>
      </div>
    </DropdownMenu>
  );
}
