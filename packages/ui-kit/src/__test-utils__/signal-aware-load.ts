import type {
  DataGridLoadContext,
  DataGridLoadResult,
} from '../components/data-grid/data-grid-types';

export interface PendingLoad {
  signal: AbortSignal | undefined;
  /** Settles this call with the rows the helper was given. */
  succeed: () => void;
  /** Settles this call with a failure of the consumer's own. */
  fail: (error: Error) => void;
}

/**
 * A `DataGrid` `load` that honours `signal` the way `fetch` does: it rejects with an AbortError the
 * moment the signal fires. Every call stays pending until the test settles it, so a test decides
 * when a load finishes, and `pending` shows how many times the grid asked.
 */
export function createSignalAwareLoad<TItem extends { id: string | number }>(results: TItem[]) {
  const pending: PendingLoad[] = [];

  function load(context: DataGridLoadContext): Promise<DataGridLoadResult<TItem>> {
    return new Promise((resolve, reject) => {
      context.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
      pending.push({
        signal: context.signal,
        succeed: () => resolve({ results, total: results.length }),
        fail: reject,
      });
    });
  }

  return { load, pending };
}
