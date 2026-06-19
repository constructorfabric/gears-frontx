/**
 * Profile Domain - Redux Slice
 *
 * Manages the profile domain state: user, loading, and error.
 * Follows the HAI3 flux architecture: reducers own state, effects dispatch here.
 */

import { createSlice, type ReducerPayload } from '@gears-frontx/react';
import type { ApiUser } from '../api/types';

/**
 * Profile slice state shape
 */
export interface ProfileState {
  user: ApiUser | null;
  loading: boolean;
  error: string | null;
}

const initialState: ProfileState = {
  user: null,
  loading: true,
  error: null,
};

/**
 * Profile slice
 * Name: 'demo/profile' — namespaced to avoid collisions with host slices
 */
const { slice, setUser, setLoading, setError } = createSlice({
  name: 'demo/profile',
  initialState,
  reducers: {
    setUser: (state: ProfileState, action: ReducerPayload<ApiUser | null>) => {
      state.user = action.payload;
    },
    setLoading: (state: ProfileState, action: ReducerPayload<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state: ProfileState, action: ReducerPayload<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const profileSlice = slice;
export { setUser, setLoading, setError };

/**
 * RootState module augmentation
 * Registers the 'demo/profile' slice into the global RootState type.
 * This allows useAppSelector(state => state['demo/profile']) to be type-safe.
 */
declare module '@gears-frontx/react' {
  interface RootState {
    'demo/profile': ProfileState;
  }
}
