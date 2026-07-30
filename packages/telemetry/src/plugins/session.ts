import type { TelemetryRecord } from '../utils/eventTypes';
import type { TelemetryPlugin, TelemetryPluginContext } from '../utils/types';

export function sessionPlugin(): TelemetryPlugin {
  return {
    name: 'session',
    setup: (context: TelemetryPluginContext) => {
      const initialSession = context.getSession();
      context.addHook('event', onEvent);
      context.addHook('start', onStart);

      function onEvent(record: TelemetryRecord) {
        const session = context.getSession()!;
        record.context_session_id = session.id;
        record.context_session_started_time = session.startTime;
      }

      function onStart() {
        if (!initialSession) {
          context.logEvent('session_start');
        }
      }
    },
  };
}
