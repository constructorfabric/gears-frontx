import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('keeps the default pager on page numbers and the full page text', async () => {
    renderGrid('pgc_default', createLoad());

    await screen.findByText('Item 1');

    expect(screen.getByText(messages.pagination.pageInfo(1, 3, TOTAL))).toBeInTheDocument();
    expect(pager()).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('button', { name: messages.pagination.goToPage(2) })).toBeInTheDocument();
    const previous = screen.getByRole('button', { name: messages.pagination.previousPage });
    expect(previous).toBeDisabled();
    expect(previous).toHaveAttribute('disabled');
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

  it('turns the pager into one non-wrapping line that clips the text instead of spilling', async () => {
    renderGrid('pgc_css', createLoad(), { compact: true });

    await screen.findByText('Item 1');

    // The rules live in pager.module.css and are read at the source level in
    // pager.module.css.test.ts; here the wiring is what a render can see: the compact pager
    // carries the extra class the rules hang off.
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
    renderGrid('pgc_focus', createLoad(), { compact: true });

    await screen.findByText('Item 1');

    const previous = screen.getByRole('button', { name: messages.pagination.previousPage });
    expect(previous).toHaveAttribute('aria-disabled', 'true');
    expect(previous).not.toHaveAttribute('disabled');
    expect(previous).not.toBeDisabled();

    const next = screen.getByRole('button', { name: messages.pagination.nextPage });
    // Enabled here: the primitive reports the state through the attribute either way.
    expect(next.getAttribute('aria-disabled')).not.toBe('true');
    await goToLastPage(next);
    expect(screen.getByRole('button', { name: messages.pagination.nextPage })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

// Walks to the last page by pressing Next until it reports disabled, the way a keyboard user pages.
async function goToLastPage(next: HTMLElement) {
  const user = userEvent.setup();
  for (let i = 0; i < 5; i += 1) {
    if (next.getAttribute('aria-disabled') === 'true') {
      return;
    }
    await user.click(next);
  }
}
