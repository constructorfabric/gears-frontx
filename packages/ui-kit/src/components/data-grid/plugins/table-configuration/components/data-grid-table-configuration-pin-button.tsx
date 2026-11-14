import { cx } from 'class-variance-authority';
import { PinIcon } from 'lucide-react';

import { Toggle } from '../../../../toggle/public.js';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import styles from './data-grid-table-configuration.module.css';

interface DataGridTableConfigurationPinButtonProps {
  sticky?: boolean;
  onToggle: () => void;
}

export function DataGridTableConfigurationPinButton({
  sticky,
  onToggle,
}: DataGridTableConfigurationPinButtonProps) {
  const messages = useDataGridMessages();

  return (
    <div className={cx(styles.pinButton, sticky && styles.pinButtonVisible)}>
      <Toggle
        className={styles.pin}
        iconOnly
        size="sm"
        pressed={sticky ?? false}
        onPressedChange={onToggle}
        aria-label={
          sticky ? messages.tableConfiguration.unpinColumn : messages.tableConfiguration.pinColumn
        }
      >
        <PinIcon />
      </Toggle>
    </div>
  );
}
