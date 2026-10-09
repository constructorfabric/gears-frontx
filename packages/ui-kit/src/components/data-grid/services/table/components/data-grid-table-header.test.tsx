import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { render } from '../../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../../data-grid';
import type { DataGridLoadResult } from '../../../data-grid-types';
import type { DataGridTableColumn, DataGridTableGroup } from '../table-types';

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    };
  }),
);

interface TestItem {
  id: number;
  name: string;
}

const testColumns: DataGridTableColumn<TestItem>[] = [{ id: 'name', label: 'Name' }];

function load(): Promise<DataGridLoadResult<TestItem>> {
  return Promise.resolve({ results: [{ id: 1, name: 'Item A' }], total: 1 });
}

/**
 * Drives the `stickyHeader` prop after mount from inside the tree, which `rerender` cannot do
 * without losing the providers.
 */
function ControlledGrid({ initial }: { initial: boolean }) {
  const [stickyHeader, setStickyHeader] = useState(initial);

  return (
    <>
      <button type="button" onClick={() => setStickyHeader((value) => !value)}>
        Toggle sticky header
      </button>
      <DataGrid
        name="table_header_test"
        load={load}
        columns={testColumns}
        stickyHeader={stickyHeader}
      />
    </>
  );
}

describe('DataGridTableHeader -- stickyHeader', () => {
  // The grid hands the prop to Table, which marks a sticky one with its own class. CSS-module names
  // are hashed but keep their local name, so the table carrying a "stickyHeader" class is the "on"
  // state and not carrying one the "off" state.
  it('follows the stickyHeader prop after mount, in both directions', async () => {
    const { user } = render(<ControlledGrid initial={false} />);

    const table = await screen.findByRole('table');
    expect(table.className).not.toMatch(/stickyHeader/);

    await user.click(screen.getByRole('button', { name: 'Toggle sticky header' }));
    expect(table.className).toMatch(/stickyHeader/);

    await user.click(screen.getByRole('button', { name: 'Toggle sticky header' }));
    expect(table.className).not.toMatch(/stickyHeader/);
  });
});

const groupedColumns: (DataGridTableColumn<TestItem> | DataGridTableGroup<TestItem>)[] = [
  {
    id: 'identity',
    label: 'Identity',
    columns: [
      { id: 'name', label: 'Name' },
      { id: 'role', label: 'Role' },
    ],
  },
];

describe('DataGridTableHeader -- grouped header', () => {
  // Table pins header cells one by one, so a two-row header would slide its second row under the
  // first. The grid pins the <thead> as one block instead, and only for a header that has two rows:
  // a single-row header is left to the kit. CSS-module names keep their local name, so the class is
  // told by `theadSticky`.
  it.each([
    { groups: true, stickyHeader: true, pinned: true },
    { groups: true, stickyHeader: false, pinned: false },
    { groups: false, stickyHeader: true, pinned: false },
    { groups: false, stickyHeader: false, pinned: false },
  ])(
    'pins the thead as a block: $pinned (groups: $groups, stickyHeader: $stickyHeader)',
    async ({ groups, stickyHeader, pinned }) => {
      render(
        <DataGrid
          name={`grouped_header_${groups}_${stickyHeader}`}
          load={load}
          columns={groups ? groupedColumns : testColumns}
          stickyHeader={stickyHeader}
          persistent="memory"
        />,
      );

      const thead = (await screen.findByRole('table')).querySelector('thead')!;

      if (pinned) {
        expect(thead.className).toMatch(/theadSticky/);
      } else {
        expect(thead.className).not.toMatch(/theadSticky/);
      }
    },
  );

  it('draws the group over its columns, with the columns on a second header row', async () => {
    render(
      <DataGrid
        name="grouped_header_layout"
        load={load}
        columns={groupedColumns}
        persistent="memory"
      />,
    );

    const table = await screen.findByRole('table');
    const rows = table.querySelectorAll('thead tr');
    expect(rows).toHaveLength(2);
    expect(within(table).getByRole('columnheader', { name: 'Identity' })).toHaveAttribute(
      'colspan',
      '2',
    );
    expect(
      within(rows[1] as HTMLElement)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Name', 'Role']);
  });
});

// A real ResizeObserver reports once as soon as it starts observing an element it has a size for.
// This stand-in does the same, on the next tick, and counts how many observers were created -- the
// no-op stub above never reports, so it cannot show a loop that runs through the report.
function installReportingResizeObserver() {
  const created = { observers: 0, reports: 0 };

  vi.stubGlobal(
    'ResizeObserver',
    class implements ResizeObserver {
      private disconnected = false;

      constructor(private callback: ResizeObserverCallback) {
        created.observers += 1;
      }

      observe(target: Element) {
        setTimeout(() => {
          if (this.disconnected) return;
          created.reports += 1;
          const size: ResizeObserverSize = { inlineSize: 120, blockSize: 20 };
          const entry: ResizeObserverEntry = {
            target,
            contentRect: new DOMRect(0, 0, 120, 20),
            borderBoxSize: [size],
            contentBoxSize: [size],
            devicePixelContentBoxSize: [size],
          };
          act(() => this.callback([entry], this));
        }, 0);
      }

      unobserve() {}

      disconnect() {
        this.disconnected = true;
      }
    },
  );

  return created;
}

describe('DataGridTableHeader -- measuring the columns', () => {
  const noopObserver = globalThis.ResizeObserver;

  afterEach(() => {
    vi.stubGlobal('ResizeObserver', noopObserver);
  });

  // Each report writes the column's width to the store, and a new store state rebuilds the header's
  // observer, which reports again. Unless an unchanged width is dropped, that is one new observer
  // per frame for as long as the grid is mounted.
  it('stops re-creating its ResizeObserver once the column widths are known', async () => {
    const created = installReportingResizeObserver();

    render(<DataGrid name="header_measure" load={load} columns={testColumns} persistent="memory" />);
    await screen.findByRole('table');

    await new Promise((resolve) => setTimeout(resolve, 100));
    const settled = created.observers;
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(created.reports).toBeGreaterThan(0);
    expect(created.observers).toBe(settled);
  });
});
