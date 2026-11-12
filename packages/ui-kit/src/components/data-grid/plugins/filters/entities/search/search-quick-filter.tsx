import { useEffect, useMemo, useState } from 'react';
import { Input } from '../../../../../input/public.js';
import { useDataGrid } from '../../../../services/core/data-grid-context';
import { debounce } from '../../../../utils/debounce';
import { FilterPopover } from '../../components/filter-popover';
import type {
  DataGridFilterSearchEntity,
  DataGridFilterSearchState,
  DataGridFiltersPluginApi,
} from '../../filters-types';

interface FilterSearchProps {
  filterEntity: DataGridFilterSearchEntity;
}

export function FilterSearch({ filterEntity }: FilterSearchProps) {
  const grid = useDataGrid();
  const filtersApi = grid.getPlugin<DataGridFiltersPluginApi>('filters')!;

  const currentValue =
    filtersApi.useState<DataGridFilterSearchState>(filterEntity.filterKey)?.value ?? '';
  const [text, setText] = useState(currentValue);

  const debouncedUpdate = useMemo(
    () =>
      debounce((value: string) => {
        if (value) {
          filtersApi.setState(filterEntity.filterKey, { value });
        } else {
          filtersApi.removeState(filterEntity.filterKey);
        }
      }, 1000),
    [filterEntity.filterKey, filtersApi],
  );

  useEffect(() => {
    // A new stored value (a reset, the panel's apply) also drops an edit still waiting out the
    // debounce, or that edit would apply over it. When the debounce's own apply lands here, it
    // has already run, so there is nothing to drop.
    debouncedUpdate.cancel();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the field shows what the user is typing, and takes the stored value over whenever that changes (a reset, the panel's apply)
    setText(currentValue);
  }, [currentValue, debouncedUpdate]);

  useEffect(() => {
    return () => debouncedUpdate.cancel();
  }, [debouncedUpdate]);

  function handleChange(value: string) {
    setText(value);
    debouncedUpdate(value);
  }

  return (
    <FilterPopover filterEntity={filterEntity}>
      <Input value={text} onValueChange={handleChange} />
    </FilterPopover>
  );
}
