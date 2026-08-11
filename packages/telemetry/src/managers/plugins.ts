import type { TelemetryContext, TelemetryPlugin, TelemetryPluginOption } from '../utils/types';
import type { EventsManager } from './events';
import type { SessionManager } from './session';

// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-plugin-registry:p1
export function createPluginsManager(
  context: TelemetryContext,
  sessionManager: SessionManager,
  eventsManager: EventsManager,
) {
  // Keyed by name, so a later registration of a name replaces the earlier one. That is what lets a
  // consumer replace a built-in, and why the built-in names are reserved.
  const plugins = new Map<string, TelemetryPlugin>();

  return {
    setup,
    plugin,
  };

  function setup() {
    // Anything registered after this pass is stored by `plugin()` below and never set up: the
    // ordering requirement is documented rather than enforced.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-late-plugin-unset
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-invoke-setup
    for (const item of plugins.values()) {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-build-plugin-context
      item.setup({
        logger: context.logger,
        config: context.config,
        addHook: context.hooks.addHook,
        logEvent: eventsManager.logEvent,
        getSession: sessionManager.getSession,
        refreshSession: sessionManager.refreshSession,
      });
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-build-plugin-context
    }
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-invoke-setup
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-late-plugin-unset
  }

  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-each-plugin
  function plugin(...newPlugins: TelemetryPluginOption[]) {
    for (const newPlugin of normalizePlugins(newPlugins)) {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-store-by-name
      plugins.set(newPlugin.name, newPlugin);
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-store-by-name
    }
  }
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-each-plugin

  // Falsy entries are dropped rather than rejected, so `cond && myPlugin()` needs no branch.
  // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-skip-falsy
  function normalizePlugins(items: TelemetryPluginOption[]): TelemetryPlugin[] {
    return items.filter((item): item is TelemetryPlugin => !!item);
  }
  // @cpt-end:cpt-frontx-telemetry-algo-event-collection-plugin-setup:p1:inst-skip-falsy
}
