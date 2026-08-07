import { createEventsManager } from '../managers/events';
import { createPluginsManager } from '../managers/plugins';
import { createSessionManager } from '../managers/session';
import { createUserInfoManager } from '../managers/userInfo';
import { telemetryAppInfoPlugin } from '../plugins/appInfo';
import { autocapturePlugin } from '../plugins/autocapture/autocapture';
import { devicePlugin } from '../plugins/device';
import { navigationPlugin } from '../plugins/navigation';
import { sessionPlugin } from '../plugins/session';
import type { TelemetryLogEventParams, TelemetryUserId } from '../utils/eventTypes';
import { createHooks } from '../utils/hooks';
import { createLogger } from '../utils/logger';
import type { TelemetryContext, TelemetryConfig, TelemetryPluginOption } from '../utils/types';
import { normalizeOptions } from '../utils/utils';
import type { TelemetryService } from './types';

// @cpt-flow:cpt-frontx-telemetry-flow-event-collection-instrument:p1
// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-start:p1
// @cpt-algo:cpt-frontx-telemetry-algo-event-collection-destroy:p1
// @cpt-state:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-single-use:p1
// @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-create-client
export function createTelemetry(configRaw: TelemetryConfig): TelemetryService {
  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-normalize-config
  const config = normalizeOptions(configRaw);
  const hooks = createHooks();
  const logger = createLogger(config);
  const context: TelemetryContext = { config, hooks, logger };
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-normalize-config
  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-construct-managers
  const sessionManager = createSessionManager(context);
  const eventsManager = createEventsManager(context);
  const userInfoManager = createUserInfoManager(context);
  const pluginsManager = createPluginsManager(context, sessionManager, eventsManager);
  const rootApi = { plugin, start, destroy, logEvent, identify };
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-construct-managers
  // The CREATED state: no listener installed and no plugin set up until `start()` runs.
  // @cpt-begin:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-created-to-started
  let started = false;
  // @cpt-end:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-created-to-started

  return rootApi;

  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-log-event
  function logEvent(...args: TelemetryLogEventParams) {
    eventsManager.logEvent(...args);
  }
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-log-event

  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-identify-user
  function identify(newUserId: TelemetryUserId) {
    userInfoManager.identify(newUserId);
    return rootApi;
  }
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-identify-user

  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-start-client
  function start() {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-guard-window
    // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-check-window
    if (typeof window === 'undefined') {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-return-unstarted
      // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-no-window-noop
      return rootApi;
      // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-no-window-noop
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-return-unstarted
    }
    // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-check-window
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-guard-window

    // `destroy()` leaves the registered hooks in place, so this flag is never cleared: a second
    // `start()` would set every plugin up again, duplicating its `event` hook and its listeners.
    // A client is single-use by design — build a new one instead of restarting this one.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-guard-restart
    // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-check-started
    // @cpt-begin:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-started-to-started
    // @cpt-begin:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-destroyed-terminal
    if (started) {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-log-restart-refused
      // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-refuse-restart
      logger.logError('Telemetry is already started; build a new client instead of restarting.');
      // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-refuse-restart
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-log-restart-refused
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-return-already-started
      return rootApi;
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-return-already-started
    }
    // @cpt-end:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-destroyed-terminal
    // @cpt-end:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-started-to-started
    // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-check-started
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-guard-restart

    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-set-started
    started = true;
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-set-started

    // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-start-collection
    // The built-ins are registered after anything the caller registered, so a caller plugin using
    // a built-in name is the one that gets replaced. This is why those names are reserved.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-register-builtins
    plugin(
      sessionPlugin(),
      devicePlugin(),
      navigationPlugin(),
      telemetryAppInfoPlugin(),
      autocapturePlugin(),
    );
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-register-builtins
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-start-session
    sessionManager.start();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-start-session
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-start-events
    eventsManager.start();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-start-events
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-setup-plugins
    pluginsManager.setup();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-setup-plugins
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-refresh-session
    sessionManager.refreshSession();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-refresh-session
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-call-start-hooks
    hooks.callHooksSync('start');
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-call-start-hooks
    // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-start-collection
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-return-started
    return rootApi;
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-start:p1:inst-return-started
  }
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-start-client

  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-register-plugins
  function plugin(...newPlugins: TelemetryPluginOption[]) {
    if (typeof window === 'undefined') {
      return rootApi;
    }

    pluginsManager.plugin(...newPlugins);
    return rootApi;
  }
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-register-plugins

  // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-destroy-client
  // @cpt-begin:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-started-to-destroyed
  // @cpt-begin:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-created-to-destroyed
  function destroy() {
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-guard-window-destroy
    if (typeof window === 'undefined') {
      // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-return-no-teardown
      return;
      // @cpt-end:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-return-no-teardown
    }
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-guard-window-destroy

    // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-teardown-order
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-detach-session
    sessionManager.destroy();
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-detach-session
    // The events manager goes last because its destroy flushes: a plugin's `destroy` hook may log
    // a parting event, and it has to reach the queue before the final send.
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-call-destroy-hooks
    hooks.callHooksSync('destroy');
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-call-destroy-hooks
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-teardown-events-last
    // @cpt-begin:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-return-destroyed
    // @cpt-begin:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-teardown-complete
    eventsManager.destroy();
    // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-teardown-complete
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-return-destroyed
    // @cpt-end:cpt-frontx-telemetry-algo-event-collection-destroy:p1:inst-teardown-events-last
    // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-teardown-order
  }
  // @cpt-end:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-created-to-destroyed
  // @cpt-end:cpt-frontx-telemetry-state-event-collection-client-lifecycle:p2:inst-started-to-destroyed
  // @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-destroy-client
}
// @cpt-end:cpt-frontx-telemetry-flow-event-collection-instrument:p1:inst-create-client
