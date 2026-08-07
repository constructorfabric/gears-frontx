export { createTelemetry } from './services/telemetry';
export type { TelemetryService, TelemetryLogEvent } from './services/types';
export { telemetryElementHookKey } from './plugins/autocapture/elementHook';
export type {
  TelemetryElementHook,
  TelemetryElementHookAttribution,
  TelemetryElementHookResult,
} from './plugins/autocapture/elementHook';
export { telemetryLocalePlugin } from './plugins/locale';
export type { LocaleSource } from './plugins/locale';
export type {
  TelemetryEventRecord,
  TelemetryLogEventParams,
  TelemetryData,
} from './utils/eventTypes';
export type {
  TelemetryConfig,
  TelemetryPlugin,
  TelemetryPluginContext,
  TelemetryPluginOption,
} from './utils/types';
