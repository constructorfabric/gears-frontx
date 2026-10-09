import type { StoreApi, UseBoundStore } from 'zustand';
import type { UseLoadStateStore } from '../../utils/load-state';

export interface ExternalLoadingStore {
  /** Loading state supplied by the consumer, independent of the grid's own data loads. */
  loading: boolean;
}

export interface CoreService {
  useLoadStateStore: UseLoadStateStore;
  loadPromise: <T>(promise: Promise<T>) => Promise<T>;
  /** Back to idle, so the next `init()` runs the first load again. */
  resetLoadState: () => void;
  /**
   * Consumer-driven loading state. Kept in its own store rather than in either load-state machine:
   * the load service derives its state from the in-flight instance map, so a value written there
   * would be overwritten on the next load event.
   */
  useExternalLoadingStore: UseBoundStore<StoreApi<ExternalLoadingStore>>;
  /**
   * Backs the `loading` prop, and is the only writer of it. Deliberately not exposed on the grid
   * instance: the instance is reachable only from inside `DataGrid` via `useDataGrid()`, so an
   * imperative setter would be a second writer of one boolean with last-write-wins between them,
   * for a caller shape nothing needs yet. Add it back with its own slot when something does.
   *
   * @internal
   */
  updateLoading: (loading: boolean) => void;
}
