import { Checkbox } from '../../../../../checkbox/public.js';
import { Label } from '../../../../../label/public.js';
import { Spinner } from '../../../../../spinner/public.js';
import { FilterControlArea } from '../../../../components/filter-control-area';
import { FilterOptionsSearchInput } from '../../../../components/filter-options-search-input';
import { FilterScrollableWrapper } from '../../../../components/filter-scrollable-wrapper';
import { useDataGridMessages } from '../../../../services/core/data-grid-messages-context';
import type {
  DataGridFilterCheckboxGroupEntity,
  DataGridFilterCheckboxGroupOption,
  DataGridFilterCheckboxGroupOptionsLoader,
} from '../../filters-types';
import { useAsyncFilterSearch } from '../../services/use-async-filter-search';
import { useFilterSearch } from '../../services/use-filter-search';
import styles from './checkbox-group-list.module.css';

type SearchSize = 'm' | 'xl';
type OptionValue = DataGridFilterCheckboxGroupOption['value'];

interface CheckboxGroupListProps {
  filterEntity: DataGridFilterCheckboxGroupEntity;
  value: OptionValue[];
  onChange: (value: OptionValue[]) => void;
  searchSize: SearchSize;
}

function toggleOption(value: OptionValue[], optionValue: OptionValue, checked: boolean) {
  return checked ? [...value, optionValue] : value.filter((v) => v !== optionValue);
}

function CheckboxOptions({
  options,
  value,
  onChange,
}: {
  options: DataGridFilterCheckboxGroupOption[];
  value: OptionValue[];
  onChange: (value: OptionValue[]) => void;
}) {
  return (
    <ul className={styles.list}>
      {options.map((item) => (
        <li key={item.value} className={styles.listItem}>
          <Label>
            <Checkbox
              checked={value.includes(item.value)}
              onCheckedChange={(checked) => onChange(toggleOption(value, item.value, checked))}
            />
            {item.component ? <item.component option={item} /> : <>{item.label}</>}
          </Label>
        </li>
      ))}
    </ul>
  );
}

interface ListProps {
  value: OptionValue[];
  onChange: (value: OptionValue[]) => void;
  searchSize: SearchSize;
}

function ClientCheckboxGroupList({
  options,
  showSearch,
  value,
  onChange,
  searchSize,
}: ListProps & { options: DataGridFilterCheckboxGroupOption[]; showSearch: boolean }) {
  const { searchTerm, setSearchTerm, filteredOptions } = useFilterSearch(options, showSearch);

  return (
    <>
      {showSearch && (
        <FilterControlArea size={searchSize}>
          <FilterOptionsSearchInput value={searchTerm} onValueChange={setSearchTerm} />
        </FilterControlArea>
      )}
      <FilterScrollableWrapper>
        <CheckboxOptions options={filteredOptions} value={value} onChange={onChange} />
      </FilterScrollableWrapper>
    </>
  );
}

function AsyncCheckboxGroupList({
  searchOptions,
  searchDebounce,
  value,
  onChange,
  searchSize,
}: ListProps & {
  searchOptions: DataGridFilterCheckboxGroupOptionsLoader;
  searchDebounce: number | undefined;
}) {
  const { searchTerm, setSearchTerm, options, isLoading } = useAsyncFilterSearch(
    searchOptions,
    searchDebounce,
  );
  const messages = useDataGridMessages();
  // Only show the spinner while there is nothing to display yet, so re-searching
  // with results already on screen does not blank the list.
  const showLoader = isLoading && options.length === 0;

  return (
    <>
      <FilterControlArea size={searchSize}>
        <FilterOptionsSearchInput value={searchTerm} onValueChange={setSearchTerm} />
      </FilterControlArea>
      <FilterScrollableWrapper>
        {showLoader ? (
          <div className={styles.status}>
            <Spinner />
          </div>
        ) : options.length > 0 ? (
          <CheckboxOptions options={options} value={value} onChange={onChange} />
        ) : (
          <div className={styles.status}>{messages.filters.noOptionsFound}</div>
        )}
      </FilterScrollableWrapper>
    </>
  );
}

export function CheckboxGroupList({ filterEntity, ...list }: CheckboxGroupListProps) {
  const { options, search, searchDebounce } = filterEntity.params;

  // Whether `options` is a resolver is fixed for a given entity, so the branch
  // never flips between renders and the two lists keep independent, valid hook
  // order.
  return typeof options === 'function' ? (
    <AsyncCheckboxGroupList searchOptions={options} searchDebounce={searchDebounce} {...list} />
  ) : (
    <ClientCheckboxGroupList options={options} showSearch={search ?? false} {...list} />
  );
}
