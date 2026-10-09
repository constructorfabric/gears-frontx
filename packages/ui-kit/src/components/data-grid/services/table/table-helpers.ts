import type { DataGridItem } from '../../data-grid-types';
import type { DataGridTableColumn } from './table-types';

export function resolveLabel(label: string | (() => string)): string {
  return typeof label === 'function' ? label() : label;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Resolves a body cell's plain-string display value — the same value the default cell renderer
 * shows — or `undefined` when the column uses `component`/`render` (output the kit cannot safely
 * stringify, e.g. for an auto-set `title` fallback). Shared by `DataGridBodyCellContent` (the
 * renderer) and `resolveBodyCellProps` (the `title` fallback for `cellOverflow: 'nowrap'`) so the
 * two never drift on what counts as "plain string" content.
 */
export function resolveCellDisplayValue<TItem extends DataGridItem>(
  column: DataGridTableColumn<TItem>,
  item: TItem,
): string | undefined {
  if (column.render || column.component) return undefined;

  const key = column.key ?? column.id;
  const rawValue = key.includes('.') ? getNestedValue(item, key) : item[key];

  if (column.formatter) return column.formatter(rawValue);

  return rawValue != null ? String(rawValue) : '';
}
