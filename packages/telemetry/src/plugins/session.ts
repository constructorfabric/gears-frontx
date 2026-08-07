import type { TelemetryRecord } from '../utils/eventTypes';
import type { TelemetryPlugin, TelemetryPluginContext } from '../utils/types';

// Enrichment reaches the record only through the `event` hook, the same surface a consumer plugin
// uses — the SDK gives itself no privileged path.
// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-builtin-context:p1
export function sessionPlugin(): TelemetryPlugin {
  return {
    name: 'session',
    setup: (context: TelemetryPluginContext) => {
      const initialSession = context.getSession();
      context.addHook('event', onEvent);
      context.addHook('start', onStart);

      function onEvent(record: TelemetryRecord) {
        let session = context.getSession();

        // The stored session expires after `sessionDuration` without a refresh, so an event on an
        // idle page finds none and opens the next one.
        if (!session) {
          context.refreshSession();
          session = context.getSession();
        }

        // Still none means the session could not be stored at all, e.g. an origin blocked from
        // storing data. The event goes out without session context rather than throwing out of the
        // public `logEvent()`.
        if (!session) {
          return;
        }

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
