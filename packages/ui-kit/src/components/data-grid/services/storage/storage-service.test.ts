import { describe, expect, it } from 'vitest';
import { createDataGrid } from '../../create-data-grid';
import type { DataGridLoadResult } from '../../data-grid-types';
import { internalContextKey } from '../internal/internal-helpers';

interface TestItem {
  id: number;
  name: string;
}

function loadFn(): Promise<DataGridLoadResult<TestItem>> {
  return Promise.resolve({ results: [], total: 0 });
}

// Drives the storage service directly: `createSection` takes the load context a load would have
// produced, which is what `hasActiveFilters` is derived from.
function createStorage(name: string) {
  const grid = createDataGrid<TestItem>({ name, load: { current: loadFn } });

  return grid[internalContextKey].storage;
}

const teamFilter = { teamId: { value: 'team-1' } };
const roleFilter = { role: { value: 'admin' } };

describe('storageService hasActiveFilters', () => {
  it('counts a filter the user applied', () => {
    const storage = createStorage('test_storage_user_filter');

    storage.createSection({ loadContext: { filters: roleFilter } }, []);

    expect(storage.useStore.getState().hasActiveFilters).toBe(true);
  });

  it('ignores an implicit key on its own', () => {
    const storage = createStorage('test_storage_implicit_only');

    storage.updateImplicitFilterKeys(['teamId']);
    storage.createSection({ loadContext: { filters: teamFilter } }, []);

    expect(storage.useStore.getState().hasActiveFilters).toBe(false);
  });

  it('counts a user filter alongside an implicit key', () => {
    const storage = createStorage('test_storage_implicit_and_user');

    storage.updateImplicitFilterKeys(['teamId']);
    storage.createSection({ loadContext: { filters: { ...teamFilter, ...roleFilter } } }, []);

    expect(storage.useStore.getState().hasActiveFilters).toBe(true);
  });

  it('recomputes existing sections when the keys arrive after them', () => {
    const storage = createStorage('test_storage_keys_after_sections');

    storage.createSection({ loadContext: { filters: teamFilter } }, []);
    expect(storage.useStore.getState().hasActiveFilters).toBe(true);

    storage.updateImplicitFilterKeys(['teamId']);

    expect(storage.useStore.getState().hasActiveFilters).toBe(false);
  });
});

describe('storageService hasActiveFilters, by what a filter holds', () => {
  // Which values count as an applied filter. The filters plugin uses the same rule
  // (`utils/is-filter-value-active.ts`), and data-grid.md states it, so a change shows here.
  it.each([
    { label: 'undefined', value: undefined, expected: false },
    { label: 'null', value: null, expected: false },
    { label: 'an empty string', value: '', expected: false },
    { label: 'an empty list', value: [], expected: false },
    // A tree filter on the item with the id 0 holds 0 (#748).
    { label: 'zero', value: 0, expected: true },
    { label: 'false', value: false, expected: true },
    { label: 'true', value: true, expected: true },
    { label: 'a non-empty string', value: 'x', expected: true },
    { label: 'a number', value: 5, expected: true },
    { label: 'a list', value: ['a'], expected: true },
    { label: 'a range', value: { from: '2026-01-01' }, expected: true },
  ])('a filter holding $label makes hasActiveFilters $expected', ({ label, value, expected }) => {
    const storage = createStorage(`test_storage_value_${label.replace(/ /g, '_')}`);

    storage.createSection({ loadContext: { filters: { f: { value } } } }, []);

    expect(storage.useStore.getState().hasActiveFilters).toBe(expected);
  });
});
