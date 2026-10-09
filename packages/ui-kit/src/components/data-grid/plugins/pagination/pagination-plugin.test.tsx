import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';
import { messages } from '../../messages';
import { useDataGridPluginContext } from '../../services/core/data-grid-context';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { DataGridPaginationPlugin } from './pagination-plugin';

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

const TOTAL = 55;

// A server with 55 records: the page asked for comes back, `total` is always the full count.
function createLoad() {
  return vi.fn(({ pagination }: DataGridLoadContext): Promise<DataGridLoadResult<Item>> => {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 12;
    const start = (page - 1) * limit;
    const results = Array.from({ length: Math.max(0, Math.min(limit, TOTAL - start)) }, (_, i) => ({
      id: start + i + 1,
      name: `Item ${start + i + 1}`,
    }));
    return Promise.resolve({ results, total: TOTAL });
  });
}

function lastPagination(load: ReturnType<typeof createLoad>) {
  return load.mock.lastCall?.[0].pagination;
}

function RefreshButton() {
  const context = useDataGridPluginContext();
  return (
    <button type="button" onClick={() => void context.refresh()}>
      refresh
    </button>
  );
}

function renderGrid(
  name: string,
  load: ReturnType<typeof createLoad>,
  props: Parameters<typeof DataGridPaginationPlugin>[0] = {},
  persistent: 'localStorage' | 'memory' = 'localStorage',
) {
  return render(
    <DataGrid name={name} load={load} columns={columns} persistent={persistent}>
      <DataGridPaginationPlugin {...props} />
      <RefreshButton />
    </DataGrid>,
  );
}

describe('DataGridPaginationPlugin', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads the first page at the default limit and says where the user is', async () => {
    const load = createLoad();
    renderGrid('pg_first', load);

    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(lastPagination(load)).toEqual({ page: 1, limit: 12 });
    expect(screen.getByText(messages.pagination.pageInfo(1, 5, TOTAL))).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: messages.pagination.ariaLabel })).toBeInTheDocument();
  });

  it('goes to the page that was clicked, loads it, and keeps it in storage', async () => {
    const load = createLoad();
    const { user } = renderGrid('pg_click', load);
    await screen.findByText('Item 1');

    await user.click(screen.getByRole('button', { name: messages.pagination.goToPage(3) }));

    expect(await screen.findByText('Item 25')).toBeInTheDocument();
    expect(lastPagination(load)).toEqual({ page: 3, limit: 12 });
    expect(localStorage.getItem('dataGrid:pg_click:pagination')).toBe('{"page":3}');
    expect(screen.getByRole('button', { name: messages.pagination.goToPage(3) })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('still goes to the page that was clicked when storage refuses the write', async () => {
    // A full quota: the page is stored before the load starts, so a throw there would leave the pager
    // on the new page with the old rows.
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    try {
      const load = createLoad();
      const { user } = renderGrid('pg_full_storage', load);
      await screen.findByText('Item 1');

      await user.click(screen.getByRole('button', { name: messages.pagination.goToPage(3) }));

      expect(await screen.findByText('Item 25')).toBeInTheDocument();
      expect(lastPagination(load)).toEqual({ page: 3, limit: 12 });
      expect(setItem).toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it('steps with Previous and Next, and disables each at its end of the range', async () => {
    const load = createLoad();
    const { user } = renderGrid('pg_step', load);
    await screen.findByText('Item 1');

    const previous = screen.getByRole('button', { name: messages.pagination.previousPage });
    const next = screen.getByRole('button', { name: messages.pagination.nextPage });
    expect(previous).toBeDisabled();

    await user.click(next);
    await screen.findByText('Item 13');
    expect(previous).toBeEnabled();

    await user.click(screen.getByRole('button', { name: messages.pagination.goToPage(5) }));
    await screen.findByText('Item 49');
    expect(next).toBeDisabled();

    await user.click(previous);
    expect(await screen.findByText('Item 37')).toBeInTheDocument();
  });

  it('restarts at page 1 with the new size when the page size changes', async () => {
    const load = createLoad();
    const { user } = renderGrid('pg_limit', load, { limits: [12, 24, 48] });
    await screen.findByText('Item 1');
    await user.click(screen.getByRole('button', { name: messages.pagination.goToPage(3) }));
    await screen.findByText('Item 25');

    await user.click(screen.getByRole('button', { name: '24' }));

    expect(await screen.findByText(messages.pagination.pageInfo(1, 3, TOTAL))).toBeInTheDocument();
    expect(lastPagination(load)).toEqual({ page: 1, limit: 24 });
    // A limit that is not the default is stored, with no page beside it.
    expect(localStorage.getItem('dataGrid:pg_limit:pagination')).toBe('{"limit":24}');
  });

  it('draws no page-size selector for a single size', async () => {
    const load = createLoad();
    renderGrid('pg_one_limit', load, { limits: [12] });
    await screen.findByText('Item 1');

    expect(screen.queryByRole('group', { name: messages.pagination.limitSelectorAriaLabel })).toBeNull();
  });

  it('reads a page and a size that were written under the namespaced storage key', async () => {
    // The key a grid wrote before this one existed: `dataGrid:<name>:<state>`, JSON inside.
    localStorage.setItem('dataGrid:pg_stored:pagination', JSON.stringify({ page: 2, limit: 24 }));
    const load = createLoad();
    renderGrid('pg_stored', load, { limits: [12, 24, 48] });

    expect(await screen.findByText('Item 25')).toBeInTheDocument();
    expect(load.mock.calls[0][0].pagination).toEqual({ page: 2, limit: 24 });
    expect(screen.getByText(messages.pagination.pageInfo(2, 3, TOTAL))).toBeInTheDocument();
  });

  it('hides itself when everything fits in the smallest page size, if asked to', async () => {
    const load = createLoad();
    const { rerender } = renderGrid('pg_autohide', load, { limits: [100, 200], autoHide: true });
    await screen.findByText('Item 1');

    expect(screen.queryByRole('navigation', { name: messages.pagination.ariaLabel })).toBeNull();

    rerender(
      <DataGrid name="pg_autohide" load={load} columns={columns} persistent="localStorage">
        <DataGridPaginationPlugin limits={[12, 24]} autoHide />
      </DataGrid>,
    );
    expect(
      await screen.findByRole('navigation', { name: messages.pagination.ariaLabel }),
    ).toBeInTheDocument();
  });

  it('goes back to page 1 when the grid is refreshed', async () => {
    const load = createLoad();
    const { user } = renderGrid('pg_refresh', load);
    await screen.findByText('Item 1');
    await user.click(screen.getByRole('button', { name: messages.pagination.goToPage(2) }));
    await screen.findByText('Item 13');

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(lastPagination(load)).toEqual({ page: 1, limit: 12 });
  });

  it('keeps its page in memory only when the grid persists to memory', async () => {
    const load = createLoad();
    const { user } = renderGrid('pg_memory', load, {}, 'memory');
    await screen.findByText('Item 1');

    await user.click(screen.getByRole('button', { name: messages.pagination.goToPage(2) }));
    await screen.findByText('Item 13');

    expect(localStorage.length).toBe(0);
  });
});
