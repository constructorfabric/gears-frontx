import { RotateCwIcon } from 'lucide-react';
import { Button } from '../../button/public.js';
import { useDataGridMessages } from '../services/core/data-grid-messages-context';
import styles from './filter-reset-button.module.css';

interface FilterResetButtonProps {
  disabled?: boolean;
  onClick: () => void;
}

export function FilterResetButton({ disabled, onClick }: FilterResetButtonProps) {
  const messages = useDataGridMessages();

  return (
    <>
      <hr className={styles.divider} />
      <div className={styles.resetButton}>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onClick}
          icon={<RotateCwIcon />}
        >
          {messages.filters.reset}
        </Button>
      </div>
    </>
  );
}
