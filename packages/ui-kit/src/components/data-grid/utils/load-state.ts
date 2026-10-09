import type { StoreApi, UseBoundStore } from 'zustand';
import { create } from 'zustand';

export type LoadState = 'blank' | 'loading' | 'error' | 'loaded';

export interface LoadStateStore {
  loadState: LoadState;
}

export type UseLoadStateStore = UseBoundStore<StoreApi<LoadStateStore>>;

export interface LoadStateManager {
  useLoadState: UseLoadStateStore;
  setLoading: () => void;
  setLoaded: () => void;
  setError: () => void;
  setBlank: () => void;
  /** Back to idle, and detaches the `loadPromise` in flight so its outcome no longer writes. */
  reset: () => void;
  loadPromise: <T>(promise: Promise<T>) => Promise<T>;
}

/**
 * A zustand store holding a `blank -> loading -> loaded | error` state, plus the helpers that move
 * it. `loadPromise` follows a promise: loading while it is pending, then loaded or error.
 */
export function createLoadStateManager(): LoadStateManager {
  const useLoadStateStore = create<LoadStateStore>()(() => ({
    loadState: 'blank',
  }));
  // Which `loadPromise` owns the state. A later one, or a `reset`, takes it over, and the outcome
  // of the one it replaced no longer writes: a load that was cut off must not come back later and
  // mark the state loaded, or failed, over whatever the state has become since.
  let owner = 0;

  return {
    useLoadState: useLoadStateStore,
    setLoading,
    setLoaded,
    setError,
    setBlank,
    reset,
    loadPromise,
  };

  function setLoading() {
    useLoadStateStore.setState({ loadState: 'loading' });
  }

  function setLoaded() {
    useLoadStateStore.setState({ loadState: 'loaded' });
  }

  function setError() {
    useLoadStateStore.setState({ loadState: 'error' });
  }

  function setBlank() {
    useLoadStateStore.setState({ loadState: 'blank' });
  }

  function reset() {
    owner += 1;
    setBlank();
  }

  async function loadPromise<T>(promise: Promise<T>): Promise<T> {
    const mine = ++owner;
    setLoading();
    try {
      const result = await promise;
      if (mine === owner) setLoaded();
      return result;
    } catch (error) {
      if (mine === owner) setError();
      throw error;
    }
  }
}
