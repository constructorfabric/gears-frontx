export interface PersistOptions {
  /**
   * Where this one state is stored, overriding the grid's `persistent` setting. For state
   * that belongs to the viewer rather than to the view they would share.
   *
   * @default the grid's `persistent` setting
   */
  storage?: 'localStorage' | 'sessionStorage' | 'router' | 'memory';
  schema?: Record<string, string>;
  /**
   * Whether this state may live in the URL when the grid is configured with
   * `persistent="router"`. With `false` the state is simply not persisted in
   * router mode — neither written nor read — while the other backends are
   * unaffected.
   *
   * @default true
   */
  router?: boolean;
}

export interface UsePersistentState<T> {
  value: T | undefined;
  setValue: (value: T | undefined) => void;
  buildStorageItem: (value: T) => Record<string, unknown>;
}

export interface PersistentStatePublicApi {
  /**
   * Register persistent state for a plugin.
   *
   * @param key - Unique key for storing the state
   * @param options - Persistence options (storage type, schema)
   * @returns State accessor with value, setValue, and buildStorageItem methods
   */
  registerPersistentState: <T>(
    key: string,
    options?: PersistOptions,
  ) => UsePersistentState<T>;
}

export type PersistentStateService = PersistentStatePublicApi;
