import type { TelemetryLogEventParams, TelemetryRecord } from './eventTypes';
import type { HooksManager, TelemetryHooksService } from './hooks';
import type { TelemetryLoggerService } from './logger';

export type TelemetryConfigNormalized = {
  appName: string;
  appVersion: string;
  storagePrefix?: string;
  enabled: boolean;
  verbose: boolean;
  url: string;
  autocapture: boolean;
  redactUrls: boolean;
  sanitizeUrl?: SanitizeUrlFn;
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
   * Replace identifying values in recorded urls with placeholders: `:email`, `:uuid`, `:token`,
   * `:id` and `:hash`. Applies to the `page_view` path and to autocaptured link urls.
   * @default false
   */
  redactUrls?: boolean;
  /**
   * Rewrite a url before it is recorded. Runs on the raw value, ahead of `redactUrls`, so a host
   * can map its own routes. With `redactUrls` on, whatever it returns is then swept by the
   * built-in patterns; with `redactUrls` off, its output is recorded as returned. A throw is
   * reported through the SDK logger and the built-in patterns run on the raw url instead.
   *
   * The value passed in depends on the recording site: the navigation plugin passes
   * `location.pathname`, the autocapture walk passes an anchor's `href` as authored - absolute,
   * relative, `#/route` or `mailto:`. A rule anchored on `^` will not see an absolute href.
   */
  sanitizeUrl?: SanitizeUrlFn;
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

export type SanitizeUrlFn = (url: string) => string;

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
