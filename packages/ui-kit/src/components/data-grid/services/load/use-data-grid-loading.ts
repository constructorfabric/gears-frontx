import { useDataGridContext } from '../core/data-grid-context';

/**
 * Whether the grid should be showing load feedback.
 *
 * Reads `recordsLoadState` rather than the load service's overall state: that one counts every
 * in-flight instance, so loading the children of a tree row or paging through the whole data set
 * would dim and block the whole grid over rows the user can still work with. The core service's state is no use here
 * either -- it latches at `'loaded'` after the first load and would never report a refetch. The
 * idle value is `'blank'`, not `'loaded'`, so the test is an equality check.
 *
 * OR-ed with the consumer's `loading` prop, which covers work the grid cannot see -- a bulk copy, a
 * mutation elsewhere on the screen.
 *
 * @internal
 */
export function useDataGridLoading(): boolean {
  const context = useDataGridContext();
  const recordsLoadState = context.load.useLoadStateStore((s) => s.recordsLoadState);
  const externalLoading = context.core.useExternalLoadingStore((s) => s.loading);

  return recordsLoadState === 'loading' || externalLoading;
}
