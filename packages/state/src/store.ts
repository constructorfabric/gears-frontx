/**
 * FrontX Store - Redux store with dynamic slice registration
 *
 * This package provides:
 * - Configurable Redux store creation
 * - Dynamic slice registration (registerSlice)
 * - Type-safe state access via module augmentation
 *
 * SDK Layer: L1 (Zero @gears-frontx dependencies)
 */

import {
  configureStore,
  combineReducers,
  type Reducer,
  type EnhancedStore,
  type UnknownAction,
} from '@reduxjs/toolkit';
import type { RootState, AppDispatch, SliceObject, EffectInitializer, HAI3Store } from './types';

// ============================================================================
// Store State
// ============================================================================

/** Static reducers that are always present */
let staticReducers: Record<string, Reducer> = {};

/** Dynamic reducers registered by screensets */
const dynamicReducers: Record<string, Reducer> = {};

/**
 * The Redux store instance.
 * Type uses indexed signature to allow dynamic slice registration.
 * RootState is extended via module augmentation by screensets.
 */
let storeInstance: EnhancedStore<Record<string, unknown>, UnknownAction> | null = null;

/** Effect cleanup functions */
const effectCleanups: Map<string, () => void> = new Map();

// ============================================================================
// Store Creation
// ============================================================================

/**
 * Create the FrontX store with initial static reducers.
 *
 * @param initialReducers - Static reducers to include at store creation
 * @returns The configured store instance
 *
 * @example
 * ```typescript
 * // Framework creates the store with layout reducers
 * const store = createStore({
 *   'uicore': combineReducers({ header, footer, menu, screen, ... })
 * });
 * ```
 */
// @cpt-flow:cpt-frontx-flow-state-management-store-init:p1
// @cpt-dod:cpt-frontx-dod-state-management-store-factory:p1
// @cpt-state:cpt-frontx-state-state-management-store-lifecycle:p1
export function createStore(
  initialReducers: Record<string, Reducer> = {}
): HAI3Store<RootState> {
  staticReducers = { ...initialReducers };

  const rootReducer = Object.keys(staticReducers).length > 0
    ? combineReducers(staticReducers)
    : (state: Record<string, unknown> | undefined) => state ?? {};

  storeInstance = configureStore({
    reducer: rootReducer,
  });

  // Create typed wrapper - RootState is extended via module augmentation
  const instance = storeInstance!;
  const store: HAI3Store<RootState> = {
    getState: () => instance.getState() as RootState,
    dispatch: instance.dispatch as AppDispatch,
    subscribe: instance.subscribe,
    replaceReducer: instance.replaceReducer as HAI3Store<RootState>['replaceReducer'],
    [Symbol.observable]: () => instance[Symbol.observable](),
  };

  return store;
}

/**
 * Get the current store instance.
 * Creates a default empty store if none exists.
 *
 * @returns The FrontX store instance
 */
export function getStore(): HAI3Store<RootState> {
  if (!storeInstance) {
    return createStore();
  }

  const instance = storeInstance!;
  return {
    getState: () => instance.getState() as RootState,
    dispatch: instance.dispatch,
    subscribe: instance.subscribe,
    replaceReducer: instance.replaceReducer as HAI3Store<RootState>['replaceReducer'],
    [Symbol.observable]: () => instance[Symbol.observable](),
  };
}

// ============================================================================
// Slice Registration
// ============================================================================

/**
 * Register a dynamic slice with the store.
 *
 * CONVENTION ENFORCEMENT: Slice.name becomes the state key automatically.
 * This ensures screenset self-containment - when you duplicate a screenset
 * and change the screenset ID constant, everything auto-updates.
 *
 * @param slice - Redux Toolkit slice object (from createSlice)
 * @param initEffects - Optional function to initialize effects
 *
 * @throws Error if domain-based slice has invalid format
 * @throws Error if store has not been created
 *
 * @example
 * ```typescript
 * const SLICE_KEY = `${CHAT_SCREENSET_ID}/threads` as const;
 *
 * const threadsSlice = createSlice({
 *   name: SLICE_KEY,  // Name becomes state key
 *   initialState,
 *   reducers: { ... }
 * });
 *
 * registerSlice(threadsSlice, initThreadsEffects);
 *
 * // State shape: { 'chat/threads': ThreadsState }
 * ```
 */
// @cpt-algo:cpt-frontx-algo-state-management-register-slice:p1
// @cpt-flow:cpt-frontx-flow-state-management-slice-registration:p1
// @cpt-dod:cpt-frontx-dod-state-management-slice-registration:p1
// @cpt-dod:cpt-frontx-dod-state-management-effect-system:p1
// @cpt-flow:cpt-frontx-flow-state-management-effect-authoring:p1
// @cpt-state:cpt-frontx-state-state-management-effect-lifecycle:p1
export function registerSlice<TState>(
  slice: SliceObject<TState>,
  initEffects?: EffectInitializer
): void {
  // Auto-create store if it doesn't exist (for module-level side effect registration)
  if (!storeInstance) {
    createStore();
  }

  const sliceName = slice.name;
  const reducer = slice.reducer;

  // Cleanup previous effects BEFORE checking for duplicates
  // This handles HMR where the module is re-executed but slice is already registered
  const previousCleanup = effectCleanups.get(sliceName);
  if (previousCleanup) {
    previousCleanup();
    effectCleanups.delete(sliceName);
  }

  // If slice is already registered, re-initialize effects only (for HMR support)
  if (dynamicReducers[sliceName]) {
    if (initEffects) {
      const cleanup = initEffects(storeInstance!.dispatch as AppDispatch);
      if (cleanup) {
        effectCleanups.set(sliceName, cleanup);
      }
    }
    return;
  }

  // VALIDATE DOMAIN-BASED SLICE FORMAT
  // Domain-based slices must follow 'screensetId/domain' format (exactly 2 parts)
  if (sliceName.includes('/')) {
    const parts = sliceName.split('/');
    if (parts.length !== 2) {
      throw new Error(
        `Invalid domain slice key: "${sliceName}".\n` +
        `Domain-based slices must use "screensetId/domain" format (exactly 2 parts).\n` +
        `Examples: "chat/threads", "chat/messages", "dashboard/widgets"\n` +
        `Invalid: "chat/messages/extra" (too many parts)`
      );
    }
    if (parts[0] === '' || parts[1] === '') {
      throw new Error(
        `Invalid domain slice key: "${sliceName}".\n` +
        `Both screensetId and domain must be non-empty.\n` +
        `Fix: Use format "screensetId/domain" (e.g., "chat/threads")`
      );
    }
  }

  // Add to dynamic reducers
  dynamicReducers[sliceName] = reducer as Reducer;

  // Rebuild root reducer with new slice
  const rootReducer = combineReducers({
    ...staticReducers,
    ...dynamicReducers,
  });

  // Type assertion needed: combineReducers returns inferred type, but RootState is extensible
  // via module augmentation. The cast allows dynamic slice registration.
  // Non-null assertion is safe here because we either had a store or just created one above
  storeInstance!.replaceReducer(rootReducer as Reducer<Record<string, unknown>>);

  // Initialize effects if provided and store cleanup function
  if (initEffects) {
    const cleanup = initEffects(storeInstance!.dispatch as AppDispatch);
    if (cleanup) {
      effectCleanups.set(sliceName, cleanup);
    }
  }
}

/**
 * Unregister a dynamic slice from the store.
 * Useful for cleanup in testing or when unloading screensets.
 *
 * @param sliceName - The name of the slice to unregister
 */
// @cpt-algo:cpt-frontx-algo-state-management-unregister-slice:p2
// @cpt-flow:cpt-frontx-flow-state-management-slice-unregister:p2
// @cpt-dod:cpt-frontx-dod-state-management-unregister-reset:p2
export function unregisterSlice(sliceName: string): void {
  if (!storeInstance) {
    return;
  }

  if (!dynamicReducers[sliceName]) {
    console.warn(`Slice "${sliceName}" is not registered. Skipping.`);
    return;
  }

  // Clean up effects if registered
  const cleanup = effectCleanups.get(sliceName);
  if (cleanup) {
    cleanup();
    effectCleanups.delete(sliceName);
  }

  // Remove from dynamic reducers
  delete dynamicReducers[sliceName];

  // Rebuild root reducer
  const allReducers = { ...staticReducers, ...dynamicReducers };
  const rootReducer = Object.keys(allReducers).length > 0
    ? combineReducers(allReducers)
    : (state: Record<string, unknown> | undefined) => state ?? {};

  // Type assertion: RootState is extensible via module augmentation
  storeInstance.replaceReducer(rootReducer as Reducer<Record<string, unknown>>);
}

/**
 * Check if a slice is registered.
 *
 * @param sliceName - The name of the slice to check
 * @returns True if the slice is registered
 */
export function hasSlice(sliceName: string): boolean {
  return sliceName in dynamicReducers || sliceName in staticReducers;
}

/**
 * Get all registered slice names.
 *
 * @returns Array of slice names
 */
export function getRegisteredSlices(): string[] {
  return [
    ...Object.keys(staticReducers),
    ...Object.keys(dynamicReducers),
  ];
}

// ============================================================================
// Reset (for testing)
// ============================================================================

/**
 * Reset the store to initial state.
 * Primarily used for testing.
 *
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-state-management-reset-store:p2
export function resetStore(): void {
  // Clean up all effects
  effectCleanups.forEach((cleanup) => cleanup());
  effectCleanups.clear();

  // Clear dynamic reducers
  Object.keys(dynamicReducers).forEach((key) => delete dynamicReducers[key]);

  // Reset static reducers
  staticReducers = {};

  // Clear store instance
  storeInstance = null;
}
