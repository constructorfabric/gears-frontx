import { cx } from 'class-variance-authority';
import { SearchIcon, XIcon } from 'lucide-react';
import { useRef } from 'react';

import { Button } from '../../../../button/public.js';
import { Input } from '../../../../input/public.js';
import { useDataGrid } from '../../../services/core/data-grid-context';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';
import type { DataGridTextSearchPluginApi } from '../text-search-plugin';
import styles from './data-grid-text-search.module.css';

export function DataGridTextSearch() {
  const grid = useDataGrid();
  const inputRef = useRef<HTMLInputElement>(null);
  const textSearchPlugin = grid.getPlugin<DataGridTextSearchPluginApi>('textSearch')!;
  const messages = useDataGridMessages();

  const customPlaceholder = textSearchPlugin.usePlaceholder();
  const customLabel = textSearchPlugin.useLabel();
  const query = textSearchPlugin.useQuery();
  const fullWidth = textSearchPlugin.useFullWidth();

  const placeholder = customPlaceholder || messages.textSearch.placeholder;
  // The box has no visible label, so an accessible name comes from the strings or the plugin's
  // `label` prop; the placeholder would not name it.
  const label = customLabel || messages.textSearch.label;

  function handleClear() {
    // Focus first: the clear button unmounts once the query is empty, and a focused element that
    // unmounts leaves focus on the page behind.
    inputRef.current?.focus();
    textSearchPlugin.setSearch('');
  }

  return (
    <div className={cx(styles.searchInput, fullWidth && styles.searchInputFullWidth)}>
      <Input
        ref={inputRef}
        type="search"
        value={query}
        aria-label={label}
        placeholder={placeholder}
        icon={<SearchIcon />}
        end={
          query ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<XIcon />}
              aria-label={messages.textSearch.clear}
              onClick={handleClear}
            />
          ) : undefined
        }
        onValueChange={textSearchPlugin.updateSearch}
      />
    </div>
  );
}
