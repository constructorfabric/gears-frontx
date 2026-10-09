import { useState } from 'react';
import { messages } from '../../../messages';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '../../../../../__test-utils__/render-with-user';
import { DataGrid } from '../../../data-grid';
import type { DataGridLoadResult } from '../../../data-grid-types';
import { DataGridPaginationPlugin } from '../../../plugins/pagination/pagination-plugin';
import { DataGridTextSearchPlugin } from '../../../plugins/text-search/text-search-plugin';
import { useDataGrid } from '../../core/data-grid-context';
import { createDataGridPlugin } from '../../plugins/plugins-helpers';
import type { DataGridTableColumn } from '../../table/table-types';

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

const BulkActionBarPlugin = createDataGridPlugin('bulkActionBar', (context) => {
  context.registerSlot('top', {
    id: 'bulk_action_bar',
    active: true,
    component: () => (
      <button type="button" onClick={() => undefined}>
        Copy to term
      </button>
    ),
  });
  return {};
});

const twoRows: TestItem[] = [
  { id: 1, name: 'Item A' },
  { id: 2, name: 'Item B' },
];

/**
 * Hands back a `load` whose every call parks on a promise the test resolves by hand, so a load can
 * be held in flight while assertions run.
 */
function createDeferredLoad() {
  let resolveCurrent: ((result: DataGridLoadResult<TestItem>) => void) | undefined;

  function load(): Promise<DataGridLoadResult<TestItem>> {
    return new Promise<DataGridLoadResult<TestItem>>((resolve) => {
      resolveCurrent = resolve;
    });
  }

  function tick() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  /**
   * Resolves once the load is actually parked in flight. Assertions about what a load does *not*
   * do would otherwise pass vacuously by running before it ever started.
   */
  async function started() {
    // The grid triggers the load from an effect and only after its own hook chain, so the resolver
    // does not exist yet on the first tick.
    for (let i = 0; i < 50 && !resolveCurrent; i += 1) {
      await tick();
    }
    if (!resolveCurrent) {
      throw new Error('load was never called');
    }
  }

  async function settle(results: TestItem[]) {
    await started();

    const resolve = resolveCurrent!;
    // Cleared so the next settle() waits for the next load instead of re-resolving this one.
    resolveCurrent = undefined;
    resolve({ results, total: results.length });

    // Lets the load pipeline's own awaits run before the caller asserts.
    await tick();
  }

  return { load, settle, started };
}

function RefreshProbe() {
  const grid = useDataGrid();

  return (
    <button type="button" onClick={() => void grid.refresh()}>
      refresh
    </button>
  );
}

/** The two load shapes that add to the grid instead of replacing what is on screen. */
function AdditiveLoadProbe() {
  const grid = useDataGrid();

  return (
    <>
      <button
        type="button"
        onClick={() => void grid.triggerLoad({ loadContext: { tree: { parentId: 1 } } }).promise}
      >
        load children
      </button>
      <button type="button" onClick={() => void grid.triggerLoad({ store: false }).promise}>
        export page
      </button>
    </>
  );
}

/** Stands in for the copy modal: starts the work, then goes away while it is still running. */
function StartWorkModal({ onStart, onClose }: { onStart: () => void; onClose: () => void }) {
  return (
    <>
      <button type="button" onClick={onStart}>
        start copy
      </button>
      <button type="button" onClick={onClose}>
        close modal
      </button>
    </>
  );
}

/**
 * The size step the kit's spinner carries, e.g. `lg`. Two spinners with the same step are the same
 * size, which is all the size comparison below needs, and all jsdom can offer given it applies no
 * stylesheet.
 */
function sizeOf(loader: HTMLElement | SVGElement): string | null {
  return loader.getAttribute('data-size');
}

/**
 * Asserts the loader is mounted in the overlay rather than inside a layout slot. The slots render
 * straight into the busy region too, so "a direct child of the busy region" does not tell the
 * overlay from a slot, and a loader anchored in a slot would scroll out of view. The overlay is
 * therefore found by what it is: CSS Modules hash class names but keep the local name, and the
 * overlay is the one ancestor of the loader that carries `loaderOverlay`. It must be a direct child
 * of the busy region (a sibling of the slots), and it must hold the loader, which sits inside the
 * wrapper that fades it in.
 */
function expectOverlaid(loader: HTMLElement | SVGElement, busyArea: HTMLElement) {
  const overlay = loader.closest<HTMLElement>('[class*="loaderOverlay"]');
  expect(overlay).not.toBeNull();
  expect(overlay).not.toBe(busyArea);
  expect(overlay!.parentElement).toBe(busyArea);
  expect(overlay).toContainElement(loader);
}

describe('DataGridLayoutContent', () => {

  it('overlays a loader on the existing rows during a refetch', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_refetch" load={load} columns={testColumns}>
        <RefreshProbe />
      </DataGrid>,
    );

    await settle(twoRows);
    const table = await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    const loader = await screen.findByRole('status');
    // The point of the overlay: the previous rows are still on screen underneath it.
    expect(table).toBeInTheDocument();
    expect(screen.getByText('Item A')).toBeInTheDocument();

    const busyArea = table.closest('[aria-busy="true"]');
    expect(busyArea).not.toBeNull();
    expectOverlaid(loader, busyArea as HTMLElement);
  });

  it('overlays the loader on an empty grid as well', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_empty_grid" load={load} columns={testColumns}>
        <RefreshProbe />
      </DataGrid>,
    );

    await settle([]);
    await screen.findByText(messages.emptyState.noResultsFound);

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    // One treatment for every load: an empty grid gets the same dimmed, click-blocking overlay as
    // one with rows, rather than a second in-flow position.
    const loader = await screen.findByRole('status');
    const busyArea = loader.closest('[aria-busy="true"]');
    expect(busyArea).not.toBeNull();
    expectOverlaid(loader, busyArea as HTMLElement);
  });

  it('covers the whole grid, toolbar and pagination included', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_covers_grid" load={load} columns={testColumns}>
        <RefreshProbe />
        <DataGridTextSearchPlugin />
        <DataGridPaginationPlugin />
      </DataGrid>,
    );

    await settle(twoRows);
    const table = await screen.findByRole('table');
    const search = screen.getByPlaceholderText(messages.textSearch.placeholder);
    const pagination = screen.getByRole('navigation', { name: messages.pagination.ariaLabel });

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    const loader = await screen.findByRole('status');
    // The overlay's own box is `inset: 0` of this region, so everything the region contains sits
    // under the scrim: the toolbar above the rows and the pagination below them, not just the rows.
    const busyArea = loader.closest('[aria-busy="true"]');
    expect(busyArea).toContainElement(search);
    expect(busyArea).toContainElement(table);
    expect(busyArea).toContainElement(pagination);
  });

  it('covers an action bar registered into the top slot', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_covers_selection" load={load} columns={testColumns}>
        <RefreshProbe />
        <BulkActionBarPlugin />
      </DataGrid>,
    );

    await settle(twoRows);
    // A plugin can swap the top slot for an action bar of its own, which is where a consumer's
    // bulk action would live. A stand-in plugin registers the same kind of control into the same
    // slot.
    const bulkAction = await screen.findByRole('button', { name: 'Copy to term' });

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    // The action bar is a layout slot, so it sits under the scrim like the rows do — which is what
    // makes an action whose result is about to be replaced unreachable during a load.
    const loader = await screen.findByRole('status');
    expect(loader.closest('[aria-busy="true"]')).toContainElement(bulkAction);
  });

  it('leaves the pagination indicator to the overlay', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_single_indicator" load={load} columns={testColumns}>
        <RefreshProbe />
        <DataGridPaginationPlugin />
      </DataGrid>,
    );

    await settle(twoRows);
    await screen.findByRole('navigation', { name: messages.pagination.ariaLabel });

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    await screen.findByRole('status');
    // A refetch raises one indicator, not two: the pagination's own "Loading" tag is redundant
    // beside the overlay.
    expect(screen.queryByText('Loading')).not.toBeInTheDocument();
  });

  it('marks the grid content busy while a load is in flight and clears it afterwards', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_busy" load={load} columns={testColumns}>
        <RefreshProbe />
      </DataGrid>,
    );

    await settle(twoRows);
    const table = await screen.findByRole('table');
    expect(table.closest('[aria-busy]')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    // `refresh()` awaits its hook chain before flipping the load state, so the attribute lands a
    // few microtasks after the click resolves — wait for the loader rather than reading it inline.
    await screen.findByRole('status');
    const busyArea = table.closest('[aria-busy="true"]');
    expect(busyArea).not.toBeNull();
    expect(busyArea).toContainElement(table);

    await settle(twoRows);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    // Absent rather than aria-busy="false".
    expect(screen.getByRole('table').closest('[aria-busy]')).toBeNull();
  });

  it('keeps the empty state on screen while a load is in flight', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_empty_kept" load={load} columns={testColumns}>
        <RefreshProbe />
      </DataGrid>,
    );

    await settle([]);
    const emptyState = await screen.findByText(messages.emptyState.noResultsFound);

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    // The empty state is what gives an unfiltered empty grid its height, and the main slot is not
    // rendered in that case. Unmounting it during the load left the region with no children at
    // all, so the grid collapsed to the toolbar's height and sprang back when the load settled.
    // It stays put and is dimmed by the scrim like rows would be.
    await screen.findByRole('status');
    expect(emptyState).toBeInTheDocument();
  });

  it('restores the empty state once an empty load settles', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_empty_restored" load={load} columns={testColumns}>
        <RefreshProbe />
      </DataGrid>,
    );

    await settle([]);
    await screen.findByText(messages.emptyState.noResultsFound);

    await user.click(screen.getByRole('button', { name: 'refresh' }));
    await settle([]);

    expect(await screen.findByText(messages.emptyState.noResultsFound)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('raises the loader from the loading prop with no load in flight', async () => {
    const { load, settle } = createDeferredLoad();

    function ExternalLoadingHost() {
      const [loading, setLoading] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setLoading(true)}>
            start
          </button>
          <DataGrid
            name="overlay_external"
            load={load}
            columns={testColumns}
            loading={loading}
          />
        </>
      );
    }

    const { user } = render(<ExternalLoadingHost />);

    await settle(twoRows);
    const table = await screen.findByRole('table');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'start' }));

    // The grid never reloaded, so only the prop can be raising this.
    const loader = await screen.findByRole('status');
    const busyArea = table.closest('[aria-busy="true"]');
    expect(busyArea).not.toBeNull();
    expect(screen.getByText('Item A')).toBeInTheDocument();
    // Same overlay as a refetch.
    expectOverlaid(loader, busyArea as HTMLElement);
  });

  it('clears the loader when the loading prop goes back to false', async () => {
    const { load, settle } = createDeferredLoad();

    function ExternalLoadingHost() {
      const [loading, setLoading] = useState(true);

      return (
        <>
          <button type="button" onClick={() => setLoading(false)}>
            stop
          </button>
          <DataGrid
            name="overlay_external_clear"
            load={load}
            columns={testColumns}
            loading={loading}
          />
        </>
      );
    }

    const { user } = render(<ExternalLoadingHost />);

    await settle(twoRows);
    await screen.findByRole('table');
    expect(await screen.findByRole('status')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'stop' }));

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('table').closest('[aria-busy]')).toBeNull();
  });

  it('keeps the empty state on screen while the loading prop is set', async () => {
    const { load, settle } = createDeferredLoad();
    render(
      <DataGrid name="overlay_external_empty" load={load} columns={testColumns} loading />,
    );

    await settle([]);
    await screen.findByRole('status');

    // The grid is not reloading at all here, so there is even less reason to take the illustration
    // away: the prop only raises the scrim over whatever the grid is already showing.
    expect(screen.getByText(messages.emptyState.noResultsFound)).toBeInTheDocument();
  });

  it('renders no loader when no load is in flight', async () => {
    const { load, settle } = createDeferredLoad();
    render(<DataGrid name="overlay_idle" load={load} columns={testColumns} />);

    await settle(twoRows);
    await screen.findByRole('table');

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('uses one loader size for the first load and for a refetch', async () => {
    const { load, settle } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_one_size" load={load} columns={testColumns}>
        <RefreshProbe />
      </DataGrid>,
    );

    // jsdom applies no stylesheet, so the resolved pixel size is unreachable — but the size step
    // is on the element, and it is the step that decides the size. A spinner that grows between
    // the first load and a refetch reads as two different components.
    const initialSize = sizeOf(await screen.findByRole('status'));
    expect(initialSize).not.toBeNull();

    await settle(twoRows);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    expect(sizeOf(await screen.findByRole('status'))).toBe(initialSize);
  });

  it('leaves the first load to the in-place loader', async () => {
    const { load, settle } = createDeferredLoad();
    render(
      <DataGrid name="overlay_first_load" load={load} columns={testColumns} loading />,
    );

    // The initial loader replaces the grid, so there is no content to cover and no overlay to
    // stack on top of it — exactly one loader, even with the `loading` prop also set, and the
    // table is not mounted yet.
    const loader = await screen.findByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(loader.closest('[aria-busy="true"]')).not.toBeNull();

    await settle(twoRows);
    await screen.findByRole('table');
  });

  it('leaves the grid alone for a load scoped to a tree parent', async () => {
    const { load, settle, started } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_tree_child" load={load} columns={testColumns}>
        <AdditiveLoadProbe />
      </DataGrid>,
    );

    await settle(twoRows);
    const table = await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'load children' }));
    await started();

    // A child fetch appends a section under one row and leaves every other row usable, so dimming
    // and blocking the whole grid for it would turn expanding a deep tree into a run of full-grid
    // lockouts. Asserted with the load held in flight, which `started()` guarantees.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(table.closest('[aria-busy="true"]')).toBeNull();
  });

  it('leaves the grid alone for a load that never reaches storage', async () => {
    const { load, settle, started } = createDeferredLoad();
    const { user } = render(
      <DataGrid name="overlay_store_false" load={load} columns={testColumns}>
        <AdditiveLoadProbe />
      </DataGrid>,
    );

    await settle(twoRows);
    const table = await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'export page' }));
    await started();

    // `store: false` is how a load pages through the whole data set. Nothing on screen changes, so
    // the rows stay live while it runs.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(table.closest('[aria-busy="true"]')).toBeNull();
  });

  it('keeps the overlay up after the component that started the work unmounts', async () => {
    const { load, settle } = createDeferredLoad();

    function CopyHost() {
      const [isCopying, setIsCopying] = useState(false);
      const [modalOpen, setModalOpen] = useState(true);

      return (
        <>
          {modalOpen && (
            <StartWorkModal
              onStart={() => setIsCopying(true)}
              onClose={() => setModalOpen(false)}
            />
          )}
          <DataGrid
            name="overlay_outlives_starter"
            load={load}
            columns={testColumns}
            loading={isCopying}
          />
        </>
      );
    }

    const { user } = render(<CopyHost />);

    await settle(twoRows);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'start copy' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'close modal' }));

    // The reason the flag is a prop on the host rather than something the starter owns: the user
    // can close the copy modal mid-copy, and the grid behind it has to hold its loader until the
    // copy finishes. Unmounting the starter must not take the overlay with it.
    expect(screen.queryByRole('button', { name: 'start copy' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not announce a busy grid on the error view, and reports the failure', async () => {
    const load = vi.fn().mockRejectedValue(new Error('load failed'));
    // Also keeps the expected failure out of the run's output.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      render(
        <DataGrid name="overlay_error_state" load={load} columns={testColumns} loading />,
      );

      // The first load's failure swaps the whole region for the error view, so there is nothing to
      // dim and no loader on screen -- `aria-busy` has to say the same thing, even with the
      // `loading` prop set, rather than announcing a busy grid over a dead one.
      expect(await screen.findByText(messages.loadError.headerDefault)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(document.querySelector('[aria-busy="true"]')).toBeNull();

      // The rejection is caught so it does not surface as an unhandled rejection, but nothing
      // subscribes to the `load:error` hook, so this log is the only trace a failed load leaves for
      // whoever has to debug it.
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          '[DataGrid] Initial load failed:',
          expect.objectContaining({ message: 'load failed' }),
        );
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});
