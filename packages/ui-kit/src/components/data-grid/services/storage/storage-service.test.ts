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
