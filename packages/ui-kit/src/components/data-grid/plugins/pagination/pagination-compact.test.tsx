import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';
import { messages } from '../../messages';
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

// Three pages at the default limit of 12: 30 records, 12 + 12 + 6.
const TOTAL = 30;

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

function renderGrid(
  name: string,
  load: ReturnType<typeof createLoad>,
  props: Parameters<typeof DataGridPaginationPlugin>[0] = {},
) {
  return render(
    <DataGrid name={name} load={load} columns={columns} persistent="memory">
      <DataGridPaginationPlugin {...props} />
    </DataGrid>,
  );
}

function pager() {
  return screen.getByRole('navigation', { name: messages.pagination.ariaLabel });
}

describe('DataGridPaginationPlugin -- compact', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('swaps the page text for the compact one and drops the numbered buttons', async () => {
    renderGrid('pgc_compact', createLoad(), { compact: true });

    await screen.findByText('Item 1');

    // The compact line drops the item count: the position is all it says.
    expect(screen.getByText(messages.pagination.pageInfoCompact(1, 3))).toBeInTheDocument();
    expect(screen.queryByText(messages.pagination.pageInfo(1, 3, TOTAL))).toBeNull();
    expect(screen.queryByRole('button', { name: messages.pagination.goToPage(2) })).toBeNull();
  });

  it('follows the compact prop through a rerender in both directions', async () => {
    const load = createLoad();
    const view = renderGrid('pgc_rerender', load);
    await screen.findByText('Item 1');

    view.rerender(
      <DataGrid name="pgc_rerender" load={load} columns={columns} persistent="memory">
        <DataGridPaginationPlugin compact />
      </DataGrid>,
    );
    await screen.findByText(messages.pagination.pageInfoCompact(1, 3));

    // Back the explicit way: an absent prop means "no change" to the plugin, the same as the
    // other config props.
    view.rerender(
      <DataGrid name="pgc_rerender" load={load} columns={columns} persistent="memory">
        <DataGridPaginationPlugin compact={false} />
      </DataGrid>,
    );
    expect(await screen.findByText(messages.pagination.pageInfo(1, 3, TOTAL))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: messages.pagination.goToPage(2) })).toBeInTheDocument();
  });

  it('puts the compact style on the compact pager only', async () => {
    const load = createLoad();
    const view = renderGrid('pgc_css', load);
    await screen.findByText('Item 1');

    // The rules live in pager.module.css and are read at the source level in
    // pager.module.css.test.ts; here the wiring is what a render can see: the class the rules
    // hang off, on the compact pager and not on the default one.
    expect(pager().className).not.toContain('compact');

    view.rerender(
      <DataGrid name="pgc_css" load={load} columns={columns} persistent="memory">
        <DataGridPaginationPlugin compact />
      </DataGrid>,
    );
    await screen.findByText(messages.pagination.pageInfoCompact(1, 3));

    expect(pager().className).toContain('compact');
  });

  it('announces page changes from the compact text alone', async () => {
    renderGrid('pgc_live', createLoad(), { compact: true });

    await screen.findByText('Item 1');

    const info = screen.getByText(messages.pagination.pageInfoCompact(1, 3));
    expect(info).toHaveAttribute('aria-live', 'polite');
    expect(info).toHaveAttribute('aria-atomic', 'true');
  });

  it('keeps the default pager out of the live-region business', async () => {
    renderGrid('pgc_live_off', createLoad());

    await screen.findByText('Item 1');

    expect(screen.getByText(messages.pagination.pageInfo(1, 3, TOTAL))).not.toHaveAttribute(
      'aria-live',
    );
  });

  it('keeps Previous and Next focusable while disabled in the compact pager', async () => {
    const { user } = renderGrid('pgc_focus', createLoad(), { compact: true });

    await screen.findByText('Item 1');

    const previous = screen.getByRole('button', { name: messages.pagination.previousPage });
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(previous).not.toHaveAttribute('disabled');

    await goToLastPage(user);

    await waitFor(() => {
      const next = screen.getByRole('button', { name: messages.pagination.nextPage });
      expect(next).toHaveAttribute('aria-disabled', 'true');
      expect(next).not.toHaveAttribute('disabled');
      expect(next).toHaveFocus();
    });
  });

  it('leaves the page where it is on a press of the disabled Previous', async () => {
    const load = createLoad();
    const { user } = renderGrid('pgc_disabled_press', load, { compact: true });

    await screen.findByText('Item 1');
    const loads = load.mock.calls.length;

    await user.click(screen.getByRole('button', { name: messages.pagination.previousPage }));

    expect(screen.getByText(messages.pagination.pageInfoCompact(1, 3))).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(loads);
  });
});

// Walks to the last page by pressing Next, the way a keyboard user pages, and fails at once when
// the walk does not get there.
async function goToLastPage(user: ReturnType<typeof render>['user']) {
  for (let page = 2; page <= 3; page += 1) {
    await user.click(screen.getByRole('button', { name: messages.pagination.nextPage }));
    await screen.findByText(messages.pagination.pageInfoCompact(page, 3));
  }
}
