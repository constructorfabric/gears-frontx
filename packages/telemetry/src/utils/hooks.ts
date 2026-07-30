import type { TelemetryRecord } from './eventTypes';
import type { TelemetrySession } from './types';

export type TelemetryHooks = {
  start: (...args: any[]) => void;
  destroy: (...args: any[]) => void;
  event: (record: TelemetryRecord) => void;
  sessionStart: (session: TelemetrySession) => void;
};

export type HooksManager = {
  addHook: <Key extends TelemetryHooksKeys = TelemetryHooksKeys>(
    key: Key,
    hook: TelemetryHooks[Key],
  ) => void;
  callHooksSync: <Key extends TelemetryHooksKeys = TelemetryHooksKeys>(
    key: Key,
    ...args: Parameters<TelemetryHooks[Key]>
  ) => void;
  callHooks: <Key extends TelemetryHooksKeys = TelemetryHooksKeys>(
    key: Key,
    ...args: Parameters<TelemetryHooks[Key]>
  ) => Promise<void>;
};

export type TelemetryHooksKeys = keyof TelemetryHooks;

export type TelemetryPluginHook = TelemetryHooks[TelemetryHooksKeys];
