import type { DataGridItem, InternalContext } from '../../data-grid-types';
import type {
  DataGridPlugin,
  DataGridPluginContext,
  PluginsPublicApi,
  PluginsService,
  ServicesPublicApiTypes,
} from './plugins-types';

export function createPluginsService<TItem extends DataGridItem>(
  context: InternalContext<TItem>,
): PluginsService<TItem> {
  const pluginApis = new Map<string, unknown>();
  const pluginPublicApi: PluginsPublicApi<TItem> = {
    hook: context.hooked.hook,
    getPlugin,
  };

  // Starts with the plugins' own API and grows as every other service registers its public API
  // through `registerPublicApi` while the grid is being created. Plugins only see it afterwards,
  // when it is complete, which a type cannot express for an object filled in over time.
  const pluginContext = { ...pluginPublicApi } as DataGridPluginContext<TItem>;

  return {
    ...pluginPublicApi,
    registerPlugin,
    registerPlugins,
    registerPublicApi,
    pluginContext,
  };

  function registerPublicApi(methods: ServicesPublicApiTypes<TItem>) {
    Object.assign(pluginContext, methods);
  }

  function registerPlugin(plugin: DataGridPlugin<TItem>) {
    if (pluginApis.has(plugin.name)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[DataGrid] Plugin "${plugin.name}" is already registered. Skipping duplicate.`,
        );
      }
      return;
    }

    const api = plugin.setup(pluginContext);
    if (api !== undefined) {
      pluginApis.set(plugin.name, api);
    }
  }

  function registerPlugins(plugins: DataGridPlugin<TItem>[]) {
    plugins.forEach((plugin) => registerPlugin(plugin));
  }

  function getPlugin<TApi>(name: string): TApi | undefined {
    return pluginApis.get(name) as TApi | undefined;
  }
}
