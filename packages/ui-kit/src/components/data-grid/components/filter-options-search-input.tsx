import { SearchIcon } from 'lucide-react';
import { Input } from '../../input/public.js';
import { useDataGridMessages } from '../services/core/data-grid-messages-context';

interface FilterOptionsSearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function FilterOptionsSearchInput({
  value,
  onValueChange,
  placeholder,
  autoFocus,
  disabled,
}: FilterOptionsSearchInputProps) {
  const messages = useDataGridMessages();

  return (
    <Input
      value={value}
      placeholder={placeholder ?? messages.filters.searchPlaceholder}
      icon={<SearchIcon />}
      onValueChange={onValueChange}
      autoFocus={autoFocus}
      disabled={disabled}
    />
  );
}
