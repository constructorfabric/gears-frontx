import { createSlice, type ReducerPayload } from '@gears-frontx/state';
import type { HeaderState, HeaderUser } from '../layoutTypes';

/**
 * Header slice for managing header state including user info
 */

const SLICE_KEY = 'layout/header' as const;

const initialState: HeaderState = {
  user: null,
  loading: false,
};

const { slice, setUser, setLoading, clearUser } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setUser: (state: HeaderState, action: ReducerPayload<HeaderUser | null>) => {
      state.user = action.payload;
      state.loading = false;
    },
    setLoading: (state: HeaderState, action: ReducerPayload<boolean>) => {
      state.loading = action.payload;
    },
    clearUser: (state: HeaderState) => {
      state.user = null;
      state.loading = false;
    },
  },
});

export const headerSlice = slice;
export const headerActions = { setUser, setLoading, clearUser };

export { setUser, setLoading, clearUser };

export default slice.reducer;
