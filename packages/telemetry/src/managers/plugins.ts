import type { TelemetryContext, TelemetryPlugin, TelemetryPluginOption } from '../utils/types';
import type { EventsManager } from './events';
import type { SessionManager } from './session';

export function createPluginsManager(
  context: TelemetryContext,
  sessionManager: SessionManager,
  eventsManager: EventsManager,
) {
  const plugins = new Map<string, TelemetryPlugin>();

  return {
    setup,
    plugin,
  };

  function setup() {
    for (const item of plugins.values()) {
      item.setup({
        logger: context.logger,
        config: context.config,
        addHook: context.hooks.addHook,
        logEvent: eventsManager.logEvent,
        getSession: sessionManager.getSession,
        refreshSession: sessionManager.refreshSession,
      });
    }
  }

  function plugin(...newPlugins: TelemetryPluginOption[]) {
    for (const newPlugin of normalizePlugins(newPlugins)) {
      plugins.set(newPlugin.name, newPlugin);
    }
  }

  function normalizePlugins(items: TelemetryPluginOption[]): TelemetryPlugin[] {
    return items.filter((item): item is TelemetryPlugin => !!item);
  }
}
