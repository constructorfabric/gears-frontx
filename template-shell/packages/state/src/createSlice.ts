/**
 * FrontX createSlice - Wrapper around Redux Toolkit
 *
 * Returns:
 * - `slice` object for registration (name + reducer only)
 * - Individual reducer functions spread at top level
 *
 * In FrontX, "Action" refers exclusively to event emitters.
 */

import {
  createSlice as rtkCreateSlice,
  type SliceCaseReducers,
  type CreateSliceOptions,
  type CaseReducerActions,
} from '@reduxjs/toolkit';
import type { SliceObject } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * FrontX Slice Result
 * The return type of FrontX's createSlice wrapper.
 *
 * @template TState - The slice state type
 * @template TReducers - The reducer functions type
 * @template TName - The slice name type
 */
export type FrontXSliceResult<
  TState,
  TReducers extends SliceCaseReducers<TState>,
  TName extends string = string
> = {
  /** Slice object for registration (name + reducer only) */
  slice: SliceObject<TState>;
} & CaseReducerActions<TReducers, TName>;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a FrontX slice.
 *
 * Returns `{ slice, ...reducerFunctions }`:
 * - `slice` object for registration (only name + reducer)
 * - Individual reducer functions at the top level
 *
 * @param options - Slice configuration (name, initialState, reducers)
 * @returns Object with `slice` and individual reducer functions
 *
 * @example
 * ```typescript
 * const { slice, setSelected, setLoading } = createSlice({
 *   name: 'chat/threads',
 *   initialState: { selected: null, loading: false },
 *   reducers: {
 *     setSelected: (state, payload: ReducerPayload<string>) => {
 *       state.selected = payload.payload;
 *     },
 *     setLoading: (state, payload: ReducerPayload<boolean>) => {
 *       state.loading = payload.payload;
 *     },
 *   },
 * });
 *
 * // Register slice
 * registerSlice(slice, initEffects);
 *
 * // Effects dispatch to reducers
 * dispatch(setSelected(threadId));
 * ```
 */
// @cpt-algo:cpt-frontx-algo-state-management-create-slice:p1
// @cpt-dod:cpt-frontx-dod-state-management-create-slice:p1
export function createSlice<
  TState,
  TReducers extends SliceCaseReducers<TState>,
  TName extends string = string
>(
  options: CreateSliceOptions<TState, TReducers, TName>
): FrontXSliceResult<TState, TReducers, TName> {
  // Create RTK slice internally
  const rtkSlice = rtkCreateSlice(options);

  // Build result: slice object + spread reducer functions
  const result = {
    slice: {
      name: rtkSlice.name,
      reducer: rtkSlice.reducer,
    } as SliceObject<TState>,
  } as FrontXSliceResult<TState, TReducers, TName>;

  // Spread reducer functions at top level
  const reducerFns = rtkSlice.actions as Record<string, unknown>;
  for (const key of Object.keys(reducerFns)) {
    (result as Record<string, unknown>)[key] = reducerFns[key];
  }

  return result;
}
