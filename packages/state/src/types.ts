/**
 * @gears-frontx/state - Type Definitions
 *
 * Core types for the FrontX Flux dataflow pattern.
 * Combines event system and store types into a unified package.
 *
 * SDK Layer: L1 (Only peer dependency on @reduxjs/toolkit)
 */

import type { Dispatch, PayloadAction, Reducer, UnknownAction } from '@reduxjs/toolkit';
import type { Observable } from 'redux';

// ============================================================================
// Reducer Payload Type (Renamed from PayloadAction)
// ============================================================================

/**
 * FrontX Reducer Payload Type
 * Type alias for Redux Toolkit's PayloadAction.
 *
 * TERMINOLOGY: Named "ReducerPayload" (not "PayloadAction") to avoid confusion
 * with FrontX Actions. In FrontX:
 * - **FrontX Action**: Function that emits events via eventBus.emit()
 * - **ReducerPayload**: The payload shape received by reducers in createSlice
 *
 * Redux is an internal implementation detail of @gears-frontx/state.
 *
 * @template T - The payload type
 *
 * @example
 * ```typescript
 * import { createSlice, type ReducerPayload } from '@gears-frontx/state';
 *
 * const menuSlice = createSlice({
 *   name: 'uicore/menu',
 *   initialState,
 *   reducers: {
 *     setMenuCollapsed: (state, action: ReducerPayload<boolean>) => {
 *       state.collapsed = action.payload;
 *     },
 *   },
 * });
 * ```
 */
// @cpt-dod:cpt-frontx-dod-state-management-flux-terminology:p2
// @cpt-flow:cpt-frontx-flow-state-management-flux-dataflow:p1
export type ReducerPayload<T> = PayloadAction<T>;

// ============================================================================
// Event Payload Map
// ============================================================================

/**
 * Global Event Payload Map
 * Central registry of ALL events in the application.
 * Maps event keys (strings) to their payload types.
 *
 * EXTENSIBLE: Use module augmentation to add custom events:
 *
 * @example
 * ```typescript
 * declare module '@gears-frontx/state' {
 *   interface EventPayloadMap {
 *     'chat/threads/selected': { threadId: string };
 *     'chat/messages/received': { message: Message };
 *   }
 * }
 * ```
 *
 * Design: Interface (not type) enables TypeScript declaration merging.
 */
// @cpt-dod:cpt-frontx-dod-state-management-module-augmentation:p2
export interface EventPayloadMap {
  // Base interface - extended via module augmentation
  // Intentionally empty - filled by consumers
}

/**
 * Event Key Type
 * Union of all event keys from EventPayloadMap.
 * Used in EventBus generic constraints for type-safe event emission.
 */
export type EventKey = keyof EventPayloadMap;

// ============================================================================
// Event Handler Types
// ============================================================================

/**
 * Event Handler Function
 * Function that handles an event with its typed payload.
 *
 * @template T - The payload type for this event
 */
export type EventHandler<T> = (payload: T) => void;

/**
 * Subscription / Unsubscribe Function
 * Returns a function to unsubscribe from the event.
 */
export type Unsubscribe = () => void;

/**
 * Subscription Object
 * Object-oriented way to manage event subscriptions.
 */
export interface Subscription {
  unsubscribe: Unsubscribe;
}

// ============================================================================
// Event Bus Interface
// ============================================================================

/**
 * EventBus Interface
 * Type-safe event pub/sub mechanism.
 *
 * @template TEvents - The event payload map type (defaults to EventPayloadMap)
 *
 * @example
 * ```typescript
 * // Emit an event (type-safe)
 * eventBus.emit('chat/threads/selected', { threadId: '123' });
 *
 * // Subscribe to an event
 * const unsubscribe = eventBus.on('chat/threads/selected', ({ threadId }) => {
 *   console.log('Thread selected:', threadId);
 * });
 *
 * // Unsubscribe
 * unsubscribe();
 * ```
 */
export interface EventBus<TEvents extends EventPayloadMap = EventPayloadMap> {
  /**
   * Emit an event with payload.
   * Type-safe: payload must match event type in EventPayloadMap.
   *
   * @param event - The event key
   * @param payload - The event payload (optional for void events)
   */
  emit<K extends keyof TEvents>(
    event: K,
    ...args: TEvents[K] extends void ? [] : [TEvents[K]]
  ): void;

  /**
   * Subscribe to an event.
   * Type-safe: handler receives correct payload type for event.
   *
   * @param event - The event key
   * @param handler - Function to handle the event
   * @returns Subscription object with unsubscribe method
   */
  on<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription;

  /**
   * Subscribe to an event once.
   * Handler is automatically removed after first invocation.
   *
   * @param event - The event key
   * @param handler - Function to handle the event
   * @returns Subscription object with unsubscribe method
   */
  once<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>
  ): Subscription;

  /**
   * Remove all handlers for a specific event.
   *
   * @param event - The event key
   */
  clear(event: string): void;

  /**
   * Remove all event handlers.
   */
  clearAll(): void;
}

// ============================================================================
// Event Naming Convention Types
// ============================================================================

/**
 * Template Literal Types for Event Naming Convention
 * Enforces the FrontX event naming pattern: `${screenset}/${domain}/${action}`
 *
 * @example
 * ```typescript
 * type ValidEvent = EventName<'chat', 'threads', 'selected'>;
 * // Result: 'chat/threads/selected'
 * ```
 */
export type EventName<
  TScreenset extends string,
  TDomain extends string,
  TAction extends string
> = `${TScreenset}/${TDomain}/${TAction}`;

/**
 * Conditional type for payload extraction from event name.
 *
 * @template K - Event key from EventPayloadMap
 */
export type PayloadOf<K extends EventKey> = EventPayloadMap[K];

/**
 * Helper type for events with no payload.
 * Use `void` as the payload type for events that don't need data.
 *
 * @example
 * ```typescript
 * declare module '@gears-frontx/state' {
 *   interface EventPayloadMap {
 *     'app/initialized': void;
 *   }
 * }
 *
 * eventBus.emit('app/initialized'); // No payload needed
 * ```
 */
export type VoidPayload = void;

// ============================================================================
// Root State Interface
// ============================================================================

/**
 * Root State Base Interface
 * Central state type for the Redux store.
 *
 * EXTENSIBLE: Use module augmentation to add custom slices:
 *
 * @example
 * ```typescript
 * // In your screenset code
 * declare module '@gears-frontx/state' {
 *   interface RootState {
 *     'chat/threads': ThreadsState;
 *     'chat/messages': MessagesState;
 *   }
 * }
 * ```
 *
 * Design: Interface (not type) enables TypeScript declaration merging.
 */
export interface RootState {
  // Base interface - extended via module augmentation
  // Intentionally empty - filled by consumers
  [key: string]: unknown;
}

// ============================================================================
// Dispatch Types
// ============================================================================

/**
 * App Dispatch Type
 * The dispatch function type for the FrontX store.
 * Aliases Redux `Dispatch<UnknownAction>` so `HAI3Store` is structurally compatible with
 * `Store` (e.g. react-redux `Provider`) while keeping the same call shape for effects.
 */
export type AppDispatch = Dispatch<UnknownAction>;

// ============================================================================
// Slice Types
// ============================================================================

/**
 * Slice Object Interface
 * Minimal interface for slice registration.
 * Only includes what registerSlice() actually needs.
 *
 * @template TState - The slice state type (required, no default)
 *
 * NOTE: This interface is intentionally minimal. Redux Toolkit's createSlice
 * returns additional properties (actions, selectors, etc.) but those are
 * internal implementation details used by effects, not part of the registration API.
 *
 * @example
 * ```typescript
 * const threadsSlice = createSlice({
 *   name: 'chat/threads',
 *   initialState,
 *   reducers: { ... }
 * });
 *
 * // threadsSlice satisfies SliceObject<ThreadsState>
 * registerSlice(threadsSlice, initThreadsEffects);
 * ```
 */
export interface SliceObject<TState> {
  /** Slice name - becomes the state key */
  readonly name: string;
  /** Slice reducer function */
  readonly reducer: Reducer<TState>;
}

// ============================================================================
// Effect Types
// ============================================================================

/**
 * Effect Initializer Function
 * Function that sets up effects (event subscriptions) for a slice.
 * Called by registerSlice after the slice is registered.
 *
 * IMPORTANT: Effect initializers SHOULD return a cleanup function to unsubscribe
 * all event handlers. This prevents duplicate subscriptions during HMR or
 * when slices are re-registered.
 *
 * @param dispatch - The store's dispatch function
 * @returns Optional cleanup function to unsubscribe from events
 *
 * @example
 * ```typescript
 * const initThreadsEffects: EffectInitializer = (dispatch) => {
 *   const sub1 = eventBus.on('chat/threads/selected', ({ threadId }) => {
 *     dispatch(setCurrentThreadId(threadId));
 *   });
 *   const sub2 = eventBus.on('chat/threads/created', ({ thread }) => {
 *     dispatch(addThread(thread));
 *   });
 *
 *   // Return cleanup function
 *   return () => {
 *     sub1.unsubscribe();
 *     sub2.unsubscribe();
 *   };
 * };
 * ```
 */
export type EffectInitializer = (dispatch: AppDispatch) => void | EffectCleanup;

/**
 * Effect Cleanup Function
 * Function to clean up effects when a slice is unregistered.
 * Returns an unsubscribe function.
 */
export type EffectCleanup = () => void;

/**
 * Effect Initializer with Cleanup
 * Effect initializer that returns a cleanup function.
 *
 * @param dispatch - The store's dispatch function
 * @returns Cleanup function to unsubscribe from events
 */
export type EffectInitializerWithCleanup = (dispatch: AppDispatch) => EffectCleanup;

// ============================================================================
// Store Types
// ============================================================================

/**
 * FrontX Store Interface
 * The enhanced Redux store with dynamic slice registration.
 *
 * @template TState - The state type (defaults to RootState)
 */
export interface HAI3Store<TState = RootState> {
  /** Get current state */
  getState: () => TState;
  /** Dispatch an action */
  dispatch: AppDispatch;
  /** Subscribe to state changes */
  subscribe: (listener: () => void) => () => void;
  /** Replace the root reducer */
  replaceReducer: (nextReducer: Reducer<TState>) => void;
  /** Redux observable interop (required for react-redux `Provider` typing) */
  [Symbol.observable](): Observable<TState>;
}

// ============================================================================
// Register Slice Function Signature
// ============================================================================

/**
 * Register Slice Function Signature
 * Registers a dynamic slice with the store.
 *
 * CONVENTION ENFORCEMENT: Slice.name becomes the state key automatically.
 * This ensures screenset self-containment - when you duplicate a screenset
 * and change the screenset ID constant, everything auto-updates.
 *
 * @param slice - Redux Toolkit slice object
 * @param initEffects - Optional function to initialize effects
 *
 * @throws Error if domain-based slice has invalid format
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
export type RegisterSlice = <TState>(
  slice: SliceObject<TState>,
  initEffects?: EffectInitializer
) => void;

// ============================================================================
// Selector Types
// ============================================================================

/**
 * Selector Function Type
 * Type-safe selector that extracts data from state.
 *
 * @template TResult - The return type of the selector
 * @template TState - The state type (defaults to RootState)
 */
export type Selector<TResult, TState = RootState> = (state: TState) => TResult;

/**
 * Parameterized Selector Type
 * Selector that accepts additional parameters.
 *
 * @template TResult - The return type of the selector
 * @template TParams - The parameter types
 * @template TState - The state type (defaults to RootState)
 */
export type ParameterizedSelector<TResult, TParams extends unknown[], TState = RootState> = (
  state: TState,
  ...params: TParams
) => TResult;
