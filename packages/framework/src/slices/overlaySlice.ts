import { createSlice, type ReducerPayload } from '@gears-frontx/state';
import type { OverlayState } from '../layoutTypes';

/**
 * Overlay slice for managing overlay state
 */

const SLICE_KEY = 'layout/overlay' as const;

const initialState: OverlayState = {
  visible: false,
};

const { slice, showOverlay, hideOverlay, setOverlayVisible } = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    showOverlay: (state: OverlayState) => {
      state.visible = true;
    },
    hideOverlay: (state: OverlayState) => {
      state.visible = false;
    },
    setOverlayVisible: (state: OverlayState, action: ReducerPayload<boolean>) => {
      state.visible = action.payload;
    },
  },
});

export const overlaySlice = slice;
export { showOverlay, hideOverlay, setOverlayVisible };
export const overlayActions = { showOverlay, hideOverlay, setOverlayVisible };

export default slice.reducer;
