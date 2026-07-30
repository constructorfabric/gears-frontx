import { createEventsManager } from '../managers/events';
import { createHooks } from '../managers/hooks';
import { createLogger } from '../managers/logger';
import { createPluginsManager } from '../managers/plugins';
import { createSessionManager } from '../managers/session';
import { createUserInfoManager } from '../managers/userInfo';
import { telemetryAppInfoPlugin } from '../plugins/appInfo';
import { autocapturePlugin } from '../plugins/autocapture/autocapture';
import { devicePlugin } from '../plugins/device';
import { navigationPlugin } from '../plugins/navigation';
import { sessionPlugin } from '../plugins/session';
import type { TelemetryLogEventParams, TelemetryUserId } from '../utils/eventTypes';
import type { TelemetryContext, TelemetryConfig, TelemetryPluginOption } from '../utils/types';
import { normalizeOptions } from '../utils/utils';
import type { TelemetryService } from './types';

export function createTelemetry(configRaw: TelemetryConfig): TelemetryService {
  const config = normalizeOptions(configRaw);
  const hooks = createHooks();
  const logger = createLogger(config);
  const context: TelemetryContext = { config, hooks, logger };
  const sessionManager = createSessionManager(context);
  const eventsManager = createEventsManager(context);
  const userInfoManager = createUserInfoManager(context);
  const pluginsManager = createPluginsManager(context, sessionManager, eventsManager);
  const rootApi = { plugin, start, destroy, logEvent, identify };

  return rootApi;

  function logEvent(...args: TelemetryLogEventParams) {
    eventsManager.logEvent(...args);
  }

  function identify(newUserId?: TelemetryUserId) {
    userInfoManager.identify(newUserId);
    return rootApi;
  }

  function start() {
    if (typeof window === 'undefined') {
      return rootApi;
    }

    plugin(
      sessionPlugin(),
      devicePlugin(),
      navigationPlugin(),
      telemetryAppInfoPlugin(),
      autocapturePlugin(),
    );
    sessionManager.start();
    eventsManager.start();
    pluginsManager.setup();
    sessionManager.refreshSession();
    hooks.callHooksSync('start');
    return rootApi;
  }

  function plugin(...newPlugins: TelemetryPluginOption[]) {
    if (typeof window === 'undefined') {
      return rootApi;
    }

    pluginsManager.plugin(...newPlugins);
    return rootApi;
  }

  function destroy() {
    if (typeof window === 'undefined') {
      return;
    }

    sessionManager.destroy();
    eventsManager.destroy();
    hooks.callHooksSync('destroy');
  }
}
