import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadResult } from '../../data-grid-types';
import { messages } from '../../messages';
import { useDataGrid } from '../../services/core/data-grid-context';
import { createDataGridPlugin } from '../../services/plugins/plugins-helpers';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { DataGridTextSearchPlugin } from '../text-search/text-search-plugin';
import { DataGridEmptyStatePlugin } from './empty-state-plugin';

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  }),
);

interface Item {
  id: number;
  name: string;
}

const columns: DataGridTableColumn<Item>[] = [{ id: 'name', label: 'Name' }];

// Module level: the prop is compared by reference.
const implicitFilterKeys = ['teamId'];

function loadNothing(): Promise<DataGridLoadResult<Item>> {
  return Promise.resolve({ results: [], total: 0 });
}

// Stands in for a plugin that scopes the grid to a team: a filter the grid always sends and
// nothing in the toolbar can clear, which is what `implicitFilterKeys` is for.
const TeamScopePlugin = createDataGridPlugin('teamScope', (context) => {
  context.hook('load:context', () => ({ filters: { teamId: { value: 'team-1' } } }));
  return {};
});

function UsersEmptyState() {
  const { useStore } = useDataGrid();
  const hasActiveFilters = useStore((s) => s.hasActiveFilters);

  return hasActiveFilters ? (
    <p>No matching users</p>
  ) : (
    <div>
      <p>No users yet</p>
      <button type="button">Create your first user</button>
    </div>
  );
}

describe('DataGridEmptyStatePlugin', () => {
  it('replaces the built-in state, and tells "nothing here yet" from "nothing matched"', async () => {
    const { user } = render(
      <DataGrid
        name="es_custom"
        load={loadNothing}
        columns={columns}
        persistent="memory"
        implicitFilterKeys={implicitFilterKeys}
      >
        <TeamScopePlugin />
        <DataGridTextSearchPlugin />
        <DataGridEmptyStatePlugin component={UsersEmptyState} />
      </DataGrid>,
    );

    // The team filter is implicit, so an empty grid reads as "nothing here yet" rather than
    // "nothing matched" -- and the table chrome stays down.
    expect(await screen.findByText('No users yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create your first user' })).toBeInTheDocument();
    expect(screen.queryByText(messages.emptyState.noResultsFound)).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // Searching is a filter the user owns, so the same slot swaps to the filtered copy and the
    // table chrome comes back for them to clear it from.
    await user.type(await screen.findByRole('searchbox'), 'nothing matches this');

    expect(await screen.findByText('No matching users')).toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('No users yet')).not.toBeInTheDocument();
  });

  it('draws what its component draws, with no fall back to the built-in copy', async () => {
    const load = vi.fn(loadNothing);
    render(
      <DataGrid name="es_blank" load={load} columns={columns} persistent="memory">
        <DataGridEmptyStatePlugin component={() => <p>Nothing to see</p>} />
      </DataGrid>,
    );

    expect(await screen.findByText('Nothing to see')).toBeInTheDocument();
    expect(load).toHaveBeenCalled();
    expect(screen.queryByText(messages.emptyState.noResultsFound)).not.toBeInTheDocument();
  });
});
