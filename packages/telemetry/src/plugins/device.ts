import Bowser from 'bowser';
import type { TelemetryRecord } from '../utils/eventTypes';
import type { TelemetryPlugin, TelemetryPluginContext } from '../utils/types';
import { getLocalStorageKey } from '../utils/utils';

// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-builtin-context:p1
export function devicePlugin(): TelemetryPlugin {
  return {
    name: 'device',
    setup: (context: TelemetryPluginContext) => {
      const parsed = Bowser.getParser(window.navigator.userAgent);
      const deviceId = getDeviceId();

      context.addHook('event', onEvent);

      function onEvent(record: TelemetryRecord) {
        record.context_client_viewport_width = window.innerWidth;
        record.context_client_viewport_height = window.innerHeight;
        record.context_timezone_name = Intl.DateTimeFormat().resolvedOptions().timeZone;
        record.context_timezone_utc_offset = new Date().getTimezoneOffset();
        const os = parsed.getOS();
        record.context_os_name = os.name;
        record.context_os_version = os.version;
        const browser = parsed.getBrowser();
        record.context_client_name = browser.name;
        record.context_client_version = browser.version;
        record.context_os_platform = parsed.getPlatformType(true);
        record.context_device_id = deviceId;
        record.context_user_data = {
          app_platform: 'Web',
          mobile_web: window.matchMedia('(max-width: 720px)').matches,
          locale: navigator.language,
          session_duration: context.config.sessionDuration,
        };

        if (!record.context_language) {
          record.context_language = navigator.language;
        }
      }

      // Storage access is best-effort: `setup()` runs inside `start()` and the plugin loop has no
      // error isolation, so a throw here would skip every later plugin and the `start` hooks.
      // `localStorage` throws on an origin blocked from storing data and on a full quota.
      function getDeviceId() {
        const storageKey = getLocalStorageKey('device_id', context.config.storagePrefix);

        try {
          const storedId = localStorage.getItem(storageKey);

          if (storedId) {
            return storedId;
          }
        } catch (e) {
          context.logger.logError(e);
        }

        const id = crypto.randomUUID();

        // A generated id still identifies this page even when it cannot be persisted.
        try {
          localStorage.setItem(storageKey, id);
        } catch (e) {
          context.logger.logError(e);
        }

        return id;
      }
    },
  };
}
