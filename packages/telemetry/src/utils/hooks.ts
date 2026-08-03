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

export type TelemetryHooksService = ReturnType<typeof createHooks>;

export function createHooks(): HooksManager {
  const hooks = new Map<TelemetryHooksKeys, TelemetryPluginHook[]>();

  return {
    addHook,
    callHooksSync,
    callHooks,
  };

  function addHook<Key extends TelemetryHooksKeys>(key: Key, hook: TelemetryHooks[Key]) {
    if (!hooks.has(key)) {
      hooks.set(key, []);
    }

    hooks.get(key)!.push(hook);
  }

  function callHooksSync<Key extends TelemetryHooksKeys>(
    key: Key,
    ...args: Parameters<TelemetryHooks[Key]>
  ) {
    let error: unknown = undefined;

    for (const item of getHooks(key)) {
      try {
        // @ts-expect-error args are correct
        item(...args);
      } catch (e: unknown) {
        error ??= e;
      }
    }

    if (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  function getHooks<Key extends TelemetryHooksKeys>(key: Key) {
    return (hooks.get(key) ?? []) as TelemetryHooks[Key][];
  }

  async function callHooks<Key extends TelemetryHooksKeys>(
    key: Key,
    ...args: Parameters<TelemetryHooks[Key]>
  ) {
    let error: unknown = undefined;

    for (const item of getHooks(key)) {
      try {
        // @ts-expect-error args are correct
        await item(...args);
      } catch (e: unknown) {
        error ??= e;
      }
    }

    if (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
