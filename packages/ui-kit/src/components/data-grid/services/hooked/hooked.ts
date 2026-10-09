import { createHooked } from '../../utils/hooked';
import type { DataGridItem } from '../../data-grid-types';
import type { DataGridHooked, DataGridHooks } from './hooked-types';

export function createHookedService<TItem extends DataGridItem>(): DataGridHooked<TItem> {
  const hooked = createHooked<DataGridHooks<TItem>>();

  return {
    hook: hooked.hook,
    callHook: hooked.callHook,
    callHookParallel: hooked.callHookParallel,
    callHookSync: hooked.callHookSync,
  };
}
