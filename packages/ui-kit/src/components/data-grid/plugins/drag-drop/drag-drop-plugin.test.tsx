import { act, createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadResult } from '../../data-grid-types';
import { messages } from '../../messages';
import { useDataGrid } from '../../services/core/data-grid-context';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { DataGridRowClickPlugin } from '../row-click/row-click-plugin';
import { DataGridRowSelectPlugin } from '../row-select/row-select-plugin';
import { DataGridTableTreePlugin } from '../table-tree/table-tree-plugin';
import styles from './components/data-grid-drag-drop.module.css';
import { createDataGridDragDropPlugin, executeHandleDrop } from './drag-drop-plugin';
import type { DataGridDragDropPluginApi, DataGridDropLoadingState } from './drag-drop-types';

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function () {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  }),
);

interface Item {
  id: number;
  name: string;
  parent_id?: number | null;
}

const data: Item[] = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
];

const columns: DataGridTableColumn<Item>[] = [{ id: 'name', label: 'Name' }];

function load(): Promise<DataGridLoadResult<Item>> {
  return Promise.resolve({ results: data, total: data.length });
}

// jsdom has no drag and drop and no layout, so a drag is the sequence of events the drag library
// listens for, sent to the element under the "pointer". The library finds that element with
// `document.elementsFromPoint`, which jsdom does not have, and works out the edge of a row from
// `getBoundingClientRect` and the event's `clientY`, so the test supplies each of them.
const rowHeight = 40;

function layOutRows(rows: HTMLElement[]) {
  rows.forEach((row, index) => {
    row.getBoundingClientRect = () => new DOMRect(0, index * rowHeight, 300, rowHeight);
  });
}

function createDragSession() {
  // The preview is built, handed to `setDragImage` and torn down within a frame, so it is copied
  // at the moment it is handed over.
  const previews: Node[] = [];
  const dataTransfer = {
    setDragImage: vi.fn((element: Element) => {
      previews.push(element.cloneNode(true));
    }),
    setData: vi.fn(),
    getData: vi.fn(),
    types: [],
    effectAllowed: 'all',
    dropEffect: 'move',
  };
  let under: Element | null = null;
  let active = false;
  document.elementsFromPoint = () => (under ? [under] : []);

  async function send(type: 'dragStart' | 'dragEnter' | 'dragOver' | 'drop' | 'dragEnd', target: Element, clientY: number) {
    // jsdom has no DragEvent, so the event is a plain one and its coordinates are put on by hand.
    const event = createEvent[type](target, { dataTransfer });
    Object.defineProperties(event, { clientX: { value: 20 }, clientY: { value: clientY } });
    await act(async () => {
      fireEvent(target, event);
      // The library reports the start of a drag and the move over a target on the next frame.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    });
  }

  return {
    dataTransfer,
    previews,
    /** Starts dragging a row, by its handle unless `from` is the element the pointer is on. */
    async start(row: HTMLElement, from: Element | null = row.querySelector('[data-drag-handle]')) {
      under = from;
      active = true;
      await send('dragStart', row, rowHeight / 2);
    },
    /** Moves the pointer over `target`, `clientY` pixels down the page. */
    async over(target: Element, clientY = rowHeight / 2) {
      under = target;
      await send('dragEnter', target, clientY);
      await send('dragOver', target, clientY);
    },
    async drop() {
      if (!under) throw new Error('Nothing is under the pointer to drop on');
      const target = under;
      await send('drop', target, rowHeight / 2);
      active = false;
    },
    /** Ends a drag that was never dropped, so the next test does not start in the middle of one. */
    async end() {
      if (active) await send('dragEnd', document.body, 0);
      active = false;
      under = null;
    },
  };
}

type Session = ReturnType<typeof createDragSession>;

let session: Session;

beforeEach(() => {
  session = createDragSession();
});

afterEach(async () => {
  await session.end();
  Reflect.deleteProperty(document, 'elementsFromPoint');
});

async function bodyRows() {
  const table = await screen.findByRole('table');
  await screen.findByText('Alpha');
  const rows = within(table)
    .getAllByRole('row')
    .filter((row) => row.closest('tbody'));
  layOutRows(rows);
  return rows;
}

function renderGrid(name: string, plugins: ReactNode) {
  return render(
    <DataGrid name={name} persistent="memory" load={load} columns={columns}>
      {plugins}
    </DataGrid>,
  );
}

describe('createDataGridDragDropPlugin', () => {
  describe('the handle', () => {
    it('is the first cell of every body row and makes the row draggable', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_handle', <DragDrop />);
      const rows = await bodyRows();

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        const [first] = within(row).getAllByRole('cell');
        const handle = within(first).getByLabelText(messages.dragDrop.dragHandle);
        expect(handle).toHaveAttribute('data-drag-handle');
        expect(row).toHaveAttribute('draggable', 'true');
      }
    });

    it('comes before the columns the other plugins add at the start', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_handle_order', (
        <>
          <DataGridRowSelectPlugin />
          <DragDrop />
        </>
      ));
      const [row] = await bodyRows();

      const [first, second] = within(row).getAllByRole('cell');
      expect(within(first).getByLabelText(messages.dragDrop.dragHandle)).toBeInTheDocument();
      expect(within(second).getByRole('checkbox')).toBeInTheDocument();
    });

    it('is marked to ignore row clicks, so pressing it does not click a row', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_handle_ignore', <DragDrop />);
      const [row] = await bodyRows();

      expect(within(row).getByLabelText(messages.dragDrop.dragHandle)).toHaveAttribute(
        'data-grid-row-ignore-click',
      );
    });

    it('is the only place a row can be dragged by', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_handle_only', <DragDrop />);
      const [row] = await bodyRows();

      await session.start(row, within(row).getByText('Alpha'));

      expect(row).not.toHaveClass(styles.dragRowDragging);
      expect(session.dataTransfer.setDragImage).not.toHaveBeenCalled();
    });

    it('lets a pointer press and release on it pass without a drag', async () => {
      const onDrop = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      const { user } = renderGrid('drag_drop_press', <DragDrop />);
      const [row] = await bodyRows();

      await user.pointer({ keys: '[MouseLeft>]', target: within(row).getAllByRole('cell')[0] });
      await user.pointer({ keys: '[/MouseLeft]', target: within(row).getAllByRole('cell')[0] });

      expect(onDrop).not.toHaveBeenCalled();
      expect(row.className).not.toContain(styles.dragRowDragging);
    });
  });

  describe('dragging a row', () => {
    it('tints the dragged row and the row it is over, and marks the edge it was entered by', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_states', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[0]);
      expect(rows[0]).toHaveClass(styles.dragRowDragging);

      // Entered by the upper half of the row, the line is on its top edge.
      await session.over(rows[1], rowHeight + 5);
      expect(rows[1]).toHaveClass(styles.dragRowDropping, styles.dragRowDropIndicatorTop);
      expect(rows[1]).not.toHaveClass(styles.dragRowDropIndicatorBottom);

      // Moving on to another row takes the marks off this one, and this row's line is on its
      // bottom edge when the pointer came in by the lower half.
      await session.over(rows[2], 2 * rowHeight + rowHeight - 5);
      expect(rows[1]).not.toHaveClass(styles.dragRowDropping);
      expect(rows[1]).not.toHaveClass(styles.dragRowDropIndicatorTop);
      expect(rows[2]).toHaveClass(styles.dragRowDropping, styles.dragRowDropIndicatorBottom);
      expect(rows[2]).not.toHaveClass(styles.dragRowDropIndicatorTop);
    });

    it('switches the rows\' hover tint off for as long as a row is dragged', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_hover_off', <DragDrop />);
      const rows = await bodyRows();
      const content = screen.getByRole('table').closest(`.${styles.content}`)!;
      expect(content).not.toHaveClass(styles.contentDragging);

      await session.start(rows[0]);
      expect(content).toHaveClass(styles.contentDragging);

      await session.over(rows[1]);
      await session.drop();
      expect(content).not.toHaveClass(styles.contentDragging);
    });

    it('clears every mark when the drag is dropped', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_clear', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[0]);
      await session.over(rows[1]);
      await session.drop();

      for (const row of rows) {
        expect(row).not.toHaveClass(styles.dragRowDragging);
        expect(row).not.toHaveClass(styles.dragRowDropping);
        expect(row).not.toHaveClass(styles.dragRowDropIndicatorTop);
      }
    });

    it('clears every mark, and still drags the next time, when onDrop throws', async () => {
      // The error is rethrown in a microtask; catch it there rather than let it fail the run.
      const thrown: unknown[] = [];
      const queue = globalThis.queueMicrotask.bind(globalThis);
      const spy = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) =>
        queue(() => {
          try {
            callback();
          } catch (error) {
            thrown.push(error);
          }
        }),
      );
      const onDrop = vi.fn(() => {
        throw new Error('The app failed');
      });
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      renderGrid('drag_drop_throws', <DragDrop />);
      const rows = await bodyRows();

      try {
        await session.start(rows[0]);
        await session.over(rows[1]);
        await session.drop();
        await session.start(rows[0]);
        await session.over(rows[2], 2 * rowHeight + 5);
        await session.drop();
      } finally {
        spy.mockRestore();
      }

      expect(onDrop).toHaveBeenCalledTimes(2);
      expect(thrown).toEqual([new Error('The app failed'), new Error('The app failed')]);
      expect(rows[0]).not.toHaveClass(styles.dragRowDragging);
      expect(rows[0].closest(`.${styles.content}`)).not.toHaveClass(styles.contentDragging);
    });

    it('calls onDrop with the dragged item and the item of the row it was dropped on', async () => {
      const onDrop = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      renderGrid('drag_drop_drop_on_row', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[0]);
      await session.over(rows[2], 2 * rowHeight + 5);
      await session.drop();

      expect(onDrop).toHaveBeenCalledOnce();
      expect(onDrop.mock.calls[0][0]).toMatchObject({ item: data[0], target: data[2] });
    });

    it('hands onDrop the plugin context, so it can refresh the grid', async () => {
      const onDrop = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      renderGrid('drag_drop_context', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[0]);
      await session.over(rows[1]);
      await session.drop();

      expect(onDrop.mock.calls[0][0]).toEqual(
        expect.objectContaining({ refresh: expect.any(Function), triggerLoad: expect.any(Function) }),
      );
    });

    it('calls onDrop with a null target when it is dropped on the grid and not on a row', async () => {
      const onDrop = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      renderGrid('drag_drop_root', <DragDrop />);
      const rows = await bodyRows();
      const content = screen.getByRole('table').closest(`.${styles.content}`)!;

      await session.start(rows[0]);
      // The drag begins over its own row, which is not a target of its own, so the grid is the
      // target from the start and nothing is reported until the pointer goes somewhere else.
      await session.over(rows[1]);
      expect(content).not.toHaveClass(styles.contentRootDropping);
      await session.over(content);
      // The grid outlines itself while it is the target.
      expect(content).toHaveClass(styles.contentRootDropping);
      await session.drop();

      expect(onDrop).toHaveBeenCalledOnce();
      expect(onDrop.mock.calls[0][0]).toMatchObject({ item: data[0], target: null });
      expect(content).not.toHaveClass(styles.contentRootDropping);
    });

    it('does not take a row as its own target: a drop on itself lands on the grid, with a null target', async () => {
      const onDrop = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      renderGrid('drag_drop_self', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[1]);
      await session.over(rows[1], rowHeight + 5);
      expect(rows[1]).not.toHaveClass(styles.dragRowDropping);
      await session.drop();

      // The row refuses itself, but the grid around it does not, so the drop reaches that.
      expect(onDrop).toHaveBeenCalledOnce();
      expect(onDrop.mock.calls[0][0]).toMatchObject({ item: data[1], target: null });
    });

    it('does not call onDrop for a drop outside the grid', async () => {
      const onDrop = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      renderGrid('drag_drop_outside', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[0]);
      await session.over(document.body);
      await session.drop();

      expect(onDrop).not.toHaveBeenCalled();
      expect(rows[0]).not.toHaveClass(styles.dragRowDragging);
    });
  });

  describe('a drop that takes time', () => {
    it('shows a spinner in the dragged row\'s handle until the promise settles', async () => {
      let finish: () => void = () => {};
      const onDrop = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
      renderGrid('drag_drop_async', <DragDrop />);
      const rows = await bodyRows();
      const handleOf = (row: HTMLElement) => within(row).getByLabelText(messages.dragDrop.dragHandle);

      await session.start(rows[0]);
      await session.over(rows[1]);
      await session.drop();

      expect(within(handleOf(rows[0])).getByRole('status')).toBeInTheDocument();
      expect(handleOf(rows[0])).toHaveClass(styles.dragHandlerLoading);
      expect(within(handleOf(rows[1])).queryByRole('status')).toBeNull();

      await act(async () => finish());

      await waitFor(() => expect(within(handleOf(rows[0])).queryByRole('status')).toBeNull());
      expect(handleOf(rows[0])).not.toHaveClass(styles.dragHandlerLoading);
    });

    it('shows no spinner when onDrop does not return a promise', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_sync', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[0]);
      await session.over(rows[1]);
      await session.drop();

      expect(within(rows[0]).queryByRole('status')).toBeNull();
    });

    it('stops the spinner when the promise rejects, without an unhandled rejection', async () => {
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      try {
        const onDrop = vi.fn(() => Promise.reject(new Error('The server said no')));
        const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop });
        renderGrid('drag_drop_rejects', <DragDrop />);
        const rows = await bodyRows();

        await session.start(rows[0]);
        await session.over(rows[1]);
        await session.drop();

        await waitFor(() => expect(within(rows[0]).queryByRole('status')).toBeNull());
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });
  });

  describe('the drag preview', () => {
    it('is a copy of the row in a table of its own when no renderer is given', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      renderGrid('drag_drop_default_preview', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[0]);

      expect(session.dataTransfer.setDragImage).toHaveBeenCalledOnce();
      const [container] = session.previews;
      const preview = container instanceof Element ? container.querySelector(`table.${styles.dragPreview}`) : null;
      expect(preview?.textContent).toContain('Alpha');
    });

    it('is what renderDragPreview returns for the dragged item, rendered inside the grid\'s React tree', async () => {
      const renderDragPreview = vi.fn((item: Item) => <b>Moving {item.name}</b>);
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn(), renderDragPreview });
      renderGrid('drag_drop_custom_preview', <DragDrop />);
      const rows = await bodyRows();

      await session.start(rows[1]);

      const [container] = session.previews;
      expect(container.textContent).toBe('Moving Beta');
      expect(renderDragPreview).toHaveBeenCalledWith(data[1]);
      expect(container instanceof Element && container.querySelector('table')).toBeNull();
    });

    it('is offered to the plugin API for code that wants it', async () => {
      const renderDragPreview = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn(), renderDragPreview });
      let api: DataGridDragDropPluginApi | undefined;
      function Probe() {
        api = useDataGrid().getPlugin<DataGridDragDropPluginApi>('dragDrop');
        return null;
      }
      renderGrid('drag_drop_api', (
        <>
          <DragDrop />
          <Probe />
        </>
      ));
      await bodyRows();

      expect(api?.renderDragPreview).toBe(renderDragPreview);
    });

    it('is left undefined on the plugin API when the option is not given', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      let api: DataGridDragDropPluginApi | undefined;
      function Probe() {
        api = useDataGrid().getPlugin<DataGridDragDropPluginApi>('dragDrop');
        return null;
      }
      renderGrid('drag_drop_api_default', (
        <>
          <DragDrop />
          <Probe />
        </>
      ));
      await bodyRows();

      expect(api).toBeDefined();
      expect(api?.renderDragPreview).toBeUndefined();
    });
  });

  describe('two grids on a page', () => {
    it('does not mark, or call the onDrop of, another grid that has the plugin', async () => {
      const dropOnFirst = vi.fn();
      const dropOnSecond = vi.fn();
      const First = createDataGridDragDropPlugin<Item>({ onDrop: dropOnFirst });
      const Second = createDataGridDragDropPlugin<Item>({ onDrop: dropOnSecond });
      render(
        <>
          <DataGrid name="drag_drop_first" persistent="memory" load={load} columns={columns}>
            <First />
          </DataGrid>
          <DataGrid name="drag_drop_second" persistent="memory" load={load} columns={columns}>
            <Second />
          </DataGrid>
        </>,
      );
      await waitFor(() => expect(screen.getAllByText('Alpha')).toHaveLength(2));
      const [firstTable, secondTable] = screen.getAllByRole('table');
      const firstRows = within(firstTable).getAllByRole('row').filter((row) => row.closest('tbody'));
      const secondRows = within(secondTable).getAllByRole('row').filter((row) => row.closest('tbody'));
      layOutRows(firstRows);
      layOutRows(secondRows);

      await session.start(firstRows[0]);
      expect(firstRows[0]).toHaveClass(styles.dragRowDragging);
      expect(secondRows[0]).not.toHaveClass(styles.dragRowDragging);

      await session.over(secondRows[1]);
      expect(secondRows[1]).not.toHaveClass(styles.dragRowDropping);
      await session.drop();

      expect(dropOnSecond).not.toHaveBeenCalled();
      // The other grid's row refuses the drag, so it is never what the dragging grid is told it
      // was dropped on.
      for (const [result] of dropOnFirst.mock.calls) expect(result.target).toBeNull();
    });
  });
});

describe('rendering the rows that follow the pointer, with other row renderers', () => {
  const flat: Item[] = [
    { id: 1, name: 'Alpha', parent_id: null },
    { id: 2, name: 'Beta', parent_id: 1 },
  ];

  function renderWith(name: string, plugins: ReactNode) {
    return render(
      <DataGrid
        name={name}
        persistent="memory"
        load={() => Promise.resolve({ results: flat, total: flat.length })}
        columns={columns}
      >
        {plugins}
      </DataGrid>,
    );
  }

  // Row click, the table tree and drag and drop each replace the `row` renderer, and the plugin
  // registered last wins.
  describe('row click', () => {
    it('drags, and does not click, when it is declared after row click', async () => {
      const rowClick = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      const { user } = renderWith('drag_drop_after_click', (
        <>
          <DataGridRowClickPlugin<Item> click={rowClick} />
          <DragDrop />
        </>
      ));
      const rows = await bodyRows();

      expect(rows[0]).toHaveAttribute('draggable', 'true');
      await user.click(within(rows[0]).getByText('Alpha'));
      expect(rowClick).not.toHaveBeenCalled();
    });

    it('clicks, and does not drag, when it is declared before row click', async () => {
      const rowClick = vi.fn();
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      const { user } = renderWith('drag_drop_before_click', (
        <>
          <DragDrop />
          <DataGridRowClickPlugin<Item> click={rowClick} />
        </>
      ));
      await screen.findByText('Alpha');
      const rows = screen.getAllByRole('row').filter((row) => row.closest('tbody'));

      // The handle column is still there, but the row that registers the drag is row click's.
      expect(within(rows[0]).getByLabelText(messages.dragDrop.dragHandle)).toBeInTheDocument();
      expect(rows[0]).not.toHaveAttribute('draggable');
      await user.click(within(rows[0]).getByText('Alpha'));
      expect(rowClick).toHaveBeenCalledWith(flat[0]);
    });
  });

  describe('the table tree', () => {
    it('drags, but shows no children under a row, when it is declared after the tree', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      const { user } = renderWith('drag_drop_after_tree', (
        <>
          <DataGridTableTreePlugin<Item> parentKey="parent_id" />
          <DragDrop />
        </>
      ));
      const rows = await bodyRows();

      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute('draggable', 'true');

      // The tree's cell still draws the toggle and opens the branch, but the drag row has no
      // place to render what is under it.
      await user.click(within(rows[0]).getByRole('button'));
      expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    });

    it('shows the children, and drags nothing, when it is declared before the tree', async () => {
      const DragDrop = createDataGridDragDropPlugin<Item>({ onDrop: vi.fn() });
      const { user } = renderWith('drag_drop_before_tree', (
        <>
          <DragDrop />
          <DataGridTableTreePlugin<Item> parentKey="parent_id" />
        </>
      ));
      await screen.findByText('Alpha');
      const [row] = screen.getAllByRole('row').filter((candidate) => candidate.closest('tbody'));

      expect(within(row).getByLabelText(messages.dragDrop.dragHandle)).toBeInTheDocument();
      expect(row).not.toHaveAttribute('draggable');
      await user.click(within(row).getByRole('button'));
      expect(await screen.findByText('Beta')).toBeInTheDocument();
    });
  });
});

describe('executeHandleDrop', () => {
  function mockRecord(id: string, name: string) {
    return { id, item: { id, name } };
  }

  function createDropLoadingHelpers() {
    let loading: DataGridDropLoadingState['loading'] = {};
    return {
      loading: () => loading,
      setDropLoading: (id: string | number, value: boolean) => {
        loading = { ...loading, [id]: value };
      },
      clearDropLoading: (id: string | number) => {
        const next = { ...loading };
        delete next[id];
        loading = next;
      },
    };
  }

  it('calls onDrop with item and target', () => {
    const onDrop = vi.fn();
    const sourceRecord = mockRecord('source', 'Source');
    const targetRecord = mockRecord('target', 'Target');

    executeHandleDrop({
      sourceRecord,
      targetRecord,
      onDrop,
      setDropLoading: vi.fn(),
      clearDropLoading: vi.fn(),
    });

    expect(onDrop).toHaveBeenCalledWith(sourceRecord.item, targetRecord.item);
  });

  it('passes null target when dropping on root', () => {
    const onDrop = vi.fn();
    const sourceRecord = mockRecord('source', 'Source');

    executeHandleDrop({
      sourceRecord,
      targetRecord: undefined,
      onDrop,
      setDropLoading: vi.fn(),
      clearDropLoading: vi.fn(),
    });

    expect(onDrop).toHaveBeenCalledWith(sourceRecord.item, null);
  });

  it('tracks loading state when onDrop returns a Promise', async () => {
    const { loading, setDropLoading, clearDropLoading } = createDropLoadingHelpers();

    let resolve: () => void = () => {};
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    const onDrop = vi.fn(() => promise);
    const sourceRecord = mockRecord('source', 'Source');

    executeHandleDrop({
      sourceRecord,
      targetRecord: undefined,
      onDrop,
      setDropLoading,
      clearDropLoading,
    });

    expect(loading().source).toBe(true);

    resolve();
    await promise;
    await new Promise((r) => setTimeout(r, 0));

    expect(loading().source).toBeUndefined();
  });

  it('clears the loading state of a drop that rejects', async () => {
    const { loading, setDropLoading, clearDropLoading } = createDropLoadingHelpers();
    const sourceRecord = mockRecord('source', 'Source');

    executeHandleDrop({
      sourceRecord,
      targetRecord: undefined,
      onDrop: () => Promise.reject(new Error('no')),
      setDropLoading,
      clearDropLoading,
    });
    expect(loading().source).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(loading().source).toBeUndefined();
  });

  it('does not set loading state for sync onDrop', () => {
    const setDropLoading = vi.fn();
    const sourceRecord = mockRecord('source', 'Source');

    executeHandleDrop({
      sourceRecord,
      targetRecord: undefined,
      onDrop: vi.fn(),
      setDropLoading,
      clearDropLoading: vi.fn(),
    });

    expect(setDropLoading).not.toHaveBeenCalled();
  });
});
