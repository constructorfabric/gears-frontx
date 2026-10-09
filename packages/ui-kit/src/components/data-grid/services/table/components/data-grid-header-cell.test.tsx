import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '../../../../../__test-utils__/render-with-user';
import { Checkbox } from '../../../../checkbox/public.js';
import { DataGrid } from '../../../data-grid';
import type { DataGridLoadResult } from '../../../data-grid-types';
import { DataGridOrderPlugin } from '../../../plugins/order/order-plugin';
import type { DataGridTableColumn } from '../table-types';

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

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

/**
 * A controllable `ResizeObserver` mock, scoped to the "min-content auto-sizing" describe block
 * below via `beforeEach`/`afterEach` -- the rest of this file's tests run under the no-op stub
 * above, which never fires. Tracks one entry per constructed observer (both `DataGridTableHeader`'s
 * shared sticky observer and `DataGridHeaderCell`'s per-column min-content observer end up here),
 * each remembering the elements it was asked to `observe`, so `fireResizeOn` can find and invoke
 * only the observer(s) actually watching a given element -- mirroring how the browser only notifies
 * observers that requested that element.
 */
let resizeObserverInstances: { callback: ResizeCallback; elements: Set<Element> }[];

function installControllableResizeObserver() {
  resizeObserverInstances = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private elements = new Set<Element>();

      constructor(private callback: ResizeCallback) {
        resizeObserverInstances.push({ callback: this.callback, elements: this.elements });
      }

      observe(el: Element) {
        this.elements.add(el);
      }

      unobserve(el: Element) {
        this.elements.delete(el);
      }

      disconnect() {
        this.elements.clear();
      }
    },
  );
}

function fireResizeOn(el: Element, width: number) {
  const entry = {
    target: el,
    contentRect: { width, height: 0, x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0 },
  } as unknown as ResizeObserverEntry;

  // The callback calls setMinContentWidth, which updates the Zustand store and re-renders
  // DataGridHeaderCell -- act() flushes that synchronously so the DOM reflects it immediately
  // after this call returns, matching a real ResizeObserver callback (which React also treats
  // as an external event needing a wrapped commit).
  act(() => {
    for (const instance of resizeObserverInstances) {
      if (instance.elements.has(el)) instance.callback([entry]);
    }
  });
}

interface TestItem {
  id: number;
  name: string;
  email: string;
}

const testData: TestItem[] = [{ id: 1, name: 'John Doe', email: 'john@example.com' }];

function loadData(): Promise<DataGridLoadResult<TestItem>> {
  return Promise.resolve({ results: testData, total: testData.length });
}

function CustomHeader({ column }: { column: DataGridTableColumn<TestItem> }) {
  const label = typeof column.label === 'function' ? column.label() : column.label;
  return <span>{label}</span>;
}

// Mirrors a "select-all" checkbox rendered via a column's `headerComponent` -- the shape the
// alignment bug was reported against.
function SelectAllHeader() {
  return <Checkbox aria-label="Select all" />;
}

function renderGridWithColumns(
  columns: DataGridTableColumn<TestItem>[],
  name: string,
  tableLayout?: 'fixed' | 'auto',
) {
  return render(
    <DataGrid name={name} load={loadData} columns={columns} tableLayout={tableLayout} />,
  );
}

// Registers a real 'header-cell-end' slot (the order plugin's sort icon) so header cells go
// through the genuine endSlot-present branch, not a stand-in.
function renderGridWithOrderPlugin(columns: DataGridTableColumn<TestItem>[], name: string) {
  return render(
    <DataGrid name={name} load={loadData} columns={columns}>
      <DataGridOrderPlugin defaultOrder={{ id: 'name', direction: 'asc' }} />
    </DataGrid>,
  );
}

function findHeader(scope: HTMLElement, label: string) {
  const cells = within(scope).getAllByRole('columnheader');
  return cells.find((cell) => cell.textContent?.includes(label));
}

describe('DataGridHeaderCell — overflow', () => {

  it('defaults data-overflow to "nowrap" when headerOverflow is omitted, truncating with a title fallback', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name', width: 100 },
      { id: 'email', label: 'Email Address', width: 80 },
    ];
    await renderGridWithColumns(columns, 'overflow_default_grid');

    const table = await screen.findByRole('table');
    const emailHeader = findHeader(table, 'Email Address');

    // nowrap is the default AND the only single-line/truncating mode -- it always clips with an
    // ellipsis and auto-sets title, there is no separate bare hard-clip default anymore.
    expect(emailHeader).toBeDefined();
    expect(emailHeader!.dataset.overflow).toBe('nowrap');
    expect(emailHeader!.title).toBe('Email Address');
  });

  it('marks the th with data-overflow="nowrap" when headerOverflow is explicitly "nowrap"', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name', width: 100 },
      { id: 'email', label: 'Email Address', width: 80, headerOverflow: 'nowrap' },
    ];
    await renderGridWithColumns(columns, 'overflow_nowrap_grid');

    const table = await screen.findByRole('table');
    const emailHeader = findHeader(table, 'Email Address');

    expect(emailHeader).toBeDefined();
    expect(emailHeader!.dataset.overflow).toBe('nowrap');
  });

  it('marks the th with data-overflow="wrap" when headerOverflow is "wrap"', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name', width: 100 },
      { id: 'email', label: 'Email Address', width: 80, headerOverflow: 'wrap' },
    ];
    await renderGridWithColumns(columns, 'overflow_wrap_grid');

    const table = await screen.findByRole('table');
    const emailHeader = findHeader(table, 'Email Address');

    expect(emailHeader!.dataset.overflow).toBe('wrap');
  });

  it('sets a title fallback from the label when headerOverflow is "nowrap", not for a "wrap" sibling', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name', width: 100, headerOverflow: 'wrap' },
      { id: 'email', label: 'Email Address', width: 80, headerOverflow: 'nowrap' },
    ];
    await renderGridWithColumns(columns, 'overflow_title_grid');

    const table = await screen.findByRole('table');
    const emailHeader = findHeader(table, 'Email Address');
    const nameHeader = findHeader(table, 'Name');

    expect(emailHeader!.title).toBe('Email Address');
    expect(nameHeader!.title).toBe('');
  });

  it('omits the title fallback when a custom headerComponent is set, even with headerOverflow nowrap', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      {
        id: 'email',
        label: 'Email Address',
        width: 80,
        headerOverflow: 'nowrap',
        headerComponent: CustomHeader,
      },
    ];
    await renderGridWithColumns(columns, 'overflow_custom_component_grid');

    const table = await screen.findByRole('table');
    const emailHeader = findHeader(table, 'Email Address');

    expect(emailHeader!.dataset.overflow).toBe('nowrap');
    expect(emailHeader!.title).toBe('');
  });

  it('wraps a plain string label in an element so the ellipsis rule can apply', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name', width: 100 },
      { id: 'email', label: 'Email Address', width: 80, headerOverflow: 'nowrap' },
    ];
    await renderGridWithColumns(columns, 'overflow_label_wrapper_grid');

    const table = await screen.findByRole('table');
    const emailHeader = findHeader(table, 'Email Address');

    const label = within(emailHeader!).getByText('Email Address');
    expect(label.tagName).toBe('SPAN');
  });

  it('applies headerOverflow alongside sticky, width, and a custom headerComponent', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      {
        id: 'email',
        label: 'Email Address',
        width: 80,
        sticky: true,
        headerOverflow: 'nowrap',
        headerComponent: CustomHeader,
      },
      { id: 'name', label: 'Name', width: 100 },
    ];
    await renderGridWithColumns(columns, 'overflow_combo_grid');

    const table = await screen.findByRole('table');
    const emailHeader = findHeader(table, 'Email Address');

    expect(emailHeader).toBeDefined();
    expect(emailHeader!.dataset.overflow).toBe('nowrap');
    expect(emailHeader!.style.position).toBe('sticky');
    expect(emailHeader!.style.width).toBe('80px');
    expect(within(emailHeader!).getByText('Email Address')).toBeInTheDocument();
  });

  describe('headerTruncate (deprecated alias)', () => {
    it('aliases headerTruncate: true to data-overflow="nowrap" and warns once', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      const columns: DataGridTableColumn<TestItem>[] = [
        { id: 'name', label: 'Name', width: 100, headerOverflow: 'wrap' },
        { id: 'email', label: 'Email Address', width: 80, headerTruncate: true },
      ];
      await renderGridWithColumns(columns, 'truncate_alias_grid');

      const table = await screen.findByRole('table');
      const emailHeader = findHeader(table, 'Email Address');

      expect(emailHeader!.dataset.overflow).toBe('nowrap');
      expect(emailHeader!.title).toBe('Email Address');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"email"'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('headerOverflow'));

      warnSpy.mockRestore();
    });

    it('does not alias headerTruncate: false', async () => {
      const columns: DataGridTableColumn<TestItem>[] = [
        { id: 'name', label: 'Name', width: 100 },
        { id: 'email', label: 'Email Address', width: 80, headerTruncate: false },
      ];
      await renderGridWithColumns(columns, 'truncate_false_grid');

      const table = await screen.findByRole('table');
      const emailHeader = findHeader(table, 'Email Address');

      expect(emailHeader!.dataset.overflow).toBe('nowrap');
    });

    it('lets an explicit headerOverflow win over a deprecated headerTruncate', async () => {
      const columns: DataGridTableColumn<TestItem>[] = [
        {
          id: 'email',
          label: 'Email Address',
          width: 80,
          headerTruncate: true,
          headerOverflow: 'wrap',
        },
      ];
      await renderGridWithColumns(columns, 'truncate_explicit_override_grid');

      const table = await screen.findByRole('table');
      const emailHeader = findHeader(table, 'Email Address');

      expect(emailHeader!.dataset.overflow).toBe('wrap');
    });
  });

  describe('tableLayout regression guard', () => {
    it('applies the fixed-mode header width mapping by default (no tableLayout prop)', async () => {
      const columns: DataGridTableColumn<TestItem>[] = [{ id: 'name', label: 'Name', width: 200 }];
      await renderGridWithColumns(columns, 'layout_default_grid');

      const table = await screen.findByRole('table');
      const nameHeader = findHeader(table, 'Name');

      expect(nameHeader!.style.width).toBe('200px');
      expect(nameHeader!.style.minInlineSize).toBe('200px');
    });
  });

  describe('auto-mode maxWidth cap', () => {
    it.each(['wrap', 'nowrap'] as const)(
      'marks the th data-capped and carries the cap var for headerOverflow="%s"',
      async (headerOverflow) => {
        const columns: DataGridTableColumn<TestItem>[] = [
          { id: 'email', label: 'Email Address', maxWidth: 160, headerOverflow },
        ];
        await renderGridWithColumns(columns, `header_cap_${headerOverflow}_auto_grid`, 'auto');

        const table = await screen.findByRole('table');
        const emailHeader = findHeader(table, 'Email Address');

        expect(emailHeader!.dataset.capped).toBe('true');
        expect(emailHeader!.style.getPropertyValue('--_data-grid-col-max')).toBe('160px');
      },
    );

    it('does not mark the th data-capped under tableLayout="fixed" even with maxWidth set', async () => {
      const columns: DataGridTableColumn<TestItem>[] = [
        { id: 'email', label: 'Email Address', maxWidth: 160 },
      ];
      await renderGridWithColumns(columns, 'header_cap_fixed_grid', 'fixed');

      const table = await screen.findByRole('table');
      const emailHeader = findHeader(table, 'Email Address');

      expect(emailHeader!.dataset.capped).toBeUndefined();
    });
  });
});

describe('DataGridHeaderCell — headerComponent fills the row', () => {

  // A header cell's `.contentRow` shrink-wraps to its own min-content size by default -- fine for
  // a default text label, but it left-shrink-wraps a custom `headerComponent` (e.g. a select-all
  // checkbox) instead of letting it fill/center the way a body cell does. `data-header-fill` on
  // the `<th>` is the signal DataGridCell's CSS reads to fill it instead -- driven by
  // `column.headerComponent` alone, deliberately NOT by whether the grid has a `header-cell-end`
  // slot registered (that array is table-wide, not per-column -- see DataGridHeaderCell's
  // `fillContent` comment), so it fires identically whether or not the order plugin (or any
  // other that adds a header-cell-end slot) happens to be registered on the grid.

  it('marks a custom headerComponent header with data-header-fill on a plugin-less grid', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'select', label: 'Select', width: 40, headerComponent: SelectAllHeader },
      { id: 'name', label: 'Name', width: 100 },
    ];
    await renderGridWithColumns(columns, 'header_fill_no_plugin_grid');

    const table = await screen.findByRole('table');
    const selectHeader = within(table).getAllByRole('columnheader')[0];
    const checkbox = within(selectHeader).getByRole('checkbox', { name: 'Select all' });

    expect(selectHeader.dataset.headerFill).toBe('true');
    // Structure otherwise unchanged: still a contentRow wrapping the content span (endSlot stays
    // empty -- no plugin registered), with the checkbox inside that content span.
    expect(checkbox.parentElement).toBe(selectHeader.firstElementChild!.children[0]);
  });

  it('marks a custom headerComponent header with data-header-fill even when the order plugin registers a table-wide header-cell-end slot', async () => {
    // This is the reported bug (a consumer's Users grid): DataGridOrderPlugin's slot is
    // table-wide and non-empty for every column once registered, even though its sort icon only
    // ever renders for the one actively-sorted column ('name' here, via defaultOrder) -- so an
    // endSlot-based signal would wrongly treat the unrelated 'select' column as "has a real end
    // slot" and keep it shrink-wrapped. `data-header-fill` must still fire for 'select' because
    // it's driven by `headerComponent`, not by the table-wide slot array.
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'select', label: 'Select', width: 40, headerComponent: SelectAllHeader },
      { id: 'name', label: 'Name', width: 100 },
    ];
    await renderGridWithOrderPlugin(columns, 'header_fill_with_order_plugin_grid');

    const table = await screen.findByRole('table');
    const selectHeader = within(table).getAllByRole('columnheader')[0];
    const checkbox = within(selectHeader).getByRole('checkbox', { name: 'Select all' });

    expect(selectHeader.dataset.headerFill).toBe('true');
    // Structure stays intact: contentRow + endSlot still render (the slot is registered
    // table-wide), with the checkbox inside the content span exactly as without the plugin.
    const contentRow = selectHeader.firstElementChild!;
    expect(contentRow.children).toHaveLength(2);
    expect(checkbox.parentElement).toBe(contentRow.children[0]);
  });

  it('does not mark a default-label header with data-header-fill on a plugin-less grid', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [{ id: 'name', label: 'Name', width: 100 }];
    await renderGridWithColumns(columns, 'header_fill_default_label_no_plugin_grid');

    const table = await screen.findByRole('table');
    const nameHeader = findHeader(table, 'Name')!;

    expect(nameHeader.dataset.headerFill).toBeUndefined();
  });

  it('does not mark a default-label header with data-header-fill when the order plugin is registered', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [{ id: 'name', label: 'Name', width: 100 }];
    await renderGridWithOrderPlugin(columns, 'header_fill_default_label_with_plugin_grid');

    const table = await screen.findByRole('table');
    const nameHeader = findHeader(table, 'Name')!;

    // 'name' is the actively-sorted column (defaultOrder) and gets a real, visible end slot (see
    // the test below), but it has no headerComponent, so it must not get the fill marker either.
    expect(nameHeader.dataset.headerFill).toBeUndefined();
  });

  it('does not mark a min-content column with data-header-fill even when it has a custom headerComponent', async () => {
    // A min-content column's `.contentRow` must keep shrink-wrapping -- it's the ResizeObserver
    // measurement target (see DataGridHeaderCell) -- so `fillContent` is excluded for it
    // regardless of `headerComponent`.
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'select', label: 'Select', width: 'min-content', headerComponent: SelectAllHeader },
    ];
    await renderGridWithColumns(columns, 'header_fill_min_content_grid');

    const table = await screen.findByRole('table');
    const selectHeader = within(table).getAllByRole('columnheader')[0];

    expect(selectHeader.dataset.headerFill).toBeUndefined();
  });

  it('still renders the contentRow wrapper and endSlot span when a real header-cell-end slot is registered', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name', width: 100 },
      { id: 'email', label: 'Email', width: 100 },
    ];
    await renderGridWithOrderPlugin(columns, 'real_end_slot_grid');

    const table = await screen.findByRole('table');
    const nameHeader = findHeader(table, 'Name')!;

    // contentRow wraps two children -- content span and endSlot span.
    const contentRow = nameHeader.firstElementChild!;
    expect(contentRow.children).toHaveLength(2);
    // The order plugin's sort icon is active for this column (defaultOrder targets 'name'), so
    // the endSlot span (the wrapper's second child) actually renders a visible control, not just
    // an empty wrapper.
    const endSlot = contentRow.children[1];
    expect(within(endSlot as HTMLElement).getByRole('button')).toBeInTheDocument();
  });
});

describe('DataGridHeaderCell — min-content sizing measurement', () => {

  beforeEach(() => {
    installControllableResizeObserver();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Restore the file-level no-op stub other describe blocks in this file rely on.
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
  });

  function getContentRow(header: HTMLElement): HTMLElement {
    return header.firstElementChild as HTMLElement;
  }

  it('applies the measured content width as the column\'s width under tableLayout="auto"', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name' },
      { id: 'status', label: 'Status', width: 'min-content' },
    ];
    await renderGridWithColumns(columns, 'min_content_measure_grid', 'auto');

    const table = await screen.findByRole('table');
    const statusHeader = findHeader(table, 'Status')!;

    fireResizeOn(getContentRow(statusHeader), 40);

    expect(statusHeader.style.width).toBe('40px');
    expect(statusHeader.style.minInlineSize).toBe('40px');
  });

  it('re-measures and applies an updated width when the content size changes', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name' },
      { id: 'status', label: 'Status', width: 'min-content' },
    ];
    await renderGridWithColumns(columns, 'min_content_remeasure_grid', 'auto');

    const table = await screen.findByRole('table');
    const statusHeader = findHeader(table, 'Status')!;
    const contentRow = getContentRow(statusHeader);

    fireResizeOn(contentRow, 40);
    expect(statusHeader.style.width).toBe('40px');

    fireResizeOn(contentRow, 65);
    expect(statusHeader.style.width).toBe('65px');
  });

  it('applies the measured content width as the column\'s fixed track under tableLayout="fixed"', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name' },
      { id: 'status', label: 'Status', width: 'min-content' },
    ];
    await renderGridWithColumns(columns, 'min_content_measure_fixed_grid', 'fixed');

    const table = await screen.findByRole('table');
    const statusHeader = findHeader(table, 'Status')!;

    fireResizeOn(getContentRow(statusHeader), 40);

    expect(statusHeader.style.width).toBe('40px');
    expect(statusHeader.style.minInlineSize).toBe('40px');
  });

  it('disables data-overflow for a min-content column under auto (keeps the measurement target unconstrained)', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'status', label: 'Status', width: 'min-content' },
    ];
    await renderGridWithColumns(columns, 'min_content_overflow_disabled_grid', 'auto');

    const table = await screen.findByRole('table');
    const statusHeader = findHeader(table, 'Status')!;

    expect(statusHeader.dataset.overflow).toBeUndefined();
  });

  it('still sets a title fallback from the label despite disabling data-overflow for measurement', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'status', label: 'Status', width: 'min-content' },
    ];
    await renderGridWithColumns(columns, 'min_content_title_grid', 'auto');

    const table = await screen.findByRole('table');
    const statusHeader = findHeader(table, 'Status')!;

    expect(statusHeader.title).toBe('Status');
  });

  it('does not measure a sibling column that is not width: "min-content"', async () => {
    const columns: DataGridTableColumn<TestItem>[] = [
      { id: 'name', label: 'Name', width: 100 },
      { id: 'status', label: 'Status', width: 'min-content' },
    ];
    await renderGridWithColumns(columns, 'min_content_sibling_untouched_grid', 'auto');

    const table = await screen.findByRole('table');
    const nameHeader = findHeader(table, 'Name')!;

    // A fixed numeric width is unaffected by any of this -- resolveColumnStyle applies it
    // directly, and DataGridHeaderCell never attaches an observer for it.
    fireResizeOn(getContentRow(nameHeader), 999);
    expect(nameHeader.style.width).toBe('100px');
  });
});
