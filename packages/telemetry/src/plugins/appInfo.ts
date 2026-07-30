import type { TelemetryRecord } from '../utils/eventTypes';
import type { TelemetryPluginContext } from '../utils/types';

export function telemetryAppInfoPlugin() {
  return {
    name: 'appInfo',
    setup: (context: TelemetryPluginContext) => {
      context.addHook('event', onEvent);

      function onEvent(record: TelemetryRecord) {
        if (record.context_app_name) {
          console.warn('Passing "context_app_name" is deprecated and will be filled automatically');
        }

        record.context_source_app_name = context.config.appName;
        record.context_source_app_version = context.config.appVersion;

        // if there no service_name, then it is event of viewer itself
        // if it is passed then an element hook up the tree already set it
        if (!record.context_service_name) {
          record.context_service_name = record.context_source_app_name;
          record.context_service_version = record.context_source_app_version;
        }

        record.context_app_name = record.context_service_name;
        record.context_app_version = record.context_source_app_version;

        // call_chain may already hold entries contributed by a nested element hook
        record.context_call_chain = [
          record.context_source_app_name,
          ...(record.context_call_chain ?? []),
        ];

        if (!record.context_call_chain.includes(record.context_service_name)) {
          console.warn(
            `Call chain must include service name "${record.context_service_name}". ` +
              'Current call chain:',
            record.context_call_chain,
          );
        }
      }
    },
  };
}
