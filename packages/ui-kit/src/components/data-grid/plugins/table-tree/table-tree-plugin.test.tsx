import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';
import { useDataGrid } from '../../services/core/data-grid-context';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { DataGridRowClickPlugin } from '../row-click/row-click-plugin';
import styles from './components/data-grid-table-tree.module.css';
import { DataGridTableTreePlugin } from './table-tree-plugin';

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

const flatTreeData: TreeItem[] = [
  { id: 1, name: 'Electronics', parent_id: null, has_children: true },
  { id: 2, name: 'Books', parent_id: null, has_children: false },
  { id: 3, name: 'Phones', parent_id: 1, has_children: false },
  { id: 4, name: 'Laptops', parent_id: 1, has_children: false },
];

// A third level, for the indentation: iPhone sits under Phones, which sits under Electronics.
const deepTreeData: TreeItem[] = [
  { id: 1, name: 'Electronics', parent_id: null, has_children: true },
  { id: 2, name: 'Phones', parent_id: 1, has_children: true },
  { id: 3, name: 'iPhone', parent_id: 2, has_children: false },
];

const asyncTreeData: Record<string, TreeItem[]> = {
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

function loadFlatData(): Promise<DataGridLoadResult<TreeItem>> {
  return Promise.resolve({ results: flatTreeData, total: flatTreeData.length });
}

function loadDeepData(): Promise<DataGridLoadResult<TreeItem>> {
  return Promise.resolve({ results: deepTreeData, total: deepTreeData.length });
}

function loadAsyncData(context: DataGridLoadContext): Promise<DataGridLoadResult<TreeItem>> {
  const parentId = context.tree?.parentId;
  const key = parentId ?? 'root';
  const items = asyncTreeData[String(key)] ?? [];
  return Promise.resolve({ results: items, total: items.length });
}

// The plugin compares its props by reference, so an inline function would re-initialise it.
const hasChildren = (item: TreeItem) => item.has_children;

function rowOf(text: string) {
  return screen.getByText(text).closest('tr')!;
}

describe('DataGridTableTreePlugin', () => {
  // Expand state is persisted per grid name, so it would otherwise carry from one
  // test to the next and start them with rows already expanded.
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('parentKey mode', () => {
    function renderFlatTree() {
      return render(
        <DataGrid name="test_tree_flat" load={loadFlatData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
    }

    it('renders root-level rows', async () => {
      renderFlatTree();
      await screen.findByRole('table');

      expect(screen.getByText('Electronics')).toBeInTheDocument();
      expect(screen.getByText('Books')).toBeInTheDocument();
    });

    it('hides child rows initially', async () => {
      renderFlatTree();
      await screen.findByRole('table');

      expect(screen.queryByText('Phones')).not.toBeInTheDocument();
      expect(screen.queryByText('Laptops')).not.toBeInTheDocument();
    });

    it('shows child rows after expanding', async () => {
      const { user } = renderFlatTree();
      await screen.findByRole('table');

      const expandButtons = screen.getAllByRole('button');
      await user.click(expandButtons[0]);

      expect(await screen.findByText('Phones')).toBeInTheDocument();
      expect(screen.getByText('Laptops')).toBeInTheDocument();
    });

    it('hides child rows after collapsing', async () => {
      const { user } = renderFlatTree();
      await screen.findByRole('table');

      const expandButtons = screen.getAllByRole('button');
      await user.click(expandButtons[0]); // expand
      await screen.findByText('Phones');

      await user.click(expandButtons[0]); // collapse

      expect(screen.queryByText('Phones')).not.toBeInTheDocument();
    });

    it('indents each level one step further, and the root rows not at all', async () => {
      const { user } = render(
        <DataGrid name="test_tree_indent" persistent="memory" load={loadDeepData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
      await screen.findByText('Electronics');

      // The root row has no level, so it has no spacer.
      expect(rowOf('Electronics').querySelector(`.${styles.indentSpacer}`)).toBeNull();

      await user.click(within(rowOf('Electronics')).getByRole('button'));
      await screen.findByText('Phones');
      await user.click(within(rowOf('Phones')).getByRole('button'));
      await screen.findByText('iPhone');

      const spacerOf = (text: string) =>
        rowOf(text).querySelector<HTMLElement>(`.${styles.indentSpacer}`);
      expect(spacerOf('Phones')?.style.inlineSize).toBe(
        'calc(var(--_data-grid-table-tree-indent) * 1)',
      );
      expect(spacerOf('iPhone')?.style.inlineSize).toBe(
        'calc(var(--_data-grid-table-tree-indent) * 2)',
      );
    });

    it('indents the children of a row whose id is 0', async () => {
      const zeroRootData: TreeItem[] = [
        { id: 0, name: 'Electronics', parent_id: null, has_children: true },
        { id: 1, name: 'Phones', parent_id: 0, has_children: false },
      ];
      const { user } = render(
        <DataGrid
          name="test_tree_indent_zero"
          persistent="memory"
          load={() => Promise.resolve({ results: zeroRootData, total: zeroRootData.length })}
          columns={columns}
        >
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
      await screen.findByText('Electronics');

      await user.click(within(rowOf('Electronics')).getByRole('button'));
      await screen.findByText('Phones');

      expect(
        rowOf('Phones').querySelector<HTMLElement>(`.${styles.indentSpacer}`)?.style.inlineSize,
      ).toBe('calc(var(--_data-grid-table-tree-indent) * 1)');
    });

    it('holds the cell\'s content in a label of its own, beside the toggle and the indent', async () => {
      const { user } = render(
        <DataGrid name="test_tree_label" persistent="memory" load={loadDeepData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
      await screen.findByText('Electronics');
      await user.click(within(rowOf('Electronics')).getByRole('button'));

      // The label is what ellipsizes, so the text is inside it and the toggle and the spacer are not.
      for (const name of ['Electronics', 'Phones']) {
        const label = screen.getByText(name).closest(`.${styles.label}`);
        expect(label).not.toBeNull();
        expect(label?.querySelector('button')).toBeNull();
        expect(label?.parentElement).toHaveClass(styles.treeCellContent);
      }
    });

    it('turns the chevron to point down while a row is open', async () => {
      const { user } = render(
        <DataGrid name="test_tree_chevron" persistent="memory" load={loadFlatData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
      await screen.findByText('Electronics');
      const chevron = () => rowOf('Electronics').querySelector('button svg');

      expect(chevron()).toHaveClass(styles.expandIconCollapsed);

      await user.click(within(rowOf('Electronics')).getByRole('button'));
      expect(chevron()).not.toHaveClass(styles.expandIconCollapsed);
    });
  });

  describe('async mode', () => {
    function renderAsyncTree() {
      return render(
        <DataGrid name="test_tree_async" load={loadAsyncData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> expandable={(item) => item.has_children} />
        </DataGrid>,
      );
    }

    it('renders root rows from async load', async () => {
      renderAsyncTree();
      await screen.findByRole('table');

      expect(await screen.findByText('Electronics')).toBeInTheDocument();
      expect(screen.getByText('Books')).toBeInTheDocument();
    });

    it('shows expand button only for expandable rows', async () => {
      renderAsyncTree();
      await screen.findByRole('table');

      // Only Electronics has has_children: true
      const expandButtons = screen.getAllByRole('button');
      expect(expandButtons).toHaveLength(1);
    });

    it('loads and shows children on expand', async () => {
      const { user } = renderAsyncTree();
      await screen.findByRole('table');

      const expandButton = screen.getByRole('button');
      await user.click(expandButton);

      expect(await screen.findByText('Phones')).toBeInTheDocument();
      expect(screen.getByText('Laptops')).toBeInTheDocument();
    });

    it('asks for the children of the row that was opened, and keeps them when it is closed', async () => {
      const load = vi.fn(loadAsyncData);
      const { user } = render(
        <DataGrid name="test_tree_cached" persistent="memory" load={load} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> expandable={hasChildren} />
        </DataGrid>,
      );
      await screen.findByText('Electronics');
      const toggle = within(rowOf('Electronics')).getByRole('button');

      // The first load is the roots, which name no parent.
      expect(load).toHaveBeenCalledTimes(1);
      expect(load.mock.calls[0][0].tree).toEqual({ parentId: null });

      await user.click(toggle);
      await screen.findByText('Phones');
      expect(load).toHaveBeenCalledTimes(2);
      expect(load.mock.calls[1][0].tree).toEqual({ parentId: 1 });

      // Closing a row only hides its children; opening it again shows them without a load.
      await user.click(toggle);
      expect(screen.queryByText('Phones')).not.toBeInTheDocument();
      await user.click(toggle);
      expect(screen.getByText('Phones')).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);
    });

    it('asks once for the children of a row that is closed and opened again while they are on their way', async () => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const load = vi.fn(async (context: DataGridLoadContext) => {
        if (context.tree?.parentId === 1) await gate;
        return loadAsyncData(context);
      });
      const { user } = render(
        <DataGrid name="test_tree_in_flight" persistent="memory" load={load} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> expandable={hasChildren} />
        </DataGrid>,
      );
      await screen.findByText('Electronics');
      const toggle = within(rowOf('Electronics')).getByRole('button');

      await user.click(toggle);
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      // Closed and opened again before the first answer: it is still the one load that is asked.
      await user.click(toggle);
      await user.click(toggle);
      expect(load).toHaveBeenCalledTimes(2);

      release();

      // One section was stored, so each child is on screen once.
      expect(await screen.findAllByText('Phones')).toHaveLength(1);
      expect(screen.getAllByText('Laptops')).toHaveLength(1);
    });

    it('loads the children of an open row again when the grid is refreshed', async () => {
      const load = vi.fn(loadAsyncData);
      function Refresh() {
        const grid = useDataGrid();
        return (
          <button type="button" onClick={() => void grid.refresh()}>
            Refresh
          </button>
        );
      }
      const { user } = render(
        <DataGrid name="test_tree_refresh" persistent="memory" load={load} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> expandable={hasChildren} />
          <Refresh />
        </DataGrid>,
      );
      await screen.findByText('Electronics');
      await user.click(within(rowOf('Electronics')).getByRole('button'));
      await screen.findByText('Phones');
      expect(load).toHaveBeenCalledTimes(2);

      await user.click(screen.getByRole('button', { name: 'Refresh' }));

      // The refresh drops what was loaded, so the roots come again and, because the row is still
      // open, so do its children.
      await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
      expect(load.mock.calls[3][0].tree).toEqual({ parentId: 1 });
      expect(await screen.findByText('Phones')).toBeInTheDocument();
    });

    it('follows a changed expandable prop', async () => {
      function Grid({ expandable }: { expandable: (item: TreeItem) => boolean }) {
        return (
          <DataGrid name="test_tree_prop" persistent="memory" load={loadAsyncData} columns={columns}>
            <DataGridTableTreePlugin<TreeItem> expandable={expandable} />
          </DataGrid>
        );
      }
      const { rerender } = render(<Grid expandable={hasChildren} />);
      await screen.findByText('Electronics');
      expect(screen.getAllByRole('button')).toHaveLength(1);

      rerender(<Grid expandable={() => false} />);

      await waitFor(() => expect(screen.queryAllByRole('button')).toHaveLength(0));
    });
  });

  describe('custom expandable predicate', () => {
    it('respects custom expandable function', async () => {
      render(
        <DataGrid name="test_tree_custom" load={loadAsyncData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> expandable={() => false} />
        </DataGrid>,
      );
      await screen.findByRole('table');

      // No rows should be expandable
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('the toggle', () => {
    it('is in the first column only', async () => {
      render(
        <DataGrid name="test_tree_first_column" persistent="memory" load={loadFlatData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
      await screen.findByText('Electronics');

      const [first, second] = within(rowOf('Electronics')).getAllByRole('cell');
      expect(within(first).getByRole('button')).toBeInTheDocument();
      expect(within(second).queryByRole('button')).toBeNull();
      // A row with nothing under it has no toggle.
      expect(within(rowOf('Books')).queryByRole('button')).toBeNull();
    });

    it('is sized by its own class and not by its row, so any row renderer shows it the same', async () => {
      // The row click plugin's row, when it is declared after the tree, draws the cells instead of
      // the tree's row, and the toggle comes from the tree's cell content either way.
      render(
        <DataGrid name="test_tree_toggle_own_class" persistent="memory" load={loadFlatData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
          <DataGridRowClickPlugin<TreeItem> click={vi.fn()} />
        </DataGrid>,
      );
      await screen.findByText('Electronics');

      expect(within(rowOf('Electronics')).getByRole('button')).toHaveClass(styles.toggle);
    });

    it('leaves a column\'s own class on the cell', async () => {
      const classed: DataGridTableColumn<TreeItem>[] = [
        { id: 'name', label: 'Name', getClassName: () => 'name-cell' },
      ];
      render(
        <DataGrid name="test_tree_class" persistent="memory" load={loadFlatData} columns={classed}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
      await screen.findByText('Electronics');

      const [cell] = within(rowOf('Electronics')).getAllByRole('cell');
      expect(cell).toHaveClass('name-cell');
    });
  });

  describe('with the row click plugin', () => {
    function renderWithRowClick(
      name: string,
      callbacks: { click?: (item: TreeItem) => void; dblclick?: (item: TreeItem) => void },
      tree: 'after' | 'before' = 'after',
    ) {
      const rowClick = <DataGridRowClickPlugin<TreeItem> {...callbacks} />;
      const treePlugin = <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />;
      return render(
        <DataGrid name={name} persistent="memory" load={loadFlatData} columns={columns}>
          {tree === 'after' ? rowClick : treePlugin}
          {tree === 'after' ? treePlugin : rowClick}
        </DataGrid>,
      );
    }

    it('makes the rows clickable and focusable like row click\'s own, children included', async () => {
      const click = vi.fn();
      const dblclick = vi.fn();
      const { user } = renderWithRowClick('test_tree_row_click', { click, dblclick });
      await screen.findByText('Electronics');

      expect(rowOf('Books')).toHaveAttribute('tabindex', '0');
      expect(rowOf('Books')).toHaveClass(styles.clickableRow);

      await user.click(screen.getByText('Books'));
      expect(click).toHaveBeenLastCalledWith(flatTreeData[1]);

      await user.dblClick(screen.getByText('Books'));
      expect(dblclick).toHaveBeenCalledWith(flatTreeData[1]);

      await user.click(within(rowOf('Electronics')).getByRole('button'));
      click.mockClear();
      await user.click(await screen.findByText('Phones'));
      expect(click).toHaveBeenCalledWith(flatTreeData[2]);
    });

    it('calls click on Enter in a focused row', async () => {
      const click = vi.fn();
      const { user } = renderWithRowClick('test_tree_row_click_enter', { click });
      await screen.findByText('Electronics');

      rowOf('Books').focus();
      await user.keyboard('{Enter}');

      expect(click).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledWith(flatTreeData[1]);
    });

    it('does not click the row when its toggle is used', async () => {
      const click = vi.fn();
      const { user } = renderWithRowClick('test_tree_row_click_toggle', { click });
      await screen.findByText('Electronics');

      await user.click(within(rowOf('Electronics')).getByRole('button'));

      expect(await screen.findByText('Phones')).toBeInTheDocument();
      expect(click).not.toHaveBeenCalled();
    });

    it('has no tab stops and no pointer cursor without it', async () => {
      render(
        <DataGrid name="test_tree_no_row_click" persistent="memory" load={loadFlatData} columns={columns}>
          <DataGridTableTreePlugin<TreeItem> parentKey="parent_id" />
        </DataGrid>,
      );
      await screen.findByText('Electronics');

      expect(rowOf('Books')).not.toHaveAttribute('tabindex');
      expect(rowOf('Books')).not.toHaveClass(styles.clickableRow);
    });

    it('loses to row click when it is declared after the tree: its rows show no children', async () => {
      // Both replace the row renderer and the last registered wins, and row click's row does not
      // render the rows under it, so the toggle opens a branch that never appears.
      const { user } = renderWithRowClick('test_tree_row_click_order', {}, 'before');
      await screen.findByText('Electronics');

      await user.click(within(rowOf('Electronics')).getByRole('button'));

      expect(screen.queryByText('Phones')).not.toBeInTheDocument();
    });
  });
});
