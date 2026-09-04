import type { TelemetryRecord, TelemetryRecordId } from '../utils/eventTypes';
import { redactUrl } from '../utils/url';
import type { TelemetryPlugin, TelemetryPluginContext } from '../utils/types';

// @cpt-dod:cpt-frontx-telemetry-dod-event-collection-builtin-context:p1
export function navigationPlugin(): TelemetryPlugin {
  return {
    name: 'navigation',
    setup: (context: TelemetryPluginContext) => {
      let currentUrl: string | null = null;
      let currentPageRecordId: TelemetryRecordId | null = null;
      const originalPushState = window.history.pushState;
      const originalReplaceState = window.history.replaceState;

      context.addHook('start', subscribe);
      context.addHook('destroy', unsubscribe);
      context.addHook('event', onEvent);

      function onEvent(record: TelemetryRecord) {
        if (record.name !== 'page_view' && record.name !== 'session_start' && currentPageRecordId) {
          record.caused_by_id = currentPageRecordId;
        }
      }

      function trigger() {
        if (currentUrl === window.location.pathname) {
          return;
        }

        context.refreshSession();
        currentUrl = window.location.pathname;
        const record = context.logEvent('page_view', { url: redactUrl(currentUrl, context) });
        currentPageRecordId = record.id ?? null;
      }

      function subscribe() {
        window.addEventListener('popstate', trigger);

        window.history.pushState = (...args) => {
          originalPushState.apply(window.history, args);
          trigger();
        };

        window.history.replaceState = (...args) => {
          originalReplaceState.apply(window.history, args);
          trigger();
        };
      }

      function unsubscribe() {
        window.removeEventListener('popstate', trigger);
        window.history.pushState = originalPushState;
        window.history.replaceState = originalReplaceState;
      }
    },
  };
}
