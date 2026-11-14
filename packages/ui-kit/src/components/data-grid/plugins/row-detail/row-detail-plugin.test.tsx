import { act, createEvent, fireEvent, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadResult } from '../../data-grid-types';
import { messages } from '../../messages';
import type { DataGridMessagesOverride } from '../../messages';
import { useDataGrid } from '../../services/core/data-grid-context';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { createDataGridDragDropPlugin } from '../drag-drop/drag-drop-plugin';
import { DataGridRowActionsPlugin } from '../row-actions/row-actions-plugin';
import { DataGridRowClickPlugin } from '../row-click/row-click-plugin';
import { DataGridRowSelectPlugin } from '../row-select/row-select-plugin';
import { DataGridTableTreePlugin } from '../table-tree/table-tree-plugin';
import { DataGridRowDetailPlugin } from './row-detail-plugin';

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

const data: Item[] = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
];

const columns: DataGridTableColumn<Item>[] = [{ id: 'name', label: 'Name' }];

// For the second grid of the two-grids test, whose record id is a string with characters a DOM id
// has to escape.
const oddColumns: DataGridTableColumn<{ id: string; name: string }>[] = [{ id: 'name', label: 'Name' }];

// The plugin's props are compared shallowly, so a detail renderer built inside the component
// would re-render every open detail on each render: it is a module-level function, like a
// consumer would keep it.
const renderDetail = (item: { name: string }) => <p>{item.name} notes</p>;

// A detail that holds state of its own, the kind a remount would lose.
const renderDraft = (item: { name: string }) => <input aria-label={`Draft for ${item.name}`} />;

function load(): Promise<DataGridLoadResult<Item>> {
  return Promise.resolve({ results: data, total: data.length });
}

function RefreshButton() {
  const grid = useDataGrid();
  return (
    <button type="button" onClick={() => void grid.refresh()}>
      refresh
    </button>
  );
}

function HideColumnButton({ columnId }: { columnId: string }) {
  const grid = useDataGrid();
  return (
    <button type="button" onClick={() => grid.updateColumnVisibility(columnId, false)}>
      hide-{columnId}
    </button>
  );
}

interface GridProps {
  messages?: DataGridMessagesOverride;
}

function renderGrid(
  name: string,
  plugins: ReactNode,
  gridProps: GridProps = {},
) {
  return render(
    <DataGrid
      name={name}
      persistent="memory"
      load={load}
      columns={columns}
      {...gridProps}
    >
      {plugins}
    </DataGrid>,
  );
}

// The body rows, in document order: header rows sit in a thead, the records and any open detail
// rows in the tbody.
function bodyRows() {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .filter((row) => row.closest('tbody'));
}

function toggleIn(row: HTMLElement) {
  return within(row).getByRole('button', { name: messages.rowDetail.toggle });
}

// Renders a grid, waits for its rows and opens the first record's detail.
async function openFirstDetail(name: string, plugins: ReactNode, gridProps: GridProps = {}) {
  const view = renderGrid(name, plugins, gridProps);
  const rows = await vi.waitFor(() => {
    const found = bodyRows();
    expect(found.length).toBeGreaterThan(0);
    return found;
  });
  await view.user.click(toggleIn(rows[0]!));
  return view;
}

// jsdom has no drag and drop and no layout, so a drag is the sequence of events the drag library
// listens for, sent to the element under the "pointer". It mirrors the session helper of
// drag-drop-plugin.test.tsx: the library finds that element with `document.elementsFromPoint`,
// which jsdom does not have, and works out the edge of a row from `getBoundingClientRect` and the
// event's `clientY`, so the test supplies each of them.
const rowHeight = 40;

function layOutRows(rows: HTMLElement[]) {
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => new DOMRect(0, index * rowHeight, 300, rowHeight);
  });
}

function createDragSession() {
  const dataTransfer = {
    setDragImage: vi.fn(),
    setData: vi.fn(),
    getData: vi.fn(),
    types: [],
    effectAllowed: 'all',
    dropEffect: 'move',
  };
  let under: Element | null = null;
  document.elementsFromPoint = () => (under ? [under] : []);

  async function send(
    type: 'dragStart' | 'dragEnter' | 'dragOver' | 'drop' | 'dragEnd',
    target: Element,
  ) {
    const event = createEvent[type](target, { dataTransfer });
    Object.defineProperties(event, { clientX: { value: 20 }, clientY: { value: 20 } });
    await act(async () => {
      fireEvent(target, event);
      // The library reports the start of a drag on the next frame.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    });
  }

  return {
    /**
     * Starts dragging a row. The `dragstart` event goes to the row itself, the way the drag
     * library's own tests drive it: its registry is keyed on the registered draggable element
     * (the row), and in jsdom a `dragstart` addressed to the handle keeps the handle as
     * `event.target`, which the registry lookup misses.
     */
    async start(row: HTMLElement) {
      under = row.querySelector<HTMLElement>('[data-drag-handle]') ?? row;
      layOutRows(Array.from(row.parentElement!.querySelectorAll('tr')));
      await send('dragStart', row);
      await send('dragEnter', row);
    },
    async drop(row: HTMLElement) {
      under = row;
      await send('drop', row);
      await send('dragEnd', row);
    },
  };
}

describe('DataGridRowDetailPlugin', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
  });

  describe('the toggle column', () => {
    it('names the toggle after the rowDetail message and says the detail is closed', async () => {
      renderGrid('row_detail_closed', <DataGridRowDetailPlugin<Item> render={renderDetail} />);
      const [row] = await vi.waitFor(() => {
        const found = bodyRows();
        expect(found.length).toBeGreaterThan(0);
        return found;
      });

      const toggle = toggleIn(row);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      // Closed means nowhere to point: the group exists only while the detail is open.
      expect(toggle).not.toHaveAttribute('aria-controls');
    });

    it.each([
      { case: 'the rowDetail column message', gridProps: {}, name: messages.rowDetail.column },
      {
        case: 'a messages override',
        gridProps: { messages: { rowDetail: { column: 'Notes' } } },
        name: 'Notes',
      },
    ])('names the toggle column header after $case', async ({ gridProps, name }) => {
      renderGrid(
        'row_detail_header',
        <DataGridRowDetailPlugin<Item> render={renderDetail} />,
        gridProps,
      );

      expect(await screen.findByRole('columnheader', { name })).toBeInTheDocument();
    });

    it('opens the detail under its row, names the group, and points the toggle at it', async () => {
      await openFirstDetail(
        'row_detail_open',
        <DataGridRowDetailPlugin<Item> render={renderDetail} />,
      );

      const detail = screen.getByRole('group', { name: messages.rowDetail.toggle });
      expect(detail).toHaveTextContent('Alpha notes');

      const rows = bodyRows();
      expect(rows).toHaveLength(4);
      expect(within(rows[1]!).getByRole('group')).toBe(detail);

      const toggle = toggleIn(rows[0]!);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveAttribute('aria-controls', detail.id);
    });

    it('closes the detail again on a second press', async () => {
      const { user } = await openFirstDetail(
        'row_detail_close',
        <DataGridRowDetailPlugin<Item> render={renderDetail} />,
      );
      const [row] = bodyRows();

      await user.click(toggleIn(row));

      expect(screen.queryByRole('group', { name: messages.rowDetail.toggle })).toBeNull();
      const rows = bodyRows();
      expect(rows).toHaveLength(3);
      expect(toggleIn(rows[0]!)).toHaveAttribute('aria-expanded', 'false');
    });

    it('does not turn a press on the toggle into a row click', async () => {
      const rowClick = vi.fn();
      const { user } = await openFirstDetail('row_detail_click', (
        <>
          <DataGridRowClickPlugin<Item> click={rowClick} />
          <DataGridRowDetailPlugin<Item> render={renderDetail} />
        </>
      ));
      const [row] = bodyRows();

      // The wiring works: a click on the row's own content reaches the callback.
      await user.click(within(row).getByText('Alpha'));
      expect(rowClick).toHaveBeenCalledTimes(1);

      // A press and an Enter on the toggle do not.
      await user.click(toggleIn(row));
      await user.keyboard('{Enter}');
      expect(rowClick).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('group', { name: messages.rowDetail.toggle })).toBeInTheDocument();
    });

    it('takes the toggle name from toggleLabel when the grid passes one', async () => {
      const toggleLabel = (item: Item) => `Notes for ${item.name}`;
      const { user } = renderGrid(
        'row_detail_label',
        <DataGridRowDetailPlugin<Item> render={renderDetail} toggleLabel={toggleLabel} />,
      );
      const [row] = await vi.waitFor(() => {
        const found = bodyRows();
        expect(found.length).toBeGreaterThan(0);
        return found;
      });

      await user.click(within(row).getByRole('button', { name: 'Notes for Alpha' }));

      const detail = screen.getByRole('group', { name: 'Notes for Alpha' });
      expect(detail).toHaveTextContent('Alpha notes');

      const rows = bodyRows();
      const toggle = within(rows[0]!).getByRole('button', { name: 'Notes for Alpha' });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(toggle).toHaveAttribute('aria-controls', detail.id);
    });

    it('renames the toggle through the grid messages', async () => {
      const { user } = renderGrid(
        'row_detail_messages',
        <DataGridRowDetailPlugin<Item> render={renderDetail} />,
        { messages: { rowDetail: { toggle: 'More' } } },
      );
      const [row] = await vi.waitFor(() => {
        const found = bodyRows();
        expect(found.length).toBeGreaterThan(0);
        return found;
      });

      await user.click(within(row).getByRole('button', { name: 'More' }));

      expect(within(bodyRows()[0]!).getByRole('button', { name: 'More' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await user.click(within(bodyRows()[0]!).getByRole('button', { name: 'More' }));
      expect(screen.queryByRole('group', { name: 'More' })).toBeNull();
    });
  });

  describe('the detail row', () => {
    it('spans the data columns and the extra columns at both edges', async () => {
      await openFirstDetail('row_detail_span', (
        <>
          <DataGridRowSelectPlugin<Item> />
          <DataGridRowActionsPlugin<Item>
            component={function RowActions() {
              return <span>act</span>;
            }}
          />
          <DataGridRowDetailPlugin<Item> render={renderDetail} />
        </>
      ));

      const rows = bodyRows();
      const cell = within(rows[1]!).getByRole('cell');
      // One data column, plus the row-detail toggle and the row select at the start and the row
      // actions at the end.
      expect(cell).toHaveAttribute('colspan', '4');
    });

    it('moves the span with the columns a change hides', async () => {
      const twoColumns: DataGridTableColumn<Item>[] = [
        { id: 'name', label: 'Name' },
        { id: 'id', label: 'ID' },
      ];
      const loadTwo = () => Promise.resolve({ results: data, total: data.length });
      const view = render(
        <DataGrid name="row_detail_hide" persistent="memory" load={loadTwo} columns={twoColumns}>
          <DataGridRowSelectPlugin<Item> />
          <DataGridRowDetailPlugin<Item> render={renderDetail} />
          <HideColumnButton columnId="id" />
        </DataGrid>,
      );
      await screen.findByRole('table');
      const [row] = await vi.waitFor(() => {
        const found = bodyRows();
        expect(found.length).toBeGreaterThan(0);
        return found;
      });
      await view.user.click(toggleIn(row));

      expect(within(bodyRows()[1]!).getByRole('cell')).toHaveAttribute('colspan', '4');

      await view.user.click(screen.getByRole('button', { name: 'hide-id' }));

      expect(within(bodyRows()[1]!).getByRole('cell')).toHaveAttribute('colspan', '3');
    });

    it('shows the detail of a record whose reload brings the same ids back', async () => {
      const { user } = await openFirstDetail('row_detail_reload', (
        <>
          <DataGridRowDetailPlugin<Item> render={renderDetail} />
          <RefreshButton />
        </>
      ));
      expect(screen.getByRole('group', { name: messages.rowDetail.toggle })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'refresh' }));
      await screen.findByText('Alpha');

      expect(screen.getByRole('group', { name: messages.rowDetail.toggle })).toHaveTextContent(
        'Alpha notes',
      );
      const [row] = bodyRows();
      expect(toggleIn(row)).toHaveAttribute('aria-expanded', 'true');
    });

    it('renders between a row and its child rows under the table tree', async () => {
      const treeItems: (Item & { parent_id: number | null })[] = [
        { id: 1, name: 'Electronics', parent_id: null },
        { id: 2, name: 'Phones', parent_id: 1 },
      ];
      const loadFlat = () => Promise.resolve({ results: treeItems, total: treeItems.length });
      const { user } = render(
        <DataGrid name="row_detail_tree" persistent="memory" load={loadFlat} columns={columns}>
          <DataGridTableTreePlugin<Item & { parent_id: number | null }> parentKey="parent_id" />
          <DataGridRowDetailPlugin<Item & { parent_id: number | null }> render={renderDetail} />
        </DataGrid>,
      );
      await screen.findByRole('table');
      const [parent] = await vi.waitFor(() => {
        const found = bodyRows();
        expect(found.length).toBeGreaterThan(0);
        return found;
      });
      // The branch is open first: expanding pulls the child rows over a load of their own,
      // which is the state the detail row has to sit inside.
      await user.click(within(parent).getByRole('button', { name: messages.tableTree.expand }));
      await screen.findByText('Phones');

      await user.click(toggleIn(bodyRows()[0]!));

      const rows = bodyRows();
      expect(within(rows[0]!).getByText('Electronics')).toBeInTheDocument();
      expect(within(rows[1]!).getByRole('group')).toHaveTextContent('Electronics notes');
      // The child keeps its place under its parent: the detail sits between them.
      expect(within(rows[2]!).getByText('Phones')).toBeInTheDocument();
    });

    it.each([
      {
        renderer: 'row-click',
        Plugin: function RowClick() {
          return <DataGridRowClickPlugin<Item> click={vi.fn()} />;
        },
      },
      {
        renderer: 'drag and drop',
        Plugin: createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() }),
      },
    ])('renders under the $renderer row renderer too', async ({ renderer, Plugin }) => {
      await openFirstDetail(`row_detail_renderer_${renderer}`, (
        <>
          <Plugin />
          <DataGridRowDetailPlugin<Item> render={renderDetail} />
        </>
      ));

      const rows = bodyRows();
      expect(within(rows[1]!).getByRole('group')).toHaveTextContent('Alpha notes');
    });

    it('hides the open details while a row is dragged and keeps what they hold for after', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      const { user } = await openFirstDetail('row_detail_drag', (
        <>
          <DragDrop />
          <DataGridRowDetailPlugin<Item> render={renderDraft} />
        </>
      ));
      await user.type(screen.getByRole('textbox', { name: 'Draft for Alpha' }), 'Unsaved draft');

      const session = createDragSession();
      await session.start(bodyRows()[0]!);

      expect(screen.queryByRole('textbox', { name: 'Draft for Alpha' })).toBeNull();
      // Hidden, not gone: the toggle still points at an element that exists.
      const controls = toggleIn(bodyRows()[0]!).getAttribute('aria-controls');
      expect(controls).not.toBeNull();
      expect(document.getElementById(controls!)).not.toBeVisible();

      await session.drop(bodyRows()[1]!);

      expect(await screen.findByRole('textbox', { name: 'Draft for Alpha' })).toHaveValue(
        'Unsaved draft',
      );
    });

    it('keeps two grids apart and survives record ids that are odd in a DOM id', async () => {
      const oddData = [{ id: 'a b/c', name: 'Delta' }];
      const oddLoad = () => Promise.resolve({ results: oddData, total: oddData.length });
      render(
        <>
          <DataGrid name="row_detail_grid_a" persistent="memory" load={load} columns={columns}>
            <DataGridRowDetailPlugin<Item> render={renderDetail} />
          </DataGrid>
          <DataGrid
            name="row_detail_grid_b"
            persistent="memory"
            load={oddLoad}
            columns={oddColumns}
          >
            <DataGridRowDetailPlugin<(typeof oddData)[number]> render={renderDetail} />
          </DataGrid>
        </>,
      );
      await screen.findAllByRole('table');

      const tables = screen.getAllByRole('table');
      for (const table of tables) {
        const row = within(table).getAllByRole('row').filter((r) => r.closest('tbody'))[0]!;
        await act(async () => {
          fireEvent.click(within(row).getByRole('button', { name: messages.rowDetail.toggle }));
        });
      }

      const details = screen.getAllByRole('group', { name: messages.rowDetail.toggle });
      expect(details).toHaveLength(2);
      expect(details[0]!.id).not.toBe(details[1]!.id);
      for (const table of tables) {
        const row = within(table).getAllByRole('row').filter((r) => r.closest('tbody'))[0]!;
        const toggle = within(row).getByRole('button', { name: messages.rowDetail.toggle });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const detail = details.find(
          (candidate) => candidate.id === toggle.getAttribute('aria-controls'),
        );
        expect(detail).toBeDefined();
        expect(table).toContainElement(detail ?? null);
      }
    });

    it('gives a number id and a string id of the same text details of their own', async () => {
      // The storage tells 1 from "1", so a tree can hold both: a parent 1 with a child "1".
      type MixedItem = { id: number | string; name: string; parent_id: number | null };
      const mixed: MixedItem[] = [
        { id: 1, name: 'Number', parent_id: null },
        { id: '1', name: 'String', parent_id: 1 },
      ];
      const mixedColumns: DataGridTableColumn<MixedItem>[] = [{ id: 'name', label: 'Name' }];
      const loadMixed = () => Promise.resolve({ results: mixed, total: mixed.length });
      const { user } = render(
        <DataGrid
          name="row_detail_id_types"
          persistent="memory"
          load={loadMixed}
          columns={mixedColumns}
        >
          <DataGridTableTreePlugin<MixedItem> parentKey="parent_id" />
          <DataGridRowDetailPlugin<MixedItem> render={renderDetail} />
        </DataGrid>,
      );
      const [parent] = await vi.waitFor(() => {
        const found = bodyRows();
        expect(found.length).toBeGreaterThan(0);
        return found;
      });
      await user.click(within(parent!).getByRole('button', { name: messages.tableTree.expand }));
      await screen.findByText('String');

      await user.click(toggleIn(bodyRows()[0]!));
      await user.click(toggleIn(bodyRows()[2]!));

      const rows = bodyRows();
      const parentDetail = within(rows[1]!).getByRole('group');
      const childDetail = within(rows[3]!).getByRole('group');
      expect(parentDetail).toHaveTextContent('Number notes');
      expect(childDetail).toHaveTextContent('String notes');
      expect(parentDetail.id).not.toBe(childDetail.id);
      expect(toggleIn(rows[0]!)).toHaveAttribute('aria-controls', parentDetail.id);
      expect(toggleIn(rows[2]!)).toHaveAttribute('aria-controls', childDetail.id);
    });
  });
});
