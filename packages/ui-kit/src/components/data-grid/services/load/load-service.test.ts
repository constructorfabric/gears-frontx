import { describe, expect, it, vi } from 'vitest';
import { createDataGrid } from '../../create-data-grid';
import { createSignalAwareLoad } from '../../../../__test-utils__/signal-aware-load';
import type { DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';
import { internalContextKey } from '../internal/internal-helpers';

interface TestItem {
  id: number;
  name: string;
}

function createTestGrid(
  name: string,
  load: (context: DataGridLoadContext) => Promise<DataGridLoadResult<TestItem>>,
) {
  const grid = createDataGrid<TestItem>({ name, load: { current: load } });
  return { grid, service: grid[internalContextKey].load };
}

describe('loadService -- a load the service aborted itself', () => {
  it('lets the superseded refresh() resolve, and the newer one deliver', async () => {
    const { load, pending } = createSignalAwareLoad([{ id: 1, name: 'A' }]);
    const { service } = createTestGrid('load_service_superseded_refresh', load);

    const first = service.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const second = service.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(2));

    expect(pending[0].signal?.aborted).toBe(true);
    pending[1].succeed();

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
  });

  // The first load is not done until the load that replaced it is.
  it('keeps init() pending until the refresh that superseded the first load lands', async () => {
    const { load, pending } = createSignalAwareLoad([{ id: 1, name: 'A' }]);
    const { service } = createTestGrid('load_service_superseded_init', load);

    let initSettled = false;
    const init = service.init().finally(() => {
      initSettled = true;
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const refresh = service.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(initSettled).toBe(false);

    pending[1].succeed();

    await expect(init).resolves.toBeUndefined();
    await expect(refresh).resolves.toBeUndefined();
  });

  // Unmounting aborts the load in flight. A refresh a plugin started (search, sort) is in flight
  // then, and nobody is left to catch its rejection.
  it('lets a refresh() settle when destroy() aborts its load', async () => {
    const { load, pending } = createSignalAwareLoad([{ id: 1, name: 'A' }]);
    const { grid, service } = createTestGrid('load_service_destroyed_refresh', load);

    const refresh = service.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    grid.destroy();

    expect(pending[0].signal?.aborted).toBe(true);
    await expect(refresh).resolves.toBeUndefined();
  });

  it('lets init() settle when destroy() aborts the first load', async () => {
    const { load, pending } = createSignalAwareLoad([{ id: 1, name: 'A' }]);
    const { grid, service } = createTestGrid('load_service_destroyed_init', load);

    const init = service.init();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    grid.destroy();

    await expect(init).resolves.toBeUndefined();
  });

  // Only the service holds the controller, so a signal that was never aborted means the failure
  // is the consumer's: a load that failed on its own, or one that raised an AbortError of its own
  // (its own timeout, say), is a failure somebody has to hear about.
  it('still rejects refresh() when the load failed on its own', async () => {
    const { load, pending } = createSignalAwareLoad([{ id: 1, name: 'A' }]);
    const { service } = createTestGrid('load_service_failed_refresh', load);

    const refresh = service.refresh();
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0].fail(new Error('backend down'));

    await expect(refresh).rejects.toThrow('backend down');
  });

  it.each(['init', 'refresh'] as const)(
    'still rejects %s() when the load raised an AbortError of its own',
    async (entry) => {
      const { load, pending } = createSignalAwareLoad([{ id: 1, name: 'A' }]);
      const { service } = createTestGrid(`load_service_own_abort_${entry}`, load);

      const settled = service[entry]();
      await vi.waitFor(() => expect(pending).toHaveLength(1));
      expect(pending[0].signal?.aborted).toBe(false);
      pending[0].fail(new DOMException('Timed out.', 'AbortError'));

      await expect(settled).rejects.toMatchObject({ name: 'AbortError' });
    },
  );
});
