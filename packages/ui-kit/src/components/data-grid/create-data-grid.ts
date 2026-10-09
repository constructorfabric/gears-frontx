import type {
  DataGridInstance,
  DataGridConfig,
  DataGridItem,
  InternalContext,
} from './data-grid-types';
import { createCoreService } from './services/core/core-service';
import { createHookedService } from './services/hooked/hooked';
import { internalContextKey } from './services/internal/internal-helpers';
import { createLayoutService } from './services/layout/layout-service';
import { createLoadService } from './services/load/load-service';
import { createPersistentStateService } from './services/persistent-state/persistent-state-service';
import { createPluginsService } from './services/plugins/plugins-service';
import type { DataGridPlugin } from './services/plugins/plugins-types';
import { createStorageService } from './services/storage/storage-service';
import { createTableService } from './services/table/table-service';

export function createDataGrid<
  TItem extends DataGridItem,
  TPlugins extends DataGridPlugin<TItem>[] = DataGridPlugin<TItem>[],
>(config: DataGridConfig<TItem>): DataGridInstance<TItem, TPlugins> {
  const hooked = createHookedService<TItem>();

  // The services are created one after another, and a few read the context while they are being
  // created (the table service registers its layout slot, the load service registers its public
  // API). So the context exposes each service through a getter that fails loudly if it is read
  // before that service exists, instead of handing out a placeholder object.
  const services: Partial<Omit<InternalContext<TItem>, 'hooked' | 'config'>> = {};

  const context: InternalContext<TItem> = {
    hooked,
    config,
    get plugins() {
      return created(services.plugins, 'plugins');
    },
    get core() {
      return created(services.core, 'core');
    },
    get load() {
      return created(services.load, 'load');
    },
    get storage() {
      return created(services.storage, 'storage');
    },
    get persistentState() {
      return created(services.persistentState, 'persistentState');
    },
    get layout() {
      return created(services.layout, 'layout');
    },
    get table() {
      return created(services.table, 'table');
    },
  };

  services.plugins = createPluginsService<TItem>(context);
  services.core = createCoreService();
  services.load = createLoadService<TItem>(context);
  services.storage = createStorageService<TItem>(context);
  services.persistentState = createPersistentStateService<TItem>(context);
  services.layout = createLayoutService<TItem>(context);
  services.table = createTableService<TItem>(context);

  return {
    init,
    destroy,
    ...context.plugins.pluginContext,
    [internalContextKey]: context,
  } as DataGridInstance<TItem, TPlugins>;

  function destroy() {
    hooked.callHookSync('destroy');

    // A first load that is under way, and so about to be aborted, never delivers: the grid is back
    // to idle, so the next `init()` (an `Activity` showing it again) runs the load once more.
    // Without an instance the first load has not started yet -- React's development remount runs
    // this cleanup between two `init()` calls, and the second must not start another -- so there
    // is nothing to cut off.
    const firstLoadCutOff =
      context.core.useLoadStateStore.getState().loadState === 'loading' &&
      context.load.getLoadInstances().length > 0;

    context.load.abort();
    if (firstLoadCutOff) {
      context.core.resetLoadState();
    }
  }

  async function init() {
    const { loadState } = context.core.useLoadStateStore.getState();
    if (loadState === 'loaded' || loadState === 'loading') {
      return;
    }

    await context.core.loadPromise(context.load.init());
  }
}

function created<T>(service: T | undefined, name: string): T {
  if (service === undefined) {
    throw new Error(`[DataGrid] The ${name} service was used before it was created.`);
  }
  return service;
}
