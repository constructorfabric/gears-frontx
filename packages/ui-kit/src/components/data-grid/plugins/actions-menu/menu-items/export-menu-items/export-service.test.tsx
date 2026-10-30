import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createGridPluginContext } from '../../../../../../__test-utils__/grid-plugin-context';
import { render } from '../../../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../../../data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from '../../../../data-grid-types';
import { messages } from '../../../../messages';
import { useDataGridPluginContext } from '../../../../services/core/data-grid-context';
import type { DataGridPluginContext } from '../../../../services/plugins/plugins-types';
import type { DataGridTableColumn } from '../../../../services/table/table-types';
import { DataGridPaginationPlugin } from '../../../pagination/pagination-plugin';
import { DataGridTableTreePlugin } from '../../../table-tree/table-tree-plugin';
import { DataGridTextSearchPlugin } from '../../../text-search/text-search-plugin';
import type { DataGridTextSearchPluginApi } from '../../../text-search/text-search-plugin';
import { createExportService, generateFilename } from './export-service';
import type { DataGridExportColumn } from './export-types';

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  }),
);

describe('generateFilename', () => {
  it('generates timestamped filename when no filename provided', () => {
    const result = generateFilename(undefined, 'csv');

    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/);
  });

  it('appends extension to string filename without it', () => {
    expect(generateFilename('MyReport', 'csv')).toBe('MyReport.csv');
    expect(generateFilename('Data', 'xlsx')).toBe('Data.xlsx');
  });

  it('does not double extension if already present', () => {
    expect(generateFilename('MyReport.csv', 'csv')).toBe('MyReport.csv');
    expect(generateFilename('Data.xlsx', 'xlsx')).toBe('Data.xlsx');
  });

  it('calls function filename', () => {
    const fn = () => 'custom-name.csv';
    expect(generateFilename(fn, 'csv')).toBe('custom-name.csv');
  });
});

interface Named {
  id: string;
  name: string;
}

describe('downloading', () => {
  let gridContext: DataGridPluginContext<Named>;
  const columns: DataGridExportColumn[] = [{ id: 'name', label: 'Name' }];

  beforeAll(async () => {
    gridContext = await createGridPluginContext<Named>([{ id: '0', name: 'Placeholder' }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the file to an anchor that is clicked and removed, and revokes its URL', () => {
    const created = vi.fn(() => 'blob:report');
    const revoked = vi.fn();
    URL.createObjectURL = created;
    URL.revokeObjectURL = revoked;
    const downloads: { name: string; href: string; attached: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(
      this: HTMLAnchorElement,
    ) {
      downloads.push({ name: this.download, href: this.href, attached: this.isConnected });
    });

    createExportService<Named>().downloadFile('a,b', 'report.csv', 'text/csv');

    expect(downloads).toEqual([{ name: 'report.csv', href: 'blob:report', attached: true }]);
    expect(revoked).toHaveBeenCalledWith('blob:report');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('reports a failure to onError, as an Error, when there is one, and throws it otherwise', async () => {
    const service = createExportService<Named>();
    const failing = {
      name: () => {
        throw new Error('A transformer failed');
      },
    };
    const onError = vi.fn();

    await service.exportToCSV([{ id: '1', name: 'Alice' }], columns, { onError, transformCellText: failing }, gridContext);
    expect(onError).toHaveBeenCalledWith(new Error('A transformer failed'));

    await expect(
      service.exportToCSV([{ id: '1', name: 'Alice' }], columns, { transformCellText: failing }, gridContext),
    ).rejects.toThrow('A transformer failed');
  });

  it('makes an Error of a thrown value that is not one, for onError', async () => {
    const onError = vi.fn();

    await createExportService<Named>().exportToCSV(
      [{ id: '1', name: 'Alice' }],
      columns,
      {
        onError,
        transformCellText: {
          name: () => {
            // A consumer's callback can throw anything.
            throw 'plain text';
          },
        },
      },
      gridContext,
    );

    expect(onError).toHaveBeenCalledWith(new Error('plain text'));
  });

  it('reports an Excel export that has no loader to onError', async () => {
    const onError = vi.fn();

    await createExportService<Named>().exportToExcel(
      [{ id: '1', name: 'Alice' }],
      columns,
      { onError },
      gridContext,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Exporting to Excel needs `loadExcelJs`') }),
    );
  });
});

describe('getAllData', () => {
  interface Node {
    id: number;
    name: string;
    parent_id: number | null;
    has_children: boolean;
  }

  const columns: DataGridTableColumn<Node>[] = [{ id: 'name', label: 'Name' }];
  const hasChildren = (node: Node) => node.has_children;

  // Every id and name of what a grid of nodes exports, in order.
  const names = (nodes: Node[]) => nodes.map((node) => node.name);

  async function renderForExport(
    name: string,
    load: (context: DataGridLoadContext) => Promise<DataGridLoadResult<Node>>,
    plugins: React.ReactNode,
    firstRow: string,
  ) {
    let context: DataGridPluginContext<Node> | undefined;
    function Probe() {
      context = useDataGridPluginContext<Node>();
      return null;
    }
    const { user } = render(
      <DataGrid<Node> name={name} persistent="memory" load={load} columns={columns}>
        {plugins}
        <Probe />
      </DataGrid>,
    );
    await screen.findByText(firstRow);
    if (!context) throw new Error('The grid did not render its children');
    lastUser = user;
    return context;
  }

  // The user of the grid `renderForExport` rendered last, for a test that has to click in it.
  let lastUser: ReturnType<typeof render>['user'];

  const flat: Node[] = [
    { id: 1, name: 'Electronics', parent_id: null, has_children: true },
    { id: 2, name: 'Books', parent_id: null, has_children: false },
    { id: 3, name: 'Phones', parent_id: 1, has_children: false },
    { id: 4, name: 'Laptops', parent_id: 1, has_children: false },
    { id: 5, name: 'Clothing', parent_id: null, has_children: false },
  ];

  const roots = flat.filter((node) => node.parent_id === null);
  const childrenOf = (parentId: number) => flat.filter((node) => node.parent_id === parentId);

  // A lazy source: the rows of one level at a time, the roots a page at a time.
  function loadLevel(context: DataGridLoadContext): Promise<DataGridLoadResult<Node>> {
    const parentId = context.tree?.parentId;
    if (parentId !== null && parentId !== undefined) {
      const children = childrenOf(parentId);
      return Promise.resolve({ results: children, total: children.length });
    }
    const page = context.pagination?.page ?? 1;
    const limit = context.pagination?.limit ?? roots.length;
    return Promise.resolve({
      results: roots.slice((page - 1) * limit, page * limit),
      total: roots.length,
    });
  }

  it('is what is on screen when no plugin makes there be more', async () => {
    const context = await renderForExport(
      'export_all_plain',
      () => Promise.resolve({ results: roots, total: roots.length }),
      null,
      'Electronics',
    );

    expect(names(await createExportService<Node>().getAllData(context))).toEqual([
      'Electronics',
      'Books',
      'Clothing',
    ]);
  });

  it('reads every page, and leaves the grid on the page it was on', async () => {
    const load = vi.fn(loadLevel);
    const context = await renderForExport(
      'export_all_pages',
      load,
      <DataGridPaginationPlugin defaultLimit={2} limits={[2]} />,
      'Electronics',
    );
    expect(screen.queryByText('Clothing')).toBeNull();

    const data = await createExportService<Node>().getAllData(context);

    expect(names(data)).toEqual(['Electronics', 'Books', 'Clothing']);
    // Page 1 of the grid is still what the grid shows: the pages that were read are not stored.
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(screen.queryByText('Clothing')).toBeNull();
    expect(load.mock.calls.map(([call]) => call.pagination?.page)).toEqual([1, 1, 2]);
  });

  it('starts from the first page whichever page the grid is on', async () => {
    const context = await renderForExport(
      'export_all_from_page_two',
      loadLevel,
      <DataGridPaginationPlugin defaultLimit={2} limits={[2]} />,
      'Electronics',
    );
    await lastUser.click(screen.getByRole('button', { name: messages.pagination.nextPage }));
    await screen.findByText('Clothing');
    expect(screen.queryByText('Electronics')).toBeNull();

    const data = await createExportService<Node>().getAllData(context);

    // The page on screen is the last one, and the export still has the rows of the first.
    expect(names(data)).toEqual(['Electronics', 'Books', 'Clothing']);
  });

  it('stops at a page that is not full, and asks for no page after it, when the load gives no total', async () => {
    const withoutTotal = vi.fn(async (context: DataGridLoadContext) => {
      const { results } = await loadLevel(context);
      return { results };
    });
    const context = await renderForExport(
      'export_all_no_total',
      withoutTotal,
      <DataGridPaginationPlugin defaultLimit={2} limits={[2]} />,
      'Electronics',
    );
    withoutTotal.mockClear();

    const data = await createExportService<Node>().getAllData(context);

    expect(names(data)).toEqual(['Electronics', 'Books', 'Clothing']);
    // Two roots, then the one that is left, which is short: a fourth, empty, page is not asked for.
    expect(withoutTotal.mock.calls.map(([call]) => call.pagination?.page)).toEqual([1, 2]);
  });

  it('reads the pages with the search the grid has, so the export is of what the grid is filtered to', async () => {
    const load = vi.fn(loadLevel);
    const context = await renderForExport(
      'export_all_filtered',
      load,
      <>
        <DataGridTextSearchPlugin />
        <DataGridPaginationPlugin defaultLimit={2} limits={[2]} />
      </>,
      'Electronics',
    );
    context.getPlugin<DataGridTextSearchPluginApi>('textSearch')?.setSearch('Boo');
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(1));
    load.mockClear();

    await createExportService<Node>().getAllData(context);

    expect(load).toHaveBeenCalled();
    for (const [call] of load.mock.calls) expect(call.filters?.textSearch?.value).toBe('Boo');
  });

  it('includes the rows under a closed row of a tree whose rows arrive in one load', async () => {
    const context = await renderForExport(
      'export_all_tree_flat',
      () => Promise.resolve({ results: flat, total: flat.length }),
      <DataGridTableTreePlugin<Node> parentKey="parent_id" />,
      'Electronics',
    );
    expect(screen.queryByText('Phones')).toBeNull();

    const data = await createExportService<Node>().getAllData(context);

    // Each row, then what is under it.
    expect(names(data)).toEqual(['Electronics', 'Phones', 'Laptops', 'Books', 'Clothing']);
  });

  it('loads the children of the rows of a lazy tree that have not been opened', async () => {
    const load = vi.fn(loadLevel);
    const context = await renderForExport(
      'export_all_tree_lazy',
      load,
      <DataGridTableTreePlugin<Node> expandable={hasChildren} />,
      'Electronics',
    );
    expect(load).toHaveBeenCalledTimes(1);

    const data = await createExportService<Node>().getAllData(context);

    expect(names(data)).toEqual(['Electronics', 'Phones', 'Laptops', 'Books', 'Clothing']);
    // Only a row that can have children is asked for them.
    expect(load.mock.calls.map(([call]) => call.tree?.parentId)).toEqual([null, 1]);
    expect(screen.queryByText('Phones')).toBeNull();
  });

  it('exports every row of a paginated tree exactly once', async () => {
    const context = await renderForExport(
      'export_all_tree_pages',
      loadLevel,
      <>
        <DataGridTableTreePlugin<Node> expandable={hasChildren} />
        <DataGridPaginationPlugin defaultLimit={2} limits={[2]} />
      </>,
      'Electronics',
    );

    const data = await createExportService<Node>().getAllData(context);

    expect(names(data)).toEqual(['Electronics', 'Phones', 'Laptops', 'Books', 'Clothing']);
    expect(new Set(data.map((node) => node.id)).size).toBe(data.length);
  });

  it('stops reading the pages of a tree whose load ignores the page', async () => {
    // Every root on every page, so each page is full and nothing new.
    const load = vi.fn((context: DataGridLoadContext) =>
      context.tree?.parentId != null
        ? loadLevel(context)
        : Promise.resolve({ results: roots, total: roots.length }),
    );
    const context = await renderForExport(
      'export_all_tree_pages_ignored',
      load,
      <>
        <DataGridTableTreePlugin<Node> expandable={hasChildren} />
        <DataGridPaginationPlugin defaultLimit={2} limits={[2]} />
      </>,
      'Electronics',
    );
    load.mockClear();

    const data = await createExportService<Node>().getAllData(context);

    expect(names(data)).toEqual(['Electronics', 'Phones', 'Laptops', 'Books', 'Clothing']);
    const pagesAsked = load.mock.calls.filter(([call]) => call.tree?.parentId == null);
    expect(pagesAsked.map(([call]) => call.pagination?.page)).toEqual([1, 2]);
  });
});
