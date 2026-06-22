# @gears-frontx/state

State management for FrontX applications - event bus, store, and slices.

## SDK Layer

This package is part of the **SDK Layer (L1)** - zero @gears-frontx dependencies, can be used independently. Only peer dependency is `@reduxjs/toolkit`.

## Terminology

- **Action**: Function that emits events via `eventBus.emit()` (e.g., `selectThread()`)
- **Reducer**: Pure function in a slice that updates state
- **ReducerPayload**: Type for reducer parameters

**IMPORTANT:** The word "action" refers ONLY to FrontX Actions (event emitters). Redux internals are completely hidden.

## Core Concepts

### EventBus

Type-safe event emission and subscription:

```typescript
import { eventBus } from '@gears-frontx/state';

// Subscribe to events
const subscription = eventBus.on('user/loggedIn', (payload) => {
  console.log('User logged in:', payload.userId);
});

// Emit events (only from Actions!)
eventBus.emit('user/loggedIn', { userId: '123' });

// Cleanup
subscription.unsubscribe();
```

### Slices

FrontX's `createSlice` returns `{ slice, ...reducerFunctions }`:

```typescript
import { createSlice, registerSlice, type ReducerPayload } from '@gears-frontx/state';

const { slice, setSelected, setLoading } = createSlice({
  name: 'chat/threads',
  initialState: { selected: null as string | null, loading: false },
  reducers: {
    setSelected: (state, payload: ReducerPayload<string>) => {
      state.selected = payload.payload;
    },
    setLoading: (state, payload: ReducerPayload<boolean>) => {
      state.loading = payload.payload;
    },
  },
});

// Register slice with effects
registerSlice(slice, initThreadsEffects);

// Export reducer functions for effects
export { setSelected, setLoading };
```

### Effects

Effects subscribe to events and dispatch to reducers:

```typescript
import { eventBus, type AppDispatch } from '@gears-frontx/state';
import { setSelected } from './threadsSlice';

export function initThreadsEffects(dispatch: AppDispatch): void {
  eventBus.on(ThreadsEvents.Selected, ({ threadId }) => {
    dispatch(setSelected(threadId));
  });
}
```

### Module Augmentation

Extend `EventPayloadMap` and `RootState` for type safety:

```typescript
declare module '@gears-frontx/state' {
  interface EventPayloadMap {
    'chat/threads/selected': { threadId: string };
  }

  interface RootState {
    'chat/threads': ThreadsState;
  }
}
```

## Key Rules

1. **Actions emit events** - Only Action functions call `eventBus.emit()`
2. **Components call Actions** - Components never use `eventBus` directly
3. **Effects subscribe and dispatch** - Effects listen to events, dispatch to reducers
4. **One-way flow** - Actions → Events → Effects → State updates

## Exports

### Functions
- `eventBus` - Singleton EventBus instance
- `createSlice` - Create slice, returns `{ slice, ...reducerFunctions }`
- `createStore` - Create FrontX store
- `getStore` - Get store instance
- `registerSlice` - Register dynamic slice
- `unregisterSlice` - Remove dynamic slice
- `hasSlice` - Check if slice exists
- `getRegisteredSlices` - List registered slices
- `resetStore` - Reset store (for testing)

### Types
- `ReducerPayload<T>` - Payload type for reducer parameters
- `EventPayloadMap` - Augmentable event payload interface
- `RootState` - Augmentable root state interface
- `AppDispatch` - Dispatch type for effects
- `EffectInitializer` - Effect initializer function type
- `Gears FrontXStore` - Store type
- `SliceObject<TState>` - Slice interface (name + reducer)
- `EventBus` - EventBus interface
- `Subscription` - Subscription with unsubscribe method
