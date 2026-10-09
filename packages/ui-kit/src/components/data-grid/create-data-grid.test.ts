import { describe, expect, it, vi } from 'vitest';
import { createSignalAwareLoad } from '../../__test-utils__/signal-aware-load';
import { createDataGrid } from './create-data-grid';
import { internalContextKey } from './services/internal/internal-helpers';

interface TestItem {
  id: number;
  name: string;
}

function createTestGrid(name: string) {
  const { load, pending } = createSignalAwareLoad<TestItem>([{ id: 1, name: 'A' }]);
  const grid = createDataGrid<TestItem>({ name, load: { current: load } });
  const loadState = () => grid[internalContextKey].core.useLoadStateStore.getState().loadState;

  return { grid, pending, loadState };
}

describe('createDataGrid -- init and destroy', () => {
  // `destroy()` is the grid going away (an unmount, an `Activity` hiding it). A first load it cut
  // off never delivered, so the core goes back to idle and the next `init()` runs it again: left at
  // 'loaded' the grid would show an empty result for good, and at 'error' it would log a failure
  // nobody caused.
  it('runs the first load again when init() follows a destroy() that cut it off', async () => {
    const { grid, pending, loadState } = createTestGrid('create_destroy_cut_off');

    const first = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    grid.destroy();

    await expect(first).resolves.toBeUndefined();
    expect(pending[0].signal?.aborted).toBe(true);
    expect(loadState()).toBe('blank');

    const second = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(loadState()).toBe('loading');
    pending[1].succeed();
    await second;

    expect(loadState()).toBe('loaded');
  });

  it('leaves a first load that had finished before destroy() as it was', async () => {
    const { grid, pending, loadState } = createTestGrid('create_destroy_after_load');

    const first = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0].succeed();
    await first;

    grid.destroy();
    await grid.init();

    expect(pending).toHaveLength(1);
    expect(loadState()).toBe('loaded');
  });

  // A refresh that supersedes the first load is what carries the data from then on, so the first
  // load is not done until that one lands. Marked loaded in between, the core would say so about a
  // grid with no records.
  it('keeps the core loading until the refresh that superseded the first load lands', async () => {
    const { grid, pending, loadState } = createTestGrid('create_superseded_first_load');

    const init = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const refresh = grid.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loadState()).toBe('loading');

    pending[1].succeed();
    await Promise.all([init, refresh]);

    expect(loadState()).toBe('loaded');
  });

  it('follows a chain of refreshes, and is loaded when the last one lands', async () => {
    const { grid, pending, loadState } = createTestGrid('create_superseded_chain');

    const init = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const first = grid.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const second = grid.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loadState()).toBe('loading');

    pending[2].succeed();
    await Promise.all([init, first, second]);

    expect(loadState()).toBe('loaded');
  });

  // Nothing ever loaded, so the failure of the load that stood in for the first one is the first
  // load's failure.
  it('goes to error, and rejects init(), when the refresh that superseded the first load fails', async () => {
    const { grid, pending, loadState } = createTestGrid('create_superseded_fails');

    const init = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    void grid.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1].fail(new Error('backend down'));

    await expect(init).rejects.toThrow('backend down');
    expect(loadState()).toBe('error');
  });

  it('runs the first load again when destroy() cuts off the refresh that superseded it', async () => {
    const { grid, pending, loadState } = createTestGrid('create_superseded_destroyed');

    const init = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const refresh = grid.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    grid.destroy();

    await Promise.all([init, refresh]);
    expect(loadState()).toBe('blank');

    const again = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    pending[2].succeed();
    await again;
    expect(loadState()).toBe('loaded');
  });

  // Only the first load is the grid's to ask for again. A refresh that destroy() cuts off leaves the
  // rows the grid already has, and the core stays loaded.
  it('keeps a loaded grid loaded when destroy() cuts off a refresh', async () => {
    const { grid, pending, loadState } = createTestGrid('create_destroy_refresh');
    const first = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0].succeed();
    await first;

    const refresh = grid.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    grid.destroy();
    await refresh;
    await grid.init();

    expect(pending).toHaveLength(2);
    expect(loadState()).toBe('loaded');
  });

  // React in development mounts, unmounts and mounts again: the cleanup runs before the first load
  // has started, so there is nothing to cut off, and the second init() must not start another.
  it('asks for the first load once when destroy() comes before it has started', async () => {
    const { grid, pending, loadState } = createTestGrid('create_destroy_before_start');

    const first = grid.init();
    grid.destroy();
    const second = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0].succeed();
    await Promise.all([first, second]);

    expect(pending).toHaveLength(1);
    expect(pending[0].signal?.aborted).toBe(false);
    expect(loadState()).toBe('loaded');
  });

  it('goes to error, and rejects, when the first load fails on its own', async () => {
    const { grid, pending, loadState } = createTestGrid('create_first_load_fails');

    const first = grid.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0].fail(new Error('backend down'));

    await expect(first).rejects.toThrow('backend down');
    expect(loadState()).toBe('error');
  });
});
