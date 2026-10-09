import { isRecord } from '../../utils/is-record';
import { createLoadStateManager } from '../../utils/load-state';
import type {
  InternalContext,
  DataGridItem,
  DataGridLoadContext,
  DataGridLoadResult,
} from '../../data-grid-types';
import type { LoadInstance, LoadTriggerConfig } from './load-types';

export function createLoadInstance<TItem extends DataGridItem>(
  context: InternalContext<TItem>,
  config?: LoadTriggerConfig,
): LoadInstance<TItem> {
  const id = (config?.id ?? Math.random()).toString();
  const controller = new AbortController();
  const loadStateManager = createLoadStateManager();
  const loadContext: DataGridLoadContext = structuredClone(config?.loadContext ?? {});
  let fetchResult: DataGridLoadResult<TItem> | undefined;
  let processResult: DataGridLoadResult<TItem> | undefined;
  let error: Error | undefined;
  // The hooks are handed `instance` while the load is starting, before its promise exists, so the
  // getter below reads a slot that is filled in right after the instance is built.
  const started: { promise?: Promise<void> } = {};
  const instance: LoadInstance<TItem> = {
    id,
    useLoadState: loadStateManager.useLoadState,
    signal: controller.signal,
    abort,
    refresh: config?.refresh ?? null,
    get promise() {
      return started.promise!;
    },
    get loadContext() {
      return loadContext;
    },
    get processResult() {
      return processResult;
    },
    get fetchResult() {
      return fetchResult;
    },
    get error() {
      return error;
    },
  };

  started.promise = loadStateManager.loadPromise(executeLoad());

  return instance;

  function abort() {
    controller.abort();
  }

  async function executeLoad() {
    try {
      await context.hooked.callHookParallel('load:prepare', instance);
      // Call the load:context hook first to collect context data from plugins
      const extraContext = await context.hooked.callHookParallel('load:context', instance);

      // Merge all returned context data into the main loadContext
      mergeContextData(loadContext, extraContext);

      const data = {
        ...instance.loadContext,
        signal: instance.signal,
      };

      fetchResult = await context.config.load.current(data);

      assertLoadResult(fetchResult);

      processResult = (await context.hooked.callHook('load:process', instance))[0] ?? fetchResult;

      assertLoadResult(processResult);

      // Skip storing if store flag is explicitly false
      if (config?.store !== false) {
        const stored = context.hooked.callHookSync('load:store', instance);

        if (!stored.length || stored.every((item) => item !== true)) {
          context.storage.clearSections();
          context.storage.createSection({ loadContext }, processResult.results);
        }
      }

      await context.hooked.callHook('load:success', instance);
    } catch (e: unknown) {
      error = e as Error;
      await context.hooked.callHook('load:error', instance);
      throw error;
    }
  }

  function assertLoadResult(result: unknown): asserts result is DataGridLoadResult<TItem> {
    if (typeof result !== 'object' || result === null || !('results' in result)) {
      throw new Error(
        `Load result must be an object with "results" and "total?" properties. Got ${JSON.stringify(result)}`,
      );
    }
  }

  function mergeContextData(target: Record<string, unknown>, fromArray: (object | void)[]) {
    for (const result of fromArray ?? []) {
      if (!isRecord(result)) continue;

      // key will be filters, pagination, order, ...
      for (const key in result) {
        const value = result[key];
        if (!isRecord(value)) continue;

        if (Array.isArray(value)) {
          target[key] = value;
        } else {
          target[key] ??= {};
          const merged = target[key];
          if (isRecord(merged)) {
            Object.assign(merged, value);
          }
        }
      }
    }
  }
}
