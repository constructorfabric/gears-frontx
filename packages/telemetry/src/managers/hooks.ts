import type {
  TelemetryHooks,
  TelemetryHooksKeys,
  TelemetryPluginHook,
  HooksManager,
} from '../utils/hooks';

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
