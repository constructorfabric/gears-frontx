import type { TelemetryLogEventParams, TelemetryUserId } from '../utils/eventTypes';
import type { TelemetryPluginOption } from '../utils/types';

export type TelemetryService = {
  plugin: (...newPlugins: TelemetryPluginOption[]) => TelemetryService;
  start: () => TelemetryService;
  destroy: () => void;
  logEvent: TelemetryLogEvent;
  identify: (id: TelemetryUserId) => TelemetryService;
};

export type TelemetryLogEvent = (...args: TelemetryLogEventParams) => void;
