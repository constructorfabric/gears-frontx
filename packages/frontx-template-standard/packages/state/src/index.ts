/**
 * @gears-frontx/state - FrontX State Management
 *
 * Provides:
 * - Type-safe event bus for pub/sub communication
 * - Store with dynamic slice registration
 * - Effect system for event-driven state updates
 *
 * SDK Layer: L1 (Only peer dependency on @reduxjs/toolkit)
 *
 * TERMINOLOGY:
 * - "Action" = FrontX Action (function that emits events)
 * - "Reducer" = pure function in slice that updates state
 * - Redux internals are completely hidden
 */
// @cpt-featstatus:cpt-frontx-featstatus-state-management:p1

// ============================================================================
// Type Exports (minimal public API)
// ============================================================================

import type {
  ReducerPayload,
  EventPayloadMap as InternalEventPayloadMap,
  RootState,
  AppDispatch,
  EffectInitializer,
  FrontXStore,
  SliceObject,
  EventBus,
  EventHandler,
  Subscription,
} from './types';
import { eventBus as internalEventBus } from './EventBus';

export type {
  // For reducers
  ReducerPayload,
  RootState,
  // For effects
  AppDispatch,
  EffectInitializer,
  // For store/slice
  FrontXStore,
  SliceObject,
  // For event subscriptions
  EventBus,
  EventHandler,
  Subscription,
};

/**
 * Public augmentation site for application and package events.
 * Consumers augment `@gears-frontx/state`, not the internal `./types` module.
 */
export interface EventPayloadMap extends InternalEventPayloadMap {}

// ============================================================================
// Event Bus
// ============================================================================

export const eventBus: EventBus<EventPayloadMap> = internalEventBus as EventBus<EventPayloadMap>;

// ============================================================================
// Store
// ============================================================================

export {
  createStore,
  getStore,
  registerSlice,
  unregisterSlice,
  hasSlice,
  getRegisteredSlices,
  resetStore,
} from './store';

// ============================================================================
// Slice
// ============================================================================

export { createSlice } from './createSlice';
