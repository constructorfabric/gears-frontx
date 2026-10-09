import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createDataGrid } from '../../create-data-grid';
import type { DataGridConfig, DataGridLoadResult } from '../../data-grid-types';
import { internalContextKey } from '../internal/internal-helpers';
import { COLUMN_VISIBILITY_KEY } from './table-columns-persistence';
import type { ConfigurationColumn, DataGridTableColumn } from './table-types';

interface TestItem {
  id: number;
  name: string;
}

const gridName = 'columns_persistence_test';
const storageKey = `dataGrid:${gridName}:${COLUMN_VISIBILITY_KEY}`;

const columns: DataGridTableColumn<TestItem>[] = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'code', label: 'Code', visible: false },
];

function createGrid(
  config: Partial<DataGridConfig<TestItem>> = {},
  gridColumns: DataGridTableColumn<TestItem>[] = columns,
) {
  const grid = createDataGrid<TestItem>({
    name: gridName,
    load: { current: () => Promise.resolve<DataGridLoadResult<TestItem>>({ results: [], total: 0 }) },
    ...config,
  });

  // Column state is built here, the same way the `columns` effect on `DataGrid` builds it.
  grid.updateColumns(gridColumns);

  return grid;
}

function stored() {
  const raw = localStorage.getItem(storageKey);
  return raw ? JSON.parse(raw) : undefined;
}

function seed(value: Record<string, boolean>) {
  localStorage.setItem(storageKey, JSON.stringify({ columns: value }));
}

describe('tableService -- column visibility persistence', () => {

  function visibleIds(grid: ReturnType<typeof createGrid>) {
    const { result } = renderHook(() => grid[internalContextKey].table.useVisibleColumns());
    return result.current.map((column) => column.id);
  }

  // `useVisibleColumns` filters the grid's own columns, so a stray stored id can never show up
  // there whether or not it reached the visibility map. The configuration entries do see it:
  // they count every truthy entry in that map to decide when the last visible column locks.
  function configurationColumns(grid: ReturnType<typeof createGrid>) {
    const { result } = renderHook(() => grid[internalContextKey].table.useConfigurationColumns());
    return result.current as ConfigurationColumn[];
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('writes nothing unless the grid opted in', () => {
    const grid = createGrid();

    act(() => grid.updateColumnVisibility('email', false));

    expect(localStorage).toHaveLength(0);
  });

  it('ignores a stored selection when the grid did not opt in', () => {
    seed({ email: false });

    expect(visibleIds(createGrid())).toEqual(['name', 'email']);
  });

  it('records only the columns the user toggled', () => {
    const grid = createGrid({ persistentColumnVisibility: true });

    act(() => grid.updateColumnVisibility('email', false));

    expect(stored()).toEqual({ columns: { email: false } });
  });

  it('keeps earlier choices when another column is toggled', () => {
    const grid = createGrid({ persistentColumnVisibility: true });

    act(() => grid.updateColumnVisibility('email', false));
    act(() => grid.updateColumnVisibility('code', true));

    expect(stored()).toEqual({ columns: { email: false, code: true } });
  });

  it('restores a stored selection over the configured defaults', () => {
    seed({ email: false, code: true });

    expect(visibleIds(createGrid({ persistentColumnVisibility: true }))).toEqual(['name', 'code']);
  });

  it('leaves an untouched column following its configured default', () => {
    seed({ email: false });

    // `code` was never toggled, so it keeps `visible: false` from the column config.
    expect(visibleIds(createGrid({ persistentColumnVisibility: true }))).toEqual(['name']);
  });

  it('drops a stored id for a column the grid no longer has', () => {
    seed({ email: false, retired_column: true });

    const entries = configurationColumns(createGrid({ persistentColumnVisibility: true }));

    // `name` is the only column left showing, so its toggle locks. A carried-over
    // `retired_column` would count as a second visible column and unlock it.
    expect(entries.find((entry) => entry.id === 'name')).toMatchObject({
      visible: true,
      visibleToggleDisabled: true,
    });
  });

  it('ignores a stored entry for a column the grid does not let the user toggle', () => {
    // A user hides a column, the grid later locks it with `visibleToggleDisabled`. Applying the
    // stored `false` would leave the column hidden behind a dead switch, with no way back through
    // the configuration panel.
    seed({ email: false });

    const grid = createGrid({ persistentColumnVisibility: true }, [
      { id: 'name', label: 'Name' },
      { id: 'email', label: 'Email', visibleToggleDisabled: true },
      { id: 'code', label: 'Code', visible: false },
    ]);

    expect(visibleIds(grid)).toEqual(['name', 'email']);
  });

  it('ignores stored entries that are not booleans', () => {
    // localStorage is user-editable, so a stored value is untrusted input rather than the
    // shape the grid last wrote. Asserted through the configuration entries, which carry the
    // stored value itself -- the visible-columns list would pass a truthy `'false'` through.
    seed({ email: 'false' } as unknown as Record<string, boolean>);

    const entries = configurationColumns(createGrid({ persistentColumnVisibility: true }));

    expect(entries.find((entry) => entry.id === 'email')?.visible).toBe(true);
  });

  it('does not write a rejected stored entry back on the next toggle', () => {
    seed({ email: 'false' } as unknown as Record<string, boolean>);

    const grid = createGrid({ persistentColumnVisibility: true });
    act(() => grid.updateColumnVisibility('code', true));

    expect(stored()).toEqual({ columns: { code: true } });
  });

  it('stores it in localStorage rather than wherever the grid persists the rest', () => {
    const grid = createGrid({ persistent: 'router', persistentColumnVisibility: true });

    act(() => grid.updateColumnVisibility('email', false));

    expect(stored()).toEqual({ columns: { email: false } });
    expect(window.location.search).toBe('');
    expect(sessionStorage).toHaveLength(0);
  });
});
