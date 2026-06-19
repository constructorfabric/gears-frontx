import { createSlice, type ReducerPayload } from '@gears-frontx/state';

/**
 * Mock slice for managing mock mode state
 *
 * Controls whether mock plugins are active across all API services.
 * Event-driven: Listen for 'mock/toggle' to change mock mode.
 */

const SLICE_KEY = 'mock' as const;

export interface MockState {
  enabled: boolean;
}

const initialState: MockState = {
  enabled: false,
};

const { slice, setMockEnabled } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setMockEnabled: (state: MockState, action: ReducerPayload<boolean>) => {
      state.enabled = action.payload;
    },
  },
});

export const mockSlice = slice;
export const mockActions = { setMockEnabled };

export { setMockEnabled };

export default slice.reducer;
