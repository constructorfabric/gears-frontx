import type { TelemetryHooksService } from '../managers/hooks';
import type { TelemetryLoggerService } from '../managers/logger';
import type { TelemetryLogEventParams, TelemetryRecord } from './eventTypes';
import type { HooksManager } from './hooks';

export type TelemetryConfigNormalized = {
  appName: string;
  appVersion: string;
  storagePrefix?: string;
  enabled: boolean;
  verbose: boolean;
  url: string;
  autocapture: boolean;
  sessionDuration: number;
  apiVersion: number;
};

export type TelemetryConfig = {
  /**
   * Key prefix to store data in localStorage
   */
  storagePrefix?: string;
  /**
   * This name will be passed to `context_source_app_name` and used as a default value for `context_app_name` and `context_service_name`
   * Usually this is the name of the frontend application. i.e. "cloud"
   */
  appName: string;
  /**
   * Version of the app
   */
  appVersion: string;
  /**
   * Automatically send click, input, ... events from the page
   * @default true
   */
  autocapture?: boolean;
  /**
   * Enables or disables telemetry events
   */
  enabled?: boolean;
  /**
   * Enables or disables logs
   */
  verbose?: boolean; // TODO: make it configurable with Debug modal
  /**
   * Url send events to
   */
  url?: string;
  /**
   * Session duration in milliseconds
   * @default 30mins
   */
  sessionDuration?: number;
  /**
   * API version used when sending events
   */
  apiVersion?: number;
};

export type TelemetrySession = {
  id: string;
  lastActivity: number;
  startTime: number;
};

export type LogEvent = (...args: TelemetryLogEventParams) => TelemetryRecord;

export type TelemetryPluginOption = TelemetryPlugin | false | null | undefined;

export type TelemetryPlugin = {
  name: string;
  setup: (context: TelemetryPluginContext) => void;
};

export type TelemetryPluginContext = {
  config: TelemetryConfigNormalized;
  addHook: HooksManager['addHook'];
  logEvent: LogEvent;
  getSession: () => TelemetrySession | undefined;
  refreshSession: () => void;
  logger: TelemetryLoggerService;
};

export type TelemetryContext = {
  config: TelemetryConfigNormalized;
  hooks: TelemetryHooksService;
  logger: TelemetryLoggerService;
};
