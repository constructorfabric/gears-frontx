/**
 * Whether a filter value narrows the data: anything but `undefined`, `null`,
 * `''` or an empty array. `0` and `false` are values a filter can hold, such as
 * a tree filter on the item with the id `0`, so they count as active.
 *
 * The filters plugin and the storage service's `hasActiveFilters` both use this,
 * so the filter count and the empty state agree on what an active filter is.
 */
export function isFilterValueActive(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
