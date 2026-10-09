import { screen, within } from '@testing-library/react';
import { Activity, StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../__test-utils__/render-with-user';
import { createSignalAwareLoad } from '../../__test-utils__/signal-aware-load';
import { DataGrid } from './data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from './data-grid-types';
import { messages } from './messages';
import { useDataGrid, useDataGridPluginContext } from './services/core/data-grid-context';
import { createDataGridPlugin } from './services/plugins/plugins-helpers';
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
  role: string;
}

const columns: DataGridTableColumn<Item>[] = [
  { id: 'name', label: 'Name' },
  { id: 'role', label: 'Role' },
];

const items: Item[] = [
  { id: 1, name: 'Alice', role: 'Admin' },
  { id: 2, name: 'Bob', role: 'Viewer' },
];

function loadItems(): Promise<DataGridLoadResult<Item>> {
  return Promise.resolve({ results: items, total: items.length });
}

function RefreshButton() {
  const context = useDataGridPluginContext();
  return (
    <button type="button" onClick={() => void context.refresh({ resetFilters: false })}>
      refresh
    </button>
  );
}

describe('DataGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws a header cell per column and a row per record', async () => {
    render(<DataGrid name="dg_basic" load={loadItems} columns={columns} persistent="memory" />);

    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Name',
      'Role',
    ]);
    const bodyRows = within(table)
      .getAllByRole('row')
      .filter((row) => row.closest('tbody'));
    expect(bodyRows).toHaveLength(2);
    expect(within(bodyRows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Bob',
      'Viewer',
    ]);
  });

  it('hands load an abort signal, and aborts it when the grid goes away mid-load', async () => {
    let signal: AbortSignal | undefined;
    const load = vi.fn((context: DataGridLoadContext): Promise<DataGridLoadResult<Item>> => {
      signal = context.signal;
      return new Promise(() => {});
    });
    const { unmount } = render(
      <DataGrid name="dg_abort" load={load} columns={columns} persistent="memory" />,
    );
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('calls the latest `load` the grid was given, not the one it mounted with', async () => {
    const first = vi.fn(loadItems);
    const second = vi.fn(loadItems);

    function LoadTrigger() {
      const context = useDataGridPluginContext();
      return (
        <button type="button" onClick={() => void context.triggerLoad().promise}>
          reload
        </button>
      );
    }

    function Host() {
      const [useSecond, setUseSecond] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setUseSecond(true)}>
            switch
          </button>
          <DataGrid
            name="dg_latest"
            load={useSecond ? second : first}
            columns={columns}
            persistent="memory"
          >
            <LoadTrigger />
          </DataGrid>
        </>
      );
    }

    const { user } = render(<Host />);
    await screen.findByRole('table');
    expect(first).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'switch' }));
    await user.click(screen.getByRole('button', { name: 'reload' }));

    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).toHaveBeenCalledTimes(1);
  });

  describe('a load that fails', () => {
    it('shows the error view instead of the grid, and logs why', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <DataGrid
          name="dg_failing"
          load={() => Promise.reject(new Error('backend down'))}
          columns={columns}
          persistent="memory"
        />,
      );

      expect(await screen.findByText(messages.loadError.headerDefault)).toBeInTheDocument();
      expect(screen.getByText(messages.loadError.bodyDefault)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(logged).toHaveBeenCalledWith('[DataGrid] Initial load failed:', expect.any(Error));
    });

    it('treats a result without `results` as a failure, not as an empty grid', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <DataGrid
          name="dg_malformed"
          // The type forbids it; an untyped caller (or a changed API) does not.
          load={() => Promise.resolve({} as DataGridLoadResult<Item>)}
          columns={columns}
          persistent="memory"
        />,
      );

      expect(await screen.findByText(messages.loadError.headerDefault)).toBeInTheDocument();
    });
  });

  describe('a load that the grid aborts itself', () => {
    // A refresh aborts the first load. That is the refresh doing its job, so the grid waits for the
    // newer load instead of showing the error view for good.
    it('shows the newer load, not the error view, when a refresh supersedes the first load', async () => {
      const { load, pending } = createSignalAwareLoad(items);
      const { user } = render(
        <DataGrid name="dg_refresh_first_load" load={load} columns={columns} persistent="memory">
          <RefreshButton />
        </DataGrid>,
      );
      await vi.waitFor(() => expect(pending).toHaveLength(1));

      await user.click(screen.getByRole('button', { name: 'refresh' }));
      await vi.waitFor(() => expect(pending).toHaveLength(2));
      pending[1].succeed();

      expect(await screen.findByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText(messages.loadError.headerDefault)).not.toBeInTheDocument();
    });

    // Until the refresh lands nothing has loaded, so the grid keeps its first-load loader. Marked
    // loaded while it waits, the grid would say "No results found" under the overlay first.
    it('keeps the loader, not "No results found", while the refresh that superseded the first load runs', async () => {
      const { load, pending } = createSignalAwareLoad(items);
      const { user } = render(
        <DataGrid name="dg_refresh_loader" load={load} columns={columns} persistent="memory">
          <RefreshButton />
        </DataGrid>,
      );
      await vi.waitFor(() => expect(pending).toHaveLength(1));

      await user.click(screen.getByRole('button', { name: 'refresh' }));
      await vi.waitFor(() => expect(pending).toHaveLength(2));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByText(messages.emptyState.noResultsFound)).not.toBeInTheDocument();

      pending[1].succeed();

      expect(await screen.findByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText(messages.emptyState.noResultsFound)).not.toBeInTheDocument();
    });

    it('does not log a failed first load when the grid unmounts during it', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { load, pending } = createSignalAwareLoad(items);
      const { unmount } = render(
        <DataGrid name="dg_unmount_first_load" load={load} columns={columns} persistent="memory" />,
      );
      await vi.waitFor(() => expect(pending).toHaveLength(1));

      unmount();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(logged).not.toHaveBeenCalledWith('[DataGrid] Initial load failed:', expect.anything());
    });

    // Search and sort start a refresh without a catch, so a rejection left over when the grid goes
    // away is one the host's global handler would report.
    it('leaks no rejection when the grid unmounts during a refresh', async () => {
      const rejections: unknown[] = [];
      const onRejection = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onRejection);

      try {
        const { load, pending } = createSignalAwareLoad(items);
        const { user, unmount } = render(
          <DataGrid name="dg_unmount_refresh" load={load} columns={columns} persistent="memory">
            <RefreshButton />
          </DataGrid>,
        );
        await vi.waitFor(() => expect(pending).toHaveLength(1));
        pending[0].succeed();
        await screen.findByText('Alice');
        await user.click(screen.getByRole('button', { name: 'refresh' }));
        await vi.waitFor(() => expect(pending).toHaveLength(2));

        unmount();
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(rejections).toEqual([]);
      } finally {
        process.off('unhandledRejection', onRejection);
      }
    });
  });

  describe('a grid that goes away while its first load is in flight', () => {
    function HideableGrid({ load }: { load: (context: DataGridLoadContext) => Promise<DataGridLoadResult<Item>> }) {
      const [visible, setVisible] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setVisible((value) => !value)}>
            toggle
          </button>
          <Activity mode={visible ? 'visible' : 'hidden'}>
            <DataGrid name="dg_activity" load={load} columns={columns} persistent="memory">
              <RefreshButton />
            </DataGrid>
          </Activity>
        </>
      );
    }

    // `Activity` runs the grid's effect cleanup when it hides, which aborts the load in flight, and
    // its effects again when it shows. The grid has to ask again then: what was aborted never
    // loaded, so there is nothing to show until it does.
    it('loads again when it is shown after being hidden mid-load', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { load, pending } = createSignalAwareLoad(items);
      const { user } = render(<HideableGrid load={load} />);
      await vi.waitFor(() => expect(pending).toHaveLength(1));

      await user.click(screen.getByRole('button', { name: 'toggle' }));
      expect(pending[0].signal?.aborted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await user.click(screen.getByRole('button', { name: 'toggle' }));

      await vi.waitFor(() => expect(pending).toHaveLength(2));
      pending[1].succeed();
      expect(await screen.findByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText(messages.loadError.headerDefault)).not.toBeInTheDocument();
      expect(logged).not.toHaveBeenCalledWith('[DataGrid] Initial load failed:', expect.anything());
    });

    // The first load was superseded by a refresh, which is what carries the data now. Hiding the
    // grid cuts that refresh off, so the grid has loaded nothing, and showing it has to ask again.
    it('loads again when it is shown after being hidden during the refresh that superseded the first load', async () => {
      const { load, pending } = createSignalAwareLoad(items);
      const { user } = render(<HideableGrid load={load} />);
      await vi.waitFor(() => expect(pending).toHaveLength(1));
      await user.click(screen.getByRole('button', { name: 'refresh' }));
      await vi.waitFor(() => expect(pending).toHaveLength(2));

      await user.click(screen.getByRole('button', { name: 'toggle' }));
      expect(pending[1].signal?.aborted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await user.click(screen.getByRole('button', { name: 'toggle' }));

      await vi.waitFor(() => expect(pending).toHaveLength(3));
      expect(screen.queryByText(messages.emptyState.noResultsFound)).not.toBeInTheDocument();
      pending[2].succeed();
      expect(await screen.findByText('Alice')).toBeInTheDocument();
    });

    // The reverse order: React mounts, unmounts and mounts a component again in development. The
    // cleanup comes before the first load has started, so nothing is aborted and nothing has to be
    // asked twice.
    it('asks for the first load once under StrictMode', async () => {
      const { load, pending } = createSignalAwareLoad(items);
      render(
        <StrictMode>
          <DataGrid name="dg_strict" load={load} columns={columns} persistent="memory" />
        </StrictMode>,
      );
      await vi.waitFor(() => expect(pending).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(pending).toHaveLength(1);
      expect(pending[0].signal?.aborted).toBe(false);

      pending[0].succeed();

      expect(await screen.findByText('Alice')).toBeInTheDocument();
      expect(pending).toHaveLength(1);
    });
  });

  describe('with no records', () => {
    it('says "No results found" and nothing more when nothing is filtered', async () => {
      render(
        <DataGrid
          name="dg_empty"
          load={() => Promise.resolve({ results: [], total: 0 })}
          columns={columns}
          persistent="memory"
        />,
      );

      expect(await screen.findByText(messages.emptyState.noResultsFound)).toBeInTheDocument();
      expect(
        screen.queryByText(messages.emptyState.noResultsFoundDescription),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('suggests adjusting the filters, and keeps the table, once a filter is applied', async () => {
      const FilterPlugin = createDataGridPlugin('someFilter', (context) => {
        context.hook('load:context', () => ({ filters: { status: { value: 'archived' } } }));
        return {};
      });
      render(
        <DataGrid
          name="dg_empty_filtered"
          load={() => Promise.resolve({ results: [], total: 0 })}
          columns={columns}
          persistent="memory"
        >
          <FilterPlugin />
        </DataGrid>,
      );

      expect(await screen.findByText(messages.emptyState.noResultsFound)).toBeInTheDocument();
      expect(screen.getByText(messages.emptyState.noResultsFoundDescription)).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('reaches a plugin component rendered as a child through useDataGrid', async () => {
    function RecordCount() {
      const { useStore } = useDataGrid<Item>();
      const count = useStore((s) => s.visibleRecords.length);
      return <output>{count} records</output>;
    }

    render(
      <DataGrid name="dg_child" load={loadItems} columns={columns} persistent="memory">
        <RecordCount />
      </DataGrid>,
    );

    expect(await screen.findByText('2 records')).toBeInTheDocument();
  });

  it('refuses useDataGrid outside a grid', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Orphan() {
      useDataGrid();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow('useDataGrid must be used within a DataGrid');
  });
});
