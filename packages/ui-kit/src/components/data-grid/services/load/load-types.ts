import type { LoadState } from '../../utils/load-state';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { UseLoadStateStore } from '../../utils/load-state';
import type { DataGridItem, DataGridLoadContext, DataGridLoadResult } from '../../data-grid-types';

export type LoadInstanceId = number | string;

export interface LoadStateStore {
  /** Every in-flight load instance, whatever it is loading. */
  loadState: LoadState;
  /**
   * Only the loads that replace what is on screen. A load scoped to a tree parent appends a section
   * under that row, and a `store: false` load (one that pages through the whole data set) never
   * reaches storage at all, so neither changes the visible record set -- and neither should put the
   * grid's loading treatment up over rows the user can still work with.
   */
  recordsLoadState: LoadState;
}

export type UseLoadServiceStateStore = UseBoundStore<StoreApi<LoadStateStore>>;

export interface RefreshOptions {
  resetFilters: boolean;
}

export interface RefreshOptionsRaw {
  /**
   * Whether to reset filters to default state
   * @default true
   */
  resetFilters?: boolean;
}

export interface LoadTriggerConfig {
  id?: LoadInstanceId;
  loadContext?: DataGridLoadContext;
  refresh?: RefreshOptions;
  store?: boolean;
}

export interface LoadInstance<TItem extends DataGridItem> {
  id: LoadInstanceId;
  useLoadState: UseLoadStateStore;
  promise: Promise<void>;
  signal: AbortSignal;
  refresh: RefreshOptions | null;
  abort: () => void;
  loadContext: DataGridLoadContext;
  processResult?: DataGridLoadResult<TItem>;
  fetchResult?: DataGridLoadResult<TItem>;
  error?: Error;
}

export interface LoadPublicApi<TItem extends DataGridItem> {
  /**
   * Abort the current load operation.
   */
  abort: () => void;

  /**
   * Refresh data by aborting current load and triggering a new one.
   *
   * @param options - Refresh options (e.g., resetFilters)
   */
  refresh: (options?: RefreshOptionsRaw) => Promise<void>;

  /**
   * Trigger a data load operation.
   *
   * @param config - Load configuration (context, refresh options, etc.)
   * @returns The load instance
   */
  triggerLoad: (config?: LoadTriggerConfig) => LoadInstance<TItem>;

  /**
   * Get all active load instances.
   */
  getLoadInstances: () => LoadInstance<TItem>[];

  /**
   * Zustand store for load instances state (loading when instances exist, blank otherwise).
   * For the stable load state machine (blank → loading → loaded), use core.useLoadStateStore.
   */
  useLoadStateStore: UseLoadServiceStateStore;
}

export interface LoadService<TItem extends DataGridItem> extends LoadPublicApi<TItem> {
  init: () => Promise<void>;
}
