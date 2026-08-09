/**
 * Home Domain - Slice
 * Add your domain state, reducers, and selectors here.
 * Replace '_blank/home' with your screenset/domain name.
 */

import { createSlice } from '@gears-frontx/react';

const { slice } = createSlice({
  name: '_blank/home',
  initialState: {},
  reducers: {},
});

export const homeSlice = slice;

/**
 * RootState augmentation for type-safe selectors
 * Update the state type when you add your domain state shape.
 *
 * The target is `@gears-frontx/state`, not `@gears-frontx/react`, even though the
 * events file next door augments `@gears-frontx/react`. `RootState` is declared once,
 * in `@gears-frontx/state`; `@gears-frontx/react` only re-exports it, so an
 * augmentation naming `@gears-frontx/react` merges into that re-export alias and
 * reaches only the declarations that resolve `RootState` through `@gears-frontx/react`
 * itself: `useAppSelector` sees the new key, while `getStore().getState()` still types
 * it `unknown` and fails with TS2571. `EventPayloadMap` is the exception the events
 * file relies on - `@gears-frontx/react` re-declares that interface, so it owns a
 * declaration site of its own to merge into.
 */
declare module '@gears-frontx/state' {
  interface RootState {
    '_blank/home': Record<string, never>;
  }
}
