import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { render } from '../../__test-utils__/render-with-user';
import { DataGrid } from './data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from './data-grid-types';
import { messages } from './messages';
import { DataGridPaginationPlugin } from './plugins/pagination/pagination-plugin';
import { DataGridTextSearchPlugin } from './plugins/text-search/text-search-plugin';
import type { DataGridTableColumn } from './services/table/table-types';

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

// Two pages of one item each, so the pager renders its page-describing string.
const items: Item[] = [
  { id: 1, name: 'Item A' },
  { id: 2, name: 'Item B' },
];

const columns: DataGridTableColumn<Item>[] = [{ id: 'name', label: 'Name' }];

function createLoad() {
  return vi.fn((context: DataGridLoadContext): Promise<DataGridLoadResult<Item>> => {
    const { page = 1, limit = 1 } = context.pagination ?? {};
    const start = (page - 1) * limit;
    return Promise.resolve({
      results: items.slice(start, start + limit),
      total: items.length,
    });
  });
}

describe('DataGrid messages prop', () => {
  it('renders a given string and a given function message in place of the English ones', async () => {
    const { user } = render(
      <DataGrid
        name="messages_override_grid"
        persistent="memory"
        load={createLoad()}
        columns={columns}
        messages={{
          textSearch: { label: 'Suche' },
          pagination: {
            pageInfo: (page, totalPages, total) => `Seite ${page} von ${totalPages} (${total})`,
          },
        }}
      >
        <DataGridTextSearchPlugin />
        <DataGridPaginationPlugin defaultLimit={1} limits={[1, 2]} />
      </DataGrid>,
    );

    // The string message, through the text search box's name.
    expect(await screen.findByRole('searchbox', { name: 'Suche' })).toBeInTheDocument();

    // The function message, called with the pager's numbers.
    expect(screen.getByText('Seite 1 von 2 (2)')).toBeInTheDocument();

    // The function message keeps feeding the pager after another load: page 2 with the same
    // one-row limit shows the second item through the German template.
    await user.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect(await screen.findByText('Seite 2 von 2 (2)')).toBeInTheDocument();
  });

  it('keeps the English strings for every group the prop does not mention', async () => {
    const { user } = render(
      <DataGrid
        name="messages_partial_grid"
        persistent="memory"
        load={createLoad()}
        columns={columns}
        messages={{ textSearch: { label: 'Suche' } }}
      >
        <DataGridTextSearchPlugin />
        <DataGridPaginationPlugin limits={[1, 2]} />
      </DataGrid>,
    );

    await screen.findByRole('table');

    // The clear button only exists once there is a query to clear: typing brings it up with
    // its English name, a sibling key of the overridden label.
    await user.type(screen.getByRole('searchbox', { name: 'Suche' }), 'Item');
    expect(screen.getByRole('button', { name: messages.textSearch.clear })).toBeInTheDocument();
    // A whole untouched group keeps every one of its strings.
    expect(screen.getByRole('button', { name: messages.pagination.nextPage })).toBeInTheDocument();
    expect(screen.getByText(messages.pagination.pageInfo(1, 1, 2))).toBeInTheDocument();
  });

  it('reaches strings the grid renders outside the plugins, like the empty state', async () => {
    render(
      <DataGrid
        name="messages_empty_grid"
        persistent="memory"
        load={() => Promise.resolve({ results: [], total: 0 })}
        columns={columns}
        messages={{ emptyState: { noResultsFound: 'Nichts gefunden' } }}
      />,
    );

    expect(await screen.findByText('Nichts gefunden')).toBeInTheDocument();
  });
});
