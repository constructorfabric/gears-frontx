import userEvent from '@testing-library/user-event';
import { messages } from '../../messages';
import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { render } from '../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../data-grid';
import type { DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';
import { useDataGrid } from '../../services/core/data-grid-context';
import type { LoadContextOrderItem } from '../../services/plugins/plugins-types';
import type { DataGridTableColumn } from '../../services/table/table-types';
import { DataGridOrderPlugin } from './order-plugin';
import type {
  DataGridDefaultOrder,
  DataGridOrderOption,
  DataGridOrderPluginApi,
  DataGridOrderPopoverOptions,
} from './order-types';

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
  code: string;
}

const testData: TestItem[] = [
  { id: 1, name: 'Alice', code: 'A-1' },
  { id: 2, name: 'Bob', code: 'B-2' },
];

const testColumns: DataGridTableColumn<TestItem>[] = [
  { id: 'name', label: 'Name' },
  { id: 'code', label: 'Code' },
];

const gridName = 'test_order_excluded_columns';
const storageKey = `dataGrid:${gridName}:order`;

function createLoadFn() {
  return vi.fn<(context: DataGridLoadContext) => Promise<DataGridLoadResult<TestItem>>>(() =>
    Promise.resolve({ results: testData, total: testData.length }),
  );
}

/** Writes the value the persistent-state service would have written in an earlier session. */
function persistOrder(order: LoadContextOrderItem) {
  localStorage.setItem(storageKey, JSON.stringify(order));
}

/** Lets a test drive the plugin API, for states only reachable after the grid has mounted. */
let orderApi: DataGridOrderPluginApi | undefined;

/** Surfaces the plugin's order state so the header's source of truth can be asserted. */
function OrderStateProbe() {
  const grid = useDataGrid<TestItem>();
  const api = grid.getPlugin<DataGridOrderPluginApi>('order')!;
  const order = api.useOrder();

  useEffect(() => {
    orderApi = api;
  }, [api]);

  return (
    <output aria-label="Order state">
      {order ? `${order.columnId}:${order.direction}` : 'none'}
    </output>
  );
}

interface OrderPluginProps {
  excludedColumns?: string[];
  defaultOrder?: DataGridDefaultOrder;
  options?: DataGridOrderOption[];
  popover?: DataGridOrderPopoverOptions;
}

async function renderGrid(pluginProps: OrderPluginProps = {}) {
  const load = createLoadFn();

  const result = render(
    <DataGrid name={gridName} load={load} columns={testColumns}>
      <DataGridOrderPlugin {...pluginProps} />
      <OrderStateProbe />
    </DataGrid>,
  );

  return { load, ...result };
}

/** Drives a prop change after mount, which `rerender` cannot do without losing the providers. */
let setPluginProps: ((props: OrderPluginProps) => void) | undefined;

function ControlledGrid({
  initialProps,
  load,
}: {
  initialProps: OrderPluginProps;
  load: ReturnType<typeof createLoadFn>;
}) {
  const [pluginProps, setProps] = useState(initialProps);

  useEffect(() => {
    setPluginProps = setProps;
  }, []);

  return (
    <DataGrid name={gridName} load={load} columns={testColumns}>
      <DataGridOrderPlugin {...pluginProps} />
      <OrderStateProbe />
    </DataGrid>
  );
}

async function renderControlledGrid(initialProps: OrderPluginProps = {}) {
  const load = createLoadFn();
  const result = render(
    <ControlledGrid initialProps={initialProps} load={load} />,
  );

  return { load, ...result };
}

describe('DataGridOrderPlugin order resolution', () => {

  beforeEach(() => {
    vi.restoreAllMocks();
    // Wholesale, as the reference tests do: a sibling plugin added to this harness would write its
    // own keys and leak between cases.
    localStorage.clear();
    sessionStorage.clear();
    orderApi = undefined;
    setPluginProps = undefined;
  });

  describe('load context', () => {
    it('omits a persisted order whose column is excluded and not offered', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toBeUndefined();
    });

    // Harness control: with nothing configured the load context carries no order, which is what
    // gives the `toBeUndefined()` assertions around it their meaning.
    it('sends no order when none is set', async () => {
      const { load } = await renderGrid();
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toBeUndefined();
    });

    it('sends a persisted order whose column is not excluded', async () => {
      persistOrder({ columnId: 'name', direction: 'desc' });

      const { load } = await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'desc' }]);
    });

    it('omits a defaultOrder whose column is excluded and not offered', async () => {
      const { load } = await renderGrid({
        excludedColumns: ['code'],
        defaultOrder: { id: 'code', direction: 'asc' },
      });
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toBeUndefined();
    });

    it('falls back to defaultOrder when a persisted excluded order is discarded', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderGrid({
        excludedColumns: ['code'],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('does not refetch when it discards on mount', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderGrid({
        excludedColumns: ['code'],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      // The plugin's effect runs before the grid's first load, measured in Chromium as well as
      // here, so the derivation has already corrected the order by the time anything is requested.
      // A refetch would be a second identical request.
      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load).toHaveBeenCalledTimes(1);
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('sends no order when the discarded order has no usable default to fall back to', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderGrid({
        excludedColumns: ['code', 'name'],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toBeUndefined();
    });

    it('refuses setOrder on a column that is orderable nowhere', async () => {
      // `setOrder` is the only public route that could put an unorderable column into the order
      // state. It must not, or the plugin would hold and persist an order the user cannot reach.
      const { load } = await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalled());
      const callsBefore = load.mock.calls.length;

      act(() => {
        orderApi!.setOrder('code', 'desc');
      });

      expect(await screen.findByText('none')).toBeInTheDocument();
      expect(localStorage.getItem(storageKey)).toBeNull();
      expect(load).toHaveBeenCalledTimes(callsBefore);
    });

    it('still accepts setOrder on a column that is excluded but offered', async () => {
      const { load } = await renderGrid({
        excludedColumns: ['code'],
        options: [{ id: 'code', label: 'Code' }],
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalled());

      act(() => {
        orderApi!.setOrder('code', 'desc');
      });

      expect(await screen.findByText('code:desc')).toBeInTheDocument();
      await waitFor(() =>
        expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]),
      );
    });

    it('does not revive defaultOrder after the user cleared the sort', async () => {
      // The cleared sentinel is a deliberate choice, unlike an unusable stored order.
      localStorage.setItem(
        storageKey,
        JSON.stringify({ columnId: '__cleared__', direction: 'asc' }),
      );

      const { load } = await renderGrid({ defaultOrder: { id: 'name', direction: 'asc' } });
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toBeUndefined();
    });
  });

  describe('header state after an unorderable order is discarded', () => {
    it('leaves the excluded column with no sort control and no direction icon', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');

      const codeHeader = screen.getByRole('columnheader', { name: 'Code' });

      expect(codeHeader).toBeInTheDocument();
      expect(
        within(codeHeader).queryByRole('button', {
          name: messages.order.changeSorting('Code'),
        }),
      ).not.toBeInTheDocument();
    });

    it('moves the indicator to the default order column, not the excluded one', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      await renderGrid({
        excludedColumns: ['code'],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      expect(await screen.findByText('name:asc')).toBeInTheDocument();
      expect(
        within(screen.getByRole('columnheader', { name: 'Code' })).queryByRole('button', {
          name: messages.order.changeSorting('Code'),
        }),
      ).not.toBeInTheDocument();
    });

    it('shows no indicator when there is no default order to fall back to', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');

      expect(await screen.findByText('none')).toBeInTheDocument();
    });

    it('keeps a non-excluded column sortable with its direction icon', async () => {
      persistOrder({ columnId: 'name', direction: 'desc' });

      await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');

      // A sorted, sortable header renders two controls, the label button and the direction icon,
      // and the two share one name, so they are counted rather than looked up one by one. The
      // icon's arrow has no accessible handle, so the direction itself is asserted through the
      // plugin's own state.
      expect(
        screen.getAllByRole('button', { name: messages.order.changeSorting('Name') }),
      ).toHaveLength(2);
      expect(await screen.findByText('name:desc')).toBeInTheDocument();
    });
  });

  // An excluded column listed in `options` is still orderable through the toolbar button, which
  // shows its label and direction, so the withholding rule does not apply to it at all.
  describe('a column excluded from the header but offered in options', () => {
    const offered = { excludedColumns: ['code'], options: [{ id: 'code', label: 'Code' }] };

    it('sends its persisted order to the load context', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderGrid(offered);
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]);
    });

    it('keeps that order in the plugin state rather than discarding it', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      await renderGrid(offered);
      await screen.findByRole('table');

      expect(await screen.findByText('code:desc')).toBeInTheDocument();
    });

    it('leaves the stored value in place', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      await renderGrid(offered);
      await screen.findByRole('table');

      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        columnId: 'code',
        direction: 'desc',
      });
    });

    it('does not refetch, since nothing was discarded', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderGrid(offered);
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('applies a defaultOrder naming it', async () => {
      const { load } = await renderGrid({
        ...offered,
        defaultOrder: { id: 'code', direction: 'asc' },
      });
      await screen.findByRole('table');

      await waitFor(() => expect(load).toHaveBeenCalled());
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'asc' }]);
    });

    it('is offered by the toolbar button, and ordering from there reaches the request', async () => {
      // Driven through the button rather than the API: this is the "offers" half of the
      // guarantee that what the plugin offers and what it sends agree. Filtering `options` by
      // `excludedColumns` would break the whole rule and nothing else would notice.
      const user = userEvent.setup();
      const { load } = await renderGrid(offered);
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: messages.order.sort }));
      await user.click(await screen.findByRole('menuitem', { name: 'Code' }));

      await waitFor(() =>
        expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]),
      );
    });

    // The header rule is unchanged by any of the above: exclusion still governs the header on
    // its own, which is what the consumer asked for by listing the column in both props.
    it('still gives it no header sort control and no direction icon', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      await renderGrid(offered);
      await screen.findByRole('table');

      const codeHeader = screen.getByRole('columnheader', { name: 'Code' });

      expect(codeHeader).toBeInTheDocument();
      expect(
        within(codeHeader).queryByRole('button', {
          name: messages.order.changeSorting('Code'),
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe('discarding after the grid has loaded', () => {
    it('refetches, so the rows catch up with the order the header now shows', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      // `code` starts orderable, so the first load goes out carrying it.
      const { load } = await renderControlledGrid({
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]);

      // The consumer stops offering it. Those rows are now stale, so this pass has to refetch.
      act(() => {
        setPluginProps!({
          excludedColumns: ['code'],
          defaultOrder: { id: 'name', direction: 'asc' },
        });
      });

      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('treats a removed options prop as empty, not as its previous value', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      // `code` is excluded but offered, so its order is sent.
      const { load } = await renderControlledGrid({
        excludedColumns: ['code'],
        options: [{ id: 'code', label: 'Code' }],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]);

      // The consumer stops passing `options` at all rather than passing an empty array. If the
      // store kept the old value the column would still count as offered and the order would
      // keep going out after its only control was gone.
      act(() => {
        setPluginProps!({
          excludedColumns: ['code'],
          defaultOrder: { id: 'name', direction: 'asc' },
        });
      });

      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);
      // Withheld, not deleted: the narrowing made the order unusable, not wrong.
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        columnId: 'code',
        direction: 'desc',
      });

      // Offering the column again makes the stored order reachable, so it comes back.
      act(() => {
        setPluginProps!({
          excludedColumns: ['code'],
          options: [{ id: 'code', label: 'Code' }],
          defaultOrder: { id: 'name', direction: 'asc' },
        });
      });

      expect(await screen.findByText('code:desc')).toBeInTheDocument();
      await waitFor(() =>
        expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]),
      );
    });

    it('treats a removed excludedColumns prop as empty, not as its previous value', async () => {
      const { load } = await renderControlledGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

      act(() => {
        setPluginProps!({});
      });

      // `code` is orderable again, so the plugin accepts an order for it.
      act(() => {
        orderApi!.setOrder('code', 'desc');
      });

      expect(await screen.findByText('code:desc')).toBeInTheDocument();
      await waitFor(() =>
        expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]),
      );
    });

    it('reacts the same way when the column drops out of options instead', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      // `code` is excluded from the header throughout; the toolbar option is what keeps it
      // orderable, so withdrawing that option is the other way to make it unorderable.
      const { load } = await renderControlledGrid({
        excludedColumns: ['code'],
        options: [{ id: 'code', label: 'Code' }],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]);

      act(() => {
        setPluginProps!({
          excludedColumns: ['code'],
          options: [],
          defaultOrder: { id: 'name', direction: 'asc' },
        });
      });

      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        columnId: 'code',
        direction: 'desc',
      });
    });
  });

  describe('an unusable order is withheld rather than removed from storage', () => {
    it('keeps the stored value, so the order returns once the column is orderable again', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const excluded = await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');
      await waitFor(() => expect(excluded.load).toHaveBeenCalled());
      expect(excluded.load.mock.lastCall![0].order).toBeUndefined();
      excluded.unmount();

      // The kit cannot tell a narrowing that lasts from one that is a render pass of a consumer
      // still loading its options, so it withholds the order rather than destroying it.
      const included = await renderGrid();
      await screen.findByRole('table');

      await waitFor(() => expect(included.load).toHaveBeenCalled());
      expect(included.load.mock.lastCall![0].order).toEqual([
        { column: 'code', direction: 'desc' },
      ]);
    });

    it('applies defaultOrder in its place while the stored value stays put', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const excluded = await renderGrid({
        excludedColumns: ['code'],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      // A list that must not open unordered is the reason a default exists, so the fallback still applies.
      await waitFor(() => expect(excluded.load).toHaveBeenCalled());
      expect(excluded.load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        columnId: 'code',
        direction: 'desc',
      });
      excluded.unmount();

      const next = await renderGrid({
        excludedColumns: ['code'],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      await waitFor(() => expect(next.load).toHaveBeenCalled());
      expect(next.load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);
    });

    it('does not clear the sentinel a user wrote by clearing the sort', async () => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ columnId: '__cleared__', direction: 'asc' }),
      );

      await renderGrid({
        excludedColumns: ['code'],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        columnId: '__cleared__',
        direction: 'asc',
      });
    });
  });

  describe('a consumer whose options arrive asynchronously', () => {
    const asyncProps = {
      excludedColumns: ['code'],
      options: [] as DataGridOrderOption[],
      defaultOrder: { id: 'name', direction: 'asc' } satisfies DataGridDefaultOrder,
    };

    it('keeps the stored order through the pass where options are still empty', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      // The consumer's first render derives `options` from data it has not fetched yet, so `code`
      // reads as orderable nowhere on this pass only.
      const { load } = await renderControlledGrid(asyncProps);
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);

      act(() => {
        setPluginProps!({ ...asyncProps, options: [{ id: 'code', label: 'Code' }] });
      });

      // The real options arrive and the user's own order is still there to restore.
      expect(await screen.findByText('code:desc')).toBeInTheDocument();
      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]);
    });

    it('still has it after a remount inside the empty window', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const first = await renderGrid(asyncProps);
      await screen.findByRole('table');
      await waitFor(() => expect(first.load).toHaveBeenCalled());
      first.unmount();

      const second = await renderGrid({
        ...asyncProps,
        options: [{ id: 'code', label: 'Code' }],
      });
      await screen.findByRole('table');

      await waitFor(() => expect(second.load).toHaveBeenCalled());
      expect(second.load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]);
    });
  });

  describe('an order already applied this session', () => {
    it('is not moved by a later change to defaultOrder', async () => {
      const { load } = await renderControlledGrid({
        defaultOrder: { id: 'name', direction: 'asc' },
        popover: { minInlineSize: 200 },
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]);

      act(() => {
        setPluginProps!({
          defaultOrder: { id: 'code', direction: 'desc' },
          popover: { minInlineSize: 300 },
        });
      });

      // The control: proves the props pass reached the plugin at all.
      expect(orderApi!.popover?.minInlineSize).toBe(300);

      // The default seeds an order, it does not keep governing one. Re-sorting a grid the user is
      // looking at because a prop changed is not what a default is for.
      expect(await screen.findByText('name:asc')).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('is not cleared by removing defaultOrder', async () => {
      const { load } = await renderControlledGrid({
        defaultOrder: { id: 'name', direction: 'asc' },
        popover: { minInlineSize: 200 },
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

      act(() => {
        setPluginProps!({ popover: { minInlineSize: 300 } });
      });

      expect(orderApi!.popover?.minInlineSize).toBe(300);

      expect(await screen.findByText('name:asc')).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('survives a props pass that changes something else', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderControlledGrid({ popover: { minInlineSize: 200 } });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

      act(() => {
        setPluginProps!({ popover: { minInlineSize: 300 } });
      });

      expect(orderApi!.popover?.minInlineSize).toBe(300);
      expect(await screen.findByText('code:desc')).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('reads the order it wrote itself, not what storage says afterwards', async () => {
      const { load } = await renderControlledGrid({ popover: { minInlineSize: 200 } });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

      act(() => {
        orderApi!.setOrder('code', 'desc');
      });
      expect(await screen.findByText('code:desc')).toBeInTheDocument();

      // Another tab, or a user editing the key by hand. Persistence is where this plugin writes and
      // what it reads at construction; it is not re-read on every props pass.
      persistOrder({ columnId: 'name', direction: 'asc' });

      act(() => {
        setPluginProps!({ popover: { minInlineSize: 300 } });
      });

      // The control: without this the props pass could have been dropped by the memo comparator and
      // the assertion below would hold for the wrong reason.
      expect(orderApi!.popover?.minInlineSize).toBe(300);
      expect(await screen.findByText('code:desc')).toBeInTheDocument();
    });

    it('keeps a cleared sort cleared across an unrelated props pass', async () => {
      const { load } = await renderControlledGrid({
        defaultOrder: { id: 'name', direction: 'asc' },
        popover: { minInlineSize: 200 },
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

      act(() => {
        orderApi!.toggleOrder('name');
      });
      expect(await screen.findByLabelText('Order state')).toHaveTextContent('none');

      act(() => {
        setPluginProps!({
          defaultOrder: { id: 'name', direction: 'asc' },
          popover: { minInlineSize: 300 },
        });
      });

      expect(orderApi!.popover?.minInlineSize).toBe(300);
      expect(await screen.findByLabelText('Order state')).toHaveTextContent('none');
    });
  });

  describe('cases the withholding rule reaches with no fallback', () => {
    it('leaves the grid unordered when a narrowing has no usable default', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderControlledGrid({});
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
      expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]);

      // No `defaultOrder` anywhere, so nothing masks the no-fallback path.
      act(() => {
        setPluginProps!({ excludedColumns: ['code'] });
      });

      await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
      expect(load.mock.lastCall![0].order).toBeUndefined();
      expect(await screen.findByLabelText('Order state')).toHaveTextContent('none');
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        columnId: 'code',
        direction: 'desc',
      });
    });

    it('does not resurrect a withheld order once the user sorts by something else', async () => {
      persistOrder({ columnId: 'code', direction: 'desc' });

      const { load } = await renderControlledGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

      // The user picks a different column while `code` is unreachable. That is a real choice, so it
      // has to supersede the withheld value rather than sit behind it.
      act(() => {
        orderApi!.setOrder('name', 'asc');
      });
      expect(await screen.findByLabelText('Order state')).toHaveTextContent('name:asc');

      act(() => {
        setPluginProps!({});
      });

      expect(await screen.findByLabelText('Order state')).toHaveTextContent('name:asc');
      await waitFor(() =>
        expect(load.mock.lastCall![0].order).toEqual([{ column: 'name', direction: 'asc' }]),
      );
    });

    it('refuses setOrder on an unreachable column without touching the stored order', async () => {
      persistOrder({ columnId: 'name', direction: 'desc' });

      const { load } = await renderGrid({ excludedColumns: ['code'] });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalled());

      act(() => {
        orderApi!.setOrder('code', 'asc');
      });

      expect(await screen.findByLabelText('Order state')).toHaveTextContent('name:desc');
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
        columnId: 'name',
        direction: 'desc',
      });
    });

    it('falls back to the current default when an applied order becomes unreachable', async () => {
      const { load } = await renderControlledGrid({
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');
      await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

      // The default moves while `name:asc` is applied, which does not re-sort the grid.
      act(() => {
        setPluginProps!({ defaultOrder: { id: 'code', direction: 'desc' } });
      });
      expect(await screen.findByLabelText('Order state')).toHaveTextContent('name:asc');

      // Now the applied order stops being reachable, so the fallback runs and takes the default as
      // it stands today rather than the one that seeded the initial order.
      act(() => {
        setPluginProps!({
          defaultOrder: { id: 'code', direction: 'desc' },
          excludedColumns: ['name'],
        });
      });

      expect(await screen.findByLabelText('Order state')).toHaveTextContent('code:desc');
      await waitFor(() =>
        expect(load.mock.lastCall![0].order).toEqual([{ column: 'code', direction: 'desc' }]),
      );
    });
  });
});

describe('DataGridOrderPlugin controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    orderApi = undefined;
    setPluginProps = undefined;
  });

  function sentOrder(load: ReturnType<typeof createLoadFn>) {
    return load.mock.lastCall?.[0].order;
  }

  function nameHeaderCell() {
    return screen.getAllByRole('columnheader').find((cell) => cell.textContent?.includes('Name'))!;
  }

  it('cycles a column through descending, ascending and unsorted on header clicks', async () => {
    const { load, user } = await renderGrid();
    await screen.findByRole('table');

    const label = within(nameHeaderCell()).getByRole('button', {
      name: messages.order.changeSorting('Name'),
    });

    await user.click(label);
    await waitFor(() => expect(sentOrder(load)).toEqual([{ column: 'name', direction: 'desc' }]));

    await user.click(label);
    await waitFor(() => expect(sentOrder(load)).toEqual([{ column: 'name', direction: 'asc' }]));

    await user.click(label);
    await waitFor(() => expect(sentOrder(load)).toBeUndefined());
  });

  it('shows the direction icon only on the sorted column, and it advances the same cycle', async () => {
    const { load, user } = await renderGrid();
    await screen.findByRole('table');
    expect(within(nameHeaderCell()).getAllByRole('button')).toHaveLength(1);

    await user.click(
      within(nameHeaderCell()).getByRole('button', { name: messages.order.changeSorting('Name') }),
    );
    await waitFor(() => expect(within(nameHeaderCell()).getAllByRole('button')).toHaveLength(2));

    // Both controls carry the column's name; the icon is the one after the label.
    const [, icon] = within(nameHeaderCell()).getAllByRole('button');
    await user.click(icon);

    await waitFor(() => expect(sentOrder(load)).toEqual([{ column: 'name', direction: 'asc' }]));
  });

  describe('toolbar button', () => {
    const options = [
      { id: 'name', label: 'Name' },
      { id: 'code', label: 'Code' },
    ];

    it('is not drawn without options', async () => {
      await renderGrid();
      await screen.findByRole('table');

      expect(screen.queryByRole('button', { name: messages.order.sort })).not.toBeInTheDocument();
    });

    it('offers the columns, and the directions only once a column is chosen', async () => {
      const { load, user } = await renderGrid({ options });
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: messages.order.sort }));
      expect(await screen.findByRole('menuitem', { name: 'Name' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Code' })).toBeInTheDocument();
      // Nothing is sorted yet, so there is no direction to change.
      expect(screen.getByRole('menuitem', { name: messages.order.ascString })).toHaveAttribute(
        'aria-disabled',
        'true',
      );

      await user.click(screen.getByRole('menuitem', { name: 'Code' }));

      // Choosing closes the popover, sorts descending, and names the choice on the button.
      await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Name' })).toBeNull());
      await waitFor(() => expect(sentOrder(load)).toEqual([{ column: 'code', direction: 'desc' }]));
      const button = screen.getByRole('button', { name: messages.order.sort });
      expect(button).toHaveTextContent('Code');

      await user.click(button);
      const ascending = await screen.findByRole('menuitem', { name: messages.order.ascString });
      expect(ascending).not.toHaveAttribute('aria-disabled', 'true');
      await user.click(ascending);

      await waitFor(() => expect(sentOrder(load)).toEqual([{ column: 'code', direction: 'asc' }]));
    });

    it('names the directions after the type of the sorted column', async () => {
      const { user } = await renderGrid({
        options: [{ id: 'name', label: 'Name', type: 'date' }],
        defaultOrder: { id: 'name', direction: 'asc' },
      });
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: messages.order.sort }));

      expect(
        await screen.findByRole('menuitem', { name: messages.order.ascDate }),
      ).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: messages.order.descDate })).toBeInTheDocument();
    });
  });
});
