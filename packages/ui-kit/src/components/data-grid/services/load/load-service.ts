import { create } from 'zustand';
import type { DataGridItem, InternalContext } from '../../data-grid-types';
import { createLoadInstance } from './load-instance';
import type {
  LoadInstance,
  LoadInstanceId,
  LoadPublicApi,
  LoadService,
  LoadTriggerConfig,
  RefreshOptions,
  RefreshOptionsRaw,
  LoadStateStore,
} from './load-types';

export function createLoadService<TItem extends DataGridItem>(
  context: InternalContext<TItem>,
): LoadService<TItem> {
  const instances = new Map<LoadInstanceId, LoadInstance<TItem>>();
  // The subset of `instances` whose result replaces the visible record set. Tracked alongside
  // rather than derived on read, so a child fetch outliving the root load still flips the state
  // back: `instances` alone stays non-empty and would never notify.
  const recordInstanceIds = new Set<LoadInstanceId>();
  // The newest refresh, so a first load that a refresh superseded can wait for the load that
  // replaces it.
  let latestRefresh: Promise<void> | undefined;

  const useLoadStateStore = create<LoadStateStore>()(() => ({
    loadState: 'blank',
    recordsLoadState: 'blank',
  }));

  const publicApi: LoadPublicApi<TItem> = {
    triggerLoad,
    refresh,
    abort,
    getLoadInstances,
    useLoadStateStore,
  };

  context.plugins.registerPublicApi(publicApi);

  return {
    ...publicApi,
    init,
  };

  function syncLoadState() {
    useLoadStateStore.setState({
      loadState: instances.size > 0 ? 'loading' : 'blank',
      recordsLoadState: recordInstanceIds.size > 0 ? 'loading' : 'blank',
    });
  }

  /**
   * Whether this load ends up replacing what the grid is showing.
   *
   * `store: false` opts out of storage entirely -- a load that pages through the whole data set
   * runs that way -- and a load scoped to a tree parent appends a section beneath that row instead
   * of clearing the rest. Both leave the visible rows usable, so neither should raise the overlay.
   */
  function replacesRecords(triggerConfig?: LoadTriggerConfig): boolean {
    if (triggerConfig?.store === false) {
      return false;
    }

    return triggerConfig?.loadContext?.tree?.parentId == null;
  }

  function getLoadInstances(): LoadInstance<TItem>[] {
    return [...instances.values()];
  }

  function abort() {
    for (const instance of instances.values()) {
      instance.abort();
    }
  }

  /**
   * Waits for a load, and says whether this service aborted it itself (`true`) instead of it
   * finishing. An abort counts as settled, not failed.
   *
   * The service aborts what is in flight when a refresh starts its own load, and when the grid is
   * destroyed, so nobody is waiting for the aborted one's result any more. Its rejection (a `load`
   * that honours `signal` rejects with an AbortError) is the abort doing its job: reported from
   * `refresh()` it is an unhandled rejection at every call site that does not catch it (the plugins
   * do not), and reported from the first load it latches the grid into its error view, or logs a
   * failure for a grid that is simply gone.
   *
   * Only this service holds the controller, so `signal.aborted` means it aborted the load. An
   * AbortError a consumer's own `load` raises (its own timeout, say) does not set it and still
   * rejects, and so does any other failure.
   */
  async function settle(instance: LoadInstance<TItem>): Promise<boolean> {
    try {
      await instance.promise;
      return false;
    } catch (error) {
      if (instance.signal.aborted) return true;
      throw error;
    }
  }

  /**
   * The first load is done when the data the grid shows has arrived. A refresh that aborts it
   * carries that data from then on, so it is followed instead of settled: the first load is done
   * when that refresh's load is, through any refreshes that supersede it in turn. If that load
   * fails, so has the first one, since nothing ever loaded. If `destroy()` aborts it, nothing is
   * left to wait for, and the grid has not loaded: `destroy()` puts the core back to idle.
   */
  async function init() {
    await context.hooked.callHook('init');
    const refreshBefore = latestRefresh;
    if (!(await settle(triggerLoad()))) return;

    let followed = refreshBefore;
    while (latestRefresh !== followed) {
      followed = latestRefresh;
      await followed;
    }
  }

  function refresh(options: RefreshOptionsRaw = {}): Promise<void> {
    latestRefresh = runRefresh(options);
    return latestRefresh;
  }

  async function runRefresh(options: RefreshOptionsRaw) {
    abort();
    const refreshOptions: RefreshOptions = { resetFilters: options.resetFilters ?? true };
    await context.hooked.callHook('refresh', refreshOptions);
    await settle(triggerLoad({ refresh: refreshOptions }));
  }

  function triggerLoad(triggerConfig?: LoadTriggerConfig): LoadInstance<TItem> {
    const instance = createLoadInstance<TItem>(context, triggerConfig);

    instances.set(instance.id, instance);
    if (replacesRecords(triggerConfig)) {
      recordInstanceIds.add(instance.id);
    }
    syncLoadState();

    instance.promise
      .finally(() => {
        instances.delete(instance.id);
        recordInstanceIds.delete(instance.id);
        syncLoadState();
      })
      // Bookkeeping only. The rejection itself belongs to whoever awaited the instance's promise;
      // this branch re-raising it would land as an unhandled rejection with no one to catch it.
      .catch(() => undefined);

    return instance;
  }
}
