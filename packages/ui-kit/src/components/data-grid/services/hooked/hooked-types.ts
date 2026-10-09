import type { Hooked } from '../../utils/hooked';
import type { DataGridItem, DataGridLoadResult } from '../../data-grid-types';
import type { LoadInstance } from '../load/load-types';

/**
 * Lifecycle hooks available for plugins.
 *
 * **Initialization:**
 * - `init` - Grid initializes
 * - `destroy` - Grid unmounts
 *
 * **Load Lifecycle:**
 * - `load:prepare` - Before load starts
 * - `load:context` - Modify load context (add filters, pagination)
 * - `load:process` - Process load result before storing
 * - `load:store` - After data is stored (extract totals)
 * - `load:success` - Successful load
 * - `load:error` - Load error
 *
 * **Data Operations:**
 * - `refresh` - Data refresh triggered
 */
export interface DataGridHooks<TItem extends DataGridItem> {
  init: () => void;
  destroy: () => void;
  'load:prepare': (instance: LoadInstance<TItem>) => void;
  'load:context': (
    instance: LoadInstance<TItem>,
  ) => Partial<LoadInstance<TItem>['loadContext']> | void;
  'load:process': (instance: LoadInstance<TItem>) => DataGridLoadResult<TItem> | void;
  'load:store': (instance: LoadInstance<TItem>) => boolean | void;
  'load:success': (instance: LoadInstance<TItem>) => void;
  'load:error': (instance: LoadInstance<TItem>) => void;
  refresh: (options: object) => void;
}

export type DataGridHooked<TItem extends DataGridItem> = Pick<
  Hooked<DataGridHooks<TItem>>,
  'hook' | 'callHook' | 'callHookParallel' | 'callHookSync'
>;
