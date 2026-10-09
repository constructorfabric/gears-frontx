import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';
import { messages } from '../../messages';
import { useDataGridPluginContext } from '../../services/core/data-grid-context';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { DataGridTextSearchPlugin, type DataGridTextSearchPluginProps } from './text-search-plugin';

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

function createLoad() {
  return vi.fn((context: DataGridLoadContext): Promise<DataGridLoadResult<Item>> => {
    void context;
    return Promise.resolve({ results: [{ id: 1, name: 'Item A' }], total: 1 });
  });
}

function searchOf(load: ReturnType<typeof createLoad>, key = 'textSearch') {
  return load.mock.lastCall?.[0].filters?.[key]?.value;
}

// The debounce is 300 ms of real time: these tests wait it out rather than fake the clock, because
// Testing Library's async wrapper only knows Jest's fake timers and hangs user-event under Vitest's.
const afterDebounce = { timeout: 1500 };

function settle(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ResetButton() {
  const context = useDataGridPluginContext();
  return (
    <button type="button" onClick={() => void context.refresh({ resetFilters: true })}>
      reset
    </button>
  );
}

function renderGrid(
  name: string,
  load: ReturnType<typeof createLoad>,
  props: DataGridTextSearchPluginProps = {},
) {
  return render(
    <DataGrid name={name} load={load} columns={columns} persistent="localStorage">
      <DataGridTextSearchPlugin {...props} />
      <ResetButton />
    </DataGrid>,
  );
}

describe('DataGridTextSearchPlugin', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the typed text at once and loads once, with all of it, after typing stops', async () => {
    const load = createLoad();
    const { user } = renderGrid('ts_debounce', load);
    await screen.findByText('Item A');
    expect(load).toHaveBeenCalledTimes(1);

    await user.type(screen.getByRole('searchbox'), 'Joh');

    expect(screen.getByRole('searchbox')).toHaveValue('Joh');
    expect(load).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2), afterDebounce);
    expect(searchOf(load)).toBe('Joh');
  });

  it('puts the box in the top-start slot with the default or the given placeholder', async () => {
    const load = createLoad();
    const { rerender } = renderGrid('ts_placeholder', load);

    expect(await screen.findByPlaceholderText(messages.textSearch.placeholder)).toBeInTheDocument();

    rerender(
      <DataGrid name="ts_placeholder" load={load} columns={columns} persistent="localStorage">
        <DataGridTextSearchPlugin placeholder="Find a user" />
      </DataGrid>,
    );
    expect(await screen.findByPlaceholderText('Find a user')).toBeInTheDocument();
  });

  it('sends the search under the configured filter key', async () => {
    const load = createLoad();
    const { user } = renderGrid('ts_key', load, { filterKey: 'q' });
    await screen.findByText('Item A');

    await user.type(screen.getByRole('searchbox'), 'x');
    await waitFor(() => expect(searchOf(load, 'q')).toBe('x'), afterDebounce);

    expect(searchOf(load)).toBeUndefined();
  });

  it('clears at once, without waiting for the debounce, and keeps focus in the field', async () => {
    const load = createLoad();
    const { user } = renderGrid('ts_clear', load);
    await screen.findByText('Item A');
    const box = screen.getByRole('searchbox');
    expect(screen.queryByRole('button', { name: messages.textSearch.clear })).toBeNull();

    await user.type(box, 'abc');
    const calls = load.mock.calls.length;

    await user.click(screen.getByRole('button', { name: messages.textSearch.clear }));

    expect(box).toHaveValue('');
    expect(box).toHaveFocus();
    await waitFor(() => expect(load.mock.calls.length).toBe(calls + 1));
    expect(searchOf(load)).toBeUndefined();

    // The cancelled debounce does not load again behind it.
    await settle(500);
    expect(load.mock.calls.length).toBe(calls + 1);
    expect(screen.queryByRole('button', { name: messages.textSearch.clear })).toBeNull();
  });

  it('keeps the query in storage and restores it into the first load', async () => {
    localStorage.setItem('dataGrid:ts_stored:textSearch', JSON.stringify({ query: 'stored' }));
    const load = createLoad();
    renderGrid('ts_stored', load);

    expect(await screen.findByDisplayValue('stored')).toBeInTheDocument();
    expect(load.mock.calls[0][0].filters?.textSearch?.value).toBe('stored');
  });

  it('writes the committed query, and removes it when the box is emptied', async () => {
    const load = createLoad();
    const { user } = renderGrid('ts_write', load);
    await screen.findByText('Item A');

    await user.type(screen.getByRole('searchbox'), 'ab');
    await waitFor(
      () => expect(localStorage.getItem('dataGrid:ts_write:textSearch')).toBe('{"query":"ab"}'),
      afterDebounce,
    );

    await user.click(screen.getByRole('button', { name: messages.textSearch.clear }));
    expect(localStorage.getItem('dataGrid:ts_write:textSearch')).toBeNull();
  });

  it('is emptied by a refresh that resets filters', async () => {
    localStorage.setItem('dataGrid:ts_reset:textSearch', JSON.stringify({ query: 'stored' }));
    const load = createLoad();
    const { user } = renderGrid('ts_reset', load);
    await screen.findByDisplayValue('stored');

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(localStorage.getItem('dataGrid:ts_reset:textSearch')).toBeNull();
    expect(searchOf(load)).toBeUndefined();
  });
});
