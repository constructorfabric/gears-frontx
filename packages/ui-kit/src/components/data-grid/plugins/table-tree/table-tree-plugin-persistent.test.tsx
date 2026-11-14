import { screen, waitFor, within } from '@testing-library/react';
import { useCallback } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';
import { messages } from '../../messages';
import { useDataGrid } from '../../services/core/data-grid-context';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { DataGridPaginationPlugin } from '../pagination/pagination-plugin';
import { DataGridTableTreePlugin } from './table-tree-plugin';
import type { DataGridTableTreePluginApi } from './table-tree-types';

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

interface TreeItem {
  id: number;
  name: string;
  parent_id: number | null;
  has_children: boolean;
}

// Two expandable roots, one child each: an expanded row is distinguishable from
// the default state, so a restore test cannot pass by matching the default.
const twoRootsData: TreeItem[] = [
  { id: 1, name: 'Electronics', parent_id: null, has_children: true },
  { id: 2, name: 'Clothing', parent_id: null, has_children: true },
  { id: 3, name: 'Phones', parent_id: 1, has_children: false },
  { id: 4, name: 'T-Shirts', parent_id: 2, has_children: false },
];

const lazyTreeData: Record<string, TreeItem[]> = {
  root: [
    { id: 1, name: 'Electronics', parent_id: null, has_children: true },
    { id: 2, name: 'Books', parent_id: null, has_children: false },
  ],
  '1': [
    { id: 3, name: 'Phones', parent_id: 1, has_children: false },
    { id: 4, name: 'Laptops', parent_id: 1, has_children: false },
  ],
};

const columns: DataGridTableColumn<TreeItem>[] = [
  { id: 'name', label: 'Name', width: 300 },
  { id: 'id', label: 'ID', width: 80 },
];

function loadTwoRoots(): Promise<DataGridLoadResult<TreeItem>> {
  return Promise.resolve({ results: twoRootsData, total: twoRootsData.length });
}

function loadLazy(context: DataGridLoadContext): Promise<DataGridLoadResult<TreeItem>> {
  const key = context.tree?.parentId ?? 'root';
  const items = lazyTreeData[String(key)] ?? [];
  return Promise.resolve({ results: items, total: items.length });
}

// One root per page, with that root's child appended so parentKey can build the
// branch — the shape a paginated parentKey grid has.
function loadPaginated(context: DataGridLoadContext): Promise<DataGridLoadResult<TreeItem>> {
  const page = context.pagination?.page ?? 1;
  const roots = twoRootsData.filter(({ parent_id }) => !parent_id);
  const root = roots[page - 1];
  const children = twoRootsData.filter(({ parent_id }) => parent_id === root.id);

  return Promise.resolve({ results: [root, ...children], total: roots.length });
}

describe('DataGridTableTreePlugin persistent expand state', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // Every row's expand control carries the same name, so it is located through its
  // row. These fixtures register no other per-row button.
  function getExpandButton(rowText: string) {
    const row = screen.getByText(rowText).closest('tr')!;
    return within(row).getByRole('button');
  }

  function renderTree(name: string) {
    return render(
      <DataGrid name={name} load={loadTwoRoots} columns={columns}>
        <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
      </DataGrid>,
    );
  }

  it('stores the expand state without any opt-in', async () => {
    // Expand state persists on the same terms as the page, filters and order:
    // the grid's own `persistent` configuration decides where, and no per-plugin
    // flag has to be set.
    const { user } = renderTree('tree_persist_default');
    await screen.findByRole('table');

    await user.click(getExpandButton('Electronics'));
    await screen.findByText('Phones');

    expect(localStorage.getItem('dataGrid:tree_persist_default:tree')).toBe('{"expanded":[1]}');
  });

  it('stores nothing until a row is actually expanded', async () => {
    renderTree('tree_persist_untouched');
    await screen.findByRole('table');

    expect(localStorage.getItem('dataGrid:tree_persist_untouched:tree')).toBeNull();
  });

  it('stores the empty state instead of removing the entry when the last row collapses', async () => {
    const { user } = renderTree('tree_persist_collapse');
    await screen.findByRole('table');

    await user.click(getExpandButton('Electronics'));
    await screen.findByText('Phones');

    // Collapsing is synchronous — no load is involved, the section is hidden.
    await user.click(getExpandButton('Electronics'));

    expect(screen.queryByText('Phones')).not.toBeInTheDocument();
    expect(localStorage.getItem('dataGrid:tree_persist_collapse:tree')).toBe('{"expanded":[]}');
  });

  it('restores the expansion from storage on mount', async () => {
    localStorage.setItem('dataGrid:tree_persist_restore:tree', '{"expanded":[1]}');

    renderTree('tree_persist_restore');
    await screen.findByRole('table');

    expect(await screen.findByText('Phones')).toBeInTheDocument();
  });

  it('restores only the stored ids, leaving the other rows collapsed', async () => {
    // Only 'Clothing' (2) is stored, so its child shows while 'Electronics' (1)
    // stays collapsed — the restore is per id, not "expand everything".
    localStorage.setItem('dataGrid:tree_persist_partial:tree', '{"expanded":[2]}');

    renderTree('tree_persist_partial');
    await screen.findByRole('table');

    expect(await screen.findByText('T-Shirts')).toBeInTheDocument();
    expect(screen.queryByText('Phones')).not.toBeInTheDocument();
  });

  it('keeps the expansion across a remount, the way a page reload does', async () => {
    const first = renderTree('tree_persist_remount');
    await screen.findByRole('table');
    await first.user.click(getExpandButton('Electronics'));
    await screen.findByText('Phones');
    first.unmount();

    renderTree('tree_persist_remount');
    await screen.findByRole('table');

    expect(await screen.findByText('Phones')).toBeInTheDocument();
  });

  it('loads the children of a restored id in lazy mode', async () => {
    // Without parentKey the restored id cannot tell whether the row exists or is
    // expandable, so its children load is queued until the record arrives.
    localStorage.setItem('dataGrid:tree_persist_lazy:tree', '{"expanded":[1]}');

    function LazyTree() {
      const expandable = useCallback((item: TreeItem) => item.has_children, []);

      return (
        <DataGrid name="tree_persist_lazy" load={loadLazy} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> expandable={expandable} />
        </DataGrid>
      );
    }

    render(<LazyTree />);
    await screen.findByRole('table');

    expect(await screen.findByText('Phones')).toBeInTheDocument();
    expect(screen.getByText('Laptops')).toBeInTheDocument();
  });

  it('collapses a restored id whose row turns out not to be expandable', async () => {
    // Lazy mode: id 2 (Books) is stored as expanded, but its record arrives with
    // has_children: false. Leaving it marked expanded would render a row that
    // claims children it can never show, so the stored id is dropped instead.
    localStorage.setItem('dataGrid:tree_persist_unexpandable:tree', '{"expanded":[2]}');

    function LazyTree() {
      const expandable = useCallback((item: TreeItem) => item.has_children, []);

      return (
        <DataGrid name="tree_persist_unexpandable" load={loadLazy} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> expandable={expandable} />
        </DataGrid>
      );
    }

    render(<LazyTree />);
    await screen.findByRole('table');
    await screen.findByText('Books');

    await waitFor(() => {
      expect(localStorage.getItem('dataGrid:tree_persist_unexpandable:tree')).toBe(
        '{"expanded":[]}',
      );
    });
  });

  it('ignores stored values that are not row ids', async () => {
    // Storage and the URL are user-editable, so a corrupted value must not leak
    // into the expand state or be written back on the next toggle.
    localStorage.setItem(
      'dataGrid:tree_persist_garbage:tree',
      '{"expanded":[{"id":1},null,true,2]}',
    );

    const { user } = renderTree('tree_persist_garbage');
    await screen.findByRole('table');

    // Only the valid id (2, Clothing) is restored.
    expect(await screen.findByText('T-Shirts')).toBeInTheDocument();
    expect(screen.queryByText('Phones')).not.toBeInTheDocument();

    await user.click(getExpandButton('Electronics'));
    await screen.findByText('Phones');

    expect(localStorage.getItem('dataGrid:tree_persist_garbage:tree')).toBe('{"expanded":[2,1]}');
  });

  it('ignores a stored list that is not a list', async () => {
    // `expanded` is read back from storage, so it can be anything the user typed; a value that
    // is not an array must read as no state and not throw while the grid renders.
    localStorage.setItem('dataGrid:tree_persist_not_list:tree', '{"expanded":"1"}');

    renderTree('tree_persist_not_list');

    expect(await screen.findByText('Electronics')).toBeInTheDocument();
    expect(screen.queryByText('Phones')).not.toBeInTheDocument();
  });

  it('caps the stored list, dropping the oldest ids first', async () => {
    // Ids from every visited page accumulate (an off-screen row cannot be
    // collapsed), so the write is bounded. Seed more than the cap and toggle:
    // the write keeps the newest ids and the fresh toggle stays last.
    const seeded = Array.from({ length: 250 }, (_, i) => i + 1000);
    localStorage.setItem('dataGrid:tree_persist_cap:tree', JSON.stringify({ expanded: seeded }));

    const { user } = renderTree('tree_persist_cap');
    await screen.findByRole('table');

    await user.click(getExpandButton('Electronics'));
    await screen.findByText('Phones');

    const stored = JSON.parse(localStorage.getItem('dataGrid:tree_persist_cap:tree')!);
    expect(stored.expanded).toHaveLength(200);
    expect(stored.expanded[stored.expanded.length - 1]).toBe(1);
    expect(stored.expanded).not.toContain(1000);
  });

  it('caps the restored list too, keeping the newest ids', async () => {
    // The plugin itself never writes more than the cap, so an oversized stored
    // list is external (hand-edited storage). Reading is capped the same way
    // the write is: the tail survives — id 1 sits before 250 filler ids and is
    // dropped, id 2 sits at the end and is restored.
    const filler = Array.from({ length: 250 }, (_, i) => i + 1000);
    localStorage.setItem(
      'dataGrid:tree_persist_read_cap:tree',
      JSON.stringify({ expanded: [1, ...filler, 2] }),
    );

    renderTree('tree_persist_read_cap');
    await screen.findByRole('table');

    expect(await screen.findByText('T-Shirts')).toBeInTheDocument();
    expect(screen.queryByText('Phones')).not.toBeInTheDocument();
  });

  it('honours the sessionStorage backend configured on the grid', async () => {
    const { user } = render(
      <DataGrid
        name="tree_persist_session"
        persistent="sessionStorage"
        load={loadTwoRoots}
        columns={columns}
      >
        <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
      </DataGrid>,
    );
    await screen.findByRole('table');

    await user.click(getExpandButton('Electronics'));
    await screen.findByText('Phones');

    expect(sessionStorage.getItem('dataGrid:tree_persist_session:tree')).toBe('{"expanded":[1]}');
    expect(localStorage.getItem('dataGrid:tree_persist_session:tree')).toBeNull();
  });

  it('opts out of URL persistence under the router backend', async () => {
    // The expand list is personal state that accumulates ids of rows deleted
    // server-side, so it must not leak into a shareable link: under
    // persistent="router" the plugin neither writes the URL nor seeds from it.
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?tree=%7B%22expanded%22%3A%5B1%5D%7D`,
    );

    const { user } = render(
      <DataGrid
        name="tree_persist_router"
        persistent="router"
        load={loadTwoRoots}
        columns={columns}
      >
        <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
      </DataGrid>,
    );
    await screen.findByRole('table');

    // The seeded URL entry is ignored: the row stays collapsed.
    expect(screen.queryByText('Phones')).not.toBeInTheDocument();

    await user.click(getExpandButton('Electronics'));
    await screen.findByText('Phones');

    // The toggle left the URL exactly as it was.
    expect(new URLSearchParams(window.location.search).get('tree')).toBe('{"expanded":[1]}');

    window.history.replaceState(null, '', window.location.pathname);
  });

  it('persists a toggle called from code rather than from the expand control', async () => {
    // A consumer holding the plugin API can expand rows itself; that path must
    // persist too, so this drives `toggle` directly instead of clicking.
    function ProgrammaticToggle() {
      const grid = useDataGrid<TreeItem>();
      const tree = grid.getPlugin<DataGridTableTreePluginApi<TreeItem>>('tableTree');

      return (
        <button type="button" onClick={() => tree?.toggle(2)}>
          Expand Clothing
        </button>
      );
    }

    const { user } = render(
      <DataGrid name="tree_persist_programmatic" load={loadTwoRoots} columns={columns}>
        <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        <ProgrammaticToggle />
      </DataGrid>,
    );
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Expand Clothing' }));

    expect(await screen.findByText('T-Shirts')).toBeInTheDocument();
    expect(localStorage.getItem('dataGrid:tree_persist_programmatic:tree')).toBe(
      '{"expanded":[2]}',
    );
  });

  describe('with pagination', () => {
    function renderPaginatedTree(name: string) {
      return render(
        <DataGrid name={name} load={loadPaginated} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
          <DataGridPaginationPlugin defaultLimit={1} limits={[1]} />
        </DataGrid>,
      );
    }

    it('keeps the stored ids when the page changes', async () => {
      const { user } = renderPaginatedTree('tree_persist_page_keep');
      await screen.findByRole('table');

      await user.click(getExpandButton('Electronics'));
      await screen.findByText('Phones');

      await user.click(screen.getByRole('button', { name: messages.pagination.nextPage }));
      await screen.findByText('Clothing');

      // 'Electronics' is absent from page 2, but its id must survive.
      expect(localStorage.getItem('dataGrid:tree_persist_page_keep:tree')).toBe('{"expanded":[1]}');
    });

    it('restores the expansion when the user returns to the page', async () => {
      const { user } = renderPaginatedTree('tree_persist_page_back');
      await screen.findByRole('table');

      await user.click(getExpandButton('Electronics'));
      await screen.findByText('Phones');

      await user.click(screen.getByRole('button', { name: messages.pagination.nextPage }));
      await screen.findByText('Clothing');

      await user.click(screen.getByRole('button', { name: messages.pagination.previousPage }));

      expect(await screen.findByText('Phones')).toBeInTheDocument();
    });
  });
});
